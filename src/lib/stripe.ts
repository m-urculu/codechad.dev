// The Stripe client, and the plan's shape in one place.
//
// `server-only`, and for a harder reason than usual: the secret key is a bearer token
// for money. Importing this into a component would put it in the browser bundle, the
// same class of mistake as NEXT_PUBLIC_ing the Supabase service role — except the blast
// radius is charges and refunds rather than rows.
//
// The publishable key is not here because nothing needs it: Checkout is a full redirect
// to Stripe's own domain (docs/gdpr-and-compliance.md §9.1), so no Stripe JS ever loads
// on our pages. That is what keeps this app's ~20 CDN references out of PCI scope.
import "server-only";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Deliberately not throwing at module load. A missing key must not take down the whole
// app — the billing routes report it and everything else keeps working, which matters
// because the free tier is the product for everyone who has not paid.
export const stripe = key
  ? new Stripe(key, {
      // Pinned. An account-level API version change is a thing Stripe can do TO you;
      // pinning means the shape of a webhook payload changes when this line changes and
      // not before.
      apiVersion: "2026-06-24.dahlia",
      appInfo: { name: "CodeChad", url: "https://www.codechad.dev" },
    })
  : null;

/** True when billing is configured at all. Every billing route checks this first. */
export function billingEnabled(): boolean {
  return !!stripe && !!process.env.STRIPE_PRICE_ID;
}

/** Live keys and test keys are visibly different; surfaced so the UI can warn. */
export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

export const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";

// How many courses a free account may hold. The paid tier removes the ceiling; that is
// the whole product difference, and it lives here so the route, the UI copy and the
// pricing page cannot drift apart.
export const FREE_COURSE_LIMIT = 3;

// The consumer withdrawal window, in days. Fixed by the Consumer Rights Directive at 14
// and not a business decision — named rather than inlined so it reads as law in the
// places it is enforced.
export const WITHDRAWAL_WINDOW_DAYS = 14;
