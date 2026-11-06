// POST /api/docs/resolve — place doc links the browser could not trust on its own.
// Body: { moduleId, context?, links: [{ term, label, context? }] } -> { targets: (string | null)[] }
//
// New messages are validated when they are written (validateDocLinks). Messages
// saved before that still carry targets like "Data types" for `int`. The chat sends
// those here when it shows them, and gets back the page and section that define each
// one ("@language/types#Standard_integer_types"), or null for "not a link".

import { NextResponse } from "next/server";
import { canonicalDocTerm, confidentDocTarget } from "@/lib/docs-index";
import { findDocPages } from "@/lib/docSearch";
import { userOrTrial } from "@/lib/apiAuth";

const MAX_LINKS = 20;

export async function POST(request: Request) {
  const who = await userOrTrial(request);
  if ("error" in who) return who.error;

  try {
    const { moduleId, context, links } = await request.json();
    const refs = (Array.isArray(links) ? links : []).slice(0, MAX_LINKS).map((l) => ({
      term: String(l?.term ?? "").slice(0, 200),
      label: String(l?.label ?? "").slice(0, 200),
      context: `${String(context ?? "").slice(0, 300)} ${String(l?.context ?? "").slice(0, 500)}`.trim(),
    }));
    const confident = await Promise.all(refs.map((r) => confidentDocTarget(moduleId, r.term, r.label)));
    const misses = refs.map((_, i) => i).filter((i) => !confident[i]);
    const pages = await findDocPages(moduleId, misses.map((i) => refs[i]));
    const targets = await Promise.all(
      refs.map(async (r, i) => {
        if (confident[i]) return confident[i];
        const page = pages[misses.indexOf(i)];
        if (page) return page;
        // The docs are still loading, or no page fits: a plain name match is the
        // last resort, and nothing at all beats a wrong page.
        return canonicalDocTerm(moduleId, r.term, [r.label]);
      })
    );
    return NextResponse.json({ targets });
  } catch (e) {
    console.error("[docs/resolve] error:", e);
    return NextResponse.json({ targets: [] });
  }
}
