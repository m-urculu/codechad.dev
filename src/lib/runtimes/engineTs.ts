// TypeScript engine — strip types with sucrase (CDN, cached), then run the resulting
// JavaScript in the hard-killable Web Worker sandbox.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, type RunHandle, type OnLine } from "./exec";
import { runJavaScript } from "./javascript";

let sucraseP: Promise<any> | null = null;

export async function runTypeScript(code: string, onLine: OnLine): Promise<RunHandle> {
  if (!sucraseP) {
    onLine({ kind: "system", text: "Loading TypeScript compiler (first run only)…" });
    sucraseP = extImport("https://cdn.jsdelivr.net/npm/sucrase@3.35.0/+esm");
    sucraseP.catch(() => (sucraseP = null));
  }
  let js: string;
  try {
    const sucrase = await sucraseP;
    js = sucrase.transform(code, { transforms: ["typescript"] }).code;
  } catch (e: any) {
    onLine({ kind: "error", text: "TypeScript error: " + (e?.message || String(e)) });
    return { done: Promise.resolve(), cancel: () => {} };
  }
  const h = runJavaScript(js, onLine);
  return { done: h.promise, cancel: h.cancel };
}
