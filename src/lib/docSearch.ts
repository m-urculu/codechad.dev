// Find the documentation PAGE that explains a term as a lesson uses it — searched in
// the pages' own content, for terms the docs index has no entry for.
//
// Why. Doc links were resolved by entry NAME (docs-index.ts). That works for API
// names — `std::cout` is an entry — and fails for everything a lesson talks about
// in words: "compiler", "linker" and "int" (as in data types) have no entry in
// cppreference, so they went to DevDocs search or nowhere. The page that explains
// them exists (Phases of translation, Fundamental types); finding it needs the
// page text and the lesson's context, not a name match.
//
// How, in two steps:
//   1. Candidates. DevDocs publishes every page of a doc as one db.json
//      (cppreference: ~45 MB, 5,658 pages). Each page's title and index entry
//      names, and the start of its text, are searched for the term and for the
//      words around it in the lesson. A dozen or so candidates come back.
//   2. Choice. One model call per message picks, for each link, the candidate that
//      DEFINES or EXPLAINS the term in that context, or none. None means the link
//      becomes plain text, which beats a link to the wrong page.
//
// Server-only. The search index is built by the docs sync (docsSync.ts) and stored
// with our copy of the docs (docsStore.ts); it is loaded on first use and kept in
// memory. While it is loading, or for a set not synced yet, the caller gets no answer
// and falls back to name matching.

import { getDocSource } from "@/lib/docs";
import { geminiJSON } from "@/lib/agents/llm";
import { loadSearchRows, versionDir } from "@/lib/docsStore";

export type DocRef = { term: string; label: string; context: string };

/** A titled part of a page: its anchor id and the start of its text, case kept (`\n` is not `\N`). */
type Section = { id: string; text: string };
/**
 * A term the page defines, and the section it is defined in ("" = before any section).
 * "dash": "int — basic integer type", the docs' own definition style. "row": the
 * first cell of a table row whose next cell describes it in words — how escape
 * sequences are defined (`\n` | "line feed - new line"). Rows are the weaker kind.
 */
type Definition = { id: string; term: string; kind?: "dash" | "row" };
type Page = { path: string; title: string; head: Set<string>; body: string; sections: Section[]; defs: Definition[] };
type Doc = { pages: Page[]; headDf: Map<string, number> };

const BODY_CHARS = 3000; // the part of a page that says what it is about
const LOAD_WAIT_MS = 8000; // first load of a large doc takes longer; later calls are instant
const SECTION_CHARS = 300; // enough to see whether a section DEFINES a term

const STOP = new Set(
  ("the a an and or of to in for with on is are be how what why it this that as by from into your you its " +
    "use used using can will each every one std").split(" ")
);

