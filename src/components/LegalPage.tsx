import Link from "next/link";

// Shell for the public legal pages (/privacy, /terms).
//
// These exist for Google's OAuth consent screen, which requires a homepage, a
// privacy policy and a terms link that are publicly reachable on the app's own
// domain. Two consequences shape this file:
//
//   1. No "use client", no auth, no WebGL background. Google fetches these pages
//      with a crawler, and a reviewer opens them signed out. Everything here has
//      to render from the server on the first response.
//   2. Content is data, not markup. Both pages render through the same shell, so
//      they cannot drift apart in structure or styling.

export type Block = { p: React.ReactNode } | { list: React.ReactNode[] };
export type Section = { heading: string; blocks: Block[] };

export default function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  /** Human-readable effective date, e.g. "25 July 2026". */
  updated: string;
  intro: React.ReactNode;
  sections: Section[];
}) {
  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      <header className="border-b border-line-strong">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2.5 px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-ink transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span>CodePath</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-meta uppercase tracking-wider text-ink-dim">Last updated {updated}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h1>
        <div className="mt-5 border border-line-strong bg-surface-1 p-5 text-sm leading-relaxed text-ink-muted">
          {intro}
        </div>

        <div className="mt-10 flex flex-col gap-9">
          {sections.map((section, i) => (
            <section key={section.heading}>
              <h2 className="flex items-baseline gap-3 text-sm font-bold text-ink">
                <span className="font-mono text-meta tabular-nums text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3 border-l border-line pl-4">
                {section.blocks.map((block, j) =>
                  "p" in block ? (
                    <p key={j} className="text-sm leading-relaxed text-ink-muted">
                      {block.p}
                    </p>
                  ) : (
                    <ul key={j} className="flex flex-col gap-2">
                      {block.list.map((item, k) => (
                        <li
                          key={k}
                          className="flex gap-2.5 text-sm leading-relaxed text-ink-muted"
                        >
                          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 bg-accent" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </section>
          ))}
        </div>

        <LegalFooter />
      </main>
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-meta text-ink-dim">
      <Link href="/" className="text-ink-dim transition-colors duration-150 hover:text-ink">
        CodePath
      </Link>
      <Link href="/privacy" className="text-ink-dim transition-colors duration-150 hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="text-ink-dim transition-colors duration-150 hover:text-ink">
        Terms
      </Link>
      <a
        href="mailto:mrcel83@gmail.com"
        className="text-ink-dim transition-colors duration-150 hover:text-ink"
      >
        Contact
      </a>
    </footer>
  );
}

// Shared inline link styling — legal text is dense, so links need to read as links.
export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-accent-bright"
    >
      {children}
    </a>
  );
}
