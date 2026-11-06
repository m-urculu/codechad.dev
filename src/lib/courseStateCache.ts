// Local cache of each course's roadmap and current lesson, so opening a course
// shows the lesson the learner was on — its tasks above the chat, their code in the
// editor — on the first frame instead of after /api/roadmap/state answers.
//
// The landing page warms it for every course as soon as the learner is signed in
// (prefetchCourseStates), the workspace refreshes it on every save, and the server
// response still arrives and still wins. Same discipline as chatCache.ts:
//   - one key per course, a bounded number of courses, oldest evicted first;
//   - only the CURRENT lesson keeps its built content and code. Every other
//     lesson keeps just its progress, which is what the roadmap needs to draw.
//     Built lessons (intro, starter, solution, code) are the bulk of a course, and
//     the others arrive with the server copy a moment later;
//   - a quota error evicts and retries once, then gives up quietly.

import { flattenPoints } from "@/lib/courseProgress";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

type Entry = { built?: unknown; passed?: string[]; done?: boolean; code?: string; module?: string };

export type CachedCourseState = {
  courseId: string;
  level?: string;
  goal?: string;
  tree: Roadmap;
  progress: Record<string, Entry>;
  /** The course's `updatedAt` when cached, so the prefetcher can skip unchanged courses. */
  courseUpdatedAt?: string;
  /** When we wrote it — the eviction order. */
  savedAt: number;
};

const VERSION = 1;
const MAX_COURSES = 12;

const prefix = (userId: string) => `codechad:course:v${VERSION}:${userId}:`;
const keyFor = (userId: string, courseId: string) => prefix(userId) + courseId;

// Courses cleared during this page session: a background prefetch still in flight
// must not write a deleted course back. See the same guard in chatCache.ts.
const tombstoned = new Set<string>();

/** The lesson a resumed course opens on: the first one not yet completed. */
export function currentLesson(tree: Roadmap | null, progress: Record<string, Entry>): RoadmapNode | null {
  for (const p of flattenPoints(tree)) {
    if (!progress[p.id]?.done) return p;
  }
  return null;
}

/** Drop built content and code from every lesson except the current one. */
export function trimProgress(tree: Roadmap, progress: Record<string, Entry>): Record<string, Entry> {
  const keep = currentLesson(tree, progress)?.id;
  const out: Record<string, Entry> = {};
  for (const [id, e] of Object.entries(progress)) {
    if (!e) continue;
    out[id] = id === keep ? e : { passed: e.passed ?? [], done: !!e.done, module: e.module };
  }
  return out;
}

function ownKeys(userId: string): string[] {
  const p = prefix(userId);
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(p)) out.push(k);
  }
  return out;
}

function evict(userId: string, keep: number): void {
  const keys = ownKeys(userId);
  // The common case, and the one every save hits: under the limit, nothing to
  // parse. Reading each cached course just to sort them is what made saving slow.
  if (keys.length <= keep) return;
  const entries = keys.map((k) => {
    let savedAt = 0;
    try {
      savedAt = JSON.parse(localStorage.getItem(k) ?? "{}")?.savedAt ?? 0;
    } catch {
      /* unreadable entries sort first, and so are evicted first */
    }
    return { k, savedAt };
  });
  entries.sort((a, b) => a.savedAt - b.savedAt);
  for (const e of entries.slice(0, Math.max(0, entries.length - keep))) {
    localStorage.removeItem(e.k);
  }
}

export function readCourseState(userId: string | null, courseId: string | null): CachedCourseState | null {
  if (!userId || !courseId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId, courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCourseState;
    return parsed?.tree?.topics?.length && parsed.progress ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCourseState(
  userId: string | null,
  courseId: string | null,
  state: { level?: string; goal?: string; tree?: Roadmap | null; progress?: Record<string, Entry>; courseUpdatedAt?: string },
  /** A background write: refused for a course cleared this session. */
  opts: { speculative?: boolean } = {}
): void {
  if (!userId || !courseId || !state.tree?.topics?.length) return;
  const key = keyFor(userId, courseId);
  if (opts.speculative) {
    if (tombstoned.has(key)) return;
  } else {
    tombstoned.delete(key);
  }
  const payload: CachedCourseState = {
    courseId,
    level: state.level,
    goal: state.goal,
    tree: state.tree,
    progress: trimProgress(state.tree, state.progress ?? {}),
    courseUpdatedAt: state.courseUpdatedAt,
    savedAt: Date.now(),
  };
  const write = () => localStorage.setItem(key, JSON.stringify(payload));
  try {
    evict(userId, MAX_COURSES - 1);
    write();
  } catch {
    try {
      evict(userId, Math.floor(MAX_COURSES / 3));
      write();
    } catch {
      /* the app works without a cache */
    }
  }
}

export function clearCourseState(userId: string | null, courseId: string | null): void {
  if (!userId || !courseId) return;
  tombstoned.add(keyFor(userId, courseId));
  try {
    localStorage.removeItem(keyFor(userId, courseId));
  } catch {
    /* ignore */
  }
}

export function clearAllCourseStates(userId: string | null): void {
  if (!userId) return;
  try {
    for (const k of ownKeys(userId)) {
      tombstoned.add(k);
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Warm the cache for every course, most recent first. Sequential, so it never
 * competes for a connection with whatever the learner opens next.
 */
export async function prefetchCourseStates(
  userId: string | null,
  courses: { courseId: string; updatedAt: string }[],
  fetcher: (courseId: string) => Promise<{ level?: string; goal?: string; tree?: Roadmap; progress?: Record<string, Entry> } | null>,
  opts: { signal?: { aborted: boolean } } = {}
): Promise<number> {
  if (!userId) return 0;
  let warmed = 0;
  for (const course of courses.slice(0, MAX_COURSES)) {
    if (opts.signal?.aborted) break;
    const have = readCourseState(userId, course.courseId);
    if (have && have.courseUpdatedAt === course.updatedAt) continue;
    try {
      const state = await fetcher(course.courseId);
      if (opts.signal?.aborted) break;
      if (!state?.tree?.topics?.length) continue;
      writeCourseState(userId, course.courseId, { ...state, courseUpdatedAt: course.updatedAt }, { speculative: true });
      warmed++;
    } catch {
      // One unreachable course must not stop the rest from warming.
    }
  }
  return warmed;
}
