// What the learner's stated level actually MEANS to a generator.
//
// The level used to travel as one line of prose — "Learner level: Experienced" —
// next to a paragraph of difficulty guidance written entirely for beginners. So
// the only concrete instruction in the prompt was the beginner one, and an
// experienced learner got beginner lessons with a harder-sounding preamble.
//
// A level is worth asking for only if it changes something. Here it changes four
// measurable things — how many lessons a branch is cut into, how many objectives
// a lesson carries, how much starter code is written for the learner, and what
// the intro is allowed to assume — plus, for a fixed career path, how much of the
// foundation is taught at all (see pathRoadmap).
//
// Three tiers, because the question offers three answers. The free-text option
// ("Type my own…") means anything can arrive here, so the mapping is by keyword
// and unrecognised text lands in the middle rather than at either extreme.

export type Tier = "beginner" | "intermediate" | "advanced";

const ADVANCED = /\b(experienc|advanc|senior|expert|profession|fluent|proficient|years?\b|pro\b|veteran)/i;
const BEGINNER = /\b(new to|never|zero|nothing|beginner|novice|no experience|starting out|first time|complete beginner)/i;
const INTERMEDIATE = /\b(some|intermediate|basics|dabbl|hobby|self.?taught|a bit|familiar|rusty)/i;

/**
 * Map a stated level onto a tier.
 *
 * Order matters: "some experience" contains "experienc", so the middle is tested
 * before the top. An absent level is treated as a beginner — it is what the app
 * did before this existed, and the failure is the gentler one.
 */
export function tierOf(level?: string | null): Tier {
  const s = (level ?? "").trim();
  if (!s) return "beginner";
  if (BEGINNER.test(s)) return "beginner";
  if (INTERMEDIATE.test(s)) return "intermediate";
  if (ADVANCED.test(s)) return "advanced";
  return "intermediate";
}

type Rubric = {
  /** Sub-topics a topic is cut into. */
  subtopics: [number, number];
  /** Lessons a sub-topic is cut into. */
  lessons: [number, number];
  /** Objectives per lesson — the size of one exercise. */
  objectives: [number, number];
  /** How a branch should be decomposed, in the generator's own terms. */
  decomposition: string;
  /** How one lesson should be pitched, written and scaffolded. */
  difficulty: string;
};

const RUBRICS: Record<Tier, Rubric> = {
  beginner: {
    subtopics: [4, 8],
    lessons: [3, 6],
    objectives: [2, 3],
    decomposition:
      "Cut this into SMALL steps: one idea per lesson, in the order someone meeting it for the first time can follow. " +
      "Nothing here may assume the learner has programmed before.",
    difficulty:
      "Teach ONE new concept. The task should be a few short, simple lines applying just that concept — do NOT stack " +
      "auxiliary requirements (e.g. casting + aggregation + grouping + ordering at once); split ambition like that into " +
      "the objectives of LATER points that cover it. The learner must be able to complete it from the intro text alone. " +
      "Write generous starter code: the structure is given, with a clearly marked TODO for each thing they must supply.",
  },
  intermediate: {
    subtopics: [3, 6],
    lessons: [2, 4],
    objectives: [3, 4],
    decomposition:
      "This learner can already program and knows the vocabulary — decompose by what is genuinely DIFFERENT or " +
      "non-obvious here, not by first principles. Do not spend a lesson on syntax they can read; combine what they " +
      "can infer into one lesson and spend the space on the parts that actually catch people out.",
    difficulty:
      "Assume working knowledge of programming: variables, control flow, functions and collections need no explanation. " +
      "Teach the concept properly but skip the primer. The task may combine two related ideas and should take real " +
      "thought rather than transcription. Starter code gives the shape — signatures, imports, a stub — and leaves the " +
      "body to them.",
  },
  advanced: {
    subtopics: [2, 4],
    lessons: [1, 3],
    objectives: [3, 5],
    decomposition:
      "This learner is experienced. Cover this branch DENSELY: few lessons, each substantial. Omit anything they " +
      "would already know from any other language or system, and go straight to what is specific, surprising, or " +
      "commonly got wrong here — semantics, edge cases, performance characteristics, idiom. Never produce a lesson " +
      "whose content is 'this is what a loop/variable/function is'.",
    difficulty:
      "Assume a fluent programmer. NO primers, NO defining common terms, NO 'as you may know' preambles — go straight " +
      "to the substance. Pitch the exercise at something they could not write correctly on the first attempt without " +
      "understanding the specific behaviour being taught: edge cases, idiomatic usage, the thing the documentation " +
      "warns about. Starter code is minimal — a signature or a bare scaffold, no TODO-per-line hand-holding. " +
      "It is better to teach one genuinely non-obvious thing than four obvious ones.",
  },
};

export function rubricFor(level?: string | null): Rubric {
  return RUBRICS[tierOf(level)];
}

/** The difficulty contract for a lesson-generation prompt. */
export function difficultyGuidance(level?: string | null): string {
  const r = rubricFor(level);
  return (
    `DIFFICULTY CALIBRATION (learner level: ${level ?? "unknown"}). ${r.difficulty} ` +
    `Fit it to how early this point sits in the roadmap as well: the same level means something different on ` +
    `lesson 2 and lesson 40. Aim for ${r.objectives[0]}-${r.objectives[1]} objectives.`
  );
}

/** The decomposition contract for a roadmap-expansion prompt. */
export function decompositionGuidance(
  level: string | null | undefined,
  childKind: "subtopic" | "point"
): string {
  const r = rubricFor(level);
  const [lo, hi] = childKind === "subtopic" ? r.subtopics : r.lessons;
  return `LEVEL (${level ?? "unknown"}). ${r.decomposition} Produce ${lo}-${hi} children — the count is part of the calibration, not a formality.`;
}
