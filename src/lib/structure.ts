// Structural checks: what the learner's code DOES, read from its syntax tree.
//
// Output alone cannot tell `std::cout << total;` from `std::cout << 50;`, and a
// regular expression over the source breaks on spacing, comments, brace style and
// every correct spelling its author did not think of. A parser sees the program the
// way the compiler does: `std::cout<<total` and `std :: cout << total` are the same
// tree, a `// std::cout << total` comment is no tree at all, and `25 + 17` is the
// same sum as `17 + 25`.
//
// A check is a small list of rules, every one of which must hold:
//
//   { "rule": "prints",   "expr": "total" }               a print statement outputs this expression
//   { "rule": "uses",     "expr": "17 + 25" }             this expression appears anywhere
//   { "rule": "declares", "name": "total", "init"?: "baseUnits * multiplier" }
//   { "rule": "calls",    "name": "add" }                 a call of this function
//   { "rule": "defines",  "name": "add" }                 a definition of this function
//   { "rule": "returns",  "name": "add", "expr": "a + b" } that function returns this expression
//
// Expressions compare by their tokens: whitespace and redundant outer parentheses
// do not matter, and the two sides of `+` and `*` may come in either order.
//
// Parsing is tree-sitter (web-tree-sitter + prebuilt grammars in public/tree-sitter),
// in the browser and on the server alike. Grammars load once per language, on first
// use. When one cannot load, a check reports "unknown" and the caller falls back to
// the check's other evidence — infrastructure failing must never fail a learner.

import type { Node, Parser as ParserT, Language as LanguageT } from "web-tree-sitter";

export type Rule =
  | { rule: "prints"; expr: string }
  | { rule: "uses"; expr: string }
  | { rule: "declares"; name: string; init?: string }
  | { rule: "calls"; name: string }
  | { rule: "defines"; name: string }
  | { rule: "returns"; name: string; expr: string };

const GRAMMAR: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  ruby: "ruby",
  php: "php",
  lua: "lua",
  c: "c",
  cpp: "cpp",
  go: "go",
};

/** The grammar for an editor language (RuntimeSpec.monacoLang), or null when there is none. */
export function grammarFor(monacoLang: string | undefined): string | null {
  return (monacoLang && GRAMMAR[monacoLang]) || null;
}

// ---------- rules: shape only ----------

const RULES = new Set(["prints", "uses", "declares", "calls", "defines", "returns"]);

/** Rules from model output: known kinds with their fields, at most 6. */
export function cleanRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  const out: Rule[] = [];
  for (const r of raw.slice(0, 6)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const kind = String(o.rule ?? "");
    if (!RULES.has(kind)) continue;
    const str = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, 200) : undefined);
    if (kind === "prints" || kind === "uses") {
      const expr = str("expr");
      if (expr) out.push({ rule: kind, expr });
    } else if (kind === "declares") {
      const name = str("name");
      const init = str("init");
      if (name) out.push(init ? { rule: kind, name, init } : { rule: kind, name });
    } else if (kind === "returns") {
      const name = str("name");
      const expr = str("expr");
      if (name && expr) out.push({ rule: kind, name, expr });
    } else {
      const name = str("name");
      if (name) out.push({ rule: kind as "calls" | "defines", name });
    }
  }
  return out;
}

/** A rule in words, for feedback ("print `total`"). */
export function describeRule(r: Rule): string {
  switch (r.rule) {
    case "prints":
      return `print \`${r.expr}\``;
    case "uses":
      return `use the expression \`${r.expr}\``;
    case "declares":
      return r.init ? `declare \`${r.name}\` initialised to \`${r.init}\`` : `declare \`${r.name}\``;
    case "calls":
      return `call \`${r.name}\``;
    case "defines":
      return `define the function \`${r.name}\``;
    case "returns":
      return `return \`${r.expr}\` from \`${r.name}\``;
  }
}

// ---------- expression comparison ----------

/** Text with whitespace outside string literals removed, and redundant outer parentheses. */
export function normExpr(text: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
    } else if (!/\s/.test(c)) out += c;
  }
  // Strip "(...)" while the parentheses enclose the whole expression.
  while (out.startsWith("(") && out.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "(") depth++;
      else if (out[i] === ")" && --depth === 0 && i < out.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    out = out.slice(1, -1);
  }
  return out;
}

