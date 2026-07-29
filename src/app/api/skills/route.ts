// GET /api/skills -> { skills, count }
//
// The learner's own view of the ledger that shapes their course generation.
//
// This exists because the ledger is otherwise invisible: it silently removes
// material from every course they generate from here on. A system that decides what
// you are not taught, and cannot be inspected, is one the learner has no way to
// question when it gets something wrong. Read-only for now — the rows are derived
// from completed work, so the way to change one is to reset the course that claimed
// it, which is already an action the app offers.

import { NextResponse } from "next/server";
import { loadKnownSkills } from "@/app/api/supabase/skills";
import { requireUser } from "@/lib/apiAuth";

export async function GET(request: Request) {
  const who = await requireUser(request);
  if ("error" in who) return who.error;

  const skills = await loadKnownSkills(who.userId);
  return NextResponse.json({ skills, count: skills.length });
}
