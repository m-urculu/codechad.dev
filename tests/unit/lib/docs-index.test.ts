import { beforeAll, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { canonicalDocTerm, confidentDocTarget, resolveDocPath, rewriteDocLinks, validateDocLinks } from "@/lib/docs-index";

// Generated doc links are checked against our copy of the module's docs before
// anyone sees them: a near miss is pointed at the real entry, anything else loses
// its link. The copy (manifest, entries, page map in the `docs` bucket) is faked
// here; the names are real cppreference entries (measured 2026-11: the model writes
// "cout", the index says "std::cout").

const ENTRIES = [
  { name: "std::cout", path: "io/cout" },
  { name: "std::endl", path: "io/manip/endl" },
  { name: "iostream", path: "header/iostream" },
  { name: "Escape sequences", path: "language/escape" },
  { name: "Fundamental types", path: "language/types" },
  { name: "std::ghost", path: "missing/page" }, // in the index, but not in the copy's pages
];
// Every page but missing/page exists in the copy.
const PAGES = Object.fromEntries(
  ENTRIES.filter((e) => e.path !== "missing/page").map((e, i) => [e.path.split("#")[0], i])
);

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL", "https://project.supabase.test");
  const store = "https://project.supabase.test/storage/v1/object/public/docs/";
  const files: Record<string, unknown> = {
    "manifest.json": { version: 1, docs: { cpp: { mtime: 7, name: "C++", attribution: "", syncedAt: "" } } },
    "cpp/7/index.json.gz": ENTRIES,
    "cpp/7/pages.json.gz": PAGES,
  };
  // Stored gzipped, as the sync writes them (manifest.json excepted).
  const body = (file: string) => {
    const json = JSON.stringify(files[file]);
    return file.endsWith(".gz") ? new Uint8Array(gzipSync(json)) : json;
  };
  vi.stubGlobal("fetch", async (url: string) => {
    const file = url.startsWith(store) ? url.slice(store.length) : "";
    return file in files ? new Response(body(file)) : new Response("", { status: 404 });
  });
});

describe("canonicalDocTerm", () => {
  it("accepts the index's own name", async () => {
    expect(await canonicalDocTerm("cpp", "Escape sequences")).toBe("escape sequences");
  });

  it("corrects the usual near misses", async () => {
    expect(await canonicalDocTerm("cpp", "cout")).toBe("std::cout");
    expect(await canonicalDocTerm("cpp", "<iostream>")).toBe("iostream");
    expect(await canonicalDocTerm("cpp", "endl()")).toBe("std::endl");
  });

  it("falls back to an alternative, such as the syntax token", async () => {
    expect(await canonicalDocTerm("cpp", "Insertion operator", ["std::cout"])).toBe("std::cout");
  });

  it("refuses a name with no entry, a page that does not exist, and non-DevDocs modules", async () => {
    expect(await canonicalDocTerm("cpp", "Insertion operator")).toBeNull();
    expect(await canonicalDocTerm("cpp", "std::ghost")).toBeNull();
    expect(await canonicalDocTerm("duckdb", "SELECT")).toBeNull();
  });
});