const BINARY = new Set(["binary_expression", "binary_operator", "binary"]);
const PAREN = new Set(["parenthesized_expression", "parenthesized_statements"]);
const COMMUTATIVE = new Set(["+", "*"]);

const kids = (n: Node) => n.namedChildren.filter((c): c is Node => !!c && c.type !== "comment");
const opOf = (n: Node) => n.childForFieldName("operator")?.text ?? n.children.find((c) => c && !c.isNamed)?.text;
const unparen = (n: Node): Node => (PAREN.has(n.type) && kids(n).length === 1 ? unparen(kids(n)[0]) : n);

// The operands of a chain of one commutative operator: a + b + c → [a, b, c].
function terms(n: Node, op: string): Node[] {
  const u = unparen(n);
  if (BINARY.has(u.type) && opOf(u) === op) {
    const l = u.childForFieldName("left");
    const r = u.childForFieldName("right");
    if (l && r) return [...terms(l, op), ...terms(r, op)];
  }
  return [u];
}

/**
 * An expression's canonical form: parentheses dropped, and the operands of + and *
 * unordered at every level — so `(b * a) + c` and `c + a * b` are the same. Leaves
 * compare by their text, without whitespace.
 */
export function canon(n: Node): string {
  const u = unparen(n);
  if (BINARY.has(u.type)) {
    const op = opOf(u);
    const l = u.childForFieldName("left");
    const r = u.childForFieldName("right");
    if (op && l && r) {
      if (COMMUTATIVE.has(op)) return `${op}(${terms(u, op).map(canon).sort().join(",")})`;
      return `${op}(${canon(l)},${canon(r)})`;
    }
  }
  if (u.childCount === 0) return normExpr(u.text);
  const parts = u.children.filter((c): c is Node => !!c && c.type !== "comment").map((c) => (c.isNamed ? canon(c) : c.text));
  return `${u.type}[${parts.join(" ")}]`;
}

// A rule's expression, parsed with the code's own grammar inside a minimal program.
const WRAP: Record<string, [string, string]> = {
  cpp: ["int main() { auto _ = (", "); }"],
  c: ["int main(void) { int _ = (", "); }"],
  python: ["_ = (", ")"],
  javascript: ["_ = (", ");"],
  typescript: ["_ = (", ");"],
  go: ["package main\nfunc main() { _ = (", ") }"],
  ruby: ["_ = (", ")"],
  lua: ["local _ = (", ")"],
  php: ["<?php $_ = (", ");"],
};

/** The rule expression's canonical form, or null when it does not parse cleanly (then text comparison). */
function target(parser: ParserT, grammar: string, expr: string): string | null {
  const [pre, post] = WRAP[grammar] ?? ["", ""];
  const tree = parser.parse(pre + expr + post);
  if (!tree) return null;
  try {
    if (tree.rootNode.hasError) return null;
    // The wrapper's parentheses (normExpr drops them from both sides).
    const want = normExpr(expr);
    for (const n of walk(tree.rootNode)) if (PAREN.has(n.type) && normExpr(n.text) === want) return canon(n);
    return null;
  } finally {
    tree.delete();
  }
}

type Targets = Map<string, string | null>;

function same(n: Node | null | undefined, expr: string, targets: Targets): boolean {
  if (!n) return false;
  const want = targets.get(expr) ?? null;
  const text = normExpr(expr);
  // Through wrappers that only hold one expression: `{ a * b }`, `(a * b)`, `[a * b]`.
  for (let cur: Node | null = n; cur; ) {
    if (want !== null ? canon(cur) === want : normExpr(cur.text) === text) return true;
    const named = kids(cur);
    cur = named.length === 1 ? named[0] : null;
  }
  return false;
}

function* walk(n: Node): Generator<Node> {
  yield n;
  for (const c of n.namedChildren) if (c) yield* walk(c);
}

// ---------- per language: where declarations, calls, definitions and prints are ----------

type Lang = {
  /** [name, initialiser] for each variable this node declares. */
  decls(n: Node): [string, Node | null][];
  /** The called function's name, as written ("std::sqrt", "fmt.Println", "print"). */
  call(n: Node): string | null;
  /** The defined function's name. */
  def(n: Node): string | null;
  /** The expressions this node prints, or null when it is not a print. */
  printed(n: Node): Node[] | null;
};

