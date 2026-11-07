import { describe, expect, it } from "vitest";
import { gradeSubmission, gradeWithStructure, literalText, outputShows } from "@/lib/agents/grade";
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
    expect(gradeSubmission([], "", "")).toEqual({ results: [], allPassed: false, gradable: false, ran: true });
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
  ])("fails output checks and never completes the lesson when the output says: %s", (output) => {
    const g = gradeSubmission(
      [obj("o1", { type: "code_matches", value: "print" }), obj("o2", { type: "stdout_includes", value: "hi" })],
      "print('hi')",
      output
    );
    expect(g.ran).toBe(false);
    expect(g.allPassed).toBe(false);
    expect(g.results[1]).toEqual({
      id: "o2",
      passed: false,
      detail: "the program didn't run — fix the error in the console before this can pass",
    });
  });

  it("still credits code checks, one objective at a time", () => {
    // The lesson where this went wrong: the starter printed `score` and `temperature`,
    // so the program could not compile until both were declared. Declaring `score`
    // first is a finished step and must tick, even though `temperature` still breaks
    // the compile.
    const objectives = [
      obj("init_score", { type: "code_matches", value: "int\\s+score\\s*\\{\\s*100\\s*\\};" }),
      obj("init_temp", { type: "code_matches", value: "double\\s+temperature\\s*\\(\\s*98\\.6\\s*\\);" }),
      obj("assign", { type: "stdout_equals", value: "Score: 150\nTemp: 98.6" }),
    ];
    const step1 = gradeSubmission(objectives, "int score{100};", "Compilation failed: 'temperature' was not declared", "cpp");
    expect(step1.results.map((r) => r.passed)).toEqual([true, false, false]);
    expect(step1.allPassed).toBe(false);

    const done = gradeSubmission(
      objectives,
      "int score{100};\ndouble temperature(98.6);\nscore = 150;",
      "Score: 150\nTemp: 98.6",
      "cpp"
    );
    expect(done.ran).toBe(true);
    expect(done.allPassed).toBe(true);
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

describe("objectives that expect the same output", () => {
  // The lesson this is for: both objectives print 42, and one line met both.
  const objectives = [
    { id: "a", description: "Print 17 + 25, producing `42`", check: { type: "stdout_includes" as const, value: "42" } },
    { id: "b", description: "Print 6 * 7, producing `42`", check: { type: "stdout_includes" as const, value: "42" } },
  ];

  it("one print meets only the first", () => {
    const g = gradeSubmission(objectives, "std::cout << 17 + 25;", "42");
    expect(g.results.map((r) => r.passed)).toEqual([true, false]);
    expect(g.allPassed).toBe(false);
  });

  it("printing it once per objective meets both, on one line or two", () => {
    expect(gradeSubmission(objectives, "", "42\n42").allPassed).toBe(true);
    expect(gradeSubmission(objectives, "", "4242").allPassed).toBe(true);
  });

  it("counts whole line blocks for stdout_equals", () => {
    const eq = objectives.map((o) => ({ ...o, check: { type: "stdout_equals" as const, value: "42" } }));
    expect(gradeSubmission(eq, "", "42").results.map((r) => r.passed)).toEqual([true, false]);
    expect(gradeSubmission(eq, "", "42\n42").allPassed).toBe(true);
  });
});

describe("printing the right value the wrong way", () => {
  // The chapter review this is for: declare `total`, print it — and `std::cout << 50;`
  // completed the lesson with `total` unused.
  const declare = { id: "declare_total", description: "Declare an integer variable named total initialized to the product of baseUnits and multiplier", check: { type: "code_matches" as const, value: String.raw`int\s+total\s*\{\s*baseUnits\s*\*\s*multiplier\s*\}\s*;` } };
  const print = { id: "print_total", description: "Print `50` followed by a newline to standard output", check: { type: "stdout_equals" as const, value: "50\n" } };
  const cheat = "int total{baseUnits * multiplier};\nstd::cout << 50;";
  const warned = "main.cc:8:9: warning: unused variable 'total' [-Wunused-variable]\n    8 |     int total{baseUnits * multiplier};\n1 warning generated.\n50";

  it("an unused variable an objective names fails the output objectives", () => {
    const g = gradeSubmission([declare, print], cheat, warned, "cpp");
    expect(g.results.map((r) => r.passed)).toEqual([true, false]);
    expect(g.results[1].detail).toMatch(/`total` is never used/);
    expect(g.allPassed).toBe(false);
  });

  it("other warnings, and unused names no objective mentions, change nothing", () => {
    const other = "main.cc:3:9: warning: unused variable 'tmp' [-Wunused-variable]\n50";
    expect(gradeSubmission([declare, print], cheat, other, "cpp").allPassed).toBe(true);
  });

  it("GCC's quoting and 'set but not used' count too", () => {
    const gcc = "main.cc:8:9: warning: variable ‘total’ set but not used [-Wunused-but-set-variable]\n50";
    expect(gradeSubmission([declare, print], cheat, gcc, "cpp").allPassed).toBe(false);
  });

  it("a stdout check's code pattern requires how the value was printed", () => {
    const withCode = { ...print, check: { ...print.check, code: String.raw`std::cout\s*<<\s*total\b` } };
    const g = gradeSubmission([withCode], "std::cout << 50;", "50", "cpp");
    expect(g.results[0].passed).toBe(false);
    expect(g.results[0].detail).toMatch(/not print the value directly/);
    expect(gradeSubmission([withCode], "std::cout << total << '\\n';", "50", "cpp").allPassed).toBe(true);
  });
});

describe("gradeWithStructure — rules read from the syntax tree", () => {
  const print = {
    id: "print_total",
    description: "Print `50`",
    check: { type: "stdout_equals" as const, value: "50", rules: [{ rule: "prints" as const, expr: "total" }] },
  };
  const declare = {
    id: "declare_total",
    description: "Declare total",
    check: { type: "code_matches" as const, value: "THIS REGEXP NEVER MATCHES", rules: [{ rule: "declares" as const, name: "total", init: "a * b" }] },
  };

  it("an output objective needs its rules too: printing the number fails", async () => {
    const g = await gradeWithStructure([print], "int main(){ int total{a*b}; std::cout << 50; }", "50", "cpp", "cpp");
    expect(g.results[0]).toMatchObject({ passed: false });
    expect(g.results[0].detail).toMatch(/print `total`/);
    expect((await gradeWithStructure([print], "int main(){ int total{a*b}; std::cout<<total; }", "50", "cpp", "cpp")).allPassed).toBe(true);
  });

  it("rules decide a code check when the code parses, the regexp only when it can't", async () => {
    expect((await gradeWithStructure([declare], "int main(){ int total = b * a; }", "", "cpp", "cpp")).results[0].passed).toBe(true);
    expect((await gradeWithStructure([declare], "int total = b * a;", "", "sql", "sql")).results[0].passed).toBe(false);
  });
});

describe("the functions the solution writes, the learner must write too", () => {
  // "Introduction to functions", saved before checks had rules: printing the message
  // from main, with greet never called, completed it.
  const objectives = [
    { id: "skeleton-include", description: "Write the `#include` line(s)", check: { type: "code_matches" as const, value: String.raw`^\s*#include\s*[<"][^>"]+[>"]` } },
    { id: "define_function", description: "Define a function named `greet` that prints `Hello from a function!` followed by a newline.", check: { type: "code_matches" as const, value: String.raw`void\s+greet\s*\(\s*\)` } },
    { id: "call_function", description: "Call the `greet` function inside `main` and print `Hello from a function!` to standard output.", check: { type: "stdout_equals" as const, value: "Hello from a function!\n" } },
  ];
  const solution = `#include <iostream>\n\nvoid greet() {\n    std::cout << "Hello from a function!\\n";\n}\n\nint main() {\n    greet();\n    return 0;\n}`;
  const starter = `// TODO: include the header(s) this program needs\n\n// TODO: Define a function named greet\n\nint main() {\n    // TODO: Call the greet function here\n    return 0;\n}`;
  const lesson = { solution, starter };

  it("printing the message directly fails the call objective", async () => {
    const cheat = `#include <iostream>\nvoid greet() {\n  std::cout << "Hello";\n}\nint main() {\n    std::cout << "Hello from a function!";\n    return 0;\n}`;
    const g = await gradeWithStructure(objectives, cheat, "Hello from a function!", "cpp", "cpp", lesson);
    expect(g.results.map((r) => r.passed)).toEqual([true, true, false]);
    expect(g.results[2].detail).toMatch(/must call `greet\(\)`/);
    expect(g.allPassed).toBe(false);
  });

  it("the real answer passes", async () => {
    expect((await gradeWithStructure(objectives, solution, "Hello from a function!\n", "cpp", "cpp", lesson)).allPassed).toBe(true);
  });

  it("library calls are not required", async () => {
    const sol = "#include <cmath>\nint main(){ std::cout << std::sqrt(16.0); }";
    const objs = [{ id: "p", description: "Print the square root of 16 (call sqrt)", check: { type: "stdout_equals" as const, value: "4" } }];
    expect((await gradeWithStructure(objs, "int main(){ std::cout << std::pow(16.0, 0.5); }", "4", "cpp", "cpp", { solution: sol, starter: "" })).allPassed).toBe(true);
  });
});

describe("the learner's own function names", () => {
  // "Function return values", as saved, with the learner's submission.
  const objectives = [
    { id: "skeleton-include", description: "Write the `#include` line(s) for the headers this program uses", check: { type: "code_matches" as const, value: String.raw`^\s*#include\s*[<"][^>"]+[>"]` } },
    {
      id: "define_function",
      description: "Define a function named calculateSquare that returns an integer computed as x * x",
      check: { type: "code_matches" as const, value: String.raw`int\s+calculateSquare\s*\(\s*int\s+x\s*\)\s*\{\s*return\s+x\s*\*\s+x\s*;\s*\}`, rules: [{ rule: "defines" as const, name: "calculateSquare" }] },
    },
    {
      id: "print_result",
      description: "Call calculateSquare with the argument 6 and print `36` followed by a newline",
      check: { type: "stdout_equals" as const, value: "36\n", rules: [{ rule: "prints" as const, expr: "calculateSquare(6)" }, { rule: "calls" as const, name: "calculateSquare" }] },
    },
  ];
  const solution = "#include <iostream>\n\nint calculateSquare(int x) {\n    return x * x;\n}\n\nint main() {\n    std::cout << calculateSquare(6) << '\\n';\n    return 0;\n}";
  const starter = "// TODO: include the header(s) this program needs\n\n// TODO: Define a function\n\nint main() {\n    // TODO: Call it\n    return 0;\n}";
  const lesson = { solution, starter };

  it("a different name for the same function passes", async () => {
    const mine = "#include <iostream>\nint calculatedSquare(int n) {\n  return n*n;\n}\nint main() {\n  std::cout << calculatedSquare(6) << '\\n';\n}";
    const g = await gradeWithStructure(objectives, mine, "36\n", "cpp", "cpp", lesson);
    expect(g.results.map((r) => r.passed)).toEqual([true, true, true]);
  });

  it("but printing inside the function instead of returning does not (the submission as sent)", async () => {
    const sent = "#include <iostream>\nint calculatedSquare(int x) {\n  std::cout << x * x;\n};\nint main() {\n    calculatedSquare(6);\n    return 0;\n}";
    const g = await gradeWithStructure(objectives, sent, "36", "cpp", "cpp", lesson);
    expect(g.results.map((r) => r.passed)).toEqual([true, false, false]);
    expect(g.results[1].detail).toMatch(/must `return` its result/);
  });

  it("a returns rule checks what is returned", async () => {
    const rules = [{ rule: "returns" as const, name: "sq", expr: "x * x" }];
    const o = [{ id: "r", description: "Define sq returning x * x", check: { type: "code_matches" as const, value: "NEVER", rules } }];
    expect((await gradeWithStructure(o, "int sq(int x){ return x*x; }", "", "cpp", "cpp")).allPassed).toBe(true);
    expect((await gradeWithStructure(o, "int sq(int x){ std::cout << x*x; return 0; }", "", "cpp", "cpp")).allPassed).toBe(false);
  });

  it("an ambiguous pairing renames nothing", async () => {
    const sol = "int a(int x){return x;}\nint b(int y){return y;}\nint main(){ return a(1)+b(2); }";
    const mine = "int p(int x){return x;}\nint q(int y){return y;}\nint main(){ return p(1)+q(2); }";
    const { renameToSolution } = await import("@/lib/structure");
    expect(await renameToSolution("cpp", mine, sol, "")).toBe(mine);
  });
});

describe("printed text and names are the learner's to choose", () => {
  // "Void functions", as saved, with the submission that failed on a typo.
  const objectives = [
    { id: "skeleton-include", description: "Write the `#include` line(s)", check: { type: "code_matches" as const, value: String.raw`^\s*#include\s*[<"][^>"]+[>"]` } },
    { id: "define", description: "Define a void function named `printMessage` that prints `Learning void functions!` followed by a newline.", check: { type: "code_matches" as const, value: String.raw`void\s+printMessage\s*\(\s*\)`, rules: [{ rule: "defines" as const, name: "printMessage" }] } },
    { id: "call", description: "Call the `printMessage` function inside `main` and print `Learning void functions!` to standard output.", check: { type: "stdout_equals" as const, value: "Learning void functions!\n", rules: [{ rule: "calls" as const, name: "printMessage" }] } },
  ];
  const solution = '#include <iostream>\n\nvoid printMessage() {\n    std::cout << "Learning void functions!\\n";\n}\n\nint main() {\n    printMessage();\n    return 0;\n}';
  const lesson = { solution, starter: "int main() {\n    return 0;\n}" };

  it("a typo in the message passes", async () => {
    const sent = '#include <iostream>\nvoid printMessage(){\n  std::cout << "Learning void funtions!" << "\\n";\n}\nint main() {\n    printMessage();\n    return 0;\n}';
    expect((await gradeWithStructure(objectives, sent, "Learning void funtions!\n", "cpp", "cpp", lesson)).allPassed).toBe(true);
  });

  it("so does a different name and different words — the structure is the same", async () => {
    const mine = '#include <iostream>\nvoid show(){ std::cout << "Hi there\\n"; }\nint main(){ show(); }';
    expect((await gradeWithStructure(objectives, mine, "Hi there\n", "cpp", "cpp", lesson)).allPassed).toBe(true);
  });

  it("but the function itself must print, and be called", async () => {
    const elsewhere = '#include <iostream>\nvoid printMessage(){ }\nint main(){ printMessage(); std::cout << "Learning void functions!\\n"; }';
    const g = await gradeWithStructure(objectives, elsewhere, "Learning void functions!\n", "cpp", "cpp", lesson);
    expect(g.results.find((r) => r.id === "define")).toMatchObject({ passed: false });
    expect(g.results.find((r) => r.id === "define")!.detail).toMatch(/itself must print/);
  });

  it("computed values still have to be right, and free text needs a letter", async () => {
    const sol = 'int main(){ int total = 6 * 7; std::cout << "Total: " << total << "\\n"; }';
    const o = [{ id: "t", description: "Print `Total: 42`", check: { type: "stdout_equals" as const, value: "Total: 42" } }];
    const grade = (out: string) => gradeWithStructure(o, sol, out, "cpp", "cpp", { solution: sol, starter: "" });
    expect((await grade("Sum = 42")).allPassed).toBe(true);
    expect((await grade("Total: 41")).allPassed).toBe(false);
    expect((await grade("42")).allPassed).toBe(false);
  });

  it("two message objectives can't share one line", async () => {
    const sol = 'int main(){ std::cout << "Hello\\n"; std::cout << "Goodbye\\n"; }';
    const o = [
      { id: "a", description: "Print `Hello`", check: { type: "stdout_equals" as const, value: "Hello" } },
      { id: "b", description: "Print `Goodbye`", check: { type: "stdout_equals" as const, value: "Goodbye" } },
    ];
    const g = await gradeWithStructure(o, sol, "Hi", "cpp", "cpp", { solution: sol, starter: "" });
    expect(g.results.map((r) => r.passed)).toEqual([true, false]);
    expect((await gradeWithStructure(o, sol, "Hi\nBye", "cpp", "cpp", { solution: sol, starter: "" })).allPassed).toBe(true);
  });

  it("variable names too", async () => {
    const sol = "int main(){ int total = 6 * 7; std::cout << total; }";
    const o = [{ id: "p", description: "Print the total", check: { type: "stdout_equals" as const, value: "42", rules: [{ rule: "prints" as const, expr: "total" }] } }];
    expect((await gradeWithStructure(o, "int main(){ int sum = 6 * 7; std::cout << sum; }", "42", "cpp", "cpp", { solution: sol, starter: "" })).allPassed).toBe(true);
  });
});

describe("outputShows — the changed-data run keeps the learner's wording free", () => {
  it("compares the computed value, not the words", () => {
    const free = literalText('std::cout << "Total: " << total;', "cpp");
    expect(outputShows("stdout_equals", "Sum = 130", "Total: 130", free)).toBe(true);
    expect(outputShows("stdout_equals", "Sum = 50", "Total: 130", free)).toBe(false);
  });
});
