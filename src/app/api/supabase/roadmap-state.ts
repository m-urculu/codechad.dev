// Server utility for persisting per-user, per-skill roadmap state to Supabase.
// Table: public.user_roadmap_state (see supabase/migrations/0001_user_roadmap_state.sql).
//
// Follows the app's existing pattern (anon-key client, explicit user_id). All calls fail
// soft (return null / log) so a paused or unreachable project never breaks the UX.

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";


// tree: the full Roadmap object. progress: { [nodeId]: { passed, done, built? } }
export type RoadmapState = {
  courseId?: string;
  skill?: string;
  module?: string;
  name?: string;
  level?: string;
  goal?: string;
  tree: unknown;
  progress: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

const COURSE_COLS = "course_id, user_id, skill, module, name, level, goal, tree, progress, created_at, updated_at";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toState(r: any): RoadmapState {
  return {
    courseId: r.course_id as string,
    skill: (r.skill as string) ?? undefined,
    module: (r.module as string) ?? undefined,
    name: (r.name as string) ?? (r.skill as string) ?? undefined,
    level: (r.level as string) ?? undefined,
    goal: (r.goal as string) ?? undefined,
    tree: r.tree ?? null,
    progress: (r.progress as Record<string, unknown>) ?? {},
    createdAt: (r.created_at as string) ?? undefined,
    updatedAt: (r.updated_at as string) ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Load one course by its id. `user_id` is still checked so a guessed course_id
// cannot read someone else's course.
export async function loadRoadmapState(user_id: string, course_id: string): Promise<RoadmapState | null> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select(COURSE_COLS)
      .eq("user_id", user_id)
      .eq("course_id", course_id)
      .maybeSingle();
    if (error) {
      console.error("[roadmap-state] load error:", error.message);
      return null;
    }
    return data ? toState(data) : null;
  } catch (e) {
    console.error("[roadmap-state] load exception:", e);
    return null;
  }
}

export type RoadmapSummary = {
  courseId: string;
  skill: string;
  module?: string;
  name: string;        // display label; defaults to the skill, editable in course settings
  level?: string;
  goal?: string;
  createdAt?: string;
  updatedAt: string;
  doneCount: number;   // lesson points marked done — a real count, no denominator implied
  /**
   * Lesson points that EXIST IN THE TREE RIGHT NOW. The snowflake generator builds
   * sub-topics and lessons lazily, one topic at a time, so this is the size of what
   * has been generated — not the size of the course. Never show it as the
   * denominator of a progress fraction: early on it is tiny, so "1/3 lessons" sits
   * next to "4%", and it GROWS as the learner explores, which makes progress appear
   * to move backwards. Use topicsDone/topicsTotal for that. Kept for the client's
   * ratio fallback and for capacity checks.
   */
  totalCount: number;
  topicsDone: number;  // topics whose every generated lesson is complete
  topicsTotal: number; // topics in the roadmap — fixed at L1, so a stable denominator
  ratio: number;       // continuous completion in [0,1] — SAME metric as the roadmap tab
};

// Count "point" (lesson leaf) nodes anywhere in a stored Roadmap tree.
function countPoints(tree: unknown): number {
  let n = 0;
  const walk = (nodes: Array<{ kind?: string; children?: unknown }>) => {
    for (const node of nodes ?? []) {
      if (node?.kind === "point") n++;
      if (Array.isArray(node?.children)) walk(node.children as typeof nodes);
    }
  };
  const topics = (tree as { topics?: unknown })?.topics;
  if (Array.isArray(topics)) walk(topics as Array<{ kind?: string; children?: unknown }>);
  return n;
}

// Continuous completion of the whole roadmap in [0,1], mirroring the roadmap tab EXACTLY:
// each level equally weights its direct children, drilling down to per-lesson objective
// ratios (a done lesson = 1, otherwise passed/total objectives). Ungenerated branches = 0.
type TreeNode = { id?: string; kind?: string; children?: unknown };
type ProgressVal = { done?: boolean; passed?: unknown; built?: { objectives?: unknown[] } };

function pointRatio(id: string | undefined, progress: Record<string, ProgressVal>): number {
  const e = id ? progress[id] : undefined;
  if (!e) return 0;
  if (e.done) return 1;
  const total = Array.isArray(e.built?.objectives) ? e.built!.objectives!.length : 0;
  const passed = Array.isArray(e.passed) ? e.passed.length : 0;
  return total > 0 ? Math.min(1, passed / total) : 0;
}

// Completion of one node in [0,1]. An unexpanded branch (children null/empty) is 0:
// nothing under it can have been learned yet.
function nodeRatio(node: TreeNode, progress: Record<string, ProgressVal>): number {
  if (node?.kind === "point") return pointRatio(node.id, progress);
  const children = node?.children;
  if (!Array.isArray(children) || children.length === 0) return 0;
  return (
    (children as TreeNode[]).reduce((s, c) => s + nodeRatio(c, progress), 0) / children.length
  );
}

function topLevelTopics(tree: unknown): TreeNode[] {
  const topics = (tree as { topics?: unknown })?.topics;
  return Array.isArray(topics) ? (topics as TreeNode[]) : [];
}

function computeRatio(tree: unknown, progress: Record<string, ProgressVal>): number {
  const topics = topLevelTopics(tree);
  if (topics.length === 0) return 0;
  return topics.reduce((s, t) => s + nodeRatio(t, progress), 0) / topics.length;
}

// Progress counted in TOPICS, which is the only unit whose denominator is honest:
// the topic list is generated up front and does not move, whereas the lesson count
// only reflects the branches expanded so far.
function topicCounts(
  tree: unknown,
  progress: Record<string, ProgressVal>
): { done: number; total: number } {
  const topics = topLevelTopics(tree);
  // 0.999 rather than 1: the ratio is a mean of means, so a fully-complete topic
  // can land a hair under 1 through floating point alone.
  const done = topics.filter((t) => nodeRatio(t, progress) >= 0.999).length;
  return { done, total: topics.length };
}

// All roadmaps for a user, newest first, with computed progress counts.
export async function listRoadmapStates(user_id: string): Promise<RoadmapSummary[]> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select("course_id, skill, module, name, level, goal, tree, progress, created_at, updated_at")
      .eq("user_id", user_id)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[roadmap-state] list error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => {
      const progress = (r.progress ?? {}) as Record<string, ProgressVal>;
      const doneCount = Object.values(progress).filter((p) => p?.done).length;
      const topics = topicCounts(r.tree, progress);
      return {
        courseId: r.course_id as string,
        skill: r.skill as string,
        module: (r.module as string) ?? undefined,
        name: (r.name as string) || (r.skill as string),
        level: (r.level as string) ?? undefined,
        goal: (r.goal as string) ?? undefined,
        createdAt: (r.created_at as string) ?? undefined,
        updatedAt: r.updated_at as string,
        doneCount,
        totalCount: countPoints(r.tree),
        topicsDone: topics.done,
        topicsTotal: topics.total,
        ratio: computeRatio(r.tree, progress),
      };
    });
  } catch (e) {
    console.error("[roadmap-state] list exception:", e);
    return [];
  }
}

