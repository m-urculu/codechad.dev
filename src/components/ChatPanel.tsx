"use client";

// React and hooks
import { useRef, useState, useEffect, KeyboardEvent, FormEvent, memo } from "react";

// Markdown and syntax highlighting
import { marked } from "marked";
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml'; // html is registered as xml in highlight.js
import 'highlight.js/styles/atom-one-dark.css';
// import TextType from "@/components/Text/TextType";

// Register highlight.js languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('html', xml);

// Local UI components
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { createClient } from '@supabase/supabase-js';

marked.setOptions({ breaks: false });

type Message = {
  id: number;
  text: string;
  role: 'user' | 'bot';
};


type ChatPanelProps = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export default function ChatPanel({ collapsed, setCollapsed }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      text: "What job you're looking to land or what skills do you want to learn?",
      role: 'bot',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const GEMINI_MAX_CHARS = 8192;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Get user id from Supabase and load chat history
    const getUserAndHistory = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        try {
          const res = await fetch("/api/functions/chat/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: uid, limit: 50 })
          });
          const result = await res.json();
          if (Array.isArray(result.messages) && result.messages.length > 0) {
            setMessages(
              result.messages.map((msg: { content: string; role: string }, idx: number) => ({
                id: idx + 1,
                text: msg.content,
                role: msg.role === "assistant" ? "bot" : "user"
              }))
            );
          }
        } catch {
          // Optionally handle error
        }
      }
    };
    getUserAndHistory();
  }, []);

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
      const res = await fetch("/api/sys-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ function: 'chat', user_input: input, user_id: userId })
      });
      const data = await res.json();
      // Accept both {response} and {result} for chat, or show error if present
      const botMsg: Message = {
        id: Date.now() + 1,
        text: data.error ? (data.error + (data.details ? `\n${data.details}` : '')) : (data.response || data.result || "(No response)"),
        role: 'bot',
      };
      setMessages((msgs) => [...msgs, botMsg]);
    } catch {
      setMessages((msgs) => [
        ...msgs,
        { id: Date.now() + 2, text: "Error contacting system manager API.", role: 'bot' }
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

  // Memoized message bubble for performance
  const MessageBubble = memo(function MessageBubble({ msg }: { msg: Message }) {
    if (msg.role === 'user') {
      return (
        <div className={`flex my-4 justify-end`}>
          <div className="bg-black/70 px-4 py-2 text-sm border border-white/50 max-w-[100%] sm:max-w-[60%] font-mono font-normal leading-normal text-white text-right">
            {msg.text}
          </div>
        </div>
      );
    }
    // Memoize marked and highlight.js output for bot messages
    const parts = msg.text.split(/(```[\s\S]*?```)/g);
    const rendered = parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Extract language and code
        const codeBlock = part.slice(3, -3);
        const firstLineBreak = codeBlock.indexOf('\n');
        let lang = '';
        let code = codeBlock;
        if (firstLineBreak !== -1) {
          lang = codeBlock.slice(0, firstLineBreak).trim();
          code = codeBlock.slice(firstLineBreak + 1);
        }
        let highlighted;
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(code).value;
        }
        return (
          <pre
            key={i}
            className="theme-atom-one-dark shadow-3xl text-sm relative max-w-full order-1 lg:order-2 my-50"
            style={{ padding: 0, margin: 0 }}
          >
            <span className="hljs my-5 p-4 block min-h-full">
              <code className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: highlighted }} />
            </span>
            <small className="bg-black/30 absolute top-0 right-0 uppercase font-bold text-xs px-2 py-1">
              <span className="sr-only">Language:</span>{lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Code'}
            </small>
          </pre>
        );
      } else {
        // Use marked to render all Gemini Markdown as intended
        const html = marked(part.trim());
        return (
          <div className="flex flex-col gap-5" key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      }
    });
    return (
      <div className={`flex my-4 justify-start`}>
        <div className="bg-black/70 px-4 py-2 text-sm border border-white/50 max-w-[100%] sm:max-w-[60%] font-mono font-normal leading-normal text-neutral-200 text-left">
          <span>{rendered}</span>
        </div>
      </div>
    );
  });

  return (
    <div className="flex flex-1 min-w-0 p-4 gap-4 border border-white/50 min-w-0">
      <div className="flex items-start bg-transparent">
        <button
          className="bg-black hover:bg-neutral-700 text-white p-2 shadow border border-white/50 transition-colors cursor-pointer"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand editor' : 'Collapse editor'}
        >
          {/* Chat bubble icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            className="w-5 h-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8-1.326 0-2.583-.26-3.7-.73L3 21l1.09-3.27C3.39 16.13 3 14.61 3 13c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="flex flex-col h-full w-full border border-white/50 backdrop-blur-md font-sans overflow-x-auto">
          <ScrollArea className="flex-1 overflow-y-auto overflow-hidden px-6 space-y-2 font-mono font-normal leading-normal">
            {/* highlight.js theme handles code styling */}
            <div className="space-y-5">
              {messages.length === 0 ? (
                <div className="text-neutral-500 text-center mt-8 font-mono font-normal leading-normal">No messages yet. Start the conversation below!
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 px-4 py-2 text-sm border border-white/50 max-w-[80%] font-mono font-normal leading-normal text-white-200 text-left opacity-70 gemini-glow">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <form
            className="flex items-center gap-2 p-4 border-t border-white/50"
            onSubmit={handleSend}
          >
            <Textarea
              ref={textareaRef}
              className="flex-1 min-h-[40px] max-h-40 resize-none px-4 py-2 bg-black text-white placeholder:text-neutral-400 placeholder:font-mono placeholder:font-normal placeholder:leading-normal border border-white/50 focus:border-neutral-500 focus:outline-none font-mono font-normal leading-normal rounded-none overflow-y-auto overflow-x-auto"
              placeholder="Type a message..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={GEMINI_MAX_CHARS}
            />
            <button
              type="submit"
              className="cursor-pointer px-4 py-2 bg-neutral-400 hover:bg-neutral-300 text-neutral-900 font-mono font-normal leading-normal border border-white/50 transition-colors duration-150 flex items-center justify-center"
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
