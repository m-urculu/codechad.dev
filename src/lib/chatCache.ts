// Local cache of each course's conversation, so opening a course shows the last
// thing that happened in it immediately instead of after a round trip.
//
// WHY: the workspace boots, then asks /api/chat/state for the whole thread, then
// paints. On a resumed course that is a visible empty pane followed by a jump —
// and the learner is looking at the one screen that is supposed to carry the
// thread of what they were doing. The cache removes the wait; the server response
// still arrives and still wins.
//
// The landing page warms this in the background for the courses most recently
// worked on (see prefetchChats), so by the time a course is clicked its
// conversation is usually already here.
//
// STORAGE DISCIPLINE. localStorage is a few megabytes for the whole origin and
// conversations are the biggest thing this app could put in it, so:
//   - one key per course, so writing one thread never rewrites the others;
//   - only the newest MAX_MESSAGES of each, which is all the UI opens on anyway;
//   - a bounded number of courses, oldest evicted first;
//   - a quota error evicts and retries once, then gives up quietly. A cache that
//     cannot be written is a slower app, not a broken one.

export type CachedChatMsg = { role: "user" | "bot"; text: string; lessonId?: string };
export type CachedChatCalib = { step?: string; level?: string; goal?: string };

export type CachedChat = {
  messages: CachedChatMsg[];
  calib: CachedChatCalib;
  /**
   * The course's `updatedAt` when this was cached. Lets the prefetcher skip a
   * course whose row has not changed since — the common case on a repeat visit,
   * and the difference between warming a cache and re-downloading everything.
   */
  courseUpdatedAt?: string;
  /** When we wrote it — the eviction order. */
  savedAt: number;
};

const VERSION = 1;
// The chat opens on its newest batch (25) and reveals older ones on scroll; past
// this the learner is reading history, which is worth a request.
const MAX_MESSAGES = 60;
// Courses kept at once. Beyond a handful, someone is browsing rather than
// resuming, and the tail is unlikely to be opened before the next revalidation.
const MAX_COURSES = 12;

const prefix = (userId: string) => `codechad:chat:v${VERSION}:${userId}:`;
const keyFor = (userId: string, courseId: string) => prefix(userId) + courseId;

// Courses cleared during this page session.
//
// The background warm-up is a queue of requests that outlives the moment it was
// started, so a course can be DELETED while its own prefetch is in flight — and
// the response then writes the conversation of a deleted course back into the
// cache, where it would be read the next time something with that id is opened.
// Found by testing the delete path against a warm-up that was still running.
//
// In memory, because that is exactly the lifetime of the race: a reload has no
// in-flight requests left to lose to.
const tombstoned = new Set<string>();

function ownKeys(userId: string): string[] {
  const p = prefix(userId);
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(p)) out.push(k);
  }
  return out;
}

/** Drop the least recently written entries until at most `keep` remain. */
function evict(userId: string, keep: number): void {
  const entries = ownKeys(userId).map((k) => {
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

export function readChat(userId: string | null, courseId: string | null): CachedChat | null {
  if (!userId || !courseId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId, courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChat;
    return Array.isArray(parsed?.messages) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeChat(
  userId: string | null,
  courseId: string | null,
  state: { messages: CachedChatMsg[]; calib?: CachedChatCalib; courseUpdatedAt?: string },
  /**
   * A speculative write is one nobody asked for — the background warm-up. It is
   * refused for a course cleared during this session, because it may be the
   * answer to a request that was already in flight when the course was deleted.
   *
   * An ordinary write is the opposite: it carries a conversation the learner is
   * having RIGHT NOW, which is also how a cleared course legitimately comes back
   * (reset the course, then keep talking). So it clears the tombstone.
   */
  opts: { speculative?: boolean } = {}
): void {
  if (!userId || !courseId) return;
  const tomb = keyFor(userId, courseId);
  if (opts.speculative) {
    if (tombstoned.has(tomb)) return;
  } else {
    tombstoned.delete(tomb);
  }
  const payload: CachedChat = {
    messages: state.messages.slice(-MAX_MESSAGES),
    calib: state.calib ?? {},
    courseUpdatedAt: state.courseUpdatedAt,
    savedAt: Date.now(),
  };
  const write = () => localStorage.setItem(keyFor(userId, courseId), JSON.stringify(payload));
  try {
    evict(userId, MAX_COURSES - 1);
    write();
  } catch {
    // Out of quota — most likely something else on the origin. Make room from our
    // own entries and try once more, then leave it alone.
    try {
      evict(userId, Math.floor(MAX_COURSES / 3));
      write();
    } catch {
      /* the app works without a cache; that is the whole design */
    }
  }
}

export function clearChat(userId: string | null, courseId: string | null): void {
  if (!userId || !courseId) return;
  tombstoned.add(keyFor(userId, courseId));
  try {
    localStorage.removeItem(keyFor(userId, courseId));
  } catch {
    /* ignore */
  }
}

export function clearAllChats(userId: string | null): void {
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
 * Warm the cache for a list of courses, newest session first.
 *
 * Deliberately sequential. This runs while the learner is reading the landing
 * page and choosing what to open; it must never compete with the thing they
 * click next for a connection. In order means the course they are most likely to
 * resume is fetched first, so the ordering does most of the work — by the time
 * anyone has read the page, the top of the list is already in.
 *
 * `fetcher` is passed in rather than imported so this stays testable and so the
 * caller decides what carries the auth header.
 */
export async function prefetchChats(
  userId: string | null,
  courses: { courseId: string; updatedAt: string }[],
  fetcher: (courseId: string) => Promise<{ messages: CachedChatMsg[]; calib?: CachedChatCalib } | null>,
  opts: { limit?: number; signal?: { aborted: boolean } } = {}
): Promise<number> {
  if (!userId) return 0;
  const limit = opts.limit ?? 8;
  let warmed = 0;
  for (const course of courses.slice(0, limit)) {
    if (opts.signal?.aborted) break;
    // Already have it, and the course has not been touched since: nothing to do.
    const have = readChat(userId, course.courseId);
    if (have && have.courseUpdatedAt === course.updatedAt) continue;
    try {
      const state = await fetcher(course.courseId);
      if (opts.signal?.aborted) break;
      if (!state?.messages?.length) continue;
      writeChat(
        userId,
        course.courseId,
        { messages: state.messages, calib: state.calib, courseUpdatedAt: course.updatedAt },
        { speculative: true }
      );
      warmed++;
    } catch {
      // One unreachable course must not stop the rest from warming.
    }
  }
  return warmed;
}
