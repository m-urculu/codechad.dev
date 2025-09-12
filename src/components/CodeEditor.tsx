"use client";
import { useRef, useState } from "react";

function highlight(code: string) {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\b(const|let|function|return|if|else)\b/g, '<span class="text-pink-400">$1</span>');
}

export default function CodeEditor() {
  const [code, setCode] = useState("");
  const preRef = useRef<HTMLPreElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="relative h-full rounded-lg border border-white/20 bg-neutral-950">
      <textarea
        className="absolute inset-0 w-full h-full p-4 resize-none bg-transparent text-transparent caret-white font-mono text-sm z-10"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
      />
      <pre
        ref={preRef}
        className="pointer-events-none absolute inset-0 p-4 overflow-auto font-mono text-sm text-white"
        aria-hidden="true"
      >
        {code.split("\n").map((line, i) => (
          <div key={i}>
            <span className="text-neutral-500 select-none pr-4">{i + 1}</span>
            <span dangerouslySetInnerHTML={{ __html: highlight(line) }} />
          </div>
        ))}
      </pre>
    </div>
  );
}
