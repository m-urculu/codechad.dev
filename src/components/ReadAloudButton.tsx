"use client";

// A small speaker toggle that reads a message aloud with the browser-native Web Speech API.
// All buttons share one playback (via the tts store), so starting one stops any other.

import { useSyncExternalStore } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { subscribe, getState, speak, stop, isSupported } from "@/lib/tts";

export default function ReadAloudButton({ id, text }: { id: string; text: string }) {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const active = state.activeId === id && state.status !== "idle";
  const loading = active && (state.status === "loading" || state.status === "generating");

  if (!isSupported()) return null;

  function onClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't trigger the bubble's doc-link handler
    if (active) stop();
    else speak(id, text);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? "Stop" : "Read aloud"}
      aria-label={active ? "Stop reading" : "Read aloud"}
      className={[
        "inline-flex items-center gap-1 border border-line bg-surface-0/40 px-1.5 py-0.5",
        "text-micro leading-none transition-all cursor-pointer",
        // Hidden until the bubble is hovered/focused — but stays visible while active so it
        // can be stopped even if the pointer leaves.
        active
          ? "text-accent border-accent-line opacity-100"
          : "text-ink-dim hover:text-ink hover:border-line-strong opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
      ].join(" ")}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : active ? (
        <Square className="h-3 w-3" />
      ) : (
        <Volume2 className="h-3 w-3" />
      )}
    </button>
  );
}
