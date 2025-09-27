"use client";

import Editor from "@monaco-editor/react";
// import { useState } from "react";

type CodeHereProps = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function CodeHere({ collapsed, setCollapsed }: CodeHereProps) {
  return (
    <div className="flex flex-1 min-w-0 p-4 gap-4 border border-white/50">
      {/* Main editor panel, collapsible */}
      {!collapsed && (
        <div className="h-full w-full min-w-0">
          <div className="h-full font-mono font-normal leading-normal border border-white/10 backdrop-blur-md flex flex-col gap-0 overflow-hidden">
            <div className="absolute m-1 z-10 flex items-center gap-2 bg-opacity-80 px-2 py-1 shadow text-yellow-300 text-xs font-semibold select-none">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="6" fill="#F7DF1E"/>
                <path d="M19.5 23.5c.6 1.1 1.4 1.9 2.9 1.9 1.2 0 2-.6 2-1.5 0-1-0.8-1.3-2.2-1.9l-.8-.3c-2.3-.9-3.8-2-3.8-4.3 0-2.1 1.6-3.7 4.1-3.7 1.8 0 3.1.6 4 2.2l-2.2 1.4c-.5-.9-1-1.2-1.8-1.2-.8 0-1.3.5-1.3 1.2 0 .8.5 1.1 1.7 1.6l.8.3c2.7 1.1 4.2 2.1 4.2 4.5 0 2.6-2 4-4.6 4-2.6 0-4.2-1.2-5-2.7l2.3-1.3zm-9.2.2c.4.7.8 1.3 1.7 1.3.9 0 1.5-.3 1.5-1.7v-7.2h2.7v7.3c0 2.8-1.6 4-4 4-2.1 0-3.3-1.1-3.9-2.4l2.3-1.3z" fill="#23272e"/>
              </svg>
              JavaScript
            </div>
            <div className="flex-1 flex flex-col overflow-hidden pt-9 relative">
              {/* Language Icon */}
              <Editor
                height="100%"
                defaultLanguage="javascript"
                defaultValue={"// Write your code here..."}
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
                  scrollbar: {
                    vertical: "auto",
                    horizontal: "auto",
                    useShadows: false,
                  },
                  overviewRulerLanes: 0,
                  renderLineHighlight: "all",
                  // renderIndentGuides: true, // REMOVE this line if present
                  renderWhitespace: "boundary",
                  tabSize: 2,
                  cursorBlinking: "smooth",
                }}
              />
            </div>
            {/* Button row */}
            <div className="flex items-center justify-start gap-3 py-1 border-t border-white/10">
              <div className="flex items-center justify-start gap-3 py-1 ml-4">
                <button className="px-2 py-1 bg-neutral-600 hover:bg-neutral-300 text-neutral-900 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Submit
                </button>
                <button className="px-2 py-1 bg-neutral-600 hover:bg-neutral-300 text-neutral-900 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7z" />
                  </svg>
                  Run
                </button>
                <button className="px-2 py-1 bg-neutral-600 hover:bg-neutral-300 text-neutral-900 font-semibold text-xs font-thin transition-colors cursor-pointer flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20l9-5-9-5-9 5 9 5zm0-10V4m0 0L7 9m5-5l5 5" />
                  </svg>
                  Solution
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              <div className="h-full p-4 bg-black/80 border border-white/10 text-green-400 text-xs font-mono overflow-auto custom-scrollbar shadow-inner">
                {/* Console output goes here */}
                <span className="opacity-60">Console output will appear here...</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-start bg-transparent ml-auto">
        <button
          className="bg-black hover:bg-neutral-700 text-white p-2 shadow border border-white/10 transition-colors cursor-pointer"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand editor' : 'Collapse editor'}
        >
          {/* Coding icon replaces arrow */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            className="w-5 h-5"
            style={{ transition: 'transform 0.2s' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
