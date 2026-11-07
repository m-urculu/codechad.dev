// POST /api/docs/autolink — link the inline code in saved tutor messages.
// Body: { moduleId, texts: string[] } -> { texts: string[] }
//
// New messages are linked when they are written (linkInlineCode). Messages saved
// before that are sent here once when the chat shows them; the chat saves what comes
// back, so each message is linked once. Deterministic: no model call.

import { NextResponse } from "next/server";
import { canonicalDocTerm } from "@/lib/docs-index";
import { linkInlineCode } from "@/lib/docSearch";
import { userOrTrial } from "@/lib/apiAuth";

const MAX_TEXTS = 40;
const MAX_CHARS = 20_000;

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;
  try {
    const { moduleId, texts } = await request.json();
    const list: string[] = (Array.isArray(texts) ? texts : []).slice(0, MAX_TEXTS).map((t) => String(t ?? "").slice(0, MAX_CHARS));
    const linked = await Promise.all(list.map((t) => linkInlineCode(t, moduleId, (term) => canonicalDocTerm(moduleId, term))));
    return NextResponse.json({ texts: linked });
  } catch (e) {
    console.error("[docs/autolink] error:", e);
    return NextResponse.json({ texts: [] });
  }
}
