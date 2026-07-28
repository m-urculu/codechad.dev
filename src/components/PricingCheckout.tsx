"use client";

// The subscribe control, and the two consent affirmations the law attaches to it.
//
// The checkboxes are NOT a formality and they are not pre-ticked. Consumer Rights
// Directive Art. 16(m): a consumer only loses the withdrawal right if they expressly
// requested immediate performance AND acknowledged losing it. Two statements, so two
// boxes, both starting empty and both required — a pre-ticked box records no consent at
// all, and one combined box records a consent that was never separately given.
//
// Note what this deliberately does NOT do: it does not claim the withdrawal right is
// gone. For an ongoing subscription the right only lapses once the service is fully
// performed, which a monthly plan is not within its own first fortnight. The wording
// below says exactly that, because promising otherwise would be a misrepresentation the
// user relies on when deciding to buy.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { supabase } from "@/lib/supabaseBrowser";

export default function PricingCheckout({ priceLabel }: { priceLabel: string }) {
  const router = useRouter();
  const [immediateStart, setImmediateStart] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = immediateStart && acknowledge;

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setError("Please sign in first — a subscription needs an account to attach to.");
        setBusy(false);
        return;
      }

      const res = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediateStart, acknowledgeWithdrawal: acknowledge }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json.code === "already_subscribed") {
        router.push("/?billing=already");
        return;
      }
      if (!res.ok || !json.url) {
        setError(json.error || "Could not start checkout. Please try again.");
        setBusy(false);
        return;
      }
      // Leaves this origin entirely. The card is entered on Stripe's domain, never here.
      window.location.href = json.url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  }

  const boxClass =
    "mt-0.5 h-4 w-4 shrink-0 accent-ink cursor-pointer disabled:cursor-not-allowed";

  return (
    <div className="mt-8 border border-line-strong bg-surface-1 p-5">
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink-muted">
          <input
            type="checkbox"
            checked={immediateStart}
            onChange={(e) => setImmediateStart(e.target.checked)}
            disabled={busy}
            className={boxClass}
          />
          <span>
            I ask for the subscription to <strong className="font-semibold text-ink">start
            immediately</strong>, rather than after the 14-day withdrawal period.
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink-muted">
          <input
            type="checkbox"
            checked={acknowledge}
            onChange={(e) => setAcknowledge(e.target.checked)}
            disabled={busy}
            className={boxClass}
          />
          <span>
            I understand that because it starts immediately, if I withdraw within 14 days I
            will be refunded{" "}
            <strong className="font-semibold text-ink">
              only for the part of the month I have not used
            </strong>
            .
          </span>
        </label>

        <button
          type="button"
          onClick={subscribe}
          disabled={!ready || busy}
          className="mt-1 h-11 w-full bg-ink text-sm font-semibold text-surface-0
                     transition-colors duration-150 hover:bg-ink-muted disabled:opacity-40"
        >
          {busy ? "Opening checkout…" : `Subscribe — ${priceLabel}`}
        </button>

        {error && (
          <p role="alert" className="text-meta text-danger">
            {error}
          </p>
        )}

        <p className="text-meta leading-relaxed text-ink-dim">
          Payment is handled entirely by Stripe on their own site — your card details never
          reach CodeChad. You keep the right to withdraw within 14 days, and there is a
          button for it in your account settings. Cancel any time, from the same place.
        </p>
      </div>
    </div>
  );
}
