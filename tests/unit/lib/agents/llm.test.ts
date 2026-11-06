import { describe, expect, it } from "vitest";
import { replyText } from "@/lib/agents/llm";

// A Gemini reply's text is the join of all its parts. Reading only the first part
// is what cut tutor replies off mid-sentence.

describe("replyText", () => {
  it("joins every part of a split answer", () => {
    const data = { candidates: [{ content: { parts: [{ text: "To move to a new line, use `\\n` " }, { text: "or `std::endl`." }] } }] };
    expect(replyText(data)).toBe("To move to a new line, use `\\n` or `std::endl`.");
  });

  it("skips the model's thinking parts", () => {
    const data = { candidates: [{ content: { parts: [{ text: "reasoning…", thought: true }, { text: "The answer." }] } }] };
    expect(replyText(data)).toBe("The answer.");
  });

  it("is empty for a reply with no candidates", () => {
    expect(replyText({})).toBe("");
    expect(replyText(null)).toBe("");
  });
});
