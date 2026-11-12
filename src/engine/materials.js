// Procedural textures, the shared material cache and global shader injections
// (occlusion cut-out around the player, cloud shadows, wind, per-instance glow).
import * as THREE from 'three';
import { makeNoise2D, mulberry32, clamp } from '../util.js';

// ---------- shared uniforms (one object -> every patched shader) ----------
export const U = {
  uTime: { value: 0 },
  uCut: { value: new THREE.Vector4(0, 0, 0, 0) }, // screen px xy, radius px, player view depth
  uCutOn: { value: 0 },
  uCloudTex: { value: null },
  uCloudAmt: { value: 1 },
  uWindAmt: { value: 0.045 },
  uPlayer: { value: new THREE.Vector3() },
};

let ANISO = 8;
export function setAnisotropy(a) { ANISO = a; }

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function heightToNormal(hgt, w, h, strength) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = hgt[y * w + ((x - 1 + w) % w)];
      const xr = hgt[y * w + ((x + 1) % w)];
      const yu = hgt[((y - 1 + h) % h) * w + x];
      const yd = hgt[((y + 1) % h) * w + x];
      let nx = -(xr - xl) * strength;
      let ny = (yd - yu) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayToCanvas(vals, w, h, alpha = null) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = clamp(vals[i], 0, 1) * 255;
    d[i * 4] = v;
    d[i * 4 + 1] = v;
    d[i * 4 + 2] = v;
    d[i * 4 + 3] = alpha ? alpha[i] * 255 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// Periodic value noise (tileable) 0..1
function periodicNoise(size, cells, seed, octaves = 4) {
  const r = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * c;
      const y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * c;
        const x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = lat[(y0 % c) * c + (x0 % c)];
        const b = lat[(y0 % c) * c + ((x0 + 1) % c)];
        const cc = lat[((y0 + 1) % c) * c + (x0 % c)];
        const dd = lat[((y0 + 1) % c) * c + ((x0 + 1) % c)];
        out[y * size + x] += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + dd) * sx * sy);
      }
    }
    total += amp;
    amp *= 0.5;
    c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export const TEX = {};

function makeStuds() {
  // 4x4 studs per tile (tile = 4 studs)
  const S = 256, n = 4, cell = S / n;
  const h = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  const noise = periodicNoise(S, 8, 3, 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = (x % cell) - cell / 2 + 0.5;
      const cy = (y % cell) - cell / 2 + 0.5;
      const d = Math.hypot(cx, cy) / cell;
      const r = 0.3;
      const hv = d < r - 0.03 ? 1 : d < r + 0.03 ? 1 - (d - (r - 0.03)) / 0.06 : 0;
      h[y * S + x] = hv;
      let a = 0.93 + noise[y * S + x] * 0.07;
      // ambient occlusion ring + top highlight
      if (d > r && d < r + 0.12) a -= (1 - (d - r) / 0.12) * 0.12;
      if (d < r && cy < -2 && d > r * 0.55) a += 0.05;
      alb[y * S + x] = a;
    }
  }
  TEX.studs = tex(grayToCanvas(alb, S, S));
  TEX.studsN = tex(heightToNormal(h, S, S, 2.2), false);
}

function makeWood() {
  const S = 512, planks = 4, ph = S / planks;
  const r = mulberry32(7);
  const nz = makeNoise2D(5);
  const alb = new Float32Array(S * S), h = new Float32Array(S * S);
  const shade = [], joints = [];
  for (let p = 0; p < planks; p++) {
    shade.push(0.78 + r() * 0.22);
    joints.push(r() * S);
  }
  for (let y = 0; y < S; y++) {
    const p = Math.floor(y / ph);
    const py = y % ph;
    for (let x = 0; x < S; x++) {
      const grain = nz(x * 0.006, y * 0.09 + p * 10) * 0.5 + nz(x * 0.02, y * 0.3) * 0.25;
      let v = shade[p] * (0.86 + grain * 0.18);
      let hv = 0.8 + grain * 0.1;
      if (py < 4 || py > ph - 4) { v *= 0.45; hv = 0; }
      const jx = Math.abs(((x - joints[p] + S) % S));
      if (jx < 3) { v *= 0.5; hv = 0.1; }
      // knots
      alb[y * S + x] = v;
      h[y * S + x] = hv;
    }
  }
  TEX.wood = tex(grayToCanvas(alb, S, S));
  TEX.woodN = tex(heightToNormal(h, S, S, 1.6), false);
}

