"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Play, Check, Loader2, Circle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

type RoadmapPanelProps = {
  roadmap: Roadmap | null;
  activeNodeId: string | null;
  doneNodeIds: string[];
  onExpand: (node: RoadmapNode, path: string[]) => Promise<void>;
  onActivateLesson: (node: RoadmapNode) => void;
};

export default function RoadmapPanel({
  roadmap,
  activeNodeId,
  doneNodeIds,
  onExpand,
  onActivateLesson,
}: RoadmapPanelProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  async function toggle(node: RoadmapNode, path: string[]) {
    setOpenIds((s) => {
      const n = new Set(s);
      if (n.has(node.id)) n.delete(node.id);
      else n.add(node.id);
      return n;
    });
    // Lazily generate children the first time an expandable node is opened.
    if (node.kind !== "point" && node.children === null && !loadingIds.has(node.id)) {
      setLoadingIds((s) => new Set(s).add(node.id));
      try {
        await onExpand(node, path);
      } finally {
        setLoadingIds((s) => {
          const n = new Set(s);
          n.delete(node.id);
          return n;
        });
      }
    }
  }

  function Node({ node, depth, path }: { node: RoadmapNode; depth: number; path: string[] }) {
    const expandable = node.kind !== "point";
    const open = openIds.has(node.id);
    const loading = loadingIds.has(node.id);
    const done = doneNodeIds.includes(node.id);
    const active = activeNodeId === node.id;
    const here = [...path, node.title];

    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(node, here)}
          style={{ paddingLeft: 8 + depth * 16 }}
          className={[
            "group flex w-full items-center gap-2 border-l-2 py-2 pr-3 text-left transition-colors cursor-pointer",
            active ? "border-white bg-white/[0.08]" : done ? "border-emerald-400/60" : "border-transparent hover:bg-white/[0.05]",
          ].join(" ")}
        >
          {/* expand / status glyph */}
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/60" />
          ) : expandable ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/60" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/60" />
            )
          ) : done ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          ) : (
            <Circle className="h-2 w-2 shrink-0 text-white/40" />
          )}

          <span
            className={[
              "min-w-0 flex-1 truncate",
              node.kind === "topic" ? "text-sm font-semibold text-white" : "text-xs text-white/80",
            ].join(" ")}
          >
            {node.title}
          </span>
        </button>

        {open && (
          <div>
            {/* node detail */}
            {(node.summary || node.description) && (
              <p
                style={{ paddingLeft: 8 + (depth + 1) * 16 }}
                className="pb-2 pr-3 text-[11px] leading-relaxed text-white/55"
              >
                {node.description || node.summary}
              </p>
            )}

            {/* leaf point actions */}
            {node.kind === "point" && (
              <div style={{ paddingLeft: 8 + (depth + 1) * 16 }} className="flex items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => onActivateLesson(node)}
                  className="flex cursor-pointer items-center gap-1.5 border border-white/50 bg-white/10 px-2.5 py-1 text-[11px] font-mono text-white transition-colors hover:bg-white/20"
                >
                  <Play className="h-3 w-3" />
                  {done ? "Review lesson" : "Start lesson"}
                </button>
                {/* Completion is EARNED by passing all objectives — never toggled by hand. */}
                {done && (
                  <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300">
                    <Check className="h-3 w-3" />
                    Completed
                  </span>
                )}
              </div>
            )}

            {/* children */}
            {node.children && node.children.length > 0 && (
              <div>
                {node.children.map((c) => (
                  <Node key={c.id} node={c} depth={depth + 1} path={here} />
                ))}
              </div>
            )}
            {node.children && node.children.length === 0 && node.kind !== "point" && !loading && (
              <p style={{ paddingLeft: 8 + (depth + 1) * 16 }} className="pb-2 text-[11px] text-white/40">
                Nothing further to expand.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col border border-white/50 backdrop-blur-md font-sans">
      <div className="border-b border-white/50 px-5 py-3">
        <h2 className="truncate text-sm font-bold text-white">{roadmap ? roadmap.title : "Roadmap"}</h2>
        {roadmap?.summary && <p className="mt-1 text-xs leading-snug text-white/60">{roadmap.summary}</p>}
      </div>

      {!roadmap ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/40">
          Answer the intro questions in the chat and your learning roadmap will appear here.
        </div>
      ) : (
        <ScrollArea className="flex-1 overflow-y-auto py-2">
          {roadmap.topics.map((t) => (
            <Node key={t.id} node={t} depth={0} path={[]} />
          ))}
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      )}
    </div>
  );
}
