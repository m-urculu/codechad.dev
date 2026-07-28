// How far through a roadmap a learner is — the client's copy of the calculation.
//
// The authoritative one runs server-side in app/api/supabase/roadmap-state.ts,
// over the stored tree. This one runs over the tree the workspace is holding in
// memory, so the roadmap bar and the course card can both show a live figure
// without a round trip. They MUST agree, which is why the rule is stated once
// here rather than a third time in each component: each level weights its DIRECT
// children equally, drilling down to a per-lesson objective ratio, and an
// ungenerated branch counts as 0 because nothing under it can have been learned.

import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

/** Completion of one lesson (a "point" leaf) in [0,1]. */
export type PointRatio = (id: string) => number;

/** A stored progress entry: what the learner has done on one lesson. */
export type LessonProgress = {
  done?: boolean;
  passed?: string[];
  built?: { objectives?: unknown[] };
};

/**
 * One lesson's completion in [0,1]: finished counts as 1, otherwise the fraction
 * of its objectives passed. A lesson that was never opened has no objectives to
 * count and is 0.
 */
export function lessonRatio(entry: LessonProgress | undefined): number {
  if (!entry) return 0;
  if (entry.done) return 1;
  const total = entry.built?.objectives?.length ?? 0;
  return total > 0 ? Math.min(1, (entry.passed?.length ?? 0) / total) : 0;
}

/**
 * Completion of any node in [0,1]. A topic is the mean of its sub-topics, a
 * sub-topic the mean of its lessons, a lesson the fraction of its objectives
 * passed — so finishing topic 1 of 6 and starting topic 2 fills a sixth plus a
 * slice of the next, the slice being how far into topic 2 the learner is.
 */
export function nodeRatio(node: RoadmapNode, pointOf: PointRatio): number {
  if (node.kind === "point") return pointOf(node.id);
  if (!node.children || node.children.length === 0) return 0;
  return node.children.reduce((sum, c) => sum + nodeRatio(c, pointOf), 0) / node.children.length;
}

/** Completion of the whole roadmap in [0,1] — the equal-weighted mean of its topics. */
export function overallRatio(roadmap: Roadmap | null, pointOf: PointRatio): number {
  const topics = roadmap?.topics;
  if (!topics?.length) return 0;
  return topics.reduce((s, t) => s + nodeRatio(t, pointOf), 0) / topics.length;
}

/**
 * Progress counted in TOPICS — the only unit whose denominator is honest. Lessons
 * are generated lazily, so their total is the size of what has been explored, not
 * the size of the course, and it GROWS as the learner works: used as a
 * denominator it makes progress appear to move backwards.
 */
export function topicCounts(
  roadmap: Roadmap | null,
  pointOf: PointRatio
): { done: number; total: number } {
  const topics = roadmap?.topics ?? [];
  // 0.999, not 1: the ratio is a mean of means, so a fully-complete topic can
  // land a hair under 1 through floating point alone.
  const done = topics.filter((t) => nodeRatio(t, pointOf) >= 0.999).length;
  return { done, total: topics.length };
}

/** Every lesson leaf, in roadmap order. */
export function flattenPoints(roadmap: Roadmap | null): RoadmapNode[] {
  const out: RoadmapNode[] = [];
  const walk = (nodes: RoadmapNode[]) => {
    for (const n of nodes) {
      if (n.kind === "point") out.push(n);
      if (n.children) walk(n.children);
    }
  };
  if (roadmap) walk(roadmap.topics);
  return out;
}
