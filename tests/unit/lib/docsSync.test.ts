import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { bundlePages } from "@/lib/docsSync";
import { setDir } from "@/lib/docsStore";

// The docs sync stores each doc set's pages in bundles of about 300 KB, with a map
// of which bundle holds which page. See src/lib/docsSync.ts and docsStore.ts.

describe("bundlePages", () => {
  it("maps every page to the bundle that holds it", () => {
    const db = { b: "<p>b</p>", a: "<p>a</p>", c: "<p>c</p>" };
    const { bundles, map } = bundlePages(db);
    for (const page of Object.keys(db)) expect(bundles[map[page]][page]).toBe(db[page as keyof typeof db]);
  });

  it("starts a new bundle rather than grow one past the size limit", () => {
    const big = "x".repeat(200_000);
    const { bundles, map } = bundlePages({ p1: big, p2: big, p3: "small" });
    expect(bundles.length).toBe(2);
    expect(map.p1).not.toBe(map.p2);
  });
});

describe("setDir", () => {
  it("replaces the ~ storage keys cannot hold", () => {
    expect(setDir("python~3.13", 42)).toBe("python--3.13/42");
    expect(setDir("cpp", 42)).toBe("cpp/42");
  });
});
