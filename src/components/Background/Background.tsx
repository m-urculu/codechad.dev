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

export default function Background() {
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
        <Fluid />
      ) : (
        <Dither
          waveColor={[0.4, 0.4, 0.4]}
          disableAnimation={false}
          enableMouseInteraction={false}
          colorNum={20}
          waveAmplitude={0.4}
          waveFrequency={3}
          waveSpeed={0.05}
        />
      )}
    </div>
  );
}
