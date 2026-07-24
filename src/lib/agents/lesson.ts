// Lesson agent (snowflake L4).
//
// buildLesson:        grounded (real docs) -> teaching intro + starter code + a FIXED,
//                     finite set of checkable objectives that define "complete".
//                     Language/runtime-aware: prompts, self-containment rules and
//                     comment/string scrubbing all come from the module's RuntimeSpec.
// evaluateSubmission: structured grading of the learner's code/output against ONLY
//                     those objectives (booleans, not free prose) — this is what stops
//                     the lesson from running forever.

import { groundedText, extractJSON } from "./snowflake";
import { geminiJSON } from "./llm";
import { gradeSubmission } from "./grade";
import { getRuntime, type RuntimeSpec, type ForbidLang } from "@/lib/runtimes/registry";
import { getDocSource } from "@/lib/docs";

// A deterministic, programmatic check for one objective. Grading runs these — the LLM
// is only used afterward for guidance, never to decide pass/fail.
//   stdout_equals   : normalized run output === value
//   stdout_includes : normalized run output contains value (good for interaction after
//                     a synthetic event, or a specific printed line)
//   code_matches    : value (a regexp source) matches the learner's code (for "how"
//                     objectives — use a construct, add a listener, etc.)
export type ObjectiveCheck =
  | { type: "stdout_equals"; value: string }
  | { type: "stdout_includes"; value: string }
  | { type: "code_matches"; value: string };
export type Objective = { id: string; description: string; check?: ObjectiveCheck };
export type Lesson = {
  intro: string;
  starterCode: string;
  html: string; // HTML scaffold for DOM/Preview lessons (empty otherwise)
  objectives: Objective[];
  solution?: string;   // complete correct code; validated so the exercise is solvable
  sources?: string[];
};
export type EvalResult = { id: string; passed: boolean; feedback: string };
export type Evaluation = { results: EvalResult[]; message: string };

// ---------- self-containment: per-language forbidden APIs ----------

type Rule = { re: RegExp; name: string };

