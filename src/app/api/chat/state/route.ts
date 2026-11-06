// Chat persistence, keyed by course_id so duplicated courses keep separate threads.
//   GET    /api/chat/state?user_id=..&course_id=..                       -> { state }
//   POST   /api/chat/state { user_id, course_id, module, messages, calib } -> { ok }
//   DELETE /api/chat/state?user_id=..&course_id=..                       -> { ok }  (clears messages, keeps calibration)
// Fail-soft: storage problems return null/ok:false, never 5xx.
//
// A save that would SHRINK a stored conversation by more than a few messages is
// refused (409, refused: "shorter"). Nothing the learner does legitimately does that
// — resetting a course clears the thread through DELETE or the course routes, not
// through a save — and twice a client that booted with the wrong idea of who was
// signed in replaced a real history with a one-line greeting this way.

import { NextResponse } from "next/server";
import { clearChatMessages, loadChatState, saveChatState } from "@/app/api/supabase/chat-state";
import { requireUser } from "@/lib/apiAuth";

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const { searchParams } = new URL(request.url);
  const course_id = searchParams.get("course_id");
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }
  const state = await loadChatState(who.userId, course_id);
  return NextResponse.json({ state });
}

// Below this many stored messages there is too little history to protect, and a
// short thread legitimately changes shape (calibration rewrites its opening).
const SHRINK_GUARD_MIN = 6;
// How far a save may legitimately come in under the stored thread: the chat drops
// stale "Resuming…" recaps when it loads one, and replaces a lesson's intro rather
// than repeating it. A stale tab saving its short copy over a longer thread does
// not fit in this, even after the learner adds a message or two to it.
const SHRINK_ALLOWANCE = 4;

export async function POST(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  try {
    const { course_id, module: moduleId, messages, calib } = await request.json();
    if (!course_id || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "course_id and messages are required" },
        { status: 400 }
      );
    }
    const existing = await loadChatState(who.userId, course_id);
    const had = existing?.messages.length ?? 0;
    if (had >= SHRINK_GUARD_MIN && messages.length < had - SHRINK_ALLOWANCE) {
      console.error(`[chat/state] refused: ${messages.length} messages would replace ${had}`);
      return NextResponse.json({ ok: false, refused: "shorter" }, { status: 409 });
    }
    const ok = await saveChatState(who.userId, course_id, moduleId ?? "", {
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
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const { searchParams } = new URL(request.url);
  const course_id = searchParams.get("course_id");
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }
  const ok = await clearChatMessages(who.userId, course_id);
  return NextResponse.json({ ok });
}
