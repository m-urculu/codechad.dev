// POST /api/roadmap/expand — L2/L3 lazy expansion of one node.
// Body: { skill, level?, goal?, kind, title, parentId, path }  ->  { children }

import { NextResponse } from "next/server";
import { expandNode, type NodeKind } from "@/lib/agents/snowflake";
import { getRuntime } from "@/lib/runtimes/registry";
import { userOrTrial } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const body = await request.json();
    const { skill, level, goal, kind, title, summary, parentId, path, treeOutline, moduleId, nodeModule } = body as {
      skill?: string;
      level?: string;
      goal?: string;
      kind?: NodeKind;
      title?: string;
      /** What this node covers, when the tree already knows — a condensed path
       *  chapter carries the list of chapters it has to fit in. */
      summary?: string;
      parentId?: string;
      path?: string[];
      treeOutline?: string;
      moduleId?: string;
      /** The runtime of the node being expanded, for a path that spans several. */
      nodeModule?: string;
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
      summary: typeof summary === "string" ? summary : undefined,
      parentId,
      path: Array.isArray(path) ? path : [title],
      treeOutline: typeof treeOutline === "string" ? treeOutline : undefined,
      // The node's OWN runtime decides what can be practiced under it. On a path the
      // course module is only the fallback — decomposing a Docker topic against
      // Python's sandbox rules is how you get children that teach the wrong thing.
      runtimeNotes: nodeModule || moduleId ? getRuntime(nodeModule || moduleId).runNotes : undefined,
      // The node's own runtime when a path gave it one, so its children inherit it.
      module: typeof nodeModule === "string" ? nodeModule : undefined,
    });

    return NextResponse.json({ children });
  } catch (error) {
    console.error("[roadmap/expand] error:", error);
    return NextResponse.json({ error: "Roadmap expand error", details: String(error) }, { status: 500 });
  }
}
