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
  level?: string;
  goal?: string;
  tree: unknown;
  progress: Record<string, unknown>;
};

export async function loadRoadmapState(user_id: string, skill: string): Promise<RoadmapState | null> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select("level, goal, tree, progress")
      .eq("user_id", user_id)
      .eq("skill", skill)
      .maybeSingle();
    if (error) {
      console.error("[roadmap-state] load error:", error.message);
      return null;
    }
    if (!data) return null;
    return {
      level: data.level ?? undefined,
      goal: data.goal ?? undefined,
      tree: data.tree ?? null,
      progress: (data.progress as Record<string, unknown>) ?? {},
    };
  } catch (e) {
    console.error("[roadmap-state] load exception:", e);
    return null;
  }
}

// Summary of one stored roadmap for the "Continue learning" list on the main page.
export type RoadmapSummary = {
  skill: string;
  level?: string;
  goal?: string;
  updatedAt: string;
  doneCount: number;   // lesson points marked done
  totalCount: number;  // lesson points currently in the (lazily-expanded) tree
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

// All roadmaps for a user, newest first, with computed progress counts.
export async function listRoadmapStates(user_id: string): Promise<RoadmapSummary[]> {
  try {
    const { data, error } = await supabase
      .from("user_roadmap_state")
      .select("skill, level, goal, tree, progress, updated_at")
      .eq("user_id", user_id)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[roadmap-state] list error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => {
      const progress = (r.progress ?? {}) as Record<string, { done?: boolean }>;
      const doneCount = Object.values(progress).filter((p) => p?.done).length;
      return {
        skill: r.skill as string,
        level: (r.level as string) ?? undefined,
        goal: (r.goal as string) ?? undefined,
        updatedAt: r.updated_at as string,
        doneCount,
        totalCount: countPoints(r.tree),
      };
    });
  } catch (e) {
    console.error("[roadmap-state] list exception:", e);
    return [];
  }
}

export async function saveRoadmapState(
  user_id: string,
  skill: string,
  state: Partial<RoadmapState>
): Promise<boolean> {
  try {
    const row: Record<string, unknown> = { user_id, skill, updated_at: new Date().toISOString() };
    if (state.level !== undefined) row.level = state.level;
    if (state.goal !== undefined) row.goal = state.goal;
    if (state.tree !== undefined) row.tree = state.tree;
    if (state.progress !== undefined) row.progress = state.progress;
    const { error } = await supabase.from("user_roadmap_state").upsert(row, { onConflict: "user_id,skill" });
    if (error) {
      console.error("[roadmap-state] save error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[roadmap-state] save exception:", e);
    return false;
  }
}
