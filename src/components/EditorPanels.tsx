"use client";

import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import RoadmapPanel from "@/components/RoadmapPanel";
import { useState } from "react";
import { MessageSquare, Map, Code2 } from "lucide-react";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

// Immutably replace a node's children anywhere in the tree.
function setChildren(roadmap: Roadmap, nodeId: string, children: RoadmapNode[]): Roadmap {
  const walk = (nodes: RoadmapNode[]): RoadmapNode[] =>
    nodes.map((n) =>
      n.id === nodeId
        ? { ...n, children }
        : n.children
        ? { ...n, children: walk(n.children) }
        : n
    );
  return { ...roadmap, topics: walk(roadmap.topics) };
}

export default function EditorPanels({ moduleId }: { moduleId?: string | null }) {
  const [leftView, setLeftView] = useState<"chat" | "roadmap">("chat");
  const [codeOpen, setCodeOpen] = useState(false);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [doneNodeIds, setDoneNodeIds] = useState<string[]>([]);
  const [lessonRequest, setLessonRequest] = useState<{ node: RoadmapNode; nonce: number } | null>(null);
  const [submitRequest, setSubmitRequest] = useState<{ code: string; output: string; nonce: number } | null>(null);
  const [loadCode, setLoadCode] = useState<{ code: string; html?: string; nonce: number } | null>(null);

  function handleSubmitCode(code: string, output: string) {
    setLeftView("chat"); // show the tutor's review
    setSubmitRequest({ code, output, nonce: Date.now() });
  }

  function handleLoadCode(code: string, html?: string) {
    setLoadCode({ code, html, nonce: Date.now() });
    setCodeOpen(true); // reveal the editor with the lesson's starter code
  }

  function handleLessonComplete(pointId: string) {
    setDoneNodeIds((ids) => (ids.includes(pointId) ? ids : [...ids, pointId]));
  }

  function handleRoadmap(r: Roadmap) {
    setRoadmap(r);
    setLeftView("roadmap"); // surface the roadmap when it's created
  }

  // Lazily generate a node's children (L2/L3 snowflake expansion).
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
    setLessonRequest({ node, nonce: Date.now() });
  }

  function handleToggleDone(id: string) {
    setDoneNodeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
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
      {/* Left rail: Chat / Roadmap tabs */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-r border-white/30 px-2 py-4">
        <button className={railBtn(leftView === "chat")} onClick={() => setLeftView("chat")} title="Chat" aria-label="Show chat">
          <MessageSquare className="h-5 w-5" />
        </button>
        <button className={railBtn(leftView === "roadmap")} onClick={() => setLeftView("roadmap")} title="Roadmap" aria-label="Show roadmap">
          <Map className="h-5 w-5" />
        </button>
      </div>

      {/* Panel content area */}
      <div className="flex flex-1 min-h-0 min-w-0 gap-4 p-4">
        <div className={leftView === "chat" ? "flex flex-1 min-w-0" : "hidden"}>
          <ChatPanel
            moduleId={moduleId}
            onRoadmap={handleRoadmap}
            lessonRequest={lessonRequest}
            submitRequest={submitRequest}
            onLoadCode={handleLoadCode}
            onLessonComplete={handleLessonComplete}
          />
        </div>
        <div className={leftView === "roadmap" ? "flex flex-1 min-w-0" : "hidden"}>
          <RoadmapPanel
            roadmap={roadmap}
            activeNodeId={activeNodeId}
            doneNodeIds={doneNodeIds}
            onExpand={handleExpand}
            onActivateLesson={handleActivateLesson}
            onToggleDone={handleToggleDone}
          />
        </div>

        <div className={codeOpen ? "flex flex-1 min-w-0" : "hidden"}>
          <CodeHere onSubmit={handleSubmitCode} loadCode={loadCode} />
        </div>
      </div>

      {/* Right rail: Editor toggle */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-l border-white/30 px-2 py-4">
        <button className={railBtn(codeOpen)} onClick={() => setCodeOpen((v) => !v)} title="Editor" aria-label="Toggle editor">
          <Code2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
