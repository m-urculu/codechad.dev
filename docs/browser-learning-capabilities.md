# Browser Learning Capabilities — What We're Sure We Can Build

Scope: hands-on, in-browser coding experiences for **CodePath.AI**, with **no
backend execution server**. Everything in this document runs **fully client-side**
(the user's tab) using mature, production-proven technology. Speculative / heavy /
server-dependent options are tracked separately at the bottom, not here.

"Sure" = there is a maintained, widely-used library that does exactly this today, and
the limits are known and acceptable for *teaching* (not production hosting).

---

## How code runs in the browser (the 4 mechanisms)

1. **Native JS** — runs directly on the JS engine. Full speed.
2. **A runtime compiled to WASM** — the language's interpreter is a `.wasm` blob; the
   learner's code is interpreted by it. (Python, Ruby, PHP, Lua.)
3. **Learner's code compiled to WASM** — runs near-native. (Output of C/C++/Rust/Go.)
4. **A whole machine emulated in WASM** — boots a real Linux image. Real but slow. (v86.)

Key rule: **running compiled *output* is cheap; running the *compiler itself*
client-side is heavy.** This decides everything below.

---

## ✅ Languages we can run fully client-side (high confidence)

| Language | Mechanism | Library | What the learner gets |
|---|---|---|---|
| **JavaScript** | native | (built-in) | Full execution, all Web APIs |
| **TypeScript** | transpile → JS + full typecheck | esbuild-wasm / swc / Monaco's bundled TS service | Real types, real run |
| **Python 3.12** | CPython in WASM | **Pyodide** | Real Python incl. numpy/pandas/matplotlib/scikit-learn |
| **SQL (SQLite)** | engine in WASM | **sql.js** / **wa-sqlite** | Real database, real query results |
| **SQL (Postgres)** | engine in WASM | **PGlite** | Real Postgres semantics in-tab |
| **SQL (analytics)** | engine in WASM | **DuckDB-wasm** | Real columnar/analytics queries on CSV/Parquet |
| **Ruby 3.x** | CRuby in WASM | **ruby.wasm** | Language fundamentals |
| **PHP** | PHP in WASM | **php-wasm** | Real PHP (WordPress Playground proves it) |
| **Lua** | VM in JS | **fengari** | Tiny, clean, fast to load |
| **C#/.NET** | real runtime in WASM | **Blazor WebAssembly** | Real .NET execution |
| **C / C++ (output)** | compiled to WASM (Emscripten) | precompiled exercises | Run native-compiled output |
| **WASM-target langs (output)** | compiled to WASM | — | Run output of Rust/Go/Zig/AssemblyScript |

---

## ✅ Real environments we can run client-side

| Environment | Library | What it enables | Confidence |
|---|---|---|---|
| **Node.js + npm + terminal + dev server** | **WebContainers** (`@webcontainer/api`) | Build & live-preview real React/Next/Vue/Express apps | High (Chromium-family; needs COOP/COEP) |
| **In-browser code editor** | **Monaco** (already installed) | IntelliSense, multi-file, TS language service | High — already in repo |
| **Real database playground** | PGlite / sql.js / DuckDB-wasm | Query a real DB, see real result sets | High |
| **ML inference / NLP in-tab** | **transformers.js** (+ WebGPU) | Run real models: classification, embeddings, small LLMs | High on Chrome/Edge |
| **GPU compute & 3D viz** | WebGPU / WebGL + Three.js (installed) | Visualize algorithms, matrices, neural nets | High |
| **Booted Linux + bash + gcc** | **v86 / JSLinux** | Real shell/CLI/systems practice | Medium (slow; large image) |

---

## ✅ Kinds of programs / lessons we can confidently build

**Code-and-run exercises (any Tier-1 language above):**
- Write a function → run it → assert against test cases → AI reviews the *actual* output.
- Fix-the-bug: ship broken code, learner repairs, tests turn green.
- REPL/scratchpad with live output.

**Data & SQL:**
- Query a real seeded database; compare result sets; AI explains the query plan.
- Pandas/numpy notebooks (Pyodide): load CSV, transform, plot with matplotlib.
- Analytics over real Parquet/CSV with DuckDB.

**Web / frontend / full-stack (WebContainers):**
- Build a real component/app with **live preview** beside the editor.
- `npm install`, run a dev server, edit, hot-reload — entirely in-tab.
- Multi-file projects with a real file tree.

**AI / ML literacy (on-theme for this app):**
- Prompt-engineering playground (already calling Gemini).
- Run a real model client-side (transformers.js): sentiment, embeddings, tokenization.
- Visualize attention / embeddings clouds / gradient descent (WebGPU + Three.js).

**CS fundamentals & visualization:**
- Animated data structures & algorithms stepping through state (Three.js/Canvas).
- Interactive complexity / sorting / graph-traversal sandboxes.

**Systems / CLI (Tier-2, real but heavier):**
- Guided bash/Linux exercises inside an emulated Linux (v86): real commands, real gcc.

**Auto-grading across all of the above:**
- Run learner code in a sandbox → capture output/errors → AI grades against a rubric →
  mark the roadmap node complete. This is the core "AI sees your real work" loop.

---

## ⚠️ Hard limits that constrain ALL of the above (browser sandbox)

These are not per-language — they are the browser itself, and they define the edges of
what we can teach hands-on:

1. **No raw sockets.** Only `fetch` / WebSocket / WebRTC. Real TCP/UDP / binding a
   reachable port works *only* inside v86 or WebContainers' virtual network.
2. **No real filesystem.** Virtual only (OPFS / IndexedDB / WebContainers FS / MEMFS).
3. **Threads need cross-origin isolation.** `SharedArrayBuffer` (used by multi-threaded
   Pyodide, WebContainers, ffmpeg.wasm) requires **COOP/COEP headers** — and these can
   break Google OAuth popups and third-party iframes. Deployment constraint on Vercel.
4. **~2 GB usable memory** (wasm32, 4 GB address space). Large datasets / real-size
   models hit this wall.
5. **No subprocess / fork-exec** except inside the virtualized worlds (WebContainers, v86).
6. **Cold-start download tax.** Pyodide ~6–10 MB, .NET/CheerpJ multi-MB, v86 image
   tens of MB. First load is slow; service-worker caching makes repeats instant.
7. **Compilers ≠ runtimes.** We can run *output* of Rust/Go/C++ easily, but the full
   *toolchains* are not practical client-side (see "Server runner" below).

---

## 🟡 NOT in scope for client-side (needs a server runner, tracked separately)

Listed here so we don't accidentally promise them as in-browser:

- **Rust, Go, full C/C++ toolchains** — compiler too heavy for the client; compile
  server-side (the Rust/Go Playground model).
- **Real networking / Kubernetes / Docker daemons / cloud (AWS, Terraform)** — need real
  infrastructure and outbound sockets.
- **GPU training at scale / large LLMs** — exceed browser memory and compute budgets.
- **Java via full `javac`/JVM** — possible (CheerpJ) but heavy footprint; defer.

---

## Mapped onto our 64 roadmap archetypes

- **Fully hands-on in-browser today:** javascript, typescript, react, vue, angular,
  nodejs, frontend, full-stack, python, sql, postgresql-dba, datastructures-and-algorithms,
  computer-science (basics), prompt-engineering, ai-engineer, ai-agents, game-developer.
- **Hands-on with Tier-2 effort:** linux, docker (teach via emulated Linux), java, cpp,
  devops (basics).
- **Needs a server runner for fidelity:** rust, golang, kubernetes, cyber-security,
  terraform, aws, mlops.

≈ two-thirds of the catalog is fully hands-on in the browser with zero backend execution.

---

*Maintained for CodePath.AI. "Sure" entries are backed by a maintained, widely-used
library. Verify exact versions / package availability before committing to an
implementation.*
