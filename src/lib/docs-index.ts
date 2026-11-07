// Resolve a documentation TERM (an API/method/concept name the assistant references
// inline, e.g. "Array.prototype.map") to a page of our own copy of the docs for the
// active module (docsStore.ts): its entries are loaded once per doc set, cached
// (memory + localStorage, keyed by version), and the term is mapped to the entry's
// exact path, section included. Nothing here talks to DevDocs.

import { getDocSource } from "./docs";
import { hasPage, loadEntries, versionDir } from "./docsStore";

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
  // Keyed by the synced version, so a new sync is picked up and nothing goes stale.
  const dir = await versionDir(slug);
  if (!dir) throw new Error(`docs ${slug} not synced`);
  const lsKey = `docs-index-v3:${dir}`;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) return buildIndex(JSON.parse(raw) as [string, string][]);
    } catch {
      /* ignore corrupt cache */
    }
  }

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const e of await loadEntries(slug)) {
    if (!e?.name || !e?.path) continue;
    const full = norm(e.name);
    if (!full || seen.has(full)) continue;
    seen.add(full);
    pairs.push([full, e.path]);
  }

  if (typeof window !== "undefined") {
    try {
      // One version per doc set: drop the ones this replaces.
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(`docs-index-v3:${slug}/`) || k?.startsWith(`devdocs-index-v2:${slug}`)) {
          window.localStorage.removeItem(k);
        }
      }
      window.localStorage.setItem(lsKey, JSON.stringify(pairs));
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

// Does the PAGE behind an index path exist in our copy? An index can name a page
// the docs no longer have; the page map the sync writes is the authority.
function verifyPage(slug: string, path: string): Promise<boolean> {
  return hasPage(slug, path);
}

// The spellings a generated term arrives in that the index spells differently:
// `<iostream>` for "iostream", `cout` for "std::cout", `print()` for "print".
// Measured against the C++ index (2026-11): these three account for most misses.
function spellings(term: string): string[] {
  const t = term.trim();
  const bare = t.replace(/^<(.+)>$/, "$1").replace(/\s*\(\s*\)$/, "");
  const out = [t, bare];
  if (/^std::/.test(bare)) out.push(bare.slice(5));
  else if (/^[A-Za-z_]\w*$/.test(bare)) out.push(`std::${bare}`);
  return [...new Set(out.filter(Boolean))];
}

/**
 * The index's own name for a term, if the docs really have it — the term itself,
 * one of its usual misspellings, or one of `alternatives` (the link text, a syntax
 * token). The page behind it is checked too. Null means: do not link this.
 *
 * Used when a message is GENERATED, on the server, so a link that goes nowhere is
 * fixed or removed before anyone sees it. The render-time check below stays as the
 * second line, in the chat, for messages saved before this existed.
 */
export async function canonicalDocTerm(
  moduleId: string | null | undefined,
  term: string,
  alternatives: string[] = []
): Promise<string | null> {
  const src = getDocSource(moduleId);
  if (!src || src.kind !== "devdocs") return null;
  // "@path": a page chosen by content search (docSearch.ts). Only its existence is
  // left to check.
  if (term.startsWith("@")) {
    return (await verifyPage(src.slug, term.slice(1))) ? term : null;
  }
  const tried = new Set<string>();
  for (const candidate of [term, ...alternatives].flatMap(spellings)) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    try {
      const path = await lookupPath(src.slug, candidate);
      if (path && (await verifyPage(src.slug, path))) return norm(candidate);
    } catch {
      return null; // index unreachable: link nothing rather than guess
    }
  }
  return null;
}

// A doc link, and the look-alikes the model writes instead of `doc:` —
// `<cppreference:io/cout>`, `<mdn:Array>` — which nothing else would resolve. Any
// scheme but a real web or mail link is treated as a doc link and checked.
const DOC_LINK = /\[([^\]]*)\]\(<?(?!https?:|mailto:)[a-z][\w+.-]*:([^)>]*)>?\)/gi;

/**
 * Rewrite a message's doc links with where they were placed: `placed` maps a link's
 * target as written to its new target, or to null to make it plain text. Used to
 * save placements INTO the message, so each link is placed once, not every time the
 * message is shown.
 */
export function rewriteDocLinks(text: string, placed: Map<string, string | null>): string {
  return text.replace(DOC_LINK, (whole, label: string, target: string) => {
    if (!placed.has(target)) return whole;
    const next = placed.get(target);
    return next ? `[${label}](<doc:${next}>)` : label;
  });
}