const field = (n: Node, f: string) => n.childForFieldName(f);
const args = (n: Node | null) => (n ? n.namedChildren.filter((c): c is Node => !!c && c.type !== "comment") : []);
// A call node's argument nodes, through wrappers (PHP's `argument`, Lua's expression_list).
const callArgs = (n: Node) => {
  const a = field(n, "arguments");
  return args(a).flatMap((c) => (c.type === "argument" || c.type === "expression_list" ? args(c) : [c]));
};

const cFamily = (cpp: boolean): Lang => ({
  decls(n) {
    if (n.type === "init_declarator") {
      const name = field(n, "declarator");
      const value = field(n, "value");
      return name ? [[name.text.replace(/^[*&\s]+/, ""), value]] : [];
    }
    if (n.type === "declaration") {
      // `int x;` — an initialised declarator is an init_declarator, handled above.
      return n
        .childrenForFieldName("declarator")
        .filter((c): c is Node => !!c && c.type === "identifier")
        .map((c) => [c.text, null]);
    }
    return [];
  },
  call: (n) => (n.type === "call_expression" ? field(n, "function")?.text ?? null : null),
  def(n) {
    if (n.type !== "function_definition") return null;
    let d = field(n, "declarator");
    while (d && d.type !== "function_declarator") d = field(d, "declarator");
    return d ? field(d, "declarator")?.text ?? null : null;
  },
  printed(n) {
    if (cpp && n.type === "binary_expression" && field(n, "operator")?.text === "<<") {
      // Only the outermost `<<` of a chain: std::cout << a << b is ((cout << a) << b).
      const p = n.parent;
      if (p && p.type === "binary_expression" && field(p, "operator")?.text === "<<" && field(p, "left")?.id === n.id) return null;
      const operands: Node[] = [];
      let cur: Node | null = n;
      while (cur && cur.type === "binary_expression" && field(cur, "operator")?.text === "<<") {
        const r = field(cur, "right");
        if (r) operands.unshift(r);
        cur = field(cur, "left");
      }
      return cur && /^(std::)?(cout|cerr|clog)$/.test(normExpr(cur.text)) ? operands : null;
    }
    if (n.type === "call_expression") {
      const f = normExpr(field(n, "function")?.text ?? "");
      if (/^(std::)?(printf|puts|putchar)$/.test(f)) return callArgs(n);
      if (cpp && /^std::(print|println)$/.test(f)) return callArgs(n);
    }
    return null;
  },
});