function makeBrick() {
  const S = 512, rows = 8, rh = S / rows, bw = S / 4;
  const r = mulberry32(11);
  const nz = makeNoise2D(9);
  const alb = new Float32Array(S * S), h = new Float32Array(S * S);
  const shades = new Float32Array(rows * 5).map(() => 0.72 + r() * 0.28);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / rh), ry = y % rh;
    const off = row % 2 ? bw / 2 : 0;
    for (let x = 0; x < S; x++) {
      const xx = (x + off) % S;
      const col = Math.floor(xx / bw), rx = xx % bw;
      const mortar = ry < 5 || rx < 5;
      const n = nz(x * 0.05, y * 0.05) * 0.06 + nz(x * 0.2, y * 0.2) * 0.04;
      if (mortar) {
        alb[y * S + x] = 1.0 + n;
        h[y * S + x] = 0;
      } else {
        alb[y * S + x] = shades[row * 5 + col] * (0.9 + n * 1.5);
        h[y * S + x] = 1 - Math.max(0, 1 - Math.min(ry - 5, rx - 5, rh - ry, bw - rx) / 4) * 0.3 + n;
      }
    }
  }
  TEX.brick = tex(grayToCanvas(alb, S, S));
  TEX.brickN = tex(heightToNormal(h, S, S, 2.0), false);
}

function makeStone() {
  // voronoi slabs
  const S = 256, cells = 4;
  const r = mulberry32(21);
  const pts = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + r() * 0.7) / cells, (j + 0.15 + r() * 0.7) / cells, 0.75 + r() * 0.25]);
  const nz = makeNoise2D(13);
  const alb = new Float32Array(S * S), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let d1 = 9, d2 = 9, shade = 1;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
          const p = pts[jj * cells + ii];
          const px = p[0] + Math.floor((ci + di) / cells) * 1 + (ci + di < 0 ? 0 : 0);
          let dx = u - (p[0] + (ci + di - ii) / cells);
          let dy = v - (p[1] + (cj + dj - jj) / cells);
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; shade = p[2]; } else if (d < d2) d2 = d;
          void px;
        }
      const edge = (d2 - d1) * cells;
      const n = nz(x * 0.03, y * 0.03) * 0.08 + nz(x * 0.12, y * 0.12) * 0.05;
      const e = clamp(edge / 0.08, 0, 1);
      alb[y * S + x] = (shade + n) * (0.55 + 0.45 * e);
      h[y * S + x] = e * (0.8 + n * 2);
    }
  }
  TEX.stone = tex(grayToCanvas(alb, S, S));
  TEX.stoneN = tex(heightToNormal(h, S, S, 2.5), false);
}

function makeMetal() {
  const S = 256, k = 8, cell = S / k;
  const alb = new Float32Array(S * S), h = new Float32Array(S * S);
  const noise = periodicNoise(S, 16, 31, 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = (x % cell) / cell - 0.5, cy = (y % cell) / cell - 0.5;
      const flip = (Math.floor(x / cell) + Math.floor(y / cell)) % 2;
      const a = flip ? cx + cy : cx - cy;
      const b = flip ? cx - cy : cx + cy;
      const ridge = Math.abs(a) < 0.08 && Math.abs(b) < 0.38 ? 1 : 0;
      h[y * S + x] = ridge;
      alb[y * S + x] = 0.8 + noise[y * S + x] * 0.2 + ridge * 0.08;
    }
  }
  TEX.metal = tex(grayToCanvas(alb, S, S));
  TEX.metalN = tex(heightToNormal(h, S, S, 1.5), false);
}

