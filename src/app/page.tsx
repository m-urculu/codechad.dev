import EditorPanels from "@/components/EditorPanels";
import NavBar from "@/components/NavBar";
import Background from "@/components/Background/Background";

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Background />
      <NavBar />
      <EditorPanels />
    </div>
  );
}