const LANGS: Record<string, Lang> = {
  c: cFamily(false),
  cpp: cFamily(true),
  python: {
    decls: (n) => (n.type === "assignment" && field(n, "left")?.type === "identifier" ? [[field(n, "left")!.text, field(n, "right")]] : []),
    call: (n) => (n.type === "call" ? field(n, "function")?.text ?? null : null),
    def: (n) => (n.type === "function_definition" ? field(n, "name")?.text ?? null : null),
    printed: (n) =>
      n.type === "call" && field(n, "function")?.text === "print" ? callArgs(n).filter((c) => c.type !== "keyword_argument") : null,
  },
  javascript: jsLike(),
  typescript: jsLike(),
  go: {
    decls(n) {
      if (n.type === "short_var_declaration") {
        const l = args(field(n, "left"));
        const r = args(field(n, "right"));
        return l.map((c, i) => [c.text, r[i] ?? null]);
      }
      if (n.type === "var_spec") {
        const names = n.namedChildren.filter((c): c is Node => !!c && c.type === "identifier");
        const values = args(field(n, "value"));
        return names.map((c, i) => [c.text, values[i] ?? null]);
      }
      return [];
    },
    call: (n) => (n.type === "call_expression" ? field(n, "function")?.text ?? null : null),
    def: (n) => (n.type === "function_declaration" ? field(n, "name")?.text ?? null : null),
    printed: (n) =>
      n.type === "call_expression" && /^fmt\.(Print|Println|Printf)$/.test(normExpr(field(n, "function")?.text ?? "")) ? callArgs(n) : null,
  },
  ruby: {
    decls: (n) => (n.type === "assignment" && field(n, "left")?.type === "identifier" ? [[field(n, "left")!.text, field(n, "right")]] : []),
    call: (n) => (n.type === "call" ? field(n, "method")?.text ?? null : null),
    def: (n) => (n.type === "method" ? field(n, "name")?.text ?? null : null),
    printed: (n) =>
      n.type === "call" && !field(n, "receiver") && /^(puts|print|p)$/.test(field(n, "method")?.text ?? "") ? callArgs(n) : null,
  },
  // The official grammar (@tree-sitter-grammars/tree-sitter-lua): the prebuilt one in
  // tree-sitter-wasms corrupts every parse after the first.
  lua: {
    decls(n) {
      if (n.type !== "assignment_statement") return [];
      const names = args(n.namedChildren.find((c) => c?.type === "variable_list") ?? null);
      const values = args(n.namedChildren.find((c) => c?.type === "expression_list") ?? null);
      return names.map((c, i) => [c.text, values[i] ?? null]);
    },
    call: (n) => (n.type === "function_call" ? field(n, "name")?.text ?? null : null),
    def: (n) => (n.type === "function_declaration" ? field(n, "name")?.text ?? null : null),
    printed: (n) => (n.type === "function_call" && field(n, "name")?.text === "print" ? callArgs(n) : null),
  },
  php: {
    decls: (n) =>
      n.type === "assignment_expression" && field(n, "left")?.type === "variable_name"
        ? [[field(n, "left")!.text.replace(/^\$/, ""), field(n, "right")]]
        : [],
    call: (n) => (n.type === "function_call_expression" ? field(n, "function")?.text ?? null : null),
    def: (n) => (n.type === "function_definition" ? field(n, "name")?.text ?? null : null),
    printed(n) {
      if (n.type === "echo_statement") return args(n).flatMap((c) => (c.type === "sequence_expression" ? args(c) : [c]));
      if (n.type === "print_intrinsic") return args(n);
      return null;
    },
  },
};

function jsLike(): Lang {
  return {
    decls(n) {
      if (n.type === "variable_declarator") {
        const name = field(n, "name");
        return name ? [[name.text, field(n, "value")]] : [];
      }
      if (n.type === "assignment_expression" && field(n, "left")?.type === "identifier") return [[field(n, "left")!.text, field(n, "right")]];
      return [];
    },
    call: (n) => (n.type === "call_expression" ? field(n, "function")?.text ?? null : null),
    def(n) {
      if (n.type === "function_declaration" || n.type === "method_definition") return field(n, "name")?.text ?? null;
      if (n.type === "variable_declarator" && /^(arrow_function|function_expression|function)$/.test(field(n, "value")?.type ?? ""))
        return field(n, "name")?.text ?? null;
      return null;
    },
    printed: (n) =>
      n.type === "call_expression" && /^console\.(log|info|warn|error)$/.test(normExpr(field(n, "function")?.text ?? "")) ? callArgs(n) : null,
  };
}

// A name as written may be qualified: `sqrt` matches `std::sqrt`, `Println` matches `fmt.Println`.
function nameMatches(written: string, want: string): boolean {
  const w = normExpr(written);
  const t = normExpr(want);
  return w === t || w.endsWith(`::${t}`) || w.endsWith(`.${t}`) || w.endsWith(`->${t}`);
}

/** Does `rule` hold in this tree? */
function holds(root: Node, lang: Lang, rule: Rule, targets: Targets): boolean {
  for (const n of walk(root)) {
    if (n.type === "comment") continue;
    switch (rule.rule) {
      case "prints": {
        const out = lang.printed(n);
        if (out?.some((e) => same(e, rule.expr, targets))) return true;
        break;
      }
      case "uses":
        if (same(n, rule.expr, targets)) return true;
        break;
      case "declares":
        for (const [name, init] of lang.decls(n)) {
          if (normExpr(name) === normExpr(rule.name) && (!rule.init || same(init, rule.init, targets))) return true;
        }
        break;
      case "calls": {
        const c = lang.call(n);
        if (c && nameMatches(c, rule.name)) return true;
        break;
      }
      case "defines": {
        const d = lang.def(n);
        if (d && nameMatches(d, rule.name)) return true;
        break;
      }
      case "returns": {
        // A return statement inside that function's own body (not a nested function's).
        const d = lang.def(n);
        if (!d || !nameMatches(d, rule.name)) break;
        for (const r of walk(n)) {
          if (r.id !== n.id && lang.def(r)) continue;
          if (r.type !== "return_statement" && r.type !== "return") continue;
          const value = kids(r);
          if (value.length === 1 && same(value[0], rule.expr, targets)) return true;
        }
        break;
      }
    }
  }
  return false;
}

