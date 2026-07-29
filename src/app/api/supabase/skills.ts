// Persistence for the skills ledger (public.user_skill, migration 0009).
//
// Write path:  syncCourseSkills — called whenever a course's progress is saved.
// Read path:   loadKnownSkills  — called by the three generation routes.
//
// Everything here fails soft, like the rest of api/supabase: a ledger that cannot
// be read must degrade to "we know nothing about this learner", which is exactly
// the behaviour the app had before this existed. It must never turn a lesson the
// learner is waiting for into a 500.

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { deriveSkills, type KnownSkill } from "@/lib/skills";
import type { Roadmap } from "@/lib/agents/snowflake";
import type { LessonProgress } from "@/lib/courseProgress";

/**
 * Recompute one course's contribution to the ledger and make the table match it.
 *
 * Idempotent and diff-based: rows this course no longer justifies are deleted, the
 * rest are upserted. That is what makes "reset course progress" work without any
 * special handling — the derived set becomes empty and the delete removes
 * everything the course had claimed.
 *
 * The upsert conflict target is (user_id, module, skill_key), so a topic finished
 * in two different courses of the same technology occupies ONE row, last course
 * to finish it holding the evidence. A conflicting row from a DIFFERENT course is
 * therefore overwritten rather than duplicated — deliberate: the ledger records
 * that the learner knows the thing, not every occasion on which they proved it.
 */
export async function syncCourseSkills(
  user_id: string,
  course_id: string,
  input: {
    tree: unknown;
    progress: Record<string, LessonProgress> | undefined;
    module?: string;
    technology?: string;
    courseName?: string;
  }
): Promise<number> {
  try {
    const derived = deriveSkills(
      (input.tree ?? null) as Roadmap | null,
      input.progress ?? {}
    );
    const mod = input.module ?? "";

    // Drop what this course used to evidence and no longer does. Scoped to this
    // course so another course's rows are never collateral.
    const keep = derived.map((d) => d.key);
    let stale = supabase.from("user_skill").delete().eq("user_id", user_id).eq("course_id", course_id);
    if (keep.length) {
      // PostgREST needs the list quoted for `not.in` — a title-derived key can
      // contain characters the filter grammar treats as syntax.
      stale = stale.not("skill_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
    }
    const { error: delErr } = await stale;
    if (delErr) console.error("[skills] prune error:", delErr.message);

    if (!derived.length) return 0;

    const now = new Date().toISOString();
    const { error } = await supabase.from("user_skill").upsert(
      derived.map((d) => ({
        user_id,
        skill_key: d.key,
        module: mod,
        label: d.label,
        kind: d.kind,
        technology: input.technology ?? null,
        course_id,
        course_name: input.courseName ?? null,
        completed_at: now,
      })),
      { onConflict: "user_id,module,skill_key" }
    );
    if (error) {
      console.error("[skills] upsert error:", error.message);
      return 0;
    }
    return derived.length;
  } catch (e) {
    console.error("[skills] sync exception:", e);
    return 0;
  }
}

/**
 * Re-derive a course's ledger rows from what is CURRENTLY stored for it.
 *
 * The call sites that clear progress (reset, recalibrate) do not hold the tree, and
 * making each of them remember to prune the ledger is how the two drift apart. They
 * call this instead, after the write, and the ledger follows whatever the course now
 * says — including "nothing", which is the point.
 */
export async function resyncCourseSkills(user_id: string, course_id: string): Promise<number> {
  const { loadRoadmapState } = await import("@/app/api/supabase/roadmap-state");
  const course = await loadRoadmapState(user_id, course_id);
  if (!course) return 0;
  return syncCourseSkills(user_id, course_id, {
    tree: course.tree,
    progress: course.progress as Record<string, LessonProgress>,
    module: course.module,
    technology: course.skill,
    courseName: course.name,
  });
}

/**
 * Everything this learner has completed, coarsest first.
 *
 * The ordering is what makes truncation safe further down: knownSkillsBlock caps
 * each heading, and with topics ahead of sub-topics ahead of lessons, the entries
 * that fall off the end are always the least informative ones.
 *
 * `excludeCourseId` keeps the course being generated out of its own context. Without
 * it, regenerating a course would feed its own finished topics back in as "already
 * covered" and the model would refuse to rebuild the course at all.
 */
export async function loadKnownSkills(
  user_id: string,
  excludeCourseId?: string
): Promise<KnownSkill[]> {
  try {
    const { data, error } = await supabase
      .from("user_skill")
      .select("skill_key, module, label, kind, technology, course_id, course_name")
      .eq("user_id", user_id)
      .order("kind", { ascending: true }) // point < subtopic < topic alphabetically…
      .limit(400);
    if (error) {
      console.error("[skills] load error:", error.message);
      return [];
    }
    const rank: Record<string, number> = { topic: 0, subtopic: 1, point: 2 };
    return (data ?? [])
      .filter((r) => r.course_id !== excludeCourseId)
      .map((r) => ({
        key: r.skill_key as string,
        label: r.label as string,
        kind: r.kind as KnownSkill["kind"],
        module: (r.module as string) ?? "",
        technology: (r.technology as string) ?? undefined,
        courseName: (r.course_name as string) ?? undefined,
      }))
      // …but "alphabetically" is not the order we want, so sort properly here
      // rather than relying on the column happening to collate the right way.
      .sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
  } catch (e) {
    console.error("[skills] load exception:", e);
    return [];
  }
}

/** Everything the learner knows, for the account/export view. */
export async function countKnownSkills(user_id: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("user_skill")
      .select("skill_key", { count: "exact", head: true })
      .eq("user_id", user_id);
    if (error) {
      console.error("[skills] count error:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}
