// /pricing — the only page in the app from which money can be started.
//
// SCRIPT INVENTORY (PCI DSS 4.0.1 req. 6.4.3 — keep this list current, it is the
// artefact the requirement asks for):
//
//   * Next.js framework bundle, first-party, served from this origin
//   * PricingCheckout.tsx, first-party
//   * supabaseBrowser / apiFetch, first-party
//   * NOTHING ELSE. No CDN, no analytics, no tag manager, no Stripe.js.
//
// That last line is the point. The workspace pulls ~20 things from jsDelivr plus unpkg
// plus Hugging Face at run time; none of it is reachable from here, because this route
// renders neither the workspace nor the landing grid. Checkout is a full redirect to
// Stripe's domain, so no payment form is ever served by us and SAQ A eligibility stays
// honestly assertable. See docs/gdpr-and-compliance.md §9.1.
//
// Anything added to this page must be checked against that list first.

import type { Metadata } from "next";
import Link from "next/link";
import PricingCheckout from "@/components/PricingCheckout";
import { stripe, billingEnabled, PRICE_ID, FREE_COURSE_LIMIT } from "@/lib/stripe";
import { SITE_NAME } from "@/lib/site";

// Rendered on a 10-minute revalidation rather than statically.
//
// This page was prerendered at build time until it was caught: the price is fetched from
// Stripe, so a static render bakes in whatever it cost on the day of the last deploy, and
// a build that ran without STRIPE_ env vars would show "unavailable" forever regardless of
// what production actually has. Both are the kind of wrong that nobody notices for weeks
// and that a customer notices immediately.
//
// ISR rather than force-dynamic: a Stripe API call on every pricing page view is waste,
// and ten minutes is a fine staleness budget for a price that changes about never. It also
// self-heals a build that lacked the keys.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Pricing — CodeChad",
  description:
    "CodeChad is free to use. An optional subscription removes the limit on how many courses you can keep.",
  alternates: { canonical: "/pricing" },
};

// The price comes from Stripe, not from a constant here. A number typed into a page is a
// number that will one day disagree with what the customer is actually charged, and the
// gap between the two is a consumer-law problem, not a typo.
async function priceLabel(): Promise<string> {
  if (!billingEnabled() || !stripe) return "unavailable";
  try {
    const price = await stripe.prices.retrieve(PRICE_ID);
    if (price.unit_amount == null) return "unavailable";
    const amount = (price.unit_amount / 100).toLocaleString("en-IE", {
      style: "currency",
      currency: price.currency.toUpperCase(),
    });
    const period = price.recurring?.interval ?? "month";
    return `${amount}/${period}`;
  } catch {
    return "unavailable";
  }
}

export default async function Pricing() {
  const label = await priceLabel();
  const available = billingEnabled() && label !== "unavailable";

  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      <header className="border-b border-line-strong">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2.5 px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-ink transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, first-party */}
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span>{SITE_NAME}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-ink">Pricing</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
          Everything that teaches you is free, and stays free: every technology, every
          career path, the AI tutor, the editor, the grading. The subscription changes one
          thing only — how many courses you can keep at once.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <section className="border border-line-strong p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Free</h2>
            <p className="mt-2 text-xl font-bold text-ink">€0</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-sm text-ink-muted marker:text-ink-faint">
              <li>Every technology and every career path</li>
              <li>The AI tutor and live code execution</li>
              <li>
                Up to <strong className="font-semibold text-ink">{FREE_COURSE_LIMIT} courses</strong>{" "}
                kept at a time
              </li>
            </ul>
          </section>

          <section className="border border-line-active bg-surface-1 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">Unlimited</h2>
            <p className="mt-2 text-xl font-bold text-ink">{available ? label : "—"}</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-sm text-ink-muted marker:text-ink-faint">
              <li>Everything in Free</li>
              <li>
                <strong className="font-semibold text-ink">Unlimited courses</strong> — keep as
                many as you like
              </li>
              <li>Cancel any time; 14-day right to withdraw</li>
            </ul>
          </section>
        </div>

        {available ? (
          <PricingCheckout priceLabel={label} />
        ) : (
          <p className="mt-8 border border-line-strong bg-surface-1 p-5 text-sm text-ink-muted">
            Subscriptions are not available right now. Everything in the free tier keeps
            working — nothing you already have is affected.
          </p>
        )}

        <p className="mt-8 text-meta leading-relaxed text-ink-dim">
          Prices include VAT at your country&rsquo;s rate, which is calculated at checkout. If
          you are a business in the EU, enter your VAT number at checkout and the reverse
          charge applies. See the <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
