'use client';

import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';
import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * PrismaticBurst — a volumetric, ray-marched spectral burst WebGL background
 * (ported from the vue-bits OGL component to React). It renders a field of
 * glowing light rays and composites the rays' own brightness into the canvas
 * alpha, so the dark field is transparent and only the coloured light paints.
 * That makes it sit correctly over either a light or a dark page without
 * relying on a blend mode (a masked / isolated stacking context silently
 * neutralises `mix-blend-mode`, which leaves the black field visible).
 *
 * Matches the conventions of the sibling Grainient port: WebGL2 with a silent
 * CSS fallback when unavailable, a ResizeObserver for crisp sizing, a single
 * static frame for reduced-motion users, an IntersectionObserver + page
 * visibility gate so it never burns the GPU off-screen, and full teardown of
 * the RAF, observers, listeners, gradient texture, and WebGL context.
 */

type AnimationType = 'rotate' | 'rotate3d' | 'hover';
type Offset = { x?: number | string; y?: number | string };

export type PrismaticBurstProps = {
  className?: string;
  intensity?: number;
  speed?: number;
  animationType?: AnimationType;
  /** Hex colours sampled as a gradient across each ray; omit for the default rainbow. */
  colors?: string[];
  distort?: number;
  paused?: boolean;
  offset?: Offset;
  hoverDampness?: number;
  rayCount?: number;
  mixBlendMode?: CSSProperties['mixBlendMode'] | 'none';
};

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

uniform float uIntensity;
uniform float uSpeed;
uniform int   uAnimType;
uniform vec2  uMouse;
uniform int   uColorCount;
uniform float uDistort;
uniform vec2  uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int   uRayCount;

float hash21(vec2 p){
    p = floor(p);
    float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
    return fract(f);
}

mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

float layeredNoise(vec2 fragPx){
    vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
    vec2 q = rot30() * p;
    float n = 0.0;
    n += 0.40 * hash21(q);
    n += 0.25 * hash21(q * 2.0 + 17.0);
    n += 0.20 * hash21(q * 4.0 + 47.0);
    n += 0.10 * hash21(q * 8.0 + 113.0);
    n += 0.05 * hash21(q * 16.0 + 191.0);
    return n;
}

vec3 rayDir(vec2 frag, vec2 res, vec2 offset, float dist){
    float focal = res.y * max(dist, 1e-3);
    return normalize(vec3(2.0 * (frag - offset) - res, focal));
}

float edgeFade(vec2 frag, vec2 res, vec2 offset){
    vec2 toC = frag - 0.5 * res - offset;
    float r = length(toC) / (0.5 * min(res.x, res.y));
    float x = clamp(r, 0.0, 1.0);
    float q = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    float s = q * 0.5;
    s = pow(s, 1.5);
    float tail = 1.0 - pow(1.0 - s, 2.0);
    s = mix(s, tail, 0.2);
    float dn = (layeredNoise(frag * 0.15) - 0.5) * 0.0015 * s;
    return clamp(s + dn, 0.0, 1.0);
}

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 sampleGradient(float t){
    t = clamp(t, 0.0, 1.0);
    return texture(uGradient, vec2(t, 0.5)).rgb;
}

vec2 rot2(vec2 v, float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c) * v;
}

float bendAngle(vec3 q, float t){
    float a = 0.8 * sin(q.x * 0.55 + t * 0.6)
            + 0.7 * sin(q.y * 0.50 - t * 0.5)
            + 0.6 * sin(q.z * 0.60 + t * 0.7);
    return a;
}

