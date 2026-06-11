# Runtime Output Surfaces (pinned design decision)

**Decision:** a code runtime's *output* is a **per-runtime, pluggable surface** shown in the
right-side **workspace** (next to the editor) — NOT a left tab, NOT a global JS-only feature.
The left rail stays for **consultation** (Chat, Roadmap); outputs live with the editor.

## The idea
Originally raised as "a left tab for viewing UI elements for JavaScript." Reframed: a DOM
preview is just one **output surface** (same category as the console). Each runtime declares
which surface(s) it uses, so it generalizes across all languages instead of bolting on a
JS-only panel.

| Language / context | Output surface(s) |
|---|---|
| JS — **Web & UI** goal | **DOM preview (iframe)** + console |
| JS — logic / interview goal | console only |
| Python (data) | console + **plot/table** (matplotlib / pandas) |
| SQL | **result grid** |
| Ruby / C# / etc. | console |

The learner's **goal** (from calibration: e.g. "Web & UI" vs "Coding interviews") and the
lesson can decide *whether* a surface like Preview is even shown.

## UI shape
Editor panel gets output **tabs: `Console | Preview`** (extensible to `Table`, `Plot`, …).
Preview appears only for web-oriented JS lessons.

## The one real cost
The current JS runtime is a **Web Worker** (`src/lib/runtimes/javascript.ts`) — isolated and
hard-killable, but **no DOM**. A DOM preview needs the code to run in a **sandboxed iframe**
(`sandbox="allow-scripts"`), which has a DOM but loses the worker's clean infinite-loop
termination (mitigate by tearing down the iframe). So:
- web-JS lessons → **iframe runtime** (preview + captured console),
- console-only JS → can stay on the **worker** runtime.

Two runtime paths behind one Run button, selected by lesson/runtime type.

## Status
Pinned / not yet built. Design the output pane as pluggable surfaces now; build the JS DOM
preview (iframe runtime + `Console | Preview` tabs) when we return to it. Python-plot and
SQL-grid surfaces slot into the same mechanism later.
