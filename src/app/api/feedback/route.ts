// POST /api/feedback { kind, message, email?, context? } -> { ok: true }
//
// Open to anonymous visitors by design — see the migration (0007). The user id is
// derived from the token when one is present and IGNORED when the body claims one,
// same rule as every other route (src/lib/apiAuth.ts).
//
// Not fail-soft, unlike the persistence routes: someone who takes the trouble to
// write feedback must be told whether it arrived. Silently swallowing it would be
// worse than not offering the button.

import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/apiAuth";
import { feedbackRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const KINDS = ["bug", "idea", "confusing", "general"] as const;
type Kind = (typeof KINDS)[number];

const MAX_MESSAGE = 4000; // matches the CHECK constraint on the column
const MAX_EMAIL = 320;

// Only the fields we asked for, only the shapes we expect. The context object is
// assembled by our own client, but it arrives over the wire like anything else.
function cleanContext(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const key of ["module", "courseId", "lessonId", "path", "view"]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v) out[key] = v.slice(0, 200);
  }
  return out;
}

export async function POST(request: Request) {
  const limited = feedbackRateLimit(request);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { kind, message, email, context } = (body ?? {}) as Record<string, unknown>;

  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return NextResponse.json({ error: "A message is required." }, { status: 400 });
  if (text.length > MAX_MESSAGE) {
    return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  }

  const k: Kind = KINDS.includes(kind as Kind) ? (kind as Kind) : "general";

  // Optional and deliberately unverified: it is a reply-to address, not an identity.
  // A malformed one is the sender's problem to notice, so reject it rather than
  // storing something we can never write back to.
  const mail = typeof email === "string" ? email.trim() : "";
  if (mail && (mail.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) {
    return NextResponse.json({ error: "That email address looks wrong." }, { status: 400 });
  }

  const userId = await optionalUser(request);

  try {
    const { error } = await supabaseAdmin.from("feedback").insert({
      user_id: userId,
      email: mail || null,
      kind: k,
      message: text,
      context: cleanContext(context),
    });
    if (error) {
      console.error("[feedback] insert failed:", error.message);
      return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 502 });
    }
  } catch (err) {
    console.error("[feedback] error:", err);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