/**
 * A link's target, when it can be trusted without a content search: a page already
 * chosen by one ("@path"), or an entry name that the link's own TEXT also names —
 * [`std::cout`](std::cout). When the text is syntax and the target a description,
 * [`int`](Data types), a name match only finds the top of some page, so it is not
 * trusted: the content search finds the section that defines the syntax.
 */
export async function confidentDocTarget(
  moduleId: string | null | undefined,
  term: string,
  label: string
): Promise<string | null> {
  if (term.startsWith("@")) return canonicalDocTerm(moduleId, term);
  const name = await canonicalDocTerm(moduleId, term);
  if (!name) return null;
  const text = label.replace(/`/g, "").trim();
  return !text || (await canonicalDocTerm(moduleId, text)) === name ? name : null;
}

/** A reference the name lookup could not place, for a content search to try. */
export type UnresolvedRef = { term: string; label: string; context: string };

/**
 * Check every doc link in a generated message against the module's real docs.
 *
 * A link whose target or text names a real entry is pointed at that entry. The
 * rest go to `findPages` if one is given — the server's content search
 * (docSearch.ts), which returns "@path" for the page that explains the term in
 * context, or null. Anything still unplaced becomes plain text, so a link that
 * would go to the wrong page, or to a search, is never shown.
 */
export async function validateDocLinks(
  text: string,
  moduleId: string | null | undefined,
  opts: { context?: string; findPages?: (refs: UnresolvedRef[]) => Promise<(string | null)[]> } = {}
): Promise<string> {
  // Code blocks first: nothing renders inside one, so a doc link the model wrote there
  // shows as raw `[x](<doc:…>)` text. It becomes its label, and the block is set
  // aside so the checks below never touch code.
  const blocks: string[] = [];
  const outside = text.replace(FENCED_BLOCK, (block) =>
    `\u0000${blocks.push(block.replace(DOC_LINK, (_w, label: string) => label)) - 1}\u0000`
  );
  const checked = await validateLinksOutsideCode(outside, moduleId, opts);
  return checked.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]);
}

const FENCED_BLOCK = /```[\s\S]*?(?:```|$)/g;

async function validateLinksOutsideCode(
  text: string,
  moduleId: string | null | undefined,
  opts: { context?: string; findPages?: (refs: UnresolvedRef[]) => Promise<(string | null)[]> }
): Promise<string> {
  const links = [...text.matchAll(DOC_LINK)];
  if (!links.length) return text;
  // Without a content search (findPages), a plain name match is the best there is.
  const named = await Promise.all(
    links.map(([, label, target]) =>
      opts.findPages
        ? confidentDocTarget(moduleId, target, label)
        : canonicalDocTerm(moduleId, target, [label.replace(/`/g, "")])
    )
  );
  const misses = links.map((_, i) => i).filter((i) => !named[i]);
  const found: (string | null)[] = links.map(() => null);
  if (misses.length && opts.findPages) {
    const refs = misses.map((i) => {
      const [whole, label, target] = links[i];
      const at = links[i].index ?? 0;
      // The sentence around the link is what says which sense of the term is meant.
      const around = text.slice(Math.max(0, at - 200), at + whole.length + 200).replace(DOC_LINK, "$1");
      return { term: target, label: label.replace(/`/g, ""), context: `${opts.context ?? ""} ${around}`.trim() };
    });
    const pages = await opts.findPages(refs).catch(() => refs.map(() => null));
    misses.forEach((i, k) => (found[i] = pages[k] ?? null));
  }
  let out = text;
  links.forEach(([whole, label], i) => {
    const target = named[i] ?? found[i];
    out = out.replace(whole, target ? `[${label}](<doc:${target}>)` : label);
  });
  return out;
}

// Resolve `term` to a page of `moduleId`'s docs — "language/types#Standard_integer_types"
// — or null when it cannot be placed, or the module has no docs of ours.
//
// Every path this returns names a page our copy has. Anything else returns null and
// the pane stays where it is: there is no search fallback, which used to open
// whatever ranked first ("Data types" opened "Data-parallel types").
export async function resolveDocPath(
  moduleId: string | null | undefined,
  term: string
): Promise<string | null> {
  const src = getDocSource(moduleId);
  if (!src || src.kind !== "devdocs") return null;
  const t = (term ?? "").trim();
  if (!t) return null;
  // A page chosen by content search ("@path#section").
  if (t.startsWith("@")) return (await verifyPage(src.slug, t.slice(1))) ? t.slice(1) : null;
  try {
    const path = await lookupPath(src.slug, t);
    if (path && (await verifyPage(src.slug, path))) return path;
  } catch {
    /* docs not synced, or unreachable */
  }
  return null;
}
