"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RUNTIMES } from "@/lib/runtimes/registry";
import type { IconType } from "react-icons";
import {
  FiSettings,
  FiChevronDown,
  FiChevronUp,
  FiMoreVertical,
  FiCopy,
  FiTrash2,
} from "react-icons/fi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SiJavascript,
  SiTypescript,
  SiPython,
  SiRuby,
  SiPhp,
  SiLua,
  SiPostgresql,
  SiSqlite,
  SiDuckdb,
  SiReact,
  SiVuedotjs,
  SiWebassembly,
  SiThreedotjs,
  SiHuggingface,
} from "react-icons/si";

export type Module = {
  id: string;
  title: string;
  blurb: string;
  Icon: IconType;
  color: string; // brand color for the icon
};

type Section = { label: string; modules: Module[] };

// Only technologies we are confident run FULLY client-side in the browser.
// (See docs/browser-learning-capabilities.md)
const SECTIONS: Section[] = [
  {
    label: "Languages",
    modules: [
      { id: "javascript", title: "JavaScript", blurb: "Runs natively on the JS engine", Icon: SiJavascript, color: "#F7DF1E" },
      { id: "typescript", title: "TypeScript", blurb: "Live types + transpile in-tab", Icon: SiTypescript, color: "#3178C6" },
      { id: "python", title: "Python", blurb: "CPython via Pyodide · numpy, pandas", Icon: SiPython, color: "#3776AB" },
      { id: "ruby", title: "Ruby", blurb: "Real CRuby via ruby.wasm", Icon: SiRuby, color: "#CC342D" },
      { id: "php", title: "PHP", blurb: "Real PHP via php-wasm", Icon: SiPhp, color: "#777BB4" },
      { id: "lua", title: "Lua", blurb: "Lua VM via fengari", Icon: SiLua, color: "#8895d9" },
    ],
  },
  {
    label: "Databases",
    modules: [
      { id: "postgres", title: "PostgreSQL", blurb: "Real Postgres via PGlite", Icon: SiPostgresql, color: "#4169E1" },
      { id: "sqlite", title: "SQLite", blurb: "Real DB via sql.js", Icon: SiSqlite, color: "#7ac5e8" },
      { id: "duckdb", title: "DuckDB", blurb: "Analytics on CSV / Parquet", Icon: SiDuckdb, color: "#FFF000" },
    ],
  },
  {
    label: "Web & Runtimes",
    modules: [
      { id: "react", title: "React", blurb: "Build apps with live preview", Icon: SiReact, color: "#61DAFB" },
      { id: "vue", title: "Vue", blurb: "Build apps with live preview", Icon: SiVuedotjs, color: "#42B883" },
      { id: "wasm", title: "WebAssembly", blurb: "Run C / C++ / Rust / Go output", Icon: SiWebassembly, color: "#654FF0" },
    ],
  },
  {
    label: "Graphics & AI",
    modules: [
      { id: "graphics", title: "Three.js · WebGPU", blurb: "GPU compute & 3D visuals", Icon: SiThreedotjs, color: "#ffffff" },
      { id: "ml", title: "AI / ML", blurb: "Run real models via transformers.js", Icon: SiHuggingface, color: "#FFD21E" },
    ],
  },
];

// Module metadata by id, so course cards can borrow the brand icon + color.
const MODULE_BY_ID = new Map(SECTIONS.flatMap((s) => s.modules).map((m) => [m.id, m]));

// ---- My courses (stored roadmaps) --------------------------------

export type RoadmapSummary = {
  courseId: string;
  skill: string;
  module?: string;
  name: string; // display label; a duplicate gets "Python (2)"
  level?: string;
  goal?: string;
  createdAt?: string;
  updatedAt: string;
  doneCount: number;
  totalCount: number;
  ratio?: number; // continuous completion [0,1] — matches the roadmap tab's overall bar
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

// A stored roadmap's `skill` is the module's registry title — map it back to the
// module id so clicking resumes the right workspace.
function moduleIdForSkill(skill: string): string | undefined {
  return Object.values(RUNTIMES).find((r) => r.title === skill)?.id;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

// Loads the signed-in user's stored roadmaps; re-fetches on auth changes.
// `remove` deletes a course optimistically (card disappears at once, API call follows).
function useStoredRoadmaps(): {
  roadmaps: RoadmapSummary[];
  remove: (r: RoadmapSummary) => void;
  duplicate: (r: RoadmapSummary) => Promise<void>;
  reload: () => void;
} {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load(uid: string | null) {
      if (!cancelled) setUserId(uid);
      if (!uid) {
        if (!cancelled) setRoadmaps([]);
        return;
      }
      try {
        const res = await fetch(`/api/roadmap/list?user_id=${encodeURIComponent(uid)}`);
        const data = await res.json();
        if (!cancelled) setRoadmaps(Array.isArray(data.roadmaps) ? data.roadmaps : []);
      } catch {
        if (!cancelled) setRoadmaps([]);
      }
    }
    supabase.auth.getUser().then(({ data }) => load(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [nonce]);

  function remove(r: RoadmapSummary) {
    setRoadmaps((list) => list.filter((x) => x.courseId !== r.courseId));
    if (!userId) return;
    const qs = `user_id=${encodeURIComponent(userId)}&course_id=${encodeURIComponent(r.courseId)}`;
    fetch(`/api/roadmap/state?${qs}`, { method: "DELETE" }).catch(() => {});
  }

  async function duplicate(r: RoadmapSummary) {
    if (!userId) return;
    try {
      await fetch("/api/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", user_id: userId, course_id: r.courseId }),
      });
    } catch {
      /* fail soft — the list simply won't show a copy */
    }
    setNonce((n) => n + 1); // refetch so the copy appears with a server-assigned id
  }

  return { roadmaps, remove, duplicate, reload: () => setNonce((n) => n + 1) };
}

