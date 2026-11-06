// Answer-leak guard: stops tutor messages from handing the learner the exercise's
// answer as a code snippet.
//
// Every tutor prompt forbids giving the answer, and that alone does not hold. The
// failure that prompted this: a C++ lesson "print two messages on separate lines",
// and a tutor reply showing `std::cout << "Item: Sword\n";` twice "on different
// data". For an exercise that small, an analogous example IS the answer with other
// words in it, and the model cannot see that, so this checks the output in code.
//
// The answer is what the learner has to WRITE: the lines of the reference solution
// that the starter code does not already contain. A line is compared with its
// literals blanked out, so the same statement with different text or numbers still
// counts as the answer. Identifiers are kept: an example on genuinely different
// variables and functions is the analogous example the prompts ask for.
//
// Only fenced code blocks are checked. Inline syntax (`\n`, `std::endl`) is the
// "loose syntax" a tutor should give freely.

/** One code line with string/char literals and numbers blanked, comments and whitespace dropped. */
export function normalizeCodeLine(line: string): string {
  return line
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "S") // string, char and template literals
    // Trailing comments: `//`, and `#` followed by a space (Python, Ruby, shell) so
    // `#include` survives. Not `--`: it would cut `i--` short.
    .replace(/(\/\/|#\s).*$/, "")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

// A normalized line that carries no answer on its own: braces, `return N;`, `else`.
function trivial(norm: string): boolean {
  if (norm.length < 6) return true;
  if (!/[A-Za-z]/.test(norm)) return true;
  return /^(return(N|S)?;?|else\{?|\}?else\{?|break;|continue;|pass|end|done|fi)$/.test(norm);
}

/** The lines the learner must write: in the solution, not in the starter. Normalized. */
export function answerLines(solution: string | undefined, starter: string | undefined): string[] {
  if (!solution) return [];
  const given = new Set((starter ?? "").split("\n").map(normalizeCodeLine));
  const out = new Set<string>();
  for (const line of solution.split("\n")) {
    const n = normalizeCodeLine(line);
    if (!trivial(n) && !given.has(n)) out.add(n);
  }
  return [...out];
}

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;

/** Answer lines that appear inside the reply's fenced code blocks. */
export function findLeaks(reply: string, answer: string[]): string[] {
  if (!answer.length) return [];
  const want = new Set(answer);
  const hit = new Set<string>();
  for (const m of reply.matchAll(FENCE)) {
    for (const line of m[1].split("\n")) {
      const n = normalizeCodeLine(line);
      if (want.has(n)) hit.add(n);
    }
  }
  return [...hit];
}

/** Remove the fenced blocks that contain an answer line; keep the rest of the message. */
export function stripLeakingBlocks(reply: string, answer: string[]): string {
  const want = new Set(answer);
  return reply
    .replace(FENCE, (block, body: string) =>
      body.split("\n").some((l) => want.has(normalizeCodeLine(l)))
        ? "*(Example removed: it was the exercise's answer. Try writing it in the editor, using the syntax above.)*"
        : block
    )
    .trim();
}

/** The instruction a regeneration gets when its first attempt leaked. */
export function leakCorrection(leaks: string[]): string {
  return (
    `\n\nCORRECTION: your previous reply contained a code block with the exercise's answer — ` +
    `these lines, or the same lines with different text/values: ${leaks.map((l) => JSON.stringify(l)).join(", ")}. ` +
    `Rewrite the reply WITHOUT any code block containing such a line. Explain the concept and name the ` +
    `syntax inline (with its doc link where you have one); if any example would be the answer, give no example.`
  );
}

/**
 * Generate a tutor message that does not contain the answer.
 * `generate` gets "" first, then the correction; a second leak has its blocks removed.
 */
export async function withoutAnswer(
  generate: (correction: string) => Promise<string>,
  answer: string[]
): Promise<string> {
  const first = await generate("");
  const leaks = findLeaks(first, answer);
  if (!leaks.length) return first;
  const second = await generate(leakCorrection(leaks));
  return findLeaks(second, answer).length ? stripLeakingBlocks(second, answer) : second;
}
