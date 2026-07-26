// The Supabase client for SERVER code only. It authenticates with the service
// role key, which bypasses Row Level Security entirely.
//
// `server-only` is not decoration: importing this file from a component is a
// build error rather than a leaked key. Next.js would not inline
// SUPABASE_SERVICE_ROLE_KEY into a browser bundle anyway (only NEXT_PUBLIC_ vars
// are inlined), so the practical failure would be a confusing runtime throw —
// this turns it into an obvious one at build time.
//
// Why the service role at all. Until now every server route authenticated with
// the anon key, the same key that ships in the browser. That is what made RLS
// impossible to switch on: policies key off auth.uid(), anon carries none, so
// every server query would return zero rows. See supabase/migrations/0005_rls.sql.
//
// Bypassing RLS means these routes are the only thing standing between a user
// and someone else's rows. Every query here must filter by user_id itself.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let real: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (real) return real;

  const url = process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL is not set");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Server routes cannot read the " +
        "database once RLS is enabled — add it to .env.local and to Vercel."
    );
  }

  // No session handling: there is no user here, and persisting one to disk on a
  // server would be a bug.
  real = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return real;
}

// Constructed on first property access, not at import, so a missing key surfaces
// as a clear error on the request that needed it rather than breaking the build.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    // Methods must keep their own `this`, or the client's internals break.
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as SupabaseClient;
