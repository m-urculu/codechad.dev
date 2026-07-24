// Off-screen solution validation: run a lesson's reference solution in its REAL
// runtime without touching the visible editor/preview, and return any console error
// text it produced (or null if it ran clean). Used by the client to background-verify
// generated lessons; on error the caller regenerates the solution via
// /api/lesson/fix-solution and re-validates.

import type { RuntimeSpec } from "./registry";
import type { OutLine } from "./javascript";
import { runWeb } from "./web";

const SAFETY_MS = 8000;

export type RunProbe = { error: string | null; output: string };

export async function findRuntimeErrors(
  spec: RuntimeSpec,
  code: string,
  html: string
): Promise<RunProbe> {
  const errors: string[] = [];
  const out: string[] = [];
  const onLine = (l: OutLine) => {
    if (l.kind === "error") errors.push(l.text);
    if (l.kind === "log" || l.kind === "info" || l.kind === "warn") out.push(l.text);
  };

  const useIframe = spec.engine === "iframe-web" || (spec.allowDom && !!html);
  try {
    if (useIframe) {
      // A throwaway, off-screen sandboxed iframe — never shown to the learner.
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.style.cssText =
        "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;border:0;visibility:hidden";
      document.body.appendChild(iframe);
      try {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              resolve();
            }
          };
          runWeb({ iframe, html, js: code, libs: spec.iframeLibs, onLine, onDone: finish });
          setTimeout(finish, SAFETY_MS); // don't hang if the run never signals done
        });
      } finally {
        iframe.remove();
      }
    } else {
      // Worker / main-thread WASM engines capture errors through the same OnLine sink.
      const { startRun } = await import("./exec");
      const handle = await startRun(spec, code, onLine);
      await Promise.race([
        handle.done,
        new Promise<void>((r) => setTimeout(r, SAFETY_MS)),
      ]);
    }
  } catch (e) {
    errors.push(String(e));
  }

  return { error: errors.length ? errors.join("\n") : null, output: out.join("\n") };
}
