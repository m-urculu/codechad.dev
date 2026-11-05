# Testing strategy

What is unit-tested, what deliberately is not, and why. The suite is organised around
the **promises the product makes to a learner**, not around files: each test file exists
because a specific promise would break without it.

Run the tests with:

```bash
npm test                               # run once
npx vitest                             # watch mode while writing tests
npx vitest run --reporter=verbose      # print every test name — reads as a spec
```

Stack: [Vitest](https://vitest.dev) 4.1 in a `node` environment, with
`vite-tsconfig-paths` so tests import through the same `@/` alias as the app
(`vitest.config.mts`).

Tests live in `tests/unit/`, mirroring the layout of `src/`, so `src/` holds only app
code and the test for a module is easy to find:

```
src/lib/agents/grade.ts      →  tests/unit/lib/agents/grade.test.ts
src/lib/courseProgress.ts    →  tests/unit/lib/courseProgress.test.ts
```

`tests/unit/` leaves room for other kinds of test (for example `tests/e2e/`) without
mixing them.

## The approach

Unit tests cover the **deterministic core**: code that takes data in and makes a
decision, with no AI, database or browser involved. Those decisions are where a bug
silently harms a learner (a correct answer marked wrong, a progress bar that lies), and
they are cheap to test because the same input always gives the same output.

Code that only talks to something outside the app (Gemini, Supabase, Stripe, the
browser) is left out of unit tests on purpose. See
[Deliberately not unit-tested](#deliberately-not-unit-tested).

## Promise 1: the learner is judged fairly

The heart of the product. If grading is wrong, a learner is failed on a correct answer
and the tutor goes hunting for a mistake that isn't there.

| Module | What the tests guarantee | Tests | Status |
|---|---|---|---|
| `src/lib/agents/grade.ts` | Pass/fail per objective: tolerant of the learner's debug output, strict about line order, collections compared by content not layout (including bare JavaScript object keys), but only at the top level of the output, and code that never compiled always fails | 31 | done |
| `src/lib/runtimes/consoleFormat.ts` | How a printed value becomes text: small collections inline, large ones indented, a real cycle prints `[Circular]` but a repeated object prints in full, functions and BigInts don't crash | 11 | done |
| Contract: `consoleFormat` → `grade` (`tests/unit/contracts/`) | Whatever the console prints for a value **passes** a check for the same value in any layout, and still fails for wrong or merely nested values | 10 | done |

The contract test joins two modules the way the running app does. It pins down a real
past bug, described at the top of `consoleFormat.ts`: three formatters disagreed, so a
lesson could be validated as solvable and then be impossible to pass in the learner's
console.

### Bugs these tests found

Writing the Promise 1 tests turned up three bugs. Each was fixed in its own `fix:`
commit with a regression test written first and seen to fail:

| Bug | Effect on a learner |
|---|---|
| `console.log([p, p])` printed `[{"a":1},"[Circular]"]` | Confusing output for correct code; a check repaired from that output would expect the wrong value |
| A check for `[1,2,3]` passed when the whole matrix `[[1,2,3],[4,5,6]]` was printed | A wrong answer passed because the right one was nested inside it |
| A check written as `{ name: 'Ada' }` failed against the printed `{"name":"Ada"}` | A correct answer failed over key quoting |

## Promise 2: progress is honest

| Module | What the tests guarantee | Tests | Status |
|---|---|---|---|
| `src/lib/courseProgress.ts` | Each level weights its direct children equally; unexplored branches count as 0; the 0.999 floating-point threshold; a ratio never exceeds 1 | 17 | done |
| `src/lib/skills.ts` | "Don't re-teach what was finished": `skillKey` treats "Introduction to Functions" and "Functions" as the same and ignores word order; `deriveSkills` records a finished topic as **one** entry, not one per lesson, and ignores unfinished work; `knownSkillsBlock` labels other-language skills as a weaker signal and caps each list | 15 | done |

See [skills-ledger.md](skills-ledger.md) for the design these tests protect.

## Promise 3: the curriculum matches the learner's level

| Module | What the tests guarantee | Tests | Status |
|---|---|---|---|
| `src/lib/agents/level.ts` (`tierOf`) | Free-text level → tier: "Experienced" → advanced, "some experience" → **intermediate** (the check order exists for exactly this case), empty → beginner, unrecognised → intermediate | 19 | done |
| `src/lib/paths.ts` | Career paths: ids follow the `t0` / `t0-s1` scheme; foundation courses condensed for experienced learners and paired for intermediate ones; everything else untouched | 16 | done |
| `src/lib/curricula.ts` | Fixed language curricula: lessons are leaves with `children: []` so nothing is generated; the tree is the same at every level; lesson counts are correct | 9 | done |

See [learning-paths.md](learning-paths.md) for how paths are meant to work.

**Bug found and fixed:** `tierOf` read a negation as its opposite. "Not experienced"
and "not very experienced" both mapped to **advanced** (the keyword "experienc" matched and
"not" was ignored), so a learner who said they were new was given condensed foundation
courses. The mirror case failed too: "Years of experience, not a beginner" mapped to
beginner. Negated phrases of both kinds are now set aside first and the rest is judged by
keyword; when nothing positive remains, the negations decide.

## Promise 4: messy AI output doesn't break the app

Gemini itself cannot be unit-tested, but the code that cleans up its replies can.

| Module | What the tests guarantee | Tests | Status |
|---|---|---|---|
| `src/lib/agents/snowflake.ts` (`extractJSON`) | Pulls JSON out of fenced replies and chatty text ("Sure! Here's your roadmap: {…}"), handles arrays, returns `null` on garbage instead of throwing | ~7 | planned |
| `src/lib/agents/snowflake.ts` (`courseTitle`) | Strips quotes and trailing punctuation from AI titles, caps them at 80 characters, falls back when empty | ~5 | planned |

## Promise 5: billing and the UI stay consistent

| Module | What the tests guarantee | Tests | Status |
|---|---|---|---|
| `src/lib/courseCache.ts` (`mergeCourses`) | The server's list always wins, but unchanged courses keep the **same object**, so React does not re-render them | ~5 | planned |
| `src/lib/billing.ts` (`withdrawalDeadline`) | The EU withdrawal window is exactly 14 days after purchase | ~2 | optional |

`billing.ts` imports `server-only` and the Supabase admin client, so testing it needs a
module mock. It is the one place in this plan that does, which is why it is optional.

## Deliberately not unit-tested

| What | Why | Covered instead by |
|---|---|---|
| Gemini calls (`generateOverview`, `buildLesson`, `llm.ts`) | Non-deterministic; faking them mostly tests the fake | The reply-cleanup tests in Promise 4 |
| Supabase, Stripe, auth, rate limiting | External services | `npm run check:erasure` (run manually; needs the service-role key) |
| In-browser runtimes (`src/lib/runtimes/engine*.ts`) | Need a real browser and WebAssembly | Out of scope; would need browser tests |
| Private helpers in `lesson.ts` (`scrub`, `parseCheck`) | Not exported; exporting them only to test them would change app code | Possible later |
| UI components | Slow to write and brittle against design changes | Out of scope |

## Practices

1. **Test names describe behaviour.** "fails when an unrelated line splits the
   expected block", not "test 3". With `--reporter=verbose` the names read as a spec.
2. **One rule per test.** When a test fails, its name says which rule broke.
3. **Arrange → Act → Assert.** Build the input, call the function once, check the result.
4. **Small hand-made fixtures, not real data.** Tests survive curriculum edits, and
   every expected number can be checked by hand. The exception is a few deliberate
   checks on the real `PATHS` and `CURRICULA` data, which catch editing mistakes.
5. **Test through the public API.** Private functions are not exported just to be tested.
6. **No network, no clock, no randomness.** Every run gives the same result, which is
   what lets CI trust the suite.
7. **Tests never change app code.** A test that exposes a bug is reported and the bug
   is fixed in its own `fix:` commit.
8. **Coverage is information, not a goal.** `vitest --coverage` shows what is untested;
   chasing 100% is not the aim.

## Roadmap

About 110 tests across 10 files.

| Phase | Content | Commit |
|---|---|---|
| 2 | Vitest setup and `grade.ts` | `test: add Vitest and cover gradeSubmission output matching` (done) |
| 2b | The three `it.todo` cases in `grade.test.ts` | `test: cover line order, empty output and invalid-regex fallback in gradeSubmission` (done) |
| 3 | Promise 1 (consoleFormat + contract test) and Promise 2, plus three grading and formatting fixes | one `test:` commit per file and one `fix:` commit per bug (done) |
| 4 | Promise 3 | one `test:` commit per file (done) |
| 5 | Promise 4 and `mergeCourses` | `test: cover AI reply parsing and course cache merging` |
| 6 | CI workflow, README badge and "Testing" section | `ci: run lint, type check and tests on every push` |
| optional | `billing.ts` with module mocks | — |

Open before CI: `npm run lint` currently crashes. `eslint.config.mjs` loads
`eslint-config-next` 16 through `FlatCompat`, which fails with "Converting circular
structure to JSON". CI can only run lint once that config is fixed.
