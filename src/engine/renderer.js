// Renderer + post-processing (MSAA, bloom, tone mapping, grading) with quality presets
// and adaptive resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G } from '../G.js';

export const QUALITY = {
  low: { pr: 1.0, samples: 0, bloom: false, shadow: 1024, grass: 7000, shadowRange: 55 },
  medium: { pr: 1.25, samples: 2, bloom: true, shadow: 2048, grass: 14000, shadowRange: 62 },
  high: { pr: 1.6, samples: 4, bloom: true, shadow: 2048, grass: 22000, shadowRange: 70 },
  ultra: { pr: 2.0, samples: 4, bloom: true, shadow: 4096, grass: 32000, shadowRange: 80 },
};

// Final grade: optional FXAA, chromatic aberration on hits, split toning, S-curve contrast,
// vibrance, vignette, damage/flash overlays and fine film grain. Runs in display (sRGB) space.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDesat: { value: 0 },
    uDamage: { value: 0 },
    uVig: { value: 0.3 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uSat: { value: 1.12 },
    uContrast: { value: 0.22 },
    uShadowTint: { value: new THREE.Color(0.86, 0.94, 1.1) },
    uHighTint: { value: new THREE.Color(1.07, 1.01, 0.9) },
    uGrain: { value: 0.022 },
    uTime: { value: 0 },
    uPx: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uFxaa: { value: 0 },
    uCA: { value: 0 },
    uNight: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDesat, uDamage, uVig, uFlash, uSat, uContrast, uGrain, uTime, uFxaa, uCA, uNight;
    uniform vec3 uFlashColor, uShadowTint, uHighTint;
    uniform vec2 uPx;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.299, 0.587, 0.114);
    vec3 fxaa(vec2 uv) {
      vec3 nw = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * uPx).rgb;
      vec3 ne = texture2D(tDiffuse, uv + vec2(1.0, -1.0) * uPx).rgb;
      vec3 sw = texture2D(tDiffuse, uv + vec2(-1.0, 1.0) * uPx).rgb;
      vec3 se = texture2D(tDiffuse, uv + vec2(1.0, 1.0) * uPx).rgb;
      vec3 m = texture2D(tDiffuse, uv).rgb;
      float lNW = dot(nw, LUMA), lNE = dot(ne, LUMA), lSW = dot(sw, LUMA), lSE = dot(se, LUMA), lM = dot(m, LUMA);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
      vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
      float lB = dot(b, LUMA);
      return (lB < lMin || lB > lMax) ? a : b;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 q = vUv - 0.5;
      float v = dot(q, q);
      vec3 col = uFxaa > 0.5 ? fxaa(vUv) : texture2D(tDiffuse, vUv).rgb;
      if (uCA > 0.001) {
        vec2 o = q * uCA * 0.012;
        col.r = texture2D(tDiffuse, vUv + o).r;
        col.b = texture2D(tDiffuse, vUv - o).b;
      }
      // day-for-night: cool, slightly desaturated moonlight look (bright emissives keep their color)
      {
        float ln = dot(col, LUMA);
        vec3 nightCol = mix(vec3(ln), col, 0.72) * vec3(0.78, 0.9, 1.18);
        col = mix(col, nightCol, uNight * (1.0 - smoothstep(0.55, 1.0, ln)));
      }
      float l = dot(col, LUMA);
      // split toning: cool shadows, warm highlights
      col = mix(col, col * uShadowTint, (1.0 - smoothstep(0.0, 0.45, l)) * 0.5);
      col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l) * 0.45);
      // gentle S-curve
      vec3 s = clamp(col, 0.0, 1.0);
      col = mix(col, s * s * (3.0 - 2.0 * s), uContrast);
      // vibrance (boost dull colors more than saturated ones)
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      l = dot(col, LUMA);
      float sat = uSat + (1.0 - (mx - mn)) * 0.18;
      col = mix(vec3(l), col, sat * (1.0 - uDesat));
      col *= 1.0 - uDesat * 0.3;
      col *= 1.0 - uVig * smoothstep(0.1, 0.6, v);
      col = mix(col, vec3(0.75, 0.04, 0.04), uDamage * smoothstep(0.06, 0.5, v));
      col = mix(col, uFlashColor, uFlash);
      col += (hash(vUv / uPx + fract(uTime * 7.13) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x87b5e0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 1400);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const size = new THREE.Vector2(innerWidth, innerHeight);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.85, 0.5, 2.1);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);

  const R = {
    renderer, scene, camera, composer, bloom, grade, rt,
    q: QUALITY.high,
    qName: 'high',
    resScale: 1,
    fpsAvg: 60,
    _slow: 0,
    _fast: 0,
    setQuality(name) {
      this.qName = name;
      this.q = QUALITY[name] || QUALITY.high;
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        if (t.samples !== this.q.samples) {
          t.samples = this.q.samples;
          t.dispose();
        }
      }
      bloom.enabled = this.q.bloom;
      grade.uniforms.uFxaa.value = this.q.samples === 0 ? 1 : 0;
      this.resScale = 1;
      this.resize();
      G.emit('quality', this.q);
    },
    pixelRatio() {
      return Math.min(devicePixelRatio || 1, this.q.pr) * this.resScale;
    },
    resize() {
      const w = innerWidth, h = innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const pr = this.pixelRatio();
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      grade.uniforms.uPx.value.set(1 / (w * pr), 1 / (h * pr));
    },
    adapt(dt) {
      // adaptive resolution keeps the frame rate smooth
      if (document.hidden || dt > 0.2) return;
      const fps = 1 / Math.max(dt, 1e-4);
      this.fpsAvg += (fps - this.fpsAvg) * 0.05;
      if (!G.settings?.autoQuality) return;
      if (this.fpsAvg < 48) { this._slow += dt; this._fast = 0; } else if (this.fpsAvg > 58) { this._fast += dt; this._slow = 0; } else { this._slow = this._fast = 0; }
      if (this._slow > 2 && this.resScale > 0.6) {
        this.resScale = Math.max(0.6, this.resScale - 0.1);
        this._slow = 0;
        this.resize();
      } else if (this._fast > 5 && this.resScale < 1) {
        this.resScale = Math.min(1, this.resScale + 0.1);
        this._fast = 0;
        this.resize();
      }
    },
    render() {
      grade.uniforms.uTime.value = performance.now() / 1000;
      composer.render();
    },
  };
  addEventListener('resize', () => R.resize());
  return R;
}
