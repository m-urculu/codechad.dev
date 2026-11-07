// The syntax ledger — which pieces of syntax this learner has already been shown,
// per technology, so the tutor introduces each one properly once and then stops
// repeating it.
//
// The problem it solves. A lesson's reference solution can rely on syntax the intro
// never mentions: a C++ lesson whose checks need two output lines quietly requires
// `\n`, and a beginner has no way to know it exists. The skills ledger (skills.ts)
// cannot catch this — it works at the level of topics, and `\n` is not a topic.
//
// How it works.
//  1. Lesson generation lists the syntax the learner must write to turn the starter
//     into the solution (`parseSyntax` keeps only items that literally appear in
//     the solution, so nothing invented survives).
//  2. Each item is classified against what the learner has seen before
//     (`classifySyntax`): NEW items are explained and linked to the docs, items seen
//     in a few lessons are only linked, and familiar ones are left out.
//  3. `ensureSyntaxLinks` guarantees every new item is in the intro as a doc link,
//     whatever the model wrote.
//  4. Once the browser has validated the solution, the lesson's items are recorded
//     (one row per lesson, see migration 0010), which is what makes them fade.

/** One piece of syntax a lesson's solution uses. */
export type SyntaxItem = {
  /** Exactly as written in code: `\n`, `std::cout`, `<<`, `for ... in`. */
  token: string;
  /** Canonical documentation name, resolved by the Docs tab like any doc link. */
  doc: string;
  /** A few words on what it does. */
  meaning: string;
};

/** syntaxKey → number of lessons the learner has met it in. */
export type SyntaxSeen = Record<string, number>;

/** Seen in this many lessons or more: no longer mentioned at all. */
export const SYNTAX_FAMILIAR = 3;

const MAX_ITEMS = 8;

/** Comparison key: whitespace never makes two pieces of syntax different. */
export function syntaxKey(token: string): string {
  return token.replace(/\s+/g, "");
}

/** Shape-check a syntax list: well-formed items, no duplicates, capped. */
export function cleanSyntax(raw: unknown): SyntaxItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SyntaxItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const token = String(o.token ?? "").trim();
    const doc = String(o.doc ?? "").trim();
    const key = syntaxKey(token);
    // An empty doc is allowed: it means the docs have no entry for this item (see
    // canonicalDocTerm). It is still syntax the learner has to be shown, unlinked.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ token, doc, meaning: String(o.meaning ?? "").trim() });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/**
 * Validate the model's syntax list against the solution it came with.
 *
 * Only items whose token appears in the solution are kept (ignoring whitespace, so
 * `std::cout <<` matches `std::cout<<`). That is the deterministic guard: the list
 * describes the validated code, not what the model thinks it wrote.
 */
export function parseSyntax(raw: unknown, solution: string | undefined): SyntaxItem[] {
  if (!solution) return [];
  const code = syntaxKey(solution);
  return cleanSyntax(Array.isArray(raw) ? raw.filter((r) => code.includes(syntaxKey(String(r?.token ?? "")))) : []).filter(
    (it) => isSyntax(it.token, solution)
  );
}

/**
 * Is this a piece of the LANGUAGE, rather than something this exercise chose? The
 * model lists the values and names an exercise uses alongside real syntax — a C++
 * lesson announced `result` and `15` as "New syntax", and lessons had saved `width`
 * and `{ 42 }`. Those are not syntax and must not be taught or counted as such.
 *   - a literal: a number, a string or character literal, or a braced value
 *   - a name the solution itself declares (`int result = …`, `def area(`,
 *     `let total =`), other than `main`, which every program must define.
 */
