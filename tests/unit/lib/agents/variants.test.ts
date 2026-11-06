import { describe, expect, it } from "vitest";
import { applyGiven, expectedAfterChange, givenValues, sharedGiven, showsExpected } from "@/lib/agents/variants";

// Changed-data runs. Design: src/lib/agents/variants.ts.

const STARTER = `#include <iostream>
int baseUnits{10};
int multiplier{5};
int main() {
    // TODO: declare total
    return 0;
}`;
const SOLUTION = STARTER.replace("// TODO: declare total", "int total{baseUnits * multiplier};\n    std::cout << total << '\\n';");
const CHEAT = STARTER.replace("// TODO: declare total", "int total{baseUnits * multiplier};\n    std::cout << 50;");

describe("givenValues", () => {
  it("finds the starter's data, in brace, = and := form, and changes each by a different step", () => {
    expect(givenValues(STARTER)).toEqual([
      { name: "baseUnits", value: "10", next: "13" },
      { name: "multiplier", value: "5", next: "10" },
    ]);
    expect(givenValues("x := 2.5\nlet y = 4;\n$z = 1;").map((g) => [g.name, g.next])).toEqual([["x", "6.0"], ["y", "9"], ["$z", "8"]]);
  });

  it("ignores comparisons, compound assignment, comments and non-literals", () => {
    expect(givenValues("if (a == 3) {}\nb += 2;\n// c = 4\nint d = e + 1;")).toEqual([]);
  });
});

describe("applyGiven and sharedGiven", () => {
  it("changes the same declarations in both programs", () => {
    const given = sharedGiven(STARTER, SOLUTION, CHEAT);
    expect(applyGiven(CHEAT, given)).toContain("int baseUnits{13};");
    expect(applyGiven(CHEAT, given)).toContain("std::cout << 50;"); // a literal does not follow the data
  });

  it("drops a value the learner's code no longer declares as given", () => {
    expect(sharedGiven(STARTER, SOLUTION, CHEAT.replace("baseUnits{10}", "baseUnits{11}")).map((g) => g.name)).toEqual(["multiplier"]);
  });
});

describe("expectedAfterChange", () => {
  it("reads the new expectation off the solution's runs, line for line", () => {
    expect(expectedAfterChange({ value: "50" }, "50", "130")).toBe("130");
    expect(expectedAfterChange({ value: "Total: 50" }, "Header\nTotal: 50", "Header\nTotal: 130")).toBe("Total: 130");
  });

  it("maps part of a line through what stayed the same", () => {
    expect(expectedAfterChange({ value: "50 units" }, "You have 50 units left", "You have 130 units left")).toBe("130 units");
  });

  it("is null when the objective's text does not depend on the data", () => {
    expect(expectedAfterChange({ value: "Header" }, "Header\n50", "Header\n130")).toBeNull();
    expect(expectedAfterChange({ value: "50" }, "50", "130\nextra")).toBeNull();
  });

  it("the cheat fails, the real program passes", () => {
    const expected = expectedAfterChange({ value: "50" }, "50", "130")!;
    expect(showsExpected("stdout_equals", "50", expected)).toBe(false);
    expect(showsExpected("stdout_equals", "130\n", expected)).toBe(true);
  });
});
