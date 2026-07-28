// POST /api/billing/portal -> { url }
//
// Stripe's hosted Billing Portal: update the card, see invoices, cancel. Cancelling
// through it takes effect at the end of the paid period, which is the correct behaviour
// for an ordinary cancellation — the customer paid for the month and keeps it.
//
// Distinct from withdrawal (api/billing/withdraw), which unwinds the contract inside 14
// days and refunds proportionately. Both exist because they are different rights, and
// offering only cancellation would fail Art. 11a.
//
// Using Stripe's portal rather than building cancellation here is also the honest answer
// to §9.6: cancelling must not be harder than subscribing, and the portal has no
// retention maze, no "are you sure you want to lose everything", no confirmshaming. The
// Digital Fairness Act is aimed squarely at flows that do.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe, billingEnabled } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

// The portal configuration is declared here rather than left to Stripe's implicit default.
//
// Stripe's default happens to be fine today — cancellation enabled, at period end. But
// §9.6 makes a promise about this flow ("cancelling must not be harder than subscribing,
// no retention maze, no confirmshaming"), and a promise that rests on a third party's
// default is not a promise the repository can keep. Anyone with dashboard access could add
// a retention offer or a mandatory survey next month and nothing here would notice.
//
// Declaring it makes the claim auditable: what the customer sees is in version control.
//
// Two deliberate choices:
//   * `cancellation_reason` is OFF. Subscribing asks no questions; cancelling should ask
//     none either. A "why are you leaving?" screen is one more step in exactly the place
//     the Digital Fairness Act is looking.
//   * `subscription_update` is OFF. There is one plan, so a change-plan screen would offer
//     nothing and only add a dead end.
const CONFIG_TAG = "codechad-portal-v1";
let configId: string | null = null;

async function ensureConfiguration(): Promise<string | undefined> {
  if (configId) return configId;
  try {
    const existing = await stripe!.billingPortal.configurations.list({ limit: 100 });
    const found = existing.data.find((c) => c.metadata?.tag === CONFIG_TAG);
    if (found) {
      configId = found.id;
      return configId;
    }
    const created = await stripe!.billingPortal.configurations.create({
      business_profile: {
        privacy_policy_url: `${SITE_URL}/privacy`,
        terms_of_service_url: `${SITE_URL}/terms`,
      },
      features: {
        subscription_cancel: {
          enabled: true,
          // They paid for the period; taking it away early is not ours to do. Withdrawal
          // (inside 14 days) is the route that ends it immediately, with a refund.
          mode: "at_period_end",
          proration_behavior: "none",
          // Stripe insists on at least two `options` even to turn the survey OFF (an
          // empty array vanishes in form encoding and reads as missing). They are inert
          // while `enabled` is false — that flag is the one that decides what the
          // customer sees, and it is off.
          cancellation_reason: { enabled: false, options: ["too_expensive", "other"] },
        },
        subscription_update: { enabled: false },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: {
          enabled: true,
          // Address stays editable because it is the VAT evidence — a customer who moves
          // country must be able to correct it.
          allowed_updates: ["email", "address", "name", "tax_id"],
        },
      },
      metadata: { tag: CONFIG_TAG },
    });
    configId = created.id;
    return configId;
  } catch (err) {
    // Fall back to the account default rather than blocking cancellation. A portal that
    // opens with Stripe's defaults is far better than one that will not open at all —
    // being unable to cancel is the actual compliance failure.
    console.error("[billing/portal] could not ensure configuration, using default:", err);
    return undefined;
  }
}

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  if (!billingEnabled() || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { data: customer } = await supabaseAdmin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", who.userId)
    .maybeSingle();

  if (!customer?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 404 });
  }

  try {
    const configuration = await ensureConfiguration();
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${SITE_URL}/?billing=returned`,
      ...(configuration ? { configuration } : {}),
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] failed:", err);
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 502 });
  }
}
