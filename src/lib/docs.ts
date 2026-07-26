// Documentation source per course module.
//
// Preferred path is an EMBEDDED DevDocs slug — devdocs.io aggregates official, versioned
// docs (real MDN, Python, PostgreSQL, PHP, Ruby, Lua… content) and, unlike the upstream
// sites, sends no X-Frame-Options / frame-ancestors, so it renders inside an iframe.
// (Verified 2026-07: MDN=DENY, PHP=SAMEORIGIN, W3Schools=frame-ancestors all block
// framing; DevDocs does not.) Modules DevDocs doesn't carry fall back to an external
// link that opens the official docs in a new tab.

export type DocSource =
  | { kind: "devdocs"; slug: string; label: string } // embeddable
  | { kind: "external"; url: string; label: string }; // official site blocks framing

// devdocs.io slugs (each verified to return 200 at /<slug>/).
const DOCS: Record<string, DocSource> = {
  javascript: { kind: "devdocs", slug: "javascript", label: "JavaScript (MDN)" },
  typescript: { kind: "devdocs", slug: "typescript", label: "TypeScript" },
  python: { kind: "devdocs", slug: "python~3.13", label: "Python 3.13" },
  ruby: { kind: "devdocs", slug: "ruby~3.4", label: "Ruby 3.4" },
  php: { kind: "devdocs", slug: "php", label: "PHP" },
  lua: { kind: "devdocs", slug: "lua~5.4", label: "Lua 5.4" },
  postgres: { kind: "devdocs", slug: "postgresql~16", label: "PostgreSQL 16" },
  sqlite: { kind: "devdocs", slug: "sqlite", label: "SQLite" },
  css: { kind: "devdocs", slug: "css", label: "CSS (MDN)" },
  tailwind: { kind: "devdocs", slug: "tailwindcss", label: "Tailwind CSS" },
  react: { kind: "devdocs", slug: "react", label: "React" },
  vue: { kind: "devdocs", slug: "vue~3", label: "Vue 3" },
  // No DevDocs coverage → official docs (these block framing), open externally.
  duckdb: { kind: "external", url: "https://duckdb.org/docs/", label: "DuckDB docs" },
  wasm: { kind: "external", url: "https://developer.mozilla.org/en-US/docs/WebAssembly", label: "WebAssembly (MDN)" },
  graphics: { kind: "external", url: "https://threejs.org/docs/", label: "Three.js docs" },
  ml: { kind: "external", url: "https://huggingface.co/docs/transformers.js/index", label: "Transformers.js docs" },
};

export function getDocSource(moduleId?: string | null): DocSource | null {
  return moduleId ? DOCS[moduleId] ?? null : null;
}

// Full URL for a DevDocs source (root of the scoped doc).
export function devdocsUrl(slug: string): string {
  return `https://devdocs.io/${slug}/`;
}
