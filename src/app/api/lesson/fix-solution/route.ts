// POST /api/lesson/fix-solution — regenerate a lesson's reference solution to fix a
// runtime error the client caught when running it, keeping the lesson unchanged.
//   Body: { objectives, starterCode, html?, solution, error, language }
//   -> { solution: string | null, ok: boolean }
//
// For JavaScript the corrected solution is re-run in a Node sandbox and re-fixed if it
// still throws, so JS fixes come back proven-clean. Other languages are re-validated
// by the caller in their own browser runtime.

import { NextResponse } from "next/server";
import { fixSolution, runJsInSandbox } from "@/lib/agents/lesson";

type Obj = { id: string; description: string };

export async function POST(request: Request) {
  try {
    const { objectives, starterCode, html, solution, error, language } = await request.json();
    if (!Array.isArray(objectives) || !solution) {
      return NextResponse.json({ error: "objectives and solution are required" }, { status: 400 });
    }
    const lang = String(language ?? "JavaScript");
    const isJs = /javascript|typescript/i.test(lang);

    let fixed = await fixSolution({
      objectives: objectives as Obj[],
      starterCode: String(starterCode ?? ""),
      html: html ? String(html) : undefined,
      solution: String(solution),
      error: String(error ?? ""),
      language: lang,
    });

    // For pure JS we can verify the fix server-side and loop until it runs clean.
    if (fixed && isJs && !html) {
      for (let i = 0; i < 2; i++) {
        const run = runJsInSandbox(fixed);
        if (run.ok) break;
        const again = await fixSolution({
          objectives: objectives as Obj[],
          starterCode: String(starterCode ?? ""),
          solution: fixed,
          error: run.error!,
          language: lang,
        });
        if (!again) break;
        fixed = again;
      }
    }

    return NextResponse.json({ solution: fixed, ok: !!fixed });
  } catch (e) {
    console.error("[lesson/fix-solution] error:", e);
    return NextResponse.json({ solution: null, ok: false }, { status: 200 });
  }
}
