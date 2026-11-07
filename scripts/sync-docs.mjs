// Run the docs sync by hand: `npm run sync:docs [-- --force] [-- --slug=cpp]`.
//
// Calls the running app's sync route (src/app/api/cron/docs-sync/route.ts) with
// CRON_SECRET from .env.local, and calls again until every doc set is done — one run
// only has a few minutes. Start the app first (`npm run dev`). SITE defaults to
// http://localhost:3000.
//
// This WRITES to the project's Supabase Storage (the public `docs` bucket).

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")])
);
const secret = process.env.CRON_SECRET ?? env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set (add it to .env.local)");
  process.exit(1);
}
const site = process.env.SITE ?? "http://localhost:3000";
const qs = new URLSearchParams();
if (process.argv.includes("--force")) qs.set("force", "1");
for (const a of process.argv) if (a.startsWith("--slug=")) qs.append("slug", a.slice(7));

for (let run = 1; run <= 20; run++) {
  const res = await fetch(`${site}/api/cron/docs-sync?${qs}`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`run ${run}: ${res.status}`, body.error ?? "");
    process.exit(1);
  }
  for (const r of body.results ?? []) console.log(`  ${r.slug.padEnd(14)} ${r.status}${r.detail ? `  ${r.detail}` : ""}`);
  if (body.done) break;
  // Anything already updated is now "current"; only the rest is redone.
  qs.delete("force");
  console.log(`run ${run} out of time; continuing…`);
}
