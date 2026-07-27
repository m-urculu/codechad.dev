// Resolve a documentation TERM (an API/method/concept name the assistant references
// inline, e.g. "Array.prototype.map") to a concrete DevDocs URL for the active module.
//
// DevDocs publishes a per-doc index at documents.devdocs.io/<slug>/index.json
// ({entries:[{name, path, type}]}) with CORS `*`, so we fetch it once per slug, cache it
// (memory + localStorage), and map the term to the entry's exact path — yielding a real
// deep link to that section. Unresolved terms fall back to DevDocs' in-doc search.

import { getDocSource, devdocsUrl } from "./docs";

type Entry = { name: string; path: string; type?: string };

const LS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const memCache = new Map<string, Promise<DocIndex>>(); // slug -> parsed index

// Normalize a name/term for matching: lowercase, drop call parens/punctuation, collapse ws.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(\)/g, "")
    .replace(/[()`;]/g, "")
    .replace(/^[.#]+/, "")
    .trim()
    .replace(/\s+/g, " ");
}

// One doc's index: exact names, plus every name grouped by its trailing segment so a
// partially-qualified term can still be matched — but only against a candidate whose
// own name agrees with the qualifier the term supplied. See `lookupPath`.
type DocIndex = {
  byName: Map<string, string>;   // "json.dumps" -> "library/json#json.dumps"
  bySegment: Map<string, string[]>; // "dumps" -> ["json.dumps", …]
};

function buildIndex(pairs: [string, string][]): DocIndex {
  const byName = new Map(pairs);
  const bySegment = new Map<string, string[]>();
  for (const [name] of pairs) {
    if (!name.includes(".")) continue;
    const seg = name.split(".").pop()!;
    const list = bySegment.get(seg);
    if (list) list.push(name);
    else bySegment.set(seg, [name]);
  }
  return { byName, bySegment };
}

async function loadIndex(slug: string): Promise<DocIndex> {
  // v2: the cached shape changed when segment matching was tightened. A stale v1 blob
  // would resolve terms the old, loose way for up to a fortnight.
  const lsKey = `devdocs-index-v2:${slug}`;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { t: number; e: [string, string][] };
        if (parsed && Date.now() - parsed.t < LS_TTL_MS) return buildIndex(parsed.e);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  const res = await fetch(`https://documents.devdocs.io/${slug}/index.json`);
  if (!res.ok) throw new Error(`index ${slug} ${res.status}`);
  const data = (await res.json()) as { entries?: Entry[] };

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const e of data.entries ?? []) {
    if (!e?.name || !e?.path) continue;
    const full = norm(e.name);
    if (!full || seen.has(full)) continue;
    seen.add(full);
    pairs.push([full, e.path]);
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), e: pairs }));
    } catch {
      /* quota — fine to skip persistence */
    }
  }
  return buildIndex(pairs);
}

function ensureIndex(slug: string): Promise<DocIndex> {
  let p = memCache.get(slug);
  if (!p) {
    p = loadIndex(slug).catch((err) => {
      memCache.delete(slug); // allow retry on a later click
      throw err;
    });
    memCache.set(slug, p);
  }
  return p;
}

