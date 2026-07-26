// List the signed-in user's stored roadmaps for the "Continue learning" section.
//   GET /api/roadmap/list  -> { roadmaps: RoadmapSummary[] }
//
// The user comes from the Authorization header, never from the query string —
// this route used to accept ?user_id= and return whoever was named.
//
// Fails soft: a paused/unreachable Supabase project returns an empty list, never 5xx.

import { NextResponse } from "next/server";
import { listRoadmapStates } from "@/app/api/supabase/roadmap-state";
import { requireUser } from "@/lib/apiAuth";

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const roadmaps = await listRoadmapStates(who.userId);
  return NextResponse.json({ roadmaps });
}
