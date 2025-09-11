"use client";
import { useState, ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 text-gray-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-4 py-2 rounded-md bg-gray-800/60 hover:bg-gray-800/80 backdrop-blur-md text-left"
      >
        <span className="font-semibold">{title}</span>
        <span className="text-xl leading-none">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 px-4 py-2 rounded-md bg-gray-800/40 backdrop-blur-md text-sm">
          {children}
        </div>
      )}
    </div>
  );
}

