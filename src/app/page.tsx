import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";
import NavBar from "@/components/NavBar";

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-900 from-slate-200 to-slate-400 overflow-hidden">
      {/* Main content below NavBar */}
      <NavBar />
      <div className="flex flex-1 min-h-0">
        <aside className="w-[50%] flex flex-col p-4 border-r border-white/20 bg-neutral-900 backdrop-blur-lg font-mono min-h-0">
          <ChatPanel />
        </aside>
        <div className="flex-1 p-4 font-mono min-h-0">
          <CodeHere />
        </div>
      </div>
    </div>
  );
}
