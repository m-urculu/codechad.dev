import { describe, expect, it } from "vitest";
import {
  answerLines,
  findLeaks,
  normalizeCodeLine,
  stripLeakingBlocks,
  withoutAnswer,
} from "@/lib/agents/leak";

// The answer-leak guard: a tutor message must not hand over the exercise's answer as
// a code block, even rewritten "on different data". Design: src/lib/agents/leak.ts.

// The lesson behind the report: print two messages on separate lines.
const STARTER = `#include <iostream>

int main() {
    // TODO: print two messages, each on its own line
    return 0;
}`;
const SOLUTION = `#include <iostream>

int main() {
    std::cout << "Hello from C++!\\n";
    std::cout << "I am learning to code.\\n";
    return 0;
}`;
// What the tutor actually replied.
const REPLY = `To move to a new line in C++, use the \`\\n\` character.

\`\`\`cpp
#include <iostream>

int main() {
    std::cout << "Item: Sword\\n";
    std::cout << "Quantity: 5\\n";
    return 0;
}
\`\`\`
Notice how \`\\n\` forces the next output to start on a fresh line.`;

describe("normalizeCodeLine", () => {
  it("blanks literals and numbers, so the same statement with other text matches", () => {
    expect(normalizeCodeLine(`std::cout << "Hello\\n";`)).toBe(normalizeCodeLine(`  std::cout<<"Item: Sword\\n";`));
    expect(normalizeCodeLine("total = 3 * 4")).toBe(normalizeCodeLine("total = 10 * 2"));
  });

  it("keeps identifiers: an example on different variables is a different line", () => {
    expect(normalizeCodeLine("total = price * qty")).not.toBe(normalizeCodeLine("area = width * height"));
  });

  it("drops trailing comments but keeps #include", () => {
    expect(normalizeCodeLine("x = 1  # set x")).toBe("x=N");
    expect(normalizeCodeLine("#include <iostream>")).toBe("#include<iostream>");
  });
});

describe("answerLines", () => {
  it("is what the learner must write: solution lines the starter lacks", () => {
    // main(), the include and `return 0;` are in the starter, so they are not the answer.
    expect(answerLines(SOLUTION, STARTER)).toEqual([normalizeCodeLine(`std::cout << "x";`)]);
  });

  it("is empty without a solution", () => {
    expect(answerLines(undefined, STARTER)).toEqual([]);
  });
});

describe("findLeaks", () => {
  it("catches the reported reply: the answer with different words in it", () => {
    expect(findLeaks(REPLY, answerLines(SOLUTION, STARTER))).toHaveLength(1);
  });

  it("allows inline syntax outside code blocks", () => {
    const inline = 'End each message with `\\n`, as in `std::cout << "...\\n";` — try it in the editor.';
    expect(findLeaks(inline, answerLines(SOLUTION, STARTER))).toEqual([]);
  });

  it("allows a code block that is genuinely a different program", () => {
    const sql = "SELECT city, AVG(temp) FROM weather_readings GROUP BY city;";
    const answer = answerLines("SELECT category, SUM(price) FROM products GROUP BY category;", "");
    expect(findLeaks("```sql\n" + sql + "\n```", answer)).toEqual([]);
  });
});

describe("stripLeakingBlocks", () => {
  it("removes only the leaking block and keeps the explanation", () => {
    const out = stripLeakingBlocks(REPLY, answerLines(SOLUTION, STARTER));
    expect(out).not.toContain("Item: Sword");
    expect(out).toContain("To move to a new line");
    expect(out).toContain("Notice how");
  });
});

describe("withoutAnswer", () => {
  const answer = answerLines(SOLUTION, STARTER);

  it("returns a clean first reply untouched, with one call", async () => {
    let calls = 0;
    const out = await withoutAnswer(async () => (calls++, "Use `\\n` at the end of each string."), answer);
    expect(out).toBe("Use `\\n` at the end of each string.");
    expect(calls).toBe(1);
  });

  it("regenerates a leaking reply once, telling the model what leaked", async () => {
    const corrections: string[] = [];
    const out = await withoutAnswer(async (fix) => {
      corrections.push(fix);
      return fix ? "Put `\\n` inside each string." : REPLY;
    }, answer);
    expect(out).toBe("Put `\\n` inside each string.");
    expect(corrections[1]).toContain("CORRECTION");
  });

  it("strips the code block when the second attempt leaks too", async () => {
    const out = await withoutAnswer(async () => REPLY, answer);
    expect(out).not.toContain("Item: Sword");
  });
});
