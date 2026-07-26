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
export const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "codechad.auth",
    },
  }
);
