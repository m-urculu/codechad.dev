// The account itself — the parts a browser session cannot do on its own.
//
//   PATCH  /api/account { email }  -> { ok, email }
//   DELETE /api/account            -> { ok }
//
// Display name and password are NOT here: supabase.auth.updateUser does both from
// the browser with the user's own token, and routing them through the service role
// would only add a way to get the identity wrong. These two need more:
//
//   email  — the project still has confirmations on, so the ordinary call would
//            park the change behind a link in an inbox that may not exist (see
//            api/auth/signup for the same reasoning). Applied directly instead.
//   delete — removing a row from auth.users is service-role work. Everything the
//            account owns is reachable from that one delete: every user table
//            carries `on delete cascade` (supabase/migrations/0006), so the
//            roadmaps, progress and chat history go with it.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/apiAuth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Is this address already some OTHER account's?
 *
 * Goes to GoTrue's admin user filter directly: supabase-js only offers a paginated
 * listUsers, which would mean walking every user to answer one question. Fails
 * CLOSED — an unanswerable check reports "not taken" and lets the update decide,
 * rather than blocking a legitimate change on a hiccup.
 */
async function emailTaken(email: string, selfId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return false;
    const { users } = (await res.json()) as { users?: { id: string; email?: string }[] };
    return (users ?? []).some((u) => u.id !== selfId && u.email?.toLowerCase() === email);
  } catch {
    return false;
  }
}

/**
 * Stop any live subscription before the account goes.
 *
 * Fails SOFT and deliberately: if Stripe is unreachable, the deletion still proceeds.
 * Blocking erasure — a right with a legal deadline — on a third party's availability is
 * the wrong trade. The cost is a subscription that may need cancelling by hand, which is
 * logged loudly enough to notice.
 */
async function cancelSubscriptions(userId: string): Promise<void> {
  try {
    const { stripe } = await import("@/lib/stripe");
    if (!stripe) return;

    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", userId);

    for (const sub of subs ?? []) {
      // Already over? Cancelling again is an error, not a no-op.
      if (["canceled", "incomplete_expired", "unpaid"].includes(sub.status)) continue;
      try {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: true,
          cancellation_details: { comment: "Account deleted by the user" },
        });
      } catch (e) {
        console.error(
          `[account] could not cancel ${sub.stripe_subscription_id} before delete:`,
          e
        );
      }
    }
  } catch (e) {
    console.error("[account] subscription cancellation step failed:", e);
  }
}

export async function PATCH(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Asked first, because the update itself cannot tell us. When the address belongs
  // to someone else, GoTrue surfaces the unique-violation as a bare 500
  // "Error updating user" — indistinguishable from the database being down, which
  // would leave the learner staring at "try again" forever over a fixable typo.
  if (await emailTaken(email, who.userId)) {
    return NextResponse.json({ error: "Another account already uses that email." }, { status: 409 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(who.userId, {
    email,
    email_confirm: true,
  });

  if (error) {
    console.error("[account] email change failed:", error.status, error.message);
    return NextResponse.json({ error: "Could not change the email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}

// Erasure. One call, and the database does the rest — with one deliberate exception.
//
// Every user-owned table cascades from auth.users (0006), so roadmaps, progress, chat and
// feedback go with the account. `billing_customers` and `subscriptions` do NOT (0008):
// their FK is `on delete set null`, so the row survives with user_id blanked. That is
// Art. 17(3)(b) — invoices must be retained for ten years under Portuguese tax law, and
// a cascade would destroy tax records at the moment nobody is watching. The privacy
// policy states this; `npm run check:erasure` asserts both halves.
//
// An active subscription IS cancelled first, and that ordering matters. Deleting the
// account without it would leave a live Stripe subscription attached to a customer whose
// account no longer exists — still charging, monthly, with no way for the person to stop
// it from inside an app they can no longer sign into. Nobody deleting their account
// expects to keep paying for it.
//
// It is cancelled at period end rather than immediately: they paid for the month, and
// taking it away is not ours to do. If they want the money back they withdraw (inside 14
// days) before deleting, which refunds the unused part.
export async function DELETE(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  await cancelSubscriptions(who.userId);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(who.userId);
  if (error) {
    console.error("[account] delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
