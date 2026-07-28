"use client";

// The subscription block in Account settings: status, manage, and — while the law
// requires it — the withdrawal function.
//
// Two controls that look similar and are not:
//
//   MANAGE (Stripe portal)  ordinary cancellation. Takes effect at period end; the
//                           customer keeps what they paid for. Available always.
//   WITHDRAW                the statutory 14-day right. Unwinds the contract NOW and
//                           refunds the unused part. Available only inside the window.
//
// Consumer Rights Directive Art. 11a, in force since 19 June 2026, requires the second
// one to exist as a CONTROL — clearly labelled, available throughout the window, leading
// to a structured two-step confirmation. "Email us" does not comply, and neither does
// hiding it behind the cancellation flow.
//
// Note what is absent: no "are you sure you want to lose your progress", no discount
// offer, no survey gate. Cancelling must not be harder than subscribing (§9.6), and the
// Digital Fairness Act is aimed precisely at flows that make it so.

import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiExternalLink } from "react-icons/fi";
import { apiFetch } from "@/lib/apiFetch";

type Status = {
  pro: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  withdrawalOpen: boolean;
  withdrawalDeadline: string | null;
  withdrawnAt: string | null;
  courseLimit: number | null;
  courses: number;
  billingEnabled: boolean;
  liveMode: boolean;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function BillingSection() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | "portal" | "withdraw">(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false); // step one of the two-step confirmation
  const [done, setDone] = useState<{ reference: string; refunded: number; currency: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/status");
      if (res.ok) setS(await res.json());
    } catch {
      /* the section simply doesn't render; the rest of the page is unaffected */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await apiFetch("/api/billing/portal", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        setError(json.error || "Could not open the billing portal.");
        setBusy(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Could not reach the server.");
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("withdraw");
    setError(null);
    try {
      const res = await apiFetch("/api/billing/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }), // step two
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not complete the withdrawal.");
        return;
      }
      setDone({ reference: json.reference, refunded: json.refunded, currency: json.currency });
      setArmed(false);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (!s || !s.billingEnabled) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">
        Subscription
        {!s.liveMode && (
          // A tester who cannot tell whether a charge was real is one confused support
          // email away from a bad afternoon.
          <span className="border border-line-strong px-1.5 py-0.5 text-meta font-medium normal-case tracking-normal text-ink-dim">
            test mode
          </span>
        )}
      </h2>

      {done ? (
        <div className="border border-line-strong bg-surface-1 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <FiCheck size={14} /> Withdrawal confirmed
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-dim">
            Your contract has been withdrawn and your subscription has ended immediately.
            {done.refunded > 0 ? (
              <>
                {" "}
                A refund of{" "}
                <strong className="font-semibold text-ink">
                  {done.refunded.toFixed(2)} {done.currency}
                </strong>{" "}
                for the unused part of the period is on its way back to your card — Stripe
                will email you about it, and it typically takes 5–10 days to appear.
              </>
            ) : (
              " There was nothing left to refund for this period."
            )}
          </p>
          <p className="mt-2 text-meta text-ink-dim">
            Your reference is{" "}
            <strong className="font-mono font-semibold text-ink">{done.reference}</strong>. Keep
            it if you need to ask us about this.
          </p>
        </div>
      ) : s.pro ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-surface-1 p-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">
                Unlimited{s.status === "past_due" ? " — payment problem" : ""}
              </div>
              <p className="mt-1 text-xs leading-snug text-ink-dim">
                {s.status === "past_due"
                  ? "Your last payment didn't go through. Update your card and we'll retry — nothing is locked in the meantime."
                  : s.cancelAtPeriodEnd
                    ? `Cancelled. You keep unlimited courses until ${formatDate(s.currentPeriodEnd)}.`
                    : `Renews ${formatDate(s.currentPeriodEnd)}. You have ${s.courses} course${s.courses === 1 ? "" : "s"}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={openPortal}
              disabled={busy !== null}
              className="flex shrink-0 items-center gap-1.5 border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-surface-2 disabled:opacity-40"
            >
              {busy === "portal" ? "Opening…" : "Manage or cancel"}
              <FiExternalLink size={12} />
            </button>
          </div>

          {/* --- Art. 11a withdrawal function ------------------------------------ */}
          {s.withdrawalOpen && (
            <div className="mt-3 border border-line-strong p-4">
              <div className="text-sm font-semibold text-ink">Withdraw from the contract</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-dim">
                You have a legal right to withdraw from this contract until{" "}
                <strong className="font-semibold text-ink">
                  {formatDate(s.withdrawalDeadline)}
                </strong>
                , without giving a reason. This is different from cancelling: it ends the
                subscription immediately and refunds the part of the period you have not
                used.
              </p>

              {armed ? (
                <div className="mt-3 border border-line-active bg-surface-1 p-3">
                  <p className="text-xs leading-relaxed text-ink">
                    Confirm you want to withdraw. Your subscription ends now, the unused part
                    of this period is refunded to your card, and your account returns to the
                    free tier — your courses and progress are <strong>not</strong> deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={withdraw}
                      disabled={busy !== null}
                      className="bg-danger px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-danger/80 disabled:opacity-40"
                    >
                      {busy === "withdraw" ? "Withdrawing…" : "Confirm withdrawal"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setArmed(false)}
                      disabled={busy !== null}
                      className="border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                    >
                      Keep my subscription
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setArmed(true)}
                  className="mt-3 border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:border-danger hover:text-danger"
                >
                  Withdraw from the contract here
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-surface-1 p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">Free</div>
            <p className="mt-1 text-xs leading-snug text-ink-dim">
              {s.courses} of {s.courseLimit} courses used.
              {s.withdrawnAt ? " You withdrew from your previous subscription." : ""} Everything
              that teaches you is free; the subscription only removes the course limit.
            </p>
          </div>
          <a
            href="/pricing"
            className="shrink-0 bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 transition-colors duration-150 hover:bg-ink-muted"
          >
            Go unlimited
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-meta text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
