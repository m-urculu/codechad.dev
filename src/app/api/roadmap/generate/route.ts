// POST /api/roadmap/generate — L1 grounded overview.
// Body: { skill, level?, goal?, moduleId?, course_id?, draftTopics?, guidance? }
//   -> Roadmap (topics only; children lazy)
//
// When user_id + moduleId are supplied, the learner's OTHER courses for the same
// technology are folded in as "already covered" context, so a second Python course
// builds on the first rather than repeating its fundamentals.

import { NextResponse } from "next/server";
import { generateOverview } from "@/lib/agents/snowflake";
import { getRuntime, RUNTIMES } from "@/lib/runtimes/registry";
import { siblingCourses } from "@/app/api/supabase/roadmap-state";
import { loadKnownSkills } from "@/app/api/supabase/skills";
import { userOrTrial } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;


  try {
    const { skill, level, goal, moduleId, course_id, draftTopics, guidance, modules } =
      await request.json();
    if (!skill || typeof skill !== "string") {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    // A course that SPANS runtimes (a career path being regenerated) tells the
    // generator which ones it may tag topics with. Unknown ids are dropped here
    // rather than offered to the model, which would then hand back a module the
    // editor cannot open.
    const spanModules = (Array.isArray(modules) ? modules : [])
      .map(String)
      .filter((id) => id in RUNTIMES)
      .map((id) => ({ id, title: RUNTIMES[id].title, langName: RUNTIMES[id].langName }));
    const runtimeNotes = moduleId ? getRuntime(moduleId).runNotes : undefined;
    // Trial visitors have no other courses to build on, by definition.
    const siblings =
      who.userId && moduleId ? await siblingCourses(who.userId, moduleId, course_id) : [];
    // What they have actually finished, in every course including other technologies.
    // Excludes THIS course: regenerating a course must not be told its own topics are
    // already covered, or it has nothing left to build.
    const known = who.userId ? await loadKnownSkills(who.userId, course_id) : [];
    const roadmap = await generateOverview({
      skill,
      level,
      goal,
      runtimeNotes,
      siblings,
      known,
      moduleId,
      draftTopics: Array.isArray(draftTopics)
        ? draftTopics.map(String).filter(Boolean).slice(0, 20)
        : undefined,
      guidance: typeof guidance === "string" ? guidance : undefined,
      modules: spanModules.length ? spanModules : undefined,
    });
    if (!roadmap) {
      return NextResponse.json({ error: "Could not generate the roadmap. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ roadmap });
  } catch (error) {
    console.error("[roadmap/generate] error:", error);
    return NextResponse.json({ error: "Roadmap generation error", details: String(error) }, { status: 500 });
  }
}
