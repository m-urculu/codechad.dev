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
import { getRuntime, type RuntimeSpec, type ForbidLang } from "@/lib/runtimes/registry";

export type Objective = { id: string; description: string };
export type Lesson = {
  intro: string;
  starterCode: string;
  html: string; // HTML scaffold for DOM/Preview lessons (empty otherwise)
  objectives: Objective[];
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

type RawLesson = { intro?: string; starterCode?: string; html?: string; objectives?: { id?: string; description?: string }[] };

function mkLesson(data: RawLesson, sources: string[], spec: RuntimeSpec): Lesson {
  return {
    intro: String(data.intro ?? "").trim(),
    starterCode: String(data.starterCode ?? "").trim() || spec.defaultCode,
    html: spec.allowDom ? String(data.html ?? "").trim() : "",
    sources,
    objectives: (Array.isArray(data.objectives) ? data.objectives : []).slice(0, 5).map((o, i) => ({
      id: String(o?.id || `o${i + 1}`),
      description: String(o?.description ?? "").trim(),
    })),
  };
}

function buildPrompt(
  spec: RuntimeSpec,
  input: { skill: string; level?: string; goal?: string; pointTitle: string; pointSummary?: string; treeOutline?: string }
): string {
  const { skill, level, goal, pointTitle, pointSummary, treeOutline } = input;

  const head =
    `Using REAL, current official documentation and best practices for "${skill}", ` +
    `create a focused, hands-on micro-lesson for the learning point "${pointTitle}"` +
    (pointSummary ? ` (${pointSummary})` : "") +
    `.\nLearner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    (treeOutline
      ? `ROADMAP CONTEXT — the module's full curriculum ("◀ CURRENT" marks this lesson's point, "✓done" marks what the learner already completed):\n${treeOutline.slice(0, 8000)}\n` +
        `Teach ONLY the current point. Assume ✓done and earlier material is known — build on it, never re-teach it. ` +
        `Do NOT teach content that belongs to other points; at most note it comes later.\n`
      : "") +
    `LANGUAGE: the learner writes ${spec.langName} in an in-app editor. Output mechanism: ${spec.printHow}.\n` +
    `RUNTIME: ${spec.runNotes}\n\n` +
    `Return ONLY JSON: {"intro": string, "starterCode": string, "html": string, "objectives": [{"id": string, "description": string}]}.\n\n`;

  if (!spec.runnable) {
    return (
      head +
      `THIS MODULE HAS NO RUNTIME — the learner CANNOT execute code; they submit it for review.\n` +
      `- "starterCode": ${spec.langName} scaffold the learner edits. Self-contained, no external services assumed beyond what the code itself shows.\n` +
      `- "html": always "".\n` +
      `- "intro": concise markdown teaching text describing the ACTUAL starterCode. Instructional voice, no pleasantries. Make clear they press Submit (not Run) when done.\n` +
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
    `2. "starterCode" is the EXACT ${spec.langName} in the learner's editor. It MUST already DECLARE, with sensible initial values, every identifier any objective refers to${spec.allowDom ? " (selectors must match elements in html)" : ""}, with comments marking where the learner adds code.\n` +
    `3. "intro": concise markdown teaching text, instructional voice, no pleasantries. It must describe the ACTUAL starterCode${spec.allowDom ? "/html" : ""} the learner sees — never an unrelated example.\n` +
    `4. "objectives": 2 to 4 CONCRETE, CHECKABLE tasks completed by EDITING the starterCode, each referencing only identifiers that already exist and verifiable from the run output. No vague or stylistic objectives.`
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

  return last;
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
