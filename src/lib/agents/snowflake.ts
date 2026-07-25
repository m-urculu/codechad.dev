// Snowflake roadmap generation — progressive, grounded, calibrated.
//
// L1 generateOverview: one grounded (googleSearch) call -> topic nodes.
// L2/L3 expandNode:     grounded call per node -> sub-topics / learning points.
// Each layer runs only when the user reaches it. See docs/roadmap-snowflake-architecture.md

/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "./models";

export type NodeKind = "topic" | "subtopic" | "point";

export type RoadmapNode = {
  id: string;
  kind: NodeKind;
  title: string;
  summary: string;
  description?: string;
  children: RoadmapNode[] | null; // null = expandable but not yet generated
  sources?: string[];
};

export type Roadmap = {
  skill: string;
  title: string;
  summary: string;
  level?: string;
  goal?: string;
  sources?: string[];
  topics: RoadmapNode[];
};

// Grounded text generation (Google Search tool) with the full model-fallback chain.
// For each model in GEMINI_MODELS: try grounded first (source URLs), then ungrounded —
// grounding has no free-tier quota (429 RESOURCE_EXHAUSTED) and some models don't
// support the tool at all. Any per-model failure moves down the chain instead of
// failing the request; only an exhausted chain returns empty text.
export async function groundedText(prompt: string): Promise<{ text: string; sources: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { text: "", sources: [] };
  const ai = new GoogleGenAI({ apiKey });
  for (const model of GEMINI_MODELS) {
    for (const grounded of [true, false]) {
      let res: any;
      try {
        res = await ai.models.generateContent({
          model,
          contents: prompt,
          ...(grounded ? { config: { tools: [{ googleSearch: {} }] } } : {}),
        });
      } catch (err: any) {
        console.warn(
          `[snowflake] ${model}${grounded ? " (grounded)" : ""} failed:`,
          err?.message ?? err
        );
        continue;
      }
      const text: string =
        res?.text ??
        res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ??
        "";
      if (!text) continue;
      const chunks: any[] = res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => c?.web?.uri)
        .filter((u: unknown): u is string => typeof u === "string")
        .slice(0, 6);
      return { text, sources };
    }
  }
  return { text: "", sources: [] };
}

// Robustly pull a JSON value out of a (possibly fenced / chatty) grounded reply.
export function extractJSON(text: string): any | null {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    /* try to slice */
  }
  const candidates = ["{", "["].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);
  const close = t[start] === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  if (end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

// One grounded call + JSON extraction with a single retry. The grounded endpoint
// occasionally returns an empty/blocked/chatty reply or a transient 5xx — that must
// cost one retry, not surface as a user-facing "could not generate" failure. Always
// logs the offending reply so silent nulls are diagnosable from the server log.
async function groundedJSON(
  prompt: string,
  valid: (d: any) => boolean
): Promise<{ data: any | null; sources: string[] }> {
  let sources: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await groundedText(prompt);
      sources = r.sources;
      const data = extractJSON(r.text);
      if (data && valid(data)) return { data, sources };
      console.warn(
        `[snowflake] bad reply (attempt ${attempt}, ${r.text.length} chars): ${r.text.slice(0, 200)}`
      );
    } catch (err) {
      console.warn(`[snowflake] call failed (attempt ${attempt}):`, err);
    }
  }
  return { data: null, sources };
}

function mkNode(id: string, kind: NodeKind, raw: any): RoadmapNode {
  return {
    id,
    kind,
    title: String(raw?.title ?? "").trim(),
    summary: String(raw?.summary ?? "").trim(),
    description: String(raw?.description ?? "").trim(),
    children: kind === "point" ? [] : null, // points are leaves (-> lesson)
  };
}

// L1: grounded overview of the whole skill.
// One of the learner's OTHER courses for the same technology. Its topics are ground
// they have already been given, so a new course should not rebuild them.
export type SiblingCourse = { name: string; goal?: string; topics: string[] };

