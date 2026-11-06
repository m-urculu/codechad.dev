// Comment and string syntax per language, and the two ways the app reads code
// through it. Shared by lesson generation (lesson.ts) and grading (grade.ts).
//
//   scrubCode     — drops comments AND string contents: for scanning EXECUTABLE code
//                   ("in Node you'd use process.argv" in a comment is not a violation).
//   stripComments — drops comments only, keeping strings and line breaks: what a
//                   code check is matched against. Every starter carries `// TODO`
//                   comments, and a learner who leaves them in place must not fail a
//                   check written against the comment-free solution — a C++ check
//                   wanted two statements with only whitespace between them, and the
//                   starter's own TODO line sat between them.

import type { ForbidLang } from "./registry";

type Syntax = { line: string[]; block: [string, string][]; strings: string[] };
export const SYNTAX_BY_LANG: Record<ForbidLang, Syntax> = {
  js: { line: ["//"], block: [["/*", "*/"]], strings: ["'", '"', "`"] },
  python: { line: ["#"], block: [['"""', '"""'], ["'''", "'''"]], strings: ["'", '"'] },
  sql: { line: ["--"], block: [["/*", "*/"]], strings: ["'"] },
  ruby: { line: ["#"], block: [["=begin", "=end"]], strings: ["'", '"'] }, // backticks kept (shell exec)
  lua: { line: ["--"], block: [["--[[", "]]"]], strings: ["'", '"'] },
  php: { line: ["//", "#"], block: [["/*", "*/"]], strings: ["'", '"'] },
  c: { line: ["//"], block: [["/*", "*/"]], strings: ["'", '"'] },
  cpp: { line: ["//"], block: [["/*", "*/"]], strings: ["'", '"'] },
  go: { line: ["//"], block: [["/*", "*/"]], strings: ["'", '"', "`"] },
  none: { line: [], block: [], strings: [] },
};

function walk(code: string, lang: ForbidLang, keepStrings: boolean): string {
  const syn = SYNTAX_BY_LANG[lang];
  let out = "";
  let i = 0;
  outer: while (i < code.length) {
    // block comments (checked before line comments: lua's --[[ starts with --)
    for (const [open, close] of syn.block) {
      if (code.startsWith(open, i)) {
        const end = code.indexOf(close, i + open.length);
        const stop = end === -1 ? code.length : end + close.length;
        // Keep the line breaks, so line-anchored checks still see the same lines.
        if (keepStrings) out += code.slice(i, stop).replace(/[^\n]/g, "");
        i = stop;
        continue outer;
      }
    }
    for (const mark of syn.line) {
      if (code.startsWith(mark, i)) {
        const nl = code.indexOf("\n", i);
        i = nl === -1 ? code.length : nl; // keep the newline
        continue outer;
      }
    }
    const c = code[i];
    if (syn.strings.includes(c)) {
      const start = i;
      i++;
      while (i < code.length && code[i] !== c) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      if (keepStrings) out += code.slice(start, i);
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Code without comments or string contents (executable tokens only). */
export function scrubCode(code: string, lang: ForbidLang): string {
  return walk(code, lang, false);
}

/** Code without comments; strings and line breaks kept. */
export function stripComments(code: string, lang: ForbidLang): string {
  return walk(code, lang, true);
}
