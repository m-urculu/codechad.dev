// POST /api/agent — entrypoint for the agent pipeline (chat manager).
//
// Body: { message, topic?, level?, goal?, history?, user_id? }
// Returns: { action, response, roadmap? }

import { NextResponse } from "next/server";
import { runChatManager, type ChatMsg } from "@/lib/agents/chatManager";
import { insertChatMessage } from "@/app/api/supabase/chat-message";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, topic, level, goal, history, user_id } = body as {
      message?: string;
      topic?: string;
      level?: string;
      goal?: string;
      history?: ChatMsg[];
      user_id?: string | null;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (user_id) {
      await insertChatMessage({ user_id, role: "user", content: message }).catch(() => {});
    }

    const result = await runChatManager({ message, topic, level, goal, history });

    if (user_id && result.response) {
      await insertChatMessage({ user_id, role: "assistant", content: result.response }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[agent] error:", error);
    return NextResponse.json({ error: "Agent pipeline error", details: String(error) }, { status: 500 });
  }
}
