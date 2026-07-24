"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { OutLine } from "@/lib/runtimes/javascript";
import { runWeb, type WebRunHandle } from "@/lib/runtimes/web";
import { getRuntime } from "@/lib/runtimes/registry";
import type { RunHandle } from "@/lib/runtimes/exec";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type LoadCode = { code: string; html?: string; nonce: number } | null;

const LINE_COLOR: Record<OutLine["kind"], string> = {
  log: "text-green-400",
  info: "text-sky-300",
  warn: "text-yellow-300",
  error: "text-red-400",
  system: "text-white/50",
};

export default function CodeHere({
  moduleId,
  onSubmit,
  onCodeChange,
  loadCode,
}: {
  moduleId?: string | null;
  onSubmit?: (code: string, output: string) => void;
  onCodeChange?: (code: string) => void;
  loadCode?: LoadCode;
}) {
  const spec = getRuntime(moduleId);

  const codeRef = useRef<string>(spec.defaultCode);
  // Suppress the onChange that Monaco fires when WE set the value programmatically
  // (module switch / lesson load), so a load isn't mistaken for a learner edit.
  const suppressChangeRef = useRef(false);
  const codeChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlRef = useRef<string>(spec.defaultHtml ?? "");
  const engineRef = useRef<RunHandle | null>(null);
  const webRef = useRef<WebRunHandle | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const pendingRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [output, setOutput] = useState<OutLine[]>([]);
  const [running, setRunning] = useState(false);
  const [hasDom, setHasDom] = useState(spec.engine === "iframe-web");
  const [tab, setTab] = useState<"console" | "preview">("console");

  // Reset editor + scaffold when the module changes.
  useEffect(() => {
    codeRef.current = spec.defaultCode;
    htmlRef.current = spec.defaultHtml ?? "";
    setHasDom(spec.engine === "iframe-web" || (spec.allowDom && !!spec.defaultHtml));
    // Preview-centric modules (React/Vue/Three.js) open on Preview; everything else
    // on Console. After that, Run respects whatever tab the learner has selected.
    setTab(spec.engine === "iframe-web" ? "preview" : "console");
    setOutput([]);
    suppressChangeRef.current = true;
    if (editorRef.current) editorRef.current.setValue(spec.defaultCode);
    else pendingRef.current = spec.defaultCode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  // Preload starter code (and DOM scaffold) when a lesson loads.
  useEffect(() => {
    if (!loadCode) return;
    // Stop anything still running and clear the console/preview from the previous
    // lesson — otherwise a prior run's output (e.g. an error) persists into the new
    // lesson after auto-advance or resume.
    cancelAll();
    setRunning(false);
    setOutput([]);
    codeRef.current = loadCode.code;
    htmlRef.current = loadCode.html || spec.defaultHtml || "";
    setHasDom(spec.engine === "iframe-web" || (spec.allowDom && !!htmlRef.current));
    suppressChangeRef.current = true;
    if (editorRef.current) editorRef.current.setValue(loadCode.code);
    else pendingRef.current = loadCode.code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCode?.nonce]);

  const addLine = (l: OutLine) => setOutput((o) => [...o, l]);

  function cancelAll() {
    engineRef.current?.cancel();
    engineRef.current = null;
    webRef.current?.cancel();
    webRef.current = null;
  }

  // Execute the current code, streaming lines to the console AND into a local
  // buffer. Awaits completion (including main-thread WASM + iframe engines) and
  // returns the captured output as text. Shared by Run and Submit so Submit can
  // validate freshly-produced output rather than stale/empty prior output.
  async function execute(): Promise<string> {
    cancelAll();
    setOutput([]);
    setRunning(true);
    const buffer: OutLine[] = [];
    const collect = (l: OutLine) => {
      buffer.push(l);
      addLine(l);
    };
    const useIframe = spec.engine === "iframe-web" || (spec.allowDom && !!htmlRef.current);
    if (useIframe && iframeRef.current) {
      // Don't yank the learner to Preview — respect the tab they've selected.
      await new Promise<void>((resolve) => {
        webRef.current = runWeb({
          iframe: iframeRef.current!,
          html: htmlRef.current,
          js: codeRef.current,
          libs: spec.iframeLibs,
          onLine: collect,
          onDone: () => {
            setRunning(false);
            resolve();
          },
        });
      });
    } else {
      try {
        const { startRun } = await import("@/lib/runtimes/exec");
        const handle = await startRun(spec, codeRef.current, collect);
        engineRef.current = handle;
        await handle.done;
      } catch (e) {
        collect({ kind: "error", text: "Runtime failed to start: " + String(e) });
      } finally {
        engineRef.current = null;
        setRunning(false);
      }
    }
    return buffer.map((l) => l.text).join("\n");
  }

  async function run() {
    if (running) return;
    if (!spec.runnable) {
      setOutput([{ kind: "system", text: `Run isn't available for ${spec.title} yet — write your code and press Submit for tutor review.` }]);
      return;
    }
    await execute();
  }

  function stop() {
    cancelAll();
    setRunning(false);
    addLine({ kind: "system", text: "— stopped —" });
  }

  async function submit() {
    if (running) return;
    // For runnable modules, run the code first so the tutor validates the code's
    // ACTUAL output (including runtime errors), not stale output from a prior Run
    // or nothing at all if the learner never pressed Run.
    if (spec.runnable) {
      const out = await execute();
      onSubmit?.(codeRef.current, out);
      return;
    }
    onSubmit?.(codeRef.current, output.map((l) => l.text).join("\n"));
  }

  return (
    <div className="flex flex-1 min-w-0">
      <div className="h-full w-full min-w-0">
        <div className="h-full font-mono font-normal leading-normal border border-white/50 backdrop-blur-md flex flex-col gap-0 overflow-hidden">
          {/* Module badge */}
          <div className="absolute m-1 z-10 flex items-center gap-2 bg-opacity-80 px-2 py-1 shadow text-xs font-semibold select-none text-white">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: spec.badgeColor }} />
            {spec.title}
            {!spec.runnable && <span className="font-thin text-white/50">(guided — no runtime yet)</span>}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden pt-9 relative">
            <MonacoEditor
              height="100%"
              language={spec.monacoLang}
              defaultValue={spec.defaultCode}
              onMount={(editor) => {
                editorRef.current = editor;
                if (pendingRef.current != null) {
                  suppressChangeRef.current = true;
                  editor.setValue(pendingRef.current);
                  pendingRef.current = null;
                }
              }}
              onChange={(val) => {
                codeRef.current = val ?? "";
                // Ignore the change fired by our own programmatic setValue.
                if (suppressChangeRef.current) {
                  suppressChangeRef.current = false;
                  return;
                }
                // Report learner edits (debounced) so progress persists.
                if (codeChangeTimer.current) clearTimeout(codeChangeTimer.current);
                codeChangeTimer.current = setTimeout(() => onCodeChange?.(codeRef.current), 600);
              }}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                fontFamily: "Fira Mono, Menlo, Monaco, 'Liberation Mono', 'Courier New', monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                roundedSelection: false,
                scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false },
                overviewRulerLanes: 0,
                renderLineHighlight: "all",
                renderWhitespace: "boundary",
                tabSize: 2,
                cursorBlinking: "smooth",
              }}
            />
          </div>

          {/* Button row */}
          <div className="flex items-center justify-start gap-3 py-1 border-t border-white/10">
            <div className="flex items-center justify-start gap-3 py-1 ml-4">
              <button
                onClick={running ? stop : run}
                disabled={!spec.runnable}
                title={spec.runnable ? "Run your code" : "No runtime for this module yet — use Submit"}
                className={[
                  "px-2 py-1 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                  running ? "bg-red-400 hover:bg-red-300 text-neutral-900" : "bg-neutral-600 hover:bg-neutral-300 text-neutral-900",
                ].join(" ")}
              >
                {running ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    Stop
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7z" />
                    </svg>
                    Run
                  </>
                )}
              </button>
              <button
                onClick={submit}
                disabled={running}
                title="Send your code + output to the tutor"
                className="px-2 py-1 bg-white text-neutral-900 hover:bg-neutral-200 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Submit
              </button>
              <button
                onClick={() => setOutput([])}
                className="px-2 py-1 bg-neutral-600 hover:bg-neutral-300 text-neutral-900 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            </div>
          </div>

          {/* Output area with Console | Preview tabs */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1 border-t border-white/10 px-2 py-1 text-[11px]">
              <button
                onClick={() => setTab("console")}
                className={`cursor-pointer px-2 py-0.5 ${tab === "console" ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}
              >
                Console
              </button>
              {hasDom && (
                <button
                  onClick={() => setTab("preview")}
                  className={`cursor-pointer px-2 py-0.5 ${tab === "preview" ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}
                >
                  Preview
                </button>
              )}
            </div>

            {/* Console pane */}
            <div className={`${tab === "console" ? "flex" : "hidden"} flex-1 min-h-0 flex-col`}>
              <div className="h-full p-4 bg-black/80 border border-white/10 text-xs font-mono overflow-auto custom-scrollbar shadow-inner">
                {output.length === 0 && !running ? (
                  <span className="opacity-60 text-green-400">
                    {spec.runnable ? "Console output will appear here…" : `No runtime for ${spec.title} yet — Submit sends your code to the tutor.`}
                  </span>
                ) : (
                  output.map((l, i) => (
                    <div key={i} className={`whitespace-pre-wrap break-words ${LINE_COLOR[l.kind]}`}>
                      {l.text}
                    </div>
                  ))
                )}
                {running && <div className="text-white/40">running…</div>}
              </div>
            </div>

            {/* Preview pane */}
            {hasDom && (
              <div className={`${tab === "preview" ? "flex" : "hidden"} flex-1 min-h-0 flex-col border border-white/10`}>
                <iframe ref={iframeRef} sandbox="allow-scripts" title="Preview" className="h-full w-full bg-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
