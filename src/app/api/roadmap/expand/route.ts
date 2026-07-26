// POST /api/roadmap/expand — L2/L3 lazy expansion of one node.
// Body: { skill, level?, goal?, kind, title, parentId, path }  ->  { children }

import { NextResponse } from "next/server";
import { expandNode, type NodeKind } from "@/lib/agents/snowflake";
import { getRuntime } from "@/lib/runtimes/registry";
import { requireUser } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const body = await request.json();
    const { skill, level, goal, kind, title, parentId, path, treeOutline, moduleId } = body as {
      skill?: string;
      level?: string;
      goal?: string;
      kind?: NodeKind;
      title?: string;
      parentId?: string;
      path?: string[];
      treeOutline?: string;
      moduleId?: string;
    };

    if (!skill || !title || !parentId || (kind !== "topic" && kind !== "subtopic")) {
      return NextResponse.json({ error: "skill, title, parentId and a valid kind are required" }, { status: 400 });
    }

    const children = await expandNode({
      skill,
      level,
      goal,
      kind,
      title,
      parentId,
      path: Array.isArray(path) ? path : [title],
      treeOutline: typeof treeOutline === "string" ? treeOutline : undefined,
      runtimeNotes: moduleId ? getRuntime(moduleId).runNotes : undefined,
    });

    return NextResponse.json({ children });
  } catch (error) {
    console.error("[roadmap/expand] error:", error);
    return NextResponse.json({ error: "Roadmap expand error", details: String(error) }, { status: 500 });
  }
}
