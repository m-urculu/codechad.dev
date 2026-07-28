// POST /api/billing/withdraw { confirm: true } -> { ok, reference, refunded }
//
// The Consumer Rights Directive Art. 11a withdrawal function, in force since
// 19 June 2026. This is not "cancel my subscription" — that is the portal route, and it
// stops future renewals. This is the statutory right to unwind the contract itself
// within 14 days, and the law is specific about the mechanics:
//
//   * a control CLEARLY LABELLED "withdraw from the contract here" or equivalent;
//   * AVAILABLE THROUGHOUT the 14-day window (computed live in lib/billing.ts, never
//     cached into a flag that could go stale);
//   * a STRUCTURED TWO-STEP CONFIRMATION — the button arms, this route is step two and
//     refuses without an explicit `confirm`;
//   * an AUTOMATIC CONFIRMATION to the consumer on a durable medium, without undue delay.
//
// "Email us to cancel" does not comply. Neither does a PDF form.
//
// On the refund: the consumer told us at checkout to start immediately and acknowledged
// what that costs them, so they pay a PROPORTIONATE amount for what they actually used —
// not nothing, and not everything. The right is not extinguished by that acknowledgement,
// because it only lapses once the service is FULLY performed, and a monthly subscription
// never is inside its own first fortnight.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEntitlement } from "@/lib/billing";
import { stripe, billingEnabled } from "@/lib/stripe";

/** A short, human-quotable handle for the withdrawal. Goes to the user and to the logs. */
function makeReference(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `WD-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  if (!billingEnabled() || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // Step two of two. A withdrawal must never be one accidental click.
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirmation is required." }, { status: 400 });
  }

  const ent = await getEntitlement(who.userId);
  if (ent.withdrawnAt) {
    return NextResponse.json({ error: "You have already withdrawn." }, { status: 409 });
  }
  if (!ent.withdrawalOpen) {
    // Either there is no live contract, or the 14 days have run. Say which, because
    // "no" without a reason is what makes people email support.
    return NextResponse.json(
      {
        error: ent.pro
          ? "The 14-day withdrawal period for this contract has ended. You can still cancel your subscription at any time."
          : "There is no active subscription to withdraw from.",
        code: "window_closed",
      },
      { status: 409 }
    );
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, started_at")
    .eq("user_id", who.userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) {
    return NextResponse.json({ error: "No subscription found." }, { status: 404 });
  }

  const reference = makeReference();

  try {
    // 1. End the contract NOW. Not at period end — withdrawal unwinds it, and leaving
    //    the service running until the next renewal date would be continuing to perform
    //    a contract the consumer has just exercised a statutory right to exit.
    const cancelled = await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
      // Stripe would otherwise generate a final invoice for metered usage. There is none
      // here, and an unexpected invoice on the way out is the opposite of the point.
      invoice_now: false,
      prorate: false,
    });

    // 2. Work out the proportionate refund from what was actually charged.
    let refundedMinor = 0;
    let currency = "eur";

    const invoices = await stripe.invoices.list({
      customer: sub.stripe_customer_id,
      limit: 1,
      status: "paid",
    });
    const invoice = invoices.data[0];

    if (invoice && invoice.amount_paid > 0) {
      currency = invoice.currency;
      const line = invoice.lines?.data?.[0];
      const periodStart = line?.period?.start;
      const periodEnd = line?.period?.end;

      let unusedFraction = 1;
      if (periodStart && periodEnd && periodEnd > periodStart) {
        const total = periodEnd - periodStart;
        const used = Math.max(0, Math.min(total, Math.floor(Date.now() / 1000) - periodStart));
        unusedFraction = 1 - used / total;
      }

      // Rounded DOWN to the cent in the consumer's favour is wrong here — refunds round
      // in the consumer's favour, so round up. A cent of ours is cheaper than an argument.
      refundedMinor = Math.ceil(invoice.amount_paid * unusedFraction);

      if (refundedMinor > 0) {
        const paymentIntent =
          typeof (invoice as { payment_intent?: string | { id: string } }).payment_intent === "string"
            ? ((invoice as { payment_intent?: string }).payment_intent as string)
            : (invoice as { payment_intent?: { id: string } }).payment_intent?.id;

        if (paymentIntent) {
          // Stripe emails the customer a refund notification automatically — that is the
          // "durable medium" half of the Art. 11a confirmation duty, and it is why this
          // must not be a silent balance credit.
          await stripe.refunds.create({
            payment_intent: paymentIntent,
            amount: refundedMinor,
            reason: "requested_by_customer",
            metadata: { withdrawal_reference: reference, user_id: who.userId },
          });
        } else {
          console.error(`[billing/withdraw] ${reference}: no payment intent on ${invoice.id}`);
          refundedMinor = 0;
        }
      }
    }

    // 3. Record it. This is what closes the right — getEntitlement treats withdrawn_at as
    //    terminal, so no later webhook can hand the entitlement back.
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        withdrawn_at: new Date().toISOString(),
        withdrawal_reference: reference,
        status: cancelled.status,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", sub.stripe_subscription_id);
    if (error) {
      // The money has already moved. Failing the request now would invite a second
      // withdrawal attempt against an already-cancelled subscription, so log loudly and
      // report success — the contract IS withdrawn, whatever our table says.
      console.error(`[billing/withdraw] ${reference}: could not record:`, error.message);
    }

    console.log(
      `[billing/withdraw] ${reference} user=${who.userId} sub=${sub.stripe_subscription_id} refunded=${refundedMinor}${currency}`
    );

    return NextResponse.json({
      ok: true,
      reference,
      refunded: refundedMinor / 100,
      currency: currency.toUpperCase(),
    });
  } catch (err) {
    console.error(`[billing/withdraw] ${reference} failed:`, err);
    return NextResponse.json(
      { error: "Could not complete the withdrawal. Please email us and quote " + reference },
      { status: 502 }
    );
  }
}
