// POST /api/lesson/review — explain why a learner's PASSING submission is correct.
//   Body: { pointTitle, language, moduleId?, objectives: string[], code, output } -> { message }
//
// Posted when every objective passes, before the learner moves on (they choose when,
// with the Next lesson button). The grade is already decided by deterministic checks;
// this only explains the learner's own code back to them: what each part does and
// why it meets each objective, so the win is something understood, not just a green
// tick. Their code is quoted freely — the exercise is solved, there is nothing left
// to give away.

import { NextResponse } from "next/server";
import { geminiText } from "@/lib/agents/llm";
import { getDocSource } from "@/lib/docs";
import { canonicalDocTerm, validateDocLinks } from "@/lib/docs-index";
import { findDocPages, linkInlineCode } from "@/lib/docSearch";
import { userOrTrial } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const { pointTitle, language, moduleId, objectives, code, output } = await request.json();
    const goals = (Array.isArray(objectives) ? objectives : []).map((o) => `- ${String(o)}`).join("\n");
    const docSrc = getDocSource(moduleId);
    const prompt =
      `You are a ${language ?? ""} tutor. The learner just completed the lesson "${pointTitle ?? "this exercise"}" — ` +
      `every objective passed, checked by deterministic tests. Do not re-grade it.\n\n` +
      `OBJECTIVES:\n${goals}\n\nTHEIR CODE:\n${String(code ?? "").slice(0, 6000)}\n\n` +
      `RUN OUTPUT:\n${String(output ?? "").trim().slice(0, 2000) || "(no output)"}\n\n` +
      `Explain why THEIR code is correct, so they understand what they just did before moving on:\n` +
      `- Walk through the parts of their code that meet each objective: quote the relevant line(s) in a short fenced block, ` +
      `then say in a sentence or two what it does and why that satisfies the objective.\n` +
      `- Name the concept the lesson taught and how their code shows it, in one or two sentences.\n` +
      `- If something in their code works but has a cleaner or more idiomatic form, mention it in one sentence, without rewriting their program.\n` +
      `No new task, no question, no pleasantries ("Great job!"), no headings. Under 180 words. Plain Markdown.` +
      (docSrc?.kind === "devdocs"
        ? ` Where you name a concept, keyword or API, link it inline as [text](<doc:NAME>) with its ${docSrc.label} documentation name.`
        : "");
    const draft = (await geminiText(prompt)).trim();
    const checked = await validateDocLinks(draft, moduleId, {
      context: String(pointTitle ?? ""),
      findPages: (refs) => findDocPages(moduleId, refs),
    });
    const message = await linkInlineCode(checked, moduleId, (t) => canonicalDocTerm(moduleId, t));
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[lesson/review] error:", e);
    return NextResponse.json({ message: "" }, { status: 200 });
  }
}
