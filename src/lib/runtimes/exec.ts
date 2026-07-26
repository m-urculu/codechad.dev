// Runtime dispatcher — routes a module's code to its engine (lazy-loaded).
// Heavy engines load from CDN on first Run and are cached for the session.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OutLine } from "./javascript";
import type { RuntimeSpec } from "./registry";

export type RunHandle = { done: Promise<void>; cancel: () => void };
export type OnLine = (line: OutLine) => void;

// Dynamic import of an external URL without bundler static analysis.
export function extImport(url: string): Promise<any> {
  return new Function("u", "return import(u)")(url);
}

const scriptCache: Record<string, Promise<void>> = {};
export function loadScriptOnce(src: string): Promise<void> {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      // Monaco's loader defines window.define (AMD), which makes UMD bundles
      // (fengari-web, sql-wasm, …) register as AMD modules instead of setting
      // their window global. Hide AMD/CJS markers while the engine script runs.
      const w = window as any;
      const saved = { define: w.define, module: w.module, exports: w.exports };
      const hide = () => {
        w.define = undefined;
        w.module = undefined;
        w.exports = undefined;
      };
      const restore = () => {
        w.define = saved.define;
        w.module = saved.module;
        w.exports = saved.exports;
      };
      hide();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => {
        restore();
        resolve();
      };
      s.onerror = () => {
        restore();
        delete scriptCache[src];
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(s);
    });
  }
  return scriptCache[src];
}

// Temporarily capture window.console output (for main-thread engines like ruby.wasm).
export async function withConsoleCapture(onLine: OnLine, fn: () => Promise<void>): Promise<void> {
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const fmt = (args: unknown[]) =>
    args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
  console.log = (...a: unknown[]) => onLine({ kind: "log", text: fmt(a) });
  console.info = (...a: unknown[]) => onLine({ kind: "info", text: fmt(a) });
  console.warn = (...a: unknown[]) => onLine({ kind: "warn", text: fmt(a) });
  console.error = (...a: unknown[]) => onLine({ kind: "error", text: fmt(a) });
  try {
    await fn();
  } finally {
    Object.assign(console, orig);
  }
}

// Render rows as an aligned text table for the console pane.
export function tableText(columns: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => (v === null || v === undefined ? "NULL" : String(v));
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => cell(r[i]).length), 1));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join(" | ");
  const out = [line(columns), widths.map((w) => "-".repeat(w)).join("-+-")];
  for (const r of rows) out.push(line(columns.map((_, i) => cell(r[i]))));
  out.push(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
  return out.join("\n");
}

// Run `code` with the engine the spec names. Returns a handle; cancel is a no-op for
// main-thread WASM engines (documented limitation), real for the JS worker.
export async function startRun(spec: RuntimeSpec, code: string, onLine: OnLine): Promise<RunHandle> {
  switch (spec.engine) {
    case "worker-js": {
      const { runJavaScript } = await import("./javascript");
      const h = runJavaScript(code, onLine);
      return { done: h.promise, cancel: h.cancel };
    }
    case "typescript": {
      const { runTypeScript } = await import("./engineTs");
      return runTypeScript(code, onLine);
    }
    case "clang": {
      const { runC } = await import("./engineC");
      return { done: runC(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "yaegi": {
      const { runGo } = await import("./engineGo");
      const h = runGo(code, onLine, spec.loadNote);
      return { done: h.done, cancel: h.cancel };
    }
    case "git": {
      const { runGit } = await import("./engineGit");
      return { done: runGit(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "pyodide": {
      const { runPython } = await import("./enginePyodide");
      return { done: runPython(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "sqljs": {
      const { runSqlite } = await import("./engineSqlJs");
      return { done: runSqlite(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "pglite": {
      const { runPostgres } = await import("./enginePglite");
      return { done: runPostgres(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "duckdb": {
      const { runDuckDb } = await import("./engineDuckDb");
      return { done: runDuckDb(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "lua": {
      const { runLua } = await import("./engineLua");
      return { done: runLua(code, onLine), cancel: () => {} };
    }
    case "ruby": {
      const { runRuby } = await import("./engineRuby");
      return { done: runRuby(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "php": {
      const { runPhp } = await import("./enginePhp");
      return { done: runPhp(code, onLine, spec.loadNote), cancel: () => {} };
    }
    case "ml": {
      const { startMl } = await import("./engineMl");
      return startMl(code, onLine, spec.loadNote);
    }
    default: {
      onLine({ kind: "system", text: "Run isn't available for this module yet — press Submit to get tutor feedback on your code." });
      return { done: Promise.resolve(), cancel: () => {} };
    }
  }
}
