"use client";

// Documentation tab: embeds official docs for the active course via DevDocs (which,
// unlike the upstream sites, permits framing). Modules DevDocs doesn't cover show an
// external-link card instead. The iframe is sandboxed WITHOUT allow-top-navigation, so
// any JS frame-busting on the embedded page can't hijack the app.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, BookOpen, RotateCcw } from "lucide-react";
import { getDocSource, devdocsUrl } from "@/lib/docs";
import { getModuleMeta } from "@/lib/modules";

// docTarget carries a deep-link (an exact DevDocs section URL, or a search URL) requested
// from elsewhere — e.g. clicking a doc link in the chat. The nonce makes repeat clicks on
// the same URL re-navigate.
type DocTarget = { url: string; nonce: number } | null;

export default function DocsPanel({
  moduleId,
  docTarget,
}: {
  moduleId?: string | null;
  docTarget?: DocTarget;
}) {
  const src = getDocSource(moduleId);
  const title = getModuleMeta(moduleId)?.title ?? "Documentation";
  // Bumping the key forces the iframe to reload (used by the refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  const rootUrl = useMemo(
    () => (src?.kind === "devdocs" ? devdocsUrl(src.slug) : null),
    [src]
  );
  // The URL the iframe currently shows: the doc root by default, or a deep-link target.
  const [embedUrl, setEmbedUrl] = useState<string | null>(rootUrl);

  // Reset to the doc root whenever the module changes.
  useEffect(() => {
    setEmbedUrl(rootUrl);
  }, [rootUrl]);

  // Navigate to a requested deep-link (chat doc-link click). Changing src reloads the
  // iframe, landing it on the exact section; reloadKey guarantees a reload on same-URL.
  useEffect(() => {
    if (docTarget?.url && rootUrl) {
      setEmbedUrl(docTarget.url);
      setReloadKey((k) => k + 1);
    }
  }, [docTarget, rootUrl]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col border border-white/50 backdrop-blur-md font-sans">
      <div className="flex items-center justify-between gap-2 border-b border-white/50 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-white/70" />
          <span className="truncate text-sm font-bold leading-normal text-white">{title} docs</span>
          {src && (
            <span className="hidden shrink-0 whitespace-nowrap font-mono text-[11px] leading-normal text-white/45 sm:inline">
              · {src.label}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {embedUrl && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              title="Reload docs"
              aria-label="Reload docs"
              className="flex h-7 w-7 items-center justify-center border border-white/40 bg-black text-white/70 transition-colors hover:bg-neutral-700 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {src && (
            <a
              href={src.kind === "devdocs" ? embedUrl ?? devdocsUrl(src.slug) : src.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              className="flex items-center gap-1.5 border border-white/40 bg-black px-2.5 py-1 text-[11px] font-mono text-white/80 transition-colors hover:bg-neutral-700 hover:text-white"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {!src ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/40">
          Pick a course to see its documentation here.
        </div>
      ) : src.kind === "devdocs" ? (
        <iframe
          key={reloadKey}
          src={embedUrl!}
          title={`${title} documentation`}
          className="flex-1 w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      ) : (
        // DevDocs doesn't carry this one; its official site blocks embedding.
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <BookOpen className="h-8 w-8 text-white/40" />
          <p className="max-w-sm text-sm leading-relaxed text-white/60">
            The official <span className="text-white/80">{title}</span> documentation can't be
            embedded here, but it's one click away.
          </p>
          <a
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-white/50 bg-white/10 px-4 py-2 text-sm font-mono text-white transition-colors hover:bg-white/20"
          >
            {src.label} <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}
