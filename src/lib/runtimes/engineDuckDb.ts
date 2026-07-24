// DuckDB engine — @duckdb/duckdb-wasm (CDN). One AsyncDuckDB per session (worker-based);
// each Run uses a fresh connection against a fresh in-memory catalog by reopening.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, tableText, type OnLine } from "./exec";

const CDN_URL = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

let dbP: Promise<{ duckdb: any; db: any }> | null = null;

async function getDb(onLine: OnLine, loadNote?: string) {
  if (!dbP) {
    onLine({ kind: "system", text: loadNote || "Loading DuckDB…" });
    dbP = (async () => {
      const duckdb = await extImport(CDN_URL);
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      // Same-origin worker shim around the CDN worker script.
      const workerUrl = URL_createWorker(bundle.mainWorker!);
      const worker = new Worker(workerUrl);
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return { duckdb, db };
    })();
    dbP.catch(() => (dbP = null));
  }
  return dbP;
}

function URL_createWorker(scriptUrl: string): string {
  return URL.createObjectURL(
    new Blob([`importScripts("${scriptUrl}");`], { type: "text/javascript" })
  );
}

export async function runDuckDb(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let db: any;
  try {
    ({ db } = await getDb(onLine, loadNote));
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the DuckDB engine: " + String(e) });
    return;
  }
  // Fresh in-memory catalog for every Run: lessons assume the DB starts empty, and a
  // re-run of a CREATE TABLE script must not collide with the previous run's tables.
  // (DROP SCHEMA main is not allowed in DuckDB — reopening the DB is the real reset.)
  try {
    await db.open({ path: ":memory:" });
  } catch {
    /* keep the existing catalog if reopen isn't supported */
  }
  const conn = await db.connect();
  try {
    // Run statements one by one (split on ; at line ends) so DDL + queries all execute.
    const statements = code
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      const result = await conn.query(stmt);
      const cols: string[] = result.schema.fields.map((f: any) => f.name);
      if (cols.length) {
        const rows = result.toArray().map((row: any) => cols.map((c) => row[c]));
        onLine({ kind: "log", text: tableText(cols, rows) });
      } else {
        onLine({ kind: "log", text: "OK" });
      }
    }
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  } finally {
    await conn.close();
  }
}
