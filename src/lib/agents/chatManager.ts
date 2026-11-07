// Chat Manager — the application-aware tutor for chat Q&A and node lessons.
//
// Roadmap creation/expansion now lives in the dedicated snowflake endpoints
// (/api/roadmap/*). This handler answers chat messages and teaches lessons,
// always grounded in the app context (see appContext.ts).

import { tutorSystem } from "./appContext";
import { geminiText } from "./llm";
import type { SyntaxItem } from "@/lib/syntax";
import { withoutAnswer } from "./leak";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type ManagerResult = { action: "tutor"; response: string };

type ManagerInput = {
  message: string;
  topic?: string;
  level?: string;
  goal?: string;
  moduleId?: string;
  hasRoadmap?: boolean;
  activeLesson?: string;
  lessonSyntax?: SyntaxItem[];
  /** The active exercise: what it asks, and its answer lines (normalized). */
  exercise?: { objectives: string[]; answer: string[] };
  history?: ChatMsg[];
};

function historyToText(history: ChatMsg[] = []): string {
  return history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
}

export async function runChatManager(input: ManagerInput): Promise<ManagerResult> {
  const { message, topic, level, goal, moduleId, hasRoadmap, activeLesson, lessonSyntax, exercise, history = [] } = input;
  const historyText = historyToText(history);
  const system = tutorSystem({ topic, level, goal, moduleId, hasRoadmap, activeLesson, lessonSyntax, exercise });
  const userTurn = `${historyText ? historyText + "\n" : ""}User: ${message}`;
  // Checked after generation: a code block that is the exercise's answer is
  // regenerated once, then removed (src/lib/agents/leak.ts).
  const reply = await withoutAnswer((fix) => geminiText(userTurn, system + fix), exercise?.answer ?? []);
  return { action: "tutor", response: reply };
}
