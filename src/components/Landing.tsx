"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseBrowser";
import { RUNTIMES } from "@/lib/runtimes/registry";
import { PATHS, getPathByTitle, type LearningPath } from "@/lib/paths";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import type { IconType } from "react-icons";
import { apiFetch } from "@/lib/apiFetch";
import {
  readCourses,
  writeCourses,
  mergeCourses,
  type RoadmapSummary,
} from "@/lib/courseCache";
import { clearChat, prefetchChats } from "@/lib/chatCache";
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
  SiC,
  SiCplusplus,
  SiGit,
  SiLinux,
  SiGo,
  SiLua,
  SiPostgresql,
  SiSqlite,
  SiDuckdb,
  SiReact,
  SiVuedotjs,
  SiCss,
  SiTailwindcss,
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
//
// ORDER IS DELIBERATE: sections, and modules within them, run strictly by PAY —
// the US average annual salary attached to each technology as a keyword, highest
// first. Groups are ranked by the median of their modules' figures.
//
// This replaced an expected-earnings ordering (pay AND hiring volume) on
// 2026-07-30 at the owner's direction. The difference is not cosmetic: volume was
// the term that kept JavaScript high and kept thin, well-paid niches low, so
// dropping it moved Graphics & AI from last to first and pushed Languages to
// third. Read docs/module-ordering.md before "fixing" anything here that looks
// wrong — several entries look wrong because the pay data IS wrong, and the doc
// says which ones and why.
//
// Three figures in particular do not mean what they appear to mean:
//   • Lua ($127,901) lands above Python ($127,875) on a ZipRecruiter keyword page
//     with a tiny, Roblox-skewed sample. Nobody should read that as "Lua pays
//     like Python".
//   • WebAssembly (~$54,800) is last because its keyword page matches non-
//     engineering jobs. It is a bad number, not a cheap skill.
//   • Git, SQLite and DuckDB have NO keyword salary at all — nobody is hired as a
//     "SQLite developer" — so they sort last within their groups on a proxy.
// Keep new modules in rank rather than appending, or the grid stops meaning
// anything — and when you do, update the doc with the number that justified it.
const SECTIONS: Section[] = [
  // median $155,967 — the two best-paid figures on the grid, and the smallest group.
  {
    label: "Graphics & AI",
    modules: [
      { id: "ml", title: "AI / ML", blurb: "Run real models via transformers.js", Icon: SiHuggingface, color: "#FFD21E" }, // $190,810
      { id: "graphics", title: "Three.js · WebGPU", blurb: "GPU compute & 3D visuals", Icon: SiThreedotjs, color: "#ffffff" }, // $121,124
    ],
  },
  // median $139,290 — carried entirely by Linux; Git has no keyword salary at all.
  {
    label: "Tools",
    modules: [
      { id: "linux", title: "Linux", blurb: "A shell, pipes and permissions", Icon: SiLinux, color: "#FCC624" }, // $139,290
      { id: "git", title: "Git", blurb: "A real repo in your browser", Icon: SiGit, color: "#F05032" }, // no figure
    ],
  },
  // median $127,875 (Python) — the widest spread on the grid, $83.8k to $142.4k.
  {
    label: "Languages",
    modules: [
      { id: "cpp", title: "C++", blurb: "Real Clang++ with the STL", Icon: SiCplusplus, color: "#00599C" }, // $142,385
      { id: "go", title: "Go", blurb: "Yaegi interpreter in a worker", Icon: SiGo, color: "#00ADD8" }, // $130,219
      { id: "typescript", title: "TypeScript", blurb: "Live types + transpile in-tab", Icon: SiTypescript, color: "#3178C6" }, // $129,348
      { id: "lua", title: "Lua", blurb: "Lua VM via fengari", Icon: SiLua, color: "#8895d9" }, // $127,901 — see the caveat above
      { id: "python", title: "Python", blurb: "CPython via Pyodide · numpy, pandas", Icon: SiPython, color: "#3776AB" }, // $127,875
      { id: "ruby", title: "Ruby", blurb: "Real CRuby via ruby.wasm", Icon: SiRuby, color: "#CC342D" }, // $119,243 (n=44)
      { id: "c", title: "C", blurb: "Real Clang compiled to WASM", Icon: SiC, color: "#A8B9CC" }, // $112,000
      { id: "javascript", title: "JavaScript", blurb: "Runs natively on the JS engine", Icon: SiJavascript, color: "#F7DF1E" }, // $111,629
      { id: "php", title: "PHP", blurb: "Real PHP via php-wasm", Icon: SiPhp, color: "#777BB4" }, // $83,800
    ],
  },
  // median $111,845 (CSS) — and the group holding the grid's worst data point.
  {
    label: "Web & Runtimes",
    modules: [
      { id: "vue", title: "Vue", blurb: "Build apps with live preview", Icon: SiVuedotjs, color: "#42B883" }, // $138,932
      { id: "react", title: "React", blurb: "Build apps with live preview", Icon: SiReact, color: "#61DAFB" }, // $129,348
      { id: "css", title: "CSS", blurb: "Style a real page, live", Icon: SiCss, color: "#663399" }, // $111,845
      { id: "tailwind", title: "Tailwind CSS", blurb: "Utility classes, compiled in-tab", Icon: SiTailwindcss, color: "#38BDF8" }, // $70,866
      { id: "wasm", title: "WebAssembly", blurb: "Run C / C++ / Rust / Go output", Icon: SiWebassembly, color: "#654FF0" }, // ~$54,800 — bad figure, see above
    ],
  },
  // median $110,489 — only Postgres has a real figure; the other two use a proxy,
  // which is why this group sorts last rather than because analytics pays badly.
  {
    label: "Databases",
    modules: [
      { id: "postgres", title: "PostgreSQL", blurb: "Real Postgres via PGlite", Icon: SiPostgresql, color: "#4169E1" }, // $123,262
      { id: "duckdb", title: "DuckDB", blurb: "Analytics on CSV / Parquet", Icon: SiDuckdb, color: "#FFF000" }, // proxy $110,489
      { id: "sqlite", title: "SQLite", blurb: "Real DB via sql.js", Icon: SiSqlite, color: "#7ac5e8" }, // proxy $110,489
    ],
  },
];

