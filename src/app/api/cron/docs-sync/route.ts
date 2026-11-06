// GET /api/cron/docs-sync — bring our copy of the documentation up to date.
//   Authorization: Bearer <CRON_SECRET>      (Vercel Cron sends this itself)
//   ?force=1   re-download sets that are already current
//   ?slug=cpp  only these sets (repeatable)
//   -> { done: boolean, results: [{ slug, status, detail? }] }
//
// Daily from vercel.json, or by hand with `npm run sync:docs`. Each run updates what
// it can in its time budget; a set it did not reach is "skipped" and is done next run,
// so `done: false` means "call again". See src/lib/docsSync.ts.

import { NextResponse } from "next/server";
import { syncDocs } from "@/lib/docsSync";

export const maxDuration = 300; // seconds: a large set (C++, ~45 MB) takes a while
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured means nobody may run it, not that everybody may.
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const slugs = url.searchParams.getAll("slug");
  try {
    const results = await syncDocs({
      budgetMs: 240_000,
      force: url.searchParams.get("force") === "1",
      slugs: slugs.length ? slugs : undefined,
    });
    return NextResponse.json({ done: !results.some((r) => r.status === "skipped"), results });
  } catch (e) {
    console.error("[docs-sync] error:", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
