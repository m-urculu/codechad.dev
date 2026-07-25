// Monaco theme built from the CodePath design tokens (see docs/design-system.md).
//
// Stock vs-dark reads as a foreign object in this app: a #1e1e1e background against
// our true black, VS Code's blue/orange syntax palette against our monochrome +
// single accent, and its own mono face.
//
// The app chrome is monochrome plus one accent. Code is the deliberate exception:
// inside the editor hue IS the information — it is how you tell a class from a
// function from a literal at a glance — so this surface gets a full semantic
// palette. It stays tied to the brand by keeping the app's emerald for strings and
// building the rest as a harmonised set around it, on the same true-black canvas.
//
// Token names below are the ones Monaco actually emits (verified per language with
// monaco.editor.tokenize); Python's grammar is enriched first in monacoLanguages.ts,
// because stock Python collapses classes, functions and builtins into `identifier`.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CODEPATH_THEME = "codepath";

// Token colours are hex WITHOUT the leading '#'; the `colors` map requires it.
const INK = "c8d3f5";       // code body / plain identifiers
const INK_MUTED = "8b95b8"; // punctuation
const INK_DIM = "737373";
const INK_FAINT = "4d4d4d";

const ACCENT = "34d399";    // strings — the app accent, kept
const KEYWORD = "bb9af7";   // control flow: if / for / return / import
const DECLARE = "9d7cd8";   // class / def / function / const — introduces a name
const TYPE = "e0af68";      // class + type names, inheritance, annotations
const FUNC = "7aa2f7";      // function names and call sites
const BUILTIN = "2ac3de";   // print, len, SUM, attr_reader
const NUMBER = "ff9e64";    // numbers and language constants
const SPECIAL = "f7768e";   // self / cls / this / $vars
const OPERATOR = "89ddff";  // + - = < > and friends
const INFO = "7dd3fc";
const WARN = "fbbf24";
const DANGER = "ef4444";