export function isSyntax(token: string, solution: string): boolean {
  const t = token.trim();
  if (/^[+-]?\d[\d_.']*[a-z]*$/i.test(t)) return false; // 15, 98.6, 1'000, 10u
  if (/^(["'`]).*\1$/.test(t)) return false; // "Hello", 'x'
  if (/^\{\s*[^{}]*\d[^{}]*\}$/.test(t)) return false; // { 42 }
  if (/^[A-Za-z_]\w*$/.test(t) && t !== "main") {
    const name = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declared = new RegExp(
      // `int width;`, `double price = …`, `int area(…) {`, `std::string name{…}`
      `\\b[A-Za-z_][\\w:<>]*\\s*[*&]?\\s+${name}\\s*[;=({\\[,)]` +
        // `def area(`, `function area(`, `fn area(`, `func area(`, `let/const/var total =`
        `|\\b(?:def|function|fn|func|let|const|var)\\s+${name}\\b` +
        // Python/Ruby/Lua: `total = …` at the start of a line
        `|^\\s*${name}\\s*=(?!=)`,
      "m"
    );
    if (declared.test(solution)) return false;
  }
  return true;
}

/**
 * Split a lesson's syntax by how often the learner has met it.
 *   fresh    — never seen: explain it and link it.
 *   linkOnly — seen in fewer than SYNTAX_FAMILIAR lessons: link it, no explanation.
 * Familiar items are in neither list.
 */
export function classifySyntax(
  items: SyntaxItem[],
  seen: SyntaxSeen
): { fresh: SyntaxItem[]; linkOnly: SyntaxItem[] } {
  const fresh: SyntaxItem[] = [];
  const linkOnly: SyntaxItem[] = [];
  for (const it of items) {
    const n = seen[syntaxKey(it.token)] ?? 0;
    if (n === 0) fresh.push(it);
    else if (n < SYNTAX_FAMILIAR) linkOnly.push(it);
  }
  return { fresh, linkOnly };
}

/**
 * How many lessons each piece of syntax has appeared in, counted from lessons
 * themselves (each keeps its syntax list). This is the course's own record: it works
 * whether or not the user_syntax table exists, and is what made a C++ course stop
 * announcing `std::cout` as "New syntax" in its fifth lesson to use it.
 */
export function countSyntax(lessons: (SyntaxItem[] | undefined)[]): SyntaxSeen {
  const seen: SyntaxSeen = {};
  for (const items of lessons) {
    for (const key of new Set((items ?? []).map((it) => syntaxKey(it.token)))) seen[key] = (seen[key] ?? 0) + 1;
  }
  return seen;
}

/** Two counts of the same thing from different records: the larger is the truth. */
export function mergeSeen(a: SyntaxSeen, b: SyntaxSeen): SyntaxSeen {
  const out: SyntaxSeen = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, n);
  return out;
}

/** A markdown doc link the chat renders as a Docs-tab link. */
export function syntaxLink(it: SyntaxItem): string {
  // Backticks inside the token would break the code span; tokens with them are rare
  // enough (Go raw strings) that a double-backtick span is the whole fix.
  const code = it.token.includes("`") ? `\`\` ${it.token} \`\`` : `\`${it.token}\``;
  return it.doc ? `[${code}](<doc:${it.doc}>)` : code;
}

/**
 * The block that tells lesson generation what the learner has already seen.
 * Returns "" when there is nothing to say.
 */
export function knownSyntaxBlock(seen: SyntaxSeen, limit = 80): string {
  const entries = Object.entries(seen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!entries.length) return "";
  return (
    `SYNTAX THIS LEARNER HAS ALREADY BEEN SHOWN in this technology (× = number of lessons):\n` +
    entries.map(([k, n]) => `  • ${k} ×${n}`).join("\n") +
    `\n`
  );
}

/**
 * Make sure every NEW piece of syntax is in the intro as a doc link.
 *
 * The prompt asks for this, and usually gets it. When it doesn't, the missing items
 * are appended in one line rather than regenerating the whole lesson: a learner who
 * is never shown `\n` cannot pass a lesson that needs it, so this must not depend on
 * the model remembering.
 */
export function ensureSyntaxLinks(intro: string, fresh: SyntaxItem[]): string {
  const missing = fresh.filter((it) =>
    it.doc
      ? !intro.includes(`(<doc:${it.doc}>)`) && !intro.includes(`(doc:${it.doc})`)
      : !intro.includes(it.token) // no doc entry: shown at all is enough
  );
  if (!missing.length) return intro;
  const line = missing
    .map((it) => `${syntaxLink(it)}${it.meaning ? ` — ${it.meaning}` : ""}`)
    .join(" · ");
  return `${intro.trimEnd()}\n\n**New syntax:** ${line}`;
}
