// SQLite engine — sql.js (WASM, CDN). A FRESH in-memory database on every Run, so
// exercises are deterministic and self-contained (they create their own schema/data).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadScriptOnce, tableText, type OnLine } from "./exec";

const BASE = "https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/";

let sqlP: Promise<any> | null = null;

export async function runSqlite(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  if (!sqlP) {
    onLine({ kind: "system", text: loadNote || "Loading SQLite…" });
    sqlP = (async () => {
      await loadScriptOnce(BASE + "sql-wasm.js");
      return await (window as any).initSqlJs({ locateFile: (f: string) => BASE + f });
    })();
    sqlP.catch(() => (sqlP = null));
  }
  let SQL: any;
  try {
    SQL = await sqlP;
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the SQLite engine: " + String(e) });
    return;
  }
  const db = new SQL.Database();
  try {
    const results = db.exec(code); // runs all statements; returns result sets of SELECTs
    if (!results.length) {
      onLine({ kind: "log", text: "Statements executed (no rows returned)." });
    }
    for (const r of results) {
      onLine({ kind: "log", text: tableText(r.columns, r.values) });
    }
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  } finally {
    db.close();
  }
}
