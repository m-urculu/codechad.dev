"use client";

import React from "react";
// import Galaxy from "./Galaxy";
import Dither from "./Dither";

export default function Background() {
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
      <Dither
        waveColor={[.4, .4, .4]}
        disableAnimation={false}
        enableMouseInteraction={true}
        mouseRadius={0.3}
        colorNum={20}
        waveAmplitude={0.4}
        waveFrequency={3}
        waveSpeed={0.005}
      />
    </div>
    //   <Galaxy
    //     mouseRepulsion={true}
    //     mouseInteraction={true}
    //     density={10}
    //     glowIntensity={0.2}
    //     saturation={0}
    //     hueShift={0}
    //   />
    // </div>
  );
}
