"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RUNTIMES } from "@/lib/runtimes/registry";
import type { IconType } from "react-icons";
import { FiSettings, FiChevronDown, FiChevronUp } from "react-icons/fi";
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

type RoadmapSummary = {
  skill: string;
  level?: string;
  goal?: string;
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
function useStoredRoadmaps(): { roadmaps: RoadmapSummary[]; remove: (r: RoadmapSummary) => void } {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

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
  }, []);

  function remove(r: RoadmapSummary) {
    setRoadmaps((list) => list.filter((x) => x.skill !== r.skill));
    if (!userId) return;
    const mod = moduleIdForSkill(r.skill);
    const qs =
      `user_id=${encodeURIComponent(userId)}&skill=${encodeURIComponent(r.skill)}` +
      (mod ? `&module=${encodeURIComponent(mod)}` : "");
    fetch(`/api/roadmap/state?${qs}`, { method: "DELETE" }).catch(() => {});
  }

  return { roadmaps, remove };
}

// Continuous completion in [0,1] — same metric as the roadmap tab.
function pctOf(r: RoadmapSummary): number {
  return (r.ratio ?? (r.totalCount > 0 ? r.doneCount / r.totalCount : 0)) as number;
}

function RoadmapCard({
  r,
  onSelect,
  onDelete,
}: {
  r: RoadmapSummary;
  onSelect: (id: string) => void;
  onDelete: () => void;
}) {
  const id = moduleIdForSkill(r.skill);
  const mod = id ? MODULE_BY_ID.get(id) : undefined;
  const [confirming, setConfirming] = useState(false);
  // Use the same continuous, objective-level ratio the roadmap tab shows (falls back to
  // the done/total lessons fraction for older summaries without a ratio).
  const pct = Math.round(pctOf(r) * 100);
  const meta = [r.level, r.goal].filter(Boolean).join(" · ");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={!id}
      onClick={() => !confirming && id && onSelect(id)}
      onKeyDown={(e) => {
        if (!confirming && id && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={`group relative flex flex-col items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-5 py-4.5 text-left leading-relaxed
                 shadow-lg shadow-black/40 backdrop-blur-xl
                 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-emerald-400/[0.12]
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300/40
                 ${id ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
    >
      {/* Course settings — revealed on hover, like the read-aloud button in chat */}
      <button
        type="button"
        aria-label={`Settings for ${r.skill} course`}
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        className="absolute right-3 top-3 z-10 rounded-md p-1 text-white/40 opacity-0 transition-opacity
                   hover:bg-white/10 hover:text-white/90 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <FiSettings size={14} />
      </button>

      <div className="flex w-full items-center gap-2.5 pr-7">
        {mod && <mod.Icon size={18} color={mod.color} className="shrink-0 drop-shadow" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{r.skill}</div>
          <span className="text-[10px] text-white/50">{relativeTime(r.updatedAt)}</span>
        </div>
      </div>
      {meta && <div className="text-xs leading-snug text-white/70">{meta}</div>}
      <div className="mt-1 w-full">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
          <span>{r.totalCount > 0 ? `${r.doneCount}/${r.totalCount} lessons` : "Not started"}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-400/80 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="mt-1 text-[11px] font-medium text-emerald-300/90 group-hover:text-emerald-200">
        {id ? "Resume →" : "Module unavailable"}
      </span>

      {/* Settings overlay: delete with explicit confirm — destructive, so never one-click */}
      {confirming && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-950/90 p-4 text-center backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs leading-relaxed text-white/85">
            Delete <span className="font-bold text-white">{r.skill}</span>?
            <br />
            <span className="text-white/60">Roadmap, progress and chat history will be erased.</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
            >
              Delete course
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(false);
              }}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
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
}: {
  roadmaps: RoadmapSummary[];
  onSelect: (id: string) => void;
  onDelete: (r: RoadmapSummary) => void;
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
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            My courses
            <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/60">
              {roadmaps.length}
            </span>
          </h2>
          <p className="mt-1.5 text-[11px] text-white/45">
            {lessonsDone} lesson{lessonsDone === 1 ? "" : "s"} completed · {avgPct}% average progress
          </p>
        </div>
        {roadmaps.length > 1 && (
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 backdrop-blur-md">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortPersist(mode)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  sort === mode
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "text-white/55 hover:bg-white/10 hover:text-white/85"
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
          <RoadmapCard key={r.skill} r={r} onSelect={onSelect} onDelete={() => onDelete(r)} />
        ))}
      </div>

      {sorted.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md
                     transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
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
      className="group relative flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-white/15 bg-white/[0.10] p-4 text-left
                 shadow-lg shadow-black/40 backdrop-blur-xl
                 transition-all duration-200 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.16]
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
    >
      <Icon
        size={30}
        color={m.color}
        className="drop-shadow transition-transform duration-200 group-hover:scale-110"
      />
      <div className="min-w-0">
        <div className="text-sm font-bold text-white">{m.title}</div>
        <div className="mt-0.5 text-xs leading-snug text-white/75">{m.blurb}</div>
      </div>
      <span
        title="Runs live in your browser"
        className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px] shadow-emerald-400/60"
      />
    </button>
  );
}

export default function Landing({ onSelect }: { onSelect: (id: string) => void }) {
  const { roadmaps, remove } = useStoredRoadmaps();
  return (
    <div className="relative z-10 h-full w-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col px-6 py-12 sm:py-16">
        {/* Hero */}
        <header className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium uppercase leading-none tracking-wider text-white/80 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Runs live in your browser — no installs
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Learn by doing.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/75 sm:text-base">
            Pick a technology below and we run it live, right here — real code, real
            databases, real output, with an AI tutor beside you.
          </p>
        </header>

        {/* My courses — the signed-in user's stored roadmaps */}
        {roadmaps.length > 0 && (
          <MyCourses roadmaps={roadmaps} onSelect={onSelect} onDelete={remove} />
        )}

        {/* Module sections */}
        <div className="flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <section key={section.label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
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
        <p className="mt-10 text-center text-[11px] text-white/45">
          C# · Node.js · Linux · Rust · Go · cloud tracks are coming as heavier runtimes land.
        </p>
      </div>
    </div>
  );
}
