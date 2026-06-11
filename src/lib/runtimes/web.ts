// In-browser WEB (DOM) JavaScript runtime.
//
// For "Web & UI" lessons the code needs a real `document`. The Web Worker runtime has no
// DOM, so those run here instead: the lesson's HTML + the learner's JS are loaded into a
// sandboxed <iframe> (a real browser document). console.* / errors are captured via
// postMessage and the rendered page IS the live Preview.
//
// Trade-off vs. the worker: a synchronous infinite loop here blocks the main thread (an
// iframe shares it), so there's no hard-kill. Acceptable for DOM lessons; pure-logic code
// keeps using the worker runtime (javascript.ts).

import type { OutLine } from "./javascript";

export type WebRunHandle = { cancel: () => void };

// Console-capture + error shim injected into the iframe (before the user's JS).
const SHIM = `
function __fmt(v){
  try {
    if (typeof v === 'string') return v;
    if (v === null) return 'null';
    if (typeof v === 'undefined') return 'undefined';
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (v && v.nodeType === 1) return '<' + (v.tagName||'node').toLowerCase() + (v.id?(' id=\"'+v.id+'\"'):'') + '>';
    if (typeof v === 'function') return '[Function ' + (v.name||'anonymous') + ']';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  } catch(e){ return String(v); }
}
function __post(kind, text){ parent.postMessage({ __cp: true, kind: kind, text: text }, '*'); }
['log','info','warn','error','debug'].forEach(function(k){
  var orig = console[k] ? console[k].bind(console) : function(){};
  console[k] = function(){ __post(k==='debug'?'log':k, Array.prototype.map.call(arguments, __fmt).join(' ')); orig.apply(console, arguments); };
});
window.onerror = function(m, s, l, c, err){ __post('error', (err && err.stack) || m); return false; };
window.addEventListener('unhandledrejection', function(e){ __post('error', 'Uncaught (in promise) ' + __fmt(e.reason)); });
`;

export function runWeb(opts: {
  iframe: HTMLIFrameElement;
  html: string;
  js: string;
  onLine: (line: OutLine) => void;
  onDone?: () => void;
}): WebRunHandle {
  const { iframe, html, js, onLine, onDone } = opts;

  // Don't let `</script>` in user/lesson code terminate our injected script.
  const safeJs = js.replace(/<\/script>/gi, "<\\/script>");
  const runner = `try {\n${safeJs}\n} catch(e){ __post('error', (e && (e.stack||e.message)) || String(e)); }\n__post('done','');`;

  const srcdoc =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{font-family:system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:12px}</style>` +
    `</head><body>\n${html}\n` +
    `<script>(function(){\n${SHIM}\n${runner}\n})();<\/script>` +
    `</body></html>`;

  const handler = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return;
    const d = e.data as { __cp?: boolean; kind?: string; text?: string };
    if (!d || !d.__cp) return;
    if (d.kind === "done") {
      onDone?.();
      return;
    }
    onLine({ kind: (d.kind as OutLine["kind"]) || "log", text: d.text ?? "" });
  };
  window.addEventListener("message", handler);

  // Fresh document each run.
  iframe.srcdoc = srcdoc;

  return {
    cancel: () => {
      window.removeEventListener("message", handler);
      try {
        iframe.srcdoc = "";
      } catch {
        /* ignore */
      }
    },
  };
}
