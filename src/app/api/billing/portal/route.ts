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
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${SITE_URL}/?billing=returned`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] failed:", err);
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 502 });
  }
}
