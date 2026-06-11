# Project To-Do List

## Pinned ideas

- [ ] **Runtime output surfaces** — pluggable per-runtime output in the workspace
  (`Console | Preview` tabs). First target: JS **DOM preview** via a sandboxed-iframe
  runtime for "Web & UI" lessons. See [docs/output-surfaces.md](../docs/output-surfaces.md).

## Lesson engine (snowflake)

- [ ] Step 2 — stored-solution / hidden-test validation (deterministic, not only AI-judge).
- [ ] Persist roadmap tree + objective progress to Supabase (survives sessions).
- [ ] Error "Ask the tutor →" link under the console (opt-in).

## Done

- [x] Roadmap client-side visualization (snowflake tree: grounded L1 overview + lazy L2/L3).
- [x] In-browser JavaScript runtime (Web Worker) + Run/Submit console.
- [x] Lesson objectives + progress meter + structured evaluation (bounds the lesson).
