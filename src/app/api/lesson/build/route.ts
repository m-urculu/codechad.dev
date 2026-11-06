// POST /api/lesson/build — grounded lesson (intro + starter code + fixed objectives).
// Body: { skill, level?, goal?, pointTitle, pointSummary?, course_id?, pointId? } -> { lesson }

import { cleanHistory } from "@/lib/scaffold";
import { NextResponse } from "next/server";
import { buildLesson } from "@/lib/agents/lesson";
import { loadKnownSkills } from "@/app/api/supabase/skills";
import { loadSyntaxSeen } from "@/app/api/supabase/syntax";
import { mergeSeen, type SyntaxSeen } from "@/lib/syntax";
import { userOrTrial } from "@/lib/apiAuth";

/** The browser's syntax counts, bounded: it goes into a prompt. */
function cleanSeen(raw: unknown): SyntaxSeen {
  if (!raw || typeof raw !== "object") return {};
  const out: SyntaxSeen = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 300)) {
    const n = Number(v);
    if (k.length <= 40 && Number.isFinite(n) && n > 0) out[k] = Math.min(Math.floor(n), 99);
  }
  return out;
}

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const { skill, level, goal, pointTitle, pointSummary, moduleId, treeOutline, course_id, pointId, priorExercises, syntaxSeen: courseSeen, scaffold } =
      await request.json();
    if (!skill || !pointTitle) {
      return NextResponse.json({ error: "skill and pointTitle are required" }, { status: 400 });
    }
    const [known, syntaxSeen] = who.userId
      ? await Promise.all([
          loadKnownSkills(who.userId, course_id),
          // Rebuilding a lesson must not count its own earlier showing.
          loadSyntaxSeen(who.userId, String(moduleId ?? ""), pointId ? String(pointId) : undefined),
        ])
      : [[], {}];
    const lesson = await buildLesson({
      skill,
      level,
      goal,
      pointTitle,
      pointSummary,
      moduleId,
      treeOutline,
      known,
      // What the learner's account has seen (user_syntax), and what this course's own
      // lessons show they have — the second works even before that table exists.
      syntaxSeen: mergeSeen(syntaxSeen, cleanSeen(courseSeen)),
      // Bounded: it goes into a prompt, and the browser sends it.
      priorExercises: Array.isArray(priorExercises)
        ? priorExercises.slice(-12).map((e: unknown) => String(e).slice(0, 240))
        : undefined,
      scaffoldHistory: cleanHistory(scaffold),
    });
    if (!lesson) {
      return NextResponse.json({ error: "Could not build the lesson. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("[lesson/build] error:", error);
    return NextResponse.json({ error: "Lesson build error", details: String(error) }, { status: 500 });
  }
}
