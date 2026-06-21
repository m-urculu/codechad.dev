// Chat persistence.
//   GET  /api/chat/state?user_id=..&module=..  -> { state }   (load)
//   POST /api/chat/state { user_id, module, messages, calib } -> { ok }  (save)
// Fail-soft: storage problems return null/ok:false, never 5xx.

import { NextResponse } from "next/server";
import { loadChatState, saveChatState } from "@/app/api/supabase/chat-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const moduleId = searchParams.get("module");
  if (!user_id || !moduleId) {
    return NextResponse.json({ error: "user_id and module are required" }, { status: 400 });
  }
  const state = await loadChatState(user_id, moduleId);
  return NextResponse.json({ state });
}

export async function POST(request: Request) {
  try {
    const { user_id, module: moduleId, messages, calib } = await request.json();
    if (!user_id || !moduleId || !Array.isArray(messages)) {
      return NextResponse.json({ error: "user_id, module and messages are required" }, { status: 400 });
    }
    const ok = await saveChatState(user_id, moduleId, { messages, calib: calib ?? {} });
    return NextResponse.json({ ok });
  } catch (error) {
    console.error("[chat/state] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
