"use client";
import { useRef, useState, useEffect, KeyboardEvent, FormEvent } from "react";
import { marked } from "marked";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

marked.setOptions({ breaks: true });

// function preprocessForMarkdown(text: string) {
//   // If the text looks like Markdown, return as is
//   if (/[*_`#\-\[\]>]|\d+\./.test(text)) return text;
//   // Otherwise, add two spaces at end of each line for Markdown line breaks
//   return text.split("\n").map(line => line + "  ").join("\n");
// }

type Message = {
  id: number;
  text: string;
  role: 'user' | 'bot';
};


type ChatPanelProps = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ChatPanel({ collapsed, setCollapsed }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const GEMINI_MAX_CHARS = 8192;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e?: FormEvent | KeyboardEvent) {
    e?.preventDefault();
    if (input.trim() === "" || loading) return;
    const userMsg: Message = { id: Date.now(), text: input, role: 'user' };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setLoading(true);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input })
      });
      const data = await res.json();
      const botMsg: Message = {
        id: Date.now() + 1,
        text: data.response || "(No response)",
        role: 'bot',
      };
      setMessages((msgs) => [...msgs, botMsg]);
    } catch {
      setMessages((msgs) => [
        ...msgs,
        { id: Date.now() + 2, text: "Error contacting Gemini API.", role: 'bot' }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }

  return (
    <div className="flex flex-1 min-w-0 p-4 gap-4 border border-white/10 min-w-0">
      <div className="flex items-start bg-transparent">
        <button
          className="bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-2 shadow border border-white/10 transition-colors cursor-pointer"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand editor' : 'Collapse editor'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            className="w-5 h-5"
            style={{ transform: `rotate(180deg)${collapsed ? ' rotate(180deg)' : ''}`, transition: 'transform 0.2s' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="flex flex-col h-full w-full rounded-[20px] border border-white/10 bg-neutral-900 backdrop-blur-md font-sans">
          <ScrollArea className="flex-1 overflow-y-auto pt-4 px-4 space-y-2 font-mono font-normal leading-normal">
            <style>{`
              a { color: #06c !important; }
              pre, code {
                background: #18181b !important;
                color: #e0e0e0 !important;
                border-radius: 6px;
                padding: 0.5em 0.75em;
                font-family: 'Fira Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
                font-size: 0.95em;
                white-space: pre-wrap;
                word-break: break-all;
                overflow-x: auto;
                display: block;
                margin: 0.5em 0;
              }
            `}</style>
            <div className="space-y-5">
              {messages.length === 0 ? (
                <div className="text-neutral-500 text-center mt-8 font-mono font-normal leading-normal">No messages yet. Start the conversation below!
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`bg-white/5 rounded-[12px] px-4 py-2 text-sm border border-white/10 max-w-[80%] font-mono font-normal leading-normal ${msg.role === 'user' ? 'text-white text-right' : 'text-neutral-200 text-left whitespace-pre-line'}`}
                      {...(msg.role === 'bot' ? {
                        dangerouslySetInnerHTML: {
                          __html: (() => {
                            // Remove trailing <br> and empty lines from the original text before parsing
                            const cleanText = msg.text.replace(/[ \t\n\r]+$/g, "");
                            // Parse Markdown
                            let html = marked.parser(marked.lexer(cleanText));
                            // Remove trailing <br> tags and empty lines from the HTML output
                            html = html.replace(/(<br\s*\/?>(\s*)?)+$/gi, "");
                            html = html.replace(/(\n|\r)+$/g, "");
                            html = html.replace(/(<p>\s*<\/p>)+$/gi, "");
                            return html;
                          })()
                        }
                      } : {})}
                    >
                      {msg.role === 'user' ? msg.text : null}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 rounded-[12px] px-4 py-2 mb-0 text-sm border border-white/10 max-w-[80%] font-mono font-normal leading-normal text-white-200 text-left opacity-70 gemini-glow">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <form
            className="flex items-center gap-2 p-4 border-t border-white/10 bg-neutral-900 rounded-b-[20px]"
            onSubmit={handleSend}
          >
            <Textarea
              ref={textareaRef}
              className="flex-1 min-h-[40px] max-h-40 resize-none rounded-[25px] px-4 py-2 bg-neutral-800 text-white placeholder:text-neutral-400 placeholder:font-mono placeholder:font-normal placeholder:leading-normal border border-white/10 focus:border-neutral-500 focus:outline-none font-mono font-normal leading-normal overflow-y-auto overflow-x-auto"
              placeholder="Type a message..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={GEMINI_MAX_CHARS}
            />
            <button
              type="submit"
              className="cursor-pointer px-4 py-2 rounded-full bg-neutral-400 hover:bg-neutral-300 text-neutral-900 font-mono font-normal leading-normal border border-white/10 transition-colors duration-150 flex items-center justify-center"
              aria-label="Send"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
