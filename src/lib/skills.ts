// The skills ledger — what the learner already knows, as a fact about the LEARNER
// rather than a fact about one course.
//
// The problem it solves. Every course was generated as if it were the learner's
// first. Finish an introduction to Python in one course, start another Python
// course a week later, and the second one teaches variables again — because the
// only thing generation knew about prior knowledge was the stated level and, for
// the same technology, the TOPIC TITLES of sibling courses (siblingCourses),
// whether or not a single lesson in them had ever been opened. A title the learner
// never reached is not knowledge.
//
// So the ledger is built from COMPLETION, not from enrolment. It answers one
// question for the generators: which ground has this person actually covered?
//
// Two things it deliberately does NOT do:
//
//  1. It does not claim semantic equality. "Error Handling" and "Exceptions and
//     Error Handling" normalize to different keys and both end up in the ledger.
//     That is fine: the consumer is a language model reading a list, and it merges
//     synonyms far better than a slug comparison would. The normalization here
//     exists to collapse the EXACT repeats (the same topic finished in two courses)
//     that would otherwise fill the prompt with duplicates.
//
//  2. It does not treat knowledge as portable between technologies without saying
//     so. Finishing "Functions and Scope" in Python tells you the learner knows
//     what a function IS; it tells you nothing about Go's multiple returns or
//     named result parameters. Cross-technology entries are therefore passed to
//     the prompt as a WEAKER signal, under their own heading, with instructions to
//     assume the concept and still teach this language's specifics. Getting this
//     wrong in the other direction — silently skipping Go's function semantics
//     because the learner once wrote a Python function — is a much worse failure
//     than a little redundancy.

import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";
import { lessonRatio, nodeRatio, type LessonProgress, type PointRatio } from "@/lib/courseProgress";

/** How much ground one ledger entry stands for. */
export type SkillKind = "topic" | "subtopic" | "point";

export type DerivedSkill = {
  key: string;
  label: string;
  kind: SkillKind;
};

/** A ledger row as the generators consume it. */
export type KnownSkill = DerivedSkill & {
  /** Runtime id the skill was learned in; "" when the course never had one. */
  module: string;
  technology?: string;
  courseName?: string;
};

// Words that carry no meaning in a curriculum title. Stripping them is what makes
// "Introduction to Functions" and "Functions" the same key — which matters, because
// those are exactly the pair that shows up when a learner takes two courses on one
// technology.
const NOISE = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "for", "with", "on", "at", "by",
  "from", "into", "your", "you", "its", "it", "is", "are", "be", "how", "what", "why",
  "intro", "introduction", "introducing", "basics", "basic", "fundamental",
  "fundamentals", "getting", "started", "start", "beginner", "beginners", "essential",
  "essentials", "overview", "guide", "primer", "understanding", "working", "using",
  "learn", "learning", "deep", "dive", "advanced", "part", "core", "concepts",
  "concept", "module", "lesson", "chapter", "section", "topic",
]);

/**
 * Normalize a curriculum title into a comparison key.
 *
 * Deliberately aggressive: it lowercases, drops punctuation and the noise words
 * above, and sorts what remains, so word order stops mattering ("Lists and
 * Dictionaries" == "Dictionaries and Lists"). Aggressive normalization risks
 * collapsing two genuinely different topics into one key, and the cost of that is
 * small — one entry in a prompt list instead of two — while the cost of the
 * opposite is the duplicate curriculum this whole file exists to prevent.
 *
 * A title made entirely of noise ("Getting Started") normalizes to nothing; the
 * caller keeps the raw title as the key so it is still recorded rather than lost.
 */
export function skillKey(title: string): string {
  const words = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w && !NOISE.has(w));
  if (words.length === 0) {
    return String(title ?? "").toLowerCase().replace(/\s+/g, "-").trim();
  }
  return Array.from(new Set(words)).sort().join("-");
}

// A node counts as finished at the same threshold the progress bars use. 0.999
// rather than 1 because the ratio is a mean of means and floating point alone can
// leave a fully-complete topic a hair short.
const COMPLETE = 0.999;

