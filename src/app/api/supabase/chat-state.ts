// Server utility for per-user, per-module chat persistence.
// Table: public.user_chat_state (see supabase/migrations/0002_user_chat_state.sql).
// Fail-soft: an unreachable project returns null/false, never breaks the UX.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export type ChatStateMsg = { role: "user" | "bot"; text: string };
export type ChatCalib = { step?: string; level?: string; goal?: string };
export type ChatState = { messages: ChatStateMsg[]; calib: ChatCalib };

const MAX_MESSAGES = 200;

export async function loadChatState(user_id: string, module: string): Promise<ChatState | null> {
  try {
    const { data, error } = await supabase
      .from("user_chat_state")
      .select("messages, calib")
      .eq("user_id", user_id)
      .eq("module", module)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[chat-state] load error:", error.message);
      return null;
    }
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      calib: (data.calib as ChatCalib) ?? {},
    };
  } catch (e) {
    console.error("[chat-state] load exception:", e);
    return null;
  }
}

export async function saveChatState(
  user_id: string,
  module: string,
  state: ChatState
): Promise<boolean> {
  try {
    const { error } = await supabase.from("user_chat_state").upsert(
      {
        user_id,
        module,
        messages: state.messages.slice(-MAX_MESSAGES),
        calib: state.calib ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module" }
    );
    if (error) {
      console.error("[chat-state] save error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat-state] save exception:", e);
    return false;
  }
}