// Permanently removes a course: the roadmap row and its chat history. Progress
// lives inside the roadmap row, so it goes with it.
export async function deleteRoadmapState(user_id: string, course_id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("user_roadmap_state")
      .delete()
      .eq("user_id", user_id)
      .eq("course_id", course_id);
    if (error) {
      console.error("[roadmap-state] delete error:", error.message);
      return false;
    }
    const { error: chatErr } = await supabase
      .from("user_chat_state")
      .delete()
      .eq("user_id", user_id)
      .eq("course_id", course_id);
    if (chatErr) console.error("[roadmap-state] chat delete error:", chatErr.message);
    return true;
  } catch (e) {
    console.error("[roadmap-state] delete exception:", e);
    return false;
  }
}

// Save a course. With a course_id this is a partial UPDATE; without one a new
// course is INSERTed.
//
// Deliberately not an upsert: PostgREST's upsert is an INSERT ... ON CONFLICT, and
// Postgres validates the proposed INSERT row before it ever reaches the conflict
// clause. A partial write (say, just `name`) therefore trips skill's NOT NULL
// constraint and fails, even though the row exists and only needed updating.
export async function saveRoadmapState(
  user_id: string,
  course_id: string | undefined,
  state: Partial<RoadmapState>
): Promise<string | null> {
  try {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (state.skill !== undefined) row.skill = state.skill;
    if (state.module !== undefined) row.module = state.module;
    if (state.name !== undefined) row.name = state.name;
    if (state.level !== undefined) row.level = state.level;
    if (state.goal !== undefined) row.goal = state.goal;
    if (state.tree !== undefined) row.tree = state.tree;
    if (state.progress !== undefined) row.progress = state.progress;

    if (course_id) {
      // Matching on user_id too means a guessed course_id cannot touch someone
      // else's course.
      const { data, error } = await supabase
        .from("user_roadmap_state")
        .update(row)
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .select("course_id")
        .maybeSingle();
      if (error) {
        console.error("[roadmap-state] update error:", error.message);
        return null;
      }
      return (data?.course_id as string) ?? null;
    }

    const { data, error } = await supabase
      .from("user_roadmap_state")
      .insert({ ...row, user_id })
      .select("course_id")
      .maybeSingle();
    if (error) {
      console.error("[roadmap-state] insert error:", error.message);
      return null;
    }
    return (data?.course_id as string) ?? null;
  } catch (e) {
    console.error("[roadmap-state] save exception:", e);
    return null;
  }
}

