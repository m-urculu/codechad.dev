"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RUNTIMES } from "@/lib/runtimes/registry";
import type { IconType } from "react-icons";
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

// ---- Continue learning (stored roadmaps) --------------------------------

type RoadmapSummary = {
  skill: string;
  level?: string;
  goal?: string;
  updatedAt: string;
  doneCount: number;
  totalCount: number;
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
function useStoredRoadmaps(): RoadmapSummary[] {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load(userId: string | null) {
      if (!userId) {
        if (!cancelled) setRoadmaps([]);
        return;
      }
      try {
        const res = await fetch(`/api/roadmap/list?user_id=${encodeURIComponent(userId)}`);
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

  return roadmaps;
}

function RoadmapCard({ r, onSelect }: { r: RoadmapSummary; onSelect: (id: string) => void }) {
  const id = moduleIdForSkill(r.skill);
  const pct = r.totalCount > 0 ? Math.round((r.doneCount / r.totalCount) * 100) : 0;
  const meta = [r.level, r.goal].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      disabled={!id}
      onClick={() => id && onSelect(id)}
      className="group relative flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-5 py-4.5 text-left leading-relaxed
                 shadow-lg shadow-black/40 backdrop-blur-xl
                 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-emerald-400/[0.12]
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300/40
                 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="text-sm font-bold text-white">{r.skill}</div>
        <span className="shrink-0 text-[10px] text-white/50">{relativeTime(r.updatedAt)}</span>
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
    </button>
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
  const roadmaps = useStoredRoadmaps();
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

        {/* Continue learning — the signed-in user's stored roadmaps */}
        {roadmaps.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Continue learning
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roadmaps.map((r) => (
                <RoadmapCard key={r.skill} r={r} onSelect={onSelect} />
              ))}
            </div>
          </section>
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
