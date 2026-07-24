// Text-to-speech for the chat. Primary path: natural NEURAL voices via our /api/tts route
// (Microsoft Edge's free online voices) — audio is synthesized server-side and streamed to
// the browser as MP3, so it's natural on any machine with no model download or CPU load.
// If that endpoint is unavailable, we fall back to the browser's native (robotic) voice so
// read-aloud still works. A tiny external store lets read-aloud buttons share one playback.

export type TTSStatus = "idle" | "loading" | "generating" | "speaking";
export type TTSState = { status: TTSStatus; activeId: string | null };

const EDGE_VOICE = "en-US-AriaNeural"; // natural neural female

// ---- external store (useSyncExternalStore) ---------------------------------------------
let state: TTSState = { status: "idle", activeId: null };
const listeners = new Set<() => void>();
function set(next: Partial<TTSState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getState(): TTSState {
  return state;
}
export function getLoadProgress() {
  return 1;
}
export function isSupported(): boolean {
  // The neural route works in any browser; native fallback needs speechSynthesis.
  return typeof window !== "undefined";
}

// Strip markdown/code so we speak clean prose (never read code blocks or link syntax).
function stripForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- shared playback / cancellation ----------------------------------------------------
let seq = 0; // bumped to cancel any in-flight synthesis/playback
let audioEl: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let abort: AbortController | null = null;

function teardown() {
  if (audioEl) {
    audioEl.pause();
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.src = "";
    audioEl = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (abort) {
    abort.abort();
    abort = null;
  }
  stopNative();
}

export function stop() {
  seq++;
  teardown();
  set({ status: "idle", activeId: null });
}

export async function speak(id: string, text: string) {
  if (typeof window === "undefined") return;
  const clean = stripForSpeech(text);
  if (!clean) return;
  const mySeq = ++seq;
  teardown();
  set({ status: "loading", activeId: id });

  // Primary: neural voice from the server route.
  try {
    abort = new AbortController();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, voice: EDGE_VOICE }),
      signal: abort.signal,
    });
    if (mySeq !== seq) return;
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    if (mySeq !== seq) return;
    currentUrl = URL.createObjectURL(blob);
    audioEl = new Audio(currentUrl);
    audioEl.onended = () => {
      if (mySeq === seq) {
        teardown();
        set({ status: "idle", activeId: null });
      }
    };
    audioEl.onerror = () => {
      if (mySeq === seq) {
        teardown();
        set({ status: "idle", activeId: null });
      }
    };
    set({ status: "speaking", activeId: id });
    await audioEl.play();
  } catch (err) {
    if (mySeq !== seq) return; // superseded or intentionally stopped — don't fall back
    if ((err as Error)?.name === "AbortError") return;
    // Fallback: browser-native voice so read-aloud still works if the route is down.
    nativeSpeak(id, clean, mySeq);
  }
}

// ---- native fallback (Web Speech API) --------------------------------------------------
let nativeQueue: string[] = [];
let nativeId: string | null = null;
let keepAlive: ReturnType<typeof setInterval> | null = null;

function nativeSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
function stopNative() {
  nativeId = null;
  nativeQueue = [];
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
  if (nativeSupported()) window.speechSynthesis.cancel();
}
function pickNativeVoice(): SpeechSynthesisVoice | null {
  if (!nativeSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  for (const re of [/natural/i, /neural/i, /google/i, /samantha/i, /siri/i]) {
    const hit = pool.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return pool[0];
}
function nativeChunk(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && (cur + p).length > 200) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function nativeNext(id: string, voice: SpeechSynthesisVoice | null) {
  if (nativeId !== id) return;
  const next = nativeQueue.shift();
  if (next === undefined) {
    stopNative();
    set({ status: "idle", activeId: null });
    return;
  }
  const u = new SpeechSynthesisUtterance(next);
  if (voice) u.voice = voice;
  u.onend = () => nativeNext(id, voice);
  u.onerror = () => nativeNext(id, voice);
  window.speechSynthesis.speak(u);
}
function nativeSpeak(id: string, clean: string, mySeq: number) {
  if (!nativeSupported() || mySeq !== seq) {
    set({ status: "idle", activeId: null });
    return;
  }
  window.speechSynthesis.cancel();
  nativeId = id;
  nativeQueue = nativeChunk(clean);
  keepAlive = setInterval(() => {
    if (nativeSupported() && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
  set({ status: "speaking", activeId: id });
  nativeNext(id, pickNativeVoice());
}
