// POST /api/lesson/fix-checks — regenerate the machine checks a clean-running reference
// solution FAILS. If the solution executes without errors but a deterministic check still
// rejects it, the check is wrong (typically an invented constant that doesn't match the
// exercise's real data) and the objective is unpassable for the learner too. New checks
// are grounded on the solution's actual run output.
//   Body: { objectives, failingIds, solution, solutionOutput, language }
//   -> { objectives: Objective[] | null, ok: boolean }

import { NextResponse } from "next/server";
import { fixChecks, type Objective } from "@/lib/agents/lesson";

export async function POST(request: Request) {
  try {
    const { objectives, failingIds, solution, solutionOutput, language } = await request.json();
    if (!Array.isArray(objectives) || !Array.isArray(failingIds) || !solution) {
      return NextResponse.json(
        { error: "objectives, failingIds and solution are required" },
        { status: 400 }
      );
    }
    const fixed = await fixChecks({
      objectives: objectives as Objective[],
      failingIds: failingIds.map(String),
      solution: String(solution),
      solutionOutput: String(solutionOutput ?? ""),
      language: String(language ?? "JavaScript"),
    });
    return NextResponse.json({ objectives: fixed, ok: !!fixed });
  } catch (e) {
    console.error("[lesson/fix-checks] error:", e);
    return NextResponse.json({ objectives: null, ok: false }, { status: 200 });
  }
}
