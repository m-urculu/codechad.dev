import { describe, expect, it } from "vitest";
import { anchorFor, buildDoc, candidates, docTokens, stem } from "@/lib/docSearch";

// Content search for doc links: candidate pages for a term, found in the pages' own
// titles and text and in the lesson's context. The model's pick among them needs a
// live call and is not unit-tested. Pages below are trimmed real cppreference ones.

const DB = {
  "language/translation_phases":
    "<h1>Phases of translation</h1><p>C++ source files are processed by the compiler to produce a C++ program. Translation units are linked.</p>",
  compiler_support: "<h1>C++ compiler support</h1><p>The tables list which features each compiler supports.</p>",
  "language/escape": "<h1>Escape sequences</h1><p>Escape sequences represent characters in string literals, such as \\n for new line.</p>",
  "preprocessor/include": "<h1>Source file inclusion</h1><p>#include includes another source file into the current file.</p>",
  "io/cout": "<h1>std::cout, std::wcout</h1><p>The global objects control output to a stream buffer.</p>",
};
const ENTRIES = [
  { name: "std::cout", path: "io/cout" },
  { name: "#include", path: "preprocessor/include" },
];
const doc = buildDoc(DB, ENTRIES);
const paths = (term: string, context: string) => candidates(doc, { term, label: term, context }).map((p) => p.path);

describe("docTokens and stem", () => {
  it("keeps syntax tokens and drops filler", () => {
    expect(docTokens("Use #include and \\n with the << operator")).toEqual(["#include", "\\n", "<<", "operator"]);
  });

  it("stems related words to the same root", () => {
    expect(stem("translates")).toBe(stem("translation"));
  });
});

describe("candidates", () => {
  it("finds a page by its title or index entry", () => {
    expect(paths("#include", "include a header")[0]).toBe("preprocessor/include");
    expect(paths("std::cout", "print to the console")[0]).toBe("io/cout");
  });

  it("finds a page by its text", () => {
    expect(paths("\\n", "end a line")).toContain("language/escape");
  });

  it("brings in the page the CONTEXT describes, not only pages named after the term", () => {
    // "compiler" alone favours "C++ compiler support"; the lesson means translation.
    expect(paths("compiler", "the compiler translates source code into a program")).toContain(
      "language/translation_phases"
    );
  });

  it("returns nothing for a term the doc does not discuss", () => {
    expect(paths("Hogwarts", "")).toEqual([]);
  });
});

describe("anchorFor — the section that defines the term", () => {
  // Trimmed from cppreference's Fundamental types page.
  const types = buildDoc(
    {
      "language/types":
        "<h1>Fundamental types</h1><h3 id=\"void\">void</h3><p><code>void</code> — type with an empty set of values.</p>" +
        "<h3 id=\"Integral_types\">Integral types</h3><h4 id=\"Standard_integer_types\">Standard integer types</h4>" +
        "<p><code>int</code> — basic integer type. The keyword int may be omitted.</p>" +
        "<h5 id=\"Modifiers\">Modifiers</h5><p>Modifies the basic integer type, as in unsigned int.</p>" +
        "<h4 id=\"Boolean_type\">Boolean type</h4><p><code>bool</code> — integer type, capable of holding true or false.</p>",
    },
    []
  ).pages[0];

  it("lands on the definition, not the first mention", () => {
    expect(anchorFor(types, ["int"])).toBe("Standard_integer_types");
    expect(anchorFor(types, ["bool"])).toBe("Boolean_type");
  });

  it("uses a heading named after the term", () => {
    expect(anchorFor(types, ["Integral types"])).toBe("Integral_types");
  });

  it("matches symbols exactly: \\n is not \\N", () => {
    const escapes = buildDoc(
      {
        "language/escape":
          "<h1>Escape sequences</h1><p>\\n — line feed. \\t — tab.</p>" +
          "<h3 id=\"Named\">Named universal character escapes</h3><p>\\N{NAME} names a character.</p>",
      },
      []
    ).pages[0];
    // The page is about escapes and defines \n at its top, before any section.
    expect(anchorFor(escapes, ["\\n", "Escape sequences"])).toBe("");
  });

  it("does not jump to an Example on a page that is itself about the term", () => {
    const op = buildDoc(
      { "io/operator_ltlt": "<h1>std::basic_ostream::operator&lt;&lt;</h1><p>Inserts data.</p><h3 id=\"Example\">Example</h3><p>std::cout &lt;&lt; 1;</p>" },
      []
    ).pages[0];
    expect(anchorFor(op, ["<<"])).toBe("");
  });

  it("is the page itself when no section is about the term", () => {
    expect(anchorFor(types, ["Hogwarts"])).toBe("");
  });
});
