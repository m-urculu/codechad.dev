// Persistence for the syntax ledger (public.user_syntax, migration 0010).
//
// Fails soft like skills.ts: a ledger that cannot be read degrades to "this learner
// has seen nothing", which only means more explanation, never a failed lesson.

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { syntaxKey, type SyntaxItem, type SyntaxSeen } from "@/lib/syntax";

/** Record that a lesson showed these items. Idempotent per (syntax, lesson). */
export async function recordSyntax(
  user_id: string,
  input: { module: string; point_id: string; course_id?: string; items: SyntaxItem[] }
): Promise<number> {
  if (!input.items.length) return 0;
  try {
    const { error } = await supabase.from("user_syntax").upsert(
      input.items.map((it) => ({
        user_id,
        module: input.module,
        syntax_key: syntaxKey(it.token),
        point_id: input.point_id,
        token: it.token,
        doc: it.doc,
        course_id: input.course_id ?? null,
      })),
      { onConflict: "user_id,module,syntax_key,point_id", ignoreDuplicates: true }
    );
    if (error) {
      console.error("[syntax] record error:", error.message);
      return 0;
    }
    return input.items.length;
  } catch (e) {
    console.error("[syntax] record exception:", e);
    return 0;
  }
}

/**
 * How many lessons each piece of syntax has appeared in, for one technology.
 * `excludePointId` keeps a lesson that is being rebuilt from counting itself.
 */
export async function loadSyntaxSeen(
  user_id: string,
  module: string,
  excludePointId?: string
): Promise<SyntaxSeen> {
  try {
    const { data, error } = await supabase
      .from("user_syntax")
      .select("syntax_key, point_id")
      .eq("user_id", user_id)
      .eq("module", module)
      .limit(2000);
    if (error) {
      console.error("[syntax] load error:", error.message);
      return {};
    }
    const seen: SyntaxSeen = {};
    for (const r of data ?? []) {
      if (r.point_id === excludePointId) continue;
      const k = r.syntax_key as string;
      seen[k] = (seen[k] ?? 0) + 1;
    }
    return seen;
  } catch (e) {
    console.error("[syntax] load exception:", e);
    return {};
  }
}
