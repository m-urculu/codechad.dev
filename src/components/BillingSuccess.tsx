"use client";

// Polls /api/billing/status until the webhook has landed.
//
// Checkout completing and our database knowing about it are two different events, in that
// order, separated by however long Stripe takes to deliver the webhook. Showing "you're
// subscribed!" immediately would usually be true and occasionally be a lie; showing a
// spinner forever would be worse. So it polls briefly, then tells the truth about the
// wait — the payment IS taken either way, which is the thing the customer needs to hear.

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

const POLL_MS = 1500;
const GIVE_UP_AFTER = 12; // ~18 seconds

export default function BillingSuccess() {
  const [state, setState] = useState<"waiting" | "active" | "slow">("waiting");

  useEffect(() => {
    let tries = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (stopped) return;
      try {
        const res = await apiFetch("/api/billing/status");
        const json = await res.json().catch(() => ({}));
        if (json.pro) {
          setState("active");
          return; // stop polling
        }
      } catch {
        /* keep trying — a transient failure is not an answer */
      }
      if (++tries >= GIVE_UP_AFTER) {
        setState("slow");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="border border-line-strong bg-surface-1 p-6">
      {state === "active" ? (
        <>
          <h1 className="text-lg font-bold text-ink">You&rsquo;re subscribed.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Your course limit is gone — keep as many as you like. Stripe has emailed you a
            receipt.
          </p>
        </>
      ) : state === "slow" ? (
        <>
          <h1 className="text-lg font-bold text-ink">Payment received.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Your payment went through, but our side is taking a moment to catch up. It
            usually resolves within a minute — reload your account settings and it should be
            there. If it still isn&rsquo;t after an hour, email us and we&rsquo;ll sort it
            out; nothing is lost.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold text-ink">Confirming your subscription…</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Stripe has your payment. Waiting for the confirmation to reach us.
          </p>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="bg-ink px-4 py-2 text-xs font-semibold text-surface-0 transition-colors duration-150 hover:bg-ink-muted"
        >
          Back to my courses
        </Link>
        <Link
          href="/terms"
          className="border border-line-strong px-4 py-2 text-xs font-semibold text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        >
          Terms
        </Link>
      </div>

      <p className="mt-6 text-meta leading-relaxed text-ink-dim">
        You have 14 days to withdraw from this contract. The button for it is in Account
        settings → Subscription, and it stays there for the whole period.
      </p>
    </div>
  );
}
