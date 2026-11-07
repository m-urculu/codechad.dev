import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parser's grammars (src/lib/structure.ts) are read from disk on the server,
  // where lesson generation checks a lesson's structural rules against its solution.
  outputFileTracingIncludes: {
    "/api/lesson/build": ["./public/tree-sitter/**"],
  },
  // web-tree-sitter's Node branch, never taken in a browser (see src/lib/empty-module.ts).
  turbopack: {
    resolveAlias: {
      "fs/promises": { browser: "./src/lib/empty-module.ts" },
      module: { browser: "./src/lib/empty-module.ts" },
      fs: { browser: "./src/lib/empty-module.ts" },
    },
  },
  images: {
    // Every host a signed-in user's avatar can come from. An OAuth provider missing
    // from this list doesn't degrade — the optimizer answers 400 and the nav falls
    // back to an initial — so it must be extended whenever a provider is added.
    remotePatterns: [
      // Google account avatars (Supabase OAuth)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // GitHub account avatars, uploaded and generated identicons alike
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
