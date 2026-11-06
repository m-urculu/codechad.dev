// POST /api/agent — entrypoint for the agent pipeline (chat manager).
//
// Body: { message, topic?, level?, goal?, history? }  (user comes from the token)
// Returns: { action, response, roadmap? }

import { NextResponse } from "next/server";
import { runChatManager, type ChatMsg } from "@/lib/agents/chatManager";
import { insertChatMessage } from "@/app/api/supabase/chat-message";
import { optionalUser } from "@/lib/apiAuth";
import { cleanSyntax, type SyntaxItem } from "@/lib/syntax";
import { answerLines } from "@/lib/agents/leak";
import { canonicalDocTerm, validateDocLinks } from "@/lib/docs-index";
import { findDocPages, linkInlineCode } from "@/lib/docSearch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, topic, level, goal, moduleId, docModule, hasRoadmap, activeLesson, lessonSyntax, lessonExercise, history } = body as {
      message?: string;
      topic?: string;
      level?: string;
      goal?: string;
      moduleId?: string;
      docModule?: string;
      hasRoadmap?: boolean;
      activeLesson?: string;
      lessonSyntax?: SyntaxItem[];
      lessonExercise?: { objectives?: string[]; solution?: string; starterCode?: string };
      history?: ChatMsg[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const user_id = await optionalUser(request);

    if (user_id) {
      await insertChatMessage({ user_id, role: "user", content: message }).catch(() => {});
    }

    // Shape-checked only: the items were validated against the solution when the
    // lesson was built, and this route never sees the solution.
    const syntax = cleanSyntax(lessonSyntax);
    // The exercise's answer, as the lines the learner must write. Given to the tutor
    // so it knows what not to show, and checked against its reply (leak.ts).
    const ex = activeLesson && lessonExercise ? lessonExercise : undefined;
    const answer = ex ? answerLines(ex.solution ? String(ex.solution) : undefined, ex.starterCode ? String(ex.starterCode) : undefined) : [];
    const objectives = Array.isArray(ex?.objectives) ? ex.objectives.slice(0, 5).map((o) => String(o).slice(0, 300)) : [];
    const result = await runChatManager({
      message, topic, level, goal, moduleId, hasRoadmap, activeLesson, lessonSyntax: syntax, history,
      exercise: { objectives, answer },
    });
    // Every doc link checked against the real docs index before it is shown.
    const docsFor = docModule ?? moduleId;
    result.response = await validateDocLinks(result.response, docsFor, {
      context: `${activeLesson ?? topic ?? ""}. ${message.slice(0, 300)}`,
      findPages: (refs) => findDocPages(docsFor, refs),
    });
    // And the syntax it shows as inline code, linked to where the docs define it.
    result.response = await linkInlineCode(result.response, docsFor, (t) => canonicalDocTerm(docsFor, t));

    if (user_id && result.response) {
      await insertChatMessage({ user_id, role: "assistant", content: result.response }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[agent] error:", error);
    return NextResponse.json({ error: "Agent pipeline error", details: String(error) }, { status: 500 });
  }
}
