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
import { difficultyGuidance } from "./level";
import { knownSkillsBlock, type KnownSkill } from "@/lib/skills";
import { gradeSubmission, repeatsNeeded, rulesFailing, withoutRules } from "./grade";
import { getRuntime, type RuntimeSpec, type ForbidLang } from "@/lib/runtimes/registry";
import { scrubCode } from "@/lib/runtimes/comments";
import { formatConsoleArgs } from "@/lib/runtimes/consoleFormat";
import { getDocSource } from "@/lib/docs";
import { canonicalDocTerm, validateDocLinks } from "@/lib/docs-index";
import { findDocPages, linkInlineCode } from "@/lib/docSearch";
import { answerLines, stripLeakingBlocks } from "./leak";
import { stateRequiredNames, stateRequiredOutput, syncTodos, unstatedOutput } from "./objectives";
import { cleanRules, grammarFor, type Rule as StructRule } from "@/lib/structure";
import { applyScaffold, planScaffold, scaffoldPrompt, type ScaffoldHistory, type ScaffoldPlan } from "@/lib/scaffold";
import { classifySyntax, ensureSyntaxLinks, knownSyntaxBlock, parseSyntax, SYNTAX_FAMILIAR, type SyntaxItem, type SyntaxSeen } from "@/lib/syntax";

// A deterministic, programmatic check for one objective. Grading runs these — the LLM
// is only used afterward for guidance, never to decide pass/fail.
//   stdout_equals   : value appears in the normalized run output as a contiguous run of
//                     lines. NOT whole-output equality — a learner's own debugging
//                     (an extra console.log/print while working it out) must not fail a
//                     correct answer. The block must still appear intact and in order.
//   stdout_includes : normalized run output contains value (good for interaction after
//                     a synthetic event, or a specific printed line)
//   code_matches    : value (a regexp source) matches the learner's code (for "how"
//                     objectives — use a construct, add a listener, etc.)
//   code (optional, on the two stdout checks): a regexp the code must ALSO match. For
//                     a printed value the program computes: without it, printing the
//                     number itself (`std::cout << 50;` for a `total` that is 50)
//                     passes an objective about printing `total`.
//   rules (optional, on any check): structural rules read from the code's syntax tree
//                     (src/lib/structure.ts) — on a stdout check they must ALSO hold,
//                     on code_matches they decide it. Where the code cannot be parsed,
//                     the regexp ("value" / "code") is used instead.
export type ObjectiveCheck =
  | { type: "stdout_equals"; value: string; code?: string; rules?: StructRule[] }
  | { type: "stdout_includes"; value: string; code?: string; rules?: StructRule[] }
  | { type: "code_matches"; value: string; rules?: StructRule[] };
