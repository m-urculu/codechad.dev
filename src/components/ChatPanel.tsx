"use client";

// React and hooks
import { useRef, useState, useEffect, KeyboardEvent, FormEvent, memo } from "react";

// Markdown and syntax highlighting
import { marked } from "marked";
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml'; // html is registered as xml in highlight.js
import 'highlight.js/styles/atom-one-dark.css';
// import TextType from "@/components/Text/TextType";

// Register highlight.js languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('html', xml);

// Local UI components
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { createClient } from '@supabase/supabase-js';
import { LEVELS, getModuleMeta } from "@/lib/modules";
import { getRuntime } from "@/lib/runtimes/registry";
import { gradeSubmission } from "@/lib/agents/grade";
import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";
import type { Objective } from "@/lib/agents/lesson";
import { Check, Circle, RotateCcw } from "lucide-react";

marked.setOptions({ breaks: false });

// Rewrite the assistant's inline documentation links — authored as [text](doc:Term) and
// rendered by marked to <a href="doc:Term">…</a> — into inert, styled doc-links. The href
// is dropped (so a stray click never navigates the page) and the term is carried on
// data-doc-term; the chat bubble's click handler resolves it and opens the Docs tab.
function linkifyDocAnchors(html: string): string {
  return html.replace(
    /<a\s+href="doc:([^"]*)"([^>]*)>/gi,
    (_m, term: string, rest: string) =>
      `<a data-doc-term="${term}" class="doc-link" role="link" tabindex="0"${rest}>`
  );
}

type Message = {
  id: number;
  text: string;
  role: 'user' | 'bot';
};


type ChatPanelProps = {
  moduleId?: string | null;
  onRoadmap?: (roadmap: Roadmap) => void;
  lessonRequest?: { node: RoadmapNode; outline?: string; nonce: number } | null;
  nextLessonTitle?: string | null;
  submitRequest?: { code: string; output: string; nonce: number } | null;
  codeChange?: { code: string; nonce: number } | null;
  onLoadCode?: (code: string, html?: string) => void;
  onLessonComplete?: (pointId: string) => void;
  onOpenDoc?: (term: string) => void;
  boot?: "loading" | "fresh" | "resumed";
  hasRoadmap?: boolean;
  savedLevel?: string;
  savedGoal?: string;
  initialProgress?: Record<string, { built?: BuiltLesson; passed: string[]; code?: string }> | null;
  onProgressChange?: (cache: Record<string, { built: BuiltLesson; passed: string[]; code?: string }>) => void;
};

// Cold-start calibration: Level -> Goal -> generate first lesson.
type CalibStep = "level" | "goal" | "done";
type Calib = { step: CalibStep; level?: string; goal?: string };

