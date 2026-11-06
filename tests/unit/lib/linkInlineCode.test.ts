import { beforeAll, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { buildDoc, linkInlineCode, serializeDoc } from "@/lib/docSearch";

// Inline code in a tutor message is linked to where our copy of the docs defines
// it, in code — no model. Store faked; markup trimmed from cppreference.

const DOC = buildDoc(
  {
    "language/types":
      "<h1>Fundamental types</h1><h4 id=\"Standard_integer_types\">Standard integer types</h4>" +
      "<p><code>int</code> — basic integer type.</p>",
    "language/escape":
      "<h1>Escape sequences</h1><h3 id=\"Simple_escape_sequences\">Simple escape sequences</h3>" +
      "<table><tr><td><code>\\n</code></td><td>line feed - new line</td></tr></table>",
    // `&&` heads a row whose next cell is code, not a description: not a definition.
    "language/operator_alternative": "<h1>Alternative tokens</h1><table><tr><td><code>&amp;&amp;</code></td><td><code>and</code></td></tr></table>",
  },
  []
);

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL", "https://project.supabase.test");
  const store = "https://project.supabase.test/storage/v1/object/public/docs/";
  const files: Record<string, unknown> = {
    "manifest.json": { version: 1, docs: { cpp: { mtime: 9, name: "C++", attribution: "", syncedAt: "" } } },
    "cpp/9/search.json.gz": serializeDoc(DOC),
  };
  vi.stubGlobal("fetch", async (url: string) => {
    const file = url.startsWith(store) ? url.slice(store.length) : "";
    if (!(file in files)) return new Response("", { status: 404 });
    const json = JSON.stringify(files[file]);
    return new Response(file.endsWith(".gz") ? new Uint8Array(gzipSync(json)) : json);
  });
});

// The exact-entry lookup: here, only std::cout is an entry.
const names = async (t: string) => (t === "std::cout" || t === "cout" ? "std::cout" : null);

describe("linkInlineCode", () => {
  it("links defined syntax to its definition and entries to their page", async () => {
    const out = await linkInlineCode("Store a whole number in an `int`, print it with `cout`.", "cpp", names);
    expect(out).toBe(
      "Store a whole number in an [`int`](<doc:@language/types#Standard_integer_types>), print it with [`cout`](<doc:std::cout>)."
    );
  });

  it("links syntax defined in a table row, when only one page has it", async () => {
    // The term this feature exists for: a beginner was never shown \n.
    expect(await linkInlineCode("End the line with `\\n`.", "cpp", names)).toBe(
      "End the line with [`\\n`](<doc:@language/escape#Simple_escape_sequences>)."
    );
  });

  it("does not take a row whose next cell is code as a definition", async () => {
    expect(await linkInlineCode("Combine with `&&`.", "cpp", names)).toBe("Combine with `&&`.");
  });

  it("links only the first use of a term", async () => {
    const out = await linkInlineCode("An `int` here, another `int` there.", "cpp", names);
    expect(out.match(/<doc:/g)).toHaveLength(1);
  });

  it("leaves values, existing links and code blocks alone", async () => {
    const text =
      "Print `Hello, C++!` with [`std::cout`](<doc:std::cout>).\n\n```cpp\nint x = 1; // `int`\n```";
    expect(await linkInlineCode(text, "cpp", names)).toBe(text);
  });

  it("does nothing for a module with no docs of ours", async () => {
    expect(await linkInlineCode("`SELECT`", "duckdb", names)).toBe("`SELECT`");
  });
});
