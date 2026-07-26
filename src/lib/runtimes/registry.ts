// Runtime registry — one spec per Landing module. PURE DATA (server-safe): the
// lesson generator imports this for language-aware prompts; the client dispatcher
// (exec.ts) lazy-loads the actual engines. See docs/module-runtimes.md.

export type EngineKind =
  | "worker-js"   // Web Worker JS sandbox (hard-killable)
  | "typescript"  // sucrase transpile -> worker-js
  | "pyodide"     // CPython in WASM (main thread, CDN)
  | "sqljs"       // SQLite in WASM (CDN)
  | "pglite"      // Postgres in WASM (CDN)
  | "duckdb"      // DuckDB in WASM (CDN)
  | "lua"         // fengari Lua VM (CDN)
  | "ruby"        // ruby.wasm (CDN)
  | "php"         // php-wasm (CDN)
  | "iframe-web"  // sandboxed iframe with CDN libs + live Preview
  | "ml"          // transformers.js (CDN; downloads models)
  | "none";       // no client runtime — guided lessons only

export type ForbidLang = "js" | "python" | "sql" | "ruby" | "lua" | "php" | "none";

export type RuntimeSpec = {
  id: string;
  title: string;
  monacoLang: string;
  engine: EngineKind;
  runnable: boolean;
  allowDom: boolean;            // lessons may ship HTML + live Preview
  iframeLibs?: "react" | "vue" | "three";
  langName: string;             // how lessons name the language
  printHow: string;             // the output mechanism lessons teach
  // How this runtime renders a printed value, stated to the lesson generator so the
  // expected output it writes into a check is the output the learner will actually
  // see. Omitted where the language's own printing is unsurprising.
  outputFormat?: string;
  runNotes: string;             // extra constraints injected into lesson prompts
  forbid: ForbidLang;           // which self-containment list applies
  badgeColor: string;
  defaultCode: string;
  defaultHtml?: string;         // iframe scaffold when lesson ships none
  loadNote?: string;            // first-run download warning
};

const JS_NOTES =
  "Plain browser JavaScript sandbox. No require/import, no Node.js APIs, no network, no files.";

// Every JS-family runtime prints through the same shim (see runtimes/consoleFormat),
// which is NOT how Node or the DevTools console renders a value. Stating it here is
// what stops the generator writing `[ 'a', 'b' ]` into a check that the console can
// never produce.
const JS_OUTPUT_FORMAT =
  'JSON — a lone string prints bare, while arrays and objects print as compact JSON on ONE line ' +
  '(["a","b"] / {"n":1}: double quotes, no space after commas), switching to 2-space indented ' +
  "JSON across several lines only when that single line would exceed 72 characters. " +
  "Never Node/DevTools style ([ 'a', 'b' ] or { n: 1 }).";