// Active lesson with its fixed objectives + which are satisfied (the progress meter).
type ActiveLesson = { pointId: string; title: string; objectives: Objective[]; passed: string[] };
type BuiltLesson = { intro: string; starterCode: string; html: string; objectives: Objective[]; solution?: string };

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export default function ChatPanel({
  moduleId,
  onRoadmap,
  lessonRequest,
  nextLessonTitle,
  submitRequest,
  codeChange,
  onLoadCode,
  onLessonComplete,
  onOpenDoc,
  boot = "fresh",
  hasRoadmap = false,
  savedLevel,
  savedGoal,
  initialProgress,
  onProgressChange,
}: ChatPanelProps) {
  const meta = getModuleMeta(moduleId);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      text: "What job you're looking to land or what skills do you want to learn?",
      role: 'bot',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [calib, setCalib] = useState<Calib>({ step: "done" });
  const [lesson, setLesson] = useState<ActiveLesson | null>(null);
  const lessonRef = useRef<ActiveLesson | null>(null);
  useEffect(() => {
    lessonRef.current = lesson;
  }, [lesson]);
  // Per-node lesson cache: keeps each point's built lesson + objective progress so
  // switching between points retains progress (and skips re-generation). In-memory for
  // now; Supabase persistence layers on top once the project is reachable.
  const lessonCache = useRef<Record<string, { built: BuiltLesson; passed: string[]; code?: string }>>({});

  // Seed the cache from saved (Supabase) progress so resumed lessons restore — including
  // the learner's edited code, not just the objectives.
  useEffect(() => {
    if (!initialProgress) return;
    const seeded: Record<string, { built: BuiltLesson; passed: string[]; code?: string }> = {};
    for (const [id, v] of Object.entries(initialProgress)) {
      if (v.built) seeded[id] = { built: v.built, passed: v.passed ?? [], code: v.code };
    }
    lessonCache.current = { ...lessonCache.current, ...seeded };
  }, [initialProgress]);
  const GEMINI_MAX_CHARS = 8192;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Get user id from Supabase, and load chat history only when NOT doing a
    // module cold-start (calibration owns the conversation in that case).
    const getUserAndHistory = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid && !moduleId) {
        try {
          const res = await fetch("/api/functions/chat/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: uid, limit: 50 })
          });
          const result = await res.json();
          if (Array.isArray(result.messages) && result.messages.length > 0) {
            setMessages(
              result.messages.map((msg: { content: string; role: string }, idx: number) => ({
                id: idx + 1,
                text: msg.content,
                role: msg.role === "assistant" ? "bot" : "user"
              }))
            );
          }
        } catch {
          // Optionally handle error
        }
      }
    };
    getUserAndHistory();
  }, [moduleId]);

  // Boot the conversation: restore the saved chat (logged-in) or start fresh.
  const chatBootKey = useRef<string | null>(null);
  const chatRestored = useRef(false);
  useEffect(() => {
    if (!meta || boot === "loading") return;
    const key = `${moduleId}|${userId ?? "anon"}`;
    if (chatBootKey.current === key) return;
    chatBootKey.current = key;
    (async () => {
      // 1) Saved conversation? Restore it verbatim (messages + calibration).
      if (userId) {
        try {
          const res = await fetch(`/api/chat/state?user_id=${userId}&module=${encodeURIComponent(moduleId ?? "")}`);
          const { state } = await res.json();
          if (state?.messages?.length) {
            setMessages(
              state.messages.map((m: { role: string; text: string }, i: number) => ({
                id: i + 1,
                role: m.role === "user" ? "user" : "bot",
                text: m.text,
              }))
            );
            setCalib({
              step: (state.calib?.step as CalibStep) ?? "done",
              level: state.calib?.level ?? savedLevel,
              goal: state.calib?.goal ?? savedGoal,
            });
            chatRestored.current = true;
            return;
          }
        } catch {
          /* fall through to fresh */
        }
      }
      // 2) Roadmap resumed but no saved chat -> welcome back.
      if (boot === "resumed") {
        setCalib({ step: "done", level: savedLevel, goal: savedGoal });
        setMessages([
          {
            id: 0,
            role: "bot",
            text: `Welcome back to **${meta.title}**. Your roadmap and progress are restored — open the Roadmap tab to pick up where you left off, or ask me anything.`,
          },
        ]);
        return;
      }
      // 3) Fresh start -> 2-tap cold-start.
      setCalib({ step: "level" });
      setMessages([
        {
          id: 0,
          role: "bot",
          text: `Let's learn **${meta.title}**. To tailor it to you — how would you describe your level?`,
        },
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, boot, userId]);

  // Persist the conversation (debounced) whenever it changes — logged-in only.
  const chatSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !moduleId || messages.length === 0) return;
    // Don't save the initial single greeting unless the user has engaged or we restored.
    if (!chatRestored.current && messages.length < 2) return;
    if (chatSaveTimer.current) clearTimeout(chatSaveTimer.current);
    chatSaveTimer.current = setTimeout(() => {
      fetch("/api/chat/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          module: moduleId,
          messages: messages.map((m) => ({ role: m.role, text: m.text })),
          calib: { step: calib.step, level: calib.level, goal: calib.goal },
        }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (chatSaveTimer.current) clearTimeout(chatSaveTimer.current);
    };
  }, [messages, calib, userId, moduleId]);

  // Run the agent pipeline (chat manager) and return its reply + optional roadmap.
  async function callAgent(
    message: string,
    ctx?: { level?: string; goal?: string }
  ): Promise<{ response: string; roadmap?: Roadmap }> {
    const history = messages
      .slice(-10)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          topic: meta?.title,
          level: ctx?.level ?? calib.level,
          goal: ctx?.goal ?? calib.goal,
          moduleId: moduleId ?? undefined,
          hasRoadmap,
          activeLesson: lessonRef.current?.title,
          history,
          user_id: userId,
        }),
      });
      const data = await res.json();
      if (data.error) return { response: data.error + (data.details ? `\n${data.details}` : "") };
      return { response: data.response || "(No response)", roadmap: data.roadmap };
    } catch {
      return { response: "Error contacting the tutor. Please try again." };
    }
  }

  function pushMessage(role: 'user' | 'bot', text: string) {
    setMessages((msgs) => [...msgs, { id: Date.now() + Math.floor(Math.random() * 1000), text, role }]);
  }

  // Delegated click for inline doc-links inside a bot bubble: resolve the term to a doc
  // section and open the Docs tab (handled upstream). preventDefault so nothing navigates.
  function handleDocClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest?.("[data-doc-term]");
    if (!el) return;
    e.preventDefault();
    let term = el.getAttribute("data-doc-term") || "";
    try {
      if (term.includes("%")) term = decodeURIComponent(term);
    } catch {
      /* keep raw term */
    }
    if (term) onOpenDoc?.(term);
  }

  // Background solution validation: run the cached reference solution in its real
  // runtime off-screen; if it errors, regenerate it to fit the (unchanged) lesson via
  // /api/lesson/fix-solution and re-validate. Silent — never touches the UI. Capped.
  const validatedPoints = useRef<Set<string>>(new Set());
  async function validateSolutionInBackground(pointId: string) {
    if (validatedPoints.current.has(pointId)) return;
    const cached = lessonCache.current[pointId];
    const built = cached?.built;
    if (!built?.solution) return;
    validatedPoints.current.add(pointId);
    const spec = getRuntime(moduleId);
    let solution = built.solution;
    for (let attempt = 0; attempt < 2; attempt++) {
      let err: string | null = null;
      try {
        const { findRuntimeErrors } = await import("@/lib/runtimes/validate");
        const probe = await findRuntimeErrors(spec, solution, built.html);
        err = probe.error;
        // Not just "no crash" — the reference solution must also pass every objective's
        // deterministic check. If it doesn't, the check/solution are inconsistent; feed
        // that as the failure so regeneration fixes it.
        if (!err) {
          const g = gradeSubmission(built.objectives, solution, probe.output);
          if (g.gradable && !g.allPassed) {
            err = "The reference solution does not satisfy the objective checks: " +
              g.results.filter((r) => !r.passed).map((r) => r.detail).join("; ");
          }
        }
      } catch {
        return; // validator itself failed — leave the solution as-is
      }
      if (!err) break; // runs clean AND passes its checks
      try {
        const res = await fetch("/api/lesson/fix-solution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectives: built.objectives,
            starterCode: built.starterCode,
            html: built.html,
            solution,
            error: err,
            language: spec.langName,
          }),
        });
        const data = await res.json();
        if (!data.solution) break;
        solution = data.solution as string;
      } catch {
        break;
      }
    }
    // Persist the (possibly corrected) solution back into the cache + progress.
    if (lessonCache.current[pointId]) {
      lessonCache.current[pointId].built.solution = solution;
      onProgressChange?.(lessonCache.current);
    }
  }

  // Re-take the current lesson: clear passed objectives and reload the starter code.
  // Uses the cached built lesson — no rebuild / LLM call.
  function restartLesson() {
    if (!lesson) return;
    const cached = lessonCache.current[lesson.pointId];
    setLesson({ ...lesson, passed: [] });
    if (cached) {
      cached.passed = [];
      cached.code = undefined; // re-take starts from the scaffold again
      onProgressChange?.(lessonCache.current);
      onLoadCode?.(cached.built.starterCode, cached.built.html);
    }
    pushMessage("bot", `Restarting **${lesson.title}** — starter code reloaded. Here's the rundown again:`);
    // Re-explain the topic + task (the cached lesson intro) so the learner has the
    // technical context on a restart, just like on first start. No rebuild/LLM call.
    if (cached?.built.intro) pushMessage("bot", cached.built.intro);
  }

  async function generateFirstLesson(level: string, goal: string) {
    if (!meta) return;
    setLoading(true);
    try {
      // L1: grounded overview (snowflake). The tree is generated on demand from here.
      const res = await fetch("/api/roadmap/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: meta.title, level, goal, moduleId: moduleId ?? undefined }),
      });
      const data = await res.json();
      if (data.roadmap) {
        onRoadmap?.(data.roadmap);
        pushMessage(
          "bot",
          `Your **${meta.title}** roadmap is ready in the Roadmap tab → expand a topic to reveal its sub-topics and learning points, then hit **Start lesson** on any point and we'll dive in here.`
        );
      } else {
        pushMessage("bot", data.error || "I couldn't build the roadmap just now — try again in a moment.");
      }
    } catch {
      pushMessage("bot", "I couldn't reach the roadmap service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Record an answer for the current calibration step (from a chip tap OR typed text).
  async function answerCalibration(value: string) {
    const v = value.trim();
    if (!v || loading) return;
    pushMessage('user', v);
    if (calib.step === "level") {
      setCalib((c) => ({ ...c, step: "goal", level: v }));
      pushMessage('bot', `Got it — *${v}*. And what's your goal with ${meta?.title ?? "it"}?`);
    } else if (calib.step === "goal") {
      const level = calib.level ?? "Some experience";
      setCalib((c) => ({ ...c, step: "done", goal: v }));
      await generateFirstLesson(level, v);
    }
  }

  async function handleSend(e?: FormEvent | KeyboardEvent) {
    e?.preventDefault();
    if (input.trim() === "" || loading) return;
    const text = input;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // During cold-start, a typed message answers the current calibration step.
    if (calib.step !== "done") {
      answerCalibration(text);
      return;
    }

    pushMessage('user', text);
    setLoading(true);
    try {
      const { response, roadmap } = await callAgent(text);
      if (roadmap) onRoadmap?.(roadmap); // send to the side-tab (no text dump)
      pushMessage('bot', response);
    } finally {
      setLoading(false);
    }
  }

  // When a roadmap node's "Start lesson" is clicked, generate that node's lesson.
  const handledLessonNonce = useRef(0);
  useEffect(() => {
    if (!lessonRequest || lessonRequest.nonce === handledLessonNonce.current) return;
    handledLessonNonce.current = lessonRequest.nonce;
    const node = lessonRequest.node;
    (async () => {
      if (loading) return;
      // Resume a previously-opened lesson: restore its objectives + progress, no rebuild.
      const cached = lessonCache.current[node.id];
      if (cached) {
        setLesson({ pointId: node.id, title: node.title, objectives: cached.built.objectives, passed: cached.passed });
        // Restore the learner's edited code if we have it, else the starter scaffold.
        const hasCode = !!cached.code;
        onLoadCode?.(cached.code ?? cached.built.starterCode, cached.built.html);
        pushMessage(
          "bot",
          `Resuming **${node.title}** — ${cached.passed.length}/${cached.built.objectives.length} objectives done so far.`
        );
        // Verify the reference solution once per session (covers lessons restored from
        // the DB that were never validated in a browser).
        void validateSolutionInBackground(node.id);
        // Re-explain the lesson IN THE CONTEXT of their progress: recap the topic and
        // point them at the next unmet objective (LLM call, informed by passed/remaining).
        (async () => {
          try {
            setLoading(true);
            const passedSet = new Set(cached.passed);
            const res = await fetch("/api/lesson/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pointTitle: node.title,
                language: getRuntime(moduleId).langName,
                moduleId: moduleId ?? undefined,
                intro: cached.built.intro,
                hasCode,
                objectives: cached.built.objectives.map((o) => ({
                  description: o.description,
                  passed: passedSet.has(o.id),
                })),
              }),
            });
            const data = await res.json();
            if (data.message) pushMessage("bot", data.message);
          } catch {
            /* recap is best-effort — the quick "Resuming…" line already landed */
          } finally {
            setLoading(false);
          }
        })();
        return;
      }
      setLoading(true);
      try {
        // L4: grounded lesson — intro + starter code + FIXED objectives.
        const res = await fetch("/api/lesson/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skill: meta?.title || node.title,
            level: calib.level,
            goal: calib.goal,
            moduleId: moduleId ?? undefined,
            pointTitle: node.title,
            pointSummary: node.summary || node.description,
            treeOutline: lessonRequest.outline,
          }),
        });
        const data = await res.json();
        if (data.lesson) {
          const l = data.lesson as { intro: string; starterCode: string; html?: string; objectives: Objective[]; solution?: string };
          lessonCache.current[node.id] = {
            built: { intro: l.intro, starterCode: l.starterCode, html: l.html || "", objectives: l.objectives, solution: l.solution },
            passed: [],
          };
          onProgressChange?.(lessonCache.current);
          setLesson({ pointId: node.id, title: node.title, objectives: l.objectives, passed: [] });
          onLoadCode?.(l.starterCode, l.html);
          pushMessage("bot", l.intro || `Let's work on ${node.title}.`);
          // Background: verify the reference solution runs in the real runtime; if it
          // errors, regenerate it to fit the lesson (no UI disruption).
          void validateSolutionInBackground(node.id);
        } else {
          pushMessage("bot", data.error || "I couldn't build that lesson — try again.");
        }
      } catch {
        pushMessage("bot", "I couldn't reach the lesson service. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonRequest]);

  // Persist the learner's edited code into the active lesson's cache (debounced upstream
  // in CodeHere) so resuming restores their work, not just the objectives.
  const handledCodeNonce = useRef(0);
  useEffect(() => {
    if (!codeChange || codeChange.nonce === handledCodeNonce.current) return;
    handledCodeNonce.current = codeChange.nonce;
    const active = lessonRef.current;
    if (!active) return;
    const rec = lessonCache.current[active.pointId];
    if (!rec) return;
    rec.code = codeChange.code;
    onProgressChange?.(lessonCache.current); // flows to progress → Supabase (debounced there)
  }, [codeChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the learner hits "Submit" in the editor, send the code + console output
  // to the tutor for review.
  const handledSubmitNonce = useRef(0);
  useEffect(() => {
    if (!submitRequest || submitRequest.nonce === handledSubmitNonce.current) return;
    handledSubmitNonce.current = submitRequest.nonce;
    const { code, output } = submitRequest;
    (async () => {
      if (loading) return;
      setLoading(true);
      try {
        const active = lessonRef.current;
        if (active) {
          // 1) DETERMINISTIC grading (authoritative). The LLM never decides pass/fail.
          const grade = gradeSubmission(active.objectives, code, output);
          let passed: string[];
          if (grade.gradable) {
            passed = Array.from(new Set([...active.passed, ...grade.results.filter((r) => r.passed).map((r) => r.id)]));
          } else {
            // Legacy lesson with no machine checks → fall back to the LLM grader.
            const res = await fetch("/api/lesson/evaluate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pointTitle: active.title,
                objectives: active.objectives,
                code,
                output,
                alreadyPassed: active.passed,
                language: getRuntime(moduleId).langName,
              }),
            });
            const data = await res.json();
            const results: { id: string; passed: boolean }[] = Array.isArray(data.results) ? data.results : [];
            passed = Array.from(new Set([...active.passed, ...results.filter((r) => r.passed).map((r) => r.id)]));
            if (data.message) pushMessage("bot", data.message);
          }

          setLesson({ ...active, passed });
          if (lessonCache.current[active.pointId]) {
            lessonCache.current[active.pointId].passed = passed; // retain progress
            lessonCache.current[active.pointId].code = code;     // checkpoint the submitted code
          }
          onProgressChange?.(lessonCache.current);

          const allDone = active.objectives.every((o) => passed.includes(o.id));
          if (allDone) {
            // All objectives met → hard-coded completion + auto-advance. No LLM call.
            pushMessage("bot", `**Lesson complete** — all objectives met for "${active.title}".`);
            if (nextLessonTitle) {
              pushMessage("bot", `Nice work — moving you to the next lesson: **${nextLessonTitle}** →`);
            } else {
              pushMessage("bot", `That wraps up the loaded roadmap — great job! Open the next point from the roadmap whenever you're ready.`);
            }
            onLessonComplete?.(active.pointId);
          } else if (grade.gradable) {
            // 2) GUIDANCE (the LLM's real job): only when something failed, fed the
            // deterministic results so it teaches the actual gap instead of re-judging.
            try {
              const gres = await fetch("/api/lesson/guide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pointTitle: active.title,
                  language: getRuntime(moduleId).langName,
                  moduleId: moduleId ?? undefined,
                  code,
                  output,
                  results: active.objectives.map((o) => {
                    const r = grade.results.find((x) => x.id === o.id);
                    return { id: o.id, description: o.description, passed: !!r?.passed, detail: r?.detail };
                  }),
                }),
              });
              const gdata = await gres.json();
              if (gdata.message) pushMessage("bot", gdata.message);
            } catch {
              /* guidance is best-effort */
            }
          }
        } else {
          // No active lesson: silent generic continuation.
          const modelMsg =
            `[silent submission context — do not thank or announce]\n` +
            `THEIR CODE:\n${code}\n\nCONSOLE OUTPUT:\n${output.trim() || "(no output)"}\n\n` +
            `Assess and continue teaching concisely.`;
          const { response } = await callAgent(modelMsg);
          pushMessage("bot", response);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitRequest]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }

  // Memoized message bubble for performance
  const MessageBubble = memo(function MessageBubble({ msg }: { msg: Message }) {
    if (msg.role === 'user') {
      return (
        <div className={`flex my-4 justify-end`}>
          <div className="bg-black/70 px-4 py-2 text-sm border border-white/50 max-w-[100%] sm:max-w-[60%] font-mono font-normal leading-normal text-white text-right">
            {msg.text}
          </div>
        </div>
      );
    }
    // Memoize marked and highlight.js output for bot messages
    const parts = msg.text.split(/(```[\s\S]*?```)/g);
    const rendered = parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Extract language and code
        const codeBlock = part.slice(3, -3);
        const firstLineBreak = codeBlock.indexOf('\n');
        let lang = '';
        let code = codeBlock;
        if (firstLineBreak !== -1) {
          lang = codeBlock.slice(0, firstLineBreak).trim();
          code = codeBlock.slice(firstLineBreak + 1);
        }
        let highlighted;
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(code).value;
        }
        return (
          <pre
            key={i}
            className="theme-atom-one-dark shadow-3xl text-sm relative max-w-full order-1 lg:order-2 my-50"
            style={{ padding: 0, margin: 0 }}
          >
            <span className="hljs my-5 p-4 block min-h-full">
              <code className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: highlighted }} />
            </span>
            <small className="bg-black/30 absolute top-0 right-0 uppercase font-bold text-xs px-2 py-1">
              <span className="sr-only">Language:</span>{lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Code'}
            </small>
          </pre>
        );
      } else {
        // Use marked to render all Gemini Markdown as intended, then turn the assistant's
        // inline [text](doc:Term) references into clickable doc-links (handled by the
        // bubble's click delegation — the href is stripped so nothing navigates away).
        const html = linkifyDocAnchors(marked.parse(part.trim(), { async: false }) as string);
        return (
          <div className="flex flex-col gap-5" key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      }
    });
    return (
      <div className={`flex my-4 justify-start`}>
        <div
          className="bg-black/70 px-4 py-2 text-sm border border-white/50 max-w-[100%] sm:max-w-[60%] font-mono font-normal leading-normal text-neutral-200 text-left"
          onClick={handleDocClick}
        >
          <span>{rendered}</span>
        </div>
      </div>
    );
  });

  return (
    <div className="flex flex-col h-full w-full min-w-0 border border-white/50 backdrop-blur-md font-sans overflow-x-auto">
          {lesson && (
            <div className="border-b border-white/40 px-4 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-white">{lesson.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-white/60">
                  {lesson.passed.length}/{lesson.objectives.length} objectives
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden bg-white/10">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${(lesson.passed.length / Math.max(1, lesson.objectives.length)) * 100}%` }}
                />
              </div>
              <ul className="mt-2 space-y-1">
                {lesson.objectives.map((o) => {
                  const done = lesson.passed.includes(o.id);
                  return (
                    <li key={o.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                      {done ? (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-white/40" />
                      )}
                      <span className={done ? "text-white/45 line-through" : "text-white/80"}>{o.description}</span>
                    </li>
                  );
                })}
              </ul>
              {lesson.objectives.length > 0 && lesson.objectives.every((o) => lesson.passed.includes(o.id)) && (
                <button
                  type="button"
                  onClick={restartLesson}
                  title="Reset progress and reload the starter code"
                  className="mt-2.5 inline-flex items-center gap-1.5 border border-white/40 bg-black/70 px-2.5 py-1 text-[11px] font-mono
                             text-white/80 leading-none transition-colors hover:bg-neutral-700 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-take lesson
                </button>
              )}
            </div>
          )}
          <ScrollArea className="flex-1 overflow-y-auto overflow-hidden px-6 space-y-2 font-mono font-normal leading-normal">
            {/* highlight.js theme handles code styling */}
            <div className="space-y-5">
              {messages.length === 0 ? (
                <div className="text-neutral-500 text-center mt-8 font-mono font-normal leading-normal">No messages yet. Start the conversation below!
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))
              )}
              {calib.step !== "done" && !loading && (
                <div className="flex justify-start">
                  <div className="flex max-w-[100%] flex-wrap gap-2 sm:max-w-[60%]">
                    {(calib.step === "level" ? [...LEVELS] : (meta?.goals ?? [])).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={loading}
                        onClick={() => answerCalibration(opt)}
                        className="cursor-pointer border border-white/50 bg-black/70 px-3 py-1.5 text-xs font-mono text-white
                                   leading-none transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {opt}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => textareaRef.current?.focus()}
                      className="cursor-pointer border border-dashed border-white/40 bg-transparent px-3 py-1.5 text-xs font-mono text-neutral-300
                                 leading-none transition-colors hover:border-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Type my own…
                    </button>
                  </div>
                </div>
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 px-4 py-2 text-sm border border-white/50 max-w-[80%] font-mono font-normal leading-normal text-white-200 text-left opacity-70 gemini-glow">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <form
            className="flex items-center gap-2 p-4 border-t border-white/50"
            onSubmit={handleSend}
          >
            <Textarea
              ref={textareaRef}
              className="flex-1 min-h-[40px] max-h-40 resize-none px-4 py-2 bg-black text-white placeholder:text-neutral-400 placeholder:font-mono placeholder:font-normal placeholder:leading-normal border border-white/50 focus:border-neutral-500 focus:outline-none font-mono font-normal leading-normal rounded-none overflow-y-auto overflow-x-auto"
              placeholder={calib.step !== "done" ? "Tap an option or type your answer…" : "Type a message..."}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={GEMINI_MAX_CHARS}
            />
            <button
              type="submit"
              className="cursor-pointer px-4 py-2 bg-neutral-400 hover:bg-neutral-300 text-neutral-900 font-mono font-normal leading-normal border border-white/50 transition-colors duration-150 flex items-center justify-center"
              aria-label="Send"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
    </div>
  );
}