/** Words worth matching. Keeps `#include`, `\n`, `<<` and `std::`-free names. */
export function docTokens(s: string): string[] {
  return (s.toLowerCase().match(/#\w+|\\[a-z0]|<<|>>|[a-z_][a-z0-9_]*/g) ?? []).filter(
    (w) => !STOP.has(w) && w.length > 1
  );
}

/** Crude, consistent stemming: "translates", "translation" and "translated" agree. */
export function stem(w: string): string {
  return w.replace(/(ations|ation|ates|ate|ions|ion|ings|ing|ers|er|ed|es|s)$/, "") || w;
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;|&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Build the searchable form of a doc from its pages and its index entries. */
export function buildDoc(
  db: Record<string, string>,
  entries: { name: string; path: string }[]
): Doc {
  const names: Record<string, string[]> = {};
  for (const e of entries) (names[e.path.split("#")[0]] ??= []).push(e.name);
  const pages: Page[] = Object.entries(db).map(([path, html]) => {
    const title = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") || (names[path]?.[0] ?? path);
    const head = new Set(docTokens(`${title} ${(names[path] ?? []).join(" ")}`).map(stem));
    return {
      path,
      title,
      head,
      body: strip(html).slice(0, BODY_CHARS).toLowerCase(),
      sections: sectionsOf(html),
      defs: definitionsOf(html),
    };
  });
  return withDf(pages);
}

/**
 * The definition lines of a page, read from its markup: a block that OPENS with the
 * term in code, then a dash — "<dd><code>double</code> — double precision…", or
 * "</h4><code>int</code> — basic integer type". That is how cppreference defines
 * syntax (651 such lines across it, measured 2026-11), and reading the markup
 * rather than the text is what stops a sentence like "library: …" from counting.
 */
const DEFINITION_LINE =
  /(?:<(?:li|p|dd|dt|td)\b[^>]*>|<\/h[2-6]>)\s*(?:<(?!\/)[^>]+>\s*)*<code>([^<]{1,40})<\/code>\s*(?:<\/[^>]+>\s*)*(?:—|–)/g;

// A table row: first cell is the term in code, the next one starts with words.
const DEFINITION_ROW =
  /<tr[^>]*>\s*<td[^>]*>\s*(?:<(?!\/)[^>]+>\s*)*<code>([^<]{1,40})<\/code>\s*(?:<\/[^>]+>\s*)*<\/td>\s*<td[^>]*>\s*[^<\s]/g;

function definitionsOf(html: string): Definition[] {
  const heads = [...html.matchAll(/<h[2-6][^>]*\bid="([^"]+)"[^>]*>/g)].map((m) => ({ at: m.index ?? 0, id: m[1] }));
  const sectionAt = (at: number) => heads.filter((h) => h.at < at).pop()?.id ?? "";
  const out: Definition[] = [];
  for (const m of html.matchAll(DEFINITION_LINE)) out.push({ id: sectionAt(m.index ?? 0), term: strip(m[1]), kind: "dash" });
  for (const m of html.matchAll(DEFINITION_ROW)) out.push({ id: sectionAt(m.index ?? 0), term: strip(m[1]), kind: "row" });
  return out;
}

/** The page's headings that carry an anchor id, each with the start of what follows it. */
function sectionsOf(html: string): Section[] {
  const heads = [...html.matchAll(/<h[2-6][^>]*\bid="([^"]+)"[^>]*>/g)];
  return heads.map((m, i) => {
    const from = m.index ?? 0;
    const to = heads[i + 1]?.index ?? html.length;
    return { id: m[1], text: strip(html.slice(from, Math.min(to, from + 4000))).slice(0, SECTION_CHARS) };
  });
}

/**
 * The section of a page that DEFINES a term, so a link lands on the definition
 * rather than the top of the page: `int` opens "Standard integer types", where
 * cppreference writes "int — basic integer type".
 *
 * In order: a section that defines the term in the docs' "term — meaning" style; a
 * section whose heading is the term; and, only when the page is not itself about
 * the term, the first section that mentions it. A page about the term (its title
 * names it: "operator<<", "Escape sequences") defines it at the top, before any
 * section, and a "first mention" there is usually an Example. Otherwise "" — the
 * page itself.
 *
 * Words match in any case; symbols only exactly, since `\n` and `\N` differ.
 */
// A term at a word boundary, followed by `tail`: words in any case, symbols exactly.
const termRe = (w: string, tail: string, anyCase = false) =>
  new RegExp(`(^|[\\s(])${escapeRe(w)}${tail}`, anyCase && /^[\w\s]+$/.test(w) ? "i" : "");

export function anchorFor(page: Pick<Page, "sections" | "title" | "defs">, terms: string[]): string {
  const words = terms.map((t) => t.replace(/`/g, "").trim()).filter(Boolean);
  if (!words.length) return "";
  // Exact: syntax is case-sensitive (`const` is not a parameter named `Const`).
  const defined =
    page.defs.find((d) => d.kind !== "row" && words.includes(d.term)) ?? page.defs.find((d) => words.includes(d.term));
  if (defined) return defined.id;
  const mentions = words.map((w) => termRe(w, "(?=[^A-Za-z0-9_]|$)", true));
  const asId = (w: string) => w.toLowerCase().replace(/\s+/g, "_");
  const about = words.some((w) => page.title.toLowerCase().includes(w.toLowerCase()));
  return (
    page.sections.find((s) => words.some((w) => s.id.toLowerCase() === asId(w)))?.id ??
    (about ? undefined : page.sections.find((s) => mentions.some((r) => r.test(s.text)))?.id) ??
    ""
  );
}

function withDf(pages: Page[]): Doc {
  const headDf = new Map<string, number>();
  for (const p of pages) for (const t of p.head) headDf.set(t, (headDf.get(t) ?? 0) + 1);
  return { pages, headDf };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Candidate pages for one reference, from four angles so no single one decides:
 *   - a section that DEFINES the term ("int — basic integer type"): the syntax's
 *     own definition, wherever on the page it sits. This is what finds
 *     Fundamental types for `int`, whose title never says "int" and whose first
 *     mention of it is past the text the other angles read;
 *   - the term in page titles and entry names, helped by the context;
 *   - the term in the page text;
 *   - the context alone, which finds "Phases of translation" for "compiler".
 */
export function candidates(doc: Doc, ref: DocRef, limit = 14): Page[] {
  const { pages, headDf } = doc;
  const idf = (t: string) => Math.log(pages.length / (1 + (headDf.get(t) ?? 0)));
  const tt = docTokens(ref.term).map(stem);
  const ct = docTokens(ref.context).map(stem).filter((t) => !tt.includes(t));
  const top = (score: (p: Page) => number, n: number) =>
    pages
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((x) => x.p);

  const inContext = (p: Page) => ct.reduce((s, t) => s + (p.head.has(t) ? idf(t) : 0), 0);
  const byTitle = top((p) => tt.reduce((s, t) => s + (p.head.has(t) ? 3 * idf(t) : 0), 0) + (tt.length ? inContext(p) : 0), 8);
  const raw = ref.term.toLowerCase().trim();
  const re = raw ? new RegExp(`(^|[^a-z0-9_])${escapeRe(raw)}([^a-z0-9_]|$)`, "g") : null;
  const byBody = re
    ? top((p) => {
        const n = (p.body.slice(0, 600).match(re)?.length ?? 0) * 2 + (p.body.match(re)?.length ?? 0);
        return n ? Math.log(1 + n) + 0.5 * inContext(p) : 0;
      }, 6)
    : [];
  const byContext = top(inContext, 5);
  const term = ref.term.replace(/`/g, "").trim();
  const byDefinition = term
    ? top((p) => {
        const n = p.defs.filter((d) => d.term === term && d.kind !== "row").length;
        return n ? n + inContext(p) : 0;
      }, 5)
    : [];

  const seen = new Set<string>();
  return [...byDefinition, ...byTitle, ...byBody, ...byContext]
    .filter((p) => !seen.has(p.path) && (seen.add(p.path), true))
    .slice(0, limit);
}

// ---------- loading ----------

const docs = new Map<string, Promise<Doc>>();

/** Rows the sync stores as search.json (docsSync.ts), one per page. */
type Row = [string, string, string[], string, [string, string][], [string, string, string?][]];

/** The stored form of a doc's search index. */
export function serializeDoc(doc: Doc): Row[] {
  return doc.pages.map((p) => [
    p.path,
    p.title,
    [...p.head],
    p.body,
    p.sections.map((x) => [x.id, x.text]),
    p.defs.map((d) => [d.id, d.term, d.kind === "row" ? "row" : undefined]),
  ]);
}

export function parseDoc(rows: Row[]): Doc {
  return withDf(
    rows.map(([path, title, head, body, sections, defs]) => ({
      path,
      title,
      head: new Set(head),
      body,
      sections: sections.map(([id, text]) => ({ id, text })),
      defs: defs.map(([id, term, kind]) => ({ id, term, kind: kind === "row" ? "row" : "dash" })),
    }))
  );
}

// From our own copy (docsStore.ts), built by the sync — never from DevDocs at
// request time. A set that has not been synced yet has no search: links then fall
// back to name matching.
async function loadDoc(slug: string): Promise<Doc> {
  const rows = await loadSearchRows<Row[]>(slug);
  if (!rows) throw new Error(`docs ${slug} not synced`);
  return parseDoc(rows);
}

/** The doc, if it is ready within LOAD_WAIT_MS. Keeps loading in the background either way. */
async function docFor(slug: string): Promise<Doc | null> {
  // Keyed by the synced version, so a new sync is picked up without a restart; the
  // version a set replaces is dropped from memory.
  const dir = await versionDir(slug);
  if (!dir) return null;
  let p = docs.get(dir);
  if (!p) {
    for (const k of docs.keys()) if (k.startsWith(`${dir.split("/")[0]}/`)) docs.delete(k);
    p = loadDoc(slug);
    p.catch(() => docs.delete(dir)); // retry on a later call
    docs.set(dir, p);
  }
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), LOAD_WAIT_MS));
  return Promise.race([p.catch(() => null), timeout]);
}

