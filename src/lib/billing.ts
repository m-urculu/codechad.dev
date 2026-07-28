// Who is entitled to what, read server-side and never asserted by the client.
//
// Entitlement is derived from the `subscriptions` table, which the Stripe webhook keeps
// in step with Stripe's own truth. Reading our own row rather than calling Stripe on
// every request is a deliberate availability trade: a Stripe outage must not stop a
// paying learner opening their courses. The cost is a window — between a payment event
// and the webhook landing — where our copy is stale, which is acceptable in this
// direction because the states that matter (cancelled, unpaid) trend toward LESS access,
// and the checkout success path refreshes the row synchronously.
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FREE_COURSE_LIMIT, WITHDRAWAL_WINDOW_DAYS } from "@/lib/stripe";

// Stripe statuses that mean "this person has paid and should have the thing".
//
// `past_due` is included on purpose. A card that failed renewal is not fraud, it is an
// expired card, and Stripe will retry it for days. Cutting access at the first failed
// charge punishes the most ordinary billing accident there is; Stripe moves the
// subscription to `unpaid` or `canceled` when it gives up, and those are not on this list.
const ENTITLED = new Set(["active", "trialing", "past_due"]);

export type Entitlement = {
  pro: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whether the Art. 11a withdrawal function must currently be offered. */
  withdrawalOpen: boolean;
  withdrawalDeadline: string | null;
  withdrawnAt: string | null;
  courseLimit: number | null; // null = unlimited
};

const FREE: Entitlement = {
  pro: false,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  withdrawalOpen: false,
  withdrawalDeadline: null,
  withdrawnAt: null,
  courseLimit: FREE_COURSE_LIMIT,
};

/**
 * The caller's entitlement. Never throws: a billing lookup that fails must fall back to
 * the free tier rather than 500, because the free tier is a working product.
 *
 * Falling back to FREE is the safe direction for the app but the wrong one for a paying
 * customer, so the failure is logged loudly — a spike here is a billing outage, not noise.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  try {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end, started_at, withdrawn_at")
      .eq("user_id", userId)
      // Newest contract wins if someone has resubscribed after cancelling.
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[billing] entitlement lookup failed:", error.message);
      return FREE;
    }
    if (!data) return FREE;

    const pro = ENTITLED.has(data.status) && !data.withdrawn_at;
    const deadline = withdrawalDeadline(data.started_at);

    return {
      pro,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: !!data.cancel_at_period_end,
      // Open only while the contract is live, the window has not expired, and it has not
      // already been used. Art. 11a requires the control to be available THROUGHOUT the
      // window — so this is computed on every read, never cached into a stored flag.
      withdrawalOpen: pro && !data.withdrawn_at && Date.now() < deadline.getTime(),
      withdrawalDeadline: deadline.toISOString(),
      withdrawnAt: data.withdrawn_at,
      courseLimit: pro ? null : FREE_COURSE_LIMIT,
    };
  } catch (e) {
    console.error("[billing] entitlement exception:", e);
    return FREE;
  }
}

/** 14 days from the moment the contract was concluded. */
export function withdrawalDeadline(startedAt: string | Date): Date {
  const start = new Date(startedAt);
  return new Date(start.getTime() + WITHDRAWAL_WINDOW_DAYS * 86_400_000);
}

/** How many courses this user already has. */
export async function countCourses(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("course_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error("[billing] course count failed:", error.message);
    // Fail OPEN. A count we cannot read must not block someone from making a course
    // they are probably entitled to; the limit is a product boundary, not a security one.
    return 0;
  }
  return count ?? 0;
}

export type LimitCheck = { allowed: true } | { allowed: false; limit: number; used: number };

/**
 * May this user create one more course?
 *
 * Called at both creation points — POST /api/roadmap/state and the "duplicate" action —
 * because a limit enforced at one of two doors is not a limit.
 */
export async function canCreateCourse(userId: string): Promise<LimitCheck> {
  const ent = await getEntitlement(userId);
  if (ent.courseLimit === null) return { allowed: true };

  const used = await countCourses(userId);
  if (used < ent.courseLimit) return { allowed: true };
  return { allowed: false, limit: ent.courseLimit, used };
}

/**
 * The caller's Stripe customer id, creating the customer on first use.
 *
 * One Stripe customer per user, forever. Creating a second one for someone who already
 * has a subscription is the classic duplicate-billing bug: the new customer has no
 * payment method and no history, so the old subscription keeps charging invisibly while
 * the user is asked to pay again. The lookup therefore comes first, always.
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string | null
): Promise<string | null> {
  const { stripe } = await import("@/lib/stripe");
  if (!stripe) return null;

  const { data: existing } = await supabaseAdmin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    // The link back to the account. Stripe metadata is the only place this association
    // exists on their side, and support questions start from the Stripe dashboard.
    metadata: { user_id: userId },
  });

  const { error } = await supabaseAdmin.from("billing_customers").insert({
    stripe_customer_id: customer.id,
    user_id: userId,
    email,
  });
  if (error) {
    // The customer exists at Stripe but we failed to record it. Returning it anyway is
    // right — the checkout should proceed — and the webhook writes the row again on
    // completion, so this self-heals rather than stranding the payment.
    console.error("[billing] could not record customer:", error.message);
  }
  return customer.id;
}

/** The 402 a blocked creation returns, written to be shown to a person. */
export function limitResponse(check: { limit: number; used: number }): Response {
  return new Response(
    JSON.stringify({
      error: `Free accounts can keep ${check.limit} courses. Delete one, or go unlimited to keep as many as you like.`,
      code: "course_limit",
      limit: check.limit,
      used: check.used,
    }),
    { status: 402, headers: { "Content-Type": "application/json" } }
  );
}
