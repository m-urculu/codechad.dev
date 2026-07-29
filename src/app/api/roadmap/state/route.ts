// Roadmap state persistence, keyed by course_id.
//   GET    /api/roadmap/state?course_id=..                       -> { state }
//   POST   /api/roadmap/state { course_id?, skill?, module?, name?, level?, goal?, tree?, progress? }
//                                                                -> { ok, course_id }
//   DELETE /api/roadmap/state?course_id=..                       -> { ok }
//
// The user is resolved from the Authorization header; a user_id in the request
// is ignored.
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
import { syncCourseSkills } from "@/app/api/supabase/skills";
import { requireUser } from "@/lib/apiAuth";
import { canCreateCourse, limitResponse } from "@/lib/billing";

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const { searchParams } = new URL(request.url);
  const course_id = searchParams.get("course_id");
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }
  const state = await loadRoadmapState(who.userId, course_id);
  return NextResponse.json({ state });
}

// Erases the course: roadmap, progress and its chat history.
export async function DELETE(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const { searchParams } = new URL(request.url);
  const course_id = searchParams.get("course_id");
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }
  const ok = await deleteRoadmapState(who.userId, course_id);
  return NextResponse.json({ ok });
}

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { course_id, skill, module: moduleId, name, level, goal, tree, progress } =
      await request.json();
    if (!course_id && !skill) {
      return NextResponse.json({ error: "skill is required when creating a course" }, { status: 400 });
    }
    // The free tier's ceiling, enforced where the row is actually made. Only on CREATE:
    // a user who is over the limit (because they subscribed, made ten courses, then let
    // the subscription lapse) must still be able to open, edit and finish the ones they
    // have. Locking someone out of work they already did would be a punishment, not a
    // limit — they simply cannot add an eleventh.
    if (!course_id) {
      const check = await canCreateCourse(who.userId);
      if (!check.allowed) return limitResponse(check);
    }
    // Creating: give the course a name that doesn't collide with an existing one,
    // so a second "Python" arrives as "Python (2)" rather than an identical card.
    const finalName = course_id ? name : await uniqueCourseName(who.userId, name || skill);
    const id = await saveRoadmapState(who.userId, course_id, {
      skill,
      module: moduleId,
      name: finalName,
      level,
      goal,
      tree,
      progress,
    });
    // Keep the skills ledger in step with what the learner just finished. This is
    // the one funnel every progress change flows through, which is why it is here
    // and not in the client: nothing has to remember to report a completion.
    //
    // Awaited rather than fired and forgotten — on a serverless runtime the
    // function can be frozen the moment the response is returned, so a floating
    // promise is a write that sometimes happens. It is one indexed delete plus one
    // upsert of a handful of short rows, against a save that is already debounced
    // to 800ms on the client.
    if (id && tree !== undefined && progress !== undefined) {
      await syncCourseSkills(who.userId, id, {
        tree,
        progress,
        module: moduleId,
        technology: skill,
        courseName: finalName,
      });
    }
    return NextResponse.json({ ok: !!id, course_id: id });
  } catch (error) {
    console.error("[roadmap/state] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
