import EditorPanels from "@/components/EditorPanels";
import NavBar from "@/components/NavBar";

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-900 from-slate-200 to-slate-400 overflow-hidden">
      <NavBar />
      <EditorPanels />
    </div>
  );
}
