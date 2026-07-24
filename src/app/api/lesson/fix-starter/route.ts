// POST /api/lesson/fix-starter — regenerate a lesson's STARTER code so the exercise has a
// real gap: the learner must write code to satisfy the objectives. Used when the client
// (or server) finds the generated starter already passes every check on its own, so there
// is nothing to do. Keeps declarations; replaces the answer lines with TODO comments.
//   Body: { objectives, starterCode, solution, html?, language }
//   -> { starterCode: string | null, ok: boolean }

import { NextResponse } from "next/server";
import { fixStarter } from "@/lib/agents/lesson";

type Obj = { id: string; description: string };

export async function POST(request: Request) {
  try {
    const { objectives, starterCode, solution, html, language } = await request.json();
    if (!Array.isArray(objectives) || !starterCode) {
      return NextResponse.json({ error: "objectives and starterCode are required" }, { status: 400 });
    }
    const fixed = await fixStarter({
      objectives: objectives as Obj[],
      starterCode: String(starterCode),
      solution: String(solution ?? ""),
      html: html ? String(html) : undefined,
      language: String(language ?? "JavaScript"),
    });
    return NextResponse.json({ starterCode: fixed, ok: !!fixed });
  } catch (e) {
    console.error("[lesson/fix-starter] error:", e);
    return NextResponse.json({ starterCode: null, ok: false }, { status: 200 });
  }
}
