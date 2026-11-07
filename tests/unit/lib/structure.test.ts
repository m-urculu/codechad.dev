import { describe, expect, it } from "vitest";
import { checkStructure, cleanRules, normExpr, type Rule } from "@/lib/structure";

// Structural checks read the syntax tree. Design: src/lib/structure.ts.

const one = async (grammar: string, code: string, rules: Rule[]) => (await checkStructure(grammar, code, { k: rules })).k;

describe("C++", () => {
  const review = `#include <iostream>
int baseUnits{10};
int multiplier{5};
int main() {
    int total{baseUnits * multiplier};
    std::cout << total << '\\n';
}`;

  it("prints: the variable, not the number it holds", async () => {
    expect(await one("cpp", review, [{ rule: "prints", expr: "total" }])).toBe(true);
    expect(await one("cpp", review.replace("<< total", "<< 50"), [{ rule: "prints", expr: "total" }])).toBe(false);
  });

  it("ignores spacing, and a comment is not code", async () => {
    expect(await one("cpp", "int main(){std :: cout<<total;}", [{ rule: "prints", expr: "total" }])).toBe(true);
    expect(await one("cpp", "int main(){ // std::cout << total;\n std::cout << 50; }", [{ rule: "prints", expr: "total" }])).toBe(false);
  });

  it("declares, with its initialiser in either brace or = form, and either operand order", async () => {
    const r: Rule[] = [{ rule: "declares", name: "total", init: "baseUnits * multiplier" }];
    expect(await one("cpp", review, r)).toBe(true);
    expect(await one("cpp", "int main(){ int total = multiplier*baseUnits; }", r)).toBe(true);
    expect(await one("cpp", "int main(){ int total{50}; }", r)).toBe(false);
  });

  it("uses: the sum must be written, not its result", async () => {
    const r: Rule[] = [{ rule: "prints", expr: "17 + 25" }];
    expect(await one("cpp", "int main(){ std::cout << 25+17; }", r)).toBe(true);
    expect(await one("cpp", "int main(){ std::cout << 42; }", r)).toBe(false);
  });

  it("calls and defines, qualified or not", async () => {
    const code = "int add(int a, int b) { return a + b; }\nint main(){ std::cout << add(1, 2) << std::sqrt(4.0); }";
    expect(await one("cpp", code, [{ rule: "defines", name: "add" }, { rule: "calls", name: "add" }, { rule: "calls", name: "sqrt" }])).toBe(true);
    expect(await one("cpp", code, [{ rule: "calls", name: "pow" }])).toBe(false);
  });
});

describe("expressions compare as trees", () => {
  // From a generated chapter review: any order of the products, any parentheses.
  const rule: Rule[] = [{ rule: "declares", name: "subtotal", init: "applePrice * appleCount + breadPrice * breadCount" }];
  it("the operands of + and * in any order, at every level, with or without parentheses", async () => {
    for (const init of [
      "applePrice * appleCount + breadPrice * breadCount",
      "breadCount * breadPrice + appleCount * applePrice",
      "(applePrice*appleCount) + (breadPrice*breadCount)",
    ]) {
      expect([init, await one("cpp", `int main(){ double subtotal = ${init}; }`, rule)]).toEqual([init, true]);
    }
  });
  it("but not a different expression", async () => {
    expect(await one("cpp", "int main(){ double subtotal = applePrice * (appleCount + breadPrice) * breadCount; }", rule)).toBe(false);
    expect(await one("cpp", "int main(){ double subtotal = 16; }", rule)).toBe(false);
    expect(await one("cpp", "int main(){ std::cout << a - b; }", [{ rule: "prints", expr: "b - a" }])).toBe(false);
  });
  it("in Python too", async () => {
    expect(await one("python", "print((b * a) + c)", [{ rule: "prints", expr: "c + a * b" }])).toBe(true);
  });
});

describe("the other languages", () => {
  it("Python, JavaScript, Go, C, Ruby, Lua, PHP: prints and declares", async () => {
    const cases: [string, string][] = [
      ["python", "total = a * b\nprint(total)"],
      ["javascript", "const total = a * b;\nconsole.log(total);"],
      ["typescript", "const total: number = a * b;\nconsole.log(total);"],
      ["go", "package main\nimport \"fmt\"\nfunc main() { total := a * b; fmt.Println(total) }"],
      ["c", "int main(void) { int total = a * b; printf(\"%d\\n\", total); }"],
      ["ruby", "total = a * b\nputs total"],
      ["lua", "local total = a * b\nprint(total)"],
      ["php", "<?php\n$total = $a * $b;\necho $total;"],
    ];
    for (const [g, code] of cases) {
      const ok = await one(g, code, [{ rule: "declares", name: "total" }, { rule: "prints", expr: g === "php" ? "$total" : "total" }]);
      expect([g, ok]).toEqual([g, true]);
      const cheat = await one(g, code.replace(/(print\(|console\.log\(|Println\(|puts |echo |"%d\\n", )\$?total/, "$150"), [{ rule: "prints", expr: g === "php" ? "$total" : "total" }]);
      expect([g, cheat]).toEqual([g, false]);
    }
  });

  it("parses correctly every time, not only the first (the Lua grammar used not to)", async () => {
    for (let i = 0; i < 3; i++) expect(await one("lua", "local total = a * b\nprint(total)", [{ rule: "prints", expr: "total" }])).toBe(true);
  });

  it("is unknown for a language with no grammar", async () => {
    expect(await one("sql", "SELECT 1", [{ rule: "uses", expr: "1" }])).toBeUndefined();
  });
});

describe("cleanRules and normExpr", () => {
  it("keeps known rules with their fields", () => {
    expect(cleanRules([{ rule: "prints", expr: " total " }, { rule: "nope" }, { rule: "declares" }, { rule: "calls", name: "f" }])).toEqual([
      { rule: "prints", expr: "total" },
      { rule: "calls", name: "f" },
    ]);
  });
  it("drops whitespace outside strings and redundant parentheses", () => {
    expect(normExpr(" ( a + b ) ")).toBe("a+b");
    expect(normExpr('"a  b" + c')).toBe('"a  b"+c');
    expect(normExpr("(a) + (b)")).toBe("(a)+(b)");
  });
});
