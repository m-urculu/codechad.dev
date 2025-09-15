"use client";

import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import { useState } from "react";

export default function EditorPanels() {
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [codeCollapsed, setCodeCollapsed] = useState(false);

  // Determine flex classes based on collapse state
  const bothExpanded = !chatCollapsed && !codeCollapsed;
  const chatFlex = bothExpanded ? "flex-1" : (!chatCollapsed ? "flex-1" : "flex-none");
  const codeFlex = bothExpanded ? "flex-1" : (!codeCollapsed ? "flex-1" : "flex-none");
  const transition = "transition-all duration-300 ease-in-out";

  return (
    <div className="flex h-full min-h-0">
      <div className={`flex min-w-0 ${chatFlex} ${transition}`.trim()}>
        <ChatPanel collapsed={chatCollapsed} setCollapsed={setChatCollapsed} />
      </div>
      <div className={`flex min-w-0 ml-auto ${codeFlex} ${transition}`.trim()}>
        <CodeHere collapsed={codeCollapsed} setCollapsed={setCodeCollapsed} />
      </div>
    </div>
  );
}
