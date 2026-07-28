"use client";

import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import RoadmapPanel from "@/components/RoadmapPanel";
import DocsPanel from "@/components/DocsPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Map, Code2, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseBrowser";
import { getModuleMeta } from "@/lib/modules";
import { getPath, getPathByTitle, pathRoadmap } from "@/lib/paths";
import { getDocSource } from "@/lib/docs";
import { resolveDocUrl } from "@/lib/docs-index";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";
import type { Objective } from "@/lib/agents/lesson";
import { apiFetch } from "@/lib/apiFetch";
import { patchCourse } from "@/lib/courseCache";
import { flattenPoints, lessonRatio, overallRatio, topicCounts } from "@/lib/courseProgress";
import { openLogin } from "@/lib/authModal";
import { isTrialUsed, markTrialUsed } from "@/lib/trial";

// How long the finished trial lesson stays unobstructed before the sign-in
// prompt appears. Long enough to read "Lesson complete" and see the objectives
// tick green — the confirmation the learner actually solved it — and short
// enough that the ask still reads as part of finishing.
const COMPLETION_PROMPT_DELAY_MS = 2600;

type BuiltLesson = { intro: string; starterCode: string; html: string; objectives: Objective[] };
// `module` is the runtime the lesson was built for. It rides along in stored
// progress so resuming a path lesson months later reopens the editor in the same
// language rather than in whatever the course started as.
type ProgressEntry = { built?: BuiltLesson; passed: string[]; done: boolean; code?: string; module?: string };
type Progress = Record<string, ProgressEntry>;
export type BootState = "loading" | "fresh" | "resumed";

/** The four things that can occupy the workspace. On mobile, one at a time. */
type Pane = "chat" | "roadmap" | "docs" | "code";

const PANES: { id: Pane; label: string; Icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "roadmap", label: "Roadmap", Icon: Map },
  { id: "docs", label: "Docs", Icon: BookOpen },
  { id: "code", label: "Editor", Icon: Code2 },
];

