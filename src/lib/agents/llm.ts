// Low-level Gemini helpers for the agent pipeline.
//
// Distinct from src/lib/gemini.ts (which strips everything but the first {...}
// JSON block — good for classifiers, bad for prose that contains code braces).
// Here we keep two clean primitives: geminiText (raw markdown) and geminiJSON
// (forced application/json via responseMimeType), both with an optional system
// instruction.

import { GEMINI_MODELS } from "./models";

type GeminiOpts = { system?: string; json?: boolean };

/**
 * The whole text of a Gemini reply. A candidate's content arrives as a LIST of parts,
 * and a long answer is often split across several; reading only parts[0] is what cut
 * tutor replies off mid-sentence ("…or use `\n"). Parts flagged `thought` are the
 * model's reasoning, not the answer, and are skipped.
 */
export function replyText(data: unknown): string {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
    ?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((p) => !p?.thought).map((p) => p?.text ?? "").join("") : "";
}

async function gemini(prompt: string, opts: GeminiOpts = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    return "";
  }
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.json) body.generationConfig = { responseMimeType: "application/json" };

  // Try each model in the fallback order. A 429 means that model's free-tier daily
  // quota is spent — move to the next model rather than failing the request. Retry
  // once per model on transient 5xx / empty result.
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error(`Gemini ${res.status} on ${model} (attempt ${attempt + 1})`);
          if (res.status === 429) break;      // quota for this model spent → next model
          if (res.status >= 500) continue;     // transient → retry same model
          return "";                            // other 4xx → give up
        }
        const data = await res.json();
        const text = replyText(data);
        if (text) return text;
      } catch (e) {
        console.error(`Gemini fetch error on ${model} (attempt ${attempt + 1}):`, e);
      }
    }
  }
  return "";
}

/** Raw markdown/text response (use for tutor replies, narration). */
export async function geminiText(prompt: string, system?: string): Promise<string> {
  return gemini(prompt, { system });
}

/** Forced-JSON response, parsed. Returns null if it can't be parsed. */
export async function geminiJSON<T = unknown>(prompt: string, system?: string): Promise<T | null> {
  const text = await gemini(prompt, { system, json: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    console.error("geminiJSON: could not parse:", text.slice(0, 200));
    return null;
  }
}
