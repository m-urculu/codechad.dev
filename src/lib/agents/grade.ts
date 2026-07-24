// Deterministic, programmatic grading — the AUTHORITATIVE pass/fail for a submission.
// Runs each objective's machine check against the learner's code + run output. No LLM
// is involved here; guidance (the LLM's job) is a separate step, fed these results.

import type { Objective } from "./lesson";

export type GradeResult = { id: string; passed: boolean; detail?: string };
export type Grade = { results: GradeResult[]; allPassed: boolean; gradable: boolean };

// Normalize console output for comparison: strip CR, trim each line's trailing space,
// drop leading/trailing blank lines. Order and interior blank lines are preserved.
function norm(s: string): string {
  return String(s ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

function checkOne(obj: Objective, code: string, output: string): GradeResult {
  const c = obj.check;
  if (!c) return { id: obj.id, passed: false, detail: "no deterministic check" };

  if (c.type === "stdout_equals") {
    const want = norm(c.value);
    const got = norm(output);
    return { id: obj.id, passed: got === want, detail: got === want ? undefined : `expected output ${JSON.stringify(want)}, got ${JSON.stringify(got)}` };
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
