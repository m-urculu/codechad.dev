import { describe, expect, it } from "vitest";
import { mergeCourses, type RoadmapSummary } from "@/lib/courseCache";

// The landing page paints "My courses" from a local cache, then merges in the server's
// fresh list. Two promises: the server is always right, and a course that did not change
// keeps the SAME object, so React does not re-render its card (no flicker).

const course = (courseId: string, extra: Partial<RoadmapSummary> = {}): RoadmapSummary => ({
  courseId,
  skill: "python",
  name: "Python",
  updatedAt: "2026-11-01T00:00:00Z",
  doneCount: 0,
  totalCount: 0,
  topicsDone: 0,
  topicsTotal: 6,
  ...extra,
});

describe("mergeCourses", () => {
  it("uses the server list as-is when nothing is cached", () => {
    // First visit, or a cleared cache.
    const fresh = [course("a")];
    expect(mergeCourses(null, fresh)).toBe(fresh);
    expect(mergeCourses([], fresh)).toBe(fresh);
  });

  it("keeps the very same object for a course that has not changed", () => {
    // Same object → React sees no change → the card does not re-render.
    const cachedA = course("a");
    const merged = mergeCourses([cachedA], [course("a")]);
    expect(merged[0]).toBe(cachedA);
  });

  it("takes the server's values when anything about a course changed", () => {
    // More lessons done since the cache was written: the server wins.
    const merged = mergeCourses([course("a", { doneCount: 1 })], [course("a", { doneCount: 3, name: "Py" })]);
    expect(merged[0]).toMatchObject({ doneCount: 3, name: "Py" });
  });

  it("follows the server on which courses exist, and in what order", () => {
    // A course deleted elsewhere disappears; a new one appears; order is the server's.
    const merged = mergeCourses([course("a"), course("gone")], [course("new"), course("a")]);
    expect(merged.map((c) => c.courseId)).toEqual(["new", "a"]);
  });
});