// Tailwind's md breakpoint. The layout itself is pure CSS; this is only for the
// two decisions JS has to make — see where it is used.
function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

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
  pathId,
}: {
  moduleId?: string | null;
  /** Open a specific stored course. When absent, the user's most recent course for
   *  this technology is resumed, or a new one is created on first activity. */
  courseId?: string | null;
  /** Start a fixed career-path curriculum instead of generating one. */
  pathId?: string | null;
}) {

  const [leftView, setLeftView] = useState<"chat" | "roadmap" | "docs">("chat");
  const [codeOpen, setCodeOpen] = useState(false);
  const isDesktop = useIsDesktop();

  // Bringing a left pane forward has to actually land. On mobile the editor
  // occupies the same slot, so this closes it — otherwise the app switches tab
  // behind a screen that is still showing code, and the learner sees nothing
  // happen. On desktop the two sit side by side on purpose, so nothing closes.
  function showLeft(view: "chat" | "roadmap" | "docs") {
    setLeftView(view);
    if (!isDesktop) setCodeOpen(false);
  }

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);

  // `pathId` is only set when a path is STARTED from the landing page. Resuming one —
  // a reload, or re-opening it from "My courses" — arrives without it, and the
  // workspace would forget the course is a path at all: the cold-start would then
  // fall back to the two-question generated-course flow and offer to build a
  // curriculum over the fixed one. The stored tree carries the path's title as its
  // skill, so recognise it from there.
  const path = getPath(pathId) ?? getPathByTitle(roadmap?.skill);

  // What this course is ABOUT, which for a path is the path rather than the module it
  // happens to open in ("Backend Developer", not "Python") — it is the persisted
  // `skill`, the name on the card, and the subject every expansion prompt is built
  // around. The stored tree wins, so a RESUMED path keeps its identity without the
  // page having to remember which path the course came from.
  const skill = roadmap?.skill || path?.title || getModuleMeta(moduleId)?.title || "";

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [lessonRequest, setLessonRequest] = useState<{ node: RoadmapNode; outline?: string; nonce: number } | null>(null);
  // The runtime the EDITOR is showing. Normally the course's own module; a path
  // whose nodes name their own runtime moves this as the learner walks it, so the
  // editor is Go for the Go lesson and a shell for the Linux one.
  const [activeModule, setActiveModule] = useState<string | null>(moduleId ?? null);
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
  // The lesson the trial prompt interrupted, resumed once they sign in.
  const pendingNext = useRef<RoadmapNode | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (promptTimer.current) clearTimeout(promptTimer.current);
  }, []);

  const doneNodeIds = Object.keys(progress).filter((id) => progress[id]?.done);

  // Per-lesson completion ratio in [0,1] for continuous roadmap progress bars: a done
  // lesson is 1, otherwise the fraction of its objectives passed. This is the deepest
  // accounting layer; the roadmap rolls it up through lessons → sub-topics → topics.
  const pointRatio: Record<string, number> = {};
  for (const [id, e] of Object.entries(progress)) pointRatio[id] = lessonRatio(e);

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
        const res = await apiFetch(`/api/roadmap/state?course_id=${encodeURIComponent(initialCourseId)}`
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
          // Resuming lands in the CHAT, at the bottom — the last thing that
          // happened in this course, which is where the learner left off. The
          // roadmap is an index; opening on it makes someone who was mid-lesson
          // navigate back to their own place before they can continue.
          setLeftView("chat");
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
    // `skill` is deliberately NOT a dependency: it is derived partly from the tree
    // this effect loads, so listing it would send the loader straight back through
    // itself the moment a course resumed — dropping boot to "loading" again and
    // re-booting the conversation with it. The identity that decides what to load is
    // the module, the course and the path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, initialCourseId, pathId]);

  // A career path needs no generation call — its curriculum is data. Build the whole
  // tree the moment the workspace opens, so the learner sees the real length of what
  // they just started instead of a spinner, and every lesson under it is still
  // generated on demand exactly as in any other course.
  useEffect(() => {
    if (!path || boot !== "fresh" || roadmap) return;
    const seeded = pathRoadmap(path);
    setRoadmap(seeded);
    void nameCourseFromContent(seeded);
    // Deliberately NOT switching to the roadmap tab here, unlike a generated course:
    // the chat is mid-question, and answering it is what opens the tab below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, boot, roadmap]);

  // The one thing a path still asks for. Stored on the tree (and so persisted with
  // it) because the level is what every lesson on the path is pitched at.
  function handlePathLevel(level: string) {
    setRoadmap((r) => (r ? { ...r, level } : r));
    showLeft("roadmap");
  }

  // Signing in mid-run has to take effect without a reload. userId is what every
  // save below is gated on, so flipping it here is precisely what turns a trial
  // run into stored work: the debounced save effect fires on the next change and
  // writes the roadmap and progress the visitor built while signed out.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Create the course row on first real activity (the learner answering calibration),
  // rather than the moment a technology is opened — otherwise merely browsing a module
  // would litter "My courses" with empty entries. Concurrent callers share one request.
  const ensureCourseId = useCallback(async (): Promise<string | null> => {
    if (courseIdRef.current) return courseIdRef.current;
    if (!userId || !skill) return null;
    if (ensureInFlight.current) return ensureInFlight.current;
    ensureInFlight.current = (async () => {
      try {
        const res = await apiFetch("/api/roadmap/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill, module: moduleId, name: skill }),
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
      apiFetch("/api/roadmap/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
                    course_id: cid,
          skill,
          module: moduleId,
          level: roadmap.level,
          goal: roadmap.goal,
          tree: roadmap,
          progress,
        }),
      }).catch(() => {});

      // Keep the cached course card in step with what just happened here, so
      // going back to the landing page shows this progress on the first paint
      // instead of the previous figure jumping a moment later. The list request
      // still runs and still wins; this only removes the flicker before it lands.
      // Recomputed here rather than closed over: the render-scope `pointRatio` is
      // a fresh object every render, so listing it as a dependency would restart
      // this timer on every keystroke and the save would never fire.
      const pointOf = (id: string) => lessonRatio(progress[id]);
      const topics = topicCounts(roadmap, pointOf);
      patchCourse(userId, cid, {
        doneCount: Object.values(progress).filter((p) => p?.done).length,
        totalCount: flattenPoints(roadmap).length,
        topicsDone: topics.done,
        topicsTotal: topics.total,
        ratio: overallRatio(roadmap, pointOf),
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [roadmap, progress, userId, skill, moduleId, ensureCourseId]);

  function handleRoadmap(r: Roadmap) {
    setRoadmap(r);
    showLeft("roadmap");
    void nameCourseFromContent(r);
  }

  // The course was created before it had any content, so it is still called after
  // the bare technology. Now that there is a curriculum, offer its title as the
  // name — the server applies it only if the learner hasn't named it themselves.
  async function nameCourseFromContent(r: Roadmap) {
    if (!userId || !r.title) return;
    const cid = await ensureCourseId();
    if (!cid) return;
    apiFetch("/api/course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "autoname",
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
    apiFetch("/api/roadmap/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: cid, skill, module: moduleId, level, goal }),
    }).catch(() => {});
  }

  async function handleExpand(node: RoadmapNode, path: string[]) {
    if (!roadmap || node.children !== null) return;
    try {
      const res = await apiFetch("/api/roadmap/expand", {
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
          nodeModule: node.module,
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
    // Opening a lesson never raises the sign-in prompt. Finishing one is the only
    // moment that earns the ask, and interrupting someone on their way INTO a
    // lesson asks for an account before they have been given anything.
    pendingNext.current = null; // a lesson picked by hand outranks the queued one
    setActiveNodeId(node.id);
    setActiveModule(node.module ?? moduleId ?? null);
    showLeft("chat");
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

    // End of the free trial. This is the first moment the visitor has finished
    // something, and all of it — roadmap, code, conversation — lives in this tab
    // and nowhere else. Ask now, while there is something worth keeping.
    //
    // But not instantly. The objectives tick green and the tutor posts "Lesson
    // complete" in the same commit as this call, so opening the modal here drops
    // a login form over the only confirmation the learner gets that they solved
    // it. They should read the win first; the ask lands better after it anyway.
    if (!userId) {
      // Nothing stops a signed-out visitor finishing more lessons, so the prompt
      // can recur. Say something different the second time rather than repeating
      // a greeting that has stopped being true.
      const first = !isTrialUsed();
      markTrialUsed();
      pendingNext.current = next ?? null;
      promptTimer.current = setTimeout(() => {
        openLogin(
          first
            ? "Nice — first lesson done. Sign in to save your progress and keep going. It's free."
            : "Another one done. None of this is saved yet — sign in and it's kept, including everything so far."
        );
      }, COMPLETION_PROMPT_DELAY_MS);
      return;
    }

    if (next) handleActivateLesson(next);
  }

  // Signing in from that prompt picks up exactly where it stopped, so the ask
  // costs the learner nothing but the sign-in itself.
  useEffect(() => {
    const node = pendingNext.current;
    if (!userId || !node) return;
    pendingNext.current = null;
    handleActivateLesson(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Merge the chat's per-node lesson cache into progress (preserving earned "done").
  function handleProgressChange(
    cache: Record<string, { built?: BuiltLesson; passed: string[]; code?: string; module?: string }>
  ) {
    setProgress((prev) => {
      const next: Progress = { ...prev };
      for (const [id, v] of Object.entries(cache)) {
        next[id] = { built: v.built, passed: v.passed, done: prev[id]?.done ?? false, code: v.code, module: v.module };
      }
      return next;
    });
  }

  function handleSubmitCode(code: string, output: string) {
    showLeft("chat");
    setSubmitRequest({ code, output, nonce: Date.now() });
  }

  // Learner edited the code — forward it to ChatPanel to store against the active lesson.
  function handleCodeChange(code: string) {
    setCodeChange({ code, nonce: Date.now() });
  }

  function handleLoadCode(code: string, html?: string) {
    setLoadCode({ code, html, nonce: Date.now() });
    // Desktop shows the editor beside the chat, so revealing it costs nothing.
    // On mobile it would replace the lesson brief the tutor has just posted with
    // a wall of starter code, before the learner has read what to do with it.
    // The code is loaded either way; they open the Editor tab when ready.
    if (isDesktop) setCodeOpen(true);
  }

  // A doc link was clicked in the chat. Switch to the Docs tab IMMEDIATELY (so it never
  // feels unresponsive while the index loads), then resolve the term to an exact DevDocs
  // section URL (search fallback) and navigate there. Suppressed for external-doc modules,
  // whose lessons carry no doc links anyway.
  async function handleOpenDoc(term: string) {
    // The LESSON's runtime, not the course's. On a path they differ, and resolving a Go
    // term against Python's index is how a link ends up pointing at nothing — or, worse,
    // at a same-named Python entry. This is the module the Docs pane is already showing.
    const src = getDocSource(activeModule);
    // No embeddable docs for this runtime: still open the pane, which offers the
    // official site. Returning silently made the click look broken.
    showLeft("docs");
    if (!src || src.kind !== "devdocs") return;
    const url = await resolveDocUrl(activeModule, term);
    if (url) setDocTarget({ url, nonce: Date.now() });
  }

  const railBtn = (active: boolean) =>
    [
      "flex h-10 w-10 items-center justify-center border transition-colors ",
      active
        ? "border-line-active bg-surface-3 text-ink"
        : "border-line-strong bg-surface-0 text-ink-muted hover:bg-surface-2 hover:text-ink",
    ].join(" ");

  // On a phone there is room for exactly one pane, so the editor stops being an
  // independent toggle and becomes a fourth peer of chat/roadmap/docs. codeOpen
  // doubles as "the editor is the selected tab", which is why the mobile buttons
  // clear it and the desktop rails — where the editor sits BESIDE a left pane on
  // purpose — still do not.
  const mobilePane: Pane = codeOpen ? "code" : leftView;

  function selectPane(pane: Pane) {
    if (pane === "code") {
      setCodeOpen(true);
      return;
    }
    setLeftView(pane);
    setCodeOpen(false);
  }

  // Mobile shows the selected tab only; desktop keeps the existing rules, where
  // a left pane and the editor are deliberately on screen together.
  const paneClass = (pane: Pane) =>
    [
      mobilePane === pane ? "flex" : "hidden",
      (pane === "code" ? codeOpen : leftView === pane) ? "md:flex" : "md:hidden",
      "flex-1 min-w-0",
    ].join(" ");

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Mobile: one tab bar for all four panes. Two vertical rails would eat a
          third of a phone's width between them, and the editor being a separate
          toggle is what let chat and code share a screen too narrow for both. */}
      <nav className="flex shrink-0 border-b border-line-strong md:hidden">
        {PANES.map(({ id, label, Icon }) => {
          const active = mobilePane === id;
          return (
            <button
              key={id}
              onClick={() => selectPane(id)}
              aria-label={`Show ${label.toLowerCase()}`}
              aria-current={active ? "true" : undefined}
              className={[
                "flex flex-1 flex-col items-center gap-1 border-b-2 py-2 text-micro font-medium uppercase",
                "tracking-wider transition-colors",
                active
                  ? "border-accent bg-surface-1 text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-line-strong px-2 py-4 md:flex">
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

      <div className="flex flex-1 min-h-0 min-w-0 gap-4 p-3 md:p-4">
        <div data-pane="chat" className={paneClass("chat")}>
          <ChatPanel
            moduleId={moduleId}
            courseId={courseId}
            ensureCourseId={ensureCourseId}
            skill={skill}
            pathTitle={path?.title ?? null}
            pathGoal={path?.goal ?? null}
            onPathLevel={handlePathLevel}
            visible={isDesktop ? leftView === "chat" : mobilePane === "chat"}
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
        <div data-pane="roadmap" className={paneClass("roadmap")}>
          <RoadmapPanel
            roadmap={roadmap}
            activeNodeId={activeNodeId}
            doneNodeIds={doneNodeIds}
            pointRatio={pointRatio}
            onExpand={handleExpand}
            onActivateLesson={handleActivateLesson}
          />
        </div>
        <div data-pane="docs" className={paneClass("docs")}>
          <DocsPanel moduleId={activeModule} docTarget={docTarget} />
        </div>
        <div data-pane="code" className={paneClass("code")}>
          <CodeHere moduleId={activeModule} onSubmit={handleSubmitCode} onCodeChange={handleCodeChange} loadCode={loadCode} />
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-center gap-2 border-l border-line-strong px-2 py-4 md:flex">
        <button className={railBtn(codeOpen)} onClick={() => setCodeOpen((v) => !v)} title="Editor" aria-label="Toggle editor">
          <Code2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
