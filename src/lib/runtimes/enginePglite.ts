// PostgreSQL engine — PGlite (Postgres in WASM, CDN ESM). A FRESH in-memory database
// on every Run, so exercises create their own schema/data.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, tableText, type OnLine } from "./exec";

const BASE = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.3.4/dist/";
const CDN_URL = BASE + "index.js/+esm";

// The +esm transform breaks PGlite's relative asset resolution (import.meta.url points
// at the /+esm pseudo-path), so we fetch the wasm + FS bundle explicitly and pass them
// to the constructor — PGlite's documented bundler-hostile escape hatch.
let modP: Promise<{ PGlite: any; wasmModule: WebAssembly.Module; fsBundle: Blob }> | null = null;

export async function runPostgres(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  if (!modP) {
    onLine({ kind: "system", text: loadNote || "Loading PostgreSQL…" });
    modP = (async () => {
      const [{ PGlite }, wasmModule, fsBundle] = await Promise.all([
        extImport(CDN_URL),
        WebAssembly.compileStreaming(fetch(BASE + "pglite.wasm")),
        fetch(BASE + "pglite.data").then((r) => {
          if (!r.ok) throw new Error(`pglite.data ${r.status}`);
          return r.blob();
        }),
      ]);
      return { PGlite, wasmModule, fsBundle };
    })();
    modP.catch(() => (modP = null));
  }
  let PGlite: any, wasmModule: WebAssembly.Module, fsBundle: Blob;
  try {
    ({ PGlite, wasmModule, fsBundle } = await modP);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the PostgreSQL engine: " + String(e) });
    return;
  }
  const db = new PGlite({ wasmModule, fsBundle }); // in-memory
  try {
    const results = await db.exec(code); // multi-statement
    for (const r of results) {
      if (r.fields?.length) {
        const cols = r.fields.map((f: any) => f.name);
        const rows = (r.rows ?? []).map((row: any) => cols.map((c: string) => row[c]));
        onLine({ kind: "log", text: tableText(cols, rows) });
      } else {
        onLine({ kind: "log", text: `OK${typeof r.affectedRows === "number" && r.affectedRows > 0 ? ` (${r.affectedRows} rows affected)` : ""}` });
      }
    }
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  } finally {
    try {
      await db.close();
    } catch {
      /* ignore */
    }
  }
}
