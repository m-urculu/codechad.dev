// POST /api/lesson/explain — a progress-aware re-explanation of a RESUMED lesson.
// When a learner reopens a lesson they'd partially done, this recaps the topic on a
// technical level and orients them around what's already completed vs. what's left,
// so they can pick up with context instead of a cold "welcome back".
//   Body: { pointTitle, language, intro?, objectives: [{description, passed}], hasCode }
//   -> { message: string }

import { NextResponse } from "next/server";
import { geminiText } from "@/lib/agents/llm";
import { getDocSource } from "@/lib/docs";
import { userOrTrial } from "@/lib/apiAuth";

type Item = { description: string; passed: boolean };

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const { pointTitle, language, intro, objectives, hasCode, moduleId } = await request.json();
    const items: Item[] = Array.isArray(objectives) ? objectives : [];

    const done = items.filter((o) => o.passed);
    const todo = items.filter((o) => !o.passed);
    const doneLines = done.map((o) => `- ${o.description}`).join("\n") || "- (none yet)";
    const todoLines = todo.map((o) => `- ${o.description}`).join("\n") || "- (all objectives complete)";

    const prompt =
      `You are a ${language ?? ""} tutor. A learner is RESUMING the lesson "${pointTitle ?? "this exercise"}". ` +
      `Re-explain it so they can continue with full context — reference the topic on a practical, technical level.\n\n` +
      (intro ? `LESSON BRIEF (for your reference, don't quote verbatim):\n${String(intro).slice(0, 1500)}\n\n` : "") +
      `ALREADY COMPLETED objectives:\n${doneLines}\n\n` +
      `STILL REMAINING objectives:\n${todoLines}\n\n` +
      (hasCode ? `Their previous code has been restored in the editor.\n\n` : `They're starting from the scaffold code.\n\n`) +
      `Write a short recap (2–4 sentences): briefly restate what this lesson teaches technically, acknowledge what they've already done, ` +
      `then focus them on the NEXT remaining objective and the concept it exercises. If everything is complete, say so and suggest they can re-take or move on. ` +
      `No greetings like "welcome back", no headings, no code — just the recap.` +
      (getDocSource(moduleId)?.kind === "devdocs"
        ? ` Where you name a specific API/method/concept needed for the next objective, hyperlink it inline as [text](<doc:CANONICAL_NAME>) — ALWAYS wrap the target in angle brackets <...> — using its official ${(getDocSource(moduleId) as { label: string }).label} name (e.g. [\`map()\`](<doc:Array.prototype.map>)); link only what's needed, inline in the sentence.`
        : "");

    const message = (await geminiText(prompt)).trim();
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[lesson/explain] error:", e);
    return NextResponse.json({ message: "" }, { status: 200 });
  }
}
