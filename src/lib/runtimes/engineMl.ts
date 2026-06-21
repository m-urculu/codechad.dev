// AI/ML engine — transformers.js (CDN ESM). The library is injected into the learner's
// code as `transformers` (with `pipeline` etc.). Models download from the HF hub on
// first use — the one sanctioned exception to the no-network rule.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, type OnLine } from "./exec";

const CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/+esm";

let tP: Promise<any> | null = null;

export async function runMl(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  if (!tP) {
    onLine({ kind: "system", text: loadNote || "Loading transformers.js…" });
    tP = extImport(CDN_URL);
    tP.catch(() => (tP = null));
  }
  let transformers: any;
  try {
    transformers = await tP;
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load transformers.js: " + String(e) });
    return;
  }
  const fmt = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a, null, 1);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  const sandboxConsole = {
    log: (...a: unknown[]) => onLine({ kind: "log", text: fmt(a) }),
    info: (...a: unknown[]) => onLine({ kind: "info", text: fmt(a) }),
    warn: (...a: unknown[]) => onLine({ kind: "warn", text: fmt(a) }),
    error: (...a: unknown[]) => onLine({ kind: "error", text: fmt(a) }),
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as any;
    const fn = new AsyncFunction("transformers", "pipeline", "console", code);
    await fn(transformers, transformers.pipeline, sandboxConsole);
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  }
}
