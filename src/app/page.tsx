"use client"
import EditorPanels from "@/components/EditorPanels";
import NavBar from "@/components/NavBar";
import Background from "@/components/Background/Background";
import Landing, { type RoadmapSummary } from "@/components/Landing";
import CourseSettings from "@/components/CourseSettings";
import FeedbackButton from "@/components/FeedbackButton";
import AccountSettings from "@/components/AccountSettings";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useClientValue } from "@/lib/useClientValue";

// False on software renderers (and with no WebGL at all), where the animated
// background would crawl. Probed once, in the browser.
function hasHardwareGpu(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer: string = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    // If the renderer string contains these, it is likely software rendering.
    return !/swiftshader|software|llvmpipe/i.test(renderer);
  } catch {
    return false;
  }
}


export default function Home() {
  const gpuOk = useClientValue(hasHardwareGpu, true);
  const [view, setView] = useState<"landing" | "workspace" | "settings" | "account">("landing");
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  // Set only when a career path is STARTED from the landing page. Resuming one needs
  // nothing here — the stored tree already is the path.
  const [pathId, setPathId] = useState<string | null>(null);
  const [settingsCourse, setSettingsCourse] = useState<RoadmapSummary | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    // When the WebGL background is disabled (software renderers), fall back to a static
    // dark base so the white-text UI stays readable. Never applied when the animation is
    // active — the Background layer sits at z-index -1, and an opaque wrapper background
    // would paint over it.
    //
    // The background was switched off entirely for one OAuth review round, to test
    // whether it was why Google's checker reported the page as unreadable. The
    // review came back with the same findings — and with one that had previously
    // cleared — so it is not the cause, which is what measuring it had already said.
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden ${
        gpuOk ? "" : "bg-[radial-gradient(ellipse_at_top,#0b1224_0%,#050810_65%)]"
      }`}
    >
      {/* Calm in the workspace: no pointer interaction, a third of the speed. The
          background is decoration on the landing page and a distraction next to a lesson. */}
      {gpuOk && <Background calm={view === "workspace"} />}
      <NavBar
        onHome={() => setView("landing")}
        onOpenAccount={() => setView("account")}
        feedbackContext={{ view, module: moduleId, courseId }}
      />
      <div className="relative flex-1 min-h-0">
        {view === "landing" ? (
          <Landing
            onSelect={(id, cid, pid) => {
              setModuleId(id);
              setCourseId(cid ?? null);
              setPathId(pid ?? null);
              setView("workspace");
            }}
            onSettings={(course) => {
              setSettingsCourse(course);
              setView("settings");
            }}
          />
        ) : view === "account" ? (
          <AccountSettings onBack={() => setView("landing")} />
        ) : view === "settings" && settingsCourse ? (
          <CourseSettings
            course={settingsCourse}
            userId={userId}
            onBack={() => setView("landing")}
            onOpen={(id, cid) => {
              setModuleId(id);
              setCourseId(cid);
              setPathId(null); // an existing course carries its own tree
              setView("workspace");
            }}
            onDeleted={() => {
              setSettingsCourse(null);
              setView("landing");
            }}
          />
        ) : (
          <EditorPanels moduleId={moduleId} courseId={courseId} pathId={pathId} />
        )}
      </div>
      {/* Feedback, floating bottom-right — DESKTOP ONLY. The phone gets the same
          control in the nav instead (NavBar), where it cannot collide with the
          chat composer that owns the bottom edge of a small screen. */}
      <div className="hidden md:block">
        <FeedbackButton
          context={{ view, module: moduleId, courseId }}
          placement="floating"
        />
      </div>
    </div>
  );
}
