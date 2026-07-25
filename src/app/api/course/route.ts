// Course management actions used by the course settings view.
//   POST /api/course { action: "duplicate", user_id, course_id }  -> { ok, course_id }
//   POST /api/course { action: "reset",     user_id, course_id }  -> { ok }
//   POST /api/course { action: "rename",    user_id, course_id, name } -> { ok }
//   POST /api/course { action: "recalibrate", user_id, course_id, level, goal } -> { ok }
//
// "recalibrate" only rewrites the calibration and clears the tree/progress; the
// client then regenerates the roadmap through the normal generation flow, so
// there is one code path that builds curricula.
//
// Fail-soft, in line with the rest of the persistence layer.

import { NextResponse } from "next/server";
import {
  duplicateCourse,
  resetCourseProgress,
  saveRoadmapState,
} from "@/app/api/supabase/roadmap-state";

export async function POST(request: Request) {
  try {
    const { action, user_id, course_id, name, level, goal } = await request.json();
    if (!user_id || !course_id) {
      return NextResponse.json({ error: "user_id and course_id are required" }, { status: 400 });
    }

    switch (action) {
      case "duplicate": {
        const id = await duplicateCourse(user_id, course_id);
        return NextResponse.json({ ok: !!id, course_id: id });
      }
      case "reset": {
        const ok = await resetCourseProgress(user_id, course_id);
        return NextResponse.json({ ok });
      }
      case "rename": {
        const trimmed = String(name ?? "").trim();
        if (!trimmed) {
          return NextResponse.json({ error: "name is required" }, { status: 400 });
        }
        const id = await saveRoadmapState(user_id, course_id, { name: trimmed.slice(0, 80) });
        return NextResponse.json({ ok: !!id });
      }
      case "recalibrate": {
        // Clearing the tree is what makes the workspace regenerate on next open.
        const id = await saveRoadmapState(user_id, course_id, {
          level,
          goal,
          tree: null,
          progress: {},
        });
        return NextResponse.json({ ok: !!id });
      }
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[course] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
