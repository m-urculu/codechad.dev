// In-browser JavaScript runtime.
//
// Runs the learner's code in a Web Worker so it's isolated from the app and can be
// hard-terminated (infinite-loop protection). console.* / alert / errors are captured
// and streamed back as output lines. Async / top-level await is supported.

export type OutKind = "log" | "info" | "warn" | "error" | "system";
export type OutLine = { kind: OutKind; text: string };

export type RunHandle = { promise: Promise<void>; cancel: () => void };

// Worker source (stringified — instantiated from a Blob so no separate file/build step).
const WORKER_SRC = `
function safeStringify(v){
  var seen = new WeakSet();
  try {
    return JSON.stringify(v, function(k, val){
      if (typeof val === 'object' && val !== null){
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'bigint') return val.toString() + 'n';
      if (typeof val === 'function') return '[Function ' + (val.name || 'anonymous') + ']';
      return val;
    }, 2);
  } catch(e){ return String(v); }
}
function fmt(v){
  if (typeof v === 'string') return v;
  if (typeof v === 'undefined') return 'undefined';
  if (v === null) return 'null';
  if (v instanceof Error) return (v.stack || (v.name + ': ' + v.message));
  if (typeof v === 'function') return v.toString();
  if (typeof v === 'bigint') return v.toString() + 'n';
  if (typeof v === 'symbol') return v.toString();
  if (typeof v === 'object') return safeStringify(v);
  return String(v);
}
function fmtAll(args){ return Array.prototype.map.call(args, fmt).join(' '); }
function post(kind, text){ self.postMessage({ kind: kind, text: text }); }
self.addEventListener('unhandledrejection', function(e){ post('error', 'Uncaught (in promise) ' + fmt(e.reason)); });
self.onmessage = async function(e){
  var code = e.data;
  var sandboxConsole = {
    log: function(){ post('log', fmtAll(arguments)); },
    info: function(){ post('info', fmtAll(arguments)); },
    warn: function(){ post('warn', fmtAll(arguments)); },
    error: function(){ post('error', fmtAll(arguments)); },
    debug: function(){ post('log', fmtAll(arguments)); },
    table: function(){ post('log', fmtAll(arguments)); }
  };
  var alertFn = function(m){ post('log', fmt(m)); };
  var promptFn = function(){ return null; };
  try {
    var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    var fn = new AsyncFunction('console','alert','prompt', code);
    await fn(sandboxConsole, alertFn, promptFn);
    post('done','');
  } catch(err){
    post('error', (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err));
    post('done','');
  }
};
`;

export function runJavaScript(
  code: string,
  onLine: (line: OutLine) => void,
  timeoutMs = 5000
): RunHandle {
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let resolveFn: (() => void) | null = null;
  const promise = new Promise<void>((res) => {
    resolveFn = res;
  });

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (worker) {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
    }
    resolveFn?.();
  };

  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "application/javascript" }));
    worker = new Worker(url);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to start the JavaScript runtime: " + String(e) });
    finish();
    return { promise, cancel: finish };
  }

  timer = setTimeout(() => {
    onLine({ kind: "error", text: `Execution timed out after ${timeoutMs / 1000}s (possible infinite loop).` });
    finish();
  }, timeoutMs);

  worker.onmessage = (e: MessageEvent) => {
    const m = (e.data || {}) as { kind?: string; text?: string };
    if (m.kind === "done") {
      finish();
      return;
    }
    onLine({ kind: (m.kind as OutKind) || "log", text: m.text ?? "" });
  };
  worker.onerror = (e) => {
    onLine({ kind: "error", text: e.message || "Runtime error" });
    finish();
  };
  worker.postMessage(code);

  return { promise, cancel: finish };
}
