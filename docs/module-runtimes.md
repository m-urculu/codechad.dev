# Module Runtimes — capabilities, implementation, test status

Every Landing module has a `RuntimeSpec` in `src/lib/runtimes/registry.ts` (language,
engine, lesson rules, default code). `exec.ts` dispatches Run to the engine; lessons,
tutor context and evaluation are language-aware via the same registry. Heavy engines
load from CDN on first Run and are cached for the session.

"Node-verified" = the engine's exact run/capture/error logic was executed in Node
against the same WASM core the browser loads. "Browser-verify pending" = implemented
per the library's documented browser pattern + CDN assets confirmed live, but not yet
exercised in a real browser session.

## Runnable modules

| Module | Engine | How it runs | What lessons can do | Limits | Tested |
|---|---|---|---|---|---|
| **JavaScript** | Web Worker | isolated worker, hard-killable, 5s timeout | full JS, console capture, async/await; DOM lessons → sandboxed iframe + live Preview | no require/Node APIs/network | ✅ in-browser (earlier sessions) |
| **TypeScript** | sucrase → worker | types erased via sucrase (CDN), runs as JS in the worker | types/interfaces/generics lessons; same JS sandbox | transpile-only (no type-checking at run; Monaco shows type errors live) | ✅ Node-verified |
| **Python** | Pyodide v0.26 | real CPython (WASM), main thread | full language + stdlib, classes, comprehensions; print() captured; errors surfaced | ~10 MB first load; main-thread (no hard-kill); no network/subprocess | ✅ Node-verified |
| **SQLite** | sql.js 1.13 | fresh in-memory DB each Run; multi-statement; SELECTs render as text tables | schema design, CRUD, joins, indexes | ~1 MB load; exercises must create their own schema | ✅ Node-verified |
| **PostgreSQL** | PGlite 0.3 | fresh in-memory Postgres each Run; same table rendering | real PG semantics: serial, RETURNING, CTEs, window fns | ~12 MB load; single-connection; no extensions | ✅ Node-verified |
| **DuckDB** | duckdb-wasm 1.29 | session AsyncDuckDB (worker), per-statement queries, schema reset after Run | analytics SQL: aggregates, window fns, generate_series | ~35 MB load; no file/URL reads | ⚠️ browser-verify pending (Node worker-shim test inconclusive; browser path is the documented official pattern, CDN 200) |
| **Lua** | fengari-web | fresh lua_State each Run; print → console | full Lua 5.4: tables, metatables, closures, coroutines | no require/io/os.execute | ✅ Node-verified |
| **Ruby** | ruby.wasm 3.4 | wasm module compiled once; FRESH VM per Run; StringIO stdout/stderr capture; `=> result` echo | core language + stdlib; clean state each Run (verified) | ~25 MB first load; no Net::HTTP/shell | ✅ Node-verified |
| **PHP** | php-wasm 0.1 (unpkg) | session PhpWeb instance; each .run() separate; output/error events | PHP 8.x language, arrays, functions, classes | jsDelivr refuses the package (>150 MB) → served from unpkg; no curl/exec | ✅ Node-verified (PhpNode, same API) |
| **React** | iframe + UMD + Babel | React 18 + ReactDOM + Babel standalone in sandboxed iframe; JSX via text/babel; live Preview | components, props, state, hooks, events | globals (no imports/npm); production UMD (no dev warnings) | ✅ JSX→createElement Node-verified; iframe browser-verify pending |
| **Vue** | iframe + global build | Vue 3 global build; createApp().mount() against lesson HTML; live Preview | options API, reactivity, templates, events | global (no SFCs/imports) | ⚠️ browser-verify pending (syntax + CDN verified) |
| **CSS** | iframe (no libs) | the editor holds a STYLESHEET (`codeIs: "css"`), injected last in `<head>`; lesson ships the markup in `html`; live Preview | the real cascade: specificity, box model, flexbox, grid, custom properties, transitions, media/container queries | no preprocessor, no `@import`, no web fonts; renders rather than prints, so objectives must be `code_matches` | ✅ in-browser (computed styles asserted: flex, gap 12px, radius 10px, 50%) |
| **Tailwind CSS** | iframe + browser build | the editor holds the MARKUP (`codeIs: "html"`); `@tailwindcss/browser@4.3.3` compiles the classes it finds in the DOM; live Preview | v4 utilities, arbitrary values, state/responsive/dark variants, real generated CSS | no config file, plugins, `@apply` file or build step; no console output | ✅ in-browser (`bg-indigo-600` → `oklch(0.511 0.262 276.966)`, `rounded-lg` → 8px) |
| **WebAssembly** | Web Worker (JS) | lessons teach the JS WebAssembly API with inline Uint8Array module binaries | instantiate, exports, Memory, tables | no wat/wasm toolchain — modules ship as bytes (sample byte-module verified: add(2,3)=5) | ✅ Node-verified |
| **Three.js / WebGPU** | iframe + importmap | three 0.180 ES module; THREE exposed; renders into Preview | scenes, cameras, meshes, animation loops | WebGL in sandboxed iframe; keep scenes small | ⚠️ browser-verify pending (syntax + CDN verified) |
| **AI / ML** | transformers.js 3.5 | library injected as `transformers`/`pipeline` into async user code | run real models: embeddings, sentiment, tokenization | models download from HF hub (tens of MB) — sanctioned network exception | ✅ Node-verified (MiniLM embeddings, dims 384) |

