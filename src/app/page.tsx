"use client"
import EditorPanels from "@/components/EditorPanels";
import NavBar from "@/components/NavBar";
import Background from "@/components/Background/Background";
import Landing from "@/components/Landing";
import { useEffect, useState } from "react";

export default function Home() {
  const [gpuOk, setGpuOk] = useState(true);
  const [view, setView] = useState<"landing" | "workspace">("landing");
  const [moduleId, setModuleId] = useState<string | null>(null);

  useEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return;
    let gl;
    try {
      const canvas = document.createElement("canvas");
      gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        setGpuOk(false);
        return;
      }
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      let renderer = "";
      if (debugInfo) {
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      } else {
        renderer = gl.getParameter(gl.RENDERER);
      }
      // If renderer string contains these, it's likely software rendering
      if (/swiftshader|software|llvmpipe/i.test(renderer)) {
        setGpuOk(false);
      }
    } catch {
      setGpuOk(false);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {gpuOk && <Background />}
      <NavBar onHome={() => setView("landing")} />
      <div className="relative flex-1 min-h-0">
        {view === "landing" ? (
          <Landing
            onSelect={(id) => {
              setModuleId(id);
              setView("workspace");
            }}
          />
        ) : (
          <EditorPanels moduleId={moduleId} />
        )}
      </div>
    </div>
  );
}