// ---------- choosing ----------

/**
 * For each reference, the page that explains it in context, as "@path" (the form
 * a doc link carries a page in), or null for "no page fits — do not link".
 * One model call covers every reference in a message.
 */
export async function findDocPages(
  moduleId: string | null | undefined,
  refs: DocRef[]
): Promise<(string | null)[]> {
  const none = refs.map(() => null);
  const src = getDocSource(moduleId);
  if (!refs.length || !src || src.kind !== "devdocs") return none;
  const doc = await docFor(src.slug);
  if (!doc) return none;

  const link = (page: Page, r: DocRef) => {
    // Land on the definition inside the page, not its top. The visible text first:
    // it is the syntax itself (`int`), where the target is often a description.
    const anchor = anchorFor(page, [r.label, r.term]);
    return `@${page.path}${anchor ? `#${anchor}` : ""}`;
  };

  // 1) A page that DEFINES the visible syntax ("bool — integer type, capable of
  //    holding…") is the answer, chosen in code: the same link every time, and no
  //    model call. Most syntax links in a lesson are settled here.
  const out: (string | null)[] = refs.map((r) => {
    const page = definitionPage(doc, r);
    return page ? link(page, r) : null;
  });
  const rest = refs.map((_, i) => i).filter((i) => !out[i]);
  if (!rest.length) return out;

  // 2) The rest — concepts in words ("compiler"), symbols the docs never define in
  //    that style (`<<`) — go to the model. Searched by both the link's target and
  //    its visible text: the target is often a made-up name ("Data types",
  //    "Insertion operator") while the text is the real syntax.
  const lists = new Map<number, Page[]>();
  for (const i of rest) {
    const r = refs[i];
    const seen = new Set<string>();
    lists.set(
      i,
      [...candidates(doc, r), ...(r.label && r.label !== r.term ? candidates(doc, { ...r, term: r.label }) : [])]
        .filter((p) => !seen.has(p.path) && (seen.add(p.path), true))
        .slice(0, 20)
    );
  }
  const listing = rest
    .map(
      (i) =>
        `REFERENCE "r${i}": "${refs[i].label}" (term: ${refs[i].term})\nCONTEXT: ${refs[i].context.slice(0, 400)}\nCANDIDATES:\n` +
        lists.get(i)!.map((p, j) => `  ${j}. ${p.title} — ${p.body.slice(0, 140)}`).join("\n")
    )
    .join("\n\n");
  const reply = await geminiJSON<{ picks?: Record<string, unknown> }>(
    `You link terms in a ${src.label} lesson to the documentation page a learner should read.\n` +
      `For each reference, pick the candidate page that DEFINES or EXPLAINS the term as it is used in its context. ` +
      `Prefer the page about the concept itself over pages that merely mention it or apply it to something else, ` +
      `and over listing pages such as "keyword: X" or indexes, which only point elsewhere: for a type, the page that defines the type. ` +
      `If no candidate explains it, answer -1 — no link is better than a wrong one.\n\n` +
      `${listing}\n\nReturn ONLY JSON {"picks": {"r<number>": candidate number or -1, ...}} with one key per reference, ` +
      `each choosing from THAT reference's own candidate list.`
  ).catch(() => null);

  // Keyed by reference, so one skipped or extra answer cannot shift every pick after it.
  const picks = reply?.picks && typeof reply.picks === "object" ? reply.picks : {};
  for (const i of rest) {
    const j = Number((picks as Record<string, unknown>)[`r${i}`]);
    const page = Number.isInteger(j) && j >= 0 ? lists.get(i)![j] : undefined;
    out[i] = page ? link(page, refs[i]) : null;
  }
  return out;
}

