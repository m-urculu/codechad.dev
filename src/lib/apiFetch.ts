import { supabase } from "@/lib/supabaseBrowser";
import { openLogin } from "@/lib/authModal";

// fetch() for this app's own API, with the caller's identity attached.
//
// Routes no longer trust a user_id in the query string or body — they read the
// Supabase access token from the Authorization header and resolve the user from
// it (see src/lib/apiAuth.ts). Every call to /api/* that touches user data has
// to come through here, or it gets a 401.
//
// getSession() reads from local storage and refreshes only when the token is
// near expiry, so this is cheap enough to call per request.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  // A trial visitor who has spent their allowance gets a 429 from any of the
  // generation routes. Raising the modal here rather than at each of the dozen
  // call sites means no route can quietly fail with a message the learner can't
  // act on. Signed-in callers are never rate limited, so this cannot fire on them.
  if (res.status === 429 && !token) {
    const reason = await res
      .clone()
      .json()
      .then((b) => (b?.code === "trial_limit" ? (b.error as string) : null))
      .catch(() => null);
    if (reason) openLogin(reason);
  }

  return res;
}
