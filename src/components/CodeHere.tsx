"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { runJavaScript, type OutLine, type RunHandle } from "@/lib/runtimes/javascript";
import { runWeb, type WebRunHandle } from "@/lib/runtimes/web";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const DEFAULT_CODE = `// Try it — edit and press Run
console.log("Hello, CodePath!");`;

type LoadCode = { code: string; html?: string; nonce: number } | null;

const LINE_COLOR: Record<OutLine["kind"], string> = {
  log: "text-green-400",
  info: "text-sky-300",
  warn: "text-yellow-300",
  error: "text-red-400",
  system: "text-white/50",
};

export default function CodeHere({
  onSubmit,
  loadCode,
}: {
  onSubmit?: (code: string, output: string) => void;
  loadCode?: LoadCode;
}) {
  const codeRef = useRef<string>(DEFAULT_CODE);
  const htmlRef = useRef<string>(""); // lesson DOM scaffold (empty = pure-logic)
  const runRef = useRef<RunHandle | null>(null);
  const webRef = useRef<WebRunHandle | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const pendingRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [output, setOutput] = useState<OutLine[]>([]);
  const [running, setRunning] = useState(false);
  const [hasDom, setHasDom] = useState(false);
  const [tab, setTab] = useState<"console" | "preview">("console");

  // Preload starter code (and DOM scaffold) when a lesson loads.
  useEffect(() => {
    if (!loadCode) return;
    codeRef.current = loadCode.code;
    htmlRef.current = loadCode.html ?? "";
    setHasDom(!!loadCode.html);
    if (editorRef.current) editorRef.current.setValue(loadCode.code);
    else pendingRef.current = loadCode.code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCode?.nonce]);

  const addLine = (l: OutLine) => setOutput((o) => [...o, l]);

  async function run() {
    if (running) return;
    setOutput([]);
    setRunning(true);
    if (htmlRef.current && iframeRef.current) {
      // DOM lesson -> run in the iframe (real document) and show the Preview.
      setTab("preview");
      webRef.current = runWeb({
        iframe: iframeRef.current,
        html: htmlRef.current,
        js: codeRef.current,
        onLine: addLine,
        onDone: () => setRunning(false),
      });
    } else {
      const handle = runJavaScript(codeRef.current, addLine);
      runRef.current = handle;
      await handle.promise;
      runRef.current = null;
      setRunning(false);
    }
  }

  function stop() {
    runRef.current?.cancel();
    webRef.current?.cancel();
    setRunning(false);
    addLine({ kind: "system", text: "— stopped —" });
  }

  function submit() {
    onSubmit?.(codeRef.current, output.map((l) => l.text).join("\n"));
  }

  return (
    <div className="flex flex-1 min-w-0">
      <div className="h-full w-full min-w-0">
        <div className="h-full font-mono font-normal leading-normal border border-white/50 backdrop-blur-md flex flex-col gap-0 overflow-hidden">
          <div className="absolute m-1 z-10 flex items-center gap-2 bg-opacity-80 px-2 py-1 shadow text-yellow-300 text-xs font-semibold select-none">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="6" fill="#F7DF1E" />
              <path d="M19.5 23.5c.6 1.1 1.4 1.9 2.9 1.9 1.2 0 2-.6 2-1.5 0-1-0.8-1.3-2.2-1.9l-.8-.3c-2.3-.9-3.8-2-3.8-4.3 0-2.1 1.6-3.7 4.1-3.7 1.8 0 3.1.6 4 2.2l-2.2 1.4c-.5-.9-1-1.2-1.8-1.2-.8 0-1.3.5-1.3 1.2 0 .8.5 1.1 1.7 1.6l.8.3c2.7 1.1 4.2 2.1 4.2 4.5 0 2.6-2 4-4.6 4-2.6 0-4.2-1.2-5-2.7l2.3-1.3zm-9.2.2c.4.7.8 1.3 1.7 1.3.9 0 1.5-.3 1.5-1.7v-7.2h2.7v7.3c0 2.8-1.6 4-4 4-2.1 0-3.3-1.1-3.9-2.4l2.3-1.3z" fill="#23272e" />
            </svg>
            JavaScript
          </div>

          <div className="flex-1 flex flex-col overflow-hidden pt-9 relative">
            <MonacoEditor
              height="100%"
              defaultLanguage="javascript"
              defaultValue={DEFAULT_CODE}
              onMount={(editor) => {
                editorRef.current = editor;
                if (pendingRef.current != null) {
                  editor.setValue(pendingRef.current);
                  pendingRef.current = null;
                }
              }}
              onChange={(val) => {
                codeRef.current = val ?? "";
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
                className={[
                  "px-2 py-1 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2",
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
                  <span className="opacity-60 text-green-400">Console output will appear here…</span>
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

            {/* Preview pane (mounted whenever the lesson has DOM, hidden when not active) */}
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
