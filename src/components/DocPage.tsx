"use client";

// One documentation page, from our own copy of the docs (src/lib/docsStore.ts).
//
// Rendered here rather than in an embedded docs site so the pane can scroll to the
// definition a link points at and highlight it: `int` lands on
// "int — basic integer type", marked. Pages come from the bundles the docs sync
// writes and are cached for the session (docsStore).
//
// The HTML is the docs' own, but it still goes through the browser's parser and is
// cleaned before it is inserted: no scripts, frames, inline handlers or javascript:
// links. Images are dropped unless they are absolute: our copy carries the pages'
// text, not their image files. Links between doc pages stay in this view; links off
// the docs open a tab.

import { useEffect, useRef, useState } from "react";
import { loadPage } from "@/lib/docsStore";

function clean(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta, form").forEach((n) => n.remove());
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "src") && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
    if (el.tagName === "IMG" && !/^(https:|data:image\/)/.test(el.getAttribute("src") ?? "")) el.remove();
  });
  return doc.body.innerHTML;
}

/**
 * The element that DEFINES `label`: a block that opens with it in code, then a dash
 * ("<dd><code>double</code> — …"), searched from `start` onward. Else the first code
 * element after `start` whose text is exactly the label. Same shape the server reads
 * (docSearch.ts DEFINITION_LINE), so the line the link was chosen for is the one lit.
 */
function findLine(root: HTMLElement, start: Element | null, label: string): HTMLElement | null {
  if (!label) return null;
  const after = (el: Element) =>
    !start || start === el || !!(start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const codes = [...root.querySelectorAll("code")].filter((c) => c.textContent?.trim() === label && after(c));
  for (const c of codes) {
    const block = c.closest("li, p, dd, dt, td, h2, h3, h4, h5, h6, div") as HTMLElement | null;
    if (!block) continue;
    const text = (block.textContent ?? "").trim();
    if (text.startsWith(label) && /^\s*[—–]/.test(text.slice(label.length))) return block;
  }
  const first = codes[0];
  return first ? ((first.closest("tr, li, p, dd, dt, pre") as HTMLElement | null) ?? first) : null;
}

export default function DocPage({
  slug,
  path,
  label,
  attribution,
  onNavigate,
}: {
  slug: string;
  /** "language/types#Standard_integer_types" */
  path: string;
  /** The link's visible text, the line to highlight. */
  label?: string;
  /** The doc set's credit and licence notice (HTML from the sync's manifest). */
  attribution?: string;
  /** A link to another page of the same docs was clicked. */
  onNavigate: (path: string) => void;
}) {
  const [page, anchor = ""] = path.split("#");
  const [state, setState] = useState<{ key: string; html: string | null; error: boolean }>({
    key: "",
    html: null,
    error: false,
  });
  const key = `${slug}/${page}`;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadPage(slug, page)
      .then((raw) => live && setState({ key, html: clean(raw), error: false }))
      .catch(() => live && setState({ key, html: null, error: true }));
    return () => {
      live = false;
    };
  }, [slug, page, key]);

  const html = state.key === key ? state.html : null;

  // Scroll to the definition and mark it, once the page is in.
  useEffect(() => {
    const root = box.current;
    if (!root || !html) return;
    root.querySelectorAll(".doc-hit").forEach((n) => n.classList.remove("doc-hit"));
    const start = anchor ? root.querySelector(`[id="${CSS.escape(anchor)}"]`) : null;
    const line = findLine(root, start, (label ?? "").replace(/`/g, "").trim());
    if (line) line.classList.add("doc-hit");
    const target = line ?? start;
    if (target) target.scrollIntoView({ block: line ? "center" : "start" });
    else root.scrollTop = 0;
  }, [html, anchor, label]);

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href) return;
    e.preventDefault();
    if (href.startsWith("#")) {
      box.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: "start" });
      return;
    }
    if (/^(https?:|mailto:)/.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    // A page of the same docs, relative to this one ("../types/nullptr_t").
    const next = new URL(href, `https://d.invalid/${page}`);
    onNavigate(next.pathname.slice(1).replace(/\.html$/, "") + next.hash);
  }

  if (state.key === key && state.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-faint">
        This page could not be loaded. Try All entries, or check back after the next docs sync.
      </div>
    );
  }
  return (
    <div ref={box} onClick={onClick} className="doc-page flex-1 overflow-y-auto px-5 py-4">
      {html === null ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {attribution && (
            <div
              className="doc-credit mt-8 border-t border-line pt-3 text-meta text-ink-faint"
              dangerouslySetInnerHTML={{ __html: clean(attribution) }}
            />
          )}
        </>
      )}
    </div>
  );
}