## Removed until runnable (decision 2026-06-12: no runtime → not on the menu)

C# / .NET, Node.js and Linux/Bash were REMOVED from the Landing grid and registry —
if the learner can't execute the code, the module doesn't ship. The `runnable:false`
machinery (disabled Run, code-reading objectives, Submit-only tutor flow) remains in
the codebase as the fallback for any future module mid-rollout.

| Module | Why not runnable client-side | Path to restoring it |
|---|---|---|
| **C# / .NET** | needs the .NET runtime + Roslyn in WASM (Blazor) — very heavy footprint | Blazor WASM or a server runner |
| **Node.js** | fs/http/process are exactly what the sandbox forbids; WebContainers needs COOP/COEP headers (breaks OAuth popups) + licensing | WebContainers behind a header-isolated route, or server runner |
| **Linux / Bash** | needs a real shell → v86 boots actual Linux but ships a tens-of-MB disk image | v86 with a hosted Alpine image |

## How the pieces fit

- **Registry** (`registry.ts`, pure data) → drives the editor (Monaco language, badge,
  default code), the Run dispatch, the lesson generator's language/self-containment
  rules, the tutor's system prompt, and the evaluator's language label.
- **Self-containment per language** (`lesson.ts`): forbidden-API lists + comment/string
  scrubbers for js/python/sql/ruby/lua/php; SQL lessons must create their own schema
  (fresh DB per Run); generate→scan→regenerate→sanitize pipeline unchanged.
- **Cancellation honesty**: only the JS/TS worker is hard-killable. Main-thread WASM
  engines (Python, SQL, Ruby, PHP) can't be interrupted mid-run — Stop resets the UI.
- **Cold starts**: each heavy engine posts a system line with its size on first Run
  (`loadNote`), then stays cached for the session.

## Verification log (2026-06-12, Node 22 / WSL)

- sucrase: TS types erased, output `Ada (36) … total age: 64` ✓; bad TS surfaces error ✓
- pyodide: classes/comprehensions, stdout batched, ZeroDivisionError surfaced ✓
- sql.js + PGlite: multi-statement, table text, affectedRows, missing-table errors ✓
- fengari: fib/tables/loops, print override, error path ✓
- ruby.wasm: StringIO capture, partial stdout kept on raise, fresh-state isolation ✓
- php-wasm (PhpNode): echo/foreach/typed fn, Fatal error surfaced, exit codes ✓
- Babel standalone: registry React JSX → createElement ✓
- WASM sample bytes: instantiate + add(2,3)=5 ✓
- transformers.js: MiniLM feature-extraction, dims [1,384] ✓
- Lesson generator per module: js/ts/python/sqlite/postgres/duckdb/lua/ruby/php/react/
  wasm/csharp all produce correct-language, self-contained starter code ✓
- CDN assets: 15/16 jsDelivr 200; php-wasm moved to unpkg (jsDelivr 150 MB limit) ✓
