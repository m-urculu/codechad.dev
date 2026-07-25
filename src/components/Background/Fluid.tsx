"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import "./Dither.css";

// Mouse-driven smoke, simulated rather than faked.
//
// The previous background (Dither.jsx) drew a scrolling FBM field and pushed a
// smoothstep dent into it under the cursor. That reads as a spotlight, not as
// smoke: the dent has no memory, so nothing is left behind once the pointer moves
// on. Here the pointer instead injects momentum into a real velocity field, and
// the smoke is carried by it — swirls persist, wakes trail, and eddies keep
// turning after the pointer has gone.
//
// The solver is Stam's "Stable Fluids" on the GPU, the arrangement popularised by
// Pavel Dobryakov's WebGL fluid simulation:
//
//   force  ->  vorticity confinement  ->  divergence  ->  pressure (Jacobi)
//          ->  gradient subtract      ->  advect velocity  ->  advect dye
//
// Every stage is a full-screen pass over a ping-pong pair of half-float targets.
// Semi-Lagrangian advection is unconditionally stable, so a dropped frame or a
// backgrounded tab can never blow the simulation up.
//
// Rendering is deliberately unchanged from Dither: grayscale, Bayer-dithered and
// quantized to a handful of levels. The physics is new; the look is not.

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
// Velocity is stored in SCREEN HEIGHTS PER SECOND, for both components. UV space
// is anisotropic on a non-square canvas (uv.x spans `aspect` height-units), so
// working in height-units is what keeps a diagonal flick diagonal. Two rules
// follow, and they are the only places aspect appears:
//
//   uv offset from a velocity :  duv = v * dt * vec2(1.0 / aspect, 1.0)
//   height-units from a uv    :  p.x *= aspect
//
// The simulation grid is allocated at the canvas aspect ratio, so its cells are
// square and the finite differences below need no correction of their own.

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HEAD = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
`;

// Classic Perlin noise, carried over from Dither so the smoke keeps its grain.
const NOISE = /* glsl */ `
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}
`;

// --- Simulation passes ------------------------------------------------------

// Semi-Lagrangian advection: trace backwards along the velocity field and read
// what was there. Bilinear filtering does the interpolation for free.
const ADVECT = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform float uAspect;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * vec2(1.0 / uAspect, 1.0);
  fragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}
`;

// Curl of the velocity field: dv/dx - du/dy. Feeds vorticity confinement.
const CURL = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  fragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement. A coarse grid bleeds angular momentum every advection
// step, so eddies flatten out within a second or two; this pushes energy back
// into whatever rotation survived, along N x w. It is what makes the wake curl
// instead of merely spreading.
const VORTICITY = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y *= -1.0;

  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  fragColor = vec4(clamp(vel, -8.0, 8.0), 0.0, 1.0);
}
`;

// Ambient drift, so the smoke breathes when nobody is touching it.
//
// The forcing is the curl of a scrolling noise potential, which is divergence
// free by construction: the pressure solve below has nothing to remove, so the
// motion survives projection intact instead of being fought every frame.
const AMBIENT = /* glsl */ `${HEAD}
${NOISE}
uniform sampler2D uVelocity;
uniform float uTime;
uniform float uDt;
uniform float uForce;
uniform float uScale;
uniform float uAspect;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y) * uScale + vec2(0.0, uTime * 0.02);
  const float e = 0.05;
  float nT = cnoise(p + vec2(0.0, e));
  float nB = cnoise(p - vec2(0.0, e));
  float nR = cnoise(p + vec2(e, 0.0));
  float nL = cnoise(p - vec2(e, 0.0));
  vec2 w = vec2(nT - nB, -(nR - nL)) / (2.0 * e);

  vec2 vel = texture(uVelocity, vUv).xy + w * uForce * uDt;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