/**
 * Reduce one course to the things the learner has FINISHED in it.
 *
 * Walks top-down and stops descending the moment a node is complete, so a finished
 * topic produces ONE entry rather than the thirty lessons underneath it. That is
 * what keeps the ledger small enough to paste into a prompt: a learner who has
 * genuinely finished six topics contributes six lines, not six hundred.
 *
 * An unexpanded branch contributes nothing. The snowflake tree is generated lazily,
 * so "no children" means "never explored", never "nothing to learn here".
 */
export function deriveSkills(roadmap: Roadmap | null, progress: Record<string, LessonProgress>): DerivedSkill[] {
  const out: DerivedSkill[] = [];
  const seen = new Set<string>();
  const pointOf: PointRatio = (id) => lessonRatio(progress[id]);

  const push = (node: RoadmapNode, kind: SkillKind) => {
    const label = String(node.title ?? "").trim();
    if (!label) return;
    const key = skillKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, label, kind });
  };

  const walk = (node: RoadmapNode) => {
    if (node.kind === "point") {
      if (pointOf(node.id) >= COMPLETE) push(node, "point");
      return;
    }
    const children = node.children;
    if (!Array.isArray(children) || children.length === 0) return;
    if (nodeRatio(node, pointOf) >= COMPLETE) {
      push(node, node.kind === "topic" ? "topic" : "subtopic");
      return; // finished — no need to enumerate what is inside it
    }
    for (const child of children) walk(child);
  };

  for (const topic of roadmap?.topics ?? []) walk(topic);
  return out;
}

// How many entries each heading may contribute to a prompt. The ledger grows without
// bound as someone uses the app; the prompt does not. Coarse entries are kept first
// (see loadKnownSkills' ordering), so a truncated list loses individual lessons
// before it loses whole finished topics.
const SAME_TECH_LIMIT = 40;
const OTHER_TECH_LIMIT = 18;

/**
 * Render the ledger as the block that goes into a generation prompt.
 *
 * Returns "" when there is nothing to say, so every call site can concatenate it
 * unconditionally.
 *
 * `module` is the technology being generated FOR. Everything else is another
 * technology, and is presented as the weaker signal described at the top of this
 * file. Cross-technology entries are also restricted to whole finished topics and
 * sub-topics: one completed lesson in another language is not a fact worth bending
 * this curriculum around.
 */
export function knownSkillsBlock(known: KnownSkill[], module: string | undefined): string {
  if (!known.length) return "";
  const mod = module ?? "";
  const same = known.filter((k) => k.module === mod).slice(0, SAME_TECH_LIMIT);
  const other = known
    .filter((k) => k.module !== mod && k.kind !== "point")
    .slice(0, OTHER_TECH_LIMIT);
  if (!same.length && !other.length) return "";

  let block = "";
  if (same.length) {
    block +=
      `ALREADY COMPLETED BY THIS LEARNER, IN THIS SAME TECHNOLOGY — they finished every ` +
      `lesson under each of these, in an earlier course:\n` +
      same.map((k) => `  • ${k.label}${k.kind === "point" ? " (one lesson)" : ""}`).join("\n") +
      `\nTreat this as taught and passed, not merely seen. Do NOT build a topic, sub-topic or ` +
      `lesson whose subject is any of it. You may USE it freely — build on it, assume the ` +
      `vocabulary, write exercises that require it — but never teach it again. If this course's ` +
      `goal demands a genuinely deeper treatment of one of them, that is allowed, and the topic's ` +
      `description must say what is new about it.\n`;
  }
  if (other.length) {
    block +=
      `COMPLETED IN OTHER TECHNOLOGIES — the learner finished this material, but in a different ` +
      `language or tool:\n` +
      other
        .map((k) => `  • ${k.label}${k.technology ? ` (in ${k.technology})` : ""}`)
        .join("\n") +
      `\nThis is a WEAKER signal, and mishandling it costs the learner more than repeating ` +
      `something would. They know the CONCEPT — never define it from scratch, never spend a ` +
      `topic on "what a loop/function/type is". They do NOT know how ${
        module ? "this technology" : "it"
      } specifically does it. Teach the syntax, semantics, idiom and pitfalls that are particular ` +
      `here, at the pace of someone who understands the idea and is meeting the implementation ` +
      `for the first time.\n`;
  }
  return block;
}
