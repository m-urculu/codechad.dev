// Monaco theme built from the CodePath design tokens (see docs/design-system.md).
//
// Stock vs-dark reads as a foreign object in this app: a #1e1e1e background against
// our true black, VS Code's blue/orange syntax palette against our monochrome +
// single accent, and its own mono face.
//
// The rule here mirrors the rest of the system: the page is monochrome, and colour
// carries meaning. Code is mostly ink; the accent marks literal values (the things a
// learner types and sees echoed in the console), info marks types and numbers, and
// danger marks what is actually wrong. Nothing else is tinted.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CODEPATH_THEME = "codepath";

// Token colours are hex WITHOUT the leading '#'; the `colors` map requires it.
const INK = "e6e6e6";
const INK_MUTED = "b3b3b3";
const INK_DIM = "737373";
const INK_FAINT = "4d4d4d";
const ACCENT = "34d399";
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

      // Literals — the values a learner writes and then sees in the console.
      { token: "string", foreground: ACCENT },
      { token: "string.escape", foreground: ACCENT },
      { token: "string.sql", foreground: ACCENT },
      { token: "regexp", foreground: ACCENT },
      { token: "number", foreground: INFO },
      { token: "number.hex", foreground: INFO },
      { token: "constant", foreground: INFO },

      // Structure — carried by weight rather than hue.
      { token: "keyword", foreground: "ffffff", fontStyle: "bold" },
      { token: "keyword.control", foreground: "ffffff", fontStyle: "bold" },
      { token: "keyword.operator", foreground: INK_MUTED },
      { token: "operator", foreground: INK_MUTED },
      { token: "delimiter", foreground: INK_DIM },
      { token: "delimiter.bracket", foreground: INK_MUTED },
      { token: "delimiter.parenthesis", foreground: INK_MUTED },

      { token: "type", foreground: INFO },
      { token: "type.identifier", foreground: INFO },
      { token: "entity.name.class", foreground: INFO },
      { token: "identifier", foreground: INK },
      { token: "variable", foreground: INK },
      { token: "variable.predefined", foreground: INK_MUTED },
      { token: "function", foreground: INK },
      { token: "support.function", foreground: INK },

      // Markup (React/Vue/HTML modules).
      { token: "tag", foreground: "ffffff", fontStyle: "bold" },
      { token: "metatag", foreground: INK_DIM },
      { token: "attribute.name", foreground: INFO },
      { token: "attribute.value", foreground: ACCENT },

      { token: "annotation", foreground: WARN },
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
