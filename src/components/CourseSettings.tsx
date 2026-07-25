"use client";

// Full-screen management view for one course. Reached from the ⋮ menu on a course
// card. Everything here acts on a single course_id.
//
// The destructive actions live in their own section at the bottom and each require
// an explicit second click — the pattern the course card already uses for delete.

import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import type { RoadmapSummary } from "@/components/Landing";

type Progress = Record<string, { done?: boolean; passed?: unknown; built?: { objectives?: unknown[] } }>;
type TreeNode = { id?: string; kind?: string; title?: string; children?: TreeNode[] | null };
type Tree = { topics?: TreeNode[] } | null;

const LEVELS = ["New to it", "Some experience", "Experienced"];

// Same accounting as the roadmap tab: a done lesson is 1, otherwise the fraction of
// its objectives passed; parents average their children.
function ratioOf(node: TreeNode, progress: Progress): number {
  if (node.kind === "point") {
    const e = node.id ? progress[node.id] : undefined;
    if (!e) return 0;
    if (e.done) return 1;
    const total = Array.isArray(e.built?.objectives) ? e.built!.objectives!.length : 0;
    const passed = Array.isArray(e.passed) ? e.passed.length : 0;
    return total > 0 ? Math.min(1, passed / total) : 0;
  }
  const kids = node.children;
  if (!Array.isArray(kids) || kids.length === 0) return 0;
  return kids.reduce((s, c) => s + ratioOf(c, progress), 0) / kids.length;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A destructive action that needs a second, explicit confirmation. */
function DangerAction({
  title,
  detail,
  label,
  confirmLabel,
  onConfirm,
  done,
}: {
  title: string;
  detail: string;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  done?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000); // don't leave a live trigger sitting there
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-1 text-xs leading-snug text-ink-dim">{detail}</p>
      </div>
      {done ? (
        <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-accent">
          <FiCheck size={13} /> Done
        </span>
      ) : armed ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              onConfirm();
              setArmed(false);
            }}
            className="bg-danger px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-danger/80"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="shrink-0 border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors duration-150 hover:border-danger hover:text-danger"
        >
          {label}
        </button>
      )}
    </div>
  );
}

