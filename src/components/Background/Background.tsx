"use client";

import React, { useEffect, useState } from "react";
import Fluid from "./Fluid";
import Dither from "./Dither";

// The fluid simulation keeps its velocity, pressure and dye fields in half-float
// render targets — velocity is signed and routinely exceeds 1, so an 8-bit
// target cannot hold it. On the rare context without EXT_color_buffer_float we
// fall back to the original non-simulated wave rather than render nothing.
function supportsFloatTargets(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    const ok = !!gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/**
 * `calm` is for the workspace, where the background stops being the thing you are looking
 * at and starts being something behind the thing you are looking at.
 *
 * Two changes, and they are different in kind:
 *
 *   * The pointer no longer stirs the fluid. In the workspace the pointer is working —
 *     moving between the editor, the console and the chat — and having smoke billow out
 *     from under every one of those movements is motion in the corner of the eye while
 *     someone is trying to read an error message.
 *   * Everything slows to a third of real time. Not stopped: a static backdrop reads as a
 *     screenshot, and the drift is what keeps the page feeling alive. Slow enough that
 *     nothing in it competes for attention at the speed a person reads.
 */
export default function Background({ calm = false }: { calm?: boolean }) {
  // null until probed, so the server and the first client render agree.
  const [fluid, setFluid] = useState<boolean | null>(null);
  useEffect(() => setFluid(supportsFloatTargets()), []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        pointerEvents: "none",
      }}
    >
      {fluid === null ? null : fluid ? (
        <Fluid {...(calm ? { splatForce: 0, timeScale: 0.33 } : {})} />
      ) : (
        <Dither
          waveColor={[0.4, 0.4, 0.4]}
          disableAnimation={false}
          enableMouseInteraction={false}
          colorNum={20}
          waveAmplitude={0.4}
          waveFrequency={3}
          // The fallback has no simulation to slow, only the wave itself.
          waveSpeed={calm ? 0.017 : 0.05}
        />
      )}
    </div>
  );
}
