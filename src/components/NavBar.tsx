"use client";

import React from "react";
import { LoginButton } from "./LoginButton";

export default function NavBar({ onHome }: { onHome?: () => void }) {
  return (
    <nav className="w-full h-16 flex items-center px-4 border-b border-white/50 shadow-sm">
      {/* Project title on the left — returns to the landing (modules) view */}
      <div className="flex items-center min-w-[220px]">
        <button
          type="button"
          onClick={onHome}
          aria-label="CodePath.AI home"
          className="flex items-baseline space-x-[10px] text-white cursor-pointer
                     transition-opacity hover:opacity-80 text-xl font-extrabold tracking-tight drop-shadow-lg select-none"
        >
          <span>CodePath.AI</span><span className="text-sm font-thin">(alpha)</span>
        </button>
      </div>
      {/* Spacer for future nav items */}
      <div className="flex-1" />
      {/* User profile avatar on the right */}
      <div className="flex items-center">
        <LoginButton />
      </div>
      {/* Add more nav content here if needed */}
    </nav>
  );
}
