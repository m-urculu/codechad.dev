// Roadmap state persistence.
//   GET  /api/roadmap/state?user_id=..&skill=..   -> { state }   (load)
//   POST /api/roadmap/state  { user_id, skill, level?, goal?, tree?, progress? } -> { ok }  (save)
//
// Fails soft: a paused/unreachable Supabase project returns null/ok:false, never 5xx,
// so the in-memory experience keeps working.

import { NextResponse } from "next/server";
import { loadRoadmapState, saveRoadmapState } from "@/app/api/supabase/roadmap-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const skill = searchParams.get("skill");
  if (!user_id || !skill) {
    return NextResponse.json({ error: "user_id and skill are required" }, { status: 400 });
  }
  const state = await loadRoadmapState(user_id, skill);
  return NextResponse.json({ state });
}

export async function POST(request: Request) {
  try {
    const { user_id, skill, level, goal, tree, progress } = await request.json();
    if (!user_id || !skill) {
      return NextResponse.json({ error: "user_id and skill are required" }, { status: 400 });
    }
    const ok = await saveRoadmapState(user_id, skill, { level, goal, tree, progress });
    return NextResponse.json({ ok });
  } catch (error) {
    console.error("[roadmap/state] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
