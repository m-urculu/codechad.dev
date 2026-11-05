import { describe, expect, it } from "vitest";
import { deriveSkills, knownSkillsBlock, skillKey, type KnownSkill } from "@/lib/skills";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

// The skills ledger: what a learner has FINISHED, so a second course never re-teaches
// it. Design: docs/skills-ledger.md.

describe("skillKey — normalizing a curriculum title", () => {
  it("ignores filler words, so 'Introduction to Functions' and 'Functions' match", () => {
    // Exactly the pair two courses on one technology produce.
    expect(skillKey("Introduction to Functions")).toBe(skillKey("Functions"));
    expect(skillKey("Functions")).toBe("functions");
  });

  it("ignores word order and case", () => {
    // "Lists and Dictionaries" is the same ground as "dictionaries and lists".
    expect(skillKey("Lists and Dictionaries")).toBe(skillKey("dictionaries and LISTS"));
  });

  it("drops punctuation but keeps the symbols in names like C++, C# and Node.js", () => {
    // Stripping + or # would turn C++ and C# into plain "c".
    expect(skillKey("C++ Templates!")).toBe("c++-templates");
    expect(skillKey("C# Basics")).toBe("c#");
    expect(skillKey("Node.js.")).toBe("node.js");
  });

  it("keeps a title made only of filler words, instead of losing it", () => {
    // "Getting Started" strips to nothing; the raw title becomes the key instead.
    expect(skillKey("Getting Started")).toBe("getting-started");
  });
});

// ---- Fixtures: nodes with real titles, since titles become ledger entries.
const lesson = (id: string, title: string): RoadmapNode => ({ id, kind: "point", title, summary: "", children: [] });
const sub = (id: string, title: string, children: RoadmapNode[] | null): RoadmapNode => ({
  id, kind: "subtopic", title, summary: "", children,
});
const topic = (id: string, title: string, children: RoadmapNode[] | null): RoadmapNode => ({
  id, kind: "topic", title, summary: "", children,
});
const roadmap = (topics: RoadmapNode[]): Roadmap => ({ skill: "python", title: "Python", summary: "", topics });
const done = { done: true };

describe("deriveSkills — what one course says the learner finished", () => {
  it("is empty with no roadmap", () => {
    // Nothing loaded, nothing learned.
    expect(deriveSkills(null, {})).toEqual([]);
  });

  it("records a finished topic as ONE entry, not one per lesson inside it", () => {
    // Keeps the ledger small enough to paste into a prompt.
    const r = roadmap([topic("t0", "Loops", [lesson("p1", "For loops"), lesson("p2", "While loops")])]);
    expect(deriveSkills(r, { p1: done, p2: done })).toEqual([
      { key: "loops", label: "Loops", kind: "topic" },
    ]);
  });

  it("inside an unfinished topic, records only the finished parts at their coarsest level", () => {
    // Sub-topic A is complete → one sub-topic entry. Sub-topic B is half done → only
    // its one finished lesson. The topic itself is not finished, so it is not listed.
    const r = roadmap([
      topic("t0", "Collections", [
        sub("s0", "Lists", [lesson("a1", "Indexing"), lesson("a2", "Slicing")]),
        sub("s1", "Dictionaries", [lesson("b1", "Keys"), lesson("b2", "Views")]),
      ]),
    ]);
    expect(deriveSkills(r, { a1: done, a2: done, b1: done })).toEqual([
      { key: "lists", label: "Lists", kind: "subtopic" },
      { key: "keys", label: "Keys", kind: "point" },
    ]);
  });

  it("counts a lesson as finished when every objective was passed", () => {
    // Progress comes from the same lessonRatio the progress bars use.
    const r = roadmap([topic("t0", "Strings", [lesson("p1", "Formatting")])]);
    const progress = { p1: { passed: ["o1", "o2"], built: { objectives: [{}, {}] } } };
    expect(deriveSkills(r, progress)).toHaveLength(1);
  });

  it("records nothing for a branch that was never generated", () => {
    // children: null means "never explored", not "nothing to learn".
    const r = roadmap([topic("t0", "Classes", null), topic("t1", "Modules", [])]);
    expect(deriveSkills(r, {})).toEqual([]);
  });

  it("records the same ground only once, even under two different titles", () => {
    // "Functions" and "Introduction to Functions" share a key; the first label wins.
    const r = roadmap([
      topic("t0", "Functions", [lesson("p1", "Def")]),
      topic("t1", "Introduction to Functions", [lesson("p2", "Return")]),
    ]);
    expect(deriveSkills(r, { p1: done, p2: done }).map((s) => s.label)).toEqual(["Functions"]);
  });
});

// ---- Fixtures for the prompt block.
const skill = (label: string, module: string, kind: KnownSkill["kind"] = "topic", technology?: string): KnownSkill => ({
  key: skillKey(label), label, kind, module, technology,
});
const bullets = (block: string) => block.split("\n").filter((l) => l.startsWith("  • "));

describe("knownSkillsBlock — the ledger as written into a generation prompt", () => {
  it("is empty when there is nothing to say", () => {
    // Call sites concatenate it unconditionally, so "nothing" must be "".
    expect(knownSkillsBlock([], "python")).toBe("");
  });

  it("lists same-technology skills as taught and passed, marking single lessons", () => {
    // A finished topic in this technology must not be taught again.
    const block = knownSkillsBlock([skill("Loops", "python"), skill("Slicing", "python", "point")], "python");
    expect(block).toContain("ALREADY COMPLETED BY THIS LEARNER, IN THIS SAME TECHNOLOGY");
    expect(bullets(block)).toEqual(["  • Loops", "  • Slicing (one lesson)"]);
    expect(block).not.toContain("OTHER TECHNOLOGIES");
  });

  it("lists other-technology skills separately, as a weaker signal naming the technology", () => {
    // Knowing functions in Python ≠ knowing Go's functions: assume the concept,
    // still teach this language's specifics.
    const block = knownSkillsBlock([skill("Functions", "python", "topic", "Python")], "go");
    expect(block).toContain("COMPLETED IN OTHER TECHNOLOGIES");
    expect(block).toContain("WEAKER signal");
    expect(bullets(block)).toEqual(["  • Functions (in Python)"]);
    expect(block).not.toContain("SAME TECHNOLOGY");
  });

  it("ignores single lessons finished in another technology", () => {
    // One lesson elsewhere is not worth bending this curriculum around.
    expect(knownSkillsBlock([skill("Slicing", "python", "point")], "go")).toBe("");
  });

  it("caps each list so the prompt stays bounded (40 same-tech, 18 other-tech)", () => {
    // The ledger grows forever; the prompt cannot.
    const same = Array.from({ length: 50 }, (_, i) => skill(`Go topic ${i}`, "go"));
    const other = Array.from({ length: 30 }, (_, i) => skill(`Py topic ${i}`, "python"));
    const lines = bullets(knownSkillsBlock([...same, ...other], "go"));
    expect(lines.filter((l) => l.includes("Go topic"))).toHaveLength(40);
    expect(lines.filter((l) => l.includes("Py topic"))).toHaveLength(18);
  });
});
