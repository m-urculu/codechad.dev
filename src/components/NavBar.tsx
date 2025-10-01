"use client";

import React from "react";
import { LoginButton } from "./LoginButton";

export default function NavBar() {
  return (
    <nav className="w-full h-16 flex items-center px-4 border-b border-white/50 shadow-sm">
      {/* Cool project title on the left */}
      <div className="flex items-center min-w-[220px]">
        <span className="flex space-x-[10px] text-white text-xl font-extrabold tracking-tight drop-shadow-lg select-none">
         <p>CodePath.AI</p><p className="text-sm font-thin">(alpha)</p>
        </span>
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
