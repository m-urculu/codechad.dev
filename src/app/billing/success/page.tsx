// /billing/success — where Stripe returns after a completed checkout.
//
// This page does NOT grant anything. Entitlement comes from the webhook, which is the
// only thing that has actually verified a payment with Stripe. A success page that wrote
// `status: active` because the browser arrived at a URL would hand the paid tier to
// anyone who typed that URL.
//
// So it is purely a receipt-and-reassurance page, and it polls the real status until the
// webhook lands — usually a second or two, occasionally longer.

import type { Metadata } from "next";
import Link from "next/link";
import BillingSuccess from "@/components/BillingSuccess";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Subscription confirmed — CodeChad",
  robots: { index: false, follow: false },
};

export default function SuccessPage() {
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
      <main className="mx-auto max-w-xl px-6 py-16">
        <BillingSuccess />
      </main>
    </div>
  );
}
