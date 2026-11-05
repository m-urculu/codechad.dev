import { describe, expect, it } from "vitest";
import { tierOf } from "@/lib/agents/level";
import { LEVELS } from "@/lib/modules";

// tierOf turns the learner's stated level into one of three tiers. The tier decides
// what a course CONTAINS (see paths.test.ts), so a wrong tier means a wrong course.

describe("tierOf — the three answers the app offers", () => {
  it.each([
    [LEVELS[0], "beginner"],
    [LEVELS[1], "intermediate"],
    [LEVELS[2], "advanced"],
  ])("maps the built-in answer %j to %s", (level, tier) => {
    // These are the buttons on the level question; each must land on its own tier.
    expect(tierOf(level)).toBe(tier);
  });

  it("maps 'Some experience' to intermediate, although it contains 'experience'", () => {
    // "experienc" is an advanced keyword, so the intermediate words are checked first.
    // This is the case the order of checks in tierOf exists for.
    expect(tierOf("Some experience")).toBe("intermediate");
  });
});

describe("tierOf — free text ('Type my own…')", () => {
  it.each([
    ["No experience", "beginner"],
    ["never coded", "beginner"],
    ["zero", "beginner"],
    ["I know the basics", "intermediate"],
    ["self-taught", "intermediate"],
    ["rusty", "intermediate"],
    ["5 years of Java", "advanced"],
    ["Senior engineer", "advanced"],
    ["I'm a pro", "advanced"],
  ])("maps %j to %s by keyword", (level, tier) => {
    // Learners describe themselves in their own words; keywords decide the tier.
    expect(tierOf(level)).toBe(tier);
  });

  it.each([
    "Not experienced",
    "not very experienced",
    "Inexperienced",
    "I don't have much experience",
    "Not an expert",
    "can't say I'm experienced",
  ])("reads a negated advanced keyword as a beginner: %j", (level) => {
    // Regression: "Not experienced" used to map to ADVANCED, because the keyword
    // "experienc" matched and the "not" was ignored. A learner who says they are new
    // was given condensed foundation courses.
    expect(tierOf(level)).toBe("beginner");
  });

  it.each([
    ["Years of experience, not a beginner", "advanced"],
    ["I'm not new, very experienced", "advanced"],
    ["not professionally, but experienced", "advanced"],
    ["Not a beginner", "intermediate"],
    ["not my first time", "intermediate"],
    ["Not new to it, but not an expert", "intermediate"],
  ])("judges what is left once negated phrases are set aside: %j → %s", (level, tier) => {
    // Regression: a negated BEGINNER word ("not a beginner") used to map to beginner,
    // and a negated advanced word could hide a real one ("not professionally, but
    // experienced"). A remaining positive keyword decides; otherwise the negations do:
    // "not a beginner" is above beginner, and "not new but not an expert" is between.
    expect(tierOf(level)).toBe(tier);
  });

  it("does not treat an unrelated 'not' as negating the level", () => {
    // The negation has to be about the experience itself.
    expect(tierOf("Experienced, but not in Go")).toBe("advanced");
    expect(tierOf("Some experience, not much")).toBe("intermediate");
  });

  it("puts a beginner keyword ahead of an advanced one", () => {
    // "Advanced beginner" is still a beginner: when unsure, teach the gentler course.
    expect(tierOf("Advanced beginner")).toBe("beginner");
  });

  it("puts unrecognised text in the middle, not at either extreme", () => {
    // Guessing intermediate is wrong by at most one step in either direction.
    expect(tierOf("whatever")).toBe("intermediate");
  });
});

describe("tierOf — no answer", () => {
  it.each([undefined, null, "", "   "])("treats %j as a beginner", (level) => {
    // An absent level is what the app did before levels existed, and the gentler failure.
    expect(tierOf(level)).toBe("beginner");
  });
});