function makeMarble() {
  const S = 512;
  const nz = makeNoise2D(41);
  const alb = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const t = (x + y) * 0.012 + nz(x * 0.008, y * 0.008) * 3 + nz(x * 0.03, y * 0.03) * 0.6;
      const vein = Math.pow(Math.abs(Math.sin(t * 2.2)), 0.12);
      // tile seams every 128px
      const seam = (x % 256 < 2 || y % 256 < 2) ? 0.82 : 1;
      alb[y * S + x] = (0.78 + vein * 0.22) * seam;
    }
  TEX.marble = tex(grayToCanvas(alb, S, S));
}

function makeFabric() {
  const S = 128;
  const alb = new Float32Array(S * S);
  const noise = periodicNoise(S, 8, 77, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const w = ((x % 4 < 2) ^ (y % 4 < 2)) ? 0.92 : 1;
      alb[y * S + x] = (0.82 + noise[y * S + x] * 0.18) * w;
    }
  TEX.fabric = tex(grayToCanvas(alb, S, S));
}

function makeGrassDetail() {
  const S = 256;
  const n1 = periodicNoise(S, 32, 51, 3);
  const n2 = periodicNoise(S, 8, 52, 3);
  const alb = new Float32Array(S * S);
  const r = mulberry32(99);
  for (let i = 0; i < S * S; i++) alb[i] = 0.8 + n1[i] * 0.16 + n2[i] * 0.1 + (r() - 0.5) * 0.06;
  TEX.ground = tex(grayToCanvas(alb, S, S));
}

function makeBelt() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 3, 3);
  }
  // cross ribs
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < S; x += 32) ctx.fillRect(x, 0, 4, S);
  // chevrons pointing +x (u)
  ctx.strokeStyle = '#f7c948';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < 2; k++) {
    const ox = k * 128 + 40;
    ctx.beginPath();
    ctx.moveTo(ox, 70);
    ctx.lineTo(ox + 44, 128);
    ctx.lineTo(ox, 186);
    ctx.stroke();
  }
  TEX.belt = tex(c);
}

function makeFace() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#111';
  // eyes (classic tall ovals)
  ctx.beginPath();
  ctx.ellipse(S * 0.38, S * 0.4, S * 0.045, S * 0.085, 0, 0, Math.PI * 2);
  ctx.ellipse(S * 0.62, S * 0.4, S * 0.045, S * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();
  // smile
  ctx.strokeStyle = '#111';
  ctx.lineWidth = S * 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.5, S * 0.2, Math.PI * 0.22, Math.PI * 0.78);
  ctx.stroke();
  TEX.face = tex(c, true, false);

  // angry goblin face
  const g = canvas(S, S);
  const gx = g.getContext('2d');
  gx.fillStyle = '#ff2a1a';
  gx.beginPath();
  gx.ellipse(S * 0.37, S * 0.42, S * 0.06, S * 0.045, 0.3, 0, Math.PI * 2);
  gx.ellipse(S * 0.63, S * 0.42, S * 0.06, S * 0.045, -0.3, 0, Math.PI * 2);
  gx.fill();
  gx.strokeStyle = '#141414';
  gx.lineWidth = S * 0.04;
  gx.lineCap = 'round';
  gx.beginPath();
  gx.moveTo(S * 0.27, S * 0.3);
  gx.lineTo(S * 0.45, S * 0.37);
  gx.moveTo(S * 0.73, S * 0.3);
  gx.lineTo(S * 0.55, S * 0.37);
  gx.stroke();
  // toothy grin
  gx.fillStyle = '#141414';
  gx.beginPath();
  gx.moveTo(S * 0.33, S * 0.6);
  gx.quadraticCurveTo(S * 0.5, S * 0.74, S * 0.67, S * 0.6);
  gx.quadraticCurveTo(S * 0.5, S * 0.66, S * 0.33, S * 0.6);
  gx.fill();
  gx.fillStyle = '#f4f0d0';
  gx.fillRect(S * 0.4, S * 0.62, S * 0.05, S * 0.05);
  gx.fillRect(S * 0.55, S * 0.62, S * 0.05, S * 0.05);
  TEX.goblinFace = tex(g, true, false);
}

