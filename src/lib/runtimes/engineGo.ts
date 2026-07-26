// Go engine — the Yaegi interpreter (Go, by the Traefik team) compiled to
// WebAssembly. Real Go: structs, methods, interfaces, slices, maps, errors,
// goroutines with channels and WaitGroups, and generics all behave.
//
// It runs in a Web Worker, for two independent reasons:
//
//   1. Isolation. This is a 38 MB wasm blob from a small npm package, and Go
//      wasm can call into JavaScript — on the main thread that means the DOM,
//      localStorage and the Supabase session sitting in it. A worker has none of
//      those. Nothing here needs them, so nothing here gets them.
//   2. Interruption. Yaegi evaluates synchronously, so `for {}` wedges whatever
//      thread it is on. A worker can be terminated; the main thread cannot.
//
// ~7.7 MB over the wire, smaller than the Python runtime, cached afterwards.

import type { OnLine, RunHandle } from "./exec";

const PKG = "https://cdn.jsdelivr.net/npm/yaegi-wasm@1.0.2/src";
const TIMEOUT_MS = 10_000;

// The worker: loads Go's own wasm_exec shim, starts the interpreter, and answers
// one program at a time. Written as a string so it can be built from a Blob, the
// same pattern as the JavaScript runtime.
const WORKER_SRC = `
let ready = false;
let booting = false;

function post(kind, text) { self.postMessage({ kind, text }); }

async function boot() {
  if (booting) return;
  booting = true;
  importScripts(${JSON.stringify(PKG + "/wasm_exec.js")});

  // wasm_exec installs a Node-flavoured fs shim whose writeSync sends everything
  // to console.log, losing the distinction between stdout and stderr. Wrapping it
  // (rather than replacing it) keeps every other method it defines.
  const realFs = globalThis.fs;
  let outBuf = "", errBuf = "";
  realFs.writeSync = function (fd, buf) {
    const text = new TextDecoder().decode(buf);
    if (fd === 2) {
      errBuf += text;
      const nl = errBuf.lastIndexOf("\\n");
      if (nl !== -1) { emit("error", errBuf.slice(0, nl)); errBuf = errBuf.slice(nl + 1); }
    } else {
      outBuf += text;
      const nl = outBuf.lastIndexOf("\\n");
      if (nl !== -1) { emit("log", outBuf.slice(0, nl)); outBuf = outBuf.slice(nl + 1); }
    }
    return buf.length;
  };
  self.__flush = function () {
    if (outBuf) { emit("log", outBuf); outBuf = ""; }
    if (errBuf) { emit("error", errBuf); errBuf = ""; }
  };

  function emit(kind, block) {
    // Only the learner's program should reach the console. The interpreter's own
    // start-up chatter is ours to swallow.
    if (!ready && /Yaegi WebAssembly initialized/.test(block)) return;
    for (const line of block.split("\\n")) post(kind, line);
  }

  const go = new Go();
  // Read the module with a reader rather than instantiateStreaming so the wait is
  // visible. A first load is ~60s on a normal connection; a silent minute reads as
  // a broken page.
  const res = await fetch(${JSON.stringify(PKG + "/yaegi-browser.wasm")});
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let done = 0, lastPct = -1;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    parts.push(chunk.value);
    done += chunk.value.byteLength;
    if (!total) continue;
    const pct = Math.floor((done / total) * 10) * 10;
    if (pct > lastPct && pct < 100) { lastPct = pct; post("system", "Downloading the Go interpreter… " + pct + "%"); }
  }
  const buf = new Uint8Array(done);
  let at = 0;
  for (const p of parts) { buf.set(p, at); at += p.byteLength; }
  post("system", "Starting the Go interpreter…");
  const result = await WebAssembly.instantiate(buf, go.importObject);
  // Never awaited: the interpreter's main() parks forever so its exports stay alive.
  go.run(result.instance);

  for (let i = 0; i < 200 && !globalThis.yaegi; i++) await new Promise((r) => setTimeout(r, 25));
  if (!globalThis.yaegi) { post("fatal", "The Go interpreter did not start."); return; }
  ready = true;
  self.postMessage({ kind: "ready" });
}

self.onmessage = async function (e) {
  if (e.data.type === "boot") return boot();
  if (e.data.type !== "run") return;

  // A fresh interpreter per program: state carried over from the last run makes
  // the next one fail with "fmt redeclared in this block".
  try { globalThis.yaegi.reset(); } catch (err) { /* first run has nothing to reset */ }

  let evalError = "";
  try {
    const r = globalThis.yaegi.eval(e.data.code);
    if (r && typeof r === "object" && r.success === false && r.error) evalError = String(r.error);
    else if (typeof r === "string" && r) {
      try { const parsed = JSON.parse(r); if (parsed && parsed.success === false) evalError = String(parsed.error || ""); }
      catch (err) { /* not JSON: not an error report */ }
    }
  } catch (err) {
    evalError = String((err && err.message) || err);
  }
  self.__flush();
  self.postMessage({ kind: "done", error: evalError });
};
`;

let workerP: Promise<Worker> | null = null;
/** Bound to whichever run is in flight, so worker messages reach the right console. */
let sink: OnLine | null = null;
let onDone: ((error: string) => void) | null = null;

function spawn(): Promise<Worker> {
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "application/javascript" }));
  const worker = new Worker(url);
  return new Promise<Worker>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { kind: string; text?: string; error?: string };
      if (m.kind === "ready") return resolve(worker);
      if (m.kind === "fatal") return reject(new Error(m.text));
      if (m.kind === "done") return onDone?.(m.error ?? "");
      const kind = m.kind === "error" || m.kind === "system" ? m.kind : "log";
      sink?.({ kind, text: m.text ?? "" });
    };
    worker.onerror = (e) => reject(new Error(e.message || "Go runtime failed to start"));
    worker.postMessage({ type: "boot" });
  });
}

/** Drop the worker so the next Run starts a clean one (after a timeout or crash). */
function discard(worker?: Worker) {
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  workerP = null;
}

export function runGo(code: string, onLine: OnLine, loadNote?: string): RunHandle {
  let worker: Worker | undefined;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sink = null;
      onDone = null;
      resolve();
    };
  });

  const cancel = () => {
    if (settled) return;
    discard(worker);
    onLine({ kind: "error", text: "Stopped." });
    finish();
  };

  (async () => {
    if (!workerP) {
      onLine({ kind: "system", text: loadNote || "Loading the Go interpreter…" });
      workerP = spawn();
      workerP.catch(() => (workerP = null)); // a failed boot must be retryable
    }
    // Bound BEFORE the wait: the worker reports its download progress during boot,
    // and a sink assigned afterwards misses exactly the minute that needed a
    // progress bar.
    sink = onLine;
    try {
      worker = await workerP;
    } catch (e) {
      onLine({ kind: "error", text: "Failed to load the Go interpreter: " + String(e) });
      return finish();
    }

    onDone = (error) => {
      if (error) {
        // Yaegi reports "line:col: message" — the shape a Go compiler error takes.
        onLine({ kind: "error", text: error });
      }
      finish();
    };

    timer = setTimeout(() => {
      // The worker is stuck inside a synchronous eval; terminating is the only
      // way back, and the next Run gets a fresh interpreter.
      discard(worker);
      onLine({
        kind: "error",
        text:
          `Execution timed out after ${TIMEOUT_MS / 1000}s (possible infinite loop). ` +
          `The interpreter was stopped mid-run, so the next Run rebuilds it and takes a few seconds longer.`,
      });
      finish();
    }, TIMEOUT_MS);

    worker.postMessage({ type: "run", code });
  })();

  return { done, cancel };
}
