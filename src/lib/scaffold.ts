// The program skeleton — `#include`, `int main() { … }`, `package main` — as
// something the learner learns to write, not something always written for them.
//
// Every starter used to arrive with the skeleton in place. That keeps a lesson on its
// topic, but a learner who never types `#include <iostream>` or `int main()` has to
// look it up the first time they write a program of their own. Typing it in every
// lesson is the opposite failure. So the skeleton fades in and out like the syntax
// ledger (syntax.ts), counted by what the learner WROTE — seeing a line is not
// writing it:
//
//   - the first lessons:          the skeleton is given (it is new; it is shown);
//   - then, one piece at a time:  a piece written fewer than WRITTEN_ENOUGH times is
//                                 left out of the starter, with a TODO, and graded;
//   - once every piece is known:  the skeleton is given again;
//   - every REVIEW_EVERY lessons: all of it is left out, so it stays known.
//
// The pieces are removed from the generated starter here, deterministically, rather
// than asked of the model: the starter is always the model's full, compiling one with
// exactly the planned pieces taken out. A starter without its skeleton does not
// compile, which is fine — code checks are graded without a run (grade.ts), so each
// piece ticks off as it is written.

import type { ForbidLang } from "@/lib/runtimes/registry";
import { stripComments } from "@/lib/runtimes/comments";

export const WRITTEN_ENOUGH = 2;
export const GIVEN_AT_FIRST = 3;
export const REVIEW_EVERY = 8;

type Piece = {
  key: string;
  /** "lines": every matching line is removed. "block": the header and its { … } body wrapper. */
  kind: "lines" | "block";
  /** Finds the piece in a starter (multiline). */
  find: RegExp;
  /** The objective's check: matches the piece in the learner's code. */
  check: string;
  objective: string;
  todo: string;
};

const C_FAMILY: Piece[] = [
  {
    key: "include",
    kind: "lines",
    find: /^[ \t]*#include\s*[<"][^>"\n]+[>"][ \t]*$/gm,
    check: String.raw`^\s*#include\s*[<"][^>"]+[>"]`,
    objective: "Write the `#include` line(s) for the headers this program uses",
    todo: "include the header(s) this program needs",
  },
  {
    key: "main",
    kind: "block",
    find: /^[ \t]*int\s+main\s*\([^)]*\)\s*\{/m,
    check: String.raw`\bint\s+main\s*\([^)]*\)\s*\{`,
    objective: "Write the `main` function around the program's code",
    todo: "wrap the code below in the main function, the program's entry point, and return 0 from it",
  },
];

const SKELETON: Partial<Record<ForbidLang, Piece[]>> = {
  c: C_FAMILY,
  cpp: C_FAMILY,
  go: [
    {
      key: "package",
      kind: "lines",
      find: /^[ \t]*package\s+main[ \t]*$/gm,
      check: String.raw`^\s*package\s+main\b`,
      objective: "Declare the program's package",
      todo: "declare the package this program belongs to",
    },
    {
      key: "import",
      kind: "lines",
      find: /^[ \t]*import\s*(?:\([^)]*\)|"[^"\n]+")[ \t]*$/gm,
      check: String.raw`^\s*import\s*[("]`,
      objective: "Import the package(s) this program uses",
      todo: "import the package(s) this program uses",
    },
    {
      key: "main",
      kind: "block",
      find: /^[ \t]*func\s+main\s*\(\s*\)\s*\{/m,
      check: String.raw`\bfunc\s+main\s*\(\s*\)\s*\{`,
      objective: "Write the `main` function around the program's code",
      todo: "wrap the code below in the main function, the program's entry point",
    },
  ],
};

/** Is this TODO text one of the skeleton's own (see applyScaffold)? */
export function isSkeletonTodo(text: string): boolean {
  const t = text.trim();
  return Object.values(SKELETON).some((pieces) => pieces?.some((p) => p.todo === t));
}

export function skeletonPieces(lang: ForbidLang): Piece[] {
  return SKELETON[lang] ?? [];
}

/** How many times this learner has written each piece. */
export type Written = Record<string, number>;

/** What the learner has done in this technology so far, as the build needs it. */
export type ScaffoldHistory = { lessons: number; written: Written };

export type ScaffoldPlan = { mode: "full" | "practice" | "review"; omit: string[] };

/** Which skeleton pieces the next lesson leaves for the learner to write. */
export function planScaffold(lang: ForbidLang, history: ScaffoldHistory | undefined): ScaffoldPlan {
  const pieces = skeletonPieces(lang);
  const lessons = history?.lessons ?? 0;
  if (!pieces.length || lessons < GIVEN_AT_FIRST) return { mode: "full", omit: [] };
  // This is lesson number lessons + 1.
  if ((lessons + 1) % REVIEW_EVERY === 0) return { mode: "review", omit: pieces.map((p) => p.key) };
  const next = pieces.find((p) => (history?.written[p.key] ?? 0) < WRITTEN_ENOUGH);
  return next ? { mode: "practice", omit: [next.key] } : { mode: "full", omit: [] };
}