// ---------- loading ----------

type TS = { Parser: typeof ParserT; Language: typeof LanguageT };
let runtime: Promise<TS> | null = null;
const languages = new Map<string, Promise<LanguageT>>();

function asset(file: string): string {
  if (typeof window !== "undefined") return `/tree-sitter/${file}`;
  // Server and tests: the same files, read from disk (next.config.ts ships them with
  // the routes that grade). No path module: this file is in the browser bundle too.
  return `${process.cwd()}/public/tree-sitter/${file}`;
}

async function load(grammar: string): Promise<{ ts: TS; language: LanguageT }> {
  if (!runtime) {
    runtime = (async () => {
      const mod = await import("web-tree-sitter");
      const core = await asset("tree-sitter.wasm");
      await mod.Parser.init({ locateFile: () => core });
      return { Parser: mod.Parser, Language: mod.Language };
    })();
    runtime.catch(() => (runtime = null));
  }
  const ts = await runtime;
  let lang = languages.get(grammar);
  if (!lang) {
    lang = ts.Language.load(asset(`tree-sitter-${grammar}.wasm`));
    lang.catch(() => languages.delete(grammar));
    languages.set(grammar, lang);
  }
  return { ts, language: await lang };
}

/** The last part of a qualified name: `std::sqrt` → `sqrt`, `obj.run` → `run`. */
const bare = (name: string) => normExpr(name).split(/::|\.|->/).pop() ?? "";

/** Defined functions (bare name → number of parameters) and called functions (bare names). */
export type Inventory = {
  defines: Map<string, number>;
  calls: Set<string>;
  returnsValue: Set<string>;
  /** Functions whose own body prints. */
  printsIn: Set<string>;
  /** Variables declared, in order of declaration. */
  declares: string[];
};

// How many parameters a definition takes. The parameter list hangs off the definition
// (Python, JS, Go, Ruby, Lua, PHP), its C declarator, or an arrow function's value.
function paramCount(n: Node): number {
  let list = field(n, "parameters");
  if (!list) {
    let d = field(n, "declarator");
    while (d && d.type !== "function_declarator") d = field(d, "declarator");
    list = d ? field(d, "parameters") : field(n, "value") ? field(field(n, "value")!, "parameters") : null;
  }
  if (!list) return 0;
  const ps = args(list);
  // Go: `x, y int` is one declaration naming two parameters. C: `(void)` is none.
  if (ps.length === 1 && ps[0].text.trim() === "void") return 0;
  return ps.reduce((sum, p) => sum + Math.max(1, p.type === "parameter_declaration" ? p.childrenForFieldName("name").length : 1), 0);
}

