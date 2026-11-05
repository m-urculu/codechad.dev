import { describe, expect, it } from "vitest";
import { courseTitle, extractJSON } from "@/lib/agents/snowflake";

// The AI's replies are not under our control. These two functions are the part of
// roadmap generation that IS deterministic: turning a messy reply into data, and a
// messy title into a course name. Gemini itself is deliberately not tested here.

describe("extractJSON — pulling data out of an AI reply", () => {
  it("parses a reply that is just JSON", () => {
    // The happy path: the model did exactly what it was asked.
    expect(extractJSON('{"title":"Go","topics":[]}')).toEqual({ title: "Go", topics: [] });
  });

  it.each([
    ["```json fence", '```json\n{"a":1}\n```'],
    ["upper-case fence", '```JSON\n{"a":1}\n```'],
    ["fence followed by prose", '```json\n{"a":1}\n```\nLet me know if you need more!'],
  ])("unwraps a Markdown code fence: %s", (_label, reply) => {
    // Models often wrap JSON in ```json … ``` even when told not to.
    expect(extractJSON(reply)).toEqual({ a: 1 });
  });

  it("finds the JSON inside a chatty reply", () => {
    // "Sure! Here is your roadmap: {…} Hope it helps."
    expect(extractJSON('Sure! Here is your roadmap: {"a":[1,2]} Hope it helps.')).toEqual({ a: [1, 2] });
  });

  it("returns an array when the reply's JSON is an array", () => {
    // Some prompts ask for a list.
    expect(extractJSON('Topics: ["x","y"]')).toEqual(["x", "y"]);
  });

  it.each([
    ["a refusal", "I cannot help with that."],
    ["an empty reply", ""],
    ["a reply cut off mid-JSON", '{"a": [1, 2'],
  ])("returns null instead of throwing for %s", (_label, reply) => {
    // The caller treats null as "bad reply" and retries; a throw would crash the request.
    expect(extractJSON(reply)).toBeNull();
  });
});

describe("courseTitle — the AI's title as a course name", () => {
  it.each([
    ["straight quotes", '"Python for Data"'],
    ["curly quotes and a full stop", "“Python for Data.”"],
    ["extra spaces and line breaks", "  Python \n  for   Data  "],
  ])("cleans %s the way a typed name would be", (_label, raw) => {
    // The title becomes the course name on the landing page.
    expect(courseTitle(raw, "Fallback")).toBe("Python for Data");
  });

  it("keeps meaningful punctuation such as a question or exclamation mark", () => {
    // Only quotes and trailing . , ; : are noise.
    expect(courseTitle("Learn Go!", "Fallback")).toBe("Learn Go!");
  });

  it("caps the name at 80 characters, the limit renaming allows", () => {
    // A name the rename action could never produce must not exist.
    expect(courseTitle("x".repeat(200), "Fallback")).toHaveLength(80);
  });

  it.each([
    ["empty", ""],
    ["only quotes", '""'],
    ["missing", null],
  ])("falls back when the title is %s", (_label, raw) => {
    // A course always has a name.
    expect(courseTitle(raw, "Python")).toBe("Python");
  });
});
