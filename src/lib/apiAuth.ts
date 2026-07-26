// Who is actually calling an API route.
//
// The routes used to take user_id from the request — a query parameter or a JSON
// field — and hand it straight to the database. Since the server runs as the
// service role, which bypasses RLS, that made the caller's own claim about who
// they were the only thing standing between them and another user's rows:
//
//   curl "https://www.codechad.dev/api/roadmap/list?user_id=<someone else>"
//   -> their courses, with no credentials at all
//
// A user id is now something the server derives, never something the caller
// states. The browser sends its Supabase access token in the Authorization
// header; Supabase verifies the signature and tells us whose it is. A caller can
// still put any user_id they like in the body — it is simply ignored.
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Verification only: this client never reads a table, so the anon key is right
// here. Using the service role would give a forged token more room to matter.
const verifier = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export type Caller = { userId: string } | { error: Response };

/**
 * Resolves the signed-in user from the Authorization header.
 *
 * Returns either the verified user id or a ready-to-return 401. Call it first in
 * every route that touches user data:
 *
 *   const who = await requireUser(request);
 *   if ("error" in who) return who.error;
 *   // use who.userId — never a user_id from the request
 */
export async function requireUser(request: Request): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (!token) return { error: unauthorized("Missing Authorization header") };

  // Verifies the JWT signature and expiry against the project's keys. A token
  // from another Supabase project, or an edited one, fails here.
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user) return { error: unauthorized("Invalid or expired session") };

  return { userId: data.user.id };
}

/**
 * The signed-in user if there is one, otherwise null. Never rejects.
 *
 * For routes that must keep working signed out — the AI endpoints — but that
 * persist something when a real session is present. Anything written under the
 * returned id is safe; a caller who sends no token, or a bad one, simply gets
 * null and nothing is written for anyone.
 */
export async function optionalUser(request: Request): Promise<string | null> {
  const who = await requireUser(request);
  return "error" in who ? null : who.userId;
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
