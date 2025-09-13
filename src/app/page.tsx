import ChatPanel from "@/components/ChatPanel";
import CodeHere from "@/components/CodeHere";

export default function Home() {
  return (
    <div className="flex h-screen w-screen bg-neutral-900 from-slate-200 to-slate-400">
      <aside className="w-[50%] flex flex-col p-4 border-r border-white/20 bg-neutral-900 backdrop-blur-lg font-mono">
        <ChatPanel />
      </aside>
      <div className="flex-1 p-4 font-mono">
        <CodeHere />
      </div>
    </div>
  );
}
