// Roadmap state persistence, keyed by course_id.
//   GET    /api/roadmap/state?user_id=..&course_id=..            -> { state }
//   POST   /api/roadmap/state { user_id, course_id?, skill?, module?, name?, level?, goal?, tree?, progress? }
//                                                                -> { ok, course_id }
//   DELETE /api/roadmap/state?user_id=..&course_id=..            -> { ok }
//
// Fails soft: a paused/unreachable Supabase project returns null/ok:false, never 5xx,
// so the in-memory experience keeps working.

import { NextResponse } from "next/server";
import {
  deleteRoadmapState,
  loadRoadmapState,
  saveRoadmapState,
  uniqueCourseName,
} from "@/app/api/supabase/roadmap-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const course_id = searchParams.get("course_id");
  if (!user_id || !course_id) {
    return NextResponse.json({ error: "user_id and course_id are required" }, { status: 400 });
  }
  const state = await loadRoadmapState(user_id, course_id);
  return NextResponse.json({ state });
}

// Erases the course: roadmap, progress and its chat history.
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const course_id = searchParams.get("course_id");
  if (!user_id || !course_id) {
    return NextResponse.json({ error: "user_id and course_id are required" }, { status: 400 });
  }
  const ok = await deleteRoadmapState(user_id, course_id);
  return NextResponse.json({ ok });
}

export async function POST(request: Request) {
  try {
    const { user_id, course_id, skill, module: moduleId, name, level, goal, tree, progress } =
      await request.json();
    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }
    if (!course_id && !skill) {
      return NextResponse.json({ error: "skill is required when creating a course" }, { status: 400 });
    }
    // Creating: give the course a name that doesn't collide with an existing one,
    // so a second "Python" arrives as "Python (2)" rather than an identical card.
    const finalName = course_id ? name : await uniqueCourseName(user_id, name || skill);
    const id = await saveRoadmapState(user_id, course_id, {
      skill,
      module: moduleId,
      name: finalName,
      level,
      goal,
      tree,
      progress,
    });
    return NextResponse.json({ ok: !!id, course_id: id });
  } catch (error) {
    console.error("[roadmap/state] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
