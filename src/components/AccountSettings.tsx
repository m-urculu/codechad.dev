"use client";

// Full-screen management view for the ACCOUNT, as CourseSettings is for one course.
// Reached from the avatar menu. Everything here acts on the signed-in user.
//
// Most of it talks straight to Supabase from the browser: the session's own token is
// the right authority for changing your own name or password, and a server route
// would only add a chance to act on the wrong user. Only the two things a session
// genuinely cannot do — an email change that skips confirmation, and deleting the
// row in auth.users — go through /api/account.
//
// Destructive actions sit in their own section and each need a second, explicit
// confirmation; deleting the account needs the word typed, because unlike every
// other action here it takes the courses with it and cannot be undone.

import { useEffect, useState } from "react";
import Image from "next/image";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseBrowser";
import { apiFetch } from "@/lib/apiFetch";
import type { RoadmapSummary } from "@/components/Landing";

const MIN_PASSWORD = 6;

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** How they can get back in, in the words the login panel uses. */
function providerLabel(id: string): string {
  if (id === "google") return "Google";
  if (id === "github") return "GitHub";
  if (id === "email") return "Email and password";
  return id;
}

const inputClass =
  "w-full border border-line-strong bg-surface-0 px-3 py-2 text-sm text-ink " +
  "outline-none transition-colors duration-150 focus:border-line-active disabled:opacity-50";
const saveClass =
  "bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 transition-colors duration-150 " +
  "hover:bg-ink-muted disabled:opacity-40";

/** A destructive action that needs a second, explicit confirmation. */
function DangerAction({
  title,
  detail,
  label,
  confirmLabel,
  onConfirm,
  done,
}: {
  title: string;
  detail: string;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  done?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000); // don't leave a live trigger sitting there
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-1 text-xs leading-snug text-ink-dim">{detail}</p>
      </div>
      {done ? (
        <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-accent">
          <FiCheck size={13} /> Done
        </span>
      ) : armed ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              onConfirm();
              setArmed(false);
            }}
            className="bg-danger px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-danger/80"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="shrink-0 border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors duration-150 hover:border-danger hover:text-danger"
        >
          {label}
        </button>
      )}
    </div>
  );
}

