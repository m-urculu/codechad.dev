import { describe, expect, it } from "vitest";
import { gradeSubmission } from "@/lib/agents/grade";
import type { Objective, ObjectiveCheck } from "@/lib/agents/lesson";

// Build an objective with a short id; the description is irrelevant to grading.
function obj(id: string, check?: ObjectiveCheck): Objective {
  return { id, description: `objective ${id}`, check };
}

// Grade a single objective and return its one result.
function gradeOne(check: ObjectiveCheck, output: string, code = "") {
  return gradeSubmission([obj("o1", check)], code, output).results[0];
}

describe("gradeSubmission — stdout_equals", () => {
  it("passes when the output is exactly the expected text", () => {
    // Baseline: the simplest possible correct answer.
    const r = gradeOne({ type: "stdout_equals", value: "hello" }, "hello");
    expect(r.passed).toBe(true);
    expect(r.detail).toBeUndefined();
  });

  it("tolerates the learner's own debug lines before and after the expected block", () => {
    // Leftover console.log tracing must not fail a correct answer.
    const r = gradeOne(
      { type: "stdout_equals", value: "a\nb" },
      "debug: start\na\nb\ndebug: end"
    );
    expect(r.passed).toBe(true);
  });

  it("fails when an unrelated line splits the expected block", () => {
    // The expected lines must appear CONTIGUOUSLY, not just somewhere in the output.
    const r = gradeOne({ type: "stdout_equals", value: "a\nb" }, "a\nDEBUG\nb");
    expect(r.passed).toBe(false);
  });

  it("fails when the expected lines appear in the reverse order", () => {
    // Same lines, wrong order: the expected block must be printed in sequence.
    const r = gradeOne({ type: "stdout_equals", value: "a\nb" }, "b\na");
    expect(r.passed).toBe(false);
  });

  it("ignores CRLF line endings, padding inside a line, and blank lines at the edges", () => {
    // SQL result tables pad cells with spaces/tabs; "a | b" must match "a    |\tb".
    const r = gradeOne(
      { type: "stdout_equals", value: "\na | b\nc | d\n" },
      "\r\n\r\n  a    |\tb  \r\nc |   d\r\n\r\n"
    );
    expect(r.passed).toBe(true);
  });

  it("an empty expected value only matches empty output, not arbitrary output", () => {
    // "Print nothing" is a real expectation: an empty check must not pass every program.
    const check = { type: "stdout_equals", value: "" } as const;
    expect(gradeOne(check, "").passed).toBe(true);
    expect(gradeOne(check, "hello").passed).toBe(false);
  });

  it.each([
    ["spacing differs", "[ 99, 2, 3 ]", "[99,2,3]"],
    ["printed across several lines", "[ 99, 2, 3 ]", "[\n  99,\n  2,\n  3\n]"],
    ["quote style differs", "['a', 'b']", '[ "a", "b" ]'],
    ["an object", "{ x: 1 }", "{x:1}"],
  ])("treats a collection as equal when only its layout differs: %s", (_label, want, got) => {
    // How a console lays out an array/object is a runtime detail, not the learner's answer.
    expect(gradeOne({ type: "stdout_equals", value: want }, got).passed).toBe(true);
  });

  it("treats unquoted object keys (JavaScript style) as equal to quoted JSON keys", () => {
    // Regression: a check written the way Node prints an object, { name: 'Ada' }, failed
    // against the console's {"name":"Ada"} — same object, different quoting.
    const check = { type: "stdout_equals", value: "{ name: 'Ada', tags: { $id: 1 } }" } as const;
    expect(gradeOne(check, '{"name":"Ada","tags":{"$id":1}}').passed).toBe(true);
    expect(gradeOne(check, '{"name":"Bob","tags":{"$id":1}}').passed).toBe(false);
  });

  it("rejects a collection that only appears NESTED inside a bigger printed value", () => {
    // Regression: printing the whole matrix used to pass a check for its first row,
    // because the expected text appeared somewhere inside the output.
    const check = { type: "stdout_equals", value: "[1, 2, 3]" } as const;
    expect(gradeOne(check, "[[1,2,3],[4,5,6]]").passed).toBe(false);
    expect(gradeOne(check, '{"row":[1,2,3]}').passed).toBe(false);
  });

  it("still accepts a top-level collection after a label, even one with an apostrophe", () => {
    // The nesting rule must not reject ordinary prints: "result: [1, 2]" or Python's
    // print("Here's the list:", [1, 2]). The apostrophe must not be read as a string.
    expect(gradeOne({ type: "stdout_equals", value: "result: [ 1, 2 ]" }, "result: [1,2]").passed).toBe(true);
    expect(gradeOne({ type: "stdout_equals", value: "[1, 2]" }, "Here's the list: [1,2]").passed).toBe(true);
  });

  it("does NOT collapse whitespace for plain prose (no brackets)", () => {
    // The layout-insensitive fallback is restricted to collections on purpose.
    const r = gradeOne({ type: "stdout_equals", value: "hello world" }, "helloworld");
    expect(r.passed).toBe(false);
  });

  it("explains a failure with the normalized expected and actual output", () => {
    // The detail feeds the tutor, so it shows what was compared, after normalization.
    const r = gradeOne({ type: "stdout_equals", value: "hello" }, "  bye  \r\n");
    expect(r.passed).toBe(false);
    expect(r.detail).toBe('expected the output to include "hello", got "bye"');
  });
});

