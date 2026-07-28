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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],

      // --- VAT (§9.4) ----------------------------------------------------------
      // Stripe Tax computes the customer's national rate. A digital service is taxed
      // where the CUSTOMER is, so this is not optional decoration — without it, a sale
      // to Germany is charged Portuguese VAT and the return is wrong.
      automatic_tax: { enabled: true },
      // The billing address is the primary piece of location evidence the VAT rules
      // require, and Stripe needs it to compute the rate at all.
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      // B2B inside the EU reverse-charges on a validated VAT number. Stripe validates
      // against VIES; without this every business customer is charged consumer VAT.
      tax_id_collection: { enabled: true },

      // --- Consumer terms ------------------------------------------------------
      consent_collection: { terms_of_service: "required" },

      success_url: `${SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/pricing?checkout=cancelled`,

      // client_reference_id survives into every webhook event for this session, which is
      // how the webhook attributes a payment to an account without trusting anything the
      // browser said.
      client_reference_id: who.userId,
      subscription_data: {
        metadata: {
          user_id: who.userId,
          // Recorded at Stripe as well as in our table: if the two ever disagree, the
          // question "did this person consent?" has a second, independent answer.
          immediate_start_requested: String(immediateStart),
          withdrawal_right_acknowledged: String(acknowledgeWithdrawal),
        },
      },
      metadata: { user_id: who.userId },
    });

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
