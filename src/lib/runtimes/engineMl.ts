// AI/ML engine — transformers.js, executed inside a hidden same-origin iframe that
// loads the static runner page /public/ml-runner.html.
//
// Why an iframe (vs a main-thread AsyncFunction): un-awaited promises in learner code
// (`pipeline(...).then(...)` with no await) reject AFTER the sandbox function returns.
// On the main window those become global unhandled rejections, which Next's dev overlay
// reports regardless of preventDefault. In the iframe they hit the runner's own window,
// where its shim turns them into ordinary console error lines.
//
// Why a real page (vs srcdoc): a proper URL context makes storage behave like the main
// document, so the Cache API that transformers.js uses for model weights works reliably
// and models persist across runs.
//
// The returned handle's cancel() tears the iframe down, which aborts in-flight model
// downloads and silences the run — so starting a new Run (CodeHere calls cancelAll())
// or pressing Stop really kills the previous run instead of leaving a zombie that
// keeps downloading and spamming the console.

import type { OnLine, RunHandle } from "./exec";

const RUNNER_URL = "/ml-runner.html";
const LINGER_MS = 10_000; // keep the frame after done so late async errors still surface

let announcedLoad = false;

export function startMl(code: string, onLine: OnLine, loadNote?: string): RunHandle {
  if (!announcedLoad) {
    announcedLoad = true;
    onLine({ kind: "system", text: loadNote || "Loading transformers.js…" });
  }

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;border:0;visibility:hidden";
  iframe.src = RUNNER_URL;

  let settled = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const dispose = () => {
    window.removeEventListener("message", handler);
    iframe.remove();
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    resolveDone();
    setTimeout(dispose, LINGER_MS); // late errors from stray promises still get posted
  };
  const handler = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return;
    const d = e.data as { __ml?: boolean; kind?: string; text?: string };
    if (!d || !d.__ml) return;
    if (d.kind === "ready") {
      iframe.contentWindow?.postMessage({ __mlExec: true, code }, "*");
      return;
    }
    if (d.kind === "done") {
      finish();
      return;
    }
    onLine({ kind: (d.kind as "log" | "info" | "warn" | "error" | "system") || "log", text: d.text ?? "" });
  };

  window.addEventListener("message", handler);
  document.body.appendChild(iframe);

  return {
    done,
    cancel: () => {
      settled = true;
      resolveDone();
      dispose();
    },
  };
}