export default function AccountSettings({ onBack }: { onBack: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<RoadmapSummary[] | null>(null);

  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState<null | "name" | "email" | "password">(null);
  const [saved, setSaved] = useState<null | "name" | "email" | "password">(null);
  const [error, setError] = useState<{ field: "name" | "email" | "password"; message: string } | null>(null);
  const [signedOutEverywhere, setSignedOutEverywhere] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null;
      setUser(u);
      const n = (u?.user_metadata?.name || u?.user_metadata?.full_name || "") as string;
      setName(n);
      setSavedName(n);
      setEmail(u?.email ?? "");
      setSavedEmail(u?.email ?? "");
    });
  }, []);

  // What "delete everything" would actually take, stated in the warning rather than
  // left for the learner to remember.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/roadmap/list");
        const { roadmaps } = await res.json();
        if (!cancelled) setCourses(Array.isArray(roadmaps) ? roadmaps : []);
      } catch {
        if (!cancelled) setCourses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function flash(what: "name" | "email" | "password") {
    setSaved(what);
    setTimeout(() => setSaved((s) => (s === what ? null : s)), 2000);
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName) return;
    setBusy("name");
    setError(null);
    const { error: err } = await supabase.auth.updateUser({
      data: { name: trimmed, full_name: trimmed },
    });
    setBusy(null);
    if (err) {
      setError({ field: "name", message: err.message });
      return;
    }
    setSavedName(trimmed);
    flash("name");
  }

  async function saveEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || trimmed === savedEmail) return;
    setBusy("email");
    setError(null);
    try {
      const res = await apiFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ field: "email", message: data.error ?? "Could not change the email." });
        return;
      }
      // The session still carries the old address until it is refreshed.
      await supabase.auth.refreshSession();
      setSavedEmail(trimmed);
      flash("email");
    } catch {
      setError({ field: "email", message: "Could not change the email." });
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    if (password.length < MIN_PASSWORD) {
      setError({ field: "password", message: `Use at least ${MIN_PASSWORD} characters.` });
      return;
    }
    if (password !== password2) {
      setError({ field: "password", message: "The two passwords don't match." });
      return;
    }
    setBusy("password");
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (err) {
      setError({ field: "password", message: err.message });
      return;
    }
    setPassword("");
    setPassword2("");
    flash("password");
  }

  // Article 15/20 in one button. The route sets Content-Disposition, but a fetch
  // response is not a navigation and the browser will not act on it — so the blob is
  // turned into a download here. It cannot be a plain <a href>: the endpoint needs the
  // Authorization header, which only apiFetch supplies.
  async function downloadData() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await apiFetch("/api/account/export");
      if (!res.ok) {
        setExportError("Could not build the file. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codechad-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on a delay: revoking synchronously can cancel the download in Safari.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExported(true);
      setTimeout(() => setExported(false), 4000);
    } catch {
      setExportError("Could not reach the server. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const res = await apiFetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        setDeleting(false);
        return;
      }
    } catch {
      setDeleting(false);
      return;
    }
    // The row is gone; the token in this tab now points at nobody. Clear it and
    // land on a signed-out home rather than a page quietly failing every request.
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "/";
  }

  const identities = user?.identities ?? [];
  const providers = identities.length
    ? Array.from(new Set(identities.map((i) => providerLabel(i.provider))))
    : ["Email and password"];
  const avatar = (user?.user_metadata?.avatar_url as string | undefined) || null;
  const lessonsDone = (courses ?? []).reduce((sum, c) => sum + (c.doneCount ?? 0), 0);
  // Signing in with a provider only: there is no password to change, there is a
  // password to ADD, and the section says so.
  const hasPassword = identities.some((i) => i.provider === "email");

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 self-start text-meta font-medium text-ink-dim transition-colors duration-150 hover:text-ink"
        >
          <FiArrowLeft size={13} /> All courses
        </button>

        {/* --- Overview ------------------------------------------------------ */}
        <header className="flex items-start gap-4 border border-line-strong bg-surface-1 p-5 backdrop-blur-md">
          {avatar ? (
            <Image
              src={avatar}
              alt=""
              width={52}
              height={52}
              className="shrink-0 object-cover"
              style={{ width: 52, height: 52 }}
            />
          ) : (
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-line-strong text-lg uppercase text-ink">
              {savedName[0] || user?.email?.[0] || "U"}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold text-ink">{savedName || "Your account"}</h1>
            <p className="mt-1 truncate text-xs text-ink-dim">{savedEmail}</p>
            <p className="mt-1 text-meta text-ink-dim">
              Joined {formatDate(user?.created_at)} · signs in with {providers.join(" and ")}
            </p>
            <p className="mt-1 text-meta text-ink-dim">
              {courses === null
                ? "Loading your courses…"
                : courses.length === 0
                  ? "No courses yet"
                  : `${courses.length} course${courses.length === 1 ? "" : "s"}` +
                    (lessonsDone > 0 ? ` · ${lessonsDone} lesson${lessonsDone === 1 ? "" : "s"} done` : "")}
            </p>
          </div>
        </header>

        {/* --- Display name -------------------------------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Display name
          </h2>
          <div className="flex gap-2">
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              disabled={busy !== null}
              aria-label="Display name"
              className={inputClass}
            />
            <button
              type="button"
              onClick={saveName}
              disabled={busy !== null || !name.trim() || name.trim() === savedName}
              className={saveClass}
            >
              {saved === "name" ? "Saved" : busy === "name" ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-meta text-ink-dim">
            Shown on your avatar when you have no picture. Nothing else uses it.
          </p>
          {error?.field === "name" && <p className="mt-2 text-meta text-danger">{error.message}</p>}
        </section>

        {/* --- Email --------------------------------------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">Email</h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEmail()}
              disabled={busy !== null}
              aria-label="Email address"
              className={inputClass}
            />
            <button
              type="button"
              onClick={saveEmail}
              disabled={busy !== null || !email.trim() || email.trim().toLowerCase() === savedEmail}
              className={saveClass}
            >
              {saved === "email" ? "Saved" : busy === "email" ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-meta text-ink-dim">
            This is how you sign in with a password, and the only way to reach you. It takes
            effect immediately — no confirmation mail is sent yet, so an address you mistype is
            an address you sign in with.
          </p>
          {error?.field === "email" && <p className="mt-2 text-meta text-danger">{error.message}</p>}
        </section>

        {/* --- Password ------------------------------------------------------ */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            {hasPassword ? "Password" : "Add a password"}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder="New password"
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy !== null}
              aria-label="New password"
              className={inputClass}
            />
            <input
              type="password"
              value={password2}
              autoComplete="new-password"
              placeholder="Repeat it"
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePassword()}
              disabled={busy !== null}
              aria-label="Repeat new password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={savePassword}
              disabled={busy !== null || !password || !password2}
              className={`${saveClass} sm:shrink-0`}
            >
              {saved === "password" ? "Saved" : busy === "password" ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-meta text-ink-dim">
            {hasPassword
              ? "Replaces your current password. Other devices stay signed in until you sign them out below."
              : `You signed in with ${providers.join(" and ")}. Setting a password here adds email sign-in as a second way in — it does not remove the first.`}
          </p>
          {error?.field === "password" && (
            <p className="mt-2 text-meta text-danger">{error.message}</p>
          )}
        </section>

        {/* --- Your data ------------------------------------------------------ */}
        {/* Not in the danger zone: exporting is the opposite of destructive, and
            burying it next to "delete everything" would make a right look like a risk. */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Your data
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={downloadData}
              disabled={exporting}
              className="border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-surface-2 disabled:opacity-40 sm:shrink-0"
            >
              {exporting ? "Preparing…" : "Download my data"}
            </button>
            {exported && (
              <span className="flex items-center gap-1.5 text-meta font-medium text-accent">
                <FiCheck size={13} /> Downloaded
              </span>
            )}
          </div>
          <p className="mt-2 text-meta text-ink-dim">
            A JSON file with everything attached to your account: your profile, every
            course and roadmap, your progress and submitted code, every conversation with
            the tutor, and any feedback you sent while signed in. Yours to keep or to take
            elsewhere.
          </p>
          {exportError && <p className="mt-2 text-meta text-danger">{exportError}</p>}
        </section>

        {/* --- Danger zone ---------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-danger">
            Danger zone
          </h2>
          <DangerAction
            title="Sign out everywhere"
            detail="Ends this session and every other one, on every device. Your courses are untouched."
            label="Sign out everywhere"
            confirmLabel="Sign out everywhere"
            done={signedOutEverywhere}
            onConfirm={async () => {
              setSignedOutEverywhere(true);
              await supabase.auth.signOut({ scope: "global" }).catch(() => {});
              window.location.href = "/";
            }}
          />

          <div className="border-t border-line py-4">
            <div className="text-sm font-semibold text-ink">Delete account</div>
            <p className="mt-1 text-xs leading-snug text-ink-dim">
              Permanently removes your account and everything in it
              {courses === null
                ? ""
                : courses.length > 0
                  ? `: ${courses.length} course${courses.length === 1 ? "" : "s"}, their roadmaps and progress, and every conversation with the tutor`
                  : ", including any conversation with the tutor"}
              . This cannot be undone, and signing in again starts you from nothing.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
                aria-label="Type DELETE to confirm"
                disabled={deleting}
                className={inputClass}
              />
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleteConfirm.trim().toUpperCase() !== "DELETE" || deleting}
                className="bg-danger px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150
                           hover:bg-danger/80 disabled:opacity-40 sm:shrink-0"
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
