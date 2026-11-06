import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCourseState,
  currentLesson,
  prefetchCourseStates,
  readCourseState,
  trimProgress,
  writeCourseState,
} from "@/lib/courseStateCache";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

// Opening a course paints its roadmap and current lesson from a local copy, then
// the server's. Promise: the current lesson is complete in the cache, everything
// else is trimmed to progress, and a deleted course never comes back.

const point = (id: string): RoadmapNode => ({ id, kind: "point", title: id, summary: "", children: [] });
const tree: Roadmap = {
  skill: "C++",
  title: "C++",
  summary: "",
  topics: [{ id: "t1", kind: "topic", title: "Basics", summary: "", children: [point("p1"), point("p2"), point("p3")] }],
};
const built = { intro: "…", starterCode: "", html: "", objectives: [] };

// Node has no localStorage; a Map-backed stand-in is all these functions use.
beforeEach(() => {
  const m = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  } as Storage;
});

describe("currentLesson", () => {
  it("is the first lesson not yet completed", () => {
    expect(currentLesson(tree, { p1: { done: true } })?.id).toBe("p2");
    expect(currentLesson(tree, { p1: { done: true }, p2: { done: true }, p3: { done: true } })).toBeNull();
  });
});

describe("trimProgress", () => {
  it("keeps the current lesson whole and only progress for the others", () => {
    const out = trimProgress(tree, {
      p1: { built, code: "old", passed: ["o1"], done: true },
      p2: { built, code: "mine", passed: [], done: false },
    });
    expect(out.p1).toEqual({ passed: ["o1"], done: true, module: undefined });
    expect(out.p2).toEqual({ built, code: "mine", passed: [], done: false });
  });
});

describe("read and write", () => {
  it("round-trips a course, trimmed", () => {
    writeCourseState("u", "c", { tree, progress: { p1: { built, done: true }, p2: { built } } });
    const hit = readCourseState("u", "c");
    expect(hit?.tree).toEqual(tree);
    expect(hit?.progress.p1.built).toBeUndefined();
    expect(hit?.progress.p2.built).toEqual(built);
  });

  it("keeps accounts apart, and stores nothing without a tree", () => {
    writeCourseState("u", "c", { tree });
    expect(readCourseState("someone-else", "c")).toBeNull();
    writeCourseState("u", "empty", { tree: null });
    expect(readCourseState("u", "empty")).toBeNull();
  });
});

describe("prefetchCourseStates", () => {
  it("skips a course that has not changed since it was cached", async () => {
    let calls = 0;
    const fetcher = async () => (calls++, { tree, progress: {} });
    const courses = [{ courseId: "c", updatedAt: "2026-11-01" }];
    expect(await prefetchCourseStates("u", courses, fetcher)).toBe(1);
    expect(await prefetchCourseStates("u", courses, fetcher)).toBe(0);
    expect(calls).toBe(1);
  });

  it("never writes back a course deleted while its prefetch was in flight", async () => {
    // The race the tombstone exists for: delete, then the stale response lands.
    const fetcher = async () => {
      clearCourseState("u", "c");
      return { tree, progress: {} };
    };
    await prefetchCourseStates("u", [{ courseId: "c", updatedAt: "x" }], fetcher);
    expect(readCourseState("u", "c")).toBeNull();
  });
});
