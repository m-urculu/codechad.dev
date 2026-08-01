// Deterministic, programmatic grading — the AUTHORITATIVE pass/fail for a submission.
// Runs each objective's machine check against the learner's code + run output. No LLM
// is involved here; guidance (the LLM's job) is a separate step, fed these results.

import type { Objective } from "./lesson";

export type GradeResult = { id: string; passed: boolean; detail?: string };
export type Grade = { results: GradeResult[]; allPassed: boolean; gradable: boolean };

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
  return s.replace(/\s+/g, "").replace(/'/g, '"');
}
function isCollection(want: string): boolean {
  return /[[{]/.test(want);
}
function sameCollection(got: string, want: string): boolean {
  return isCollection(want) && collapse(got).includes(collapse(want));
}

// The exact strings the runtime engines emit when the learner's program never got a
// chance to run at all — a failed compile/transpile, or a toolchain that didn't load
// (see src/lib/runtimes/engine*.ts). A `code_matches` check only looks at source text,
// so a program that fails to compile can still textually contain the right constructs
// and pass. These markers close that gap: if none of the code actually ran, nothing was
// accomplished, regardless of what any individual check says.
const NEVER_RAN = [
  /^Compilation failed\b/m,
  /^Compilation produced no program\.$/m,
  /^TypeScript error:/m,
  /^Failed to (load|start) .+:/m,
];

function neverRan(output: string): boolean {
  return NEVER_RAN.some((re) => re.test(output));
}

function checkOne(obj: Objective, code: string, output: string): GradeResult {
  const c = obj.check;
  if (!c) return { id: obj.id, passed: false, detail: "no deterministic check" };

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
  let re: RegExp | null = null;
  try {
    re = new RegExp(c.value, "m");
  } catch {
    re = null;
  }
  const passed = re ? re.test(code) : code.includes(c.value);
  return { id: obj.id, passed, detail: passed ? undefined : `code should satisfy /${c.value}/` };
}

// Grade a submission. `gradable` is false when any objective lacks a check — the caller
// should then fall back to LLM grading for backward compatibility with older lessons.
export function gradeSubmission(objectives: Objective[], code: string, output: string): Grade {
  const gradable = objectives.length > 0 && objectives.every((o) => !!o.check);
  if (gradable && neverRan(output)) {
    const results = objectives.map((o) => ({
      id: o.id,
      passed: false,
      detail: "the program didn't run — fix the error in the console before objectives can pass",
    }));
    return { results, allPassed: false, gradable };
  }
  const results = objectives.map((o) => checkOne(o, code, output));
  return { results, allPassed: gradable && results.every((r) => r.passed), gradable };
}
