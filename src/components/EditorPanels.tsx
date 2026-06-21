"use client";

import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import RoadmapPanel from "@/components/RoadmapPanel";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Map, Code2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { getModuleMeta } from "@/lib/modules";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";
import type { Objective } from "@/lib/agents/lesson";

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

type BuiltLesson = { intro: string; starterCode: string; html: string; objectives: Objective[] };
type ProgressEntry = { built?: BuiltLesson; passed: string[]; done: boolean };
type Progress = Record<string, ProgressEntry>;
export type BootState = "loading" | "fresh" | "resumed";

// Compact outline of the WHOLE module tree — fed to every generation call so new
// content can dedup against everything that exists and respect progression.
// "◀ CURRENT" marks the node being expanded/taught; "✓done" marks completed points.
function treeOutline(roadmap: Roadmap, markId?: string, progress?: Progress): string {
  const lines: string[] = [];
  const walk = (nodes: RoadmapNode[], depth: number) => {
    for (const n of nodes) {
      const done = progress?.[n.id]?.done ? " ✓done" : "";
      const mark = n.id === markId ? "  ◀ CURRENT" : "";
      lines.push(`${"  ".repeat(depth)}- ${n.title}${done}${mark}`);
      if (n.children) walk(n.children, depth + 1);
    }
  };
  walk(roadmap.topics, 0);
  return lines.join("\n");
}

// Immutably replace a node's children anywhere in the tree.
function setChildren(roadmap: Roadmap, nodeId: string, children: RoadmapNode[]): Roadmap {
  const walk = (nodes: RoadmapNode[]): RoadmapNode[] =>
    nodes.map((n) =>
      n.id === nodeId ? { ...n, children } : n.children ? { ...n, children: walk(n.children) } : n
    );
  return { ...roadmap, topics: walk(roadmap.topics) };
}

