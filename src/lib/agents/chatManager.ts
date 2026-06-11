// Chat Manager — the application-aware tutor for chat Q&A and node lessons.
//
// Roadmap creation/expansion now lives in the dedicated snowflake endpoints
// (/api/roadmap/*). This handler answers chat messages and teaches lessons,
// always grounded in the app context (see appContext.ts).

import { tutorSystem } from "./appContext";
import { geminiText } from "./llm";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type ManagerResult = { action: "tutor"; response: string };

type ManagerInput = {
  message: string;
  topic?: string;
  level?: string;
  goal?: string;
  history?: ChatMsg[];
};

function historyToText(history: ChatMsg[] = []): string {
  return history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
}

export async function runChatManager(input: ManagerInput): Promise<ManagerResult> {
  const { message, topic, level, goal, history = [] } = input;
  const historyText = historyToText(history);
  const reply = await geminiText(
    `${historyText ? historyText + "\n" : ""}User: ${message}`,
    tutorSystem({ topic, level, goal })
  );
  return { action: "tutor", response: reply };
}