export default function CourseSettings({
  course,
  userId,
  onBack,
  onOpen,
  onDeleted,
}: {
  course: RoadmapSummary;
  userId: string | null;
  onBack: () => void;
  onOpen: (moduleId: string, courseId: string) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(course.name);
  const [level, setLevel] = useState(course.level ?? "");
  const [goal, setGoal] = useState(course.goal ?? "");
  const [tree, setTree] = useState<Tree>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [saved, setSaved] = useState<null | "name" | "calibration">(null);
  const [didReset, setDidReset] = useState(false);
  const [didClearChat, setDidClearChat] = useState(false);

  // Pull the full course so we can show per-topic progress, which the summary
  // endpoint deliberately does not carry.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/roadmap/state?user_id=${encodeURIComponent(userId)}&course_id=${encodeURIComponent(course.courseId)}`
        );
        const { state } = await res.json();
        if (cancelled || !state) return;
        setTree(state.tree ?? null);
        setProgress((state.progress ?? {}) as Progress);
      } catch {
        /* the overview simply stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, course.courseId]);

  const topics = useMemo(() => {
    const list = tree?.topics;
    if (!Array.isArray(list)) return [];
    return list.map((t) => ({ title: t.title ?? "Untitled", pct: Math.round(ratioOf(t, progress) * 100) }));
  }, [tree, progress]);

  const overallPct = Math.round((course.ratio ?? 0) * 100);
  const dirtyCalibration = level !== (course.level ?? "") || goal !== (course.goal ?? "");
  const messageCount = 0; // not summarised server-side; the action states its own effect

  async function post(body: Record<string, unknown>) {
    if (!userId) return null;
    try {
      const res = await fetch("/api/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, user_id: userId, course_id: course.courseId }),
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === course.name) return;
    await post({ action: "rename", name: trimmed });
    setSaved("name");
    setTimeout(() => setSaved(null), 2000);
  }

  async function applyCalibration() {
    await post({ action: "recalibrate", level, goal });
    setSaved("calibration");
    // The roadmap is now empty — open the course so it regenerates against the new
    // calibration rather than leaving the learner on a page that looks unchanged.
    const mod = course.module;
    if (mod) setTimeout(() => onOpen(mod, course.courseId), 600);
  }

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 self-start text-meta font-medium text-ink-dim transition-colors duration-150 hover:text-ink"
        >
          <FiArrowLeft size={13} /> All courses
        </button>

        {/* --- Overview ------------------------------------------------------ */}
        <header className="border border-line-strong bg-surface-1 p-5 backdrop-blur-md">
          <h1 className="text-base font-bold text-ink">{course.name}</h1>
          <p className="mt-1 text-xs text-ink-dim">
            {course.skill}
            {course.level ? ` · ${course.level}` : ""}
            {course.goal ? ` · ${course.goal}` : ""}
          </p>
          <p className="mt-1 text-meta text-ink-dim">
            Started {formatDate(course.createdAt)} · last opened {formatDate(course.updatedAt)}
          </p>

          <div className="mt-5 flex items-center justify-between text-meta text-ink-dim">
            <span>
              {course.totalCount > 0
                ? `${course.doneCount} / ${course.totalCount} lessons`
                : "Not started"}
            </span>
            <span className="font-mono tabular-nums">{overallPct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden bg-surface-2">
            <div className="h-full bg-accent transition-all duration-200" style={{ width: `${overallPct}%` }} />
          </div>
        </header>

        {topics.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Progress by topic
            </h2>
            <div className="flex flex-col gap-2">
              {topics.map((t) => (
                <div key={t.title} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 truncate text-xs text-ink-muted">{t.title}</span>
                  <div className="h-1 flex-1 overflow-hidden bg-surface-2">
                    <div className="h-full bg-accent" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-meta tabular-nums text-ink-dim">
                    {t.pct}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- Name ---------------------------------------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">Name</h2>
          <div className="flex gap-2">
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="flex-1 border border-line-strong bg-surface-0 px-3 py-2 text-sm text-ink
                         outline-none transition-colors duration-150 focus:border-line-active"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={!name.trim() || name.trim() === course.name}
              className="bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 transition-colors duration-150
                         hover:bg-ink-muted disabled:opacity-40"
            >
              {saved === "name" ? "Saved" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-meta text-ink-dim">
            Only the label shown on the card. Duplicates are named “{course.skill} (2)” by default.
          </p>
        </section>

        {/* --- Calibration --------------------------------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Calibration
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-ink-dim">Level</span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(l)}
                    className={`border px-3 py-1.5 text-xs transition-colors duration-150 ${
                      level === l
                        ? "border-accent-line bg-accent-wash text-accent"
                        : "border-line-strong text-ink-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-ink-dim">Goal</span>
              <input
                value={goal}
                maxLength={120}
                placeholder="e.g. web development"
                onChange={(e) => setGoal(e.target.value)}
                className="mt-1.5 w-full border border-line-strong bg-surface-0 px-3 py-2 text-sm text-ink
                           placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-line-active"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={applyCalibration}
              disabled={!dirtyCalibration}
              className="bg-accent px-3 py-1.5 text-xs font-semibold text-surface-0 transition-colors duration-150
                         hover:bg-accent-bright disabled:opacity-40"
            >
              Apply and regenerate roadmap
            </button>
            {dirtyCalibration && (
              <span className="text-meta text-ink-dim">
                Regenerating replaces the curriculum — progress resets.
              </span>
            )}
          </div>
        </section>

        {/* --- Destructive --------------------------------------------------- */}
        <section className="mt-10 mb-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-danger">
            Danger zone
          </h2>
          <DangerAction
            title="Reset progress"
            detail={
              course.doneCount > 0
                ? `Clears all ${course.doneCount} completed lessons. Keeps the roadmap and the chat.`
                : "Clears completed lessons. Keeps the roadmap and the chat."
            }
            label="Reset progress"
            confirmLabel="Reset progress"
            done={didReset}
            onConfirm={async () => {
              await post({ action: "reset" });
              setDidReset(true);
            }}
          />
          <DangerAction
            title="Clear chat history"
            detail={
              messageCount
                ? `Removes ${messageCount} messages with the tutor. Keeps the roadmap and progress.`
                : "Removes the conversation with the tutor. Keeps the roadmap and progress."
            }
            label="Clear chat"
            confirmLabel="Clear chat"
            done={didClearChat}
            onConfirm={async () => {
              if (!userId) return;
              await fetch(
                `/api/chat/state?user_id=${encodeURIComponent(userId)}&course_id=${encodeURIComponent(course.courseId)}`,
                { method: "DELETE" }
              ).catch(() => {});
              setDidClearChat(true);
            }}
          />
          <DangerAction
            title="Delete course"
            detail="Permanently removes the roadmap, all progress and the chat history."
            label="Delete course"
            confirmLabel="Delete permanently"
            onConfirm={async () => {
              if (!userId) return;
              await fetch(
                `/api/roadmap/state?user_id=${encodeURIComponent(userId)}&course_id=${encodeURIComponent(course.courseId)}`,
                { method: "DELETE" }
              ).catch(() => {});
              onDeleted();
            }}
          />
        </section>
      </div>
    </div>
  );
}
