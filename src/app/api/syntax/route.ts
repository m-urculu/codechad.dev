// POST /api/syntax — record the syntax a lesson showed, once its solution is validated.
// Body: { module, point_id, course_id?, items: SyntaxItem[], solution } -> { recorded }
//
// The items are re-checked against the solution here, so only syntax that appears in
// the validated code is stored. See src/lib/syntax.ts.

import { NextResponse } from "next/server";
import { recordSyntax } from "@/app/api/supabase/syntax";
import { parseSyntax } from "@/lib/syntax";
import { requireUser } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { module, point_id, course_id, items, solution } = await request.json();
    if (!module || !point_id) {
      return NextResponse.json({ error: "module and point_id are required" }, { status: 400 });
    }
    const valid = parseSyntax(items, typeof solution === "string" ? solution : undefined);
    const recorded = await recordSyntax(who.userId, {
      module: String(module),
      point_id: String(point_id),
      course_id: course_id ? String(course_id) : undefined,
      items: valid,
    });
    return NextResponse.json({ recorded });
  } catch (error) {
    console.error("[syntax] error:", error);
    return NextResponse.json({ error: "Syntax record error" }, { status: 500 });
  }
}