// How much the field is compressing at each cell — the right-hand side of the
// pressure Poisson equation. Walls reflect, so nothing flows out of the canvas.
const DIVERGENCE = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;

  vec2 C = texture(uVelocity, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) { L = -C.x; }
  if (vUv.x + uTexel.x > 1.0) { R = -C.x; }
  if (vUv.y - uTexel.y < 0.0) { B = -C.y; }
  if (vUv.y + uTexel.y > 1.0) { T = -C.y; }

  fragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);
}
`;

// One Jacobi relaxation of the pressure Poisson equation. Run ~20 times.
const PRESSURE = /* glsl */ `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}
`;

// Subtracting the pressure gradient is what makes the field incompressible: it
// removes exactly the part of the motion that was piling fluid up. The 0.5
// matches the 0.5 in DIVERGENCE — the two have to use the same finite
// difference or the projection under- or over-corrects.
const GRADIENT = /* glsl */ `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);

  // Free-slip walls: no flow through the edge, tangential motion untouched.
  if (vUv.x < uTexel.x || vUv.x > 1.0 - uTexel.x) { vel.x = 0.0; }
  if (vUv.y < uTexel.y || vUv.y > 1.0 - uTexel.y) { vel.y = 0.0; }

  fragColor = vec4(vel, 0.0, 1.0);
}
`;

// A Gaussian blob added to whatever field is bound — velocity for a shove, dye
// for a puff. Additive, so overlapping strokes accumulate.
const SPLAT = /* glsl */ `${HEAD}
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;
uniform float uAspect;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  fragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}
`;

// Multiply a field by a constant. Used to bleed the pressure field between
// frames, which keeps the Jacobi solve warm without letting it drift.
const CLEAR = /* glsl */ `${HEAD}
uniform sampler2D uTexture;
uniform float uValue;
void main() {
  fragColor = uValue * texture(uTexture, vUv);
}
`;

// The smoke source. Dye dissipates, so without replenishment the screen fades to
// black; feeding it the same scrolling FBM that Dither drew directly means the
// background settles back into its familiar texture a couple of seconds after
// being stirred, rather than staying permanently smeared.
const SOURCE = /* glsl */ `${HEAD}
${NOISE}
uniform sampler2D uDye;
uniform float uTime;
uniform float uDt;
uniform float uRate;
uniform float uAspect;
uniform float uFrequency;
uniform float uAmplitude;
uniform float uSpeed;

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= uFrequency;
    amp *= uAmplitude;
  }
  return value;
}

void main() {
  vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
  float f = fbm(p + fbm(p - uTime * uSpeed));
  fragColor = vec4(vec3(texture(uDye, vUv).x + f * uRate * uDt), 1.0);
}
`;

// Presentation, unchanged from Dither: snap to a pixel grid, tint, then Bayer
// dither and quantize. The dithering is doing double duty here — it also hides
// the fact that the dye buffer is far coarser than the canvas.
const DISPLAY = /* glsl */ `${HEAD}
uniform sampler2D uDye;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uColorNum;
uniform vec3 uColor;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

void main() {
  vec2 blockCoord = floor(gl_FragCoord.xy / uPixelSize) * uPixelSize;
  vec2 uv = blockCoord / uResolution;

  float f = texture(uDye, uv).x;
  vec3 col = mix(vec3(0.0), uColor, f);

  ivec2 bc = ivec2(mod(floor(gl_FragCoord.xy / uPixelSize), 8.0));
  float threshold = bayerMatrix8x8[bc.y * 8 + bc.x] - 0.25;
  float stepv = 1.0 / (uColorNum - 1.0);
  col += threshold * stepv;
  col = clamp(col - 0.2, 0.0, 1.0);
  col = floor(col * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);

  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  return target;
}

// A ping-pong pair: every pass reads `read` and writes `write`, then swaps. A
// fragment shader cannot sample the target it is drawing into.
class DoubleTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  constructor(w: number, h: number) {
    this.read = makeTarget(w, h);
    this.write = makeTarget(w, h);
  }
  swap() {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }
  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

type Splat = { x: number; y: number; dx: number; dy: number };

export type FluidConfig = {
  simResolution: number;
  dyeResolution: number;
  pressureIterations: number;
  velocityDissipation: number;
  densityDissipation: number;
  pressureDecay: number;
  curlStrength: number;
  ambientForce: number;
  ambientScale: number;
  splatForce: number;
  splatRadius: number;
  splatDye: number;
  sourceRate: number;
  waveFrequency: number;
  waveAmplitude: number;
  waveSpeed: number;
  colorNum: number;
  pixelSize: number;
  color: [number, number, number];
  animate: boolean;
};

class FluidSim {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private quad: THREE.Mesh;
  private geometry = new THREE.PlaneGeometry(2, 2);

  private velocity!: DoubleTarget;
  private dye!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: THREE.WebGLRenderTarget;
  private curl!: THREE.WebGLRenderTarget;