/** The functions a program defines and the functions it calls, by bare name. Null when it cannot be parsed. */
export async function inventory(grammar: string | null, code: string): Promise<Inventory | null> {
  const lang = grammar ? LANGS[grammar] : undefined;
  if (!grammar || !lang) return null;
  let parser: ParserT | null = null;
  try {
    const { ts, language } = await load(grammar);
    parser = new ts.Parser();
    parser.setLanguage(language);
    const tree = parser.parse(code);
    if (!tree) return null;
    const out: Inventory = { defines: new Map(), calls: new Set(), returnsValue: new Set(), printsIn: new Set(), declares: [] };
    for (const n of walk(tree.rootNode)) {
      if (n.type === "comment") continue;
      const d = lang.def(n);
      if (d) {
        out.defines.set(bare(d), paramCount(n));
        // Returns a value: a `return <something>` in its own body, not a nested function's.
        for (const r of walk(n)) {
          if (r.id !== n.id && lang.def(r)) continue;
          if ((r.type === "return_statement" || r.type === "return") && kids(r).length > 0) out.returnsValue.add(bare(d));
          if (lang.printed(r)) out.printsIn.add(bare(d));
        }
      }
      for (const [name] of lang.decls(n)) {
        const v = bare(name);
        if (v && !out.declares.includes(v)) out.declares.push(v);
      }
      const c = lang.call(n);
      if (c) out.calls.add(bare(c));
    }
    tree.delete();
    return out;
  } catch {
    return null;
  } finally {
    parser?.delete();
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The learner's code with their own function names replaced by the solution's,
 * where the pairing is unambiguous. What a lesson checks is the function — what it
 * takes, returns, and does — not the name typed for it: `calculatedSquare` for
 * `calculateSquare` failed the definition, the call, and every rule naming it, while
 * the code was otherwise right. A solution function the learner did not define is
 * paired with a function the learner defined that the solution does not have, when
 * exactly one such function takes the same number of parameters. Names the starter
 * gives are never renamed: those are part of the exercise.
 */
export async function renameToSolution(grammar: string | null, code: string, solution: string, starter: string): Promise<string> {
  const [sol, start, mine] = await Promise.all([inventory(grammar, solution), inventory(grammar, starter), inventory(grammar, code)]);
  if (!sol || !start || !mine) return code;
  const missing = [...sol.defines].filter(([f]) => f !== "main" && !mine.defines.has(f) && !start.defines.has(f));
  const extra = [...mine.defines].filter(([f]) => f !== "main" && !sol.defines.has(f) && !start.defines.has(f));
  const pairs: [string, string][] = [];
  for (const [want, arity] of missing) {
    const candidates = extra.filter(([, n]) => n === arity);
    const rivals = missing.filter(([, n]) => n === arity);
    if (candidates.length !== 1 || rivals.length !== 1) continue; // ambiguous: leave it to the checks
    pairs.push([candidates[0][0], want]);
  }
  // Variables the same way: the solution's that the learner did not declare, paired
  // in order with the learner's that the solution does not have — when there are as
  // many of each. (`count` for `total`; a renamed accumulator, a differently named
  // loop variable.)
  const fns = new Set([...sol.defines.keys(), ...mine.defines.keys()]);
  const missingVars = sol.declares.filter((v) => !mine.declares.includes(v) && !start.declares.includes(v) && !fns.has(v));
  const extraVars = mine.declares.filter((v) => !sol.declares.includes(v) && !start.declares.includes(v) && !fns.has(v));
  if (missingVars.length && missingVars.length === extraVars.length) missingVars.forEach((v, i) => pairs.push([extraVars[i], v]));

  let out = code;
  for (const [have, want] of pairs) {
    const word = (n: string) => new RegExp(`(^|[^\\w$])${escapeRe(n)}(?![\\w$])`, "g");
    if (word(want).test(out)) continue; // the name is taken in the learner's code
    out = out.replace(word(have), (_m, pre: string) => `${pre}${want}`);
  }
  return out;
}

/**
 * Evaluate each rule list against the code. Returns, per key, true / false, or
 * undefined when the code's language cannot be parsed here (no grammar, or it failed
 * to load) — the caller then decides with its other evidence.
 */
export async function checkStructure(
  grammar: string | null,
  code: string,
  checks: Record<string, Rule[]>
): Promise<Record<string, boolean | undefined>> {
  const keys = Object.keys(checks).filter((k) => checks[k].length);
  const out: Record<string, boolean | undefined> = {};
  const lang = grammar ? LANGS[grammar] : undefined;
  if (!keys.length || !grammar || !lang) return out;
  let parser: ParserT | null = null;
  try {
    const { ts, language } = await load(grammar);
    parser = new ts.Parser();
    parser.setLanguage(language);
    const targets: Targets = new Map();
    for (const k of keys) {
      for (const r of checks[k]) {
        const e = r.rule === "prints" || r.rule === "uses" || r.rule === "returns" ? r.expr : r.rule === "declares" ? r.init : undefined;
        if (e && !targets.has(e)) targets.set(e, target(parser, grammar, e));
      }
    }
    const tree = parser.parse(code);
    if (!tree) return out;
    for (const k of keys) out[k] = checks[k].every((r) => holds(tree.rootNode, lang, r, targets));
    tree.delete();
  } catch {
    /* unknown: see above */
  } finally {
    parser?.delete();
  }
  return out;
}
