// Lesson agent (snowflake L4, step 1).
//
// buildLesson:        grounded (real docs) -> teaching intro + starter code + a FIXED,
//                     finite set of checkable objectives that define "complete".
// evaluateSubmission: structured grading of the learner's code/output against ONLY
//                     those objectives (booleans, not free prose) — this is what stops
//                     the lesson from running forever.

import { groundedText, extractJSON } from "./snowflake";
import { geminiJSON } from "./llm";

export type Objective = { id: string; description: string };
export type Lesson = {
  intro: string;
  starterCode: string;
  html: string; // HTML scaffold for DOM lessons (empty for pure-logic lessons)
  objectives: Objective[];
  sources?: string[];
};
export type EvalResult = { id: string; passed: boolean; feedback: string };
export type Evaluation = { results: EvalResult[]; message: string };

// APIs/patterns that break self-containment in the browser sandbox.
const FORBIDDEN: { re: RegExp; name: string }[] = [
  { re: /\brequire\s*\(/, name: "require()" },
  { re: /^\s*import\s+/m, name: "import" },
  { re: /\bmodule\.exports\b/, name: "module.exports" },
  { re: /\bprocess\.[a-zA-Z]/, name: "process.*" },
  { re: /\bfetch\s*\(/, name: "fetch()" },
  { re: /\b__dirname\b/, name: "__dirname" },
  { re: /\bfs\.(readFile|writeFile|readFileSync|writeFileSync)/, name: "fs.*" },
  { re: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
];

// Remove comments and string contents so we only scan EXECUTABLE code — an educational
// comment like "in Node you'd use process.argv" must not count as a violation.
function scrub(code: string): string {
  let out = "";
  let s: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  for (let i = 0; i < code.length; i++) {
    const c = code[i], c2 = code[i + 1];
    if (s === "code") {
      if (c === "/" && c2 === "/") { s = "line"; i++; continue; }
      if (c === "/" && c2 === "*") { s = "block"; i++; continue; }
      if (c === "'") { s = "sq"; continue; }
      if (c === '"') { s = "dq"; continue; }
      if (c === "`") { s = "tpl"; continue; }
      out += c;
    } else if (s === "line") {
      if (c === "\n") { s = "code"; out += "\n"; }
    } else if (s === "block") {
      if (c === "*" && c2 === "/") { s = "code"; i++; }
    } else {
      // inside a string literal
      if (c === "\\") { i++; continue; }
      if ((s === "sq" && c === "'") || (s === "dq" && c === '"') || (s === "tpl" && c === "`")) s = "code";
    }
  }
  return out;
}

function selfContainmentViolations(code: string): string[] {
  const scrubbed = scrub(code);
  return FORBIDDEN.filter((f) => f.re.test(scrubbed)).map((f) => f.name);
}

type RawLesson = { intro?: string; starterCode?: string; html?: string; objectives?: { id?: string; description?: string }[] };

function mkLesson(data: RawLesson, sources: string[]): Lesson {
  return {
    intro: String(data.intro ?? "").trim(),
    starterCode: String(data.starterCode ?? "").trim() || "// Write your code here",
    html: String(data.html ?? "").trim(),
    sources,
    objectives: (Array.isArray(data.objectives) ? data.objectives : []).slice(0, 5).map((o, i) => ({
      id: String(o?.id || `o${i + 1}`),
      description: String(o?.description ?? "").trim(),
    })),
  };
}

export async function buildLesson(input: {
  skill: string;
  level?: string;
  goal?: string;
  pointTitle: string;
  pointSummary?: string;
}): Promise<Lesson | null> {
  const { skill, level, goal, pointTitle, pointSummary } = input;

  const prompt =
    `Using REAL, current official documentation and best practices for "${skill}", ` +
    `create a focused, hands-on micro-lesson for the learning point "${pointTitle}"` +
    (pointSummary ? ` (${pointSummary})` : "") +
    `.\nLearner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    `The learner edits and runs JavaScript in an in-app editor (output via console.log).\n\n` +
    `Return ONLY JSON: {"intro": string, "starterCode": string, "html": string, "objectives": [{"id": string, "description": string}]}.\n\n` +
    `SELF-CONTAINMENT (most important): the exercise MUST run to completion in a plain browser JavaScript sandbox with NOTHING external. When the learner writes the CORRECT answer, running it must succeed and print console output that proves every objective.\n` +
    `- NO require(), NO import, NO Node.js APIs (module, process, fs, http, path, etc.).\n` +
    `- NO network requests / fetch to external URLs, and NO external files or assets.\n` +
    `- Everything the code needs (sample data, inputs, and for DOM lessons the HTML) must be declared INSIDE the exercise itself (starterCode / html).\n` +
    `- PREFER plain self-contained JavaScript with console.log to show results. Only involve the DOM when the point is specifically about the DOM — and then put the COMPLETE HTML in "html" (self-contained, never assume external markup).\n` +
    `- Each objective must be verifiable by reading the console output after the correct code runs.\n` +
    `- For topics that would normally need the network or files (APIs, file I/O), SIMULATE the data with hardcoded in-exercise values (e.g. a const array standing in for an API response) — never perform real I/O.\n\n` +
    `CONSISTENCY RULES — the fields MUST fit together:\n` +
    `1. "html": If this point involves the DOM / web-page elements, provide a small HTML snippet containing the ACTUAL elements the objectives and starterCode reference, with the EXACT ids/classes/tags used (e.g. <div id="main-container">, <p class="greeting">...). The learner's JavaScript runs against THIS html in a real browser DOM and a live Preview is shown. If the point does NOT involve the DOM, set "html" to an empty string "".\n` +
    `2. "starterCode" is the EXACT code in the learner's editor. It MUST already DECLARE, with sensible initial values, every variable/function any objective refers to (for DOM lessons, the selectors must match elements that exist in "html"), and use comments to mark where the learner adds code.\n` +
    `3. "intro": concise markdown teaching text, instructional voice, no pleasantries. It must describe the ACTUAL starterCode/html the learner sees. Do NOT show an unrelated code example — any code in the intro must be part of starterCode/html.\n` +
    `4. "objectives": 2 to 4 CONCRETE, CHECKABLE tasks the learner completes by EDITING the starterCode. Each MUST only reference identifiers/elements that already exist in starterCode/html, and be verifiable from the code and its console output. No vague or stylistic objectives.`;

  // Generate, then enforce self-containment: if the exercise uses forbidden APIs,
  // regenerate once with the violation called out (deterministic guard, not just prompt).
  let last: Lesson | null = null;
  let viols: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const extra = viols.length
      ? `\n\nCRITICAL FIX: your previous attempt used FORBIDDEN APIs (${viols.join(", ")}) that do NOT work in this sandbox. ` +
        `Rewrite the exercise to be 100% self-contained:\n` +
        `- Replace any fetch / XMLHttpRequest / network call with a hardcoded const holding sample response data ` +
        `(e.g. const apiResponse = [{ id: 1, name: "Ada" }];) and have the learner process THAT, not a real request.\n` +
        `- Replace any file/Node API (fs, process, require, import, __dirname) with plain in-exercise JavaScript.\n` +
        `- The code must run with only console.log output — no external calls of any kind.`
      : "";
    const { text, sources } = await groundedText(prompt + extra);
    const data = extractJSON(text);
    if (!data || !Array.isArray(data.objectives) || data.objectives.length === 0) continue;
    last = mkLesson(data, sources);
    viols = selfContainmentViolations(last.starterCode + "\n" + last.html);
    if (viols.length === 0) break;
  }

  // Final guarantee: if still not self-contained, a fast targeted rewrite of just the code.
  if (last && selfContainmentViolations(last.starterCode + "\n" + last.html).length) {
    const fix = await geminiJSON<{ starterCode?: string; html?: string }>(
      `Rewrite this exercise to run in a PLAIN BROWSER JavaScript sandbox with NO Node APIs, NO require/import, ` +
        `NO fetch/XMLHttpRequest/network, and NO files. Simulate any external data with hardcoded in-exercise values. ` +
        `Keep it solvable for these objectives: ${last.objectives.map((o) => o.description).join("; ")}.\n` +
        `Return ONLY JSON {"starterCode": string, "html": string}.\n\n` +
        `CODE:\n${last.starterCode}\n\nHTML:\n${last.html}`
    );
    if (fix?.starterCode) {
      const cleaned: Lesson = {
        ...last,
        starterCode: String(fix.starterCode).trim(),
        html: String(fix.html ?? last.html).trim(),
      };
      if (selfContainmentViolations(cleaned.starterCode + "\n" + cleaned.html).length === 0) last = cleaned;
    }
  }

  return last;
}

export async function evaluateSubmission(input: {
  pointTitle: string;
  objectives: Objective[];
  code: string;
  output: string;
  alreadyPassed?: string[];
}): Promise<Evaluation> {
  const { pointTitle, objectives, code, output, alreadyPassed = [] } = input;
  const list = objectives.map((o) => `- [${o.id}] ${o.description}`).join("\n");

  const prompt =
    `You are grading a learner's submission against a FIXED set of objectives for the point "${pointTitle}". ` +
    `Judge ONLY these objectives. Do NOT invent new requirements or demand stylistic changes beyond them.\n` +
    `OBJECTIVES:\n${list}\n` +
    `Already satisfied in earlier attempts (these stay true): ${alreadyPassed.join(", ") || "none"}\n\n` +
    `LEARNER CODE:\n${code}\n\nCONSOLE OUTPUT:\n${output || "(no output)"}\n\n` +
    `For each objective decide whether THIS submission satisfies it. Return ONLY JSON: ` +
    `{"results":[{"id":string,"passed":boolean,"feedback":string}],"message":string}. ` +
    `feedback: one short instructional sentence per objective. ` +
    `message: one or two sentences guiding the learner toward the next UNMET objective, ` +
    `or a brief wrap if all are met. Clear teaching language, no pleasantries.`;

  const data = await geminiJSON<{ results?: EvalResult[]; message?: string }>(prompt);
  const results: EvalResult[] = Array.isArray(data?.results)
    ? data!.results.map((r) => ({ id: String(r.id), passed: !!r.passed, feedback: String(r.feedback || "") }))
    : objectives.map((o) => ({ id: o.id, passed: false, feedback: "" }));

  return { results, message: String(data?.message || "").trim() };
}
