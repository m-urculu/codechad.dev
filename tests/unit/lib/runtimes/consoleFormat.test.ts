import { describe, expect, it } from "vitest";
import { CONSOLE_INLINE_LIMIT, formatConsoleArgs } from "@/lib/runtimes/consoleFormat";

// formatConsoleArgs runs the SAME formatter source the browser runtimes inject, so these
// tests describe exactly what a learner sees in their console.
const fmt = (...args: unknown[]) => formatConsoleArgs(args);

describe("formatConsoleArgs — plain values", () => {
  it("prints a string as-is, without quotes", () => {
    // console.log("hello") shows hello, not "hello" — unlike JSON.
    expect(fmt("hello")).toBe("hello");
  });

  it("joins several arguments with a single space", () => {
    // console.log("total:", 3, true) is one line, values separated by spaces.
    expect(fmt("total:", 3, true)).toBe("total: 3 true");
  });

  it("prints undefined and null by name", () => {
    // Neither has a JSON form, so each needs its own rule.
    expect(fmt(undefined, null)).toBe("undefined null");
  });

  it("prints a BigInt with its n suffix", () => {
    // 10n and 10 are different values; the console must show which one it is.
    expect(fmt(BigInt(10))).toBe("10n");
  });
});

describe("formatConsoleArgs — collections", () => {
  it("prints a small array or object as compact JSON on one line", () => {
    // The form a generated stdout_equals check is written in.
    expect(fmt([99, 2, 3])).toBe("[99,2,3]");
    expect(fmt({ x: 1, y: "a" })).toBe('{"x":1,"y":"a"}');
  });

  it("stays on one line up to the inline limit, and indents one character past it", () => {
    // JSON.stringify(["xx…"]) is the string's length + 4 (brackets and quotes), so these
    // two inputs land exactly on, and one past, CONSOLE_INLINE_LIMIT.
    const atLimit = "x".repeat(CONSOLE_INLINE_LIMIT - 4);
    const overLimit = "x".repeat(CONSOLE_INLINE_LIMIT - 3);
    expect(fmt([atLimit])).toBe(`["${atLimit}"]`);
    expect(fmt([overLimit])).toBe(`[\n  "${overLimit}"\n]`);
  });

  it("marks a circular reference instead of crashing", () => {
    // Plain JSON.stringify throws on a cycle; a learner's console must not.
    const node: Record<string, unknown> = { name: "c" };
    node.self = node;
    expect(fmt(node)).toBe('{"name":"c","self":"[Circular]"}');
  });

  it("prints the same object twice in full — repeating is not circular", () => {
    // Regression: [p, p] used to print [{"a":1},"[Circular]"]. Only an object nested
    // inside ITSELF is circular; new Array(3).fill(p) is ordinary beginner code.
    const p = { a: 1 };
    expect(fmt([p, p])).toBe('[{"a":1},{"a":1}]');
    expect(fmt({ left: p, right: { inner: p } })).toBe(
      '{"left":{"a":1},"right":{"inner":{"a":1}}}'
    );
  });

  it("shows functions and BigInts nested inside a collection", () => {
    // JSON would silently drop a function and throw on a BigInt.
    expect(fmt({ go: function go() {}, n: BigInt(10) })).toBe('{"go":"[Function go]","n":"10n"}');
  });
});

describe("formatConsoleArgs — special objects", () => {
  it("prints an Error with its type and message", () => {
    // The stack trace that follows depends on where it ran, so only the start is fixed.
    expect(fmt(new TypeError("boom"))).toMatch(/^TypeError: boom/);
  });

  it("prints a DOM element as its tag, with its id when it has one", () => {
    // A learner logging document.getElementById("app") sees <div id="app">, not a
    // dump of every property. A plain object stands in for the element here.
    expect(fmt({ nodeType: 1, tagName: "DIV", id: "app" })).toBe('<div id="app">');
    expect(fmt({ nodeType: 1, tagName: "P" })).toBe("<p>");
  });
});
