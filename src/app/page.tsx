import CollapsibleSection from "../components/CollapsibleSection";

export default function Home() {
  return (
    <div className="flex h-screen w-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-gray-100">
      <aside className="w-72 flex flex-col p-4 border-r border-white/10 bg-gray-900/60 backdrop-blur-lg">
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
            <div className="mt-4 w-full bg-white/10 h-2 rounded-full">
              <div className="bg-blue-500 h-2 rounded-full w-1/3" />
            </div>
          </CollapsibleSection>
        </div>
        <div className="mt-auto">
          <CollapsibleSection title="AI Assistance" defaultOpen={false}>
            <p className="text-sm">Chat with an AI tutor.</p>
          </CollapsibleSection>
        </div>
      </aside>
      <main className="flex-1 p-4">
        <textarea
          className="w-full h-full font-mono text-sm p-4 rounded-md border border-white/10 bg-gray-900/70 text-gray-100 placeholder-gray-400 backdrop-blur-md"
          placeholder="Write your code here..."
        />
      </main>
    </div>
  );
}
