<p align="center">
  <img src="public/logo.svg" width="72" alt="CodePath.AI logo" />
</p>

<h1 align="center">CodePath.AI</h1>

<p align="center">
  <b>Learn by doing — real code, real databases, real output, live in your browser, with an AI tutor beside you.</b><br/>
  No installs, no server-side runtimes: every language and database below executes client-side.
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-34d399" />
  <img alt="status" src="https://img.shields.io/badge/status-alpha-38bdf8" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-white" />
</p>

---

## What it looks like

**Pick a technology, get a personalized curriculum.** Everything on the grid runs fully in the browser — languages via WASM engines, databases as in-memory engines, web frameworks in live-preview iframes. Answer two questions (level + goal) and the AI generates a grounded roadmap — topics expand on demand into sub-topics and concrete learning points, with continuous progress bars at every layer.

![Main menu, calibration and roadmap generation](docs/screenshots/onboarding.webp)

**Learn in a live workspace.** Each learning point becomes a micro-lesson: the tutor explains in chat (with inline links into official documentation), the editor holds starter code with a real gap to fill, and Run executes it instantly — the console output is graded deterministically against the lesson's objectives.

![Lesson — writing code and running it live](docs/screenshots/lesson-run.webp)

## How it works

- **In-browser runtimes** — JavaScript/TypeScript natively, Python (Pyodide), Ruby (ruby.wasm), PHP (php-wasm), Lua (fengari), PostgreSQL (PGlite), SQLite (sql.js), DuckDB (duckdb-wasm), React/Vue/Three.js in sandboxed live-preview iframes, and in-browser ML via transformers.js with model download progress and caching.
- **Snowflake roadmap generation** — one grounded LLM call builds the topic overview; each topic/sub-topic expands lazily with full-tree context so content never duplicates. Difficulty is calibrated to the learner's stated level.
- **Deterministic grading** — every objective carries a machine check (`stdout` match or code regex). The LLM never decides pass/fail; it only teaches — and it is explicitly forbidden from revealing the exercise's solution, guiding with analogous examples instead.
- **Self-healing lessons** — generated lessons are validated by actually running them: the reference solution must run clean and pass every check, the starter must not (there must be something to do), and impossible checks are re-grounded on the solution's real output. Broken pieces are regenerated automatically.
- **Official docs, embedded** — a Docs tab embeds DevDocs for the module's technology, and tutor messages deep-link terms straight to the exact documentation section.
- **Progress that follows you** — roadmaps, lesson state, and chat history persist per user (Supabase + Google login), with course management (sort, expand, delete) from the landing page. Completing an old lesson fast-forwards you to your actual frontier.
- **Read-aloud tutor** — neural text-to-speech on any chat message, with a native-voice fallback.

## Stack

Next.js (App Router, Turbopack) · React · Tailwind · Monaco editor · Supabase (auth + persistence) · Gemini (generation & tutoring) · WASM runtimes per module

---

<p align="center"><i>alpha — built as a hands-on exploration of AI-driven, execution-grounded learning.</i><br/>
Released under the <a href="LICENSE">MIT License</a>.</p>
