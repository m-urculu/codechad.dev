// Deterministic, programmatic grading — the AUTHORITATIVE pass/fail for a submission.
// Runs each objective's machine check against the learner's code + run output. No LLM
// is involved here; guidance (the LLM's job) is a separate step, fed these results.

import type { Objective } from "./lesson";
import type { ForbidLang } from "@/lib/runtimes/registry";
import { stripComments } from "@/lib/runtimes/comments";
import { checkStructure, describeRule, grammarFor, inventory, renameToSolution } from "@/lib/structure";

export type GradeResult = { id: string; passed: boolean; detail?: string };
/**
 * `ran`: the program actually ran (it compiled, its toolchain loaded). A lesson is only
 * COMPLETE on a run that did — see gradeSubmission.
 */
export type Grade = { results: GradeResult[]; allPassed: boolean; gradable: boolean; ran: boolean };

// Normalize console output for comparison: strip CR, collapse each line's interior
// runs of spaces/tabs to one space and trim it, drop leading/trailing blank lines.
// Collapsing makes checks robust to column padding (SQL result tables align cells
// with spaces — a check authored as "a | b" must match "a    | b"). Line order and
// interior blank lines are preserved.
function norm(s: string): string {
  return String(s ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

// Does `want` appear as a contiguous run of lines inside `got`?
//
// This is what makes "stdout_equals" tolerant of a learner's own debugging. Exploring
// with an extra console.log / print is good practice, and failing a correct answer
// because of leftover tracing teaches the wrong lesson — what is being assessed is the
// result, not the route taken to it.
//
// Requiring the lines to be CONTIGUOUS and IN ORDER keeps the check meaningful: the
// expected block must still be produced as a unit, so a passing run genuinely contains
// the required output rather than the right words scattered across unrelated lines.
function containsLineBlock(got: string, want: string): boolean {
  // An empty expectation still means "print nothing" — don't let it match anything.
  if (want === "") return got === "";
  const g = got.split("\n");
  const w = want.split("\n");
  if (w.length > g.length) return false;
  for (let i = 0; i + w.length <= g.length; i++) {
    let ok = true;
    for (let j = 0; j < w.length; j++) {
      if (g[i + j] !== w[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// Printing a collection is the same achievement however the console renders it.
//
// An expected value for an array or object is written one way — `[ 99, 2, 3 ]`,
// `[99,2,3]`, or indented across five lines — and which one a console produces is
// a detail of the runtime, not of the learner's answer. Judging that difference
// marks a correct answer wrong and, worse, sends the tutor hunting for a mistake
// that isn't there. So when the expectation contains a bracket, fall back to a
// comparison that ignores layout and quote style.
//
// Restricted to bracketed values on purpose: collapsing whitespace out of ordinary
// prose would start matching text the learner never printed.
function collapse(s: string): string {
  return (
    s
      .replace(/\s+/g, "")
      .replace(/'/g, '"')
      // Quote bare object keys, so Node's { name: 'Ada' } and the console's
      // {"name":"Ada"} collapse to the same text. A key is an identifier directly
      // after "{" or "," and followed by ":".
      .replace(/([{,])([A-Za-z_$][\w$]*):/g, '$1"$2":')
  );
}
function isCollection(want: string): boolean {
  return /[[{]/.test(want);
}
// The expected collection must appear at the TOP LEVEL of the output — as a value the
// learner printed, not nested inside a bigger one. Otherwise printing a whole matrix
// would pass a check for its first row, because "[1,2,3]" is literally inside
// "[[1,2,3],[4,5,6]]". Text before it at the top level (a label like "result:") is fine.
function sameCollection(got: string, want: string): boolean {
  if (!isCollection(want)) return false;
  const g = collapse(got);
  const w = collapse(want);
  let depth = 0;
  let inString = false;
  for (let i = 0; i < g.length; i++) {
    if (depth === 0 && g.startsWith(w, i)) return true;
    const ch = g[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"' && depth > 0) {
      // Strings are only tracked INSIDE a collection: at the top level a quote is
      // prose (Python's print("Here's the list:", ...)), and brackets inside a string
      // value must not count towards depth.
      inString = true;
    } else if (ch === "[" || ch === "{") {
      depth++;
    } else if ((ch === "]" || ch === "}") && depth > 0) {
      depth--;
    }
  }
  return false;
}

// The exact strings the runtime engines emit when the learner's program never got a
// chance to run at all — a failed compile/transpile, or a toolchain that didn't load
// (see src/lib/runtimes/engine*.ts).
//
// What a run that never happened can and cannot show. Output checks: nothing — there
// is no output. Code checks: exactly what they always show, the source text; a
// learner who has written `int score{100};` correctly has done that objective even if
// a line they have not reached yet still breaks the compile. Crediting it is what
// lets a lesson tick off one objective at a time — failing every objective until the
// whole program compiled made three steps look like one. What a non-running program
// must never do is COMPLETE the lesson: allPassed requires a run that ran.
const NEVER_RAN = [
  /^Compilation failed\b/m,
  /^Compilation produced no program\.$/m,
  /^TypeScript error:/m,
  /^Failed to (load|start) .+:/m,
];

function neverRan(output: string): boolean {
  return NEVER_RAN.some((re) => re.test(output));
}

// How many separate times `want` was printed: non-overlapping substrings for
// stdout_includes, non-overlapping line blocks for stdout_equals.
function occurrences(type: "stdout_equals" | "stdout_includes", got: string, want: string): number {
  if (want === "") return got === "" ? 1 : 0;
  let n = 0;
  if (type === "stdout_includes") {
    for (let i = got.indexOf(want); i !== -1; i = got.indexOf(want, i + want.length)) n++;
    return n;
  }
  const g = got.split("\n");
  const w = want.split("\n");
  for (let i = 0; i + w.length <= g.length; ) {
    if (w.every((line, j) => g[i + j] === line)) {
      n++;
      i += w.length;
    } else i++;
  }
  return n;
}

/**
 * Objectives whose output checks expect the SAME text can't tell each other apart:
 * "print 17 + 25, producing `42`" and "print 6 * 7, producing `42`" were both met by
 * one `std::cout << 17 + 25;`, completing the lesson with half of it unwritten. So
 * the n-th objective of such a group needs the text printed n times.
 */
function repeatsNeeded(objectives: Objective[]): Map<string, number> {
  const seen = new Map<string, number>();
  const need = new Map<string, number>();
  for (const o of objectives) {
    const c = o.check;
    if (!c || c.type === "code_matches") continue;
    const key = `${c.type}\u0000${norm(c.value)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) need.set(o.id, n);
  }
  return need;
}

function codeMatches(pattern: string, code: string, bare?: string): boolean {
  let re: RegExp | null = null;
  try {
    re = new RegExp(pattern, "m");
  } catch {
    re = null;
  }
  // The code as written, or — given its language — the same code without comments.
  // A check is written against the lesson's comment-free solution; a learner who
  // keeps the starter's `// TODO` lines must not fail it for that.
  const test = (text: string) => (re ? re.test(text) : text.includes(pattern));
  return test(code) || (bare !== undefined && bare !== code && test(bare));
}

// A stdout check with a "code" pattern (lesson.ts) also requires HOW the value was
// produced: the right number printed as a literal is not the objective.
function checkOne(obj: Objective, code: string, output: string, bare?: string, times = 1, structural?: boolean, free?: string[]): GradeResult {
  const c = obj.check;
  // Structural rules, when the code could be parsed, decide a code check outright.
  if (c?.type === "code_matches" && c.rules?.length && structural !== undefined) {
    return { id: obj.id, passed: structural, detail: structural ? undefined : `the code should ${c.rules.map(describeRule).join(", and ")}` };
  }
  const r = checkOutputOrCode(obj, code, output, bare, times, free);
  if (r.passed && c && c.type !== "code_matches" && c.rules?.length && structural === false) {
    return {
      id: obj.id,
      passed: false,
      detail: `the output is right, but the code must ${c.rules.map(describeRule).join(", and ")} — not print the value directly`,
    };
  }
  if (r.passed && c && c.type !== "code_matches" && c.code && structural === undefined && !codeMatches(c.code, code, bare)) {
    return {
      id: obj.id,
      passed: false,
      detail: `the output is right, but the code must produce it the way the objective says (it should satisfy /${c.code}/), not print the value directly`,
    };
  }
  return r;
}

// ---------- printed text is the learner's to choose ----------
//
// What a lesson checks is the program, not its prose. "Print `Learning void
// functions!`" failed a correct program over `funtions`, and a learner who words a
// message their own way is not wrong. So the text the lesson's solution writes as
// string literals is free in the output: an expected line made of it matches any
// text there. What the program COMPUTES — a number from a variable, a call's result,
// anything not written out literally in the solution — must still match exactly:
// "Total: 42" accepts "Sum = 42", not "Total: 41".

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text the solution writes literally: its string literals, split at interpolations and line breaks. */
export function literalText(solution: string, lang?: ForbidLang): string[] {
  const src = lang && lang !== "none" ? stripComments(solution, lang) : solution;
  const out = new Set<string>();
  for (const m of src.matchAll(/"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`([^`]*)`/g)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\(.)/g, "$1");
    // Interpolations and format specifiers are computed: {x}, ${x}, #{x}, %d, %.2f.
    for (const part of raw.split(/\$?\{[^}]*\}|#\{[^}]*\}|%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z]|\n/)) {
      const t = part.replace(/[ \t]+/g, " ").trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t)) out.add(t);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** A line, with the solution's literal text in it made free; null when it has none. */
function freeLine(line: string, free: string[]): string | null {
  let marked = line;
  for (const f of free) if (f.length) marked = marked.split(f).join("\u0001");
  if (!marked.includes("\u0001")) return null;
  return marked
    .split("\u0001")
    .map((p) => escRe(p.trim()))
    .join("\u0002")
    // Free text is still text: it has a letter (a bare number is a computed line).
    .replace(/\u0002/g, ".*?[A-Za-z].*?");
}

/** Matchers for an expectation whose text is (partly) free, or null when it is all computed. */
function freeMatcher(want: string, free: string[] | undefined): { lines: RegExp[]; inline: RegExp } | null {
  if (!free?.length) return null;
  const lines = want.split("\n");
  const sources = lines.map((l) => freeLine(l, free));
  if (sources.every((x) => x === null)) return null;
  const src = sources.map((x, i) => x ?? escRe(lines[i]));
  return { lines: src.map((x) => new RegExp(`^${x}$`)), inline: new RegExp(src.join("\\n")) };
}

// Free-text objectives each claim their own output: one line printed in your own
// words must not meet "print the greeting" AND "print the farewell".
function claimFreeLines(objectives: Objective[], results: GradeResult[], output: string, free: string[] | undefined): void {
  if (!free?.length) return;
  const g = norm(output).split("\n");
  const used = new Set<number>();
  for (const o of objectives) {
    const c = o.check;
    if (!c || c.type === "code_matches") continue;
    const r = results.find((x) => x.id === o.id);
    const m = freeMatcher(norm(c.value), free);
    if (!r || !r.passed || !m) continue;
    let at = -1;
    for (let i = 0; i + m.lines.length <= g.length && at < 0; i++) {
      const lines = m.lines.map((_, j) => i + j);
      const fits =
        c.type === "stdout_includes" && m.lines.length === 1 ? m.inline.test(g[i]) : m.lines.every((re, j) => re.test(g[i + j]));
      if (fits && lines.every((l) => !used.has(l))) at = i;
    }
    if (at < 0) {
      r.passed = false;
      r.detail = `each objective needs its own line of output: another objective's line can't count for this one; got ${JSON.stringify(norm(output))}`;
    } else m.lines.forEach((_, j) => used.add(at + j));
  }
}

/** Does the output show `expected`, with the solution's literal text free (used by the changed-data run)? */
export function outputShows(type: "stdout_equals" | "stdout_includes", output: string, expected: string, free: string[]): boolean {
  const m = freeMatcher(norm(expected), free);
  if (!m) return type === "stdout_includes" ? norm(output).includes(norm(expected)) : containsLineBlock(norm(output), norm(expected));
  return freeOccurrences(type, norm(output), m) > 0;
}

function freeOccurrences(type: "stdout_equals" | "stdout_includes", got: string, m: { lines: RegExp[]; inline: RegExp }): number {
  if (type === "stdout_includes") return (got.match(new RegExp(m.inline.source, "g")) ?? []).length;
  const g = got.split("\n");
  let n = 0;
  for (let i = 0; i + m.lines.length <= g.length; ) {
    if (m.lines.every((re, j) => re.test(g[i + j]))) {
      n++;
      i += m.lines.length;
    } else i++;
  }
  return n;
}

function checkOutputOrCode(obj: Objective, code: string, output: string, bare?: string, times = 1, free?: string[]): GradeResult {
  const c = obj.check;
  if (!c) return { id: obj.id, passed: false, detail: "no deterministic check" };

  if (c.type === "stdout_equals" || c.type === "stdout_includes") {
    const want = norm(c.value);
    const m = freeMatcher(want, free);
    if (m) {
      const got = norm(output);
      const passed = freeOccurrences(c.type, got, m) >= times || (times === 1 && sameCollection(got, want));
      return {
        id: obj.id,
        passed,
        detail: passed
          ? undefined
          : times > 1
            ? `another objective prints the same kind of line: the output must show it ${times} times, once per objective; got ${JSON.stringify(got)}`
            : `expected the output to include a line like ${JSON.stringify(want)} (your own wording is fine, computed values must match); got ${JSON.stringify(got)}`,
      };
    }
  }

  if (times > 1 && (c.type === "stdout_equals" || c.type === "stdout_includes")) {
    const want = norm(c.value);
    const got = norm(output);
    const passed = occurrences(c.type, got, want) >= times;
    return {
      id: obj.id,
      passed,
      detail: passed
        ? undefined
        : `another objective also prints ${JSON.stringify(want)}: the output must show it ${times} times, once per objective; got ${JSON.stringify(got)}`,
    };
  }

  if (c.type === "stdout_equals") {
    const want = norm(c.value);
    const got = norm(output);
    const passed = containsLineBlock(got, want) || sameCollection(got, want);
    return {
      id: obj.id,
      passed,
      detail: passed
        ? undefined
        : `expected the output to include ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
    };
  }
  if (c.type === "stdout_includes") {
    const want = norm(c.value);
    const got = norm(output);
    const passed = got.includes(want) || sameCollection(got, want);
    return { id: obj.id, passed, detail: passed ? undefined : `output must contain ${JSON.stringify(want)}; got ${JSON.stringify(got)}` };
  }
  // code_matches
  const passed = codeMatches(c.value, code, bare);
  return { id: obj.id, passed, detail: passed ? undefined : `code should satisfy /${c.value}/` };
}

// A variable the compiler reports as never used, when an objective names it.
//
// A warning does not stop the program, so it never blocks a run. But this one means
// the work the objective set up went nowhere: a chapter review asked to declare
// `total` and print it, and `std::cout << 50;` printed the right number with `total`
// unused — clang said so (`unused variable 'total'`) and the lesson completed anyway.
// It catches that in lessons saved before checks carried a "code" pattern.
// Clang and GCC: "unused variable 'x'", "variable 'x' set but not used" (GCC quotes
// with ‘x’).
const UNUSED = /warning: (?:unused variable|variable) ['‘`]([A-Za-z_]\w*)['’`](?: set but not used)?/g;

function unusedNamedVariables(objectives: Objective[], output: string): string[] {
  const names = new Set(Array.from(output.matchAll(UNUSED), (m) => m[1]));
  const text = objectives.map((o) => `${o.description} ${o.check?.value ?? ""}`).join("\n");
  return [...names].filter((n) => new RegExp(`(^|[^\\w])${n}([^\\w]|$)`).test(text));
}

// Grade a submission. `gradable` is false when any objective lacks a check — the caller
// should then fall back to LLM grading for backward compatibility with older lessons.
export { repeatsNeeded };

/**
 * gradeSubmission, with each check's structural rules evaluated on the code's syntax
 * tree first. `monacoLang` picks the grammar (RuntimeSpec.monacoLang). Async only
 * because a grammar loads on first use.
 */
export async function gradeWithStructure(
  objectives: Objective[],
  code: string,
  output: string,
  lang: ForbidLang | undefined,
  monacoLang: string | undefined,
  /** The lesson's solution and starter, for the functions check below. */
  lesson?: { solution?: string; starter?: string }
): Promise<Grade> {
  const grammar = grammarFor(monacoLang);
  // The learner's own names for the lesson's functions count as the lesson's (see
  // renameToSolution). Output is untouched: only how the code is read changes.
  if (lesson?.solution) code = await renameToSolution(grammar, code, lesson.solution, lesson.starter ?? "");
  const rules = Object.fromEntries(objectives.filter((o) => o.check?.rules?.length).map((o) => [o.id, o.check!.rules!]));
  const structural = Object.keys(rules).length ? await checkStructure(grammar, code, rules) : {};
  const grade = gradeSubmission(objectives, code, output, lang, structural, lesson?.solution ? literalText(lesson.solution, lang) : undefined);
  if (lesson?.solution) await requireSolutionFunctions(grade, objectives, code, lesson.solution, lesson.starter ?? "", grammar);
  return grade;
}

// The functions the lesson's solution writes, the learner must write too.
//
// A safety net under every lesson, including those saved before checks carried
// structural rules: "Introduction to functions" asked to define `greet` and call it,
// and checked the call by output alone — printing the message straight from `main`,
// with `greet` printing something else and never called, completed it. Read from the
// solution itself: each function it defines that the starter does not, and each of
// those it calls where the starter does not, must be defined / called in the learner's
// code. Only the solution's OWN functions — a library call (`std::sqrt`) has
// alternatives a learner may rightly choose. The miss fails the objective that names
// the function ("Call `greet`…"); when none does, nothing is failed.
async function requireSolutionFunctions(
  grade: Grade,
  objectives: Objective[],
  code: string,
  solution: string,
  starter: string,
  grammar: string | null
): Promise<void> {
  const [sol, start, mine] = await Promise.all([inventory(grammar, solution), inventory(grammar, starter), inventory(grammar, code)]);
  if (!sol || !start || !mine) return;
  const missing: { name: string; what: "define" | "call" | "return" | "print" }[] = [];
  for (const f of sol.defines.keys()) {
    if (f === "main") continue;
    if (!start.defines.has(f) && !mine.defines.has(f)) missing.push({ name: f, what: "define" });
    else {
      // A function the solution makes return a value must return one: printing the
      // result inside it instead is a different function.
      if (sol.returnsValue.has(f) && !start.returnsValue.has(f) && !mine.returnsValue.has(f)) missing.push({ name: f, what: "return" });
      if (sol.calls.has(f) && !start.calls.has(f) && !mine.calls.has(f)) missing.push({ name: f, what: "call" });
      // And one the solution makes print must print: with the printed words free
      // (literalText), this is what stops "the message" from coming from elsewhere.
      if (sol.printsIn.has(f) && !start.printsIn.has(f) && !mine.printsIn.has(f)) missing.push({ name: f, what: "print" });
    }
  }
  for (const m of missing) {
    const names = (o: Objective) => new RegExp(`(^|[^\\w])${m.name}([^\\w]|$)`).test(o.description.replace(/[`"']/g, " "));
    const target =
      objectives.find((o) => names(o) && (m.what === "call" ? /\bcall/i : /\b(defin|writ|creat|declar|return|print)/i).test(o.description)) ??
      objectives.find(names);
    const r = target && grade.results.find((x) => x.id === target.id);
    if (!r || !r.passed) continue;
    r.passed = false;
    r.detail =
      m.what === "call"
        ? `the program must call \`${m.name}()\` — producing its output another way (printing it directly) doesn't count`
        : m.what === "return"
          ? `\`${m.name}\` must \`return\` its result — printing it inside the function doesn't count`
          : m.what === "print"
            ? `\`${m.name}\` itself must print the message — printing it from somewhere else doesn't count`
            : `the program must define the function \`${m.name}\``;
  }
  grade.allPassed = grade.gradable && grade.ran && grade.results.every((r) => r.passed);
}

/** Objectives whose structural rules fail on `code` — a lesson's own solution, to find bad rules. Unparseable: none. */
export async function rulesFailing(objectives: Objective[], code: string | undefined, monacoLang: string | undefined): Promise<Set<string>> {
  if (!code) return new Set();
  const rules = Object.fromEntries(objectives.filter((o) => o.check?.rules?.length).map((o) => [o.id, o.check!.rules!]));
  if (!Object.keys(rules).length) return new Set();
  const res = await checkStructure(grammarFor(monacoLang), code, rules);
  return new Set(Object.keys(res).filter((k) => res[k] === false));
}

/** The objectives, with the structural rules of `ids` removed: their checks fall back to the regexp. */
export function withoutRules(objectives: Objective[], ids: Set<string>): Objective[] {
  return objectives.map((o) => {
    if (!ids.has(o.id) || !o.check) return o;
    const { rules: _drop, ...check } = o.check;
    void _drop;
    return { ...o, check: check as typeof o.check };
  });
}

export function gradeSubmission(
  objectives: Objective[],
  code: string,
  output: string,
  lang?: ForbidLang,
  structural: Record<string, boolean | undefined> = {},
  /** Text the solution writes literally, free in the output (literalText). */
  free?: string[]
): Grade {
  const gradable = objectives.length > 0 && objectives.every((o) => !!o.check);
  const ran = !neverRan(output);
  const bare = lang && lang !== "none" ? stripComments(code, lang) : undefined;
  const need = repeatsNeeded(objectives);
  const results = objectives.map((o) =>
    !ran && o.check && o.check.type !== "code_matches"
      ? { id: o.id, passed: false, detail: "the program didn't run — fix the error in the console before this can pass" }
      : checkOne(o, code, output, bare, need.get(o.id), structural[o.id], free)
  );
  claimFreeLines(objectives, results, output, free);
  // An unused variable an objective names fails the output objectives: the value they
  // print did not come from it. Without output objectives, the ones that name it.
  const unused = ran ? unusedNamedVariables(objectives, output) : [];
  if (unused.length) {
    const outputIds = objectives.filter((o) => o.check && o.check.type !== "code_matches").map((o) => o.id);
    const named = (o: Objective) => unused.some((n) => new RegExp(`(^|[^\\w])${n}([^\\w]|$)`).test(o.description));
    const hit = new Set(outputIds.length ? outputIds : objectives.filter(named).map((o) => o.id));
    const list = unused.map((n) => `\`${n}\``).join(", ");
    for (const r of results) {
      if (hit.has(r.id) && r.passed) {
        r.passed = false;
        r.detail = `the compiler warns that ${list} is never used: the program has to use it to produce its output, not print the value directly`;
      }
    }
  }
  return { results, allPassed: gradable && ran && results.every((r) => r.passed), gradable, ran };
}
