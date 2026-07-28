// Local cache of the "My courses" list, so the landing page paints instantly.
//
// WHY: /api/roadmap/list reads every course row INCLUDING its full `tree` and
// `progress` JSON, then walks both to compute the progress figures. That is the
// only way to get an honest ratio (see roadmap-state.ts), but it means the list
// costs hundreds of kilobytes and a round trip — paid again on every refresh and
// every return from the workspace, to redraw cards whose titles, icons and levels
// have not changed since the user created them.
//
// So: render from cache immediately, revalidate in the background, and let the
// fresh response update the ONLY fields that actually move — the progress ones.
// Identity fields are left alone, which is what keeps the cards from flickering.
//
// The cache is a rendering shortcut, never a source of truth: the server response
// always wins, and anything unreadable or from another schema version is dropped
// rather than repaired.

export type RoadmapSummary = {
  courseId: string;
  skill: string;
  module?: string;
  name: string; // display label; a duplicate gets "Python (2)"
  level?: string;
  goal?: string;
  createdAt?: string;
  updatedAt: string;
  doneCount: number;
  /** Lessons generated so far, not the size of the course — never a denominator. */
  totalCount: number;
  topicsDone: number;
  topicsTotal: number;
  ratio?: number; // continuous completion [0,1] — matches the roadmap tab's overall bar
};

// Bumped whenever the shape above changes, so an old cache is discarded instead
// of being read as the new shape.
const VERSION = 1;

// Per user: a shared browser must never paint one account's courses for another.
function keyFor(userId: string): string {
  return `codechad:courses:v${VERSION}:${userId}`;
}

export function readCourses(userId: string | null): RoadmapSummary[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Guard the one field every consumer indexes by; a summary without it would
    // render a card that cannot be opened, deleted or keyed.
    return parsed.filter((r) => r && typeof r.courseId === "string");
  } catch {
    // Private mode, quota, hand-edited value — no cache is a valid state.
    return null;
  }
}

export function writeCourses(userId: string | null, list: RoadmapSummary[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(list));
  } catch {
    /* nothing to do — the list still renders, it just won't be cached */
  }
}

export function clearCourses(userId: string | null): void {
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Fold a fresh server list into the cached one.
 *
 * The server is authoritative about WHICH courses exist and about every value in
 * them — this does not preserve stale local data. What it preserves is object
 * IDENTITY: a course whose progress has not moved comes back as the very same
 * object, so React's reconciler and any memo below it see no change at all.
 */
export function mergeCourses(
  cached: RoadmapSummary[] | null,
  fresh: RoadmapSummary[]
): RoadmapSummary[] {
  if (!cached?.length) return fresh;
  const byId = new Map(cached.map((r) => [r.courseId, r]));
  return fresh.map((f) => {
    const old = byId.get(f.courseId);
    if (!old) return f;
    // Any difference at all — a rename, a new goal, more lessons done — takes the
    // server's row wholesale. The comparison exists to detect "nothing changed",
    // not to merge field by field.
    const same = (Object.keys(f) as (keyof RoadmapSummary)[]).every((k) => old[k] === f[k]);
    return same ? old : { ...old, ...f };
  });
}

/**
 * Update one cached course in place, without a round trip.
 *
 * Called from the workspace as the learner works, and from course settings after
 * a rename, so that returning to the landing page shows the change on the FIRST
 * paint rather than yesterday's value that jumps a second later when the list
 * request lands. Purely cosmetic: the next revalidation overwrites it with the
 * server's own figures either way, which is why it may safely be approximate.
 */
export function patchCourse(
  userId: string | null,
  courseId: string | null,
  patch: Partial<RoadmapSummary>
): void {
  if (!userId || !courseId) return;
  const list = readCourses(userId);
  if (!list) return;
  let touched = false;
  const next = list.map((r) => {
    if (r.courseId !== courseId) return r;
    touched = true;
    return { ...r, ...patch };
  });
  if (touched) writeCourses(userId, next);
}
