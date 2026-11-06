"use client";

// Documentation tab, served from our own copy of the docs (src/lib/docsStore.ts),
// kept current by the daily docs sync. Two views:
//   - entries: every entry of the module's docs, searchable — the way in;
//   - page:    one page, scrolled to and highlighting what a link pointed at.
// Nothing here loads another site. Modules our copy does not cover (no DevDocs set)
// show a card linking to their official docs instead.
//
// Every page carries the doc set's credit and licence notice: the content is the
// upstream projects' (MDN, cppreference, Python…), redistributed under their licences.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, BookOpen, List } from "lucide-react";
import DocPage from "@/components/DocPage";
import { getDocSource } from "@/lib/docs";
import { getModuleMeta } from "@/lib/modules";
import { loadEntries, loadManifest, type DocEntry } from "@/lib/docsStore";

// A page requested from elsewhere — a chat doc link — and the link's text, which the
// page view highlights. The nonce makes repeat clicks on the same page re-navigate.
type DocTarget = { path: string; nonce: number; label?: string } | null;
type View = { kind: "entries" } | { kind: "page"; path: string; label?: string };

const SHOWN = 200;

export default function DocsPanel({
  moduleId,
  docTarget,
}: {
  moduleId?: string | null;
  docTarget?: DocTarget;
}) {
  const src = getDocSource(moduleId);
  const slug = src?.kind === "devdocs" ? src.slug : null;
  const title = getModuleMeta(moduleId)?.title ?? "Documentation";

  const [view, setView] = useState<View>(() =>
    docTarget ? { kind: "page", path: docTarget.path, label: docTarget.label } : { kind: "entries" }
  );
  // Follow a new link, or reset when the module changes — during render, not in an
  // effect, so there is no extra render pass.
  const [seen, setSeen] = useState({ slug, docTarget });
  if (seen.slug !== slug || seen.docTarget !== docTarget) {
    setSeen({ slug, docTarget });
    if (docTarget && docTarget !== seen.docTarget) {
      setView({ kind: "page", path: docTarget.path, label: docTarget.label });
    } else if (seen.slug !== slug) {
      setView({ kind: "entries" });
    }
  }

  // The doc set's credit, from the sync's manifest.
  const [credit, setCredit] = useState<{ slug: string; html: string } | null>(null);
  useEffect(() => {
    if (!slug) return;
    let live = true;
    loadManifest().then((m) => live && setCredit({ slug, html: m?.docs[slug]?.attribution ?? "" }));
    return () => {
      live = false;
    };
  }, [slug]);
  const attribution = credit?.slug === slug ? credit.html : "";

  return (
    <div className="flex h-full w-full min-w-0 flex-col border border-line-strong backdrop-blur-md font-sans">
      <div className="flex items-center justify-between gap-2 border-b border-line-strong px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="truncate text-sm font-bold leading-normal text-ink">{title} docs</span>
          {src && (
            <span className="hidden shrink-0 whitespace-nowrap text-meta leading-normal text-ink-dim sm:inline">
              · {src.label}
            </span>
          )}
        </div>
        {slug && view.kind === "page" && (
          <button
            type="button"
            onClick={() => setView({ kind: "entries" })}
            title="All entries"
            className="flex shrink-0 items-center gap-1.5 border border-line-strong bg-surface-0 px-2.5 py-1 text-meta text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <List className="h-3 w-3" /> All entries
          </button>
        )}
      </div>

      {!src ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-faint">
          Pick a course to see its documentation here.
        </div>
      ) : slug && view.kind === "page" ? (
        <DocPage
          slug={slug}
          path={view.path}
          label={view.label}
          attribution={attribution}
          onNavigate={(path) => setView({ kind: "page", path })}
        />
      ) : slug ? (
        <Entries slug={slug} onOpen={(e) => setView({ kind: "page", path: e.path, label: e.name })} />
      ) : (
        // Our copy has no set for this one.
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <BookOpen className="h-8 w-8 text-ink-faint" />
          <p className="max-w-sm text-sm leading-relaxed text-ink-dim">
            The official <span className="text-ink-muted">{title}</span> documentation isn&apos;t in the
            app yet, but it&apos;s one click away.
          </p>
          {src.kind === "external" && (
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-line-strong bg-surface-2 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-3"
            >
              {src.label} <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Every entry of a doc set, filtered as you type. */
function Entries({ slug, onOpen }: { slug: string; onOpen: (e: DocEntry) => void }) {
  const [state, setState] = useState<{ slug: string; entries: DocEntry[] | null; error: boolean }>({
    slug: "",
    entries: null,
    error: false,
  });
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    loadEntries(slug)
      .then((entries) => live && setState({ slug, entries, error: false }))
      .catch(() => live && setState({ slug, entries: null, error: true }));
    return () => {
      live = false;
    };
  }, [slug]);

  const entries = state.slug === slug ? state.entries : null;
  const shown = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    const hits = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
    // Names that start with the query first: typing "int" should not lead with "print".
    return (q ? [...hits].sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))) : hits).slice(0, SHOWN);
  }, [entries, query]);

  if (state.slug === slug && state.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-faint">
        These docs haven&apos;t been downloaded yet. They appear after the next docs sync.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries…"
          aria-label="Search documentation entries"
          className="w-full border border-line-strong bg-surface-0 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-line-active focus:outline-none"
        />
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {entries === null ? (
          <li className="px-4 py-2 text-sm text-ink-faint">Loading…</li>
        ) : shown.length === 0 ? (
          <li className="px-4 py-2 text-sm text-ink-faint">No entries match.</li>
        ) : (
          shown.map((e) => (
            <li key={`${e.path}|${e.name}`}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="flex w-full items-baseline justify-between gap-3 px-4 py-1 text-left text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <span className="truncate font-mono text-[0.8125rem]">{e.name}</span>
                {e.type && <span className="shrink-0 text-meta text-ink-faint">{e.type}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
