import { describe, expect, it } from "vitest";
import {
  PATHS,
  getPath,
  getPathByTitle,
  pathModules,
  pathRoadmap,
  type LearningPath,
  type PathCourse,
} from "@/lib/paths";

// A career path is a FIXED curriculum turned into a roadmap locally, with no AI call.
// Design: docs/learning-paths.md.

// ---- Fixture: a small hand-made path, so tests don't change when the real curriculum
// is edited. One foundation course (5 chapters: an odd number, one with its own
// runtime) and one ordinary course.
const BASICS: PathCourse = {
  title: "Basics",
  summary: "The language from zero",
  kind: "course",
  module: "python",
  foundation: true,
  chapters: [
    { title: "Variables", module: "python", summary: "Names and values" },
    "Loops",
    { title: "Shell", module: "linux" },
    "Functions",
    "Errors",
  ],
};
const SERVERS: PathCourse = {
  title: "Servers",
  summary: "HTTP in Go",
  kind: "project",
  module: "go",
  chapters: ["Routing", { title: "Storage", module: "sql", summary: "Persisting data" }],
};
const PATH: LearningPath = {
  id: "test",
  title: "Test Developer",
  blurb: "",
  summary: "A path for tests",
  goal: "Pass the tests",
  module: "python",
  color: "#000",
  courses: [BASICS, SERVERS],
};

describe("finding a path", () => {
  it("finds a real path by id, and returns null for anything else", () => {
    // The id is what a stored course and the landing card refer to.
    expect(getPath("backend")?.id).toBe("backend");
    for (const missing of ["nope", "", null, undefined]) expect(getPath(missing)).toBeNull();
  });

  it("finds a real path by its title, so a stored course can be recognised on resume", () => {
    // A path course is stored under its title.
    expect(getPathByTitle("Backend Developer")?.id).toBe("backend");
    expect(getPathByTitle("Nope")).toBeNull();
    expect(getPathByTitle(null)).toBeNull();
  });
});

describe("the real PATHS data", () => {
  it("has unique ids and titles, and every course has at least one chapter", () => {
    // Catches editing mistakes in the hand-written curriculum.
    expect(new Set(PATHS.map((p) => p.id)).size).toBe(PATHS.length);
    expect(new Set(PATHS.map((p) => p.title)).size).toBe(PATHS.length);
    for (const p of PATHS) for (const c of p.courses) expect(c.chapters.length).toBeGreaterThan(0);
  });
});

describe("pathModules — the runtimes a path is taught in", () => {
  it("lists each runtime once, in the order the learner first reaches it", () => {
    // Includes runtimes a single chapter switches to (linux, sql).
    expect(pathModules(PATH)).toEqual(["python", "linux", "go", "sql"]);
  });
});

describe("pathRoadmap — beginner (no level, or 'New to it')", () => {
  const r = pathRoadmap(PATH);

  it("copies the path's name, summary and goal onto the roadmap", () => {
    // The roadmap is what the rest of the app renders and stores.
    expect(r).toMatchObject({
      skill: "Test Developer",
      title: "Test Developer",
      summary: "A path for tests",
      goal: "Pass the tests",
    });
  });

  it("uses the generator's id scheme: t0, t0-s0, …", () => {
    // Stored progress and the lesson cache key on these ids, so they must match.
    expect(r.topics.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(r.topics[1].children?.map((c) => c.id)).toEqual(["t1-s0", "t1-s1"]);
  });

  it("leaves every chapter's lessons to be generated later (children: null)", () => {
    // null is what marks a node as expandable; the lessons come on demand.
    const chapters = r.topics.flatMap((t) => t.children ?? []);
    expect(chapters.every((c) => c.kind === "subtopic" && c.children === null)).toBe(true);
  });

  it("gives a plain chapter no summary and the course's runtime, and keeps an override", () => {
    // "Routing" inherits go; "Storage" names its own runtime and summary.
    const [routing, storage] = r.topics[1].children!;
    expect(routing).toMatchObject({ title: "Routing", summary: "", module: "go" });
    expect(storage).toMatchObject({ title: "Storage", summary: "Persisting data", module: "sql" });
  });

  it("teaches a foundation course in full", () => {
    // A beginner gets every chapter, and no "condensed" note.
    expect(r.topics[0].children).toHaveLength(5);
    expect(r.topics[0].summary).toBe("The language from zero");
    expect(pathRoadmap(PATH, "New to it").topics[0].children).toHaveLength(5);
  });
});

describe("pathRoadmap — advanced ('Experienced')", () => {
  const r = pathRoadmap(PATH, "Experienced");

  it("collapses a foundation course into one 'Condensed' chapter that names everything it covers", () => {
    // An experienced learner shouldn't sit through Variables; the generator is told
    // what the one chapter has to cover instead.
    const chapters = r.topics[0].children!;
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ title: "Condensed", module: "python" });
    for (const title of ["Variables", "Loops", "Shell", "Functions", "Errors"]) {
      expect(chapters[0].summary).toContain(title);
    }
  });

  it("says so on the course card", () => {
    // A shorter list must not look like missing content.
    expect(r.topics[0].summary).toBe("The language from zero — condensed for your level.");
  });

  it("leaves a course that is not foundation exactly as it is", () => {
    // Compression is about what the learner already knows, never about teaching less.
    expect(r.topics[1]).toEqual(pathRoadmap(PATH).topics[1]);
  });

  it("records the stated level on the roadmap", () => {
    // Later generation calls read it from here.
    expect(r.level).toBe("Experienced");
  });
});

describe("pathRoadmap — intermediate ('Some experience')", () => {
  const chapters = pathRoadmap(PATH, "Some experience").topics[0].children!;

  it("pairs neighbouring chapters, leaving the last one alone when the count is odd", () => {
    // 5 chapters → 3: the structure stays, the pace doubles.
    expect(chapters.map((c) => c.title)).toEqual(["Variables & Loops", "Shell & Functions", "Errors"]);
  });

  it("tells the generator what each pair covers", () => {
    // The summary is how the generator knows to teach both halves.
    expect(chapters[0].summary).toBe("Covers Variables and Loops together, for a learner who can already program.");
  });

  it("practises a pair in its first chapter's runtime", () => {
    // "Shell" (linux) leads its pair, so the pair runs in linux, not the course's python.
    expect(chapters.map((c) => c.module)).toEqual(["python", "linux", "python"]);
  });
});
