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

function checkOne(obj: Objective, code: string, output: string): GradeResult {
  const c = obj.check;
  if (!c) return { id: obj.id, passed: false, detail: "no deterministic check" };

  if (c.type === "stdout_equals") {
    const want = norm(c.value);
    const got = norm(output);
    const passed = containsLineBlock(got, want);
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
    return { id: obj.id, passed: got.includes(want), detail: got.includes(want) ? undefined : `output must contain ${JSON.stringify(want)}; got ${JSON.stringify(got)}` };
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
  const results = objectives.map((o) => checkOne(o, code, output));
  return { results, allPassed: gradable && results.every((r) => r.passed), gradable };
}
