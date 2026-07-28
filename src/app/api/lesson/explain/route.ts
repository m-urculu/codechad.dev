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

// The prompt forbids a greeting; the model obeys most of the time, which is not
// the same as always. A recap that opens "Welcome back!" undoes the point of this
// endpoint — the learner has already been told they are back, by the "Resuming X"
// line posted a moment earlier, and reading it twice makes the tutor sound like it
// has lost the thread. Cheaper to remove than to keep re-wording the instruction.
const GREETING =
  /^\s*(welcome back|good to (?:see|have) you(?: back)?|hi there|hello there|hey there|hi|hello|hey|let['’]s continue|great to see you)\b[^.!?\n]*[.!?,]?\s*/i;

function stripGreeting(text: string): string {
  const cut = text.replace(GREETING, "");
  // Never return nothing: if the greeting WAS the whole message, keep the original
  // rather than posting an empty recap.
  if (!cut.trim()) return text;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

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
      `Start with the recap itself: NEVER open with a greeting — no "Welcome back", no "Hi", no "Let's continue" — and use no headings. ` +
      `Then, where the next objective needs a specific pattern, add ONE short fenced example of that pattern on DIFFERENT, unrelated data — different variable/table/function names and values than this lesson uses — so it shows the shape without being the answer. ` +
      `Never write the code that satisfies an objective, and never use this exercise's own identifiers in the example.` +
      (getDocSource(moduleId)?.kind === "devdocs"
        ? ` Where you name a specific API/method/concept needed for the next objective, hyperlink it inline as [text](<doc:CANONICAL_NAME>) — ALWAYS wrap the target in angle brackets <...> — using its official ${(getDocSource(moduleId) as { label: string }).label} name (e.g. [\`map()\`](<doc:Array.prototype.map>)); link only what's needed, inline in the sentence.`
        : "");

    const message = stripGreeting((await geminiText(prompt)).trim());
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[lesson/explain] error:", e);
    return NextResponse.json({ message: "" }, { status: 200 });
  }
}
