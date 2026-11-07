import { describe, expect, it } from "vitest";
import { stateRequiredNames, stateRequiredOutput, syncTodos, unstatedOutput } from "@/lib/agents/objectives";
import type { Objective } from "@/lib/agents/lesson";

// An objective graded on printed text must state that text, or a learner who words
// it their own way can never pass. The case below is the real lesson that did this.

const linker: Objective = {
  id: "o2",
  description: "Print a message explaining that the linker combines object files and libraries into an executable.",
  check: { type: "stdout_includes", value: "The linker combines object files and libraries into an executable." },
};

describe("unstatedOutput", () => {
  it("flags an 'explain it' objective whose check wants one exact sentence", () => {
    expect(unstatedOutput(linker)).toBe("The linker combines object files and libraries into an executable.");
  });

  it("accepts an objective that quotes the text it is graded on", () => {
    const ok: Objective = { id: "o1", description: 'Print "Total: 42".', check: { type: "stdout_equals", value: "Total: 42" } };
    expect(unstatedOutput(ok)).toBeNull();
  });

  it("ignores code checks", () => {
    const code: Objective = { id: "o3", description: "Use a for loop.", check: { type: "code_matches", value: "for\\\\s*\\\\(" } };
    expect(unstatedOutput(code)).toBeNull();
  });
});

describe("stateRequiredOutput", () => {
  it("appends the exact text, and leaves stated objectives alone", () => {
    const ok: Objective = { id: "o1", description: "Print `Hi`.", check: { type: "stdout_equals", value: "Hi" } };
    const [a, b] = stateRequiredOutput([ok, linker]);
    expect(a).toBe(ok);
    expect(b.description).toBe(
      "Print a message explaining that the linker combines object files and libraries into an executable — print exactly: `The linker combines object files and libraries into an executable.`"
    );
    expect(unstatedOutput(b)).toBeNull();
  });
});


describe("syncTodos — the TODOs say what the objectives check", () => {
  const objectives = [
    { id: "declare_total", description: "Declare an integer variable named total initialized to the product of baseUnits and multiplier" },
    { id: "print_total", description: "Print `50` followed by a newline to standard output" },
  ];
  const starter = `int main() {
    // TODO: Declare an integer variable named 'total'
    //       using the two values above
    // TODO: Print the value of total followed by a newline
    return 0;
}`;

  it("rewrites each TODO as its objective, dropping the old continuation lines", () => {
    expect(syncTodos(starter, objectives)).toBe(`int main() {
    // TODO: Declare an integer variable named total initialized to the product of baseUnits and multiplier
    // TODO: Print \`50\` followed by a newline to standard output
    return 0;
}`);
  });

  it("leaves the starter alone when TODOs and objectives don't pair up", () => {
    expect(syncTodos(starter, objectives.slice(0, 1))).toBe(starter);
  });

  it("skips skeleton objectives and their TODOs, and keeps the comment marker", () => {
    const py = "# TODO: include the header(s) this program needs\n# TODO: print it";
    const objs = [{ id: "skeleton-include", description: "x" }, { id: "p", description: "Print `5`" }];
    expect(syncTodos(py, objs)).toBe("# TODO: include the header(s) this program needs\n# TODO: Print `5`");
  });
});

describe("stateRequiredNames — a name a rule requires is in the objective", () => {
  const o = (description: string, name: string) => ({
    id: "s",
    description,
    check: { type: "stdout_equals" as const, value: "16", rules: [{ rule: "declares" as const, name }] },
  });

  it("adds a name the description never states", () => {
    expect(stateRequiredNames([o("Store the subtotal in a variable and print it.", "subtotal")], "")[0].description).toBe(
      "Store the subtotal in a variable and print it."
    );
    expect(stateRequiredNames([o("Store it in a variable and print it.", "subtotal")], "")[0].description).toBe(
      "Store it in a variable and print it — name it `subtotal`"
    );
  });

  it("leaves names the starter already has", () => {
    expect(stateRequiredNames([o("Print it.", "subtotal")], "double subtotal = 0;")[0].description).toBe("Print it.");
  });
});
