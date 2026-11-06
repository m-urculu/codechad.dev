import { describe, expect, it } from "vitest";
import {
  SYNTAX_FAMILIAR,
  classifySyntax,
  countSyntax,
  isSyntax,
  mergeSeen,
  cleanSyntax,
  ensureSyntaxLinks,
  knownSyntaxBlock,
  parseSyntax,
  syntaxKey,
  syntaxLink,
} from "@/lib/syntax";

// The syntax ledger: each piece of syntax is explained and linked the first time a
// learner meets it, then fades. Design: src/lib/syntax.ts.

const SOLUTION = `#include <iostream>
int main() {
    std::cout << "Hello\\n";
    std::cout<<"World" << std::endl;
}`;

const newline = { token: "\\n", doc: "Escape sequences", meaning: "starts a new line" };
const cout = { token: "std::cout <<", doc: "cout", meaning: "prints to the console" };

describe("parseSyntax — the list must describe the real solution", () => {
  it("keeps items that appear in the solution, ignoring whitespace", () => {
    // `std::cout <<` matches `std::cout<<`: spacing never makes syntax different.
    expect(parseSyntax([newline, cout], SOLUTION)).toEqual([newline, cout]);
  });

  it("drops items the solution never uses", () => {
    const invented = { token: "printf", doc: "printf", meaning: "formatted output" };
    expect(parseSyntax([invented, newline], SOLUTION)).toEqual([newline]);
  });

  it("returns nothing without a solution, or for a malformed list", () => {
    expect(parseSyntax([newline], undefined)).toEqual([]);
    expect(parseSyntax("not a list", SOLUTION)).toEqual([]);
  });
});

describe("cleanSyntax — shape only", () => {
  it("drops items without a token, and duplicates", () => {
    const raw = [newline, { token: "", doc: "x" }, { ...newline, meaning: "dup" }, 42];
    expect(cleanSyntax(raw)).toEqual([newline]);
  });

  it("keeps an item with no docs entry, to be shown unlinked", () => {
    // The docs may simply not have it; the learner still has to be shown it.
    expect(cleanSyntax([{ token: "<<", doc: "" }])).toEqual([{ token: "<<", doc: "", meaning: "" }]);
    expect(syntaxLink({ token: "<<", doc: "", meaning: "" })).toBe("`<<`");
    expect(ensureSyntaxLinks("Use `<<` to print.", [{ token: "<<", doc: "", meaning: "" }])).toBe("Use `<<` to print.");
  });

  it("caps the list at 8", () => {
    const raw = Array.from({ length: 12 }, (_, i) => ({ token: `t${i}`, doc: `d${i}` }));
    expect(cleanSyntax(raw)).toHaveLength(8);
  });
});

describe("classifySyntax — fading with repetition", () => {
  it("new syntax is explained, seen syntax is linked only, familiar syntax is left out", () => {
    const items = [newline, cout, { token: "int", doc: "int", meaning: "" }];
    const seen = { [syntaxKey(cout.token)]: 1, int: SYNTAX_FAMILIAR };
    expect(classifySyntax(items, seen)).toEqual({ fresh: [newline], linkOnly: [cout] });
  });
});

describe("ensureSyntaxLinks — new syntax always reaches the intro", () => {
  it("leaves the intro alone when every new item is already linked", () => {
    const intro = `End a line with [\`\\n\`](<doc:Escape sequences>).`;
    expect(ensureSyntaxLinks(intro, [newline])).toBe(intro);
  });

  it("appends the missing items as doc links", () => {
    // The bug this exists for: a lesson whose checks need two lines, and an intro
    // that never mentions \n.
    const out = ensureSyntaxLinks("Print two messages.", [newline]);
    expect(out).toBe("Print two messages.\n\n**New syntax:** [`\\n`](<doc:Escape sequences>) — starts a new line");
  });
});

describe("syntaxLink and knownSyntaxBlock", () => {
  it("survives a token containing a backtick", () => {
    expect(syntaxLink({ token: "`raw`", doc: "String literals", meaning: "" })).toBe(
      "[`` `raw` ``](<doc:String literals>)"
    );
  });

  it("lists what was seen, most frequent first, and is empty when nothing was", () => {
    expect(knownSyntaxBlock({})).toBe("");
    const block = knownSyntaxBlock({ "\\n": 1, "std::cout<<": 4 });
    expect(block.indexOf("std::cout<< ×4")).toBeLessThan(block.indexOf("\\n ×1"));
  });
});

describe("countSyntax and mergeSeen — what the learner has already been shown", () => {
  it("counts each piece of syntax once per lesson it appears in", () => {
    const cout = { token: "std::cout", doc: "", meaning: "" };
    const nl = { token: "\\n", doc: "", meaning: "" };
    // Five lessons of one course; one built before lessons kept a syntax list.
    const seen = countSyntax([[cout, nl], [cout], [cout, cout, nl], undefined, [nl]]);
    expect(seen).toEqual({ "std::cout": 3, "\\n": 3 });
    // So by now neither is new.
    expect(classifySyntax([cout, nl], seen)).toEqual({ fresh: [], linkOnly: [] });
  });

  it("takes the larger count when the account and the course disagree", () => {
    expect(mergeSeen({ a: 1, b: 4 }, { a: 3, c: 1 })).toEqual({ a: 3, b: 4, c: 1 });
  });
});

describe("isSyntax — the language, not the exercise's own values and names", () => {
  // From the lessons where this went wrong.
  const CPP = `#include <iostream>
int main() {
    int width;
    width = 5;
    int result = width * 3;
    std::cout << result << "\\n";
    return 0;
}`;

  it("drops literals", () => {
    for (const t of ["15", "98.6", '"Hello"', "'x'", "{ 42 }"]) expect(isSyntax(t, CPP)).toBe(false);
  });

  it("drops names the solution declares", () => {
    expect(isSyntax("width", CPP)).toBe(false);
    expect(isSyntax("result", CPP)).toBe(false);
    expect(isSyntax("area", "def area(w, h):\n    return w * h")).toBe(false);
    expect(isSyntax("total", "let total = 0;")).toBe(false);
  });

  it("keeps the language's own syntax", () => {
    for (const t of ["int", "std::cout", "<<", "\\n", "return", ";", "main", "{", "#include"]) expect(isSyntax(t, CPP)).toBe(true);
    expect(isSyntax("print", "print(1 + 2)")).toBe(true);
  });
});