// Continuous completion in [0,1] — same metric as the roadmap tab.
function pctOf(r: RoadmapSummary): number {
  return (r.ratio ?? (r.totalCount > 0 ? r.doneCount / r.totalCount : 0)) as number;
}

function RoadmapCard({
  r,
  onSelect,
  onDelete,
  onDuplicate,
  onSettings,
}: {
  r: RoadmapSummary;
  onSelect: (moduleId: string, courseId: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSettings: () => void;
}) {
  const id = r.module ?? moduleIdForSkill(r.skill);
  const mod = id ? MODULE_BY_ID.get(id) : undefined;
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Use the same continuous, objective-level ratio the roadmap tab shows (falls back to
  // the done/total lessons fraction for older summaries without a ratio).
  const pct = Math.round(pctOf(r) * 100);
  const meta = [r.level, r.goal].filter(Boolean).join(" · ");
  const busy = confirming || menuOpen;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={!id}
      onClick={() => !busy && id && onSelect(id, r.courseId)}
      onKeyDown={(e) => {
        if (!busy && id && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(id, r.courseId);
        }
      }}
      className={`group relative flex flex-col items-start gap-3 border border-accent-line bg-accent-wash p-4 text-left leading-relaxed
                 backdrop-blur-md
                 transition-colors duration-150 hover:border-accent hover:bg-surface-2
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active
                 ${id ? "" : "opacity-50"}`}
    >
      {/* Course actions — a three-dot menu, so the destructive option is one of
          several rather than the only thing the control does. */}
      <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${r.name}`}
              className={`p-1 text-ink-dim transition-opacity hover:bg-surface-2 hover:text-ink
                          focus-visible:opacity-100 group-hover:opacity-100
                          ${menuOpen ? "opacity-100" : "opacity-0"}`}
            >
              <FiMoreVertical size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            <DropdownMenuItem onClick={onSettings}>
              <FiSettings size={13} /> Course settings…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <FiCopy size={13} /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setConfirming(true)} className="text-danger">
              <FiTrash2 size={13} /> Delete course…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* The icon aligns to the TITLE, not to the title+timestamp block: centring
          it on the pair leaves it straddling the two lines, reading as adrift.
          The wrapper's height matches the title's line box so the two centres
          coincide — hence the explicit leading rather than an inherited one. */}
      <div className="flex w-full items-start gap-2 pr-7">
        {mod && (
          <span className="flex h-5 shrink-0 items-center">
            <mod.Icon size={18} color={mod.color} />
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-5 text-ink">{r.name}</div>
          <span className="text-micro text-ink-dim">{relativeTime(r.updatedAt)}</span>
        </div>
      </div>
      {meta && <div className="text-xs leading-snug text-ink-muted">{meta}</div>}
      <div className="mt-1 w-full">
        <div className="mb-1 flex items-center justify-between text-meta text-ink-dim">
          <span>{r.totalCount > 0 ? `${r.doneCount}/${r.totalCount} lessons` : "Not started"}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden bg-surface-2">
          <div className="h-full bg-accent transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="mt-1 text-meta font-medium text-accent group-hover:text-accent-bright">
        {id ? "Resume →" : "Module unavailable"}
      </span>

      {/* Settings overlay: delete with explicit confirm — destructive, so never one-click */}
      {confirming && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-scrim p-4 text-center backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs leading-relaxed text-ink-muted">
            Delete <span className="font-bold text-ink">{r.name}</span>?
            <br />
            <span className="text-ink-dim">Roadmap, progress and chat history will be erased.</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="bg-danger px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-danger/80"
            >
              Delete course
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(false);
              }}
              className="border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- My courses section --------------------------------------------------

type SortMode = "recent" | "progress" | "name";
const SORT_LABELS: Record<SortMode, string> = { recent: "Recent", progress: "Progress", name: "A–Z" };

function MyCourses({
  roadmaps,
  onSelect,
  onDelete,
  onDuplicate,
  onSettings,
}: {
  roadmaps: RoadmapSummary[];
  onSelect: (moduleId: string, courseId: string) => void;
  onDelete: (r: RoadmapSummary) => void;
  onDuplicate: (r: RoadmapSummary) => void;
  onSettings: (r: RoadmapSummary) => void;
}) {
  const [sort, setSort] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "recent";
    const s = window.localStorage.getItem("courses-sort");
    return s === "progress" || s === "name" ? s : "recent";
  });
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const list = [...roadmaps];
    if (sort === "progress") list.sort((a, b) => pctOf(b) - pctOf(a));
    else if (sort === "name") list.sort((a, b) => a.skill.localeCompare(b.skill));
    return list; // "recent": keep API order (newest first)
  }, [roadmaps, sort]);

  const shown = expanded ? sorted : sorted.slice(0, 3);
  const lessonsDone = roadmaps.reduce((s, r) => s + r.doneCount, 0);
  const avgPct = Math.round((roadmaps.reduce((s, r) => s + pctOf(r), 0) / roadmaps.length) * 100);

  function setSortPersist(mode: SortMode) {
    setSort(mode);
    try {
      window.localStorage.setItem("courses-sort", mode);
    } catch {}
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            <span className="h-1.5 w-1.5 bg-accent" />
            My courses
            <span className="border border-line px-1.5 py-0.5 text-micro font-medium normal-case tracking-normal text-ink-dim">
              {roadmaps.length}
            </span>
          </h2>
          <p className="mt-1.5 text-meta text-ink-dim">
            {lessonsDone} lesson{lessonsDone === 1 ? "" : "s"} completed · {avgPct}% average progress
          </p>
        </div>
        {roadmaps.length > 1 && (
          <div className="flex items-center gap-1 border border-line bg-surface-1 p-0.5 backdrop-blur-md">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortPersist(mode)}
                className={`px-2.5 py-1 text-meta font-medium transition-colors duration-150 ${
                  sort === mode
                    ? "bg-accent-wash text-accent"
                    : "text-ink-dim hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {SORT_LABELS[mode]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <RoadmapCard
            key={r.courseId}
            r={r}
            onSelect={onSelect}
            onDelete={() => onDelete(r)}
            onDuplicate={() => onDuplicate(r)}
            onSettings={() => onSettings(r)}
          />
        ))}
      </div>

      {sorted.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto mt-3 flex items-center gap-1.5 border border-line-strong bg-surface-1 px-4 py-1.5 text-meta font-medium text-ink-muted backdrop-blur-md
                     transition-colors duration-150 hover:border-line-active hover:bg-surface-2 hover:text-ink"
        >
          {expanded ? (
            <>
              Show less <FiChevronUp size={12} />
            </>
          ) : (
            <>
              Show all {sorted.length} courses <FiChevronDown size={12} />
            </>
          )}
        </button>
      )}
    </section>
  );
}

