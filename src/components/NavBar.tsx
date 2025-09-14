"use client";
import React from "react";

export default function NavBar() {
  return (
    <nav className="w-full h-16 flex items-center px-4 bg-neutral-900 border-b border-white/10 shadow-sm">
      {/* Spacer for future nav items */}
      <div className="flex-1" />
      {/* User profile avatar on the right */}
      <div className="flex items-center">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
          {/* Replace with user image if available */}
          <span>M</span>
        </div>
      </div>
      {/* Add more nav content here if needed */}
    </nav>
  );
}
