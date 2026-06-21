// Python engine — real CPython via Pyodide (WASM, CDN). Loaded once per session.
// Runs on the main thread: no hard-kill for infinite loops (documented limitation).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadScriptOnce, type OnLine } from "./exec";

const VER = "v0.26.4";
const BASE = `https://cdn.jsdelivr.net/pyodide/${VER}/full/`;

let pyodideP: Promise<any> | null = null;

async function getPyodide(onLine: OnLine, loadNote?: string): Promise<any> {
  if (!pyodideP) {
    onLine({ kind: "system", text: loadNote || "Loading Python…" });
    pyodideP = (async () => {
      await loadScriptOnce(BASE + "pyodide.js");
      return await (window as any).loadPyodide({ indexURL: BASE });
    })();
    pyodideP.catch(() => (pyodideP = null));
  }
  return pyodideP;
}

export async function runPython(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let py: any;
  try {
    py = await getPyodide(onLine, loadNote);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the Python runtime: " + String(e) });
    return;
  }
  py.setStdout({ batched: (s: string) => onLine({ kind: "log", text: s }) });
  py.setStderr({ batched: (s: string) => onLine({ kind: "error", text: s }) });
  try {
    const result = await py.runPythonAsync(code);
    if (result !== undefined && result !== null) onLine({ kind: "log", text: String(result) });
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  }
}
