// POST /api/lesson/guide — pedagogical guidance for a submission that DIDN'T fully pass.
// Deterministic grading already decided pass/fail (see grade.ts); this call only asks
// the LLM to diagnose the knowledge gap and guide toward the next unmet objective. It is
// fed the authoritative results and must NOT re-judge them.
//   Body: { pointTitle, language, code, output, results: [{id, description, passed, detail}] }
//   -> { message: string }

import { NextResponse } from "next/server";
import { geminiText } from "@/lib/agents/llm";
import { getDocSource } from "@/lib/docs";

type Item = { id: string; description: string; passed: boolean; detail?: string };

export async function POST(request: Request) {
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
      `Write 1–3 sentences of guidance: pinpoint the specific gap behind the FIRST failed objective and nudge them toward fixing it, using the failure details. Teach the concept, don't hand them the full answer. No pleasantries, no restating what passed.` +
      docLinks;

    const message = (await geminiText(prompt)).trim();
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[lesson/guide] error:", e);
    return NextResponse.json({ message: "" }, { status: 200 });
  }
}
