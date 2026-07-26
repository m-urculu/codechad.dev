"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseBrowser";
import { startGoogleRedirect } from "@/lib/googleAuth";

/** Google's four-colour "G" — the only mark their branding terms allow. */
function GoogleMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

type Mode = "signin" | "signup";

/**
 * Hands the credentials that just worked to the browser's password manager.
 *
 * Only call this AFTER a successful sign-in — offering to save a password that
 * was rejected is how managers end up storing typos.
 *
 * Chrome and Edge take this explicitly; Firefox and Safari do not implement the
 * Credential Management API and infer the save from the submitted form instead,
 * which is why the fields below stay a real <form> with real autocomplete and
 * name attributes rather than loose inputs. Both paths need that markup.
 */
async function rememberCredentials(email: string, password: string): Promise<void> {
  try {
    const ctor = (window as unknown as {
      PasswordCredential?: new (d: { id: string; password: string }) => Credential;
    }).PasswordCredential;
    if (!ctor || !navigator.credentials?.store) return;
    await navigator.credentials.store(new ctor({ id: email, password }));
  } catch {
    // Storing is a convenience. It must never turn a good sign-in into an error.
  }
}

// One panel, three ways in. Google leaves via our own redirect (see googleAuth —
// the consent screen has to name codechad.dev, which only works when the
// authorize request comes from here). GitHub goes through Supabase's broker,
// which is fine: GitHub names the app after the OAuth app's own title, not after
// the callback's domain, so nothing leaks the supabase.co host to the user.
export default function LoginModal({
  onClose,
  reason,
}: {
  onClose: () => void;
  /** Why the modal opened, shown above the providers. Absent for the nav button,
   *  which needs no explanation. */
  reason?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "google" | "github" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  const panel = useRef<HTMLDivElement | null>(null);
  const firstField = useRef<HTMLInputElement | null>(null);
  // Where focus was before the modal took it, so it can be handed back.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    firstField.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the panel: a modal the keyboard can walk out of is not
      // modal at all.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      opener.current?.focus?.();
    };
  }, [onClose]);

  const google = async () => {
    setError(null);
    setBusy("google");
    try {
      await startGoogleRedirect();
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Sign-in unavailable");
    }
  };

  const github = async () => {
    setError(null);
    setBusy("github");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/` },
    });
    // On success the browser is already leaving; only failure lands back here.
    if (err) {
      setBusy(null);
      setError(err.message);
    }
  };

  const withEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("email");

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setBusy(null);
        return;
      }
      await rememberCredentials(email, password);
      // The auth listener in LoginButton picks the session up and closes this.
      onClose();
      return;
    }

    // Creating the account is a server call (see api/auth/signup) so that it
    // comes back usable straight away. Signing in stays a normal client call, so
    // the session lands in this tab — which is the whole point: the roadmap and
    // chat built during the trial are saved by the auth listeners the moment it
    // does, without a reload or a trip to an inbox.
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const out = await res.json().catch(() => ({} as { error?: string; code?: string }));
    const taken = res.status === 409 && out.code === "email_taken";

    if (!res.ok && !taken) {
      setBusy(null);
      setError(out.error ?? "Could not create the account. Please try again.");
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      setBusy(null);
      // The only way in here for a brand-new account is Supabase being down; for
      // a taken one it is the ordinary case of someone else's address, or their
      // own with a different password.
      setError(
        taken
          ? "That email already has an account, and this isn't its password."
          : signInErr.message
      );
      return;
    }
    await rememberCredentials(email, password);
    onClose();
  };

  const providerClass =
    "flex h-10 w-full items-center justify-center gap-2.5 border border-line-strong bg-surface-1 " +
    "text-sm font-medium text-ink-muted transition-colors duration-150 " +
    "hover:border-line-active hover:bg-surface-2 hover:text-ink " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active " +
    "disabled:opacity-50";

  const fieldClass =
    "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink " +
    "placeholder:text-ink-faint transition-colors duration-150 " +
    "focus:border-line-active focus:outline-none disabled:opacity-50";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only a press that both starts and ends on the backdrop closes it —
        // otherwise a drag that ends outside the panel dismisses the form.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-sm border border-line-strong bg-surface-0 p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center text-ink-dim
                     transition-colors duration-150 hover:text-ink
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active"
        >
          <X size={15} />
        </button>

        <h2
          id="login-title"
          className={`text-meta font-medium uppercase tracking-wider text-ink-muted ${
            reason ? "mb-2" : "mb-5"
          }`}
        >
          {mode === "signin" ? "Login" : "Create account"}
        </h2>

        {reason && <p className="mb-5 text-sm leading-normal text-ink">{reason}</p>}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={google} disabled={busy !== null} className={providerClass}>
            <GoogleMark />
            Continue with Google
          </button>
          <button type="button" onClick={github} disabled={busy !== null} className={providerClass}>
            <GitHubMark />
            Continue with GitHub
          </button>
        </div>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line-strong" />
          <span className="text-micro uppercase tracking-wider text-ink-faint">or</span>
          <span className="h-px flex-1 bg-line-strong" />
        </div>

        <form onSubmit={withEmail} className="flex flex-col gap-2">
          <input
            ref={firstField}
            type="email"
            id="login-email"
            name="email"
            required
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy !== null}
            className={fieldClass}
          />
          <input
            type="password"
            id="login-password"
            name="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy !== null}
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="mt-1 h-10 w-full border border-accent-line bg-accent-wash text-sm font-medium
                       text-accent-bright transition-colors duration-150
                       hover:border-accent hover:text-ink
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active
                       disabled:opacity-50"
          >
            {busy === "email"
              ? "Working…"
              : mode === "signin"
                ? "Login"
                : "Create account"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-meta text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          disabled={busy !== null}
          className="mt-4 w-full text-center text-meta text-ink-dim transition-colors duration-150
                     hover:text-ink disabled:opacity-50"
        >
          {mode === "signin"
            ? "No account? Create one"
            : "Already have an account? Login"}
        </button>
      </div>
    </div>,
    document.body
  );
}
