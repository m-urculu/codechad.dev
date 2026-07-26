"use client";

import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import RoadmapPanel from "@/components/RoadmapPanel";
import DocsPanel from "@/components/DocsPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Map, Code2, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseBrowser";
import { getModuleMeta } from "@/lib/modules";
import { getDocSource } from "@/lib/docs";
import { resolveDocUrl } from "@/lib/docs-index";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";
import type { Objective } from "@/lib/agents/lesson";


type BuiltLesson = { intro: string; starterCode: string; html: string; objectives: Objective[] };
type ProgressEntry = { built?: BuiltLesson; passed: string[]; done: boolean; code?: string };
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

// Pre-order flatten of all lesson leaves ("point" nodes) in roadmap order.
function flattenPoints(roadmap: Roadmap | null): RoadmapNode[] {
  const out: RoadmapNode[] = [];
  const walk = (nodes: RoadmapNode[]) => {
    for (const n of nodes) {
      if (n.kind === "point") out.push(n);
      if (n.children) walk(n.children);
    }
  };
  if (roadmap) walk(roadmap.topics);
  return out;
}

// The lesson point immediately after `pointId` in roadmap order, or null if it's
// the last currently-loaded point (a later topic may not be expanded yet).
function nextPointAfter(roadmap: Roadmap | null, pointId: string | null): RoadmapNode | null {
  if (!pointId) return null;
  const points = flattenPoints(roadmap);
  const i = points.findIndex((n) => n.id === pointId);
  return i >= 0 && i + 1 < points.length ? points[i + 1] : null;
}

// The learner's live frontier: the FIRST not-yet-completed lesson in roadmap order
// (optionally ignoring `excludeId`, e.g. the one just being finished). This is where
// auto-advance should land — so completing an OLD/re-taken lesson returns you to your
// newest uncompleted lesson instead of stepping to whatever sequentially follows the
// old one. Falls back to null when every loaded point is done.
function firstUncompletedPoint(
  roadmap: Roadmap | null,
  progress: Progress,
  excludeId?: string | null
): RoadmapNode | null {
  for (const p of flattenPoints(roadmap)) {
    if (p.id === excludeId) continue;
    if (!progress[p.id]?.done) return p;
  }
  return null;
}

// Immutably replace a node's children anywhere in the tree.
function setChildren(roadmap: Roadmap, nodeId: string, children: RoadmapNode[]): Roadmap {
  const walk = (nodes: RoadmapNode[]): RoadmapNode[] =>
    nodes.map((n) =>
      n.id === nodeId ? { ...n, children } : n.children ? { ...n, children: walk(n.children) } : n
    );
  return { ...roadmap, topics: walk(roadmap.topics) };
}

