// PHP engine — php-wasm (CDN ESM). One PhpWeb instance per session; each .run() is a
// separate request-like execution. stdout/stderr stream via events.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, type OnLine } from "./exec";

// jsdelivr refuses php-wasm (package > 150 MB limit) — unpkg serves it fine.
const CDN_URL = "https://unpkg.com/php-wasm@0.1.0/PhpWeb.mjs";

let phpP: Promise<any> | null = null;

async function getPhp(onLine: OnLine, loadNote?: string): Promise<any> {
  if (!phpP) {
    onLine({ kind: "system", text: loadNote || "Loading PHP…" });
    phpP = (async () => {
      const { PhpWeb } = await extImport(CDN_URL);
      const php = new PhpWeb();
      await new Promise<void>((resolve) => php.addEventListener("ready", () => resolve()));
      return php;
    })();
    phpP.catch(() => (phpP = null));
  }
  return phpP;
}

export async function runPhp(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let php: any;
  try {
    php = await getPhp(onLine, loadNote);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the PHP runtime: " + String(e) });
    return;
  }
  const out = (e: any) => {
    const text = (e.detail ?? "").toString();
    if (text.trim()) onLine({ kind: "log", text: text.replace(/\n$/, "") });
  };
  const err = (e: any) => {
    const text = (e.detail ?? "").toString();
    if (text.trim()) onLine({ kind: "error", text: text.replace(/\n$/, "") });
  };
  php.addEventListener("output", out);
  php.addEventListener("error", err);
  try {
    // php-wasm expects the script text; ensure a <?php opener exists.
    const src = code.trimStart().startsWith("<?") ? code : "<?php\n" + code;
    await php.run(src);
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  } finally {
    php.removeEventListener("output", out);
    php.removeEventListener("error", err);
  }
}
