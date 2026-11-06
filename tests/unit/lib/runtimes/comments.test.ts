import { describe, expect, it } from "vitest";
import { scrubCode, stripComments } from "@/lib/runtimes/comments";
import { gradeSubmission } from "@/lib/agents/grade";

// Code checks are matched against the learner's code without comments, so the
// starter's `// TODO` lines a learner leaves in place cannot fail a correct answer.

// The learner's code, verbatim, from the lesson where this went wrong.
const LEARNER = `#include <iostream>

int main() {
    // TODO: Write a statement that prints "Hello, C++!" followed by a newline using std::cout
    std::cout << "Hello, C++!" << "\\n";
    // TODO: Write a second statement that prints "Learning statements." followed by a newline
    std::cout << "Learning statements." << "\\n";
    return 0;
}`;

describe("stripComments", () => {
  it("drops comments but keeps strings and line breaks", () => {
    expect(stripComments('x = 1; // note\ny = "// not a comment";', "cpp")).toBe('x = 1; \ny = "// not a comment";');
    expect(stripComments("a /* one\ntwo */ b", "c")).toBe("a \n b");
    expect(stripComments("print('#') # say it", "python")).toBe("print('#') ");
  });

  it("differs from scrubCode, which drops strings too", () => {
    expect(scrubCode('s = "x"; // c', "js")).toBe("s = ; ");
  });
});

describe("grading code checks", () => {
  // The lesson's real check: two statements with only whitespace between them.
  const semicolons = {
    id: "use_semicolons",
    description: "Ensure statements are properly terminated with semicolons",
    check: { type: "code_matches" as const, value: "std::cout\\s*<<.*?;\\s*std::cout\\s*<<.*?" },
  };

  it("passes a correct answer that keeps the starter's TODO comments", () => {
    expect(gradeSubmission([semicolons], LEARNER, "Hello, C++!\\nLearning statements.", "cpp").allPassed).toBe(true);
  });

  it("is unchanged when no language is given (older callers)", () => {
    expect(gradeSubmission([semicolons], LEARNER, "Hello, C++!\\nLearning statements.").allPassed).toBe(false);
  });
});
