// Richer tokenization for languages whose stock Monarch grammar is too coarse to
// colour usefully.
//
// Monaco's Python grammar emits only: keyword, identifier, number, string,
// string.escape, delimiter and tag. Classes, functions, builtins, decorators,
// constants and `self` all collapse into one `identifier` token, so no theme can
// tell them apart. This module replaces that grammar with one that distinguishes
// them, which is what makes the colour scheme in monacoTheme.ts legible.
//
// Other languages already expose enough structure (JS/TS give type.identifier,
// Ruby gives constructor/keyword.class/keyword.def/predefined, SQL gives
// predefined, PHP gives variable) and are left alone.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Build an anchored alternation, longest-first so `is not` style prefixes and
// overlapping names ("in" vs "int") can't shadow one another.
function words(list: string[]): RegExp {
  const sorted = [...list].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${sorted.join("|")})\\b`);
}

const PY_KEYWORDS = [
  "and", "as", "assert", "async", "await", "break", "case", "continue", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import",
  "in", "is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield",
];

// Declarations read differently from control flow — they introduce a name.
const PY_DECLARATIONS = ["class", "def"];

const PY_CONSTANTS = ["True", "False", "None", "NotImplemented", "Ellipsis", "__debug__"];

const PY_BUILTINS = [
  "abs", "aiter", "anext", "all", "any", "ascii", "bin", "bool", "breakpoint",
  "bytearray", "bytes", "callable", "chr", "classmethod", "compile", "complex",
  "delattr", "dict", "dir", "divmod", "enumerate", "eval", "exec", "filter",
  "float", "format", "frozenset", "getattr", "globals", "hasattr", "hash",
  "help", "hex", "id", "input", "int", "isinstance", "issubclass", "iter",
  "len", "list", "locals", "map", "max", "memoryview", "min", "next", "object",
  "oct", "open", "ord", "pow", "print", "property", "range", "repr", "reversed",
  "round", "set", "setattr", "slice", "sorted", "staticmethod", "str", "sum",
  "super", "tuple", "type", "vars", "zip",
  // The exception hierarchy reads as builtin too — it shows up constantly in
  // teaching material about error handling.
  "ArithmeticError", "AssertionError", "AttributeError", "BaseException",
  "Exception", "FileNotFoundError", "IndexError", "KeyError", "KeyboardInterrupt",
  "NameError", "NotImplementedError", "OSError", "OverflowError", "RuntimeError",
  "StopIteration", "SyntaxError", "TypeError", "ValueError", "ZeroDivisionError",
];

export function enrichPython(monaco: any): void {
  monaco.languages.setMonarchTokensProvider("python", {
    defaultToken: "",
    tokenPostfix: ".python",

    tokenizer: {
      root: [
        [/#.*$/, "comment"],

        // @decorator — inheritance-adjacent metadata, worth its own colour.
        [/@\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, "annotation"],

        // `class Foo(Base):` and `def bar(`: name the declaration and the name.
        [/\b(class)(\s+)([A-Za-z_]\w*)/, ["keyword.declaration", "white", "type.declaration"]],
        [/\b(def)(\s+)([A-Za-z_]\w*)/, ["keyword.declaration", "white", "function.declaration"]],
        [words(PY_DECLARATIONS), "keyword.declaration"],

        [/\b(?:self|cls)\b/, "variable.predefined"],
        [words(PY_CONSTANTS), "constant.language"],
        [words(PY_KEYWORDS), "keyword"],

        // Builtins before the generic call rule, so print()/len() stay builtin.
        [words(PY_BUILTINS), "predefined"],

        // SCREAMING_CASE is the language's constant convention.
        [/\b[A-Z][A-Z0-9_]+\b/, "constant"],
        // Capitalised names are classes/types by convention — this is what makes
        // inheritance (`class Cart(Base)`) and annotations (`x: Item`) readable.
        [/\b[A-Z]\w*/, "type.identifier"],
        // Anything else immediately followed by "(" is being called.
        [/\b[a-z_]\w*(?=\s*\()/, "function"],
        [/\b[A-Za-z_]\w*/, "identifier"],

        { include: "@numbers" },
        { include: "@strings" },

        [/[{}()[\]]/, "@brackets"],
        [/[<>=!+\-*/%&|^~:]+/, "operator"],
        [/[;,.]/, "delimiter"],
        [/\s+/, "white"],
      ],

      numbers: [
        [/0[xX][0-9a-fA-F_]+[lL]?/, "number.hex"],
        [/0[bB][01_]+[lL]?/, "number.binary"],
        [/0[oO][0-7_]+[lL]?/, "number.octal"],
        [/(?:\d[\d_]*)?\.\d[\d_]*(?:[eE][-+]?\d+)?[jJ]?/, "number.float"],
        [/\d[\d_]*(?:[eE][-+]?\d+)?[jJ lL]?/, "number"],
      ],

      strings: [
        [/[fFrRbBuU]{0,2}"""/, "string", "@tripleDouble"],
        [/[fFrRbBuU]{0,2}'''/, "string", "@tripleSingle"],
        [/[fFrRbBuU]{0,2}"/, "string", "@doubleString"],
        [/[fFrRbBuU]{0,2}'/, "string", "@singleString"],
      ],

      doubleString: [
        [/[^\\"{]+/, "string"],
        [/\{[^}]*\}/, "string.interpolated"], // f-string placeholder
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      singleString: [
        [/[^\\'{]+/, "string"],
        [/\{[^}]*\}/, "string.interpolated"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
      tripleDouble: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"""/, "string", "@pop"],
        [/"/, "string"],
      ],
      tripleSingle: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'''/, "string", "@pop"],
        [/'/, "string"],
      ],
    },
  });
}

let enriched = false;

export function enrichLanguages(monaco: any): void {
  if (enriched) return; // the provider is global; registering twice is wasteful
  enriched = true;
  enrichPython(monaco);
}