const FORBIDDEN_BY_LANG: Record<ForbidLang, Rule[]> = {
  js: [
    { re: /\brequire\s*\(/, name: "require()" },
    { re: /^\s*import\s+/m, name: "import" },
    { re: /\bmodule\.exports\b/, name: "module.exports" },
    { re: /\bprocess\.[a-zA-Z]/, name: "process.*" },
    { re: /\bfetch\s*\(/, name: "fetch()" },
    { re: /\b__dirname\b/, name: "__dirname" },
    { re: /\bfs\.(readFile|writeFile|readFileSync|writeFileSync)/, name: "fs.*" },
    { re: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
  ],
  python: [
    { re: /\bimport\s+(requests|urllib|socket|subprocess|http\b)/, name: "network/process import" },
    { re: /\bfrom\s+(requests|urllib|socket|subprocess|http)\b/, name: "network/process import" },
    { re: /\bos\.(system|popen|exec)/, name: "os.system/popen" },
  ],
  sql: [
    { re: /\bATTACH\b/i, name: "ATTACH" },
    { re: /\bCOPY\b[\s\S]{0,80}\bFROM\b/i, name: "COPY ... FROM" },
    { re: /\bread_(csv|parquet|json)\s*\(\s*'(https?|s3|\/)/i, name: "file/URL read" },
    { re: /\bpg_read_file\b/i, name: "pg_read_file" },
  ],
  ruby: [
    { re: /\bNet::HTTP\b/, name: "Net::HTTP" },
    { re: /\brequire\s+['"](net\/http|socket|open-uri|open3)['"]/, name: "network require" },
    { re: /\bsystem\s*\(/, name: "system()" },
    { re: /`/, name: "shell backticks" },
  ],
  lua: [
    { re: /\brequire\s*[("']/, name: "require" },
    { re: /\bio\.(open|read|write|lines)\b/, name: "io.*" },
    { re: /\bos\.(execute|remove|rename)\b/, name: "os.execute" },
  ],
  php: [
    { re: /\bcurl_\w+\s*\(/, name: "curl_*" },
    { re: /\b(file_get_contents|fopen)\s*\(\s*['"]https?:/, name: "remote file_get_contents/fopen" },
    { re: /\b(exec|shell_exec|system|passthru|proc_open)\s*\(/, name: "exec/shell" },
  ],
  none: [],
};

// Comment/string syntax per language so we only scan EXECUTABLE code — an educational
// comment like "in Node you'd use process.argv" must not count as a violation.
type Syntax = { line: string[]; block: [string, string][]; strings: string[] };
const SYNTAX_BY_LANG: Record<ForbidLang, Syntax> = {
  js: { line: ["//"], block: [["/*", "*/"]], strings: ["'", '"', "`"] },
  python: { line: ["#"], block: [['"""', '"""'], ["'''", "'''"]], strings: ["'", '"'] },
  sql: { line: ["--"], block: [["/*", "*/"]], strings: ["'"] },
  ruby: { line: ["#"], block: [["=begin", "=end"]], strings: ["'", '"'] }, // backticks kept (shell exec)
  lua: { line: ["--"], block: [["--[[", "]]"]], strings: ["'", '"'] },
  php: { line: ["//", "#"], block: [["/*", "*/"]], strings: ["'", '"'] },
  none: { line: [], block: [], strings: [] },
};

function scrub(code: string, lang: ForbidLang): string {
  const syn = SYNTAX_BY_LANG[lang];
  let out = "";
  let i = 0;
  outer: while (i < code.length) {
    // block comments (checked before line comments: lua's --[[ starts with --)
    for (const [open, close] of syn.block) {
      if (code.startsWith(open, i)) {
        const end = code.indexOf(close, i + open.length);
        i = end === -1 ? code.length : end + close.length;
        continue outer;
      }
    }
    for (const mark of syn.line) {
      if (code.startsWith(mark, i)) {
        const nl = code.indexOf("\n", i);
        i = nl === -1 ? code.length : nl; // keep the newline
        continue outer;
      }
    }
    const c = code[i];
    if (syn.strings.includes(c)) {
      i++;
      while (i < code.length && code[i] !== c) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function selfContainmentViolations(code: string, lang: ForbidLang): string[] {
  const scrubbed = scrub(code, lang);
  return FORBIDDEN_BY_LANG[lang].filter((f) => f.re.test(scrubbed)).map((f) => f.name);
}

// ---------- lesson generation ----------

type RawCheck = { type?: string; value?: string };
type RawLesson = { intro?: string; starterCode?: string; html?: string; solution?: string; objectives?: { id?: string; description?: string; check?: RawCheck }[] };

function parseCheck(raw: RawCheck | undefined): ObjectiveCheck | undefined {
  if (!raw || typeof raw.value !== "string") return undefined;
  const t = raw.type;
  if (t === "stdout_equals" || t === "stdout_includes" || t === "code_matches") {
    return { type: t, value: raw.value };
  }
  return undefined;
}

function mkLesson(data: RawLesson, sources: string[], spec: RuntimeSpec): Lesson {
  return {
    intro: String(data.intro ?? "").trim(),
    starterCode: String(data.starterCode ?? "").trim() || spec.defaultCode,
    html: spec.allowDom ? String(data.html ?? "").trim() : "",
    solution: data.solution ? String(data.solution).trim() : undefined,
    sources,
    objectives: (Array.isArray(data.objectives) ? data.objectives : []).slice(0, 5).map((o, i) => ({
      id: String(o?.id || `o${i + 1}`),
      description: String(o?.description ?? "").trim(),
      check: parseCheck(o?.check),
    })),
  };
}

function buildPrompt(
  spec: RuntimeSpec,
  input: { skill: string; level?: string; goal?: string; pointTitle: string; pointSummary?: string; moduleId?: string; treeOutline?: string }
): string {
  const { skill, level, goal, pointTitle, pointSummary, moduleId, treeOutline } = input;

  // Only modules whose docs are embeddable (DevDocs) get inline doc links; the external-
  // doc modules stay plain prose. The label steers the model toward canonical entry names.
  const docSrc = getDocSource(moduleId);
  const docLinks =
    docSrc?.kind === "devdocs"
      ? `DOC LINKS: In "intro", wherever you mention a specific API / method / function / built-in / concept the learner MUST use to complete THIS exercise, hyperlink it inline using markdown [visible text](<doc:CANONICAL_NAME>) — ALWAYS wrap the target in angle brackets <...> (required so names with spaces work). CANONICAL_NAME is its official ${docSrc.label} documentation name (e.g. the exact method or symbol name — "Array.prototype.map", "print", "SELECT", "Arrow function expressions"). Link ONLY the few references genuinely needed to solve the task, inline in the sentence where they appear — never a separate list, never decorative links. Example: "use the [\`map()\`](<doc:Array.prototype.map>) method to transform each item".\n`
      : "";

  const head =
    `Using REAL, current official documentation and best practices for "${skill}", ` +
    `create a focused, hands-on micro-lesson for the learning point "${pointTitle}"` +
    (pointSummary ? ` (${pointSummary})` : "") +
    `.\nLearner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    `DIFFICULTY CALIBRATION: fit the exercise to that level and to how early this point sits in the roadmap. For a new/beginner learner in the roadmap's early points, teach ONE new concept: the task should be a few short, simple lines applying just that concept — do NOT stack auxiliary requirements (e.g. casting + aggregation + grouping + ordering at once); split ambition like that into the objectives of LATER points that cover it. A beginner must be able to complete the first lessons from the intro text alone.\n` +
    (treeOutline
      ? `ROADMAP CONTEXT — the module's full curriculum ("◀ CURRENT" marks this lesson's point, "✓done" marks what the learner already completed):\n${treeOutline.slice(0, 8000)}\n` +
        `Teach ONLY the current point. Assume ✓done and earlier material is known — build on it, never re-teach it. ` +
        `Do NOT teach content that belongs to other points; at most note it comes later.\n`
      : "") +
    `LANGUAGE: the learner writes ${spec.langName} in an in-app editor. Output mechanism: ${spec.printHow}.\n` +
    `RUNTIME: ${spec.runNotes}\n\n` +
    `Return ONLY JSON: {"intro": string, "starterCode": string, "html": string, "solution": string, "objectives": [{"id": string, "description": string, "check": {"type": string, "value": string}}]}.\n` +
    `"solution": the COMPLETE correct ${spec.langName} — the starterCode with every objective fully implemented — that runs to completion WITHOUT errors and produces output proving all objectives. Same self-containment rules as starterCode${spec.allowDom ? "; it targets the same html (selectors must match)" : ""}. This is the reference answer; it is validated by running it.\n` +
    `Every objective MUST carry a "check" — a DETERMINISTIC, machine-verifiable test (grading runs it; no AI judges pass/fail). Pick the type that fits:\n` +
    `  • {"type":"stdout_equals","value":"<exact full run output>"} — when the objective is fully defined by what the program prints.\n` +
    `  • {"type":"stdout_includes","value":"<substring the output must contain>"} — when only part of the output matters.\n` +
    `  • {"type":"code_matches","value":"<JS regexp source>"} — for "use X" / structural objectives, or interaction that doesn't print on a plain run (e.g. a click handler): match the required construct in the learner's code, e.g. "addEventListener\\\\(\\\\s*['\\"]click['\\"]".\n` +
    `CRITICAL: your own "solution" MUST pass every check (stdout checks match the solution's real output; code_matches matches the solution's code). Checks are validated by running the solution — if they don't pass it, they are wrong.\n` +
    docLinks +
    `\n`;

  if (!spec.runnable) {
    return (
      head +
      `THIS MODULE HAS NO RUNTIME — the learner CANNOT execute code; they submit it for review.\n` +
      `- "starterCode": ${spec.langName} scaffold the learner edits. Self-contained, no external services assumed beyond what the code itself shows.\n` +
      `- "html": always "".\n` +
      `- "intro": markdown teaching text, instructional voice, no pleasantries. First give a PRACTICAL, TECHNICAL explanation of the topic — what it is, how it works, relevant syntax/semantics/API, and when/why it's used — so the learner understands the task technically; THEN describe the ACTUAL starterCode and what to change. Make clear they press Submit (not Run) when done.\n` +
      `- "objectives": 2 to 4 CONCRETE tasks verifiable by READING the learner's code alone (structure, correct API usage, naming) — never by program output.`
    );
  }

  const sql = spec.forbid === "sql";
  return (
    head +
    `SELF-CONTAINMENT (most important): the exercise MUST run to completion in the runtime described above with NOTHING external. When the learner writes the CORRECT answer, running it must succeed and produce output that proves every objective.\n` +
    `- No network, no real files, no package installs, no shell.\n` +
    (sql
      ? `- The database is EMPTY on every Run: the exercise MUST create its own schema and data (CREATE TABLE + INSERT or generated rows) before querying it.\n`
      : `- Everything the code needs (sample data, inputs${spec.allowDom ? ", and for DOM lessons the HTML" : ""}) must be declared INSIDE the exercise itself.\n`) +
    `- For topics that would normally need the network or files, SIMULATE the data with hardcoded in-exercise values — never perform real I/O.\n` +
    `- Each objective must be verifiable from the output (${spec.printHow}) after the correct code runs.\n\n` +
    `CONSISTENCY RULES — the fields MUST fit together:\n` +
    (spec.allowDom
      ? `1. "html": the page scaffold the code runs against (a live Preview is shown). It MUST contain the ACTUAL elements the objectives and starterCode reference, with the EXACT ids/classes used. If this point doesn't need markup, set "html" to "".\n`
      : `1. "html": always "" for this module.\n`) +
    `2. "starterCode" is the EXACT ${spec.langName} in the learner's editor. It MUST already DECLARE, with sensible initial values, every identifier any objective refers to${spec.allowDom ? " (selectors must match elements in html)" : ""}. CRITICAL GAP RULE: the starter must LEAVE THE OBJECTIVES UNDONE — it must NOT already contain the statements/expressions that satisfy any objective's check. Where the learner must write code, put a TODO comment describing the task, NOT the answer. If the starter were run as-is, it MUST FAIL the objective checks; only the "solution" satisfies them. (E.g. never pre-write \`print(10 + 2 * 5)\` if an objective is to print that result — leave a \`# TODO\` instead.)\n` +
    `3. "intro": markdown teaching text, instructional voice, no pleasantries. Structure it in two parts: (a) a PRACTICAL, TECHNICAL explanation of the topic — what it is, how it actually works, the relevant syntax/semantics/API behavior, and when/why it's used, so the learner understands the task on a technical level BEFORE writing code; (b) then describe the ACTUAL starterCode${spec.allowDom ? "/html" : ""} the learner sees and what the task requires them to change — never an unrelated example. Be concise but genuinely explanatory; use a short code snippet or bullet list where it aids understanding.\n` +
    `4. "objectives": 2 to 4 CONCRETE, CHECKABLE tasks completed by EDITING the starterCode. Each objective's DESCRIPTION must state exactly the observable thing its "check" verifies (e.g. "print X", "define function Y that returns Z") — describe the gradeable ACTION, never an ungradeable mental step like "predict", "notice", "understand", or "observe". Each references only identifiers that already exist and is verifiable from the run output or code. No vague or stylistic objectives.`
  );
}

export async function buildLesson(input: {
  skill: string;
  level?: string;
  goal?: string;
  pointTitle: string;
  pointSummary?: string;
  moduleId?: string;
  treeOutline?: string;
}): Promise<Lesson | null> {
  const spec = getRuntime(input.moduleId);
  const prompt = buildPrompt(spec, input);
  const lang = spec.forbid;

  // Generate, then enforce self-containment: regenerate with the violation called out
  // (deterministic guard, not just prompt).
  let last: Lesson | null = null;
  let viols: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const extra = viols.length
      ? `\n\nCRITICAL FIX: your previous attempt used FORBIDDEN APIs (${viols.join(", ")}) that do NOT work in this sandbox. ` +
        `Rewrite the exercise 100% self-contained in ${spec.langName}: simulate any external data with hardcoded in-exercise values; ` +
        `no network, files, shell, or package installs of any kind.`
      : "";
    const { text, sources } = await groundedText(prompt + extra);
    const data = extractJSON(text);
    if (!data || !Array.isArray(data.objectives) || data.objectives.length === 0) continue;
    last = mkLesson(data, sources, spec);
    viols = selfContainmentViolations(last.starterCode + "\n" + last.html, lang);
    if (viols.length === 0) break;
  }

  // Final guarantee: targeted rewrite of just the code.
  if (last && selfContainmentViolations(last.starterCode + "\n" + last.html, lang).length) {
    const fix = await geminiJSON<{ starterCode?: string; html?: string }>(
      `Rewrite this ${spec.langName} exercise to run in this sandbox: ${spec.runNotes}\n` +
        `No network, no files, no shell, no package installs. Simulate external data with hardcoded in-exercise values. ` +
        `Keep it solvable for these objectives: ${last.objectives.map((o) => o.description).join("; ")}.\n` +
        `Return ONLY JSON {"starterCode": string, "html": string}.\n\n` +
        `CODE:\n${last.starterCode}\n\nHTML:\n${last.html}`
    );
    if (fix?.starterCode) {
      const cleaned: Lesson = {
        ...last,
        starterCode: String(fix.starterCode).trim(),
        html: spec.allowDom ? String(fix.html ?? last.html).trim() : "",
      };
      if (selfContainmentViolations(cleaned.starterCode + "\n" + cleaned.html, lang).length === 0) last = cleaned;
    }
  }

  // Validate the reference solution by RUNNING it, and self-correct on error.
  // Pure-JS logic lessons run server-side here (Node sandbox) so validation happens
  // BEFORE the lesson is served. DOM/heavy-runtime lessons are validated client-side
  // in the background (their engines only exist in the browser).
  if (last) last = await validateJsLesson(last, spec);

  return last;
}

// Run a self-contained JS snippet in a Node sandbox, capturing console + errors.
// Only meaningful for pure-JS logic (no DOM / no browser APIs).
export function runJsInSandbox(code: string): { ok: boolean; error?: string; output: string } {
  const logs: string[] = [];
  const push = (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  const sandbox = {
    console: { log: push, info: push, warn: push, error: push, debug: push },
    setTimeout, clearTimeout, Math, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, Symbol,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vm = require("node:vm");
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { timeout: 3000, displayErrors: true });
    return { ok: true, output: logs.join("\n") };
  } catch (e) {
    const err = e as { stack?: string; message?: string };
    return { ok: false, error: String(err?.stack || err?.message || e), output: logs.join("\n") };
  }
}

// Regenerate ONLY the solution to fix a runtime error, keeping the lesson (starter
// code / html / objectives) unchanged. Returns null if the model gave nothing usable.
// Shared by the server-side JS loop and the client-driven /api/lesson/fix-solution.
export async function fixSolution(input: {
  objectives: Objective[];
  starterCode: string;
  html?: string;
  solution: string;
  error: string;
  language: string;
}): Promise<string | null> {
  const fixed = await geminiJSON<{ solution?: string }>(
    `A reference solution for a ${input.language} exercise throws when run:\n${input.error}\n\n` +
      `Rewrite ONLY the solution so it runs to completion with NO errors and still satisfies these objectives: ` +
      `${input.objectives.map((o) => o.description).join("; ")}. ` +
      `Self-contained: no network, no files, no shell. Return ONLY JSON {"solution": string}.\n\n` +
      (input.html ? `PAGE HTML (the solution runs against this — selectors must match):\n${input.html}\n\n` : "") +
      `STARTER CODE (the exercise, do not change it):\n${input.starterCode}\n\n` +
      `BROKEN SOLUTION:\n${input.solution}`
  );
  return fixed?.solution ? String(fixed.solution).trim() : null;
}

// Regenerate ONLY the machine checks that the verified reference solution FAILS.
// When the solution runs clean but a check still fails, the check itself is wrong —
// typically an LLM-invented constant that doesn't match the exercise's real data
// (an unpassable objective). The solution's ACTUAL run output is the ground truth:
// new stdout checks must be copied from it verbatim, never computed.
export async function fixChecks(input: {
  objectives: Objective[];
  failingIds: string[];
  solution: string;
  solutionOutput: string;
  language: string;
}): Promise<Objective[] | null> {
  const failing = input.objectives.filter((o) => input.failingIds.includes(o.id));
  if (failing.length === 0) return null;
  const fixed = await geminiJSON<{ checks?: { id?: string; type?: string; value?: string }[] }>(
    `A ${input.language} exercise has machine-graded objectives. The REFERENCE SOLUTION below is correct and runs with no errors, ` +
      `but these objectives' checks FAIL against it — so the CHECKS themselves are wrong (usually an invented value that doesn't match the exercise's real data):\n` +
      failing
        .map((o) => `- id "${o.id}": ${o.description} (broken check: ${JSON.stringify(o.check)})`)
        .join("\n") +
      `\n\nRewrite ONLY those checks so the reference solution PASSES them while still verifying each objective's intent.\n` +
      `RULES:\n` +
      `- For "stdout_equals"/"stdout_includes", the value MUST be copied VERBATIM from the ACTUAL OUTPUT below — never computed, rounded, or invented. Prefer one (or a few consecutive) distinctive line(s).\n` +
      `- Use {"type":"code_matches","value":"<regexp>"} only when the objective is about HOW the code is written; the regexp must match the reference solution.\n\n` +
      `REFERENCE SOLUTION:\n${input.solution}\n\n` +
      `ACTUAL OUTPUT of the reference solution:\n${input.solutionOutput}\n\n` +
      `Return ONLY JSON {"checks": [{"id": string, "type": "stdout_equals"|"stdout_includes"|"code_matches", "value": string}]}.`
  );
  const arr = Array.isArray(fixed?.checks) ? fixed!.checks! : [];
  const byId = new Map(arr.map((c) => [c?.id, c]));
  let changed = false;
  const merged = input.objectives.map((o) => {
    if (!input.failingIds.includes(o.id)) return o;
    const c = byId.get(o.id);
    if (
      c &&
      (c.type === "stdout_equals" || c.type === "stdout_includes" || c.type === "code_matches") &&
      typeof c.value === "string" &&
      c.value.length > 0
    ) {
      changed = true;
      return { ...o, check: { type: c.type, value: c.value } as ObjectiveCheck };
    }
    return o;
  });
  return changed ? merged : null;
}

// Regenerate ONLY the starter so the exercise has a real GAP — i.e. the learner must write
// code to satisfy the objectives. Used when the generated starter already passes the checks
// on its own (nothing to do). Keeps declarations; replaces the answer lines with TODOs.
// Shared by the server-side JS loop and the client-driven /api/lesson/fix-starter.
export async function fixStarter(input: {
  objectives: Objective[];
  starterCode: string;
  solution: string;
  html?: string;
  language: string;
}): Promise<string | null> {
  const fixed = await geminiJSON<{ starterCode?: string }>(
    `A ${input.language} exercise's STARTER already satisfies its objectives on its own, so the learner has nothing to write. Rewrite ONLY the starter so the learner MUST complete it:\n` +
      `- REMOVE the exact statements/expressions that satisfy these objectives — ${input.objectives.map((o) => o.description).join("; ")} — and replace each with a clear TODO comment saying what to write (NEVER the answer itself).\n` +
      `- KEEP every identifier/variable/function/data declaration the objectives reference, with sensible initial values, so the code still runs without name errors.\n` +
      `- The starter MUST run to completion with NO errors, but MUST NOT yet satisfy the objective checks — that is the learner's job.\n` +
      (input.html ? `PAGE HTML (unchanged, selectors must still match):\n${input.html}\n\n` : "") +
      `REFERENCE SOLUTION (complete correct code — context only; do NOT copy it into the starter):\n${input.solution}\n\n` +
      `CURRENT (too-complete) STARTER:\n${input.starterCode}\n\n` +
      `Return ONLY JSON {"starterCode": string}.`
  );
  return fixed?.starterCode ? String(fixed.starterCode).trim() : null;
}

// Lesson-integrity invariant for pure-JS logic lessons, enforced server-side BEFORE serving:
//   (1) the SOLUTION must run clean AND pass every check (the lesson is solvable), and
//   (2) the STARTER must run but FAIL at least one check (there is a real gap to fill).
// Each violation self-corrects by regenerating just the offending part. This is the general
// guard against "task ≠ solution" drift (e.g. a starter that already prints the answer).
async function validateJsLesson(lesson: Lesson, spec: RuntimeSpec): Promise<Lesson> {
  const isPlainJs = spec.engine === "worker-js" && !spec.allowDom;
  if (!isPlainJs || !lesson.solution) return lesson;

  let current = lesson;

  // (1) Solution must be correct.
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = runJsInSandbox(current.solution!);
    let error = run.error;
    if (!error) {
      const g = gradeSubmission(current.objectives, current.solution!, run.output);
      if (g.gradable && !g.allPassed) {
        error = "reference solution does not satisfy the objective checks: " +
          g.results.filter((r) => !r.passed).map((r) => r.detail).join("; ");
      }
    }
    if (!error) break; // runs clean AND passes its checks
    const fixed = await fixSolution({
      objectives: current.objectives,
      starterCode: current.starterCode,
      solution: current.solution!,
      error,
      language: spec.langName,
    });
    if (!fixed) break;
    current = { ...current, solution: fixed };
  }

  // (2) Starter must leave a gap — it must NOT already pass all checks.
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = runJsInSandbox(current.starterCode);
    const g = gradeSubmission(current.objectives, current.starterCode, run.output);
    if (!g.gradable || !g.allPassed) break; // gap exists (or nothing gradable) → good
    const fixed = await fixStarter({
      objectives: current.objectives,
      starterCode: current.starterCode,
      solution: current.solution!,
      language: spec.langName,
    });
    if (!fixed) break;
    current = { ...current, starterCode: fixed };
  }

  return current; // best effort (client-side background validation is the backstop)
}

export async function evaluateSubmission(input: {
  pointTitle: string;
  objectives: Objective[];
  code: string;
  output: string;
  alreadyPassed?: string[];
  language?: string;
}): Promise<Evaluation> {
  const { pointTitle, objectives, code, output, alreadyPassed = [], language } = input;
  const list = objectives.map((o) => `- [${o.id}] ${o.description}`).join("\n");

  const prompt =
    `You are grading a learner's ${language ?? ""} submission against a FIXED set of objectives for the point "${pointTitle}". ` +
    `Judge ONLY these objectives. Do NOT invent new requirements or demand stylistic changes beyond them.\n` +
    `OBJECTIVES:\n${list}\n` +
    `Already satisfied in earlier attempts (these stay true): ${alreadyPassed.join(", ") || "none"}\n\n` +
    `LEARNER CODE:\n${code}\n\nRUN OUTPUT:\n${output || "(no output)"}\n\n` +
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
