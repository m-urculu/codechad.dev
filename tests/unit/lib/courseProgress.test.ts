import { describe, expect, it } from "vitest";
import {
  flattenPoints,
  lessonRatio,
  nodeRatio,
  overallRatio,
  topicCounts,
} from "@/lib/courseProgress";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

// ---- Fixtures: a tiny roadmap built by hand, so every expected number can be
// checked on paper. Titles and summaries don't affect progress, so they stay empty.

const lesson = (id: string): RoadmapNode => ({ id, kind: "point", title: id, summary: "", children: [] });
const sub = (id: string, children: RoadmapNode[] | null): RoadmapNode => ({
  id, kind: "subtopic", title: id, summary: "", children,
});
const topic = (id: string, children: RoadmapNode[] | null): RoadmapNode => ({
  id, kind: "topic", title: id, summary: "", children,
});
const roadmap = (topics: RoadmapNode[]): Roadmap => ({ skill: "x", title: "x", summary: "", topics });

// Completion per lesson id; anything not listed is 0 (never opened).
const ratios = (map: Record<string, number>) => (id: string) => map[id] ?? 0;

describe("lessonRatio — one lesson", () => {
  it("is 0 for a lesson that was never opened", () => {
    // No progress entry at all.
    expect(lessonRatio(undefined)).toBe(0);
  });

  it("is 1 for a finished lesson, even one with no objectives recorded", () => {
    // "done" is the final word on a lesson.
    expect(lessonRatio({ done: true })).toBe(1);
  });

  it("is the fraction of objectives passed", () => {
    // 2 of 4 objectives → halfway through the lesson.
    expect(lessonRatio({ passed: ["a", "b"], built: { objectives: [{}, {}, {}, {}] } })).toBe(0.5);
  });

  it("never goes above 1, even if more objectives were passed than exist now", () => {
    // A regenerated lesson can have fewer objectives than the learner already passed.
    expect(lessonRatio({ passed: ["a", "b", "c"], built: { objectives: [{}, {}] } })).toBe(1);
  });

  it("is 0, not a division by zero, when there are no objectives to count", () => {
    // Opened but never built: nothing to measure yet.
    expect(lessonRatio({ passed: ["a"] })).toBe(0);
    expect(lessonRatio({ passed: [], built: { objectives: [] } })).toBe(0);
  });
});

describe("nodeRatio — one topic or sub-topic", () => {
  it("asks for a lesson's own completion by its id", () => {
    // A lesson node is a leaf: its value comes straight from the lookup.
    expect(nodeRatio(lesson("p1"), ratios({ p1: 0.75 }))).toBe(0.75);
  });

  it("is 0 for a branch that has not been generated yet", () => {
    // children: null means "not explored", so nothing under it can have been learned.
    expect(nodeRatio(sub("s1", null), ratios({}))).toBe(0);
    expect(nodeRatio(sub("s1", []), ratios({}))).toBe(0);
  });

  it("weights each DIRECT child equally, not by how many lessons it holds", () => {
    // Sub-topic A: 1 lesson, finished (1.0). Sub-topic B: 3 lessons, none done (0.0).
    // Equal weight per sub-topic → (1 + 0) / 2 = 0.5. Counting lessons would give 1/4.
    const t = topic("t0", [
      sub("A", [lesson("a1")]),
      sub("B", [lesson("b1"), lesson("b2"), lesson("b3")]),
    ]);
    expect(nodeRatio(t, ratios({ a1: 1 }))).toBe(0.5);
  });

  it("counts a partly done lesson as a slice of its parent", () => {
    // One sub-topic of two lessons, one finished and one half done → (1 + 0.5) / 2.
    const s = sub("s", [lesson("p1"), lesson("p2")]);
    expect(nodeRatio(s, ratios({ p1: 1, p2: 0.5 }))).toBe(0.75);
  });
});

describe("overallRatio — the whole course", () => {
  it("is 0 when there is no roadmap or it has no topics", () => {
    // The progress bar of a course that has not loaded yet.
    expect(overallRatio(null, ratios({}))).toBe(0);
    expect(overallRatio(roadmap([]), ratios({}))).toBe(0);
  });

  it("finishing topic 1 of 6 and half of topic 2 is 1.5 / 6", () => {
    // The worked example from the comment in courseProgress.ts.
    const topics = [
      topic("t0", [lesson("a")]),
      topic("t1", [lesson("b1"), lesson("b2")]),
      ...["t2", "t3", "t4", "t5"].map((id) => topic(id, null)),
    ];
    expect(overallRatio(roadmap(topics), ratios({ a: 1, b1: 1 }))).toBe(1.5 / 6);
  });
});

describe("topicCounts — 'X of Y topics done'", () => {
  it("counts a finished topic as done", () => {
    // Every lesson under it finished → 1 of 1.
    const t = topic("t0", [sub("s0", [lesson("a"), lesson("b"), lesson("c")])]);
    expect(topicCounts(roadmap([t]), ratios({ a: 1, b: 1, c: 1 }))).toEqual({ done: 1, total: 1 });
  });

  it("counts a topic a hair under 1 as done (the 0.999 tolerance)", () => {
    // The ratio is a mean of means; the code tolerates floating-point error rather
    // than demanding exactly 1.
    const t = topic("t0", [lesson("a")]);
    expect(topicCounts(roadmap([t]), ratios({ a: 0.9995 }))).toEqual({ done: 1, total: 1 });
  });

  it("does not count a topic that is 99% done", () => {
    // Below the threshold, the topic is still in progress.
    const t = topic("t0", [lesson("a")]);
    expect(topicCounts(roadmap([t]), ratios({ a: 0.99 }))).toEqual({ done: 0, total: 1 });
  });

  it("is 0 of 0 with no roadmap", () => {
    // Nothing loaded, nothing counted.
    expect(topicCounts(null, ratios({}))).toEqual({ done: 0, total: 0 });
  });
});

describe("flattenPoints — every lesson in order", () => {
  it("is empty with no roadmap", () => {
    // Nothing to list.
    expect(flattenPoints(null)).toEqual([]);
  });

  it("lists only lessons, in roadmap order, skipping branches not generated yet", () => {
    // Depth-first: everything under topic 0 comes before topic 1.
    const r = roadmap([
      topic("t0", [sub("s0", [lesson("p1"), lesson("p2")]), sub("s1", null)]),
      topic("t1", [lesson("p3")]),
      topic("t2", null),
    ]);
    expect(flattenPoints(r).map((n) => n.id)).toEqual(["p1", "p2", "p3"]);
  });
});
