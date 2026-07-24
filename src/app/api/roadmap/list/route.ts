// List a user's stored roadmaps for the "Continue learning" section.
//   GET /api/roadmap/list?user_id=..  -> { roadmaps: RoadmapSummary[] }
//
// Fails soft: a paused/unreachable Supabase project returns an empty list, never 5xx.

import { NextResponse } from "next/server";
import { listRoadmapStates } from "@/app/api/supabase/roadmap-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }
  const roadmaps = await listRoadmapStates(user_id);
  return NextResponse.json({ roadmaps });
}
