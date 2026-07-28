// GET /api/account/export -> a JSON file containing everything we hold about the caller.
//
// Articles 15 and 20 together: access ("tell me what you have") and portability ("give
// it to me in a structured, commonly used, machine-readable format"). One endpoint can
// satisfy both, and a JSON download is the honest reading of "machine-readable" for an
// app whose data is already JSON.
//
// Two rules this route follows and which are easy to get wrong:
//
//   1. It exports the caller's rows and ONLY the caller's rows. The user id comes from
//      the verified token (requireUser), never from the request — same posture as every
//      other route. The service role bypasses RLS, so the WHERE clause is the only
//      boundary there is; every query below therefore filters on who.userId explicitly.
//
//   2. It exports what we HOLD, not a summary of it. A right-of-access response that
//      quietly drops the awkward parts — the conversations, the code — is not a
//      right-of-access response. Every user-owned table is here, including the ones the
//      app itself no longer reads.
//
// Anonymous feedback is deliberately absent: with a null user_id there is nothing
// linking it to the caller, and matching on the optional reply email would hand one
// person another person's messages on nothing more than a typed address.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Every table that can hold a row belonging to a user, with the column that says so.
// Adding a user-owned table means adding it here — the export is only as complete as
// this list, so it is written out rather than derived.
const OWNED_TABLES: { table: string; column: string; orderBy?: string }[] = [
  { table: "user_roadmap_state", column: "user_id", orderBy: "created_at" },
  { table: "user_chat_state", column: "user_id", orderBy: "updated_at" },
  { table: "chat_messages", column: "user_id", orderBy: "created_at" },
  { table: "user_step_fulfillment", column: "user_id" },
  { table: "user_roadmaps", column: "user_id" },
  { table: "feedback", column: "user_id", orderBy: "created_at" },
  // Billing. Included because it IS the caller's personal data, even though it is the
  // one thing that survives an account deletion (0008). Card data is not here and never
  // was: Stripe holds it and we never receive it.
  { table: "subscriptions", column: "user_id", orderBy: "started_at" },
];

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const data: Record<string, unknown> = {};
  const failed: string[] = [];

  for (const { table, column, orderBy } of OWNED_TABLES) {
    let query = supabaseAdmin.from(table).select("*").eq(column, who.userId);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data: rows, error } = await query;
    if (error) {
      // A missing table is not a reason to refuse the whole export — but it IS a reason
      // to say so in the file, because a silent omission is exactly the failure mode
      // Article 15 is about.
      console.error(`[export] ${table} failed:`, error.message);
      failed.push(table);
      continue;
    }
    data[table] = rows ?? [];
  }

  // The account record itself lives in auth.users, which is not reachable through
  // PostgREST. Only the fields that are actually the user's own are copied out; the
  // internal GoTrue bookkeeping is not their personal data in any useful sense.
  const { data: account } = await supabaseAdmin.auth.admin.getUserById(who.userId);
  const u = account?.user;

  const body = {
    exported_at: new Date().toISOString(),
    // Named so the recipient — possibly a different service, possibly a lawyer — can
    // tell what produced the file without being told.
    exported_by: "CodeChad (codechad.dev)",
    format_version: 1,
    account: u
      ? {
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          providers: (u.identities ?? []).map((i) => i.provider),
          profile: u.user_metadata ?? {},
        }
      : null,
    data,
    notes: [
      "This file contains every row CodeChad holds that is linked to your account.",
      "Passwords are not included: they are stored hashed by Supabase and cannot be read back.",
      "Server request logs held by our host (Vercel) are not included; ask us if you need them.",
      "Feedback sent while signed out is not linked to your account and cannot be identified as yours.",
      "Card details are not included because we never receive them: Stripe holds them.",
      "Invoices are held by Stripe and are kept for 10 years to satisfy tax law, even if you delete your account. Everything else about you is erased.",
      ...(failed.length ? [`Some data could not be read at export time: ${failed.join(", ")}.`] : []),
    ],
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="codechad-data-${stamp}.json"`,
      // A personal-data export must never be cached by anything between us and them.
      "Cache-Control": "no-store, private",
    },
  });
}