/** The prompt's note, so the intro describes the starter the learner will really see. */
export function scaffoldPrompt(lang: ForbidLang, plan: ScaffoldPlan): string {
  if (!plan.omit.length) return "";
  const names = skeletonPieces(lang)
    .filter((p) => plan.omit.includes(p.key))
    .map((p) => p.objective.replace(/^Write |^Declare |^Import /, "").replace(/`/g, ""));
  return (
    `SKELETON PRACTICE: write "starterCode" WITH the complete program skeleton, exactly as usual — the app ` +
    `itself removes ${names.join(" and ")} before the learner sees it, and they write ${plan.omit.length > 1 ? "those" : "that"} ` +
    `themselves this time (${plan.mode === "review" ? "a periodic review, so they can still write a program's skeleton unaided" : "they have seen it in earlier lessons, but never typed it"}). ` +
    `Where the intro describes the starter, say so in one sentence, in WORDS — never write those lines out.\n`
  );
}

/** Same positions, with comments and string contents blanked: for counting braces. */
function mask(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`[^`]*`/g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
}

function todoLine(text: string): string {
  return `// TODO: ${text}`;
}

/** Remove a block piece's wrapper (`int main() {` … `}`), keeping its body, dedented. */
function unwrap(code: string, piece: Piece): string | null {
  const m = piece.find.exec(code);
  piece.find.lastIndex = 0;
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const masked = mask(code);
  let depth = 0;
  let close = -1;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "{") depth++;
    else if (masked[i] === "}" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) return null;
  const body = code
    .slice(open + 1, close)
    .split("\n")
    // `return 0;` belongs to main: it goes with the wrapper.
    .filter((l) => !/^\s*return\s+0\s*;\s*$/.test(l))
    .map((l) => l.replace(/^(?: {4}|\t)/, ""))
    .join("\n")
    .replace(/^\n+|\s+$/g, "");
  const before = code.slice(0, m.index);
  const after = code.slice(close + 1).replace(/^[ \t]*\n?/, "");
  return `${before}${todoLine(piece.todo)}\n${body}\n${after}`.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function removeLines(code: string, piece: Piece): string | null {
  let first = -1;
  const out = code.replace(piece.find, (_, offset: number) => {
    if (first === -1) first = offset;
    return "\u0000";
  });
  piece.find.lastIndex = 0;
  if (first === -1) return null;
  // The first removed line becomes the TODO; the rest disappear.
  let placed = false;
  return out
    .split("\n")
    .flatMap((l) => {
      if (!l.includes("\u0000")) return [l];
      if (placed) return [];
      placed = true;
      return [todoLine(piece.todo)];
    })
    .join("\n");
}

/**
 * The starter with the planned pieces taken out, and an objective for each one
 * removed. A piece the starter does not have, or whose check the solution would fail,
 * is left as it is — never an objective the learner cannot see or meet.
 */
export function applyScaffold(
  lang: ForbidLang,
  plan: ScaffoldPlan,
  starter: string,
  solution: string | undefined
): { starter: string; objectives: { id: string; description: string; check: { type: "code_matches"; value: string } }[] } {
  let code = starter;
  const objectives: { id: string; description: string; check: { type: "code_matches"; value: string } }[] = [];
  for (const piece of skeletonPieces(lang)) {
    if (!plan.omit.includes(piece.key)) continue;
    if (solution && !new RegExp(piece.check, "m").test(stripComments(solution, lang))) continue;
    let next = piece.kind === "block" ? unwrap(code, piece) : removeLines(code, piece);
    if (next === null) {
      // Already missing: the model left it out itself, often with a TODO that gives
      // the answer away ("// TODO: Add the #include <iostream> header"). Still a
      // piece the learner writes — with our TODO in place of that one.
      if (!solution || new RegExp(piece.check, "m").test(stripComments(code, lang))) continue;
      const mention = new RegExp(piece.check.replace(/^\^\\s\*/, "")); // the piece anywhere in a line
      const kept = code.split("\n").filter((l) => !(/^\s*\/\//.test(l) && mention.test(l)));
      next = `${todoLine(piece.todo)}\n${kept.join("\n").replace(/^\n+/, "")}`;
    }
    code = next;
    objectives.push({ id: `skeleton-${piece.key}`, description: piece.objective, check: { type: "code_matches", value: piece.check } });
  }
  return { starter: code, objectives };
}

/** The pieces the learner wrote themselves: in their code, not in the starter they were given. */
export function skeletonWritten(lang: ForbidLang, starter: string, code: string): string[] {
  const has = (text: string, p: Piece) => new RegExp(p.check, "m").test(stripComments(text, lang));
  return skeletonPieces(lang)
    .filter((p) => has(code, p) && !has(starter, p))
    .map((p) => p.key);
}

/** Totals over a course's lessons, each listing the pieces written in it. */
export function countWritten(lessons: (string[] | undefined)[]): Written {
  const out: Written = {};
  for (const keys of lessons) for (const k of new Set(keys ?? [])) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** A client-sent history, bounded and typed. */
export function cleanHistory(raw: unknown): ScaffoldHistory | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { lessons?: unknown; written?: unknown };
  const lessons = Number.isFinite(Number(r.lessons)) ? Math.max(0, Math.min(1000, Math.floor(Number(r.lessons)))) : 0;
  const written: Written = {};
  if (r.written && typeof r.written === "object") {
    for (const [k, v] of Object.entries(r.written as Record<string, unknown>).slice(0, 20)) {
      const n = Number(v);
      if (/^[a-z]{1,20}$/.test(k) && Number.isFinite(n)) written[k] = Math.max(0, Math.min(1000, Math.floor(n)));
    }
  }
  return { lessons, written };
}