export async function generateOverview(input: {
  skill: string;
  level?: string;
  goal?: string;
  runtimeNotes?: string;
  /** Other courses the learner has for this same technology. */
  siblings?: SiblingCourse[];
  /** A topic list the learner edited by hand, used as a strong draft. */
  draftTopics?: string[];
  /** Free-text steer from the learner ("assume I know general Python syntax"). */
  guidance?: string;
}): Promise<Roadmap | null> {
  const { skill, level, goal, runtimeNotes, siblings, draftTopics, guidance } = input;

  // Only siblings that actually got as far as having topics are useful context.
  const covered = (siblings ?? []).filter((s) => s.topics.length > 0);

  const prompt =
    `Using REAL, current official documentation and widely-accepted best practices, ` +
    `design a learning roadmap OVERVIEW for "${skill}".\n` +
    `Learner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    (covered.length
      ? `ALREADY COVERED — the learner has these OTHER "${skill}" courses. Treat everything listed as ground they have already been taught:\n` +
        covered
          .map(
            (s) =>
              `  • "${s.name}"${s.goal ? ` (goal: ${s.goal})` : ""}: ${s.topics.slice(0, 20).join("; ")}`
          )
          .join("\n") +
        `\nDo NOT rebuild that material. This course must earn its place beside those: spend its topics on what THIS goal ("${goal ?? "general mastery"}") needs and the other courses do not deliver. ` +
        `If a covered concept is a genuine prerequisite, you may assume it rather than teach it. Only re-teach something already covered when this goal demands a materially different treatment of it — and say so in that topic's description.\n`
      : "") +
    (draftTopics?.length
      ? `LEARNER'S DRAFT TOPIC LIST — the learner wrote this themselves and it carries more weight than your own preferences:\n` +
        draftTopics.map((t, i) => `  ${i + 1}. ${t}`).join("\n") +
        `\nKeep every one of these topics, keeping their wording unless it is plainly wrong. You MAY insert missing prerequisites, split an overloaded topic, or reorder for difficulty — but never silently drop one.\n`
      : "") +
    (guidance
      ? `LEARNER'S GUIDANCE (follow it): ${String(guidance).slice(0, 600)}\n`
      : "") +
    (runtimeNotes
      ? `CONTEXT — the learner studies entirely INSIDE a browser learning app with a built-in editor and runtime (${runtimeNotes}). ` +
        `NEVER include topics about installing the language, setting up environments/editors/IDEs, or running scripts from a terminal — the environment already exists. ` +
        `Skip topics that cannot be practiced in that sandbox (real file I/O, OS integration, networking, C APIs) unless they are core to the skill and can be simulated.\n`
      : "") +
    `Calibrate the number of topics to what is genuinely needed (typically 6-10), fundamentals first.\n` +
    `CALIBRATE TO THE LEVEL: if the learner is new/a beginner, the FIRST topics must start from absolute basics — the simplest possible reading and writing of the language — and ramp up gradually. Edge-case material (overflow, precision pitfalls, performance tuning) belongs AFTER the plain everyday operations it qualifies, never in the opening topics.\n` +
    `Topics MUST be MUTUALLY EXCLUSIVE: every concept appears in exactly ONE topic. No umbrella topics that restate other topics, no two topics covering the same ground (e.g. don't list "Variables and Data Types" AND "Data Types and Operators").\n` +
    `Return ONLY JSON: {"title": string, "summary": string, "topics": [{"title": string, "summary": string, "description": string}]}.`;

  const { data, sources } = await groundedJSON(
    prompt,
    (d) => Array.isArray(d?.topics) && d.topics.length > 0
  );
  if (!data) return null;

  return {
    skill,
    level,
    goal,
    sources,
    title: String(data.title ?? `${skill} Roadmap`).trim(),
    summary: String(data.summary ?? "").trim(),
    topics: data.topics.slice(0, 12).map((t: any, i: number) => mkNode(`t${i}`, "topic", t)),
  };
}

// L2/L3: expand one node into its children (sub-topics, then learning points).
// `treeOutline` = the WHOLE module tree generated so far ("◀ CURRENT" marks this node) —
// global context so children never duplicate content that exists anywhere, and the
// progression (earlier = already learned, later = deferred) is respected.
export async function expandNode(input: {
  skill: string;
  level?: string;
  goal?: string;
  kind: NodeKind;
  title: string;
  parentId: string;
  path: string[]; // ancestor titles -> this node
  treeOutline?: string;
  runtimeNotes?: string;
}): Promise<RoadmapNode[]> {
  const { skill, level, goal, kind, title, parentId, path, treeOutline, runtimeNotes } = input;
  const trail = path.join(" > ");

  const common =
    `Learner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    (treeOutline
      ? `FULL ROADMAP SO FAR ("◀ CURRENT" marks the node you are expanding, "✓done" marks completed):\n${treeOutline.slice(0, 8000)}\n` +
        `Use this context strictly: (a) children must NOT duplicate content that appears ANYWHERE else in the roadmap, ` +
        `(b) treat everything BEFORE the current node as already learned — build on it, never recap it, ` +
        `(c) leave material that belongs to LATER nodes to those nodes.\n`
      : "") +
    `STRICT DECOMPOSITION: children must break down ONLY the content of "${title}" itself. ` +
    `NO prerequisite/review/"getting started" children, NO installation or environment-setup items, ` +
    `NO recaps of other parts of the roadmap.\n` +
    (runtimeNotes
      ? `The learner practices inside a browser sandbox (${runtimeNotes}) — exclude children that can't be practiced or simulated there.\n`
      : "");

  let prompt: string;
  let childKind: NodeKind;

  if (kind === "topic") {
    childKind = "subtopic";
    prompt =
      `Using REAL official documentation and best practices for "${skill}", ` +
      `decompose the topic "${title}" (path: ${trail}) into its foundational sub-topics.\n` +
      common +
      `Typically 4-8 sub-topics — only what this topic genuinely contains.\n` +
      `Return ONLY JSON: {"children": [{"title": string, "summary": string, "description": string}]}.`;
  } else {
    // subtopic -> ordered learning points
    childKind = "point";
    prompt =
      `For the sub-topic "${title}" within "${skill}" (path: ${trail}), ` +
      `list the ORDERED learning POINTS needed to fully master it — each a concrete, teachable unit ` +
      `(a specific skill, concept, or function), grounded in official documentation/best practices.\n` +
      common +
      `Typically 4-8 points — only what this sub-topic genuinely contains.\n` +
      `Return ONLY JSON: {"children": [{"title": string, "summary": string}]}.`;
  }

  const { data } = await groundedJSON(
    prompt,
    (d) => Array.isArray(d?.children) && d.children.length > 0
  );
  const arr: any[] = Array.isArray(data?.children) ? data.children : [];
  const tag = childKind === "subtopic" ? "s" : "p";
  return arr.slice(0, 10).map((c, i) => mkNode(`${parentId}-${tag}${i}`, childKind, c));
}
