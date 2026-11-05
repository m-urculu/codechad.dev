import { describe, expect, it } from "vitest";
import { formatConsoleArgs } from "@/lib/runtimes/consoleFormat";
import { gradeSubmission } from "@/lib/agents/grade";

// CONTRACT between two modules: what the learner's console PRINTS (consoleFormat)
// must be accepted by the grader (grade) whenever the values are right, however the
// expected value in the check happens to be laid out.
//
// This is the bug described at the top of consoleFormat.ts: three formatters disagreed,
// so a lesson could be validated as solvable and then be impossible to pass in the
// learner's own console. Each module has its own tests; this file tests the seam.

// Simulate one console.log(...args) call and grade its output against `check`.
function printAndGrade(check: string, ...args: unknown[]) {
  const output = formatConsoleArgs(args);
  const grade = gradeSubmission(
    [{ id: "o1", description: "print the value", check: { type: "stdout_equals", value: check } }],
    "",
    output
  );
  return grade.allPassed;
}

describe("console output → grader", () => {
  it.each([
    ["spaced, as Node prints it", "[ 99, 2, 3 ]"],
    ["compact", "[99,2,3]"],
    ["comma-spaced", "[99, 2, 3]"],
    ["indented over several lines", "[\n  99,\n  2,\n  3\n]"],
  ])("accepts a printed array whatever layout the check uses: %s", (_label, check) => {
    // The learner's correct console.log([99, 2, 3]) must pass every way of writing it.
    expect(printAndGrade(check, [99, 2, 3])).toBe(true);
  });

  it("accepts a long array the console splits over many lines, against a one-line check", () => {
    // Past the inline limit the formatter indents one value per line; the check was
    // written on one line. Same values, so it must still pass.
    const values = Array.from({ length: 30 }, (_, i) => i);
    expect(formatConsoleArgs([values])).toContain("\n"); // really printed multi-line
    expect(printAndGrade(`[${values.join(", ")}]`, values)).toBe(true);
  });

  it("accepts single-quoted strings in the check against the console's double quotes", () => {
    // The generator may write ['a', 'b']; the console prints ["a","b"].
    expect(printAndGrade("[ 'a', 'b' ]", ["a", "b"])).toBe(true);
  });

  it("accepts an object check written the way Node prints it, with bare keys", () => {
    // The generator may write { name: 'Ada' }; the console prints {"name":"Ada"}.
    expect(printAndGrade("{ name: 'Ada', age: 36 }", { name: "Ada", age: 36 })).toBe(true);
  });

  it("rejects the right value when it was only printed inside a bigger one", () => {
    // Printing the whole matrix is not printing its first row.
    expect(printAndGrade("[ 1, 2, 3 ]", [[1, 2, 3], [4, 5, 6]])).toBe(false);
  });

  it("accepts a label printed before the collection", () => {
    // console.log("result:", [1, 2]) — the common way learners print an answer.
    expect(printAndGrade("result: [ 1, 2 ]", "result:", [1, 2])).toBe(true);
  });

  it("still fails when the printed values are wrong", () => {
    // Ignoring layout must not mean ignoring content.
    expect(printAndGrade("[ 1, 2 ]", [1, 2, 3])).toBe(false);
    expect(printAndGrade("[ 99, 2, 3 ]", [99, 3, 2])).toBe(false);
  });
});