function ModuleCard({ m, onSelect }: { m: Module; onSelect: (id: string) => void }) {
  const { Icon } = m;
  return (
    <button
      type="button"
      onClick={() => onSelect(m.id)}
      className="group relative flex flex-col items-start gap-3 border border-line-strong bg-surface-1 p-4 text-left
                 backdrop-blur-md
                 transition-colors duration-150 hover:border-line-active hover:bg-surface-2
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active"
    >
      <Icon size={30} color={m.color} className="shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-bold text-ink">{m.title}</div>
        <div className="mt-0.5 text-xs leading-snug text-ink-muted">{m.blurb}</div>
      </div>
      <span
        title="Runs live in your browser"
        className="absolute right-3 top-3 h-1.5 w-1.5 bg-accent"
      />
    </button>
  );
}

export default function Landing({
  onSelect,
  onSettings,
}: {
  /** courseId is supplied when resuming a stored course; omitted when starting a
   *  technology from the grid, which resumes the most recent course or begins one. */
  onSelect: (moduleId: string, courseId?: string) => void;
  onSettings: (r: RoadmapSummary) => void;
}) {
  const { roadmaps, remove, duplicate } = useStoredRoadmaps();
  return (
    <div className="relative z-10 h-full w-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col px-6 py-12 sm:py-16">
        {/* Hero */}
        <header className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 border border-line-strong bg-surface-1 px-3 py-1.5 text-meta font-medium uppercase leading-none tracking-wider text-ink-muted backdrop-blur-md">
            <span className="h-1.5 w-1.5 bg-accent" />
            Runs live in your browser — no installs
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Learn by doing.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-muted sm:text-base">
            Pick a technology below and we run it live, right here — real code, real
            databases, real output, with an AI tutor beside you.
          </p>
        </header>

        {/* My courses — the signed-in user's stored roadmaps */}
        {roadmaps.length > 0 && (
          <MyCourses
            roadmaps={roadmaps}
            onSelect={onSelect}
            onDelete={remove}
            onDuplicate={duplicate}
            onSettings={onSettings}
          />
        )}

        {/* Module sections */}
        <div className="flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <section key={section.label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-dim">
                {section.label}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {section.modules.map((m) => (
                  <ModuleCard key={m.id} m={m} onSelect={onSelect} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footnote */}
        <p className="mt-10 text-center text-meta text-ink-dim">
          C# · Node.js · Linux · Rust · Go · cloud tracks are coming as heavier runtimes land.
        </p>
      </div>
    </div>
  );
}
