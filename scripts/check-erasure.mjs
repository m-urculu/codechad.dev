// Proves that deleting an account actually erases everything attached to it.
//
// `npm run check:erasure`
//
// Migration 0006 added `on delete cascade` from every user-owned table to
// auth.users, and the privacy policy makes a promise that depends on it. A promise
// that depends on a foreign key nobody has looked at since is not a promise — and
// the constraints are not visible from outside the database, so reading the schema
// is not an option here.
//
// So this does the real thing instead: creates a throwaway user, writes one row into
// every user-owned table, deletes the user through the same admin call the app's
// DELETE /api/account uses, and checks with the service role (which bypasses RLS,
// so nothing can hide) that no row survived.
//
// Since 0008 there are TWO properties to prove, not one, and the second is the one that
// is easy to break silently:
//
//   ERASED   every table that holds the user's own content. Article 17.
//   RETAINED billing rows, with user_id blanked. Article 17(3)(b) plus ten-year
//            Portuguese invoice retention — a cascade here would destroy tax records at
//            the exact moment nobody is watching, and it would look like success.
//
// A regression in either direction fails. "Everything was deleted" is NOT a pass.
//
// It writes only to rows owned by the user it just created, and deletes that user at
// the end whatever happens. It is still, deliberately, a script you run knowingly.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Read .env.local ourselves — this runs outside Next, which is what loads it.
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL or service-role key in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// Tables whose rows must NOT survive the delete.
// Keep in step with OWNED_TABLES in src/app/api/account/export/route.ts.
const rows = (uid) => [
  ["user_roadmap_state", { user_id: uid, skill: "erasure-check", module: "python", name: "Erasure check", tree: [], progress: {} }],
  ["user_chat_state", { user_id: uid, course_id: crypto.randomUUID(), module: "python", messages: [{ role: "user", text: "erasure check" }], calib: {} }],
  ["chat_messages", { user_id: uid, role: "user", content: "erasure check" }],
  ["user_step_fulfillment", { user_id: uid, define_roadmaps_done: true }],
  ["user_roadmaps", { user_id: uid, roadmap_key: "erasure-check" }],
  ["feedback", { user_id: uid, kind: "general", message: "erasure check", context: {} }],
];

// Tables whose rows must SURVIVE, with user_id blanked. The opposite assertion.
const billingRows = (uid, cust, sub) => [
  ["billing_customers", "stripe_customer_id", cust, { stripe_customer_id: cust, user_id: uid, email: "erasure-check@codechad.invalid", country: "PT" }],
  ["subscriptions", "stripe_subscription_id", sub, { stripe_subscription_id: sub, stripe_customer_id: cust, user_id: uid, status: "active" }],
];

let uid = null;
let failures = 0;

try {
  const email = `erasure-check+${Date.now()}@codechad.invalid`;
  const { data: created, error: cerr } = await db.auth.admin.createUser({
    email,
    password: `x${Math.random().toString(36).slice(2)}A1!`,
    email_confirm: true,
  });
  if (cerr) throw new Error(`could not create the test user: ${cerr.message}`);
  uid = created.user.id;
  console.log(`test user ${uid}`);

  // 1. Write one row into every user-owned table.
  const written = [];
  for (const [table, row] of rows(uid)) {
    const { error } = await db.from(table).insert(row);
    if (error) {
      console.log(`  ✗ ${table.padEnd(22)} could not seed: ${error.message}`);
      failures++;
      continue;
    }
    written.push(table);
    console.log(`  · ${table.padEnd(22)} seeded`);
  }

  // 1b. And one row in each billing table, which must survive.
  const custId = `cus_erasurecheck_${Date.now()}`;
  const subId = `sub_erasurecheck_${Date.now()}`;
  const billingWritten = [];
  for (const [table, keyCol, keyVal, row] of billingRows(uid, custId, subId)) {
    const { error } = await db.from(table).insert(row);
    if (error) {
      console.log(`  ✗ ${table.padEnd(22)} could not seed: ${error.message}`);
      failures++;
      continue;
    }
    billingWritten.push([table, keyCol, keyVal]);
    console.log(`  · ${table.padEnd(22)} seeded (must survive)`);
  }

  // 2. Delete the account exactly as the app does.
  const { error: derr } = await db.auth.admin.deleteUser(uid);
  if (derr) throw new Error(`could not delete the test user: ${derr.message}`);
  console.log(`\ndeleted the account — checking what survived\n`);
  uid = null; // already gone; skip the cleanup below

  // 3. Nothing may remain. The service role bypasses RLS, so an empty result here
  //    means the row is genuinely gone, not merely hidden from the user.
  for (const table of written) {
    const { data, error } = await db.from(table).select("*").eq("user_id", created.user.id);
    if (error) {
      console.log(`  ✗ ${table.padEnd(22)} could not verify: ${error.message}`);
      failures++;
    } else if (data.length) {
      console.log(`  ✗ ${table.padEnd(22)} ${data.length} row(s) SURVIVED the delete`);
      failures++;
    } else {
      console.log(`  ✓ ${table.padEnd(22)} erased`);
    }
  }

  // 4. The billing rows must still be there, and must no longer name anyone.
  for (const [table, keyCol, keyVal] of billingWritten) {
    const { data, error } = await db.from(table).select("*").eq(keyCol, keyVal);
    if (error) {
      console.log(`  ✗ ${table.padEnd(22)} could not verify: ${error.message}`);
      failures++;
    } else if (!data.length) {
      console.log(`  ✗ ${table.padEnd(22)} DESTROYED — tax records must survive erasure`);
      failures++;
    } else if (data[0].user_id !== null) {
      console.log(`  ✗ ${table.padEnd(22)} survived but still names the user`);
      failures++;
    } else {
      console.log(`  ✓ ${table.padEnd(22)} retained, user_id blanked`);
    }
    // Clean up: this row exists only for the test and has no real invoice behind it.
    await db.from(table).delete().eq(keyCol, keyVal);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  failures++;
} finally {
  if (uid) await db.auth.admin.deleteUser(uid).catch(() => {});
}

console.log(
  failures === 0
    ? "\nErasure is correct: user content removed, billing retained and de-identified."
    : `\n${failures} problem(s). Article 17 is not satisfied until these are zero.`
);
process.exit(failures === 0 ? 0 : 1);
