// POST /api/lesson/guide — pedagogical guidance for a submission that DIDN'T fully pass.
// Deterministic grading already decided pass/fail (see grade.ts); this call only asks
// the LLM to diagnose the knowledge gap and guide toward the next unmet objective. It is
// fed the authoritative results and must NOT re-judge them.
//   Body: { pointTitle, language, code, output, results: [{id, description, passed, detail}] }
//   -> { message: string }

import { NextResponse } from "next/server";
import { geminiText } from "@/lib/agents/llm";
import { getDocSource } from "@/lib/docs";
import { userOrTrial } from "@/lib/apiAuth";

type Item = { id: string; description: string; passed: boolean; detail?: string };

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const { pointTitle, language, code, output, results, moduleId } = await request.json();
    const items: Item[] = Array.isArray(results) ? results : [];
    if (items.length === 0) return NextResponse.json({ message: "" });

    const lines = items
      .map((r) => `- [${r.passed ? "PASS" : "FAIL"}] ${r.description}${r.passed ? "" : r.detail ? ` (why: ${r.detail})` : ""}`)
      .join("\n");

    // For DevDocs-backed modules, ask the model to inline-link the doc for the exact gap.
    const docSrc = getDocSource(moduleId);
    const docLinks =
      docSrc?.kind === "devdocs"
        ? ` Where you name the specific API/method/concept that would fix the gap, hyperlink it inline as [text](<doc:CANONICAL_NAME>) — ALWAYS wrap the target in angle brackets <...> — using its official ${docSrc.label} name (e.g. [\`map()\`](<doc:Array.prototype.map>)) — exactly one such link, on the key reference.`
        : "";

    const prompt =
      `You are a ${language ?? ""} tutor helping a learner on "${pointTitle ?? "this exercise"}". ` +
      `Deterministic checks have ALREADY decided which objectives pass or fail — treat this as ground truth and NEVER contradict it or claim an objective passed/failed differently.\n\n` +
      `OBJECTIVE RESULTS:\n${lines}\n\n` +
      `THEIR CODE:\n${code ?? ""}\n\nRUN OUTPUT:\n${(output ?? "").trim() || "(no output)"}\n\n` +
      `HOW GRADING WORKS — do not misstate it: a check looks for its expected line(s) INSIDE the run output, so extra printing NEVER causes a failure. ` +
      `Never tell the learner to remove a console statement, to print less, or that their output has something "extra" — that is not why anything failed, and following it costs them an objective they had already passed. ` +
      `Objectives are graded independently and stay passed once passed; the only useful advice is what to ADD or CHANGE for a FAILED one.\n\n` +
      `Write 1–3 sentences of guidance: pinpoint the specific gap behind the FIRST failed objective and nudge them toward fixing it, using the failure details. ` +
      `Then ALWAYS include a short fenced example showing the syntax pattern they need — on DIFFERENT, unrelated data: different table/variable/function names and values than this exercise uses. ` +
      `NEVER include the exact code/expression/statement that satisfies an objective, and never the exercise's own identifiers combined into the answer. ` +
      `The test is mechanical: if substituting their identifiers into your snippet would produce the answer, change the example's shape until it wouldn't. No pleasantries, no restating what passed.` +
      docLinks;

    const message = (await geminiText(prompt)).trim();
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[lesson/guide] error:", e);
    return NextResponse.json({ message: "" }, { status: 200 });
  }
}
