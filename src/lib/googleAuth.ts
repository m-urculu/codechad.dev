// Sign-in with Google as a full-page redirect, issued to OUR origin rather than
// brokered by Supabase.
//
// Why not Supabase's own flow. `supabase.auth.signInWithOAuth` sends the browser
// to Supabase, which builds the Google authorize URL with its OWN redirect_uri:
//
//   redirect_uri=https://<project>.supabase.co/auth/v1/callback
//
// Google names the app on the consent screen after that URI's domain, so users saw
// "to continue to <project>.supabase.co" — a domain nobody can prove they own. That
// is unfixable from the app side: the value is baked into Supabase's config, not
// derived from the request, so a reverse proxy in front of it changes nothing
// (verified — X-Forwarded-Host, Forwarded and Host overrides all leave it intact).
//
// Why not Google Identity Services. GIS delivers the token to a button it renders
// inside an accounts.google.com iframe, which cannot be styled from here at all.
// Dressing the app's own button over that iframe worked, but the control was still
// Google's underneath.
//
// What this does instead: the OpenID Connect implicit flow, by hand. The browser
// leaves for accounts.google.com, comes back to this origin with an ID token in
// the URL fragment, and Supabase exchanges it for a session. No script from
// Google, no iframe, no popup — and no client secret, since the fragment never
// reaches a server and there is no code to exchange.
//
// Requires, once, in two dashboards:
//   Google Cloud -> Credentials -> the OAuth client -> Authorized redirect URIs
//     https://www.codechad.dev/  and  http://localhost:3000/   (exact, with the
//     trailing slash — Google matches these literally)
//   Supabase -> Authentication -> Providers -> Google -> Authorized Client IDs
//     the same client ID

// Not a secret. An OAuth client ID is a public identifier — it appears in every
// authorize URL. The env var is here so a different project can be pointed at
// without a code change.
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "838073038454-ruv83fog449mkndbfd5gbt8v2qbb84dm.apps.googleusercontent.com";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// sessionStorage, not localStorage: these are single-use values belonging to one
// tab's one sign-in attempt, and they must not outlive it.
const NONCE_KEY = "codechad:google:nonce";
const STATE_KEY = "codechad:google:state";

/** 32 random bytes, base64. */
function randomToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

/**
 * A nonce pair binding the token to this sign-in attempt.
 *
 * Google receives the HASH and embeds it in the ID token; Supabase receives the
 * raw value and checks that it hashes to what the token carries. A token lifted
 * from another session therefore cannot be replayed here.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

/**
 * Where Google sends the browser back to. Must match a registered Authorized
 * redirect URI byte for byte, which is why the path is pinned to "/" rather than
 * taken from the current location — the app is one page, and any deeper path
 * would need registering separately.
 */
export function redirectUri(): string {
  return `${window.location.origin}/`;
}

/** Leaves this page for Google's account chooser. Does not return. */
export async function startGoogleRedirect(): Promise<void> {
  const { raw, hashed } = await makeNonce();
  const state = randomToken();

  // Written before navigating; read again when Google sends the browser back.
  sessionStorage.setItem(NONCE_KEY, raw);
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  // An ID token straight back in the fragment — the one thing Supabase needs.
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", hashed);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  window.location.assign(url.toString());
}

export type RedirectResult =
  | { idToken: string; nonce: string }
  | { error: string }
  | null;

/**
 * Reads the result of a sign-in redirect out of the URL fragment.
 *
 * Returns null on an ordinary page load — the common case, so this is cheap to
 * call unconditionally on mount. Whatever the outcome, the fragment and the
 * stored nonce/state are cleared before returning: the ID token must not sit in
 * the address bar or in history, and neither value may be reused.
 */
export function completeGoogleRedirect(): RedirectResult {
  if (typeof window === "undefined") return null;

  const raw = window.location.hash;
  if (raw.length < 2) return null;

  const params = new URLSearchParams(raw.slice(1));
  const idToken = params.get("id_token");
  const err = params.get("error");
  // Some other fragment — a deep link, a scroll anchor. Leave it alone.
  if (!idToken && !err) return null;

  const state = params.get("state");
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const nonce = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (err) return { error: err === "access_denied" ? "Sign-in cancelled" : err };
  // No state, or the wrong state, means this response was not asked for here.
  if (!expectedState || state !== expectedState) return { error: "Sign-in state mismatch" };
  if (!nonce) return { error: "Sign-in expired — try again" };

  return { idToken: idToken as string, nonce };
}