// Module metadata by id, so course cards can borrow the brand icon + color.
const MODULE_BY_ID = new Map(SECTIONS.flatMap((s) => s.modules).map((m) => [m.id, m]));

// ---- My courses (stored roadmaps) --------------------------------

// Defined alongside the cache that stores it (src/lib/courseCache.ts), and
// re-exported here because this is where every consumer already imports it from.
export type { RoadmapSummary };


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
//
// Cache-first: the cards paint from localStorage on the first frame and the
// network response then updates the progress figures in place (see courseCache.ts
// for why the list request is expensive enough to be worth avoiding on the
// critical path). Every mutation below writes the cache too, so a deleted course
// does not reappear on the next visit and a rename survives the reload.
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
    // Handed to the background prefetch so it stops mid-list when the learner
    // navigates away — a queue of chat requests must never outlive the page that
    // started it, least of all into the workspace it would be competing with.
    const prefetchAbort = { aborted: false };
    // getUser() and the INITIAL_SESSION event below both report the same signed-in
    // user on every page load, and each used to fire its own list request — the
    // expensive one, twice, for one visit. Only a CHANGE of user reloads now.
    let loadedFor: string | null | undefined = undefined;
    async function load(uid: string | null) {
      if (loadedFor === uid) return;
      loadedFor = uid;
      if (!cancelled) setUserId(uid);
      if (!uid) {
        // Signed out shows no courses. The cache is left in place, keyed by the
        // user id — signing back in repaints instantly instead of starting cold.
        if (!cancelled) setRoadmaps([]);
        return;
      }

      // 1) Whatever we already know, on this frame.
      const cached = readCourses(uid);
      if (cached && !cancelled) setRoadmaps(cached);

      // 2) The truth, a round trip later — folded in so unchanged cards keep
      //    their object identity and only the progress numbers move.
      try {
        const res = await apiFetch("/api/roadmap/list");
        const data = await res.json();
        if (cancelled) return;
        const fresh: RoadmapSummary[] = Array.isArray(data.roadmaps) ? data.roadmaps : [];
        const merged = mergeCourses(cached, fresh);
        setRoadmaps(merged);
        writeCourses(uid, merged);

        // Warm the conversations in the background, most recent session first —
        // the list already arrives newest-first. Opening a course then shows the
        // thread straight away instead of after a round trip. Nothing here
        // affects what is on screen, and it stops the moment this unmounts.
        void prefetchChats(uid, merged, async (courseId) => {
          const r = await apiFetch(`/api/chat/state?course_id=${encodeURIComponent(courseId)}`);
          const { state } = await r.json();
          return state ?? null;
        }, { signal: prefetchAbort });
      } catch {
        // Offline or a paused project: keep showing the cached list rather than
        // blanking a page full of work. An empty cache still renders as empty.
        if (!cached && !cancelled) setRoadmaps([]);
      }
    }
    supabase.auth.getUser().then(({ data }) => load(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      prefetchAbort.aborted = true;
      sub.subscription.unsubscribe();
    };
  }, [nonce]);

  function remove(r: RoadmapSummary) {
    // Kept out of the state updater on purpose: an updater must stay pure (React
    // may run it twice), and writing storage from inside one is exactly the kind
    // of effect that misbehaves under StrictMode.
    const next = roadmaps.filter((x) => x.courseId !== r.courseId);
    setRoadmaps(next);
    writeCourses(userId, next); // or the card returns on the next visit
    clearChat(userId, r.courseId); // its conversation goes with it
    if (!userId) return;
    const qs = `course_id=${encodeURIComponent(r.courseId)}`;
    apiFetch(`/api/roadmap/state?${qs}`, { method: "DELETE" }).catch(() => {});
  }

  async function duplicate(r: RoadmapSummary) {
    if (!userId) return;
    try {
      await apiFetch("/api/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", course_id: r.courseId }),
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
  // A stored path course keeps the path's title as its skill, which is how it is
  // recognised here — the row itself holds no path id.
  const path = getPathByTitle(r.skill);
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
        {/* A path spans a dozen technologies, so its module icon (whatever it happens
            to open in) would misdescribe it. Show the path's own colour instead. */}
        {path ? (
          <span className="flex h-5 shrink-0 items-center">
            <span className="h-3.5 w-1" style={{ backgroundColor: path.color }} />
          </span>
        ) : (
          mod && (
            <span className="flex h-5 shrink-0 items-center">
              <mod.Icon size={18} color={mod.color} />
            </span>
          )
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-5 text-ink">{r.name}</div>
          {/* Block, with its own leading: as an inline it was laid out in the
              line box of the 16px strut this card inherits from leading-relaxed,
              which floated it 8px clear of the title it belongs to. */}
          <span className="block text-micro leading-4 text-ink-dim">
            {relativeTime(r.updatedAt)}
          </span>
        </div>
      </div>
      {meta && <div className="text-xs leading-snug text-ink-muted">{meta}</div>}
      <div className="mt-1 w-full">
        <div className="mb-1 flex items-center justify-between text-meta text-ink-dim">
          {/* Topics, not lessons: lessons are generated lazily, so their total is
              the size of what has been explored, not the size of the course. */}
          <span>
            {r.topicsTotal > 0 ? `${r.topicsDone}/${r.topicsTotal} topics` : "Not started"}
          </span>
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

// A career path — a fixed, multi-technology curriculum (src/lib/paths.ts).
// Deliberately not a ModuleCard: a path is a months-long commitment across a dozen
// technologies, and it should not look like a one-click Python sandbox. The card
// states its length up front, because the honest version of "become a backend
// developer" is 23 courses, not a nicer button.
function PathCard({
  p,
  onSelect,
}: {
  p: LearningPath;
  onSelect: (moduleId: string, courseId: undefined, pathId: string) => void;
}) {
  const projects = p.courses.filter((c) => c.kind !== "course").length;
  return (
    <button
      type="button"
      onClick={() => onSelect(p.module, undefined, p.id)}
      className="group relative flex flex-col items-start gap-2 border border-line-strong bg-surface-1 p-5 text-left
                 backdrop-blur-md
                 transition-colors duration-150 hover:border-line-active hover:bg-surface-2
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active"
    >
      <span className="h-1 w-8" style={{ backgroundColor: p.color }} />
      <div className="text-base font-bold text-ink">{p.title}</div>
      <div className="text-xs font-medium text-ink-muted">{p.blurb}</div>
      <div className="mt-1 text-xs leading-snug text-ink-dim">{p.summary}</div>
      <div className="mt-2 flex items-center gap-2 text-meta text-ink-dim">
        <span className="tabular-nums">{p.courses.length} courses</span>
        <span>·</span>
        <span className="tabular-nums">{projects} projects</span>
      </div>
      <span className="mt-1 text-meta font-medium text-accent group-hover:text-accent-bright">
        Start the path →
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
   *  technology from the grid, which resumes the most recent course or begins one.
   *  pathId starts a fixed multi-technology curriculum instead of a generated one. */
  onSelect: (moduleId: string, courseId?: string, pathId?: string) => void;
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
          {/* The app name is its own h1, alone. Google's OAuth review compares the
              consent screen's app name against the home page, and the name it wants
              to find is exactly "CodeChad" — not a headline that happens to contain
              it. The tagline is demoted to a following line.

              Note the template literals throughout this section: `{SITE_NAME} — x`
              makes React emit two text nodes separated by a <!-- --> marker in the
              server HTML, so the served source reads `CodeChad<!-- --> — x`. Any
              real parser handles that; a naive string match may not, and this
              review has already cost several rounds. */}
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {SITE_NAME}
          </h1>
          <p className="mt-2 text-lg font-semibold text-ink-muted sm:text-xl">
            {`${SITE_NAME} — learn programming by doing.`}
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-ink-muted sm:text-base">
            {`${SITE_NAME} is a free, browser-based app for learning programming languages and
            databases. Tell it what you want to learn and ${SITE_NAME} builds you a personalised
            roadmap, then teaches it lesson by lesson with an AI tutor — running your real code
            live in the page, with nothing to install.`}
          </p>
          {/* The trial is worth naming: a visitor who knows the first lesson costs
              nothing is far likelier to start one, and starting one is the whole
              funnel. Bounded in EditorPanels, capped server-side in rateLimit.ts. */}
          <p className="mt-4 text-sm text-ink-muted">
            Pick a track below and start straight away — your first lesson is free, no account
            needed.
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

        {/* Career paths — above the grid on purpose. Someone who knows which
            technology they want can find it below; someone who only knows which JOB
            they want cannot, and picking "Python" would answer a question they
            didn't ask. */}
        <section className="mb-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Career paths
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            A fixed curriculum across every technology the job needs — in order, with projects.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PATHS.map((p) => (
              <PathCard key={p.id} p={p} onSelect={onSelect} />
            ))}
          </div>
        </section>

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
        {/* Kept accurate as runtimes land: Linux and Go used to be listed here as
            "coming" long after they shipped, which is the kind of small lie a landing
            page tells for months. */}
        <p className="mx-auto mt-10 max-w-2xl text-center text-meta leading-relaxed text-ink-dim">
          C# · Node.js · Rust · Java are coming as heavier runtimes land. Docker, Kubernetes, AWS,
          CI/CD and Power BI appear inside the career paths as work you write and get reviewed —
          a browser tab has no kernel, cluster or cloud account to run them against.
        </p>

        {/* What the app is. The hero above carries the one-line version; this is
            the longer one. Deliberately no "why we ask for a Google account"
            section: written for an OAuth reviewer, it read as defensive on a page
            meant for learners — a list of things the app does not do answers
            accusations nobody made. The scope disclosure lives in the privacy
            policy, which is where someone actually looking for it goes. */}
        <section className="mt-12 border-t border-line pt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
            {`About ${SITE_NAME}`}
          </h2>
          <div className="mt-4 max-w-3xl">
            <div>
              <h3 className="text-sm font-bold text-ink">What it does</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {`You pick a technology — Python, JavaScript, C++, PostgreSQL and a dozen more — and
                describe your level and what you are trying to achieve. ${SITE_NAME} generates a
                learning roadmap for exactly that, breaks it into topics and lessons, and walks
                you through them one at a time.`}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Every lesson is hands-on. You write real code in the built-in editor and run it
                immediately: Python through Pyodide, PostgreSQL through PGlite, C and C++ through
                a real Clang compiler, Ruby, PHP and Lua through WebAssembly — all inside your
                browser, with nothing installed and no server executing your code. An AI tutor
                sits beside the editor to explain, hint and review, and each exercise is graded
                by actually running it and checking the output.
              </p>
            </div>
          </div>
        </section>

        {/* Google's OAuth consent screen requires the privacy policy to be reachable
            from the app's homepage, so these links are not optional decoration. */}
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-5 text-meta text-ink-dim">
          <span>{SITE_NAME} — beta</span>
          <Link href="/privacy" className="text-ink-dim transition-colors duration-150 hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="text-ink-dim transition-colors duration-150 hover:text-ink">
            Terms
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-ink-dim transition-colors duration-150 hover:text-ink"
          >
            Contact
          </a>
        </footer>
      </div>
    </div>
  );
}
