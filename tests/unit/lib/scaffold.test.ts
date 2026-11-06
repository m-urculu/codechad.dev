import { describe, expect, it } from "vitest";
import { applyScaffold, cleanHistory, countWritten, planScaffold, skeletonWritten } from "@/lib/scaffold";
import { gradeSubmission } from "@/lib/agents/grade";

// The program skeleton fades in and out by what the learner has written. Design:
// src/lib/scaffold.ts.

const STARTER = `#include <iostream>

int main() {
    int a = 17;
    // TODO: print a + 25
    if (a > 0) { std::cout << "{"; }
    return 0;
}`;

const SOLUTION = `#include <iostream>

int main() {
    int a = 17;
    std::cout << a + 25;
    if (a > 0) { std::cout << "{"; }
    return 0;
}`;

describe("planScaffold", () => {
  it("gives the skeleton in the first lessons", () => {
    expect(planScaffold("cpp", { lessons: 0, written: {} })).toEqual({ mode: "full", omit: [] });
    expect(planScaffold("cpp", { lessons: 2, written: {} }).omit).toEqual([]);
  });

  it("then leaves out one piece at a time, until it has been written twice", () => {
    expect(planScaffold("cpp", { lessons: 3, written: {} })).toEqual({ mode: "practice", omit: ["include"] });
    expect(planScaffold("cpp", { lessons: 4, written: { include: 1 } })).toEqual({ mode: "practice", omit: ["include"] });
    // The case this was tuned for: #include written in two lessons, and the third asked again.
    expect(planScaffold("cpp", { lessons: 5, written: { include: 2 } })).toEqual({ mode: "practice", omit: ["main"] });
    expect(planScaffold("cpp", { lessons: 6, written: { include: 2, main: 2 } })).toEqual({ mode: "full", omit: [] });
  });

  it("then only in a review, every eighth lesson", () => {
    expect(planScaffold("cpp", { lessons: 15, written: { include: 5, main: 5 } })).toEqual({ mode: "review", omit: ["include", "main"] });
    expect(planScaffold("cpp", { lessons: 16, written: { include: 5, main: 5 } })).toEqual({ mode: "full", omit: [] });
  });

  it("does nothing for a language without a skeleton", () => {
    expect(planScaffold("python", { lessons: 9, written: {} }).omit).toEqual([]);
  });
});

describe("applyScaffold", () => {
  it("replaces the #include lines with a TODO, and grades writing them", () => {
    const { starter, objectives } = applyScaffold("cpp", { mode: "practice", omit: ["include"] }, STARTER, SOLUTION);
    expect(starter).not.toMatch(/#include/);
    expect(starter.startsWith("// TODO: include")).toBe(true);
    expect(objectives.map((o) => o.id)).toEqual(["skeleton-include"]);
    expect(gradeSubmission(objectives, starter, "").results[0].passed).toBe(false);
    expect(gradeSubmission(objectives, SOLUTION, "").results[0].passed).toBe(true);
  });

  it("unwraps main, keeping its body, braces inside strings and blocks included", () => {
    const { starter } = applyScaffold("cpp", { mode: "practice", omit: ["main"] }, STARTER, SOLUTION);
    expect(starter).toBe(`#include <iostream>

// TODO: wrap the code below in the main function, the program's entry point, and return 0 from it
int a = 17;
// TODO: print a + 25
if (a > 0) { std::cout << "{"; }`);
  });

  it("removes Go's package, import block and main", () => {
    const go = `package main\n\nimport (\n    "fmt"\n)\n\nfunc main() {\n    fmt.Println(1)\n}`;
    const { starter, objectives } = applyScaffold("go", { mode: "review", omit: ["package", "import", "main"] }, go, go);
    expect(objectives).toHaveLength(3);
    expect(starter).not.toMatch(/^(package|import|func)\b/m);
    expect(starter).toMatch(/^fmt\.Println\(1\)$/m);
  });

  it("leaves a piece alone when the solution lacks it", () => {
    const r = applyScaffold("cpp", { mode: "practice", omit: ["main"] }, "#include <cstdio>", "#include <cstdio>");
    expect(r.objectives).toEqual([]);
  });
});

describe("skeletonWritten and countWritten", () => {
  it("counts only what the learner typed, not what the starter gave", () => {
    const given = applyScaffold("cpp", { mode: "practice", omit: ["include"] }, STARTER, SOLUTION).starter;
    expect(skeletonWritten("cpp", given, SOLUTION)).toEqual(["include"]);
    expect(skeletonWritten("cpp", STARTER, SOLUTION)).toEqual([]);
    expect(countWritten([["include"], [], ["include", "main"], undefined])).toEqual({ include: 2, main: 1 });
  });

  it("cleans a history sent by the browser", () => {
    expect(cleanHistory({ lessons: "4", written: { include: 2, "bad key": 9 } })).toEqual({ lessons: 4, written: { include: 2 } });
    expect(cleanHistory(null)).toBeUndefined();
  });
});

describe("applyScaffold when the model already left a piece out", () => {
  it("still grades it, replacing a TODO that gave the answer away", () => {
    const leaky = `// TODO: Add the #include <iostream> header directive here\n\nint main() {\n    return 0;\n}`;
    const { starter, objectives } = applyScaffold("cpp", { mode: "practice", omit: ["include"] }, leaky, SOLUTION);
    expect(objectives.map((o) => o.id)).toEqual(["skeleton-include"]);
    expect(starter).not.toMatch(/iostream/);
    expect(starter.startsWith("// TODO: include the header(s)")).toBe(true);
  });
});