  private simTexel = new THREE.Vector2();
  private aspect = 1;
  private time = 0;

  private m: {
    advect: THREE.ShaderMaterial;
    curl: THREE.ShaderMaterial;
    vorticity: THREE.ShaderMaterial;
    ambient: THREE.ShaderMaterial;
    divergence: THREE.ShaderMaterial;
    pressure: THREE.ShaderMaterial;
    gradient: THREE.ShaderMaterial;
    splat: THREE.ShaderMaterial;
    clear: THREE.ShaderMaterial;
    source: THREE.ShaderMaterial;
    display: THREE.ShaderMaterial;
  };

  constructor(renderer: THREE.WebGLRenderer, public config: FluidConfig) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(this.geometry);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const u = (v: unknown) => ({ value: v }) as THREE.IUniform;
    this.m = {
      advect: pass(ADVECT, {
        uVelocity: u(null), uSource: u(null), uDt: u(0),
        uDissipation: u(0), uAspect: u(1),
      }),
      curl: pass(CURL, { uVelocity: u(null), uTexel: u(new THREE.Vector2()) }),
      vorticity: pass(VORTICITY, {
        uVelocity: u(null), uCurl: u(null), uTexel: u(new THREE.Vector2()),
        uCurlStrength: u(0), uDt: u(0),
      }),
      ambient: pass(AMBIENT, {
        uVelocity: u(null), uTime: u(0), uDt: u(0),
        uForce: u(0), uScale: u(1), uAspect: u(1),
      }),
      divergence: pass(DIVERGENCE, { uVelocity: u(null), uTexel: u(new THREE.Vector2()) }),
      pressure: pass(PRESSURE, {
        uPressure: u(null), uDivergence: u(null), uTexel: u(new THREE.Vector2()),
      }),
      gradient: pass(GRADIENT, {
        uPressure: u(null), uVelocity: u(null), uTexel: u(new THREE.Vector2()),
      }),
      splat: pass(SPLAT, {
        uTarget: u(null), uPoint: u(new THREE.Vector2()), uColor: u(new THREE.Vector3()),
        uRadius: u(0.01), uAspect: u(1),
      }),
      clear: pass(CLEAR, { uTexture: u(null), uValue: u(1) }),
      source: pass(SOURCE, {
        uDye: u(null), uTime: u(0), uDt: u(0), uRate: u(0), uAspect: u(1),
        uFrequency: u(2), uAmplitude: u(0.4), uSpeed: u(0.05),
      }),
      display: pass(DISPLAY, {
        uDye: u(null), uResolution: u(new THREE.Vector2()),
        uPixelSize: u(1), uColorNum: u(8), uColor: u(new THREE.Color()),
      }),
    };
  }

  resize(width: number, height: number) {
    this.velocity?.dispose();
    this.dye?.dispose();
    this.pressure?.dispose();
    this.divergence?.dispose();
    this.curl?.dispose();

    this.aspect = width / Math.max(height, 1);

    // Square cells: allocate at the canvas aspect ratio so the finite
    // differences in the solver measure the same distance in x and y.
    const simH = Math.max(32, Math.round(this.config.simResolution));
    const simW = Math.max(32, Math.round(simH * this.aspect));
    const dyeH = Math.max(32, Math.round(this.config.dyeResolution));
    const dyeW = Math.max(32, Math.round(dyeH * this.aspect));

    this.velocity = new DoubleTarget(simW, simH);
    this.pressure = new DoubleTarget(simW, simH);
    this.divergence = makeTarget(simW, simH);
    this.curl = makeTarget(simW, simH);
    this.dye = new DoubleTarget(dyeW, dyeH);

    this.simTexel.set(1 / simW, 1 / simH);
    this.m.display.uniforms.uResolution.value.set(width, height);
  }

  private blit(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  // Push momentum (and a little dye) into the field at a point. `dx`/`dy` are
  // in height-units; see the units note at the top.
  splat({ x, y, dx, dy }: Splat) {
    const { splat } = this.m;
    const c = this.config;

    splat.uniforms.uAspect.value = this.aspect;
    splat.uniforms.uRadius.value = c.splatRadius;
    (splat.uniforms.uPoint.value as THREE.Vector2).set(x, y);

    (splat.uniforms.uColor.value as THREE.Vector3).set(dx, dy, 0);
    splat.uniforms.uTarget.value = this.velocity.read.texture;
    this.blit(splat, this.velocity.write);
    this.velocity.swap();

    if (c.splatDye > 0) {
      const amount = Math.min(Math.hypot(dx, dy) * c.splatDye, c.splatDye);
      (splat.uniforms.uColor.value as THREE.Vector3).set(amount, amount, amount);
      splat.uniforms.uTarget.value = this.dye.read.texture;
      this.blit(splat, this.dye.write);
      this.dye.swap();
    }
  }

  step(dt: number) {
    const c = this.config;
    const { m } = this;
    if (c.animate) this.time += dt;

    // --- forces ---
    if (c.ambientForce > 0) {
      m.ambient.uniforms.uVelocity.value = this.velocity.read.texture;
      m.ambient.uniforms.uTime.value = this.time;
      m.ambient.uniforms.uDt.value = dt;
      m.ambient.uniforms.uForce.value = c.ambientForce;
      m.ambient.uniforms.uScale.value = c.ambientScale;
      m.ambient.uniforms.uAspect.value = this.aspect;
      this.blit(m.ambient, this.velocity.write);
      this.velocity.swap();
    }

    m.curl.uniforms.uVelocity.value = this.velocity.read.texture;
    (m.curl.uniforms.uTexel.value as THREE.Vector2).copy(this.simTexel);
    this.blit(m.curl, this.curl);

    m.vorticity.uniforms.uVelocity.value = this.velocity.read.texture;
    m.vorticity.uniforms.uCurl.value = this.curl.texture;
    (m.vorticity.uniforms.uTexel.value as THREE.Vector2).copy(this.simTexel);
    m.vorticity.uniforms.uCurlStrength.value = c.curlStrength;
    m.vorticity.uniforms.uDt.value = dt;
    this.blit(m.vorticity, this.velocity.write);
    this.velocity.swap();

    // --- projection: make the field divergence free ---
    m.divergence.uniforms.uVelocity.value = this.velocity.read.texture;
    (m.divergence.uniforms.uTexel.value as THREE.Vector2).copy(this.simTexel);
    this.blit(m.divergence, this.divergence);

    m.clear.uniforms.uTexture.value = this.pressure.read.texture;
    m.clear.uniforms.uValue.value = c.pressureDecay;
    this.blit(m.clear, this.pressure.write);
    this.pressure.swap();

    m.pressure.uniforms.uDivergence.value = this.divergence.texture;
    (m.pressure.uniforms.uTexel.value as THREE.Vector2).copy(this.simTexel);
    for (let i = 0; i < c.pressureIterations; i++) {
      m.pressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.blit(m.pressure, this.pressure.write);
      this.pressure.swap();
    }

    m.gradient.uniforms.uPressure.value = this.pressure.read.texture;
    m.gradient.uniforms.uVelocity.value = this.velocity.read.texture;
    (m.gradient.uniforms.uTexel.value as THREE.Vector2).copy(this.simTexel);
    this.blit(m.gradient, this.velocity.write);
    this.velocity.swap();

    // --- transport ---
    m.advect.uniforms.uAspect.value = this.aspect;
    m.advect.uniforms.uDt.value = dt;

    m.advect.uniforms.uVelocity.value = this.velocity.read.texture;
    m.advect.uniforms.uSource.value = this.velocity.read.texture;
    m.advect.uniforms.uDissipation.value = c.velocityDissipation;
    this.blit(m.advect, this.velocity.write);
    this.velocity.swap();

    m.advect.uniforms.uVelocity.value = this.velocity.read.texture;
    m.advect.uniforms.uSource.value = this.dye.read.texture;
    m.advect.uniforms.uDissipation.value = c.densityDissipation;
    this.blit(m.advect, this.dye.write);
    this.dye.swap();

    // --- replenish the smoke ---
    m.source.uniforms.uDye.value = this.dye.read.texture;
    m.source.uniforms.uTime.value = this.time;
    m.source.uniforms.uDt.value = dt;
    m.source.uniforms.uRate.value = c.sourceRate;
    m.source.uniforms.uAspect.value = this.aspect;
    m.source.uniforms.uFrequency.value = c.waveFrequency;
    m.source.uniforms.uAmplitude.value = c.waveAmplitude;
    m.source.uniforms.uSpeed.value = c.waveSpeed;
    this.blit(m.source, this.dye.write);
    this.dye.swap();
  }

  render() {
    const c = this.config;
    const u = this.m.display.uniforms;
    u.uDye.value = this.dye.read.texture;
    u.uPixelSize.value = c.pixelSize;
    u.uColorNum.value = c.colorNum;
    (u.uColor.value as THREE.Color).setRGB(...c.color);
    this.blit(this.m.display, null);
  }

  dispose() {
    this.velocity?.dispose();
    this.dye?.dispose();
    this.pressure?.dispose();
    this.divergence?.dispose();
    this.curl?.dispose();
    this.geometry.dispose();
    Object.values(this.m).forEach((mat) => mat.dispose());
  }
}

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------