export default function EditorPanels({
  moduleId,
  courseId: initialCourseId,
}: {
  moduleId?: string | null;
  /** Open a specific stored course. When absent, the user's most recent course for
   *  this technology is resumed, or a new one is created on first activity. */
  courseId?: string | null;
}) {
  const skill = getModuleMeta(moduleId)?.title ?? "";

  const [leftView, setLeftView] = useState<"chat" | "roadmap" | "docs">("chat");
  const [codeOpen, setCodeOpen] = useState(false);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [lessonRequest, setLessonRequest] = useState<{ node: RoadmapNode; outline?: string; nonce: number } | null>(null);
  const [submitRequest, setSubmitRequest] = useState<{ code: string; output: string; nonce: number } | null>(null);
  const [codeChange, setCodeChange] = useState<{ code: string; nonce: number } | null>(null);
  const [loadCode, setLoadCode] = useState<{ code: string; html?: string; nonce: number } | null>(null);
  const [docTarget, setDocTarget] = useState<{ url: string; nonce: number } | null>(null);

  // Persistence boot state + loaded values handed to the chat.
  const [userId, setUserId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(initialCourseId ?? null);
  // Mirrors courseId for callbacks that must not close over a stale render.
  const courseIdRef = useRef<string | null>(initialCourseId ?? null);
  const ensureInFlight = useRef<Promise<string | null> | null>(null);
  const [boot, setBoot] = useState<BootState>("loading");
  const [savedLevel, setSavedLevel] = useState<string | undefined>();
  const [savedGoal, setSavedGoal] = useState<string | undefined>();
  const [initialProgress, setInitialProgress] = useState<Record<string, { built?: BuiltLesson; passed: string[]; code?: string }> | null>(null);

  const doneNodeIds = Object.keys(progress).filter((id) => progress[id]?.done);

  // Per-lesson completion ratio in [0,1] for continuous roadmap progress bars: a done
  // lesson is 1, otherwise the fraction of its objectives passed. This is the deepest
  // accounting layer; the roadmap rolls it up through lessons → sub-topics → topics.
  const pointRatio: Record<string, number> = {};
  for (const [id, e] of Object.entries(progress)) {
    const total = e.built?.objectives?.length ?? 0;
    const passed = e.passed?.length ?? 0;
    pointRatio[id] = e.done ? 1 : total > 0 ? Math.min(1, passed / total) : 0;
  }

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
      // No course id means the technology was opened from the landing grid, which
      // always STARTS a new course. Resuming is what the "My courses" cards are for,
      // and they always pass an explicit course id.
      if (!initialCourseId) {
        setBoot("fresh");
        return;
      }
      try {
        const res = await fetch(
          `/api/roadmap/state?user_id=${uid}&course_id=${encodeURIComponent(initialCourseId)}`
        );
        const json = await res.json();
        const state = json.state as
          | { courseId?: string; level?: string; goal?: string; tree?: Roadmap; progress?: Progress }
          | null;
        if (cancelled) return;
        if (state?.courseId) {
          setCourseId(state.courseId);
          courseIdRef.current = state.courseId;
        }
        if (state?.tree?.topics?.length) {
          const prog = state.progress ?? {};
          setRoadmap(state.tree);
          setProgress(prog);
          setInitialProgress(
            Object.fromEntries(Object.entries(prog).map(([k, v]) => [k, { built: v.built, passed: v.passed ?? [], code: v.code }]))
          );
          setSavedLevel(state.level);
          setSavedGoal(state.goal);
          setLeftView("roadmap");
          setBoot("resumed");
        } else {
          // A course row with no tree (generation failed, or freshly recalibrated)
          // still carries the calibration — hand it to the chat so it can retry.
          setSavedLevel(state?.level);
          setSavedGoal(state?.goal);
          setBoot("fresh");
        }
      } catch {
        if (!cancelled) setBoot("fresh");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, skill, initialCourseId]);

  // Create the course row on first real activity (the learner answering calibration),
  // rather than the moment a technology is opened — otherwise merely browsing a module
  // would litter "My courses" with empty entries. Concurrent callers share one request.
  const ensureCourseId = useCallback(async (): Promise<string | null> => {
    if (courseIdRef.current) return courseIdRef.current;
    if (!userId || !skill) return null;
    if (ensureInFlight.current) return ensureInFlight.current;
    ensureInFlight.current = (async () => {
      try {
        const res = await fetch("/api/roadmap/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, skill, module: moduleId, name: skill }),
        });
        const { course_id } = await res.json();
        if (course_id) {
          courseIdRef.current = course_id;
          setCourseId(course_id);
        }
        return course_id ?? null;
      } catch {
        return null;
      } finally {
        ensureInFlight.current = null;
      }
    })();
    return ensureInFlight.current;
  }, [userId, skill, moduleId]);

  // Debounced save when the tree or progress changes (logged-in only).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !skill || !roadmap) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cid = await ensureCourseId();
      if (!cid) return;
      fetch("/api/roadmap/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          course_id: cid,
          skill,
          module: moduleId,
          level: roadmap.level,
          goal: roadmap.goal,
          tree: roadmap,
          progress,
        }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [roadmap, progress, userId, skill, moduleId, ensureCourseId]);

  function handleRoadmap(r: Roadmap) {
    setRoadmap(r);
    setLeftView("roadmap");
    void nameCourseFromContent(r);
  }

  // The course was created before it had any content, so it is still called after
  // the bare technology. Now that there is a curriculum, offer its title as the
  // name — the server applies it only if the learner hasn't named it themselves.
  async function nameCourseFromContent(r: Roadmap) {
    if (!userId || !r.title) return;
    const cid = await ensureCourseId();
    if (!cid) return;
    fetch("/api/course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "autoname",
        user_id: userId,
        course_id: cid,
        name: r.title,
      }),
    }).catch(() => {});
  }

  // Generation failed → persist a course shell (level/goal, no tree) so the course
  // still shows up in "My courses", can be resumed for a retry, and can be deleted.
  async function handleRoadmapFailed(level: string, goal: string) {
    if (!userId || !skill) return;
    const cid = await ensureCourseId();
    if (!cid) return;
    fetch("/api/roadmap/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, course_id: cid, skill, module: moduleId, level, goal }),
    }).catch(() => {});
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
    // Mark done, then advance to the learner's live frontier (the first still-uncompleted
    // lesson), NOT simply the point that sequentially follows the one just finished — so
    // re-completing an old lesson returns you to your newest uncompleted lesson. Falls
    // back to the sequential next point when nothing earlier is left (end of loaded tree).
    const nextProgress: Progress = { ...progress, [pointId]: { ...(progress[pointId] ?? { passed: [], done: false }), done: true } };
    setProgress(nextProgress);
    const next =
      firstUncompletedPoint(roadmap, nextProgress, pointId) ?? nextPointAfter(roadmap, pointId);
    if (next) handleActivateLesson(next);
  }

  // Merge the chat's per-node lesson cache into progress (preserving earned "done").
  function handleProgressChange(cache: Record<string, { built?: BuiltLesson; passed: string[]; code?: string }>) {
    setProgress((prev) => {
      const next: Progress = { ...prev };
      for (const [id, v] of Object.entries(cache)) {
        next[id] = { built: v.built, passed: v.passed, done: prev[id]?.done ?? false, code: v.code };
      }
      return next;
    });
  }

  function handleSubmitCode(code: string, output: string) {
    setLeftView("chat");
    setSubmitRequest({ code, output, nonce: Date.now() });
  }

  // Learner edited the code — forward it to ChatPanel to store against the active lesson.
  function handleCodeChange(code: string) {
    setCodeChange({ code, nonce: Date.now() });
  }

  function handleLoadCode(code: string, html?: string) {
    setLoadCode({ code, html, nonce: Date.now() });
    setCodeOpen(true);
  }

  // A doc link was clicked in the chat. Switch to the Docs tab IMMEDIATELY (so it never
  // feels unresponsive while the index loads), then resolve the term to an exact DevDocs
  // section URL (search fallback) and navigate there. Suppressed for external-doc modules,
  // whose lessons carry no doc links anyway.
  async function handleOpenDoc(term: string) {
    const src = getDocSource(moduleId);
    if (!src || src.kind !== "devdocs") return;
    setLeftView("docs"); // instant tab switch — resolution can take a beat on first click
    const url = await resolveDocUrl(moduleId, term);
    if (url) setDocTarget({ url, nonce: Date.now() });
  }

  const railBtn = (active: boolean) =>
    [
      "flex h-10 w-10 items-center justify-center border transition-colors ",
      active
        ? "border-line-active bg-surface-3 text-ink"
        : "border-line-strong bg-surface-0 text-ink-muted hover:bg-surface-2 hover:text-ink",
    ].join(" ");

  return (
    <div className="flex h-full min-h-0">
      <div className="flex shrink-0 flex-col items-center gap-2 border-r border-line-strong px-2 py-4">
        <button className={railBtn(leftView === "chat")} onClick={() => setLeftView("chat")} title="Chat" aria-label="Show chat">
          <MessageSquare className="h-5 w-5" />
        </button>
        <button className={railBtn(leftView === "roadmap")} onClick={() => setLeftView("roadmap")} title="Roadmap" aria-label="Show roadmap">
          <Map className="h-5 w-5" />
        </button>
        <button className={railBtn(leftView === "docs")} onClick={() => setLeftView("docs")} title="Documentation" aria-label="Show documentation">
          <BookOpen className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 gap-4 p-4">
        <div className={leftView === "chat" ? "flex flex-1 min-w-0" : "hidden"}>
          <ChatPanel
            moduleId={moduleId}
            courseId={courseId}
            ensureCourseId={ensureCourseId}
            visible={leftView === "chat"}
            boot={boot}
            hasRoadmap={!!roadmap}
            savedLevel={savedLevel}
            savedGoal={savedGoal}
            initialProgress={initialProgress}
            onRoadmap={handleRoadmap}
            onRoadmapFailed={handleRoadmapFailed}
            lessonRequest={lessonRequest}
            nextLessonTitle={
              (firstUncompletedPoint(roadmap, progress, activeNodeId) ?? nextPointAfter(roadmap, activeNodeId))?.title ?? null
            }
            submitRequest={submitRequest}
            codeChange={codeChange}
            onLoadCode={handleLoadCode}
            onLessonComplete={handleLessonComplete}
            onProgressChange={handleProgressChange}
            onOpenDoc={handleOpenDoc}
          />
        </div>
        <div className={leftView === "roadmap" ? "flex flex-1 min-w-0" : "hidden"}>
          <RoadmapPanel
            roadmap={roadmap}
            activeNodeId={activeNodeId}
            doneNodeIds={doneNodeIds}
            pointRatio={pointRatio}
            onExpand={handleExpand}
            onActivateLesson={handleActivateLesson}
          />
        </div>
        <div className={leftView === "docs" ? "flex flex-1 min-w-0" : "hidden"}>
          <DocsPanel moduleId={moduleId} docTarget={docTarget} />
        </div>
        <div className={codeOpen ? "flex flex-1 min-w-0" : "hidden"}>
          <CodeHere moduleId={moduleId} onSubmit={handleSubmitCode} onCodeChange={handleCodeChange} loadCode={loadCode} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2 border-l border-line-strong px-2 py-4">
        <button className={railBtn(codeOpen)} onClick={() => setCodeOpen((v) => !v)} title="Editor" aria-label="Toggle editor">
          <Code2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
