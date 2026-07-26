// ONE definition of how a console value becomes a line of text.
//
// There used to be three, and they disagreed. The Web Worker runtime printed an
// array as pretty JSON over five lines; the DOM iframe printed it on one; the
// Node sandbox that VALIDATES a generated lesson printed a third form. Objectives
// are graded by comparing the run output against a fixed expected string, so a
// lesson could be validated as solvable against one formatter and then be
// literally impossible to pass in the runtime the learner actually types into:
//
//   check:  "[ 99, 2, 3 ]"          <- what the generator wrote
//   server: "[99,2,3]"              <- what validation saw
//   learner console:                <- what the learner produced, marked wrong
//     [
//       99,
//     ...
//
// Hence a single source of truth, shared as SOURCE TEXT rather than as a function:
// two of the three consumers are sandboxes built from strings (a Worker Blob and
// an iframe <script>), so text is the only form all three can share. A copy that
// can drift is exactly what caused the bug.
//
// Formatting rule: compact JSON when it fits on a line, indented when it doesn't.
// Small collections then read the way a console is expected to read — and, more
// importantly, the way a generated `stdout_equals` check is written.

/** Longest single-line rendering before switching to indented JSON. */
export const CONSOLE_INLINE_LIMIT = 72;

/**
 * Defines `__fmt(value)` and `__fmtAll(args)` in whatever scope it is evaluated.
 * Plain ES5 — it is injected into a Worker, an iframe, and `new Function`.
 */
export const CONSOLE_FMT_SRC = `
function __fmtObject(v){
  var seen = new WeakSet();
  function replacer(k, val){
    if (typeof val === 'object' && val !== null){
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (typeof val === 'bigint') return val.toString() + 'n';
    if (typeof val === 'function') return '[Function ' + (val.name || 'anonymous') + ']';
    return val;
  }
  try {
    var inline = JSON.stringify(v, replacer);
    if (inline === undefined) return String(v);
    if (inline.length <= ${CONSOLE_INLINE_LIMIT}) return inline;
    seen = new WeakSet();
    return JSON.stringify(v, replacer, 2);
  } catch(e){ return String(v); }
}
function __fmt(v){
  try {
    if (typeof v === 'string') return v;
    if (typeof v === 'undefined') return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'bigint') return v.toString() + 'n';
    if (typeof v === 'symbol') return v.toString();
    if (typeof v === 'function') return v.toString();
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (v && v.nodeType === 1) return '<' + (v.tagName || 'node').toLowerCase() + (v.id ? (' id="' + v.id + '"') : '') + '>';
    if (typeof v === 'object') return __fmtObject(v);
    return String(v);
  } catch(e){ return String(v); }
}
function __fmtAll(args){ return Array.prototype.map.call(args, __fmt).join(' '); }
`;

type FmtAll = (args: unknown[]) => string;
let compiled: FmtAll | null = null;

/**
 * The same formatter, callable from Node — for the server-side sandbox that
 * validates a lesson before it is served. Compiled from the source above so it
 * cannot drift from what the browser prints.
 */
export function formatConsoleArgs(args: unknown[]): string {
  if (!compiled) {
    compiled = new Function(`${CONSOLE_FMT_SRC}\nreturn __fmtAll;`)() as FmtAll;
  }
  return compiled(args);
}
