// Snowflake roadmap generation — progressive, grounded, calibrated.
//
// L1 generateOverview: one grounded (googleSearch) call -> topic nodes.
// L2/L3 expandNode:     grounded call per node -> sub-topics / learning points.
// Each layer runs only when the user reaches it. See docs/roadmap-snowflake-architecture.md

/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenAI } from "@google/genai";

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

const MODEL = "gemini-2.5-flash";

// Grounded text generation (Google Search tool). Returns text + source URLs.
export async function groundedText(prompt: string): Promise<{ text: string; sources: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { text: "", sources: [] };
  const ai = new GoogleGenAI({ apiKey });
  const res: any = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });
  const text: string =
    res?.text ??
    res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ??
    "";
  const chunks: any[] = res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => c?.web?.uri)
    .filter((u: unknown): u is string => typeof u === "string")
    .slice(0, 6);
  return { text, sources };
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
export async function generateOverview(input: {
  skill: string;
  level?: string;
  goal?: string;
}): Promise<Roadmap | null> {
  const { skill, level, goal } = input;
  const prompt =
    `Using REAL, current official documentation and widely-accepted best practices, ` +
    `design a learning roadmap OVERVIEW for "${skill}".\n` +
    `Learner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
    `Calibrate the number of topics to what is genuinely needed (typically 6-10), fundamentals first.\n` +
    `Return ONLY JSON: {"title": string, "summary": string, "topics": [{"title": string, "summary": string, "description": string}]}.`;

  const { text, sources } = await groundedText(prompt);
  const data = extractJSON(text);
  if (!data || !Array.isArray(data.topics) || data.topics.length === 0) return null;

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
export async function expandNode(input: {
  skill: string;
  level?: string;
  goal?: string;
  kind: NodeKind;
  title: string;
  parentId: string;
  path: string[]; // ancestor titles -> this node
}): Promise<RoadmapNode[]> {
  const { skill, level, goal, kind, title, parentId, path } = input;
  const trail = path.join(" > ");

  let prompt: string;
  let childKind: NodeKind;

  if (kind === "topic") {
    childKind = "subtopic";
    prompt =
      `Using REAL official documentation and best practices for "${skill}", ` +
      `list the FOUNDATIONAL sub-topics required to learn the topic "${title}" (path: ${trail}).\n` +
      `Learner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}. Calibrate the count to what's needed.\n` +
      `Return ONLY JSON: {"children": [{"title": string, "summary": string, "description": string}]}.`;
  } else {
    // subtopic -> ordered learning points
    childKind = "point";
    prompt =
      `For the sub-topic "${title}" within "${skill}" (path: ${trail}), ` +
      `list the ORDERED learning POINTS needed to fully master it — each a concrete, teachable unit ` +
      `(a specific skill, concept, or function), grounded in official documentation/best practices.\n` +
      `Learner level: ${level ?? "unknown"}. Goal: ${goal ?? "general mastery"}.\n` +
      `Return ONLY JSON: {"children": [{"title": string, "summary": string}]}.`;
  }

  const { text } = await groundedText(prompt);
  const data = extractJSON(text);
  const arr: any[] = Array.isArray(data?.children) ? data.children : [];
  const tag = childKind === "subtopic" ? "s" : "p";
  return arr.slice(0, 14).map((c, i) => mkNode(`${parentId}-${tag}${i}`, childKind, c));
}