/**
 * The page whose section defines the link's visible syntax in the docs' own
 * "term — meaning" style, the best one by how many of its sections do and how well
 * it fits the context. Null when the docs never define it that way, or when the
 * text is a phrase rather than syntax.
 */
export function definitionPage(doc: Doc, ref: DocRef): Page | null {
  const term = (ref.label || ref.term).replace(/`/g, "").trim();
  if (!term || term.length > 40 || /\s{2,}/.test(term)) return null;
  const ct = docTokens(ref.context).map(stem);
  const idf = (t: string) => Math.log(doc.pages.length / (1 + (doc.headDf.get(t) ?? 0)));
  let best: Page | null = null;
  let bestScore = 0;
  for (const p of doc.pages) {
    const n = p.defs.filter((d) => d.term === term && d.kind !== "row").length;
    if (!n) continue;
    const score = n + ct.reduce((s, t) => s + (p.head.has(t) ? idf(t) : 0), 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

// ---------- linking inline code ----------

const FENCED = /```[\s\S]*?(?:```|$)/g;
const MD_LINK = /\[[^\]]*\]\([^)]*\)/g;
const CODE_SPAN = /`([^`\n]{1,40})`/g;

/**
 * Link the inline code in a tutor message to where the docs define it — `int` to
 * "int — basic integer type" — in code, with no model call.
 *
 * Fenced blocks and code already inside a link are left alone, and only the first
 * use of a term in a message is linked, so a paragraph about `std::cout` is not a
 * wall of links. A span the docs do not define or name stays plain code: inline
 * code is also used for values and output (`Hello, C++!`), and those must not
 * become links.
 *
 * `resolveName` is the exact-entry lookup (docs-index.ts canonicalDocTerm), passed
 * in so this file stays free of the browser-side index.
 */
export async function linkInlineCode(
  text: string,
  moduleId: string | null | undefined,
  resolveName: (term: string) => Promise<string | null>
): Promise<string> {
  const src = getDocSource(moduleId);
  if (!src || src.kind !== "devdocs" || !text.includes("`")) return text;
  const doc = await docFor(src.slug);

  // Mask what must not be touched, remembering it to put back.
  const kept: string[] = [];
  const mask = (s: string) => `\u0000${kept.push(s) - 1}\u0000`;
  const masked = text.replace(FENCED, mask).replace(MD_LINK, mask);

  const terms = [...new Set([...masked.matchAll(CODE_SPAN)].map((m) => m[1].trim()))];
  const targets = new Map<string, string>();
  await Promise.all(
    terms.map(async (term) => {
      // Strongest first: a definition; an exact docs entry; a table row on one page.
      const target =
        (doc && definitionTarget(doc, term)) ||
        (await resolveName(term).catch(() => null)) ||
        (doc && rowTarget(doc, term));
      if (target) targets.set(term, target);
    })
  );

  const linked = new Set<string>();
  const out = masked.replace(CODE_SPAN, (whole, raw: string) => {
    const term = raw.trim();
    const target = targets.get(term);
    if (!target || linked.has(term)) return whole;
    linked.add(term);
    return `[${whole}](<doc:${target}>)`;
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]);
}

/** "@path#section" of the page that defines exactly `term` ("term — …"), or null. */
export function definitionTarget(doc: Doc, term: string): string | null {
  let best: { page: Page; id: string; n: number } | null = null;
  for (const p of doc.pages) {
    const defs = p.defs.filter((d) => d.term === term && d.kind !== "row");
    if (defs.length && (!best || defs.length > best.n)) best = { page: p, id: defs[0].id, n: defs.length };
  }
  return best ? `@${best.page.path}${best.id ? `#${best.id}` : ""}` : null;
}

/**
 * "@path#section" of the one page whose table describes `term` in its first column
 * (`\n` on Escape sequences), or null — also null when several pages do, since a
 * table row alone cannot say which of them is the term's home.
 */
export function rowTarget(doc: Doc, term: string): string | null {
  let found: { page: Page; id: string } | null = null;
  for (const p of doc.pages) {
    const d = p.defs.find((x) => x.term === term && x.kind === "row");
    if (!d) continue;
    if (found) return null; // more than one page: ambiguous
    found = { page: p, id: d.id };
  }
  return found ? `@${found.page.path}${found.id ? `#${found.id}` : ""}` : null;
}
