// Server utility for persisting per-user, per-skill roadmap state to Supabase.
// Table: public.user_roadmap_state (see supabase/migrations/0001_user_roadmap_state.sql).
//
// Follows the app's existing pattern (anon-key client, explicit user_id). All calls fail
// soft (return null / log) so a paused or unreachable project never breaks the UX.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

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

// The user's most recent course for a module — used when opening a technology
// from the landing grid without picking a specific course.
export async function latestCourseForModule(
  user_id: string,
  module: string
): Promise<RoadmapState | null> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select(COURSE_COLS)
      .eq("user_id", user_id)
      .eq("module", module)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[roadmap-state] latest error:", error.message);
      return null;
    }
    return data && data.length ? toState(data[0]) : null;
  } catch (e) {
    console.error("[roadmap-state] latest exception:", e);
    return null;
  }
}

// Summary of one stored roadmap for the "Continue learning" list on the main page.
export type RoadmapSummary = {
  courseId: string;
  skill: string;
  module?: string;
  name: string;        // display label; defaults to the skill, editable in course settings
  level?: string;
  goal?: string;
  createdAt?: string;
  updatedAt: string;
  doneCount: number;   // lesson points marked done
  totalCount: number;  // lesson points currently in the (lazily-expanded) tree
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
function computeRatio(tree: unknown, progress: Record<string, ProgressVal>): number {
  const pointRatio = (id?: string): number => {
    const e = id ? progress[id] : undefined;
    if (!e) return 0;
    if (e.done) return 1;
    const total = Array.isArray(e.built?.objectives) ? e.built!.objectives!.length : 0;
    const passed = Array.isArray(e.passed) ? e.passed.length : 0;
    return total > 0 ? Math.min(1, passed / total) : 0;
  };
  const ratio = (node: TreeNode): number => {
    if (node?.kind === "point") return pointRatio(node.id);
    const children = node?.children;
    if (!Array.isArray(children) || children.length === 0) return 0;
    return (children as TreeNode[]).reduce((s, c) => s + ratio(c), 0) / children.length;
  };
  const topics = (tree as { topics?: unknown })?.topics;
  if (!Array.isArray(topics) || topics.length === 0) return 0;
  return (topics as TreeNode[]).reduce((s, t) => s + ratio(t), 0) / topics.length;
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

// Upsert by course_id. When no course_id is supplied a new course is created —
// that is how a technology opened for the first time gets its row.
export async function saveRoadmapState(
  user_id: string,
  course_id: string | undefined,
  state: Partial<RoadmapState>
): Promise<string | null> {
  try {
    const row: Record<string, unknown> = { user_id, updated_at: new Date().toISOString() };
    if (course_id) row.course_id = course_id;
    if (state.skill !== undefined) row.skill = state.skill;
    if (state.module !== undefined) row.module = state.module;
    if (state.name !== undefined) row.name = state.name;
    if (state.level !== undefined) row.level = state.level;
    if (state.goal !== undefined) row.goal = state.goal;
    if (state.tree !== undefined) row.tree = state.tree;
    if (state.progress !== undefined) row.progress = state.progress;
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .upsert(row, { onConflict: "course_id" })
      .select("course_id")
      .maybeSingle();
    if (error) {
      console.error("[roadmap-state] save error:", error.message);
      return null;
    }
    return (data?.course_id as string) ?? course_id ?? null;
  } catch (e) {
    console.error("[roadmap-state] save exception:", e);
    return null;
  }
}

// Copy a course into a new one. The roadmap tree and calibration carry over so the
// duplicate is immediately usable; progress and chat history deliberately do not —
// the point of duplicating is to run the same curriculum again from zero.
export async function duplicateCourse(user_id: string, course_id: string): Promise<string | null> {
  const src = await loadRoadmapState(user_id, course_id);
  if (!src) return null;
  const siblings = await listRoadmapStates(user_id);
  const base = (src.name || src.skill || "Course").replace(/ \(\d+\)$/, "");
  const taken = new Set(siblings.map((s) => s.name));
  let name = `${base} (2)`;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
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
