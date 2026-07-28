"use client";

import React from "react";
import { LoginButton } from "./LoginButton";
import FeedbackButton, { type FeedbackContext } from "./FeedbackButton";
import { version } from "../../package.json";

export default function NavBar({
  onHome,
  onOpenAccount,
  feedbackContext,
}: {
  onHome?: () => void;
  onOpenAccount?: () => void;
  /** Where the user is, carried into any feedback they send from here. */
  feedbackContext?: FeedbackContext;
}) {
  return (
    <nav className="w-full h-16 flex items-center px-4 border-b border-line-strong shadow-sm">
      {/* Project title on the left — returns to the landing (modules) view */}
      <div className="flex items-center min-w-[220px]">
        <button
          type="button"
          onClick={onHome}
          aria-label="CodeChad home"
          className="flex items-center gap-2.5 text-ink 
                     transition-opacity hover:opacity-80 text-xl font-bold tracking-tight drop-shadow-lg select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
          <img src="/logo.svg" alt="" className="h-8 w-8 drop-shadow" />
          <span className="flex items-baseline space-x-[10px]">
            <span>CodeChad</span>
            <span className="text-sm font-normal">v{version} beta</span>
          </span>
        </button>
      </div>
      {/* Spacer for future nav items */}
      <div className="flex-1" />
      {/* Feedback, then the account button. Feedback sits to its LEFT so the account
          control keeps the far corner it has always had — the position people reach for
          without looking.

          PHONES ONLY. On desktop the button floats bottom-right (rendered in
          app/page.tsx); down here the workspace's chat composer owns the bottom edge,
          which is what moved it into the nav in the first place. */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="md:hidden">
          <FeedbackButton context={feedbackContext} placement="nav" />
        </span>
        <LoginButton onOpenAccount={onOpenAccount} />
      </div>
      {/* Add more nav content here if needed */}
    </nav>
  );
}