export default function EditorPanels({ moduleId }: { moduleId?: string | null }) {
  const skill = getModuleMeta(moduleId)?.title ?? "";

  const [leftView, setLeftView] = useState<"chat" | "roadmap">("chat");
  const [codeOpen, setCodeOpen] = useState(false);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [lessonRequest, setLessonRequest] = useState<{ node: RoadmapNode; outline?: string; nonce: number } | null>(null);
  const [submitRequest, setSubmitRequest] = useState<{ code: string; output: string; nonce: number } | null>(null);
  const [loadCode, setLoadCode] = useState<{ code: string; html?: string; nonce: number } | null>(null);

  // Persistence boot state + loaded values handed to the chat.
  const [userId, setUserId] = useState<string | null>(null);
  const [boot, setBoot] = useState<BootState>("loading");
  const [savedLevel, setSavedLevel] = useState<string | undefined>();
  const [savedGoal, setSavedGoal] = useState<string | undefined>();
  const [initialProgress, setInitialProgress] = useState<Record<string, { built?: BuiltLesson; passed: string[] }> | null>(null);

  const doneNodeIds = Object.keys(progress).filter((id) => progress[id]?.done);

  // Load saved state on mount / module change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBoot("loading");
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid || !skill) {
        setBoot("fresh");
        return;
      }
      try {
        const res = await fetch(`/api/roadmap/state?user_id=${uid}&skill=${encodeURIComponent(skill)}`);
        const json = await res.json();
        const state = json.state as { level?: string; goal?: string; tree?: Roadmap; progress?: Progress } | null;
        if (!cancelled && state?.tree?.topics?.length) {
          const prog = state.progress ?? {};
          setRoadmap(state.tree);
          setProgress(prog);
          setInitialProgress(
            Object.fromEntries(Object.entries(prog).map(([k, v]) => [k, { built: v.built, passed: v.passed ?? [] }]))
          );
          setSavedLevel(state.level);
          setSavedGoal(state.goal);
          setLeftView("roadmap");
          setBoot("resumed");
        } else if (!cancelled) {
          setBoot("fresh");
        }
      } catch {
        if (!cancelled) setBoot("fresh");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, skill]);

  // Debounced save when the tree or progress changes (logged-in only).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !skill || !roadmap) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/roadmap/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, skill, level: roadmap.level, goal: roadmap.goal, tree: roadmap, progress }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [roadmap, progress, userId, skill]);

  function handleRoadmap(r: Roadmap) {
    setRoadmap(r);
    setLeftView("roadmap");
  }

  async function handleExpand(node: RoadmapNode, path: string[]) {
    if (!roadmap || node.children !== null) return;
    try {
      const res = await fetch("/api/roadmap/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: roadmap.skill,
          level: roadmap.level,
          goal: roadmap.goal,
          kind: node.kind,
          title: node.title,
          parentId: node.id,
          path,
          treeOutline: treeOutline(roadmap, node.id, progress),
          moduleId: moduleId ?? undefined,
        }),
      });
      const data = await res.json();
      const children: RoadmapNode[] = Array.isArray(data.children) ? data.children : [];
      setRoadmap((rm) => (rm ? setChildren(rm, node.id, children) : rm));
    } catch {
      setRoadmap((rm) => (rm ? setChildren(rm, node.id, []) : rm));
    }
  }

  function handleActivateLesson(node: RoadmapNode) {
    setActiveNodeId(node.id);
    setLeftView("chat");
    setLessonRequest({
      node,
      outline: roadmap ? treeOutline(roadmap, node.id, progress) : undefined,
      nonce: Date.now(),
    });
  }

  function handleLessonComplete(pointId: string) {
    setProgress((p) => ({ ...p, [pointId]: { ...(p[pointId] ?? { passed: [] }), done: true } }));
  }

  // Merge the chat's per-node lesson cache into progress (preserving earned "done").
  function handleProgressChange(cache: Record<string, { built?: BuiltLesson; passed: string[] }>) {
    setProgress((prev) => {
      const next: Progress = { ...prev };
      for (const [id, v] of Object.entries(cache)) {
        next[id] = { built: v.built, passed: v.passed, done: prev[id]?.done ?? false };
      }
      return next;
    });
  }

  function handleSubmitCode(code: string, output: string) {
    setLeftView("chat");
    setSubmitRequest({ code, output, nonce: Date.now() });
  }

  function handleLoadCode(code: string, html?: string) {
    setLoadCode({ code, html, nonce: Date.now() });
    setCodeOpen(true);
  }

  const railBtn = (active: boolean) =>
    [
      "flex h-10 w-10 items-center justify-center border transition-colors cursor-pointer",
      active
        ? "border-white/70 bg-white/15 text-white"
        : "border-white/40 bg-black text-white/70 hover:bg-neutral-700 hover:text-white",
    ].join(" ");

  return (
    <div className="flex h-full min-h-0">
      <div className="flex shrink-0 flex-col items-center gap-2 border-r border-white/30 px-2 py-4">
        <button className={railBtn(leftView === "chat")} onClick={() => setLeftView("chat")} title="Chat" aria-label="Show chat">
          <MessageSquare className="h-5 w-5" />
        </button>
        <button className={railBtn(leftView === "roadmap")} onClick={() => setLeftView("roadmap")} title="Roadmap" aria-label="Show roadmap">
          <Map className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 gap-4 p-4">
        <div className={leftView === "chat" ? "flex flex-1 min-w-0" : "hidden"}>
          <ChatPanel
            moduleId={moduleId}
            boot={boot}
            hasRoadmap={!!roadmap}
            savedLevel={savedLevel}
            savedGoal={savedGoal}
            initialProgress={initialProgress}
            onRoadmap={handleRoadmap}
            lessonRequest={lessonRequest}
            submitRequest={submitRequest}
            onLoadCode={handleLoadCode}
            onLessonComplete={handleLessonComplete}
            onProgressChange={handleProgressChange}
          />
        </div>
        <div className={leftView === "roadmap" ? "flex flex-1 min-w-0" : "hidden"}>
          <RoadmapPanel
            roadmap={roadmap}
            activeNodeId={activeNodeId}
            doneNodeIds={doneNodeIds}
            onExpand={handleExpand}
            onActivateLesson={handleActivateLesson}
          />
        </div>
        <div className={codeOpen ? "flex flex-1 min-w-0" : "hidden"}>
          <CodeHere moduleId={moduleId} onSubmit={handleSubmitCode} loadCode={loadCode} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2 border-l border-white/30 px-2 py-4">
        <button className={railBtn(codeOpen)} onClick={() => setCodeOpen((v) => !v)} title="Editor" aria-label="Toggle editor">
          <Code2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
