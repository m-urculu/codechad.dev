import { describe, expect, it } from "vitest";
import {
  curriculumLessonCount,
  curriculumRoadmap,
  getCurriculum,
  lessonSummary,
  lessonTitle,
  type Curriculum,
} from "@/lib/curricula";

// A curriculum is a fixed, single-technology syllabus. Its ORDER is authored; only the
// teaching inside each lesson is generated. So building its roadmap must never leave
// anything for the AI to invent.

// ---- Fixture: two chapters, one lesson with a scope line and two without.
const C: Curriculum = {
  module: "cpp",
  title: "C++",
  summary: "The language in its canonical order",
  goal: "Write modern C++",
  chapters: [
    {
      title: "Basics",
      summary: "First programs",
      lessons: ["Hello world", { title: "References", summary: "Aliases, not pointers" }],
    },
    { title: "Classes", summary: "Objects", lessons: ["Constructors"] },
  ],
};

describe("lessonTitle / lessonSummary", () => {
  it("reads a title-only lesson and a lesson with a scope line", () => {
    // A bare string is just a title; the object form adds what the lesson covers.
    expect(lessonTitle("Hello world")).toBe("Hello world");
    expect(lessonSummary("Hello world")).toBe("");
    expect(lessonTitle({ title: "References", summary: "Aliases" })).toBe("References");
    expect(lessonSummary({ title: "References", summary: "Aliases" })).toBe("Aliases");
  });
});

describe("getCurriculum and the real data", () => {
  it("finds a curriculum by its runtime, and returns null for anything else", () => {
    // The landing page asks "is there a fixed syllabus for this technology?"
    expect(getCurriculum("cpp")?.module).toBe("cpp");
    for (const missing of ["cobol", "", null, undefined]) expect(getCurriculum(missing)).toBeNull();
  });

  it("gives every real chapter at least one lesson with a title", () => {
    // Catches editing mistakes in the hand-written syllabus.
    const cpp = getCurriculum("cpp")!;
    for (const chapter of cpp.chapters) {
      expect(chapter.lessons.length).toBeGreaterThan(0);
      for (const l of chapter.lessons) expect(lessonTitle(l).trim()).not.toBe("");
    }
  });
});

describe("curriculumLessonCount", () => {
  it("adds up the lessons across every chapter", () => {
    // The "N lessons" line on the course card: 2 + 1.
    expect(curriculumLessonCount(C)).toBe(3);
  });
});

describe("curriculumRoadmap", () => {
  const r = curriculumRoadmap(C);

  it("puts lessons directly under chapters, with ids t0, t0-p0, …", () => {
    // No sub-topic layer: the lessons ARE the syllabus, so nothing sits between.
    expect(r.topics.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(r.topics[0].children!.map((l) => l.id)).toEqual(["t0-p0", "t0-p1"]);
  });

  it("makes every lesson a finished leaf (children: []), so nothing is generated", () => {
    // [] rather than null is what stops the expander calling the AI.
    const lessons = r.topics.flatMap((t) => t.children!);
    expect(lessons.every((l) => l.kind === "point" && Array.isArray(l.children) && l.children.length === 0)).toBe(true);
  });

  it("carries each lesson's title, scope line and the curriculum's runtime", () => {
    // The scope line tells the lesson agent where this lesson's boundaries are.
    expect(r.topics[0].children![1]).toMatchObject({ title: "References", summary: "Aliases, not pointers", module: "cpp" });
    expect(r.topics[0].children![0].summary).toBe("");
  });

  it("builds the same tree at every level", () => {
    // A language's order doesn't change for an experienced learner; only the lessons'
    // depth does, and that happens later, in the lesson agent.
    expect(curriculumRoadmap(C, "Experienced").topics).toEqual(curriculumRoadmap(C, "New to it").topics);
  });

  it("uses the learner's goal when they gave one, and the curriculum's otherwise", () => {
    // The goal shapes every generated lesson's examples.
    expect(r.goal).toBe("Write modern C++");
    expect(curriculumRoadmap(C, "Experienced", "Game engines").goal).toBe("Game engines");
    expect(curriculumRoadmap(C, "Experienced", "").goal).toBe("Write modern C++");
  });
});
