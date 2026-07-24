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
const memCache = new Map<string, Promise<Map<string, string>>>(); // slug -> (normName -> path)

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

async function loadIndex(slug: string): Promise<Map<string, string>> {
  const lsKey = `devdocs-index:${slug}`;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { t: number; e: [string, string][] };
        if (parsed && Date.now() - parsed.t < LS_TTL_MS) return new Map(parsed.e);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  const res = await fetch(`https://documents.devdocs.io/${slug}/index.json`);
  if (!res.ok) throw new Error(`index ${slug} ${res.status}`);
  const data = (await res.json()) as { entries?: Entry[] };

  const map = new Map<string, string>();
  for (const e of data.entries ?? []) {
    if (!e?.name || !e?.path) continue;
    const full = norm(e.name);
    if (full && !map.has(full)) map.set(full, e.path);
    // Also index the trailing segment so "array.prototype.map", "array.map()" and "map"
    // all resolve. First writer wins, so the shortest/earliest entry owns a bare segment.
    const seg = full.includes(".") ? full.split(".").pop() : undefined;
    if (seg && !map.has(seg)) map.set(seg, e.path);
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), e: [...map.entries()] }));
    } catch {
      /* quota — fine to skip persistence */
    }
  }
  return map;
}

function ensureIndex(slug: string): Promise<Map<string, string>> {
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

// Resolve `term` to a DevDocs URL for `moduleId`, or null when the module has no
// embeddable DevDocs source (the external-doc modules — links are suppressed there).
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
    const map = await ensureIndex(slug);
    const n = norm(t);
    let path = map.get(n);
    if (!path) {
      const seg = n.includes(".") ? n.split(".").pop() : n.includes(" ") ? n.split(" ").pop() : undefined;
      if (seg) path = map.get(seg);
    }
    if (path) return `${base}${path}`;
  } catch {
    /* index unavailable — fall through to search */
  }
  // Fallback: DevDocs in-doc search pre-filled with the term.
  return `${base}#q=${encodeURIComponent(t)}`;
}