describe("gradeSubmission — stdout_includes", () => {
  it("passes when the expected text appears anywhere in the output", () => {
    // Substring match, even in the middle of a line.
    const r = gradeOne({ type: "stdout_includes", value: "clicked" }, "button clicked!\n");
    expect(r.passed).toBe(true);
  });

  it("fails, with a detail message, when the text is missing", () => {
    // Missing text is a failure and the detail says what was required.
    const r = gradeOne({ type: "stdout_includes", value: "clicked" }, "nothing happened");
    expect(r.passed).toBe(false);
    expect(r.detail).toBe('output must contain "clicked"; got "nothing happened"');
  });

  it("also applies the layout-insensitive comparison to collections", () => {
    // The same collection fallback as stdout_equals.
    const r = gradeOne({ type: "stdout_includes", value: "[1,2]" }, "result: [ 1, 2 ]");
    expect(r.passed).toBe(true);
  });
});

describe("gradeSubmission — code_matches", () => {
  it("passes when the regex matches the learner's code", () => {
    // Checks HOW the code is written, not what it prints.
    const r = gradeOne({ type: "code_matches", value: "for\\s*\\(" }, "", "for (let i = 0; i < 3; i++) {}");
    expect(r.passed).toBe(true);
  });

  it("uses multiline mode, so ^ anchors at the start of any line", () => {
    // Without the "m" flag, ^ would only match the very first line of the file.
    const code = "let y = 1;\nconst x = 5;";
    expect(gradeOne({ type: "code_matches", value: "^const x" }, "", code).passed).toBe(true);
  });

  it("fails, with a detail message, when the regex does not match", () => {
    // The detail shows the pattern the code had to satisfy.
    const r = gradeOne({ type: "code_matches", value: "while" }, "", "for (;;) {}");
    expect(r.passed).toBe(false);
    expect(r.detail).toBe("code should satisfy /while/");
  });

  it("falls back to a plain substring check when the value is not a valid regex", () => {
    // "print(" is a broken regex (unclosed group). The grader must not crash: it looks
    // for the exact text instead — and that is still a real check, not a free pass.
    const check = { type: "code_matches", value: "print(" } as const;
    expect(gradeOne(check, "", "print('hi')").passed).toBe(true);
    expect(gradeOne(check, "", "console.log('hi')").passed).toBe(false);
  });
});

describe("gradeSubmission — gradability", () => {
  it("is not gradable when any objective lacks a check", () => {
    // The caller falls back to LLM grading for older lessons; allPassed must not be true.
    const g = gradeSubmission(
      [obj("o1", { type: "stdout_includes", value: "hi" }), obj("o2")],
      "",
      "hi"
    );
    expect(g.gradable).toBe(false);
    expect(g.allPassed).toBe(false);
    expect(g.results[0].passed).toBe(true);
    expect(g.results[1]).toEqual({ id: "o2", passed: false, detail: "no deterministic check" });
  });

  it("is not gradable when there are no objectives at all", () => {
    // An empty list is not a pass — "every" of nothing would otherwise be true.
    expect(gradeSubmission([], "", "")).toEqual({ results: [], allPassed: false, gradable: false });
  });

  it("reports allPassed only when every objective passes, keeping objective order", () => {
    // One failing objective is enough to fail the submission; ids stay in input order.
    const objectives = [
      obj("first", { type: "stdout_includes", value: "x" }),
      obj("second", { type: "stdout_includes", value: "y" }),
    ];
    const pass = gradeSubmission(objectives, "", "x\ny");
    expect(pass.allPassed).toBe(true);
    expect(pass.results.map((r) => r.id)).toEqual(["first", "second"]);

    const fail = gradeSubmission(objectives, "", "x");
    expect(fail.allPassed).toBe(false);
    expect(fail.results.map((r) => r.passed)).toEqual([true, false]);
  });
});

describe("gradeSubmission — the program never ran", () => {
  it.each([
    "Compilation failed: error on line 3",
    "Compilation produced no program.",
    "TypeScript error: Cannot find name 'x'",
    "Failed to load Python: network error",
    "Failed to start Go: timeout",
  ])("fails every objective when the output says: %s", (output) => {
    // A code_matches check would pass on source text alone; a program that never
    // ran accomplished nothing, so it must fail anyway.
    const g = gradeSubmission(
      [obj("o1", { type: "code_matches", value: "print" })],
      "print('hi')",
      output
    );
    expect(g.allPassed).toBe(false);
    expect(g.results[0]).toEqual({
      id: "o1",
      passed: false,
      detail: "the program didn't run — fix the error in the console before objectives can pass",
    });
  });

  it("only recognizes the markers at the start of a line", () => {
    // A program that merely PRINTS the phrase mid-line did run, and is graded normally.
    const g = gradeSubmission(
      [obj("o1", { type: "stdout_includes", value: "note" })],
      "",
      "note: Compilation failed is just text here"
    );
    expect(g.allPassed).toBe(true);
  });
});
