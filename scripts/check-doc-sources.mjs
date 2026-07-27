#!/usr/bin/env node
// Validate every documentation source the app ships.
//
// Doc links die in two ways. One is per-term and is handled at run time
// (src/lib/docs-index.ts validates each term against the index and each page against
// documents.devdocs.io before the learner is sent anywhere). The other is per-MODULE
// and cannot be caught at run time without the learner noticing first: a DevDocs slug
// going stale. `python~3.13` will not be there forever, and the day it goes, every
// Python doc link in the app quietly stops resolving.
//
// This checks each slug's index is live, that it carries entries, and — for a sample of
// real entries — that the pages behind them exist. Run it in CI, or by hand:
//
//     npm run check:docs
//
// Exits non-zero on the first broken source, so it can gate a deploy.

import { readFileSync } from "node:fs";

// node's fetch has no default timeout, and a doc host that accepts the connection and
// then stalls would hang this check forever — the opposite of a useful CI gate.
const TIMEOUT_MS = 20000;

// One retry, because a single stalled connection is not a broken doc source and a gate
// that cries wolf gets switched off. Observed in practice: vue~3 timed out on one run
// and served its whole 30 KB index in 0.1 s on the next.
async function get(url, init = {}, attempt = 1) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (attempt >= 2) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return get(url, init, attempt + 1);
  }
}

const SRC = "src/lib/docs.ts";
const text = readFileSync(new URL(`../${SRC}`, import.meta.url), "utf8");

// Parse the DOCS table out of the source rather than importing it: this file is plain
// Node and docs.ts is TypeScript, and the shape here is stable and trivially matched.
const devdocs = [...text.matchAll(/(\w+):\s*\{\s*kind:\s*"devdocs",\s*slug:\s*"([^"]+)"/g)].map(
  ([, module, slug]) => ({ module, slug })
);
const external = [...text.matchAll(/(\w+):\s*\{\s*kind:\s*"external",\s*url:\s*"([^"]+)"/g)].map(
  ([, module, url]) => ({ module, url })
);

if (devdocs.length === 0) {
  console.error(`No devdocs sources found in ${SRC} — has the shape changed?`);
  process.exit(1);
}

const SAMPLE = 5; // entries per doc to spot-check
let failures = 0;

console.log(`Checking ${devdocs.length} DevDocs sources and ${external.length} external links\n`);

for (const { module, slug } of devdocs) {
  const label = `${module} (${slug})`.padEnd(30);
  try {
    const res = await get(`https://documents.devdocs.io/${slug}/index.json`);
    if (!res.ok) {
      console.error(`  FAIL ${label} index.json -> ${res.status}`);
      failures++;
      continue;
    }
    const { entries = [] } = await res.json();
    if (entries.length === 0) {
      console.error(`  FAIL ${label} index is empty`);
      failures++;
      continue;
    }

    // Spread the sample across the index rather than taking the first few, which are
    // often all one page.
    const step = Math.max(1, Math.floor(entries.length / SAMPLE));
    const picks = Array.from({ length: SAMPLE }, (_, i) => entries[i * step]).filter(Boolean);
    const bad = [];
    for (const e of picks) {
      const page = String(e.path).split("#")[0];
      const r = await get(`https://documents.devdocs.io/${slug}/${page}.html`, { method: "HEAD" });
      if (!r.ok) bad.push(`${e.name} -> ${page} (${r.status})`);
    }
    if (bad.length) {
      console.error(`  FAIL ${label} ${entries.length} entries, ${bad.length}/${picks.length} pages missing`);
      for (const b of bad) console.error(`         ${b}`);
      failures++;
    } else {
      console.log(`  ok   ${label} ${entries.length} entries, ${picks.length}/${picks.length} sampled pages live`);
    }
  } catch (err) {
    console.error(`  FAIL ${label} ${String(err).slice(0, 80)}`);
    failures++;
  }
}

for (const { module, url } of external) {
  const label = `${module}`.padEnd(30);
  try {
    // Some doc sites refuse HEAD; a GET that reaches a 2xx/3xx is enough to prove the
    // link is not dead.
    const res = await get(url, { redirect: "follow", method: "HEAD" });
    if (res.ok) console.log(`  ok   ${label} ${url}`);
    else {
      console.error(`  FAIL ${label} ${url} -> ${res.status}`);
      failures++;
    }
  } catch (err) {
    console.error(`  FAIL ${label} ${url} — ${String(err).slice(0, 60)}`);
    failures++;
  }
}

console.log(failures === 0 ? "\nAll documentation sources are live." : `\n${failures} broken source(s).`);
process.exit(failures ? 1 : 0);
