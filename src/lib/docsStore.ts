// Our own copy of the documentation, read from Supabase Storage.
//
// Why a copy. The Docs pane used to embed devdocs.io, and doc links fetched from
// documents.devdocs.io: every click reloaded another site's app, the app could not
// reach inside it, and the product depended on a third party staying up and keeping
// its URLs. The docs are now downloaded from DevDocs' published data, kept current
// by a daily sync (src/lib/docsSync.ts), and served from the project's own storage.
//
// Layout of the public `docs` bucket:
//   manifest.json                    which version of each doc set is current, + credits
//   <slug>/<mtime>/index.json.gz     the entries: [{ name, path, type }]
//   <slug>/<mtime>/pages.json.gz     page -> bundle number
//   <slug>/<mtime>/b/<n>.json.gz     a bundle of pages: { page: html }, ~300 KB before gzip
//   <slug>/<mtime>/search.json.gz    the server's search index (docSearch.ts)
//
// Everything but the manifest is stored gzipped (about a fifth of the size: ~40 MB
// for the 14 sets instead of ~200) and unpacked on read with DecompressionStream,
// which browsers and Node both have — storage serves files as they are stored.
//
// A version folder is written completely before the manifest points at it, and the
// old one is deleted only after, so a reader never sees a half-written set.
//
// Shared by the browser and the server: everything here is a public read.

export const DOCS_BUCKET = "docs";

export type DocEntry = { name: string; path: string; type?: string };

export type DocVersion = {
  /** DevDocs' own version stamp for the set; the folder name. */
  mtime: number;
  release?: string;
  name: string;
  /** DevDocs' credit line for the set, as HTML: source, copyright, licence. */
  attribution: string;
  syncedAt: string;
  /**
   * The folder holding this version. Each sync writes a fresh one: files under a
   * folder are cached as never changing, so rewriting one in place (a forced
   * re-sync) would keep serving the old files.
   */
  dir?: string;
};

export type DocsManifest = { version: 1; docs: Record<string, DocVersion> };

/** Public URL of a file in the bucket, or null when storage is not configured. */
export function docsFileUrl(file: string): string | null {
  const base = process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/${DOCS_BUCKET}/${file}` : null;
}

async function getJson<T>(file: string, fresh = false): Promise<T> {
  const url = docsFileUrl(file);
  if (!url) throw new Error("docs storage is not configured");
  // The manifest changes when a sync lands; everything under a version folder never
  // changes, so it can be cached as long as the browser likes.
  const res = await fetch(url, fresh ? { cache: "no-store" } : undefined);
  if (!res.ok || !res.body) throw new Error(`docs ${file}: ${res.status}`);
  if (!file.endsWith(".gz")) return res.json() as Promise<T>;
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text) as T;
}

// ---------- reading (memoized per page load / server process) ----------

const MANIFEST_TTL_MS = 10 * 60 * 1000;
let manifest: { at: number; p: Promise<DocsManifest | null> } | null = null;

/** The current manifest, or null when nothing has been synced yet. */
export function loadManifest(): Promise<DocsManifest | null> {
  if (!manifest || Date.now() - manifest.at > MANIFEST_TTL_MS) {
    const p = getJson<DocsManifest>("manifest.json", true).catch(() => null);
    manifest = { at: Date.now(), p };
  }
  return manifest.p;
}

/**
 * A doc set's folder in the bucket. Storage keys cannot contain "~", which DevDocs
 * uses in versioned set names ("python~3.13"), so it becomes "--" ("python--3.13").
 */
export function setDir(slug: string, mtime: number, build?: number): string {
  return `${slug.replace(/~/g, "--")}/${mtime}${build ? `-${build}` : ""}`;
}

/** The folder of a doc set's current version ("cpp/1786924800"), or null if not synced. */
export async function versionDir(slug: string): Promise<string | null> {
  const v = (await loadManifest())?.docs[slug];
  return v ? v.dir ?? setDir(slug, v.mtime) : null;
}

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    p.catch(() => memo.delete(key)); // let a later call retry
    memo.set(key, p);
  }
  return p;
}

/** A doc set's entries. Throws when the set is not synced. */
export async function loadEntries(slug: string): Promise<DocEntry[]> {
  const dir = await versionDir(slug);
  if (!dir) throw new Error(`docs ${slug} not synced`);
  return once(`${dir}/index.json.gz`, () => getJson<DocEntry[]>(`${dir}/index.json.gz`));
}

async function pageMap(dir: string): Promise<Record<string, number>> {
  return once(`${dir}/pages.json.gz`, () => getJson<Record<string, number>>(`${dir}/pages.json.gz`));
}

/** Does this page exist in our copy? `path` may carry a "#section". */
export async function hasPage(slug: string, path: string): Promise<boolean> {
  const dir = await versionDir(slug);
  if (!dir) return false;
  try {
    return (await pageMap(dir))[path.split("#")[0]] !== undefined;
  } catch {
    return false;
  }
}

/** A page's HTML from our copy. Throws when it is missing. */
export async function loadPage(slug: string, path: string): Promise<string> {
  const dir = await versionDir(slug);
  if (!dir) throw new Error(`docs ${slug} not synced`);
  const page = path.split("#")[0];
  const n = (await pageMap(dir))[page];
  if (n === undefined) throw new Error(`no page ${page}`);
  const bundle = await once(`${dir}/b/${n}.json.gz`, () => getJson<Record<string, string>>(`${dir}/b/${n}.json.gz`));
  const html = bundle[page];
  if (html === undefined) throw new Error(`no page ${page}`);
  return html;
}

/** The server's search rows for a doc set (see docSearch.ts), or null if not synced. */
export async function loadSearchRows<T>(slug: string): Promise<T | null> {
  const dir = await versionDir(slug);
  if (!dir) return null;
  return getJson<T>(`${dir}/search.json.gz`).catch(() => null);
}