export function defineCodePathTheme(monaco: any): void {
  monaco.editor.defineTheme(CODEPATH_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: INK },
      { token: "comment", foreground: INK_FAINT, fontStyle: "italic" },
      { token: "comment.doc", foreground: INK_DIM, fontStyle: "italic" },

      // --- Literals ---------------------------------------------------------
      // Strings keep the app accent: they are the values a learner types and then
      // sees echoed in the console.
      { token: "string", foreground: ACCENT },
      { token: "string.escape", foreground: OPERATOR },
      { token: "string.interpolated", foreground: OPERATOR },
      { token: "regexp", foreground: "b4f9f8" },
      { token: "number", foreground: NUMBER },
      { token: "number.hex", foreground: NUMBER },
      { token: "number.float", foreground: NUMBER },
      { token: "number.binary", foreground: NUMBER },
      { token: "number.octal", foreground: NUMBER },
      { token: "constant", foreground: NUMBER },
      { token: "constant.language", foreground: NUMBER, fontStyle: "italic" },

      // --- Keywords ---------------------------------------------------------
      { token: "keyword", foreground: KEYWORD },
      { token: "keyword.declaration", foreground: DECLARE, fontStyle: "italic" },
      { token: "keyword.class", foreground: DECLARE, fontStyle: "italic" },
      { token: "keyword.def", foreground: DECLARE, fontStyle: "italic" },
      { token: "keyword.function", foreground: DECLARE, fontStyle: "italic" },
      { token: "keyword.local", foreground: DECLARE, fontStyle: "italic" },
      { token: "keyword.operator", foreground: OPERATOR },
      { token: "keyword.flow", foreground: KEYWORD },
      { token: "keyword.json", foreground: KEYWORD },

      // --- Types and inheritance -------------------------------------------
      { token: "type", foreground: TYPE },
      { token: "type.identifier", foreground: TYPE },
      { token: "type.declaration", foreground: TYPE, fontStyle: "bold" },
      { token: "constructor", foreground: TYPE },
      { token: "constructor.identifier", foreground: TYPE },
      { token: "namespace", foreground: TYPE },
      { token: "annotation", foreground: TYPE, fontStyle: "italic" },

      // --- Functions and builtins ------------------------------------------
      { token: "function", foreground: FUNC },
      { token: "function.declaration", foreground: FUNC, fontStyle: "bold" },
      { token: "predefined", foreground: BUILTIN },
      { token: "support.function", foreground: BUILTIN },

      // --- Identifiers ------------------------------------------------------
      { token: "identifier", foreground: INK },
      { token: "variable", foreground: SPECIAL },       // PHP $vars, shell vars
      { token: "variable.predefined", foreground: SPECIAL, fontStyle: "italic" }, // self / cls / this
      { token: "variable.parameter", foreground: INK },
      { token: "attribute", foreground: INK },

      // --- Punctuation ------------------------------------------------------
      { token: "operator", foreground: OPERATOR },
      { token: "delimiter", foreground: INK_MUTED },
      { token: "delimiter.bracket", foreground: INK_MUTED },
      { token: "delimiter.parenthesis", foreground: INK_MUTED },
      { token: "delimiter.square", foreground: INK_MUTED },
      { token: "delimiter.curly", foreground: INK_MUTED },
      { token: "delimiter.angle", foreground: INK_MUTED },

      // --- Markup (React / Vue / HTML modules) ------------------------------
      { token: "tag", foreground: SPECIAL },
      { token: "metatag", foreground: INK_DIM },
      { token: "attribute.name", foreground: TYPE },
      { token: "attribute.value", foreground: ACCENT },

      { token: "invalid", foreground: DANGER },
    ],
    colors: {
      "editor.background": "#000000",
      "editor.foreground": `#${INK}`,
      "editorCursor.foreground": `#${ACCENT}`,

      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#ffffff26",
      "editor.inactiveSelectionBackground": "#ffffff14",
      "editor.selectionHighlightBackground": "#ffffff14",
      "editor.wordHighlightBackground": "#ffffff14",
      "editor.findMatchBackground": "#34d3993d",
      "editor.findMatchHighlightBackground": "#34d39926",

      "editorLineNumber.foreground": `#${INK_FAINT}`,
      "editorLineNumber.activeForeground": "#ffffff",
      "editorGutter.background": "#000000",

      "editorIndentGuide.background1": "#ffffff14",
      "editorIndentGuide.activeBackground1": "#ffffff3d",
      "editorWhitespace.foreground": "#ffffff1f",
      "editorBracketMatch.background": "#00000000",
      "editorBracketMatch.border": `#${ACCENT}`,

      // Monaco ships rainbow bracket-pair colouring. Turning the feature off via
      // editor options is not reliably honoured, so every level is pinned to the
      // delimiter tone here; only an unmatched bracket gets colour, and it gets
      // danger, because that one really is an error.
      "editorBracketHighlight.foreground1": `#${INK_MUTED}`,
      "editorBracketHighlight.foreground2": `#${INK_MUTED}`,
      "editorBracketHighlight.foreground3": `#${INK_MUTED}`,
      "editorBracketHighlight.foreground4": `#${INK_MUTED}`,
      "editorBracketHighlight.foreground5": `#${INK_MUTED}`,
      "editorBracketHighlight.foreground6": `#${INK_MUTED}`,
      "editorBracketHighlight.unexpectedBracket.foreground": `#${DANGER}`,
      "editorBracketPairGuide.background1": "#ffffff14",
      "editorBracketPairGuide.activeBackground1": "#ffffff3d",

      // Overlays inherit the app's panel treatment: black fill, hairline border.
      "editorWidget.background": "#000000",
      "editorWidget.border": "#ffffff80",
      "editorSuggestWidget.background": "#000000",
      "editorSuggestWidget.border": "#ffffff80",
      "editorSuggestWidget.selectedBackground": "#ffffff14",
      "editorSuggestWidget.highlightForeground": `#${ACCENT}`,
      "editorHoverWidget.background": "#000000",
      "editorHoverWidget.border": "#ffffff80",

      "editorError.foreground": `#${DANGER}`,
      "editorWarning.foreground": `#${WARN}`,

      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff26",
      "scrollbarSlider.activeBackground": "#ffffff3d",
      "editorOverviewRuler.border": "#00000000",
    },
  });
}
