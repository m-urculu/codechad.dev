// GET /api/billing/status -> the caller's entitlement, for the UI.
//
// Read-only and cheap. The UI uses it to decide what to show; it is NOT what enforces
// anything. Enforcement happens server-side at the point of action (canCreateCourse), on
// the principle that a client which can be told "you are pro" can also decide it is.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getEntitlement, countCourses } from "@/lib/billing";
import { billingEnabled, isLiveMode } from "@/lib/stripe";

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const [ent, courses] = await Promise.all([getEntitlement(who.userId), countCourses(who.userId)]);

  return NextResponse.json({
    ...ent,
    courses,
    billingEnabled: billingEnabled(),
    // Surfaced so the account page can show a "test mode" marker. A tester who cannot
    // tell whether a charge was real is one support email away from a bad afternoon.
    liveMode: isLiveMode(),
  });
}