export const RUNTIMES: Record<string, RuntimeSpec> = {
  javascript: {
    id: "javascript", title: "JavaScript", monacoLang: "javascript", engine: "worker-js",
    runnable: true, allowDom: true, langName: "JavaScript", printHow: "console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes: JS_NOTES + " DOM lessons run against the lesson's HTML in a real document with a live Preview.",
    forbid: "js", badgeColor: "#F7DF1E",
    defaultCode: '// Try it — edit and press Run\nconsole.log("Hello, CodeChad!");',
  },
  typescript: {
    id: "typescript", title: "TypeScript", monacoLang: "typescript", engine: "typescript",
    runnable: true, allowDom: false, langName: "TypeScript", printHow: "console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      JS_NOTES + " Code is transpiled to JavaScript before running (type annotations are erased; teach types, interfaces, generics — but remember runtime checks still need real JS logic).",
    forbid: "js", badgeColor: "#3178C6",
    defaultCode:
      '// TypeScript — types are checked in the editor, erased at run time\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet("CodeChad"));',
  },
  python: {
    id: "python", title: "Python", monacoLang: "python", engine: "pyodide",
    runnable: true, allowDom: false, langName: "Python 3", printHow: "print(...)",
    runNotes:
      "Real CPython (Pyodide/WASM) in the browser. No network (requests/urllib/socket), no subprocess, no real files. Standard library logic, data structures, classes etc. all work.",
    forbid: "python", badgeColor: "#3776AB",
    defaultCode: '# Python 3 — edit and press Run\nprint("Hello, CodeChad!")',
    loadNote: "Loading Python (≈10 MB, first run only)…",
  },
  ruby: {
    id: "ruby", title: "Ruby", monacoLang: "ruby", engine: "ruby",
    runnable: true, allowDom: false, langName: "Ruby", printHow: "puts(...)",
    runNotes:
      "Real CRuby (ruby.wasm) in the browser. No network (Net::HTTP/sockets), no shell (backticks/system), no real files. Core language + stdlib logic works.",
    forbid: "ruby", badgeColor: "#CC342D",
    defaultCode: '# Ruby — edit and press Run\nputs "Hello, CodeChad!"',
    loadNote: "Loading Ruby (≈25 MB, first run only)…",
  },
  php: {
    id: "php", title: "PHP", monacoLang: "php", engine: "php",
    runnable: true, allowDom: false, langName: "PHP", printHow: "echo / print_r(...)",
    runNotes:
      "Real PHP (php-wasm) in the browser. Code MUST start with <?php. No network (curl/file_get_contents on URLs), no exec/shell, no real files.",
    forbid: "php", badgeColor: "#777BB4",
    defaultCode: '<?php\n// PHP — edit and press Run\necho "Hello, CodeChad!\\n";',
    loadNote: "Loading PHP (≈5 MB, first run only)…",
  },
  lua: {
    id: "lua", title: "Lua", monacoLang: "lua", engine: "lua",
    runnable: true, allowDom: false, langName: "Lua 5.4", printHow: "print(...)",
    runNotes:
      "Real Lua VM (fengari) in the browser. No require, no io.*, no os.execute. Tables, functions, metatables, coroutines all work.",
    forbid: "lua", badgeColor: "#8895d9",
    defaultCode: '-- Lua — edit and press Run\nprint("Hello, CodeChad!")',
  },
  postgres: {
    id: "postgres", title: "PostgreSQL", monacoLang: "sql", engine: "pglite",
    runnable: true, allowDom: false, langName: "SQL (PostgreSQL)", printHow: "SELECT results shown as tables",
    runNotes:
      "Real Postgres (PGlite/WASM), fresh EMPTY in-memory database on every Run. Exercises MUST create their own schema/data (CREATE TABLE + INSERT) before querying. No ATTACH/COPY FROM files, no extensions.",
    forbid: "sql", badgeColor: "#4169E1",
    defaultCode:
      "-- PostgreSQL — a fresh database every Run\nCREATE TABLE users (id serial PRIMARY KEY, name text);\nINSERT INTO users (name) VALUES ('Ada'), ('Linus');\nSELECT * FROM users;",
    loadNote: "Loading PostgreSQL (≈12 MB, first run only)…",
  },
  sqlite: {
    id: "sqlite", title: "SQLite", monacoLang: "sql", engine: "sqljs",
    runnable: true, allowDom: false, langName: "SQL (SQLite)", printHow: "SELECT results shown as tables",
    runNotes:
      "Real SQLite (sql.js/WASM), fresh EMPTY in-memory database on every Run. Exercises MUST create their own schema/data (CREATE TABLE + INSERT) before querying. No ATTACH, no file paths.",
    forbid: "sql", badgeColor: "#7ac5e8",
    defaultCode:
      "-- SQLite — a fresh database every Run\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (name) VALUES ('Ada'), ('Linus');\nSELECT * FROM users;",
    loadNote: "Loading SQLite (≈1 MB, first run only)…",
  },
  duckdb: {
    id: "duckdb", title: "DuckDB", monacoLang: "sql", engine: "duckdb",
    runnable: true, allowDom: false, langName: "SQL (DuckDB)", printHow: "SELECT results shown as tables",
    runNotes:
      "Real DuckDB (WASM), fresh in-memory database on every Run. Exercises MUST create their own data (CREATE TABLE + INSERT, or generate_series/VALUES). No file/URL reads.",
    forbid: "sql", badgeColor: "#FFF000",
    defaultCode:
      "-- DuckDB — analytics SQL, fresh database every Run\nSELECT range AS n, range * range AS squared FROM range(1, 6);",
    loadNote: "Loading DuckDB (≈35 MB, first run only)…",
  },
  react: {
    id: "react", title: "React", monacoLang: "javascript", engine: "iframe-web",
    runnable: true, allowDom: true, iframeLibs: "react",
    langName: "React (JSX)", printHow: "the rendered Preview + console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      "React 18 UMD + Babel run in a sandboxed page with a live Preview. Write JSX; render with ReactDOM.createRoot(document.getElementById('root')).render(...). The lesson HTML must include the root element. No imports/npm — React, ReactDOM are globals.",
    forbid: "js", badgeColor: "#61DAFB",
    defaultCode:
      'function App() {\n  const [count, setCount] = React.useState(0);\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Clicked {count} times\n    </button>\n  );\n}\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);',
    defaultHtml: '<div id="root"></div>',
  },
  vue: {
    id: "vue", title: "Vue", monacoLang: "javascript", engine: "iframe-web",
    runnable: true, allowDom: true, iframeLibs: "vue",
    langName: "Vue 3 (JavaScript)", printHow: "the rendered Preview + console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      "Vue 3 global build runs in a sandboxed page with a live Preview. Use Vue.createApp({...}).mount('#app') with template strings or in-HTML templates. The lesson HTML must include the mount element. No imports/npm — Vue is a global.",
    forbid: "js", badgeColor: "#42B883",
    defaultCode:
      'Vue.createApp({\n  data() {\n    return { count: 0 };\n  },\n  template: `<button @click="count++">Clicked {{ count }} times</button>`,\n}).mount("#app");',
    defaultHtml: '<div id="app"></div>',
  },
  wasm: {
    id: "wasm", title: "WebAssembly", monacoLang: "javascript", engine: "worker-js",
    runnable: true, allowDom: false, langName: "JavaScript using the WebAssembly API",
    printHow: "console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      "Teach the JS WebAssembly API (WebAssembly.instantiate, exports, Memory, tables). There is NO wat/wasm toolchain: lessons must provide complete module binaries as inline Uint8Array literals (small hand-assembled modules) and have the learner instantiate/call/inspect them. Top-level await IS supported — always use `const { instance } = await WebAssembly.instantiate(bytes)` rather than .then() chains.",
    forbid: "js", badgeColor: "#654FF0",
    defaultCode:
      '// A tiny WebAssembly module: (func (export "add") (param i32 i32) (result i32))\nconst bytes = new Uint8Array([\n  0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,\n  10,9,1,7,0,32,0,32,1,106,11\n]);\nconst { instance } = await WebAssembly.instantiate(bytes);\nconsole.log("2 + 3 =", instance.exports.add(2, 3));',
  },
  graphics: {
    id: "graphics", title: "Three.js / WebGPU", monacoLang: "javascript", engine: "iframe-web",
    runnable: true, allowDom: true, iframeLibs: "three",
    langName: "JavaScript with Three.js", printHow: "the rendered 3D Preview + console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      "Three.js (ES module) runs in a sandboxed page with a live Preview. THREE is imported and available as a global. Create a scene/camera/renderer, append renderer.domElement to document.body, and animate with requestAnimationFrame. Keep scenes tiny.",
    forbid: "js", badgeColor: "#ffffff",
    defaultCode:
      "const scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);\ncamera.position.z = 3;\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.appendChild(renderer.domElement);\n\nconst cube = new THREE.Mesh(\n  new THREE.BoxGeometry(),\n  new THREE.MeshNormalMaterial()\n);\nscene.add(cube);\n\nfunction loop() {\n  cube.rotation.x += 0.01;\n  cube.rotation.y += 0.02;\n  renderer.render(scene, camera);\n  requestAnimationFrame(loop);\n}\nloop();",
    defaultHtml: "<!-- Three.js renders into document.body -->",
  },
  ml: {
    id: "ml", title: "AI / ML", monacoLang: "javascript", engine: "ml",
    runnable: true, allowDom: false, langName: "JavaScript with transformers.js",
    printHow: "console.log(...)",
    outputFormat: JS_OUTPUT_FORMAT,
    runNotes:
      "transformers.js runs real models in the browser. A `transformers` object (with `pipeline`) is provided to the code — use `const clf = await transformers.pipeline('sentiment-analysis')` style. Models download from the Hugging Face hub on first use (tens of MB) — prefer the default tiny models and warn about download time. This module MAY fetch models (exception to the no-network rule); everything else stays self-contained.",
    forbid: "none", badgeColor: "#FFD21E",
    defaultCode:
      "// transformers.js — first run downloads the model (~25 MB)\nconst classify = await transformers.pipeline(\"sentiment-analysis\");\nconst result = await classify(\"I love learning in the browser!\");\nconsole.log(result);",
    loadNote: "Loading transformers.js — the first model download can take a while…",
  },
};

export function getRuntime(id?: string | null): RuntimeSpec {
  return (id && RUNTIMES[id]) || RUNTIMES.javascript;
}
