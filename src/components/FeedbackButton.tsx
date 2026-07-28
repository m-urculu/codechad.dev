"use client";

// The floating feedback button, bottom right.
//
// Two decisions worth stating.
//
// It works SIGNED OUT. The people best placed to say what is wrong are the ones who
// tried the trial and left, and they have no account and no reason to make one. The
// route allows an anonymous sender and the table's user_id is nullable (0007).
//
// It captures WHERE THEY WERE without asking. "This is confusing" means one thing on
// a Docker lesson and another on the landing page, and nobody types that context in.
// The host passes it down; the panel just sends it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, X, Check } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

export type FeedbackContext = {
  module?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  view?: string | null;
};

const KINDS = [
  { id: "bug", label: "Something's broken" },
  { id: "confusing", label: "This is confusing" },
  { id: "idea", label: "I have an idea" },
  { id: "general", label: "Something else" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

export default function FeedbackButton({ context }: { context?: FeedbackContext }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);

  // Portals need a document; rendering one during SSR is a hydration mismatch.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    // Keep the draft: closing by accident mid-sentence should not cost the sentence.
    // Only a successful send clears it, below.
  }

  async function send() {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          message: text,
          email: email.trim() || undefined,
          context: {
            module: context?.module ?? undefined,
            courseId: context?.courseId ?? undefined,
            lessonId: context?.lessonId ?? undefined,
            view: context?.view ?? undefined,
            path: typeof window !== "undefined" ? window.location.pathname : undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send that. Please try again.");
        return;
      }
      setSent(true);
      setMessage("");
      setEmail("");
      // Long enough to read the confirmation, short enough not to sit there.
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2200);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full border border-line-strong bg-surface-1 px-3 py-2 text-sm text-ink " +
    "placeholder:text-ink-faint transition-colors duration-150 " +
    "focus:border-line-active focus:outline-none disabled:opacity-50";

  return (
    <>
      {/* Lives in the nav, immediately left of the account button.

          It used to float bottom-right, which cost a running battle with the workspace's
          own chrome: on a phone the chat composer occupies the bottom edge (measured at
          390x844: y 732-831, Send at 763-801), so the button needed bottom-32 to clear it,
          and any future bottom-anchored control would have restarted the argument. The nav
          is the one strip of the app that is always present, never scrolls, and has no
          competition for the corner. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Send feedback"
        aria-expanded={open}
        title="Send feedback"
        className="flex h-9 w-9 items-center justify-center border border-line-strong
                   bg-transparent text-ink-muted transition-colors duration-150
                   hover:border-line-active hover:bg-surface-2 hover:text-ink
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active"
      >
        <MessageSquarePlus className="h-[18px] w-[18px]" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            // Anchored to the top now that the trigger is, so the panel opens beneath the
            // button rather than travelling to the opposite corner. pt-16 clears the 64px
            // nav; on a phone the panel fills the width it is given.
            className="fixed inset-0 z-50 flex items-start justify-end bg-scrim p-4 pt-16 backdrop-blur-sm sm:p-6 sm:pt-[68px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
              className="relative w-full max-w-sm border border-line-strong bg-surface-0 p-5"
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center text-ink-dim
                           transition-colors duration-150 hover:text-ink
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active"
              >
                <X size={15} />
              </button>

              {sent ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Check className="h-6 w-6 text-accent" />
                  <p className="text-sm text-ink">Sent — thank you.</p>
                  <p className="text-meta text-ink-dim">It goes straight to the person who builds this.</p>
                </div>
              ) : (
                <>
                  <h2
                    id="feedback-title"
                    className="mb-4 text-meta font-medium uppercase tracking-wider text-ink-muted"
                  >
                    Send feedback
                  </h2>

                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setKind(k.id)}
                        aria-pressed={kind === k.id}
                        className={[
                          "border px-2.5 py-1.5 text-left text-meta transition-colors duration-150",
                          kind === k.id
                            ? "border-line-active bg-surface-3 text-ink"
                            : "border-line-strong bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink",
                        ].join(" ")}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    ref={firstField}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter makes a paragraph; the shortcut sends. A feedback box is
                      // for prose, so the newline has to be the unmodified key.
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={4}
                    maxLength={4000}
                    disabled={busy}
                    placeholder="What happened, or what would make this better?"
                    className={`${fieldClass} resize-none`}
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    placeholder="Email (optional, only if you want a reply)"
                    className={`${fieldClass} mt-2`}
                  />

                  {error && (
                    <p role="alert" className="mt-2 text-meta text-danger">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || !message.trim()}
                    className="mt-3 h-10 w-full border border-line-strong bg-surface-2 text-sm font-medium text-ink
                               transition-colors duration-150 hover:bg-surface-3
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active
                               disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Send"}
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
