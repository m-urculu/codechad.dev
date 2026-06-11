# Roadmap — Snowflake Generation Architecture

The roadmap is generated **progressively** ("snowflake"): each layer is its own call,
generated **on demand**, **calibrated** to the learner's `{level, goal}`, and **backed
by real documentation** (Gemini + Google Search grounding) where appropriate.

## Layers (each = a separate call)

| Layer | Call | Grounding | Trigger | Output |
|---|---|---|---|---|
| **L1 — Overview topics** | `generateOverview(skill, level, goal)` | googleSearch (1 deep call) | calibration done | ordered topic nodes |
| **L2 — Foundational sub-topics** | `expandNode(topic)` | googleSearch per topic (docs + best practices) | expand a topic | sub-topic nodes |
| **L3 — Learning points** | `expandNode(subtopic)` | grounded / generated | expand a sub-topic | ordered points to master the sub-topic |
| **L4 — Lesson** | `buildLesson(point)` *(later)* | generated (+ search for examples) | open a point | explanation · examples · exercise · **stored solution** |
| **Validate** | `checkSolution(submission)` *(later)* | tests + LLM judge | submit in editor | pass/fail + feedback |

Tree shape: **Skill → Topic → Sub-topic → Point(lesson + exercise + solution)**.

## Data model (lazy tree)

```ts
type NodeKind = "topic" | "subtopic" | "point";
type RoadmapNode = {
  id: string;            // path-stable: t0, t0-s1, t0-s1-p2
  kind: NodeKind;
  title: string;
  summary: string;
  description?: string;
  children: RoadmapNode[] | null;  // null = expandable, not yet generated
  sources?: string[];              // grounding citations (real-data backing)
};
type Roadmap = {
  skill: string; title: string; summary: string;
  level?: string; goal?: string; sources?: string[];
  topics: RoadmapNode[];           // L1
};
```

## Principles

- **Lazy:** a layer's call runs only when the user expands into it — never generate the
  whole tree up front.
- **Calibrated:** counts/depth scale with `{level, goal}` (beginner → more foundational
  points; advanced → fewer, deeper). The model is told to size it.
- **Grounded:** L1/L2 use the `googleSearch` tool (real docs/best-practices); citations
  stored in `sources`. L3/L4 default to generated, search where it adds value.
- **Persisted (later):** each generated node cached in Supabase keyed by `id`/path so a
  call runs once and the tree grows permanently.

## Build order

1. Expandable vertical tree UI (replaces the static Mermaid diagram). ✅ this increment
2. L1 grounded overview (`/api/roadmap/generate`). ✅ this increment
3. L2/L3 on-expand (`/api/roadmap/expand`). ✅ this increment
4. L4 `buildLesson` → lesson into chat + starter code/exercise into the editor.
5. `checkSolution` validation against the stored solution.
6. Supabase persistence across all layers.

## Current status

L1–L3 (tree + grounded overview + on-expand sub-topics/points) implemented.
A point's "Start lesson" currently routes to the existing tutor lesson; the dedicated
L4 lesson+exercise+solution and validation are the next increments.
