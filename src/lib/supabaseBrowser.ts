import { createClient } from "@supabase/supabase-js";

// The ONE Supabase client for the browser. Import this; do not call createClient
// in a component.
//
// Five components used to build their own, and every one of them started a
// GoTrue instance pointed at the same localStorage key — five refresh timers
// racing over one token, which is what the "Multiple GoTrueClient instances
// detected" warning was reporting. Two of them refreshing at once can write a
// stale token back and sign the user out mid-session.
//
// The options below are the library's defaults, written out because they are the
// contract this app depends on: a session survives a reload (persistSession),
// keeps itself alive (autoRefreshToken), and OAuth redirects landing back on the
// page are consumed automatically (detectSessionInUrl — GitHub arrives this way;
// Google's ID token is handled by hand in googleAuth).
export const AUTH_STORAGE_KEY = "codechad.auth";

/**
 * The signed-in user's id, read straight out of storage — SYNCHRONOUSLY.
 *
 * getUser()/getSession() are promises, so anything that waits for them paints at
 * least one frame first. That is fine for most things and not fine for the two
 * caches, whose whole purpose is to have something on screen in that first frame:
 * they are keyed by user id, and a user id that arrives a frame late is a user id
 * that arrives too late.
 *
 * This is a read of the same localStorage entry the client above owns, so it can
 * only ever be as stale as the session itself. It is NOT an authorisation check —
 * nothing may be trusted or served on the strength of it. Requests still carry the
 * real token (apiFetch) and the server still resolves the user from that.
 */
export function cachedUserId(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    // Recent supabase-js versions may store the session base64-encoded.
    const json = raw.startsWith("base64-") ? atob(raw.slice(7)) : raw;
    return JSON.parse(json)?.user?.id ?? null;
  } catch {
    // No storage, or a shape we do not recognise: the caller falls back to the
    // async path and simply paints a frame later.
    return null;
  }
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  }
);