describe("validateDocLinks", () => {
  it("repoints near misses, and turns dead links into plain text", async () => {
    const msg = "Print with [`cout`](<doc:cout>), end lines with [`\\n`](<doc:Escape sequences>), " +
      "and chain with [`<<`](<doc:Insertion operator>).";
    expect(await validateDocLinks(msg, "cpp")).toBe(
      "Print with [`cout`](<doc:std::cout>), end lines with [`\\n`](<doc:escape sequences>), and chain with `<<`."
    );
  });

  it("sends what names cannot place to the content search, with its context", async () => {
    const seen: { term: string; label: string; context: string }[] = [];
    const msg = "C++ is compiled by a [compiler](<doc:compiler>) and printed with [`cout`](<doc:cout>).";
    const out = await validateDocLinks(msg, "cpp", {
      context: "Introduction to C and C++",
      findPages: async (refs) => (seen.push(...refs), refs.map(() => "@language/translation_phases")),
    });
    // cout is an entry, so only "compiler" reaches the search, with the sentence around it.
    expect(seen).toHaveLength(1);
    expect(seen[0].term).toBe("compiler");
    expect(seen[0].context).toContain("Introduction to C and C++");
    expect(seen[0].context).toContain("C++ is compiled by a compiler");
    expect(out).toBe(
      "C++ is compiled by a [compiler](<doc:@language/translation_phases>) and printed with [`cout`](<doc:std::cout>)."
    );
  });

  it("checks look-alike schemes the model invents, and leaves web links alone", async () => {
    const msg = "Use [std::cout](<cppreference:io/cout>) — see [cppreference](https://en.cppreference.com/).";
    expect(await validateDocLinks(msg, "cpp")).toBe(
      "Use [std::cout](<doc:std::cout>) — see [cppreference](https://en.cppreference.com/)."
    );
  });

  it("drops the link when the content search finds no page either", async () => {
    const out = await validateDocLinks("A [linker](<doc:linker>) links.", "cpp", { findPages: async (r) => r.map(() => null) });
    expect(out).toBe("A linker links.");
  });

  it("accepts a page link whose page exists", async () => {
    expect(await canonicalDocTerm("cpp", "@io/cout")).toBe("@io/cout");
    expect(await canonicalDocTerm("cpp", "@missing/page")).toBeNull();
  });

  it("unwraps doc links inside a code block, where they would show as raw text", async () => {
    const msg = "Print with [`cout`](<doc:cout>).\n\n```cpp\n[`return`](<doc:return>) exits.\nreturn 0;\n```";
    expect(await validateDocLinks(msg, "cpp")).toBe(
      "Print with [`cout`](<doc:std::cout>).\n\n```cpp\n`return` exits.\nreturn 0;\n```"
    );
  });

  it("leaves a message without doc links untouched", async () => {
    expect(await validateDocLinks("No links here.", "cpp")).toBe("No links here.");
  });
});

describe("confidentDocTarget — when a name match can be trusted", () => {
  it("trusts a link whose text names the same entry", async () => {
    expect(await confidentDocTarget("cpp", "std::cout", "`std::cout`")).toBe("std::cout");
    expect(await confidentDocTarget("cpp", "cout", "cout")).toBe("std::cout");
  });

  it("does not trust a description on a piece of syntax: that needs the section", async () => {
    // [`int`](Fundamental types) is the right page, but the top of it; the content
    // search finds the section that defines int.
    expect(await confidentDocTarget("cpp", "Fundamental types", "`int`")).toBeNull();
  });

  it("trusts a page the content search already chose", async () => {
    expect(await confidentDocTarget("cpp", "@language/types#Standard_integer_types", "int")).toBe(
      "@language/types#Standard_integer_types"
    );
  });
});

describe("resolveDocPath — a page of our copy, never a search", () => {
  it("opens a chosen page at its section", async () => {
    expect(await resolveDocPath("cpp", "@language/types#Standard_integer_types")).toBe(
      "language/types#Standard_integer_types"
    );
  });

  it("returns nothing for a term it cannot place, instead of searching for it", async () => {
    // DevDocs search opens its top result: "Data types" opened "Data-parallel types".
    expect(await resolveDocPath("cpp", "Data types")).toBeNull();
  });
});

describe("rewriteDocLinks — saving placements into the message", () => {
  it("repoints placed links, unlinks dead ones, and leaves the rest alone", () => {
    const text = "An [`int`](<doc:Data types>) holds a whole number; a [linker](<doc:linker>) links; see [`std::cout`](<doc:std::cout>).";
    const placed = new Map<string, string | null>([
      ["Data types", "@language/types#Standard_integer_types"],
      ["linker", null],
    ]);
    expect(rewriteDocLinks(text, placed)).toBe(
      "An [`int`](<doc:@language/types#Standard_integer_types>) holds a whole number; a linker links; see [`std::cout`](<doc:std::cout>)."
    );
  });
});
