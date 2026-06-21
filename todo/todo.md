# Project To-Do List

## Pinned ideas

- [x] **Runtime output surfaces** — built: `Console | Preview` tabs; per-module engines
  via the runtime registry. See [docs/module-runtimes.md](../docs/module-runtimes.md).
- [ ] Browser-verify pending engines: DuckDB, Vue, Three.js (+ first real-browser pass
  over Python/SQL/Ruby/PHP/React/ML, which are Node-verified).
- [ ] Future runtimes: C# (Blazor), Node.js (WebContainers behind COOP/COEP), Linux (v86).
- [ ] SQL result grid (real table UI) instead of text tables; Python matplotlib surface.

## Supabase persistence (BLOCKED — project paused)

- [ ] **Resume the Supabase project** — `pdbccmdzofcqlhtoatxe.supabase.co` does not resolve
  (free-tier auto-pause). Restore it from the Supabase dashboard before the DB work can run.
- [ ] Apply migration `supabase/migrations/0001_user_roadmap_state.sql` (table is written; run once project is up).
- [ ] Wire load-on-start + save-on-change into EditorPanels/ChatPanel (util + route already built:
  `api/supabase/roadmap-state.ts`, `api/roadmap/state/route.ts`, fail-soft). Persist the per-node
  lesson cache + tree so progress survives sessions (in-memory retention already works).

## Lesson engine (snowflake)

- [ ] Step 2 — stored-solution / hidden-test validation (deterministic, not only AI-judge).
- [ ] Error "Ask the tutor →" link under the console (opt-in).

## Done

- [x] Roadmap client-side visualization (snowflake tree: grounded L1 overview + lazy L2/L3).
- [x] In-browser JavaScript runtime (Web Worker) + Run/Submit console.
- [x] Lesson objectives + progress meter + structured evaluation (bounds the lesson).