// Copy a course into a new one. The roadmap tree and calibration carry over so the
// duplicate is immediately usable; progress and chat history deliberately do not —
// the point of duplicating is to run the same curriculum again from zero.
// "Python" -> "Python" when free, otherwise "Python (2)", "Python (3)", … so two
// courses for the same technology stay tellable apart on the landing page.
export async function uniqueCourseName(
  user_id: string,
  base: string,
  /** Course being renamed — its own current name must not count as taken. */
  excludeCourseId?: string
): Promise<string> {
  const root = (base || "Course").replace(/ \(\d+\)$/, "");
  const taken = new Set(
    (await listRoadmapStates(user_id))
      .filter((s) => s.courseId !== excludeCourseId)
      .map((s) => s.name)
  );
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root} (${n})`)) n++;
  return `${root} (${n})`;
}

// Name a course after the roadmap that was just generated for it.
//
// A course row is created the moment the learner answers the first calibration
// question — before any content exists — so it starts out called after the bare
// technology ("Python", or "Python (2)" if that was taken). Those are placeholders,
// and once there is a curriculum we can do better.
//
// A name the learner typed themselves is never overwritten: only a name still in
// the placeholder shape is replaced. That is the whole rule, and it is enforced
// here rather than at the call site so every generation path inherits it.
// A course name nobody has chosen: empty, the technology's own name, or that name
// with the numeric suffix uniqueCourseName appends. Anything else is the learner's.
export function isPlaceholderCourseName(current: string, skill: string): boolean {
  const c = (current ?? "").trim();
  const s = (skill ?? "").trim();
  if (!c) return true;
  if (!s) return false;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}( \\(\\d+\\))?$`, "i").test(c);
}

export async function applyGeneratedName(
  user_id: string,
  course_id: string,
  proposed: string
): Promise<string | null> {
  const course = await loadRoadmapState(user_id, course_id);
  if (!course) return null;

  const current = (course.name ?? "").trim();
  if (!isPlaceholderCourseName(current, course.skill ?? "")) return current;

  const name = await uniqueCourseName(user_id, proposed, course_id);
  if (name === current) return current;
  const ok = await saveRoadmapState(user_id, course_id, { name });
  return ok ? name : null;
}

export async function duplicateCourse(user_id: string, course_id: string): Promise<string | null> {
  const src = await loadRoadmapState(user_id, course_id);
  if (!src) return null;
  // A duplicate always gets a suffix — the source already holds the plain name.
  const base = (src.name || src.skill || "Course").replace(/ \(\d+\)$/, "");
  const name = await uniqueCourseName(user_id, base);
  return saveRoadmapState(user_id, undefined, {
    skill: src.skill,
    module: src.module,
    name,
    level: src.level,
    goal: src.goal,
    tree: src.tree,
    progress: {},
  });
}

// The learner's OTHER courses for the same technology, reduced to their top-level
// topic titles. Fed into generation so a second course for a language builds on the
// first instead of repeating it.
export type SiblingCourse = { name: string; goal?: string; topics: string[] };

export async function siblingCourses(
  user_id: string,
  module: string,
  excludeCourseId?: string
): Promise<SiblingCourse[]> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select("course_id, skill, name, goal, tree")
      .eq("user_id", user_id)
      .eq("module", module);
    if (error) {
      console.error("[roadmap-state] siblings error:", error.message);
      return [];
    }
    return (data ?? [])
      .filter((r) => r.course_id !== excludeCourseId)
      .map((r) => {
        const topics = (r.tree as { topics?: Array<{ title?: string }> } | null)?.topics;
        return {
          name: (r.name as string) || (r.skill as string),
          goal: (r.goal as string) ?? undefined,
          topics: Array.isArray(topics)
            ? topics.map((t) => String(t?.title ?? "").trim()).filter(Boolean)
            : [],
        };
      })
      .filter((s) => s.topics.length > 0);
  } catch (e) {
    console.error("[roadmap-state] siblings exception:", e);
    return [];
  }
}

// Clear completions but keep the curriculum, so the course can be retaken.
export async function resetCourseProgress(user_id: string, course_id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("user_roadmap_state")
      .update({ progress: {}, updated_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("course_id", course_id);
    if (error) {
      console.error("[roadmap-state] reset error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[roadmap-state] reset exception:", e);
    return false;
  }
}