function makeCloud() {
  const S = 256;
  const n = periodicNoise(S, 4, 123, 5);
  TEX.cloud = tex(grayToCanvas(n, S, S), false);
}

function makeSprite() {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  TEX.sprite = tex(c, false, false);
}

function makePlasticN() {
  const S = 128;
  const n = periodicNoise(S, 16, 61, 2);
  TEX.plasticN = tex(heightToNormal(n, S, S, 0.6), false);
}

export function initTextures() {
  makeStuds();
  makeWood();
  makeBrick();
  makeStone();
  makeMetal();
  makeMarble();
  makeFabric();
  makeGrassDetail();
  makeBelt();
  makeFace();
  makeCloud();
  makeSprite();
  makePlasticN();
  U.uCloudTex.value = TEX.cloud;
}

// ---------- shader patching ----------
const VERT_PARS = /* glsl */ `
uniform float uTime;
uniform float uWindAmt;
varying vec3 vNWorld;
#ifdef N_GLOW
attribute float aGlow;
varying float vGlow;
#endif
`;
const FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uCut;
uniform float uCutOn;
uniform sampler2D uCloudTex;
uniform float uCloudAmt;
varying vec3 vNWorld;
#ifdef N_GLOW
varying float vGlow;
#endif
float nIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
#ifdef N_RIM
uniform vec3 uRimColor;
#endif
`;

export function patchMaterial(mat, o = {}) {
  const flags = [];
  if (o.cut) flags.push('N_CUT');
  if (o.cloud !== false) flags.push('N_CLOUD');
  if (o.wind) flags.push('N_WIND');
  if (o.glow) flags.push('N_GLOW');
  if (o.rim) {
    flags.push('N_RIM');
    mat.userData.rimU = { value: new THREE.Color(o.rim) };
  }
  const windBase = o.windBase ?? 1.5;
  mat.userData.nFlags = flags;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uCut = U.uCut;
    sh.uniforms.uCutOn = U.uCutOn;
    sh.uniforms.uCloudTex = U.uCloudTex;
    sh.uniforms.uCloudAmt = U.uCloudAmt;
    sh.uniforms.uWindAmt = U.uWindAmt;
    if (mat.userData.rimU) sh.uniforms.uRimColor = mat.userData.rimU;
    const defs = flags.map((f) => `#define ${f}`).join('\n') + '\n';
    sh.vertexShader = defs + VERT_PARS + sh.vertexShader;
    sh.fragmentShader = defs + FRAG_PARS + sh.fragmentShader;
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef N_WIND
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
  ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif
  float wh = max(transformed.y - ${windBase.toFixed(2)}, 0.0);
  float ph = uTime * 1.6 + ip.x * 0.13 + ip.z * 0.11;
  transformed.x += (sin(ph) + 0.4 * sin(ph * 2.7)) * wh * uWindAmt;
  transformed.z += cos(ph * 0.8 + 1.3) * wh * uWindAmt * 0.7;
}
#endif
#ifdef N_GLOW
vGlow = aGlow;
#endif`
    );
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 nwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  nwp = instanceMatrix * nwp;
  #endif
  nwp = modelMatrix * nwp;
  vNWorld = nwp.xyz;
}`
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
#ifdef N_CUT
if (uCutOn > 0.5 && vViewPosition.z < uCut.w - 2.5) {
  float dC = distance(gl_FragCoord.xy, uCut.xy);
  float kC = 1.0 - smoothstep(uCut.z * 0.5, uCut.z, dC);
  if (kC > nIGN(gl_FragCoord.xy)) discard;
}
#endif`
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
#ifdef N_CLOUD
{
  float cn = texture2D(uCloudTex, vNWorld.xz * 0.0032 + vec2(uTime * 0.0055, uTime * 0.0032)).r;
  float cs = mix(1.0, 0.45, smoothstep(0.5, 0.74, cn) * uCloudAmt);
  reflectedLight.directDiffuse *= cs;
  reflectedLight.directSpecular *= cs;
}
#endif
#ifdef N_RIM
{
  vec3 rvd = normalize(vViewPosition);
  float rfr = 1.0 - clamp(dot(normal, rvd), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * pow(rfr, 2.4);
}
#endif`
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#ifdef N_GLOW
totalEmissiveRadiance += diffuseColor.rgb * vGlow;
#endif`
    );
  };
  mat.customProgramCacheKey = () => flags.join(',');
  return mat;
}

