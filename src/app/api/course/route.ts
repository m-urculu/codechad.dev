// Course management actions used by the course settings view.
//   POST /api/course { action: "duplicate", course_id }  -> { ok, course_id }
//   POST /api/course { action: "reset",     user_id, course_id }  -> { ok }
//   POST /api/course { action: "rename",    user_id, course_id, name } -> { ok }
//   POST /api/course { action: "autoname",  user_id, course_id, name } -> { ok, name }
//   POST /api/course { action: "recalibrate", user_id, course_id, level, goal } -> { ok }
//   POST /api/course { action: "saveTopics",  user_id, course_id, topics: [{id?,title}] } -> { ok }
//
// "recalibrate" only rewrites the calibration and clears the tree/progress; the
// client then regenerates the roadmap through the normal generation flow, so
// there is one code path that builds curricula.
//
// Fail-soft, in line with the rest of the persistence layer.

import { NextResponse } from "next/server";
import {
  applyGeneratedName,
  duplicateCourse,
  loadRoadmapState,
  resetCourseProgress,
  saveRoadmapState,
} from "@/app/api/supabase/roadmap-state";
import { requireUser } from "@/lib/apiAuth";

type TopicEdit = { id?: string; title: string };
type Node = { id?: string; title?: string; kind?: string; children?: Node[] | null };

// Every node id reachable in a tree — used to drop progress belonging to topics the
// learner removed, so completed counts don't drift above the lesson total.
function collectIds(nodes: Node[] | undefined | null, out: Set<string> = new Set()): Set<string> {
  for (const n of nodes ?? []) {
    if (n?.id) out.add(n.id);
    if (Array.isArray(n?.children)) collectIds(n.children, out);
  }
  return out;
}

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { action, course_id, name, level, goal, topics } = await request.json();
    const user_id = who.userId;
    if (!course_id) {
      return NextResponse.json({ error: "course_id is required" }, { status: 400 });
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
      // The title the generator produced, offered as the course's name. Applied
      // only if the learner never named it themselves — see applyGeneratedName.
      case "autoname": {
        const proposed = String(name ?? "").trim();
        if (!proposed) {
          return NextResponse.json({ error: "name is required" }, { status: 400 });
        }
        const applied = await applyGeneratedName(user_id, course_id, proposed.slice(0, 80));
        return NextResponse.json({ ok: !!applied, name: applied });
      }
      case "recalibrate": {
        // Emptying the tree is what makes the workspace regenerate on next open.
        // It must be [] rather than null — the column is NOT NULL, and the client
        // tests `tree?.topics?.length`, which an empty array fails just as well.
        const id = await saveRoadmapState(user_id, course_id, {
          level,
          goal,
          tree: [],
          progress: {},
        });
        return NextResponse.json({ ok: !!id });
      }
      // Apply an edited topic list verbatim — no model involved. Topics the learner
      // left alone keep their id, their generated children and their progress; a
      // renamed or newly added topic gets children: null so it regenerates lazily
      // on first expand.
      case "saveTopics": {
        const edits: TopicEdit[] = Array.isArray(topics) ? topics : [];
        const clean = edits
          .map((t) => ({ id: t?.id, title: String(t?.title ?? "").trim() }))
          .filter((t) => t.title)
          .slice(0, 20);
        if (!clean.length) {
          return NextResponse.json({ error: "at least one topic is required" }, { status: 400 });
        }
        const course = await loadRoadmapState(user_id, course_id);
        if (!course) return NextResponse.json({ ok: false }, { status: 200 });

        const tree = (course.tree ?? {}) as { topics?: Node[] } & Record<string, unknown>;
        const existing = new Map((tree.topics ?? []).map((t) => [t.id, t]));

        const nextTopics: Node[] = clean.map((t, i) => {
          const prev = t.id ? existing.get(t.id) : undefined;
          if (prev && prev.title === t.title) return prev; // untouched: keep everything
          if (prev) return { ...prev, title: t.title, children: null }; // renamed: rebuild below
          return {
            id: `t${Date.now().toString(36)}${i}`,
            kind: "topic",
            title: t.title,
            children: null,
          };
        });

        const kept = collectIds(nextTopics);
        const progress = Object.fromEntries(
          Object.entries(course.progress ?? {}).filter(([id]) => kept.has(id))
        );

        const id = await saveRoadmapState(user_id, course_id, {
          tree: { ...tree, topics: nextTopics },
          progress,
        });
        return NextResponse.json({ ok: !!id, topics: nextTopics.length });
      }

      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[course] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
