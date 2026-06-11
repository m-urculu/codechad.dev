// POST /api/roadmap/generate — L1 grounded overview.
// Body: { skill, level?, goal? }  ->  Roadmap (topics only; children lazy)

import { NextResponse } from "next/server";
import { generateOverview } from "@/lib/agents/snowflake";

export async function POST(request: Request) {
  try {
    const { skill, level, goal } = await request.json();
    if (!skill || typeof skill !== "string") {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    const roadmap = await generateOverview({ skill, level, goal });
    if (!roadmap) {
      return NextResponse.json({ error: "Could not generate the roadmap. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ roadmap });
  } catch (error) {
    console.error("[roadmap/generate] error:", error);
    return NextResponse.json({ error: "Roadmap generation error", details: String(error) }, { status: 500 });
  }
}