// Look a term up in the index. Returns the entry PATH ("glossary#term-CPython") or null.
// Pure index work — no network beyond the one cached index fetch.
//
// Matching is deliberately conservative about QUALIFIED terms. The old rule accepted any
// entry sharing the term's last segment, which is how "Array.prototype.map" — a
// JavaScript name the generator emitted into a Python lesson — resolved to Python's
// `concurrent.futures.Executor.map`. That is worse than a broken link: the page loads,
// looks authoritative, and is about something else entirely. A qualified term now has to
// agree with the entry on the OWNER as well as the member, and anything short of that
// degrades to search.
async function lookupPath(slug: string, term: string): Promise<string | null> {
  const { byName, bySegment } = await ensureIndex(slug);
  const n = norm(term);

  const direct = byName.get(n);
  if (direct) return direct;

  // `prototype` is a JavaScript spelling detail, not part of the name: DevDocs indexes
  // "Array.map", while the generator (and MDN prose) says "Array.prototype.map". Dropping
  // it is what lets the owner check below compare like with like.
  const parts = (n.includes(".") ? n.split(".") : n.includes(" ") ? n.split(" ") : [n]).filter(
    (p) => p !== "prototype"
  );
  const seg = parts[parts.length - 1];
  if (!seg) return null;

  // Unqualified ("print", "len"): the bare name is the whole claim, so an entry that
  // owns that name outright is the right answer.
  if (parts.length === 1) return byName.get(seg) ?? null;

  // Qualified ("json.dumps", "list.append"): require the owner to line up. "list.append"
  // must not land on "array.array.append".
  const owner = parts[parts.length - 2];
  const candidates = bySegment.get(seg) ?? [];
  const agreeing = candidates.find((name) => {
    const p = name.split(".");
    return p.length >= 2 && p[p.length - 2] === owner;
  });
  return agreeing ? byName.get(agreeing) ?? null : null;
}

// Does the PAGE behind an index path actually exist?
//
// The index is a snapshot and the site is not: a path can be in index.json and 404 on
// devdocs.io, which is what a "link to nowhere" is — the pane loads and shows DevDocs'
// own "Page not found" instead of the section. DevDocs serves each page as
// documents.devdocs.io/<slug>/<page>.html with `access-control-allow-origin: *`
// (200 for real pages, 403 for missing ones), so this is checkable from the browser.
// Verified 2026-07: glossary -> 200, nonexistent-page -> 403.
const pageOk = new Map<string, Promise<boolean>>();
function verifyPage(slug: string, path: string): Promise<boolean> {
  // The fragment is an in-page anchor; the document is everything before it.
  const page = path.split("#")[0];
  const key = `${slug}/${page}`;
  let p = pageOk.get(key);
  if (!p) {
    p = fetch(`https://documents.devdocs.io/${key}.html`, { method: "GET" })
      .then((r) => r.ok)
      // A 403 has no CORS header, so it surfaces as a network error rather than a
      // response — same conclusion either way: do not send the learner there.
      .catch(() => false);
    pageOk.set(key, p);
  }
  return p;
}

/**
 * Is `term` a link we can honour for this module? Used at RENDER time, so a term the
 * docs do not carry is never shown as a clickable link in the first place.
 *
 * Index-only: no per-link network requests. Once the index is cached this is
 * synchronous work behind a resolved promise.
 */
export async function canResolveDocTerm(
  moduleId: string | null | undefined,
  term: string
): Promise<boolean> {
  const src = getDocSource(moduleId);
  if (!src || src.kind !== "devdocs") return false;
  const t = (term ?? "").trim();
  if (!t) return false;
  try {
    return (await lookupPath(src.slug, t)) !== null;
  } catch {
    return false; // index unavailable — better a plain word than a dead link
  }
}

// Resolve `term` to a DevDocs URL for `moduleId`, or null when the module has no
// embeddable DevDocs source (the external-doc modules — links are suppressed there).
//
// Every deep link this returns has been checked twice: the term is in the index, AND
// the page it points at really exists. Anything else degrades to DevDocs' in-doc
// search, which always lands somewhere useful, rather than to a 404.
export async function resolveDocUrl(
  moduleId: string | null | undefined,
  term: string
): Promise<string | null> {
  const src = getDocSource(moduleId);
  if (!src || src.kind !== "devdocs") return null;
  const slug = src.slug;
  const base = devdocsUrl(slug);
  const t = (term ?? "").trim();
  if (!t) return base;

  try {
    const path = await lookupPath(slug, t);
    if (path && (await verifyPage(slug, path))) return `${base}${path}`;
  } catch {
    /* index unavailable — fall through to search */
  }
  // Fallback: DevDocs in-doc search pre-filled with the term.
  return `${base}#q=${encodeURIComponent(t)}`;
}
