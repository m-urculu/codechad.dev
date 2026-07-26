// Server utility for per-course chat persistence.
// Table: public.user_chat_state (see supabase/migrations/0002_user_chat_state.sql
// and 0003_course_id.sql, which re-keyed this table from module to course_id so
// duplicated courses keep separate conversations).
// Fail-soft: an unreachable project returns null/false, never breaks the UX.

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";


export type ChatStateMsg = { role: "user" | "bot"; text: string; lessonId?: string };
export type ChatCalib = { step?: string; level?: string; goal?: string };
export type ChatState = { messages: ChatStateMsg[]; calib: ChatCalib };

const MAX_MESSAGES = 200;

export async function loadChatState(user_id: string, course_id: string): Promise<ChatState | null> {
  try {
    const { data, error } = await supabase
      .from("user_chat_state")
      .select("messages, calib")
      .eq("user_id", user_id)
      .eq("course_id", course_id)
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
  course_id: string,
  module: string,
  state: ChatState
): Promise<boolean> {
  try {
    const { error } = await supabase.from("user_chat_state").upsert(
      {
        user_id,
        course_id,
        module,
        messages: state.messages.slice(-MAX_MESSAGES),
        calib: state.calib ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "course_id" }
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

// Wipe the conversation but keep the row (and its calibration), so the course
// still knows the learner's level and goal and does not re-run onboarding.
export async function clearChatMessages(user_id: string, course_id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("user_chat_state")
      .update({ messages: [], updated_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("course_id", course_id);
    if (error) {
      console.error("[chat-state] clear error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat-state] clear exception:", e);
    return false;
  }
}