void main(){
    vec2 frag = gl_FragCoord.xy;
    float t = uTime * uSpeed;
    float jitterAmp = 0.1 * clamp(uNoiseAmount, 0.0, 1.0);
    vec3 dir = rayDir(frag, uResolution, uOffset, 1.0);
    float marchT = 0.0;
    vec3 col = vec3(0.0);
    float n = layeredNoise(frag);
    vec4 c = cos(t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0));
    mat2 M2 = mat2(c.x, c.y, c.z, c.w);
    float amp = clamp(uDistort, 0.0, 50.0) * 0.15;

    mat3 rot3dMat = mat3(1.0);
    if(uAnimType == 1){
      vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
      rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);
    }
    mat3 hoverMat = mat3(1.0);
    if(uAnimType == 2){
      vec2 m = uMouse * 2.0 - 1.0;
      vec3 ang = vec3(m.y * 0.6, m.x * 0.6, 0.0);
      hoverMat = rotY(ang.y) * rotX(ang.x);
    }

    for (int i = 0; i < 44; ++i) {
        vec3 P = marchT * dir;
        P.z -= 2.0;
        float rad = length(P);
        vec3 Pl = P * (10.0 / max(rad, 1e-6));

        if(uAnimType == 0){
            Pl.xz *= M2;
        } else if(uAnimType == 1){
      Pl = rot3dMat * Pl;
        } else {
      Pl = hoverMat * Pl;
        }

        float stepLen = min(rad - 0.3, n * jitterAmp) + 0.1;

        float grow = smoothstep(0.35, 3.0, marchT);
        float a1 = amp * grow * bendAngle(Pl * 0.6, t);
        float a2 = 0.5 * amp * grow * bendAngle(Pl.zyx * 0.5 + 3.1, t * 0.9);
        vec3 Pb = Pl;
        Pb.xz = rot2(Pb.xz, a1);
        Pb.xy = rot2(Pb.xy, a2);

        float rayPattern = smoothstep(
            0.5, 0.7,
            sin(Pb.x + cos(Pb.y) * cos(Pb.z)) *
            sin(Pb.z + sin(Pb.y) * cos(Pb.x + t))
        );

        if (uRayCount > 0) {
            float ang = atan(Pb.y, Pb.x);
            float comb = 0.5 + 0.5 * cos(float(uRayCount) * ang);
            comb = pow(comb, 3.0);
            rayPattern *= smoothstep(0.15, 0.95, comb);
        }

        vec3 spectralDefault = 1.0 + vec3(
            cos(marchT * 3.0 + 0.0),
            cos(marchT * 3.0 + 1.0),
            cos(marchT * 3.0 + 2.0)
        );

        float saw = fract(marchT * 0.25);
        float tRay = saw * saw * (3.0 - 2.0 * saw);
        vec3 userGradient = 2.0 * sampleGradient(tRay);
        vec3 spectral = (uColorCount > 0) ? userGradient : spectralDefault;
        vec3 base = (0.05 / (0.4 + stepLen))
                  * smoothstep(5.0, 0.0, rad)
                  * spectral;

        col += base * rayPattern;
        marchT += stepLen;
    }

    col *= edgeFade(frag, uResolution, uOffset);
    col *= uIntensity;

    // Self-compositing output: the burst's own brightness becomes the alpha, so
    // the black field is genuinely transparent and only the glowing rays paint.
    // Using the max channel as alpha keeps rgb <= a (valid premultiplied alpha),
    // letting the field composite correctly over a light OR dark page without
    // depending on a blend mode (which a masked, isolated stacking context
    // silently neutralises).
    col = clamp(col, 0.0, 1.0);
    float alpha = max(col.r, max(col.g, col.b));
    fragColor = vec4(col, alpha);
}
`;

function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const intVal = parseInt(h, 16);
  if (isNaN(intVal) || (h.length !== 6 && h.length !== 8)) return [1, 1, 1];
  return [((intVal >> 16) & 255) / 255, ((intVal >> 8) & 255) / 255, (intVal & 255) / 255];
}

function toPx(v: number | string | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const num = parseFloat(String(v).trim().replace('px', ''));
  return isNaN(num) ? 0 : num;
}

const ANIM_TYPE: Record<AnimationType, number> = { rotate: 0, rotate3d: 1, hover: 2 };

export function PrismaticBurst({
  className,
  intensity = 2,
  speed = 0.5,
  animationType = 'rotate3d',
  colors,
  distort = 0,
  paused = false,
  offset = { x: 0, y: 0 },
  hoverDampness = 0,
  rayCount = 0,
  mixBlendMode = 'none',
}: PrismaticBurstProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest props mirrored into a ref so the render loop reads current values
  // without tearing down and rebuilding the WebGL context on every change.
  const propsRef = useRef({ intensity, speed, animationType, colors, distort, paused, offset, hoverDampness, rayCount });
  propsRef.current = { intensity, speed, animationType, colors, distort, paused, offset, hoverDampness, rayCount };

  // Serialised colour key so the gradient-syncing effect only re-uploads the
  // texture when the palette actually changes, not on every parent re-render.
  const colorsKey = colors?.join(',') ?? '';

  const programRef = useRef<Program | null>(null);
  const gradTexRef = useRef<Texture | null>(null);
  const glRef = useRef<WebGL2RenderingContext | WebGLRenderingContext | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true, // transparent canvas so the page shows through dark areas
        premultipliedAlpha: true,
        antialias: false,
        // This is a heavy 44-step ray-march run per pixel. It's a soft, blurry,
        // masked ambient field, so it doesn't need retina pixels — rendering at
        // dpr 1 and letting the browser upscale looks identical but quarters the
        // fragment work on hi-dpi screens, which is what keeps the slow tumble
        // smooth (and cuts the high-frequency noise shimmer) instead of stuttery.
        dpr: 1,
      });
    } catch {
      return; // No WebGL2 — the container's CSS background shows instead.
    }

    const gl = renderer.gl;
    glRef.current = gl;
    gl.clearColor(0, 0, 0, 0); // clear to transparent, not opaque black
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    // 1×1 white seed; the colour-sync effect replaces it with the real palette.
    const gradientTex = new Texture(gl, {
      image: new Uint8Array([255, 255, 255, 255]),
      width: 1,
      height: 1,
      generateMipmaps: false,
      flipY: false,
    });
    gradientTex.minFilter = gl.LINEAR;
    gradientTex.magFilter = gl.LINEAR;
    gradientTex.wrapS = gl.CLAMP_TO_EDGE;
    gradientTex.wrapT = gl.CLAMP_TO_EDGE;
    gradTexRef.current = gradientTex;

    const p = propsRef.current;
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uResolution: { value: new Float32Array([1, 1]) },
        uTime: { value: 0 },
        uIntensity: { value: p.intensity },
        uSpeed: { value: p.speed },
        uAnimType: { value: ANIM_TYPE[p.animationType] },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uColorCount: { value: 0 },
        uDistort: { value: p.distort },
        uOffset: { value: new Float32Array([toPx(p.offset?.x), toPx(p.offset?.y)]) },
        uGradient: { value: gradientTex },
        uNoiseAmount: { value: 0.8 },
        uRayCount: { value: Math.max(0, Math.floor(p.rayCount)) },
      },
    });
    programRef.current = program;

    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    const setSize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const res = (program.uniforms.uResolution as { value: Float32Array }).value;
      res[0] = gl.drawingBufferWidth;
      res[1] = gl.drawingBufferHeight;
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(container);
    setSize();

    // Hover-mode steering: track the pointer over the field, normalised 0..1.
    const mouseTarget: [number, number] = [0.5, 0.5];
    const mouseSmooth: [number, number] = [0.5, 0.5];
    const onPointer = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouseTarget[0] = Math.min(Math.max((e.clientX - rect.left) / Math.max(rect.width, 1), 0), 1);
      mouseTarget[1] = Math.min(Math.max((e.clientY - rect.top) / Math.max(rect.height, 1), 0), 1);
    };
    container.addEventListener('pointermove', onPointer, { passive: true });

    // Pause the loop while the field is scrolled out of view.
    let isVisible = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]) isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.01 },
    );
    io.observe(container);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let accumTime = 0;

    const frame = (now: number) => {
      const cur = propsRef.current;
      const dt = Math.max(0, now - last) * 0.001;
      last = now;
      raf = requestAnimationFrame(frame);
      if (!isVisible || document.hidden) return;
      if (!cur.paused) accumTime += dt;

      const tau = 0.02 + Math.max(0, Math.min(1, cur.hoverDampness)) * 0.5;
      const alpha = 1 - Math.exp(-dt / tau);
      mouseSmooth[0] += (mouseTarget[0] - mouseSmooth[0]) * alpha;
      mouseSmooth[1] += (mouseTarget[1] - mouseSmooth[1]) * alpha;
      const m = (program.uniforms.uMouse as { value: Float32Array }).value;
      m[0] = mouseSmooth[0];
      m[1] = mouseSmooth[1];
      (program.uniforms.uTime as { value: number }).value = accumTime;
      renderer.render({ scene: mesh });
    };

    if (reduced) {
      renderer.render({ scene: mesh }); // one static frame, no animation loop
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointermove', onPointer);
      ro.disconnect();
      io.disconnect();
      programRef.current = null;
      gradTexRef.current = null;
      glRef.current = null;
      try {
        if (gradientTex.texture) gl.deleteTexture(gradientTex.texture);
      } catch {
        // texture already gone
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      try {
        container.removeChild(canvas);
      } catch {
        // already detached
      }
    };
  }, []);

  // Push scalar prop changes onto the live uniforms without a context rebuild.
  useEffect(() => {
    const program = programRef.current;
    if (!program) return;
    (program.uniforms.uIntensity as { value: number }).value = intensity;
    (program.uniforms.uSpeed as { value: number }).value = speed;
    (program.uniforms.uAnimType as { value: number }).value = ANIM_TYPE[animationType];
    (program.uniforms.uDistort as { value: number }).value = distort;
    (program.uniforms.uRayCount as { value: number }).value = Math.max(0, Math.floor(rayCount));
    const off = (program.uniforms.uOffset as { value: Float32Array }).value;
    off[0] = toPx(offset?.x);
    off[1] = toPx(offset?.y);
  }, [intensity, speed, animationType, distort, rayCount, offset?.x, offset?.y]);

  // Re-upload the gradient texture whenever the palette changes.
  useEffect(() => {
    const program = programRef.current;
    const gradTex = gradTexRef.current;
    const gl = glRef.current;
    if (!program || !gradTex || !gl) return;

    const list = colorsKey ? colorsKey.split(',') : [];
    if (list.length === 0) {
      (program.uniforms.uColorCount as { value: number }).value = 0;
      return;
    }
    const capped = list.slice(0, 64);
    const data = new Uint8Array(capped.length * 4);
    capped.forEach((hex, i) => {
      const [r, g, b] = hexToRgb01(hex);
      data[i * 4] = Math.round(r * 255);
      data[i * 4 + 1] = Math.round(g * 255);
      data[i * 4 + 2] = Math.round(b * 255);
      data[i * 4 + 3] = 255;
    });
    gradTex.image = data;
    gradTex.width = capped.length;
    gradTex.height = 1;
    gradTex.format = gl.RGBA;
    gradTex.type = gl.UNSIGNED_BYTE;
    gradTex.needsUpdate = true;
    (program.uniforms.uColorCount as { value: number }).value = capped.length;
  }, [colorsKey]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        overflow: 'hidden',
        mixBlendMode: mixBlendMode && mixBlendMode !== 'none' ? (mixBlendMode as CSSProperties['mixBlendMode']) : undefined,
      }}
    />
  );
}
