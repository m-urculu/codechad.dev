// Changed-data runs: does the learner's program compute its output, or print it?
//
// An output check sees only text. `std::cout << 50;` and `std::cout << total;` both
// print 50, and both used to pass "print the total". So a submission whose output
// passes is run once more with the data changed — the values the STARTER gives
// (`int baseUnits{10};` → 13) changed the same way in the learner's code and in the
// lesson's reference solution. The solution's new output is what a program that
// really computes the answer prints now; the learner's must print the same. A
// printed literal does not change with the data, so it fails, and every correct way
// of computing the value passes — nothing here reads how the code is written.
//
// Only values the starter gives are changed: those are the exercise's data. Values
// the learner writes ARE the exercise ("print 17 + 25"), and lessons like that rely
// on structural rules (structure.ts) instead. A change the solution does not survive
// (an array size, a loop bound — it errors, or prints nothing different) means that
// value is not data, and the run proves nothing: it is skipped, never failed.
//
// Pure functions; running the programs is the caller's (ChatPanel), with the same
// off-screen runner the lesson's background validation uses.

import type { Objective } from "./lesson";

export type Given = { name: string; value: string; next: string };

// `name = 10`, `name{10}`, `name := 10`, `$name = 10`, `local name = 10`, ending the
// statement. Integers and decimals only: a changed string would change printed text
// the objectives quote.
const DECL = /(^|[^\w$.])(\$?[A-Za-z_]\w*)(\s*(?:\{\s*|:=\s*|(?<![=!<>+\-*/%&|^])=(?!=)\s*))(-?\d+(?:\.\d+)?)(?=\s*(?:\}\s*)?(?:;|,|\)|$))/gm;

function changed(value: string, i: number): string {
  // Different steps per value, so two values cannot change in a way that cancels out.
  const step = [3, 5, 7, 11, 13][i % 5];
  if (value.includes(".")) {
    const decimals = value.split(".")[1].length;
    return (Number(value) + step + 0.5).toFixed(decimals || 1);
  }
  return String(Number(value) + step);
}

/** The values the starter gives, each with the value it changes to. At most 5. */
export function givenValues(starter: string): Given[] {
  const out: Given[] = [];
  const seen = new Set<string>();
  // Comments are not code: a `// e.g. x = 5` must not count.
  const code = starter.replace(/\/\/[^\n]*|#(?!include)[^\n]*|--[^\n]*/g, "");
  for (const m of code.matchAll(DECL)) {
    const name = m[2];
    if (seen.has(name)) continue; // declared twice: which one is the data is unclear
    seen.add(name);
    out.push({ name, value: m[4], next: changed(m[4], out.length) });
    if (out.length >= 5) break;
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The code with each given value changed, or null when the code does not declare one as given. */
export function applyGiven(code: string, given: Given[]): string | null {
  let out = code;
  for (const g of given) {
    const re = new RegExp(`(^|[^\\w$.])(${escape(g.name)})(\\s*(?:\\{\\s*|:=\\s*|(?<![=!<>+\\-*/%&|^])=(?!=)\\s*))${escape(g.value)}(?![\\w.])`, "m");
    if (!re.test(out)) return null;
    out = out.replace(re, (_m, pre: string, name: string, sep: string) => `${pre}${name}${sep}${g.next}`);
  }
  return out;
}

/** The given values both programs still declare unchanged. */
export function sharedGiven(starter: string, solution: string, code: string): Given[] {
  return givenValues(starter).filter((g) => applyGiven(solution, [g]) !== null && applyGiven(code, [g]) !== null);
}

const norm = (s: string) =>
  String(s ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");

/**
 * What an output check expects under the changed data, read off the solution's two
 * runs: the same lines of its new output. Null when the check's text did not change
 * (this objective does not depend on the data) or cannot be located line for line.
 */
export function expectedAfterChange(check: { value: string }, before: string, after: string): string | null {
  const want = norm(check.value);
  const b = norm(before).split("\n");
  const a = norm(after).split("\n");
  if (!want || a.length !== b.length) return null;
  const w = want.split("\n");
  for (let i = 0; i + w.length <= b.length; i++) {
    if (w.every((l, j) => b[i + j] === l)) {
      const next = a.slice(i, i + w.length).join("\n");
      return next === want ? null : next;
    }
  }
  // Part of one line (stdout_includes): map it through the parts of the line that stayed.
  for (let i = 0; i < b.length; i++) {
    const at = b[i].indexOf(want);
    if (at < 0) continue;
    const L0 = b[i];
    const L1 = a[i];
    let pre = 0;
    while (pre < L0.length && pre < L1.length && L0[pre] === L1[pre]) pre++;
    let suf = 0;
    while (suf < L0.length - pre && suf < L1.length - pre && L0[L0.length - 1 - suf] === L1[L1.length - 1 - suf]) suf++;
    const end = at + want.length;
    if (at > pre || L0.length - end > suf) return null; // the change is outside what is mapped
    const next = L1.slice(at, L1.length - (L0.length - end));
    return next === want ? null : next;
  }
  return null;
}

/** Does `output` show `expected` the way the check's type requires? */
export function showsExpected(type: "stdout_equals" | "stdout_includes", output: string, expected: string): boolean {
  const got = norm(output);
  if (type === "stdout_includes") return got.includes(expected);
  const g = got.split("\n");
  const w = expected.split("\n");
  for (let i = 0; i + w.length <= g.length; i++) if (w.every((l, j) => g[i + j] === l)) return true;
  return false;
}

/** The output objectives a changed-data run can test: they passed, and their text depends on the data. */
export function variantTargets(objectives: Objective[], passedIds: string[]): Objective[] {
  return objectives.filter(
    (o) => passedIds.includes(o.id) && (o.check?.type === "stdout_equals" || o.check?.type === "stdout_includes")
  );
}

export function describeChange(given: Given[]): string {
  return given.map((g) => `\`${g.name}\` = ${g.next} (instead of ${g.value})`).join(", ");
}
