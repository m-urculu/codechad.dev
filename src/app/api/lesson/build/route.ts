// POST /api/lesson/build — grounded lesson (intro + starter code + fixed objectives).
// Body: { skill, level?, goal?, pointTitle, pointSummary? } -> { lesson }

import { NextResponse } from "next/server";
import { buildLesson } from "@/lib/agents/lesson";
import { requireUser } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { skill, level, goal, pointTitle, pointSummary, moduleId, treeOutline } = await request.json();
    if (!skill || !pointTitle) {
      return NextResponse.json({ error: "skill and pointTitle are required" }, { status: 400 });
    }
    const lesson = await buildLesson({ skill, level, goal, pointTitle, pointSummary, moduleId, treeOutline });
    if (!lesson) {
      return NextResponse.json({ error: "Could not build the lesson. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("[lesson/build] error:", error);
    return NextResponse.json({ error: "Lesson build error", details: String(error) }, { status: 500 });
  }
}
