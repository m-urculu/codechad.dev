// POST /api/lesson/evaluate — grade a submission against the lesson's fixed objectives.
// Body: { pointTitle, objectives, code, output, alreadyPassed? } -> { results, message }

import { NextResponse } from "next/server";
import { evaluateSubmission, type Objective } from "@/lib/agents/lesson";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pointTitle, objectives, code, output, alreadyPassed } = body as {
      pointTitle?: string;
      objectives?: Objective[];
      code?: string;
      output?: string;
      alreadyPassed?: string[];
    };
    if (!pointTitle || !Array.isArray(objectives) || objectives.length === 0) {
      return NextResponse.json({ error: "pointTitle and objectives are required" }, { status: 400 });
    }
    const evaluation = await evaluateSubmission({
      pointTitle,
      objectives,
      code: code ?? "",
      output: output ?? "",
      alreadyPassed: Array.isArray(alreadyPassed) ? alreadyPassed : [],
    });
    return NextResponse.json(evaluation);
  } catch (error) {
    console.error("[lesson/evaluate] error:", error);
    return NextResponse.json({ error: "Lesson evaluation error", details: String(error) }, { status: 500 });
  }
}
