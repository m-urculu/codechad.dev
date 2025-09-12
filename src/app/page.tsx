import CollapsibleSection from "../components/CollapsibleSection";
import CodeEditor from "../components/CodeEditor";

export default function Home() {
  return (
    <div className="flex h-screen w-screen bg-neutral-950 bg-[radial-gradient(at_top_left,_rgba(255,0,150,0.2),_transparent),_radial-gradient(at_bottom_right,_rgba(0,200,255,0.2),_transparent)]">
      <aside className="w-1/2 flex flex-col p-4 border-r border-white/20 bg-neutral-950 backdrop-blur-lg">
        <div>
          <CollapsibleSection title="Course Information">
            <p className="text-sm">Overview of the current course.</p>
          </CollapsibleSection>
          <CollapsibleSection title="Learning Tree & Progress">
            <ul className="list-disc pl-4 text-sm">
              <li>Introduction</li>
              <li>Basics</li>
              <li>Advanced</li>
            </ul>
            <div className="mt-4 w-full bg-neutral-700/50 h-2 rounded-full">
              <div className="bg-neutral-900 bg-gradient-to-r from-pink-500/30 via-emerald-500/30 to-sky-500/30 h-2 rounded-full w-1/3" />
            </div>
          </CollapsibleSection>
        </div>
        <div className="mt-auto">
          <CollapsibleSection title="AI Assistance" defaultOpen={false}>
            <p className="text-sm">Chat with an AI tutor.</p>
          </CollapsibleSection>
        </div>
      </aside>
      <main className="w-1/2 p-4">
        <CodeEditor />
      </main>
    </div>
  );
}
