"use client";
import { useRef, useState, useEffect, KeyboardEvent, FormEvent } from "react";
import { marked } from "marked";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

marked.setOptions({ breaks: true });

function preprocessForMarkdown(text: string) {
  // If the text looks like Markdown, return as is
  if (/[*_`#\-\[\]>]|\d+\./.test(text)) return text;
  // Otherwise, add two spaces at end of each line for Markdown line breaks
  return text.split("\n").map(line => line + "  ").join("\n");
}

type Message = {
  id: number;
  text: string;
  role: 'user' | 'bot';
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
    } catch (err) {
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
  <div className="flex flex-col h-full rounded-[20px] border border-white/10 bg-neutral-900 backdrop-blur-md font-sans">
  <ScrollArea className="flex-1 overflow-y-auto p-4 space-y-2 font-mono font-normal leading-normal">
      <div className="space-y-5">
        {messages.length === 0 ? (
          <div className="text-neutral-500 text-center mt-8 font-mono font-normal leading-normal">No messages yet. Start the conversation below!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`bg-white/5 rounded-[12px] px-4 py-2 text-sm border border-white/10 max-w-[80%] font-mono font-normal leading-normal ${msg.role === 'user' ? 'text-white text-right' : 'text-neutral-200 text-left whitespace-pre-line'}`}
                {...(msg.role === 'bot' ? { dangerouslySetInnerHTML: { __html: marked.parse(preprocessForMarkdown(msg.text)) } } : {})}
              >
                {msg.role === 'user' ? msg.text : null}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-[12px] px-4 py-2 text-sm border border-white/10 max-w-[80%] font-mono font-normal leading-normal text-white-200 text-left opacity-70">
              Gemini is typing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
    <form
        className="flex items-center gap-2 p-4 border-t border-white/10 bg-neutral-900 rounded-b-[20px]"
        onSubmit={handleSend}
    >
            <Textarea
              ref={textareaRef}
              className="flex-1 min-h-[40px] max-h-40 resize-none rounded-full px-4 py-2 bg-neutral-800 text-white placeholder:text-neutral-400 placeholder:font-mono placeholder:font-normal placeholder:leading-normal border border-white/10 focus:border-neutral-500 focus:outline-none font-mono font-normal leading-normal overflow-y-auto"
              placeholder="Type a message..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
            />
        <button
          type="submit"
          className="px-4 py-2 rounded-full bg-neutral-400 hover:bg-neutral-300 text-neutral-900 font-mono font-normal leading-normal border border-white/10 transition-colors duration-150 flex items-center justify-center"
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
