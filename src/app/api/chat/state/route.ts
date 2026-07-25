// Chat persistence, keyed by course_id so duplicated courses keep separate threads.
//   GET    /api/chat/state?user_id=..&course_id=..                       -> { state }
//   POST   /api/chat/state { user_id, course_id, module, messages, calib } -> { ok }
//   DELETE /api/chat/state?user_id=..&course_id=..                       -> { ok }  (clears messages, keeps calibration)
// Fail-soft: storage problems return null/ok:false, never 5xx.

import { NextResponse } from "next/server";
import { clearChatMessages, loadChatState, saveChatState } from "@/app/api/supabase/chat-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const course_id = searchParams.get("course_id");
  if (!user_id || !course_id) {
    return NextResponse.json({ error: "user_id and course_id are required" }, { status: 400 });
  }
  const state = await loadChatState(user_id, course_id);
  return NextResponse.json({ state });
}

export async function POST(request: Request) {
  try {
    const { user_id, course_id, module: moduleId, messages, calib } = await request.json();
    if (!user_id || !course_id || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "user_id, course_id and messages are required" },
        { status: 400 }
      );
    }
    const ok = await saveChatState(user_id, course_id, moduleId ?? "", {
      messages,
      calib: calib ?? {},
    });
    return NextResponse.json({ ok });
  } catch (error) {
    console.error("[chat/state] error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get("user_id");
  const course_id = searchParams.get("course_id");
  if (!user_id || !course_id) {
    return NextResponse.json({ error: "user_id and course_id are required" }, { status: 400 });
  }
  const ok = await clearChatMessages(user_id, course_id);
  return NextResponse.json({ ok });
}
