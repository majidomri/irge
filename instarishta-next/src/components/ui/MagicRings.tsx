'use client';
import { useEffect, useRef } from 'react';

// ogl's Triangle supplies a vec2 `position` that already covers the viewport,
// so this is a pass-through. three injected projectionMatrix/modelViewMatrix
// and a vec3 position; neither is needed for a fullscreen shader, and the
// fragment shader below reads gl_FragCoord and uResolution rather than a varying.
const vertexShader = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const fragmentShader = `
precision highp float;
uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
uniform vec2 uResolution, uMouse;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;
const float HP = 1.5707963;
const float CYCLE = 3.45;
float fade(float t) {
  return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);
}
float ring(vec2 p, float ri, float cut, float t0, float px) {
  float t = mod(uTime + t0, CYCLE);
  float r = ri + t / CYCLE * uScaleRate;
  float d = abs(length(p) - r);
  float a = atan(abs(p.y), abs(p.x)) / HP;
  float th = max(1.0 - a, 0.5) * px * uLineThickness;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r;
  return h * exp(-uAttenuation * d) * fade(t);
}
void main() {
  float px = 1.0 / min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;
  float cr = cos(uRotation), sr = sin(uRotation);
  p = mat2(cr, -sr, sr, cr) * p;
  p -= uMouse * uMouseInfluence;
  float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;
  p /= sc;
  vec3 c = vec3(0.0);
  float rcf = max(float(uRingCount) - 1.0, 1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uRingCount) break;
    float fi = float(i);
    vec2 pr = p - fi * uParallax * uMouse;
    vec3 rc = mix(uColor, uColorTwo, fi / rcf);
    c = mix(c, rc, vec3(ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px)));
  }
  c *= 1.0 + uBurst * 2.0;
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uNoiseAmount;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)) * uOpacity);
}`;

interface MagicRingsProps {
  color?: string;
  colorTwo?: string;
  speed?: number;
  ringCount?: number;
  attenuation?: number;
  lineThickness?: number;
  baseRadius?: number;
  radiusStep?: number;
  scaleRate?: number;
  opacity?: number;
  blur?: number;
  noiseAmount?: number;
  rotation?: number;
  ringGap?: number;
  fadeIn?: number;
  fadeOut?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  hoverScale?: number;
  parallax?: number;
  clickBurst?: boolean;
}

