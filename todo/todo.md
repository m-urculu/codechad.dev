# Project To-Do List

## Open

### Runtimes

- [ ] Browser-verify pending engines: DuckDB, Vue, Three.js (+ first real-browser pass
  over Python/SQL/Ruby/PHP/React/ML, which are Node-verified). Status per engine:
  [docs/module-runtimes.md](../docs/module-runtimes.md).
- [ ] Future runtimes: C# (Blazor), Node.js (WebContainers behind COOP/COEP).
- [ ] SQL result grid (real table UI) instead of text tables; Python matplotlib surface.

### Lessons

- [ ] Error "Ask the tutor →" link under the console (opt-in).

### Code quality

- [ ] `ChatPanel.tsx`: the one remaining lint warning (`alignLatestToTop` missing from a
  hook's dependency list). Needs a click-through of chat scrolling to verify any change.

## Done

- [x] Roadmap client-side visualization (snowflake tree: grounded L1 overview + lazy L2/L3).
- [x] In-browser JavaScript runtime (Web Worker) + Run/Submit console.
- [x] Lesson objectives + progress meter + structured evaluation (bounds the lesson).
- [x] **Runtime output surfaces**: `Console | Preview` tabs; per-module engines via the
  runtime registry. See [docs/output-surfaces.md](../docs/output-surfaces.md).
- [x] Linux: built as a shell and commands on an in-memory filesystem
  (`src/lib/runtimes/engineLinux.ts`), not v86. The file explains why.
- [x] Supabase persistence: project restored, schema in `supabase/migrations/` (0001–0009),
  roadmap and chat saved and loaded per course (`/api/roadmap/state`, `/api/chat/state`).
- [x] Deterministic grading: every objective carries a machine check
  (`src/lib/agents/grade.ts`), and the reference solution is validated by running it
  (`src/lib/runtimes/validate.ts`).
- [x] Unit tests and CI. See [docs/testing-strategy.md](../docs/testing-strategy.md).
