"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { OutLine } from "@/lib/runtimes/javascript";
import { runWeb, type WebRunHandle } from "@/lib/runtimes/web";
import { getRuntime } from "@/lib/runtimes/registry";
import type { RunHandle } from "@/lib/runtimes/exec";
import { CODEPATH_THEME, defineCodePathTheme } from "@/lib/monacoTheme";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type LoadCode = { code: string; html?: string; nonce: number } | null;

const LINE_COLOR: Record<OutLine["kind"], string> = {
  log: "text-ink-muted",
  info: "text-info",
  warn: "text-warn",
  error: "text-danger",
  system: "text-ink-dim",
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
        <div className="h-full font-normal leading-normal border border-line-strong backdrop-blur-md flex flex-col gap-0 overflow-hidden">
          {/* Module header — a real bar rather than a floating badge, matching the
              toolbar below it. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-0 px-3 py-1.5 text-xs font-semibold text-ink select-none">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: spec.badgeColor }} />
            {spec.title}
            {!spec.runnable && (
              <span className="font-normal text-ink-dim">(guided — no runtime yet)</span>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
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
              beforeMount={defineCodePathTheme}
              theme={CODEPATH_THEME}
              options={{
                fontSize: 13,
                // Same face as the console, so code reads identically wherever it
                // appears. Ligatures off: learners must see operators literally.
                fontFamily: "var(--font-mono)",
                fontLigatures: false,
                lineHeight: 1.7,
                letterSpacing: 0.2,
                minimap: { enabled: false },
                lineNumbers: "on",
                lineNumbersMinChars: 3,
                lineDecorationsWidth: 12,
                glyphMargin: false,
                folding: false,
                padding: { top: 14, bottom: 14 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                roundedSelection: false,
                scrollbar: {
                  vertical: "auto",
                  horizontal: "auto",
                  useShadows: false,
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: "line",
                renderWhitespace: "selection",
                guides: { indentation: true, highlightActiveIndentation: false },
                // Monaco colours nested brackets yellow/purple/blue by default,
                // which fights the monochrome-plus-one-accent rule.
                bracketPairColorization: { enabled: false },
                matchBrackets: "near",
                tabSize: 2,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                cursorWidth: 2,
                smoothScrolling: true,
                contextmenu: false,
              }}
            />
          </div>

          {/* Button row */}
          <div className="flex items-center justify-start gap-3 py-1 border-t border-line">
            <div className="flex items-center justify-start gap-3 py-1 ml-4">
              <button
                onClick={running ? stop : run}
                disabled={!spec.runnable}
                title={spec.runnable ? "Run your code" : "No runtime for this module yet — use Submit"}
                className={[
                  "px-2 py-1 text-xs font-semibold transition-colors duration-150 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                  running
                    ? "bg-danger text-ink hover:bg-danger/80"
                    : "bg-ink text-surface-0 hover:bg-ink-muted",
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
                className="px-2 py-1 bg-accent text-surface-0 hover:bg-accent-bright text-xs font-semibold transition-colors duration-150 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Submit
              </button>
              <button
                onClick={() => setOutput([])}
                className="px-2 py-1 border border-line-strong text-ink-muted hover:bg-surface-2 hover:text-ink text-xs font-semibold transition-colors duration-150 flex items-center gap-2"
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
            <div className="flex items-center gap-1 border-t border-line px-2 py-1 text-meta">
              <button
                onClick={() => setTab("console")}
                className={`px-2 py-0.5 ${tab === "console" ? "bg-surface-3 text-ink" : "text-ink-dim hover:text-ink"}`}
              >
                Console
              </button>
              {hasDom && (
                <button
                  onClick={() => setTab("preview")}
                  className={`px-2 py-0.5 ${tab === "preview" ? "bg-surface-3 text-ink" : "text-ink-dim hover:text-ink"}`}
                >
                  Preview
                </button>
              )}
            </div>

            {/* Console pane */}
            <div className={`${tab === "console" ? "flex" : "hidden"} flex-1 min-h-0 flex-col`}>
              <div className="h-full p-4 bg-surface-0 border-t border-line font-mono text-xs leading-normal overflow-auto custom-scrollbar">
                {output.length === 0 && !running ? (
                  <span className="text-ink-faint">
                    {spec.runnable ? "Console output will appear here…" : `No runtime for ${spec.title} yet — Submit sends your code to the tutor.`}
                  </span>
                ) : (
                  output.map((l, i) => (
                    <div key={i} className={`whitespace-pre-wrap break-words ${LINE_COLOR[l.kind]}`}>
                      {l.text}
                    </div>
                  ))
                )}
                {running && <div className="text-ink-faint">running…</div>}
              </div>
            </div>

            {/* Preview pane */}
            {hasDom && (
              <div className={`${tab === "preview" ? "flex" : "hidden"} flex-1 min-h-0 flex-col border border-line`}>
                <iframe ref={iframeRef} sandbox="allow-scripts" title="Preview" className="h-full w-full bg-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