export default function MagicRings({
  color = '#006241',
  colorTwo = '#00A86B',
  speed = 1,
  ringCount = 5,
  attenuation = 10,
  lineThickness = 2,
  baseRadius = 0.35,
  radiusStep = 0.1,
  scaleRate = 0.1,
  opacity = 1,
  blur = 0,
  noiseAmount = 0.08,
  rotation = 0,
  ringGap = 1.5,
  fadeIn = 0.7,
  fadeOut = 0.5,
  followMouse = false,
  mouseInfluence = 0.2,
  hoverScale = 1.2,
  parallax = 0.05,
  clickBurst = false,
}: MagicRingsProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef<Required<MagicRingsProps> | null>(null);
  const mouseRef = useRef([0, 0]);
  const smoothMouseRef = useRef([0, 0]);
  const hoverAmountRef = useRef(0);
  const isHoveredRef = useRef(false);
  const burstRef = useRef(0);

  propsRef.current = {
    color, colorTwo, speed, ringCount, attenuation, lineThickness,
    baseRadius, radiusStep, scaleRate, opacity, blur, noiseAmount,
    rotation, ringGap, fadeIn, fadeOut, followMouse, mouseInfluence,
    hoverScale, parallax, clickBurst,
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // A continuously animating fullscreen shader is exactly what
    // prefers-reduced-motion is asking about, and CSS cannot reach a WebGL
    // render loop — the media query in globals.css stops every animation on
    // the page except this one. Returning before the dynamic import also
    // means the ogl chunk is never fetched for these visitors.
    if (typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let cancelled = false;
    let frameId: number;
    let cleanupFn: (() => void) | undefined;

    /**
     * ogl, not three.
     *
     * This is a fullscreen shader quad — one program, one triangle, no scene
     * graph — and three.js charged 714 KB for it in a lazily-loaded chunk.
     * ogl does the same job in a fraction of that and was already a dependency,
     * driving the identical pattern in EvilEye. The import stays dynamic: the
     * rings only ever appear while a voice note is playing, so nobody who does
     * not press play should download a WebGL library at all.
     */
    import('ogl').then(({ Renderer, Program, Mesh, Triangle, Color }) => {
      if (cancelled) return;

      let renderer: InstanceType<typeof Renderer>;
      try {
        renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
      } catch { return; }

      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      mount.appendChild(gl.canvas);

      // ogl reads each uniform's real GLSL type from the compiled program, so
      // plain numbers and arrays are enough — no Vector2/Color wrappers.
      const uniforms = {
        uTime: { value: 0 }, uAttenuation: { value: 0 },
        uResolution: { value: [0, 0] },
        uColor: { value: new Color(propsRef.current!.color) },
        uColorTwo: { value: new Color(propsRef.current!.colorTwo) },
        uLineThickness: { value: 0 }, uBaseRadius: { value: 0 },
        uRadiusStep: { value: 0 }, uScaleRate: { value: 0 },
        uRingCount: { value: 0 }, uOpacity: { value: 1 },
        uNoiseAmount: { value: 0 }, uRotation: { value: 0 },
        uRingGap: { value: 1.6 }, uFadeIn: { value: 0.5 }, uFadeOut: { value: 0.75 },
        uMouse: { value: [0, 0] },
        uMouseInfluence: { value: 0 }, uHoverAmount: { value: 0 },
        uHoverScale: { value: 1 }, uParallax: { value: 0 }, uBurst: { value: 0 },
      };

      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms,
        transparent: true,
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

      const resize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        const dpr = Math.min(window.devicePixelRatio, 2);
        renderer.dpr = dpr;
        renderer.setSize(w, h);
        // The shader divides gl_FragCoord by this, so it must be the drawing
        // buffer size rather than the CSS size.
        uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
      };
      resize();
      window.addEventListener('resize', resize);
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      const onMouseMove = (e: MouseEvent) => {
        const rect = mount.getBoundingClientRect();
        mouseRef.current[0] = (e.clientX - rect.left) / rect.width - 0.5;
        mouseRef.current[1] = -((e.clientY - rect.top) / rect.height - 0.5);
      };
      const onMouseEnter = () => { isHoveredRef.current = true; };
      const onMouseLeave = () => { isHoveredRef.current = false; mouseRef.current[0] = 0; mouseRef.current[1] = 0; };
      const onClick = () => { burstRef.current = 1; };

      mount.addEventListener('mousemove', onMouseMove);
      mount.addEventListener('mouseenter', onMouseEnter);
      mount.addEventListener('mouseleave', onMouseLeave);
      mount.addEventListener('click', onClick);

      const animate = (t: number) => {
        frameId = requestAnimationFrame(animate);
        const p = propsRef.current!;
        smoothMouseRef.current[0] += (mouseRef.current[0] - smoothMouseRef.current[0]) * 0.08;
        smoothMouseRef.current[1] += (mouseRef.current[1] - smoothMouseRef.current[1]) * 0.08;
        hoverAmountRef.current += ((isHoveredRef.current ? 1 : 0) - hoverAmountRef.current) * 0.08;
        burstRef.current *= 0.95;
        if (burstRef.current < 0.001) burstRef.current = 0;

        uniforms.uTime.value = t * 0.001 * p.speed;
        uniforms.uAttenuation.value = p.attenuation;
        uniforms.uColor.value.set(p.color);
        uniforms.uColorTwo.value.set(p.colorTwo);
        uniforms.uLineThickness.value = p.lineThickness;
        uniforms.uBaseRadius.value = p.baseRadius;
        uniforms.uRadiusStep.value = p.radiusStep;
        uniforms.uScaleRate.value = p.scaleRate;
        uniforms.uRingCount.value = p.ringCount;
        uniforms.uOpacity.value = p.opacity;
        uniforms.uNoiseAmount.value = p.noiseAmount;
        uniforms.uRotation.value = (p.rotation * Math.PI) / 180;
        uniforms.uRingGap.value = p.ringGap;
        uniforms.uFadeIn.value = p.fadeIn;
        uniforms.uFadeOut.value = p.fadeOut;
        uniforms.uMouse.value = [smoothMouseRef.current[0], smoothMouseRef.current[1]];
        uniforms.uMouseInfluence.value = p.followMouse ? p.mouseInfluence : 0;
        uniforms.uHoverAmount.value = hoverAmountRef.current;
        uniforms.uHoverScale.value = p.hoverScale;
        uniforms.uParallax.value = p.parallax;
        uniforms.uBurst.value = p.clickBurst ? burstRef.current : 0;
        renderer.render({ scene: mesh });
      };
      frameId = requestAnimationFrame(animate);

      cleanupFn = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', resize);
        ro.disconnect();
        mount.removeEventListener('mousemove', onMouseMove);
        mount.removeEventListener('mouseenter', onMouseEnter);
        mount.removeEventListener('mouseleave', onMouseLeave);
        mount.removeEventListener('click', onClick);
        if (mount.contains(gl.canvas)) mount.removeChild(gl.canvas);
        // ogl has no dispose(); dropping the context is what frees the GPU
        // resources, and it matters here because this mounts and unmounts
        // every time a voice note starts and stops.
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    });

    return () => {
      cancelled = true;
      if (cleanupFn) cleanupFn();
    };
  }, []);  

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined}
    />
  );
}
