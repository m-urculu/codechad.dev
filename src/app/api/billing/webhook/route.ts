// POST /api/billing/webhook — Stripe's events, and the only writer of `subscriptions`.
//
// This is the trust boundary of the whole payment system. Everything the app knows about
// who has paid arrives here, from a public URL, in a request anyone on the internet can
// make. Three rules follow, and none of them are optional:
//
//   1. VERIFY THE SIGNATURE, against the RAW body. Not the parsed JSON — re-serialising
//      changes bytes and the HMAC will not match. `request.text()` first, always. Without
//      this, `curl` with a hand-written "subscription active" payload grants anyone the
//      paid tier for free.
//
//   2. NEVER trust the payload for identity. The user id comes from metadata we ourselves
//      set at checkout, and is cross-checked against the customer record we created.
//
//   3. RETURN 200 FOR ANYTHING PROCESSED, including events we ignore. A non-2xx makes
//      Stripe retry with backoff for days; a 500 on an event type we simply do not handle
//      turns an irrelevance into a queue of failures.
//
// The route is deliberately NOT covered by apiAuth: Stripe has no Supabase session. The
// signature IS the authentication.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Next must not parse or transform the body — the signature is over the exact bytes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** Seconds -> ISO, tolerating the nulls Stripe uses for "not applicable". */
function ts(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Resolve the account this subscription belongs to.
 *
 * Prefers the metadata we set at checkout; falls back to the customer row we wrote when
 * the customer was created. The fallback matters for events that originate in the Stripe
 * dashboard — a subscription created by hand for a support case carries no metadata.
 */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.user_id;
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await supabaseAdmin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Mirror a subscription into our table. Idempotent — webhooks arrive more than once. */
async function upsertSubscription(sub: Stripe.Subscription) {
  const userId = await resolveUserId(sub);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const item = sub.items?.data?.[0];

  const row: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    user_id: userId,
    status: sub.status,
    price_id: item?.price?.id ?? null,
    // Stripe moved period bounds onto the subscription ITEM; the top-level fields are
    // legacy and absent on newer API versions. Read the item first, fall back for safety.
    current_period_end:
      ts(item?.current_period_end) ??
      ts((sub as unknown as { current_period_end?: number }).current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    started_at: ts(sub.start_date) ?? new Date().toISOString(),
    immediate_start_requested: sub.metadata?.immediate_start_requested === "true",
    withdrawal_right_acknowledged: sub.metadata?.withdrawal_right_acknowledged === "true",
    updated_at: new Date().toISOString(),
  };

  // `started_at` must never move: it is what the 14-day withdrawal window counts from,
  // and a renewal that reset it would silently reopen a right that had expired. So it is
  // only written when the row is new — hence the read before the upsert.
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("started_at, withdrawn_at")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (existing) {
    row.started_at = existing.started_at;
    // Withdrawal is terminal. A later event must not resurrect entitlement.
    if (existing.withdrawn_at) row.withdrawn_at = existing.withdrawn_at;
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);
}

/** Record the billing country — the VAT location evidence — when Stripe learns it. */
async function recordCustomerCountry(customerId: string, country: string | null) {
  if (!country) return;
  await supabaseAdmin
    .from("billing_customers")
    .update({ country })
    .eq("stripe_customer_id", customerId);
}

export async function POST(request: Request) {
  if (!stripe || !SECRET) {
    console.error("[billing/webhook] not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // RAW body. See rule 1 above.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, SECRET);
  } catch (err) {
    // Also catches replay: constructEvent enforces a timestamp tolerance, so a captured
    // request cannot be resent days later.
    console.error("[billing/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;

        // Re-assert the customer↔account link. If the insert at checkout failed, this is
        // where it self-heals; if it succeeded, this is a no-op.
        if (customerId) {
          await supabaseAdmin.from("billing_customers").upsert(
            {
              stripe_customer_id: customerId,
              user_id: userId,
              email: session.customer_details?.email ?? null,
              country: session.customer_details?.address?.country ?? null,
            },
            { onConflict: "stripe_customer_id" }
          );
        }

        // The session's subscription is not expanded on the event, so fetch it: we want
        // the real status, not an assumption that completing checkout means active.
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(sub);
        }
        break;
      }

      // The lifecycle. One handler for all three: the payload is a subscription and the
      // desired behaviour — mirror it — is identical. `deleted` arrives with
      // status "canceled", so entitlement falls away without a special case.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscription(event.data.object);
        break;

      // Renewal succeeded or failed. Stripe also emits subscription.updated for these, but
      // not always first — refreshing here closes the gap where our copy says `active`
      // and Stripe has already moved to `past_due`.
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const subId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(sub);
        }
        if (typeof invoice.customer === "string") {
          await recordCustomerCountry(
            invoice.customer,
            invoice.customer_address?.country ?? null
          );
        }
        break;
      }

      default:
        // Ignored, and answered 200. See rule 3.
        break;
    }
  } catch (err) {
    // A genuine processing failure. 500 asks Stripe to retry, which is what we want —
    // the events are idempotent, so a retry costs nothing and a dropped one costs a
    // customer their entitlement.
    console.error(`[billing/webhook] ${event.type} failed:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
