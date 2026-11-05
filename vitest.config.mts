import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the `@/*` alias from tsconfig.json, so tests import exactly like app code.
  plugins: [tsconfigPaths()],
  test: {
    // Pure logic only — no DOM, no browser APIs.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
