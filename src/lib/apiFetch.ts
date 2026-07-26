import { supabase } from "@/lib/supabaseBrowser";

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

  return fetch(input, { ...init, headers });
}
