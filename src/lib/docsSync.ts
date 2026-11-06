// Keep our copy of the documentation current (see docsStore.ts for the layout).
//
// DevDocs publishes a catalogue of every doc set with a version stamp (`mtime`), and
// each set as one db.json (every page's HTML) plus an index.json (its entries). A
// sync compares the catalogue with our manifest and, for each set that changed:
//   1. downloads it,
//   2. writes a complete new version folder — entries, pages in ~300 KB bundles,
//      the page map, and the server's search index,
//   3. points the manifest at it,
//   4. deletes the previous folder.
// Readers follow the manifest, so they see the old version or the new one, never a
// half-written set. A set that fails keeps its old version.
//
// Runs on the server with the service-role key: from the daily cron route, or by
// hand (npm run sync:docs). Nothing here is reachable from the browser.

import "server-only";
import { gzipSync } from "node:zlib";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { devdocsSlugs } from "@/lib/docs";
import { buildDoc, serializeDoc } from "@/lib/docSearch";
import { DOCS_BUCKET, setDir, type DocEntry, type DocsManifest, type DocVersion } from "@/lib/docsStore";

const CATALOGUE = "https://devdocs.io/docs.json";
const SOURCE = "https://documents.devdocs.io";
const BUNDLE_CHARS = 300_000;
const UPLOADS_AT_ONCE = 8;
const IMMUTABLE = "31536000"; // a version folder never changes
const MANIFEST_CACHE = "60";

type CatalogueEntry = { slug: string; name: string; release?: string; mtime: number; attribution?: string };

export type SyncResult = { slug: string; status: "current" | "updated" | "failed" | "skipped"; detail?: string };

async function ensureBucket(): Promise<void> {
  const { data } = await supabase.storage.getBucket(DOCS_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(DOCS_BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) throw new Error(`create bucket: ${error.message}`);
}

async function readManifest(): Promise<DocsManifest> {
  const { data } = await supabase.storage.from(DOCS_BUCKET).download("manifest.json");
  if (!data) return { version: 1, docs: {} };
  try {
    return JSON.parse(await data.text()) as DocsManifest;
  } catch {
    return { version: 1, docs: {} };
  }
}

/** Upload JSON; a path ending in .gz is stored gzipped (see docsStore.ts). */
async function put(path: string, value: unknown, cacheControl = IMMUTABLE): Promise<void> {
  const json = JSON.stringify(value);
  const gz = path.endsWith(".gz");
  const body = gz
    ? new Blob([new Uint8Array(gzipSync(json))], { type: "application/gzip" })
    : new Blob([json], { type: "application/json" });
  const { error } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, body, { upsert: true, contentType: gz ? "application/gzip" : "application/json", cacheControl });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

async function inPool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    })
  );
}

/** Every file under a folder (storage lists one level at a time). */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).list(dir, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${dir}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...(await listFiles(path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function removeDir(dir: string): Promise<void> {
  const files = await listFiles(dir);
  for (let i = 0; i < files.length; i += 500) {
    await supabase.storage.from(DOCS_BUCKET).remove(files.slice(i, i + 500));
  }
}

/** Split pages, in path order, into bundles of about BUNDLE_CHARS. */
export function bundlePages(db: Record<string, string>): { bundles: Record<string, string>[]; map: Record<string, number> } {
  const bundles: Record<string, string>[] = [];
  const map: Record<string, number> = {};
  let current: Record<string, string> = {};
  let size = 0;
  for (const page of Object.keys(db).sort()) {
    const html = db[page];
    if (size > 0 && size + html.length > BUNDLE_CHARS) {
      bundles.push(current);
      current = {};
      size = 0;
    }
    current[page] = html;
    size += html.length + page.length;
    map[page] = bundles.length;
  }
  if (size > 0) bundles.push(current);
  return { bundles, map };
}

async function syncOne(entry: CatalogueEntry): Promise<DocVersion> {
  const fetchJson = async <T>(url: string): Promise<T> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json() as Promise<T>;
  };
  const [db, index] = await Promise.all([
    fetchJson<Record<string, string>>(`${SOURCE}/${entry.slug}/db.json?${entry.mtime}`),
    fetchJson<{ entries?: DocEntry[] }>(`${SOURCE}/${entry.slug}/index.json?${entry.mtime}`),
  ]);
  const entries = (index.entries ?? []).map(({ name, path, type }) => ({ name, path, type }));
  // A fresh folder per sync, never rewritten: see DocVersion.dir.
  const dir = setDir(entry.slug, entry.mtime, Date.now());
  const { bundles, map } = bundlePages(db);

  // Everything in the folder first; the manifest only changes after.
  await put(`${dir}/index.json.gz`, entries);
  await put(`${dir}/search.json.gz`, serializeDoc(buildDoc(db, entries)));
  await inPool(
    bundles.map((b, n) => ({ b, n })),
    UPLOADS_AT_ONCE,
    ({ b, n }) => put(`${dir}/b/${n}.json.gz`, b)
  );
  await put(`${dir}/pages.json.gz`, map);

  return {
    mtime: entry.mtime,
    release: entry.release || undefined,
    name: entry.name,
    attribution: entry.attribution ?? "",
    syncedAt: new Date().toISOString(),
    dir,
  };
}

/**
 * Bring every doc set the app uses up to date, oldest-first, within `budgetMs`.
 * Sets that do not fit in the budget are reported "skipped" and are picked up by the
 * next run. `force` re-downloads sets that are already current.
 */
export async function syncDocs(opts: { budgetMs?: number; force?: boolean; slugs?: string[] } = {}): Promise<SyncResult[]> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  await ensureBucket();
  const catalogue = (await (await fetch(CATALOGUE)).json()) as CatalogueEntry[];
  const wanted = opts.slugs ?? devdocsSlugs();
  const results: SyncResult[] = [];
  // Read ONCE and updated in place. Re-reading between sets lost updates: storage
  // serves the manifest from a cache for up to a minute, so each set read a stale
  // copy and its write dropped the sets written just before it.
  const manifest = await readManifest();

  for (const slug of wanted) {
    const entry = catalogue.find((c) => c.slug === slug);
    if (!entry) {
      results.push({ slug, status: "failed", detail: "not in the DevDocs catalogue" });
      continue;
    }
    const have = manifest.docs[slug];
    if (have?.mtime === entry.mtime && !opts.force) {
      results.push({ slug, status: "current" });
      continue;
    }
    if (Date.now() - started > budget) {
      results.push({ slug, status: "skipped", detail: "out of time this run" });
      continue;
    }
    try {
      const version = await syncOne(entry);
      manifest.docs[slug] = version;
      await put("manifest.json", manifest, MANIFEST_CACHE);
      const oldDir = have ? have.dir ?? setDir(slug, have.mtime) : null;
      if (oldDir && oldDir !== version.dir) await removeDir(oldDir).catch(() => {});
      results.push({ slug, status: "updated", detail: `${have?.mtime ?? "none"} -> ${version.mtime}` });
    } catch (e) {
      results.push({ slug, status: "failed", detail: String(e instanceof Error ? e.message : e) });
    }
  }
  return results;
}