// ---------- material cache ----------
// kind: plastic | studs | wood | brick | stone | metal | gold | marble | neon | glass | fabric | grass | belt | dark | slime
const cache = new Map();
export const TILE = { studs: 4, wood: 8, brick: 8, stone: 10, metal: 4, marble: 12, fabric: 4, grass: 8, belt: 4, plastic: 4 };
export const levelMats = { L1: [], L2: [], F0: [], F1: [] };
export const nightMats = []; // neon that brightens after sunset (lamps, lanterns)

export function getMat(kind = 'plastic', color = 0xffffff, o = {}) {
  const tag = o.tag || '';
  const cut = o.cut !== false;
  const key = `${kind}|${color}|${tag}|${cut}|${o.emissive ?? ''}|${o.opacity ?? ''}|${o.side ?? ''}|${o.night ? 'n' : ''}`;
  let m = cache.get(key);
  if (m) return m;
  const col = new THREE.Color(color);
  switch (kind) {
    case 'neon': {
      m = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar((o.emissive ?? 2.4) * 1.8) });
      if (o.night) {
        m.userData.baseCol = m.color.clone();
        nightMats.push(m);
      }
      break;
    }
    case 'glass':
      m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.05, metalness: 0.1, transparent: true, opacity: o.opacity ?? 0.35, depthWrite: false, envMapIntensity: 1.4 });
      break;
    case 'gold':
      m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 1, normalMap: TEX.plasticN, envMapIntensity: 1.2 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.metal, normalMap: TEX.metalN, roughness: 0.38, metalness: 0.75, envMapIntensity: 1.0 });
      break;
    case 'studs':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.studs, normalMap: TEX.studsN, roughness: 0.55, metalness: 0 });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.wood, normalMap: TEX.woodN, roughness: 0.82 });
      break;
    case 'brick':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.brick, normalMap: TEX.brickN, roughness: 0.9 });
      break;
    case 'stone':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.stone, normalMap: TEX.stoneN, roughness: 0.88 });
      break;
    case 'marble':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.marble, roughness: 0.32, envMapIntensity: 0.8 });
      break;
    case 'fabric':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.fabric, roughness: 1, side: o.side ?? THREE.FrontSide });
      break;
    case 'grass':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.ground, roughness: 0.95 });
      break;
    case 'belt':
      m = new THREE.MeshStandardMaterial({ color: col, map: TEX.belt, roughness: 0.7 });
      break;
    case 'slime':
      m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.12, transparent: true, opacity: o.opacity ?? 0.78, emissive: col.clone().multiplyScalar(0.25) });
      break;
    case 'emissive':
      m = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone(), emissiveIntensity: o.emissive ?? 1.5, roughness: 0.4 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.58, metalness: 0, normalMap: TEX.plasticN, normalScale: new THREE.Vector2(0.4, 0.4) });
  }
  if (o.side !== undefined) m.side = o.side;
  if (kind !== 'neon') patchMaterial(m, { cut, cloud: true });
  if (tag && levelMats[tag]) {
    m.transparent = true;
    m.userData.baseOpacity = m.opacity;
    levelMats[tag].push(m);
  }
  m.userData.kind = kind;
  m.userData.tag = tag || null;
  cache.set(key, m);
  return m;
}

export function tileFor(kind) {
  return TILE[kind] || 4;
}