function Simulation({ config }: { config: FluidConfig }) {
  const { gl, size } = useThree();
  const simRef = useRef<FluidSim | null>(null);
  const splats = useRef<Splat[]>([]);

  useEffect(() => {
    const sim = new FluidSim(gl, config);
    simRef.current = sim;
    return () => {
      simRef.current = null;
      sim.dispose();
    };
    // The sim is created once; `config` is read live through the ref below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    if (simRef.current) simRef.current.config = config;
  }, [config]);

  // Drawing-buffer pixels, not CSS pixels: the display pass works in
  // gl_FragCoord, which is in buffer space, and the canvas runs at dpr 0.5.
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    simRef.current?.resize(size.width * dpr, size.height * dpr);
  }, [gl, size.width, size.height]);

  // The background sits behind the app at pointer-events: none, so it can never
  // receive pointer events itself — the listener has to be on the window. (This
  // is why the old Dither's mouse interaction never actually fired.)
  useEffect(() => {
    const prev = { x: 0, y: 0, valid: false };

    function onMove(e: PointerEvent) {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      if (prev.valid) {
        const dx = (x - prev.x) * config.splatForce * (size.width / Math.max(size.height, 1));
        const dy = (y - prev.y) * config.splatForce;
        // Ignore the teleport that follows a tab switch or a window jump.
        if (Math.hypot(dx, dy) < config.splatForce * 0.5) {
          splats.current.push({ x, y, dx, dy });
          if (splats.current.length > 12) splats.current.shift();
        }
      }
      prev.x = x;
      prev.y = y;
      prev.valid = true;
    }
    function onLeave() {
      prev.valid = false;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [config.splatForce, size.width, size.height]);

  useFrame((_state, delta) => {
    const sim = simRef.current;
    if (!sim) return;

    // Clamp: a backgrounded tab or a long GC pause hands back a huge delta, and
    // one giant advection step would smear the whole field in a single frame.
    const dt = Math.min(delta, 1 / 30);

    for (const s of splats.current) sim.splat(s);
    splats.current.length = 0;

    sim.step(dt);
    sim.render();
  }, 1); // priority > 0: r3f hands the render loop over, we present ourselves

  return null;
}

export const DEFAULT_FLUID_CONFIG: FluidConfig = {
  simResolution: 160,
  dyeResolution: 512,
  pressureIterations: 20,
  velocityDissipation: 0.25,
  densityDissipation: 0.7,
  pressureDecay: 0.8,
  curlStrength: 22,
  ambientForce: 0.06,
  ambientScale: 2.2,
  splatForce: 5,
  splatRadius: 0.008,
  splatDye: 0.08,
  sourceRate: 0.7,
  waveFrequency: 3,
  waveAmplitude: 0.4,
  waveSpeed: 0.05,
  colorNum: 20,
  pixelSize: 1,
  color: [0.4, 0.4, 0.4],
  animate: true,
};

export default function Fluid(props: Partial<FluidConfig>) {
  const reduced = useReducedMotion();

  // Reduced motion keeps the smoke — it is texture, not information — but stops
  // it from drifting and from reacting to the pointer.
  const effective: FluidConfig = useMemo(() => {
    const config = { ...DEFAULT_FLUID_CONFIG, ...props };
    return reduced
      ? { ...config, animate: false, ambientForce: 0, splatForce: 0, curlStrength: 0 }
      : config;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, JSON.stringify(props)]);

  return (
    <Canvas
      className="dither-container"
      frameloop="always"
      dpr={0.5}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
    >
      <Simulation config={effective} />
    </Canvas>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