export type Objective = { id: string; description: string; check?: ObjectiveCheck };
export type Lesson = {
  intro: string;
  starterCode: string;
  html: string; // HTML scaffold for DOM/Preview lessons (empty otherwise)
  objectives: Objective[];
  solution?: string;   // complete correct code; validated so the exercise is solvable
  /** Syntax the solution uses, checked against it. See src/lib/syntax.ts. */
  syntax?: SyntaxItem[];
  /** Skeleton pieces left for the learner to write. See src/lib/scaffold.ts. */
  scaffold?: ScaffoldPlan["mode"];
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
  c: [
    { re: /\bfopen\s*\(/, name: "fopen()" },
    { re: /\b(system|popen|fork|exec[lv])\s*\(/, name: "system/fork/exec" },
    { re: /^\s*#include\s*<(unistd|sys\/socket|netinet|pthread|dlfcn)\.h>/m, name: "process/network/thread header" },
  ],
  cpp: [
    { re: /\bstd::(ifstream|ofstream|fstream)\b|\bfopen\s*\(/, name: "file I/O" },
    { re: /\b(system|popen|fork|exec[lv])\s*\(/, name: "system/fork/exec" },
    { re: /^\s*#include\s*<(unistd|sys\/socket|netinet|pthread|dlfcn)\.h>/m, name: "process/network/thread header" },
    // The sandbox reads end-of-file immediately, so anything waiting on stdin
    // produces a lesson whose objectives can never be met.
    // `using namespace std;` is common enough in teaching code that the bare
    // spelling has to be caught too.
    { re: /\b(std::)?cin\b/, name: "std::cin (there is no stdin)" },
    // Not a sandbox policy but a hard compiler fact: the module is built with
    // -fno-exceptions (no unwinder in the sysroot's libc++), so these do not
    // compile at all. Catching them here is what stops a generated lesson whose
    // own solution fails to build. See engineC.ts.
    { re: /\bthrow\b|^\s*try\s*\{|\bcatch\s*\(/m, name: "try/throw/catch (exceptions are disabled)" },
    { re: /^\s*#include\s*<(thread|mutex|future|condition_variable)>/m, name: "threads (std::thread aborts here)" },
  ],
  go: [
    { re: /"net\/http"|"net"|"os\/exec"|"syscall"|"os\/signal"/, name: "network/process import" },
    { re: /\bos\.(Open|Create|ReadFile|WriteFile|Remove)\b/, name: "os file access" },
    { re: /^\s*package\s+(?!main\b)/m, name: "package other than main" },
  ],
  none: [],
};

function selfContainmentViolations(code: string, lang: ForbidLang): string[] {
  const scrubbed = scrubCode(code, lang);
  return FORBIDDEN_BY_LANG[lang].filter((f) => f.re.test(scrubbed)).map((f) => f.name);
}

// ---------- lesson generation ----------

type RawCheck = { type?: string; value?: string; code?: string; rules?: unknown };
type RawLesson = { intro?: string; starterCode?: string; html?: string; solution?: string; syntax?: unknown; objectives?: { id?: string; description?: string; check?: RawCheck }[] };

function parseCheck(raw: RawCheck | undefined): ObjectiveCheck | undefined {
  if (!raw || typeof raw.value !== "string") return undefined;
  const t = raw.type;
  const rules = cleanRules(raw.rules);
  const withRules = <T extends ObjectiveCheck>(c: T): T => (rules.length ? { ...c, rules } : c);
  if (t === "stdout_equals" || t === "stdout_includes") {
    return withRules(typeof raw.code === "string" && raw.code.trim() ? { type: t, value: raw.value, code: raw.code } : { type: t, value: raw.value });
  }
  if (t === "code_matches") return withRules({ type: t, value: raw.value });
  return undefined;
}

function mkLesson(data: RawLesson, sources: string[], spec: RuntimeSpec): Lesson {
  return {
    intro: String(data.intro ?? "").trim(),
    starterCode: String(data.starterCode ?? "").trim() || spec.defaultCode,
    html: spec.allowDom ? String(data.html ?? "").trim() : "",
    solution: data.solution ? String(data.solution).trim() : undefined,
    syntax: parseSyntax(data.syntax, data.solution ? String(data.solution) : undefined),
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
  input: {
    skill: string;
    level?: string;
    goal?: string;
    pointTitle: string;
    pointSummary?: string;
    moduleId?: string;
    treeOutline?: string;
    known?: KnownSkill[];
    syntaxSeen?: SyntaxSeen;
    priorExercises?: string[];
    scaffold?: ScaffoldPlan;
  }
): string {
  const { skill, level, goal, pointTitle, pointSummary, moduleId, treeOutline, known, syntaxSeen, priorExercises, scaffold } = input;

  // Only modules whose docs are embeddable (DevDocs) get inline doc links; the external-
  // doc modules stay plain prose. The label steers the model toward canonical entry names.
  const docSrc = getDocSource(moduleId);
  const docLinks =
    docSrc?.kind === "devdocs"
      ? `DOC LINKS: In "intro", wherever you mention a specific API / method / function / built-in / concept the learner MUST use to complete THIS exercise, hyperlink it inline using markdown [visible text](<doc:CANONICAL_NAME>) — ALWAYS wrap the target in angle brackets <...> (required so names with spaces work). CANONICAL_NAME is its official ${docSrc.label} documentation name (e.g. the exact method or symbol name — "Array.prototype.map", "print", "SELECT", "Arrow function expressions"). Link ONLY the few references genuinely needed to solve the task, inline in the sentence where they appear — never a separate list, never decorative links. Example: "use the [\`map()\`](<doc:Array.prototype.map>) method to transform each item".\n`
      : "";

  // Syntax ledger: only where doc links resolve, since every new piece of syntax is
  // introduced AS a doc link. See src/lib/syntax.ts.
  const syntax =
    docSrc?.kind === "devdocs"
      ? `SYNTAX: "syntax" lists every piece of syntax the learner must WRITE to turn starterCode into solution — keywords, operators, functions, statements, and small things like escape sequences (\\n) or format specifiers that are easy to miss. Each item: {"token": exactly as it appears in solution, "doc": its official ${docSrc.label} documentation name, "meaning": at most 10 words}. Every token MUST appear verbatim in "solution".\n` +
        knownSyntaxBlock(syntaxSeen ?? {}) +
        `In "intro": every syntax item NOT listed above is NEW — show it, explain in one sentence what it does, and link it inline as [\`token\`](<doc:NAME>). An item listed fewer than ${SYNTAX_FAMILIAR} times: link it once, do not explain it again. An item listed ×${SYNTAX_FAMILIAR} or more: do not mention it. Never leave out a NEW item the solution needs — the learner cannot write what they were never shown.\n`
      : "";

  const head =
    `Using REAL, current official documentation and best practices for "${skill}", ` +
    `create a focused, hands-on micro-lesson for the learning point "${pointTitle}"` +
    (pointSummary ? ` (${pointSummary})` : "") +
    `.\nLearner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    // Per-tier, from level.ts. This used to be a single paragraph written for
    // beginners, which is what every learner got regardless of what they answered.
    `${difficultyGuidance(level)}\n` +
    // Completed in OTHER courses. treeOutline's "✓done" only covers this one, so
    // without this the lesson re-explains ground the learner finished last week
    // under a different course name.
    knownSkillsBlock(known ?? [], moduleId) +
    (treeOutline
      ? `ROADMAP CONTEXT — the module's full curriculum ("◀ CURRENT" marks this lesson's point, "✓done" marks what the learner already completed):\n${treeOutline.slice(0, 8000)}\n` +
        `Teach ONLY the current point. Assume ✓done and earlier material is known — build on it, never re-teach it. ` +
        `Do NOT teach content that belongs to other points; at most note it comes later.\n`
      : "") +
    // What this learner has already been asked to do in this course. Without it every
    // lesson is generated as if it were the first, and a beginner course asked for
    // "Hello, C++!" in six of its first nine lessons.
    (priorExercises?.length
      ? `EXERCISES THIS LEARNER HAS ALREADY DONE IN THIS COURSE (one per lesson):\n` +
        priorExercises.map((e) => `  • ${e}`).join("\n") +
        `\nThis lesson's exercise must be NEW: a different task with different data and different printed text — never ` +
        `reprint a message one of them printed (no "Hello, …!" again if it is above). It must REQUIRE at least one ` +
        `construct or technique none of them did — if this lesson's topic is something they already USED (e.g. std::cout: ` +
        `they printed fixed text), the exercise is about what they did not do with it (chaining several values in one ` +
        `statement, printing variables and expressions, formatting) — never another "print this fixed message".\n`
      : "") +
    `LANGUAGE: the learner writes ${spec.langName} in an in-app editor. Output mechanism: ${spec.printHow}.\n` +
    `RUNTIME: ${spec.runNotes}\n\n` +
    `Return ONLY JSON: {"intro": string, "starterCode": string, "html": string, "solution": string, "objectives": [{"id": string, "description": string, "check": {"type": string, "value": string, "code"?: string, "rules"?: [{"rule": string, "expr"?: string, "name"?: string, "init"?: string}]}}]${syntax ? `, "syntax": [{"token": string, "doc": string, "meaning": string}]` : ""}}.\n` +
    `"solution": the COMPLETE correct ${spec.langName} — the starterCode with every objective fully implemented — that runs to completion WITHOUT errors and produces output proving all objectives. Same self-containment rules as starterCode${spec.allowDom ? "; it targets the same html (selectors must match)" : ""}. This is the reference answer; it is validated by running it.\n` +
    `Every objective MUST carry a "check" — a DETERMINISTIC, machine-verifiable test (grading runs it; no AI judges pass/fail). Pick the type that fits:\n` +
    `  • {"type":"stdout_equals","value":"<the exact line(s) the objective requires>"} — when the objective is fully defined by what the program prints. Grading looks for these lines inside the run output, so the learner may leave their own debugging prints in place; give ONLY the lines the objective is about, not incidental output.\n` +
    (spec.outputFormat ? `    OUTPUT FORMAT — the console renders values as ${spec.outputFormat} Write stdout values EXACTLY as this runtime prints them, never as another language's REPL or console would.\n` : "") +
    `  • {"type":"stdout_includes","value":"<substring the output must contain>"} — when only part of the output matters.\n` +
    (grammarFor(spec.monacoLang)
      ? `  • STRUCTURAL RULES — the code is parsed, so a check can say what the code must DO, read from its syntax tree (spacing, comments and operand order never matter). Any check may carry "rules": a list, every one of which must hold:\n` +
        `      {"rule":"prints","expr":"<expression>"} a print statement outputs that expression · {"rule":"uses","expr":"<expression>"} the expression appears · ` +
        `{"rule":"declares","name":"<variable>","init":"<optional initialiser expression>"} · {"rule":"calls","name":"<function>"} · {"rule":"defines","name":"<function>"} · {"rule":"returns","name":"<function>","expr":"<the expression it returns>"}\n` +
        `    An objective to write a function that RETURNS something carries "defines" AND "returns" — a function that prints instead of returning must not pass it.\n` +
        `    Expressions are written in ${spec.langName} exactly as your solution writes them (e.g. "total", "17 + 25", "baseUnits * multiplier").\n` +
        `    A stdout check of a COMPUTED value — any printed text not written literally in your solution (a variable's value, an expression's result) — MUST carry "rules" saying how it is produced, so printing the number itself does not pass: ` +
        `e.g. {"type":"stdout_equals","value":"50","rules":[{"rule":"prints","expr":"total"}]}; for "print the sum of 17 and 25": {"type":"stdout_equals","value":"42","rules":[{"rule":"prints","expr":"17 + 25"}]}.\n` +
        `    A code_matches objective ("declare X", "call Y", "use Z") also carries "rules" for what it asks; its "value" regexp stays as a fallback.\n`
      : `  • A stdout check of a COMPUTED value — any printed text that is not written literally in your solution (a variable's value, an expression's result) — ALSO carries "code": a JS regexp source matching how the solution produces it, so printing the number itself does not pass. E.g. {"type":"stdout_equals","value":"50","code":"std::cout\\\\s*<<\\\\s*total\\\\b"}. Match the variable or expression, allowing any spacing.\n`) +
    `  • {"type":"code_matches","value":"<JS regexp source>"} — for "use X" / structural objectives, or interaction that doesn't print on a plain run (e.g. a click handler): match the required construct in the learner's code, e.g. "addEventListener\\\\(\\\\s*['\\"]click['\\"]".\n` +
    `CRITICAL: your own "solution" MUST pass every check (stdout checks match the solution's real output; code_matches matches the solution's code). Checks are validated by running the solution — if they don't pass it, they are wrong.\n` +
    docLinks +
    syntax +
    (scaffold ? scaffoldPrompt(spec.forbid, scaffold) : "") +
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

  // Styling modules: the editor holds a stylesheet or markup, the result is a rendered
  // page, and NOTHING reaches the console. Left to the generic prompt, the model writes
  // stdout checks against a runtime that can never print, and every objective fails.
  if (spec.codeIs === "css" || spec.codeIs === "html") {
    const isCss = spec.codeIs === "css";
    return (
      head +
      `THIS MODULE RENDERS — IT DOES NOT PRINT. The learner's work is judged by what the page LOOKS like, ` +
      `and a rendered page produces no console output, so:\n` +
      `- EVERY objective's check MUST be {"type":"code_matches","value":"<JS regexp source>"} matching what the ` +
      `learner had to write. NEVER stdout_equals or stdout_includes — there is no stdout to match.\n` +
      `- Write each regexp to survive normal formatting: allow flexible whitespace (\\\\s*), don't anchor to line ` +
      `starts, and match the declaration or class itself rather than the learner's exact spacing or ordering.\n` +
      (isCss
        ? `- "starterCode" is the STYLESHEET in the learner's editor — plain CSS, no <style> tags around it.\n` +
          `- "html" is the markup it styles, and it is REQUIRED and never empty. Every selector the objectives ` +
          `ask for must have something to select: the classes and elements must already exist in the markup.\n` +
          `- The starter must set up the scene (the layout that exists, the rules already written) and LEAVE THE ` +
          `OBJECTIVE UNDONE — a \`/* TODO */\` where the learner writes the rule, never the answer.\n`
        : `- "starterCode" is the MARKUP itself, with Tailwind utility classes on it. It is the whole exercise.\n` +
          `- "html" is ALWAYS "" for this module — the starterCode already IS the page.\n` +
          `- The starter must ship the elements with their structural classes present and LEAVE THE OBJECTIVE ` +
          `UNDONE: the utility the learner must add is missing, marked by an HTML comment, never pre-written.\n` +
          `- Teach with real Tailwind utilities, never hand-written CSS in a <style> block.\n`) +
      `- "intro": markdown teaching text, instructional voice, no pleasantries. First a PRACTICAL, TECHNICAL ` +
      `explanation — what the property or utility actually does, how it interacts with the box model or the ` +
      `parent layout, and when it is the right tool; THEN describe the starter the learner sees and what to change. ` +
      `Tell them to press Run and LOOK at the Preview.\n` +
      `- "objectives": 2 to 4 concrete tasks, each naming the exact declaration or class to write ` +
      `("give .card a 12px gap", "make the button full width below sm"). No aesthetic judgement calls.\n` +
      `- "solution": the complete ${spec.langName} with every objective applied, and it must satisfy every ` +
      `code_matches check — the checks are validated against it.`
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
    `2. "starterCode" is the EXACT ${spec.langName} in the learner's editor. It MUST already DECLARE, with sensible initial values, every identifier any objective refers to${spec.allowDom ? " (selectors must match elements in html)" : ""}. CRITICAL GAP RULE: the starter must LEAVE THE OBJECTIVES UNDONE — it must NOT already contain the statements/expressions that satisfy any objective's check. Where the learner must write code, put a TODO comment describing the task, NOT the answer — exactly ONE single-line TODO comment per objective, in the same order as "objectives", each where that objective's code goes. If the starter were run as-is, it MUST FAIL the objective checks; only the "solution" satisfies them. (E.g. never pre-write \`print(10 + 2 * 5)\` if an objective is to print that result — leave a \`# TODO\` instead.)\n` +
    `   STEP BY STEP: the starter MUST compile and run as-is, and keep compiling as the learner completes each objective in turn. If an objective is to DECLARE something (a variable, a function), the starter must not already USE it — the line that uses it belongs to that objective's TODO, or a later one — otherwise the program fails to compile until every TODO is done, and the learner gets no feedback on each step.\n` +
    `3. "intro": markdown teaching text, instructional voice, no pleasantries. Structure it in two parts: (a) a PRACTICAL, TECHNICAL explanation of the topic — what it is, how it actually works, the relevant syntax/semantics/API behavior, and when/why it's used, so the learner understands the task on a technical level BEFORE writing code; (b) then describe the ACTUAL starterCode${spec.allowDom ? "/html" : ""} the learner sees and what the task requires them to change — never an unrelated example. Be concise but genuinely explanatory; use a short code snippet or bullet list where it aids understanding — but a snippet must NEVER contain a line the learner has to write to meet an objective, not even with different text or values; name that syntax inline instead. PLAIN MARKDOWN ONLY — never LaTeX or math delimiters: write O(1), not $O(1)$, which renders literally here.\n` +
    `4. "objectives": 2 to 4 CONCRETE, CHECKABLE tasks completed by EDITING the starterCode. Each objective's DESCRIPTION must state exactly the observable thing its "check" verifies (e.g. "print X", "define function Y that returns Z") — describe the gradeable ACTION, never an ungradeable mental step like "predict", "notice", "understand", or "observe". Each references only identifiers that already exist and is verifiable from the run output or code. No vague or stylistic objectives.\n` +
    `   NEVER an objective to print an explanation, definition or description of a concept in the learner's own words ("print a message explaining what the linker does"): grading compares exact text, so no learner can guess the sentence, and the tutor may not reveal it. ` +
    `A conceptual point is still taught by CODE that exercises it — for compiling and linking, e.g. declare a function and define it separately, then call it; for a type, store and print a value of it. ` +
    `When a check is printed text, the description must QUOTE that exact text ("print \`Total: 42\`"), so the learner knows what to produce.`
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
  /** Completed in other courses — see src/lib/skills.ts. */
  known?: KnownSkill[];
  /** Syntax already shown to this learner in this technology — see src/lib/syntax.ts. */
  syntaxSeen?: SyntaxSeen;
  /** One line per exercise already done in this course, so this one is not a repeat. */
  priorExercises?: string[];
  /** What this learner has written of the program skeleton — see src/lib/scaffold.ts. */
  scaffoldHistory?: ScaffoldHistory;
}): Promise<Lesson | null> {
  const spec = getRuntime(input.moduleId);
  const scaffold = spec.runnable ? planScaffold(spec.forbid, input.scaffoldHistory) : undefined;
  let prompt = buildPrompt(spec, { ...input, scaffold });
  const lang = spec.forbid;

  // Generate, then enforce self-containment: regenerate with the violation called out
  // (deterministic guard, not just prompt).
  let last: Lesson | null = null;
  let viols: string[] = [];
  let retriedChecks = false;
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
    // The prompt asks for 2 to 4 objectives; a single one is usually a lesson with
    // nothing left to do (the rest pre-written). Retry, keeping this as the fallback.
    if (viols.length === 0 && last.objectives.length < 2 && attempt < 2) {
      prompt += `\n\nCRITICAL FIX: give 2 to 4 objectives, each a separate step the learner writes — your previous attempt had ${last.objectives.length}.`;
      continue;
    }
    // An objective graded on printed text it never states is unpassable for a
    // learner who words things their own way (see objectives.ts): regenerate once.
    const unstated = last.objectives.filter((o) => unstatedOutput(o));
    // And a code check can be tested right here, in any language: it must accept the
    // lesson's own solution. A C++ lesson's check wanted `int f(int, int);` while its
    // solution wrote `int f(int a, int b);` — unpassable for anyone who names them.
    const rejecting = last.objectives.filter((o) => codeCheckRejects(o, last!.solution));
    // A computed value graded only on output passes when the learner prints the number.
    const hardcodable = last.objectives.filter((o) => printsComputedWithoutCode(o, last!.solution));
    // Structural rules, tested against the solution's own syntax tree.
    const ruleFails = await rulesRejectingSolution(last.objectives, last.solution, spec);
    const rulesRejecting = last.objectives.filter((o) => ruleFails.has(o.id));
    // Two output checks expecting the same text can't tell their objectives apart.
    const twins = last.objectives.filter((o) => repeatsNeeded(last!.objectives).has(o.id));
    if (viols.length === 0 && (unstated.length || rejecting.length || twins.length || hardcodable.length || rulesRejecting.length) && !retriedChecks) {
      retriedChecks = true;
      if (unstated.length) {
        prompt +=
          `\n\nCRITICAL FIX: objectives ${unstated.map((o) => `"${o.description}"`).join(", ")} are graded on exact printed text ` +
          `the description never states. Do not ask the learner to print an explanation in their own words; ` +
          `exercise the concept in code instead, and quote any exact text an objective requires.`;
      }
      if (hardcodable.length) {
        prompt +=
          `\n\nCRITICAL FIX: objectives ${hardcodable.map((o) => `"${o.description}"`).join(", ")} print a value the program computes, ` +
          `so printing that value as a literal would pass them. Give each of their stdout checks ${grammarFor(spec.monacoLang) ? `"rules" ([{"rule":"prints","expr":"<the variable or expression>"}])` : `a "code" regexp`} saying how your ` +
          `solution produces it (the variable or expression in the print statement).`;
      }
      if (rulesRejecting.length) {
        prompt +=
          `\n\nCRITICAL FIX: the "rules" of ${rulesRejecting.map((o) => `"${o.description}"`).join(", ")} do not hold in your own solution. ` +
          `Write each rule's expression and names exactly as your solution writes them.`;
      }
      if (twins.length) {
        prompt +=
          `\n\nCRITICAL FIX: objectives ${twins.map((o) => `"${o.description}"`).join(", ")} expect the same printed text as an earlier objective, ` +
          `so printing it once meets both. Give each objective a result no other objective produces (different values, or a label in the printed text).`;
      }
      if (rejecting.length) {
        prompt +=
          `\n\nCRITICAL FIX: the code_matches checks of ${rejecting.map((o) => `"${o.description}"`).join(", ")} do not match your own solution. ` +
          `Write each regexp to accept every correct way of writing it (named or unnamed parameters, any spacing), and test it against your solution.`;
      }
      continue;
    }
    if (viols.length === 0) break;
  }
  // Whatever the model did, every printed-text objective states its text.
  // And every name a structural rule requires.
  if (last) last = { ...last, objectives: stateRequiredOutput(stateRequiredNames(last.objectives, last.starterCode)) };
  // And no rule the solution itself fails survives: the check falls back to its regexp.
  if (last) {
    const fails = await rulesRejectingSolution(last.objectives, last.solution, spec);
    if (fails.size) last = { ...last, objectives: withoutRules(last.objectives, fails) };
    // The TODOs say exactly what the objectives check (objectives.ts).
    last = { ...last, starterCode: syncTodos(last.starterCode, last.objectives) };
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

  // Skeleton practice: take the planned pieces out of the (validated, complete)
  // starter, and grade each one. First, so they read as the first steps.
  if (last && scaffold?.omit.length) {
    const s = applyScaffold(spec.forbid, scaffold, last.starterCode, last.solution);
    if (s.objectives.length) {
      last = { ...last, starterCode: s.starter, objectives: [...s.objectives, ...last.objectives], scaffold: scaffold.mode };
    }
  }

  // The syntax list describes the solution AS VALIDATED (it may have been rewritten
  // above), and every piece the learner has never seen must reach the intro as a link.
  if (last) {
    // Each item's doc, checked against the real docs: a near miss ("cout") becomes
    // the entry ("std::cout"); a name with no entry is looked for in the pages'
    // content, in this lesson's context (docSearch.ts); and an item neither finds
    // stays unlinked rather than linking to the wrong page.
    const lessonContext = `${input.skill}: ${input.pointTitle}`;
    const parsed = parseSyntax(last.syntax, last.solution);
    const named = await Promise.all(parsed.map((it) => canonicalDocTerm(input.moduleId, it.doc, [it.token])));
    const misses = parsed.filter((_, i) => !named[i]);
    const pages = await findDocPages(
      input.moduleId,
      misses.map((it) => ({ term: it.token, label: it.doc, context: `${lessonContext}. ${it.token}: ${it.meaning}` }))
    ).catch(() => misses.map(() => null));
    const items = parsed.map((it, i) => ({
      ...it,
      doc: named[i] ?? pages[misses.indexOf(it)] ?? "",
    }));
    const { fresh } = classifySyntax(items, input.syntaxSeen ?? {});
    // An intro snippet that is the answer gives the exercise away before it starts.
    const intro = await validateDocLinks(
      stripLeakingBlocks(last.intro, answerLines(last.solution, last.starterCode)),
      input.moduleId,
      { context: lessonContext, findPages: (refs) => findDocPages(input.moduleId, refs) }
    );
    // Then the syntax it shows as inline code, linked to where the docs define it.
    const linked = await linkInlineCode(ensureSyntaxLinks(intro, fresh), input.moduleId, (t) =>
      canonicalDocTerm(input.moduleId, t)
    );
    last = { ...last, syntax: items, intro: linked };
  }

  return last;
}

/** A code check — code_matches, or a stdout check's "code" — that fails against the lesson's own solution, graded as grade.ts does. */
function codeCheckRejects(o: Objective, solution: string | undefined): boolean {
  const c = o.check;
  const pattern = c?.type === "code_matches" ? c.value : c?.code;
  if (pattern === undefined || !solution) return false;
  try {
    return !new RegExp(pattern, "m").test(solution);
  } catch {
    return !solution.includes(pattern); // grade.ts treats an invalid regexp as plain text
  }
}

/** Objectives whose structural rules fail on the lesson's own solution (unparseable code: none). */
function rulesRejectingSolution(objectives: Objective[], solution: string | undefined, spec: RuntimeSpec): Promise<Set<string>> {
  return rulesFailing(objectives, solution, spec.monacoLang);
}

/** A stdout check of text the solution does not write literally (so it computes it), with no "code" to require how. */
function printsComputedWithoutCode(o: Objective, solution: string | undefined): boolean {
  const c = o.check;
  if (!c || c.type === "code_matches" || c.code || c.rules?.length || !solution) return false;
  const src = solution.replace(/\s+/g, " ");
  return c.value
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .some((l) => !src.includes(l));
}

// Run a self-contained JS snippet in a Node sandbox, capturing console + errors.
// Only meaningful for pure-JS logic (no DOM / no browser APIs).
export function runJsInSandbox(code: string): { ok: boolean; error?: string; output: string } {
  const logs: string[] = [];
  // The learner's console formatter, not a lookalike. Validation is only meaningful
  // if it sees the same text the learner will: this sandbox used to print
  // `[99,2,3]` where the browser prints something else, so a check could be
  // validated here and be unpassable there.
  const push = (...a: unknown[]) => logs.push(formatConsoleArgs(a));
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
      // The value was wrong, not how it is produced: a stdout check keeps its "code".
      const code = c.type !== "code_matches" && o.check && o.check.type !== "code_matches" ? o.check.code : undefined;
      const rules = o.check?.rules;
      return { ...o, check: { type: c.type, value: c.value, ...(code ? { code } : {}), ...(rules ? { rules } : {}) } as ObjectiveCheck };
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

  // (1a) Solution must RUN. A throw is the solution's fault; regenerate it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = runJsInSandbox(current.solution!);
    if (!run.error) break;
    const fixed = await fixSolution({
      objectives: current.objectives,
      starterCode: current.starterCode,
      solution: current.solution!,
      error: run.error,
      language: spec.langName,
    });
    if (!fixed) break;
    current = { ...current, solution: fixed };
  }

  // (1b) Every check must pass against a solution that RUNS CLEAN — and when it
  // doesn't, the CHECK is the suspect, not the solution. This used to blame the
  // solution and regenerate it, which left the bad check in place and shipped an
  // objective no correct answer could ever satisfy: the learner prints exactly the
  // right thing, is told it's wrong, and follows contradictory hints in circles.
  // The solution's real output is the ground truth to reground it on.
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = runJsInSandbox(current.solution!);
    if (run.error) break; // (1a) already did what it could
    const g = gradeSubmission(current.objectives, current.solution!, run.output, spec.forbid);
    if (!g.gradable || g.allPassed) break;
    const repaired = await fixChecks({
      objectives: current.objectives,
      failingIds: g.results.filter((r) => !r.passed).map((r) => r.id),
      solution: current.solution!,
      solutionOutput: run.output,
      language: spec.langName,
    });
    if (!repaired) break;
    current = { ...current, objectives: repaired };
  }

  // (2) Starter must leave a gap — it must NOT already pass all checks.
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = runJsInSandbox(current.starterCode);
    const g = gradeSubmission(current.objectives, current.starterCode, run.output, spec.forbid);
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
