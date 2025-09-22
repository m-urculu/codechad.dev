"use client";

import React from "react";
import { LoginButton } from "./LoginButton";

export default function NavBar() {
  return (
    <nav className="w-full h-16 flex items-center px-4 border-b border-white/50 shadow-sm">
      {/* Spacer for future nav items */}
      <div className="flex-1" />
      {/* User profile avatar on the right */}
      <div className="flex items-center mr-[50px]">
        <LoginButton />
      </div>
      {/* Add more nav content here if needed */}
    </nav>
  );
}
