// Sign-in with Google, issued to OUR origin rather than brokered by Supabase.
//
// Why this exists. `supabase.auth.signInWithOAuth` sends the browser to Supabase,
// which then builds the Google authorize URL with its OWN redirect_uri:
//
//   redirect_uri=https://<project>.supabase.co/auth/v1/callback
//
// Google names the app on the consent screen after that URI's domain, so users saw
// "to continue to <project>.supabase.co" — a domain nobody can prove they own. That
// is unfixable from the app side: the value is baked into Supabase's config, not
// derived from the request, so a reverse proxy in front of it changes nothing
// (verified — X-Forwarded-Host, Forwarded and Host overrides all leave it intact).
//
// Google Identity Services instead issues an ID token directly to this origin, and
// Supabase accepts it through signInWithIdToken. The consent screen then names the
// app's own domain, and supabase.co drops out of the OAuth configuration entirely.
//
// Requires, once, in two dashboards:
//   Google Cloud -> Credentials -> the OAuth client -> Authorized JavaScript origins
//     https://www.codechad.dev  and  http://localhost:3000
//   Supabase -> Authentication -> Providers -> Google -> Authorized Client IDs
//     the same client ID

// Not a secret. An OAuth client ID is a public identifier — it appears in every
// authorize URL and in the rendered Google button. The env var is here so a
// different project can be pointed at without a code change.
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "838073038454-ruv83fog449mkndbfd5gbt8v2qbb84dm.apps.googleusercontent.com";

export const GIS_SRC = "https://accounts.google.com/gsi/client";

/**
 * A nonce pair binding the token to this sign-in attempt.
 *
 * Google receives the HASH and embeds it in the ID token; Supabase receives the
 * raw value and checks that it hashes to what the token carries. A token lifted
 * from another session therefore cannot be replayed here.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

/** Loads the GIS script once, resolving when `window.google.accounts.id` exists. */
export function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS failed to load"));
    document.head.appendChild(s);
  });
}

// Minimal shape of the bits of Google Identity Services this app touches.
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(config: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            nonce?: string;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
            }
          ): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}
