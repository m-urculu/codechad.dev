// POST /api/billing/checkout { immediateStart, acknowledgeWithdrawal } -> { url }
//
// Creates a Stripe Checkout Session and hands back the URL to redirect to. The browser
// then LEAVES this site entirely.
//
// That full redirect is the most important line in the payment work, and the reason is
// not the usual one. Stripe Elements would be nicer UX, but PCI DSS 4.0.1 req. 6.4.3 and
// 11.6.1 make every script on the payment page subject to inventory, authorisation and
// tamper monitoring — and this app's pages pull ~20 things from jsDelivr, plus unpkg,
// plus Hugging Face, plus WASM toolchains, at run time. Embedding Elements would drag
// that entire deliberately-dynamic surface into PCI scope and make the SAQ A eligibility
// statement impossible to sign honestly. Redirecting means the card is never entered on
// a page we serve, so none of it applies. See docs/gdpr-and-compliance.md §9.1.
//
// Card data therefore never touches this server. It cannot leak from here because it
// never arrives.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEntitlement, getOrCreateCustomer } from "@/lib/billing";
import { stripe, billingEnabled, PRICE_ID } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

// Does this Stripe account run "Managed Payments"?
//
// Discovered rather than configured, because it cannot be known from here. Managed
// Payments is newer, is ON BY DEFAULT on accounts created recently, and makes Stripe
// responsible for calculating AND remitting tax — which means it rejects `automatic_tax`
// and `tax_id_collection` outright rather than ignoring them.
//
// So the first checkout on a fresh deployment probes: send the Stripe-Tax parameters,
// and if Stripe says they are unsupported, remember that and retry without them. One
// wasted call per process, then never again. The alternative — an env var — would be one
// more thing to get wrong at 3am on a deployment that then takes no money at all.
//
// Either way the tax is correct. With Stripe Tax we calculate and the operator files;
// with Managed Payments Stripe does both. What must NOT happen is charging Portuguese
// VAT to a German consumer, and neither path does that.
let managedPayments: boolean | null = null;

// Whether this Stripe account has a Terms-of-service URL set under Public details.
// Without one, Checkout refuses `consent_collection` outright — and it is a
// dashboard-only setting that the API cannot write on your own account, so it cannot be
// provisioned from here.
//
// Dropping it is a real if minor downgrade: the Terms are still linked on /pricing and
// still bind, but the explicit tick at checkout is better evidence of agreement. So the
// sale proceeds — refusing money over a missing dashboard field would be worse — and the
// warning is written to be found.
let tosConsentUnavailable = false;

function isUnsupportedTaxParam(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Unsupported parameter: (automatic_tax|tax_id_collection)/.test(message);
}

function isMissingTosUrl(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cannot collect consent to your terms of service/i.test(message);
}

async function createSession(
  customerId: string,
  userId: string,
  immediateStart: boolean,
  acknowledgeWithdrawal: boolean
) {
  const base = {
    mode: "subscription" as const,
    customer: customerId,
    line_items: [{ price: PRICE_ID, quantity: 1 }],

    // The billing address is the primary piece of location evidence the VAT rules
    // require — two non-contradictory pieces, and this is the first. Required under
    // both tax regimes.
    billing_address_collection: "required" as const,
    customer_update: { address: "auto" as const, name: "auto" as const },

    success_url: `${SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pricing?checkout=cancelled`,

    // client_reference_id survives into every webhook event for this session, which is
    // how the webhook attributes a payment to an account without trusting anything the
    // browser said.
    client_reference_id: userId,
    subscription_data: {
      metadata: {
        user_id: userId,
        // Recorded at Stripe as well as in our table: if the two ever disagree, the
        // question "did this person consent?" has a second, independent answer.
        immediate_start_requested: String(immediateStart),
        withdrawal_right_acknowledged: String(acknowledgeWithdrawal),
      },
    },
    metadata: { user_id: userId },
  };

  // --- VAT (§9.4) ------------------------------------------------------------
  // Stripe Tax computes the customer's national rate. A digital service is taxed where
  // the CUSTOMER is, so this is not optional decoration — without it, a sale to Germany
  // is charged Portuguese VAT and the return is wrong.
  //
  // tax_id_collection makes an EU business VAT number reverse-charge, validated against
  // VIES; without it every business customer is charged consumer VAT.
  // Two independent capabilities, each discovered on first use and remembered. Built as
  // a parameter set rather than branches so the retry logic below stays one loop.
  const params = () => ({
    ...base,
    ...(managedPayments
      ? {}
      : { automatic_tax: { enabled: true }, tax_id_collection: { enabled: true } }),
    ...(tosConsentUnavailable
      ? {}
      : { consent_collection: { terms_of_service: "required" as const } }),
  });

  // At most two adaptations, so at most three attempts. Each retry only happens after
  // Stripe has told us specifically which parameter it will not accept.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await stripe!.checkout.sessions.create(params());
    } catch (err) {
      if (isUnsupportedTaxParam(err) && !managedPayments) {
        managedPayments = true;
        console.info(
          "[billing/checkout] Managed Payments is enabled on this account — Stripe calculates and remits tax. Retrying without Stripe Tax parameters."
        );
        continue;
      }
      if (isMissingTosUrl(err) && !tosConsentUnavailable) {
        tosConsentUnavailable = true;
        console.warn(
          "[billing/checkout] No Terms of service URL is set on the Stripe account, so checkout cannot collect terms consent. " +
            "Set it at https://dashboard.stripe.com/settings/public — until then customers are not asked to tick agreement at checkout."
        );
        continue;
      }
      throw err;
    }
  }
  // Unreachable in practice: every retry path sets a flag, so the third attempt either
  // succeeds or throws something we do not adapt to.
  throw new Error("Could not create a checkout session after adapting to account settings");
}

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  if (!billingEnabled() || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  let body: { immediateStart?: unknown; acknowledgeWithdrawal?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Consumer Rights Directive Art. 16(m). Two SEPARATE affirmations, checked separately,
  // because they are two different statements: "start now" and "I understand what starting
  // now costs me". A single combined tickbox would record a consent that was never given,
  // and a pre-ticked one would record none at all.
  //
  // They are required to proceed. The lawful alternative — sell now, perform in 14 days —
  // is not a product anyone wants. Note that requiring them does NOT extinguish the
  // withdrawal right here: the right is only lost once the service is FULLY performed, and
  // a monthly subscription never is within its own first fortnight. So the withdrawal
  // function is offered regardless; see api/billing/withdraw.
  const immediateStart = body.immediateStart === true;
  const acknowledgeWithdrawal = body.acknowledgeWithdrawal === true;
  if (!immediateStart || !acknowledgeWithdrawal) {
    return NextResponse.json(
      { error: "Both confirmations are required before checkout." },
      { status: 400 }
    );
  }

  // Already paying? Sending them to checkout again would create a second subscription and
  // charge them twice. This is the check that prevents the single worst billing bug.
  const ent = await getEntitlement(who.userId);
  if (ent.pro) {
    return NextResponse.json(
      { error: "You already have an active subscription.", code: "already_subscribed" },
      { status: 409 }
    );
  }

  const { data: account } = await supabaseAdmin.auth.admin.getUserById(who.userId);
  const email = account?.user?.email ?? null;

  try {
    const customerId = await getOrCreateCustomer(who.userId, email);
    if (!customerId) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
    }

    const session = await createSession(customerId, who.userId, immediateStart, acknowledgeWithdrawal);

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Never surface a Stripe error verbatim: they are written for developers and can
    // name internal objects.
    console.error("[billing/checkout] failed:", err);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  }
}
