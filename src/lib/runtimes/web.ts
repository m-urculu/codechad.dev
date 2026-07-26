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
import { CONSOLE_FMT_SRC } from "./consoleFormat";

export type WebRunHandle = { cancel: () => void };

// Console-capture + error shim injected into the iframe (before the user's JS).
// __fmt/__post are attached to window because the shim runs in its own <script>
// while the runner (classic / babel / module script) runs in another.
const SHIM = `
${CONSOLE_FMT_SRC}
window.__fmt = __fmt;
window.__post = function __post(kind, text){ parent.postMessage({ __cp: true, kind: kind, text: text }, '*'); };
var __post = window.__post;
['log','info','warn','error','debug'].forEach(function(k){
  var orig = console[k] ? console[k].bind(console) : function(){};
  console[k] = function(){ __post(k==='debug'?'log':k, Array.prototype.map.call(arguments, __fmt).join(' ')); orig.apply(console, arguments); };
});
window.onerror = function(m, s, l, c, err){ __post('error', (err && err.stack) || m); return false; };
window.addEventListener('unhandledrejection', function(e){ __post('error', 'Uncaught (in promise) ' + __fmt(e.reason)); });
`;

// A lesson's HTML scaffold sometimes forgets to declare an element the starter code
// references (a generation slip), so `document.getElementById('x')` returns null and
// the code throws "Cannot set properties of null". To keep the exercise runnable, we
// scan the JS for element ids it looks up and inject any that the HTML is missing —
// deterministically, at run time (no rebuild / LLM call). Buttons are guessed from the
// id name; everything else becomes a div.
function ensureDomTargets(js: string, html: string): string {
  const ids = new Set<string>();
  const re = /getElementById\(\s*['"]([\w-]+)['"]\s*\)|querySelector(?:All)?\(\s*['"]#([\w-]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const id = m[1] || m[2];
    if (id) ids.add(id);
  }
  if (ids.size === 0) return html;
  const missing = [...ids].filter((id) => !new RegExp(`id\\s*=\\s*['"]${id}['"]`).test(html));
  if (missing.length === 0) return html;
  const injected = missing
    .map((id) => (/btn|button/i.test(id) ? `<button id="${id}">${id}</button>` : `<div id="${id}"></div>`))
    .join("\n");
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injected}\n</body>`) : `${html}\n${injected}`;
}

export type WebLibs = "react" | "vue" | "three" | "tailwind";

// CDN assets per library preset (pinned majors).
const LIB_HEAD: Record<WebLibs, string> = {
  // Tailwind's official browser build compiles the utility classes it finds in the
  // DOM at runtime, which is the whole module: the learner writes markup, and the
  // stylesheet is generated from it. Pinned like the rest (4.3.3, verified 2026-07).
  tailwind: `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js"><\/script>`,
  react:
    `<script crossorigin src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"><\/script>` +
    `<script crossorigin src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"><\/script>` +
    `<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js"><\/script>`,
  vue: `<script src="https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js"><\/script>`,
  three: `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"}}<\/script>`,
};

export function runWeb(opts: {
  iframe: HTMLIFrameElement;
  html: string;
  js: string;
  /** Author-written CSS, for a module whose editor holds a stylesheet rather than a
   *  script. Injected LAST in the head so it wins over anything a scaffold shipped. */
  css?: string;
  libs?: WebLibs;
  onLine: (line: OutLine) => void;
  onDone?: () => void;
}): WebRunHandle {
  const { iframe, html, js, css, libs, onLine, onDone } = opts;

  // Don't let `</script>` in user/lesson code terminate our injected script.
  const safeJs = js.replace(/<\/script>/gi, "<\\/script>");

  // Guarantee the elements the code looks up by id actually exist in the page.
  const safeHtml = ensureDomTargets(js, html);

  // The runner script differs by preset:
  // - react: Babel transpiles JSX in a text/babel script (errors surface via console/onerror)
  // - three: an ES module that imports three and exposes THREE before the user code
  // - default: classic script with try/catch
  let runner: string;
  if (libs === "react") {
    runner = `<script type="text/babel" data-presets="env,react">\n${safeJs}\n<\/script>`;
  } else if (libs === "three") {
    runner =
      `<script type="module">import * as THREE from "three"; window.THREE = THREE;\n` +
      `try {\n${safeJs}\n} catch(e){ __post('error', (e && (e.stack||e.message)) || String(e)); }\n<\/script>`;
  } else {
    runner = `<script>try {\n${safeJs}\n} catch(e){ __post('error', (e && (e.stack||e.message)) || String(e)); }\n<\/script>`;
  }

  const srcdoc =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{font-family:system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:12px}</style>` +
    `<script>(function(){\n${SHIM}\n})();<\/script>` +
    (libs ? LIB_HEAD[libs] : "") +
    // `</style>` in the learner's CSS would otherwise end the block and dump the rest
    // of their stylesheet into the page as text.
    (css ? `<style>\n${css.replace(/<\/style>/gi, "<\\/style>")}\n</style>` : "") +
    `</head><body>\n${safeHtml}\n` +
    runner +
    // 'done' fires on window load (after deferred/module/babel scripts have executed).
    `<script>window.addEventListener('load', function(){ setTimeout(function(){ __post('done',''); }, 150); });<\/script>` +
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
