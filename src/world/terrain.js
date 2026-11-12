// Heightfield terrain: baked grid (exactly matches the rendered triangles), chunked meshes,
// vertex-color biomes, baked data textures for GPU grass, and the animated river.
import * as THREE from 'three';
import { makeNoise2D, smoothstep, lerp, clamp, fbm } from '../util.js';
import { TEX, patchMaterial, U } from '../engine/materials.js';
import { WORLD_HALF, WATER_Y, RIVER_HW, riverZ, CAMPS, pathDist, biomeAt, BRIDGES } from './layout.js';

export const RES = 2;
export const GN = (WORLD_HALF * 2) / RES; // cells per side (320)
export const GV = GN + 1; // verts per side
export const H = new Float32Array(GV * GV);
export const COL = new Uint8Array(GV * GV * 4);

const n1 = makeNoise2D(11), n2 = makeNoise2D(29), n3 = makeNoise2D(53), n4 = makeNoise2D(77);

function hills(x, z) {
  return fbm(n1, x * 0.0055, z * 0.0055, 3) * 9 + n2(x * 0.018, z * 0.018) * 2.0 + n3(x * 0.06, z * 0.06) * 0.45;
}
const campH = CAMPS.map((c) => hills(c.x, c.z));

function rawHeight(x, z) {
  let h = hills(x, z);
  // swamp lowland
  const b = biomeAt(x, z);
  h = lerp(h, h * 0.35 - 0.6, b.swamp);
  // camps flatten
  for (let i = 0; i < CAMPS.length; i++) {
    const c = CAMPS[i];
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r + 18) h = lerp(campH[i] * 0.6, h, smoothstep(c.r, c.r + 18, d));
  }
  // paths soften
  const pd = pathDist(x, z);
  if (pd < 10) h = lerp(h * 0.7, h, smoothstep(3, 10, pd));
  // river carve
  const rd = Math.abs(z - riverZ(x));
  if (rd < 34) {
    h = lerp(0.4, h, smoothstep(14, 34, rd));
    h = lerp(-3.8, h, smoothstep(RIVER_HW - 1.5, RIVER_HW + 5, rd));
  }
  // base plot flatten (square)
  const db = Math.max(Math.abs(x), Math.abs(z));
  h = lerp(-0.4, h, smoothstep(47, 86, db));
  // map edge mountains
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 236) {
    const t = (e - 236) / 70;
    h += t * t * 46 * (0.75 + 0.35 * n4(x * 0.025, z * 0.025)) + n3(x * 0.08, z * 0.08) * 2 * t;
  }
  return h;
}

export function height(x, z) {
  if (z < -480) return -80;
  let gx = (x + WORLD_HALF) / RES, gz = (z + WORLD_HALF) / RES;
  gx = clamp(gx, 0, GN - 0.0001);
  gz = clamp(gz, 0, GN - 0.0001);
  const ix = gx | 0, iz = gz | 0;
  const fx = gx - ix, fz = gz - iz;
  const i = iz * GV + ix;
  const h00 = H[i], h10 = H[i + 1], h01 = H[i + GV], h11 = H[i + GV + 1];
  if (fx > fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}

export function isWater(x, z) {
  if (z < -480) return false;
  return height(x, z) < WATER_Y - 0.35;
}

export function onBridge(x, z) {
  for (const b of BRIDGES) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - riverZ(b.x)) < 16) return true;
  return false;
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  grassA: C(0x4f9a35),
  grassB: C(0x79c046),
  forest: C(0x3b7a2a),
  swamp: C(0x4e6a2d),
  swamp2: C(0x3f5a2a),
  north: C(0x3f8a45),
  dirt: C(0x9a7547),
  dirtDark: C(0x7d5d38),
  sand: C(0xcdb582),
  bed: C(0x6a5a40),
  rock: C(0x7c7a72),
  rockDark: C(0x5d5b55),
  snow: C(0xe8eef2),
};
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function colorAt(x, z, h, slope, out) {
  const b = biomeAt(x, z);
  const v = n2(x * 0.03, z * 0.03) * 0.5 + 0.5;
  const fd = n1(x * 0.012 + 40, z * 0.012) * 0.5 + 0.5;
  out.copy(PAL.grassA).lerp(PAL.grassB, v * 0.8);
  out.lerp(PAL.forest, smoothstep(0.45, 0.8, fd) * 0.7);
  out.lerp(PAL.north, b.north * 0.6);
  _c2.copy(PAL.swamp).lerp(PAL.swamp2, v);
  out.lerp(_c2, b.swamp);
  let grass = 1;
  // paths
  const pd = pathDist(x, z);
  const pathW = 3.2 + n3(x * 0.1, z * 0.1) * 0.8;
  if (pd < pathW + 2.5) {
    const t = 1 - smoothstep(pathW, pathW + 2.5, pd);
    _c2.copy(PAL.dirt).lerp(PAL.dirtDark, v);
    out.lerp(_c2, t);
    grass *= 1 - t;
  }
  // camps trampled ground
  for (const c of CAMPS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r + 4) {
      const t = 1 - smoothstep(c.r * 0.55, c.r + 4, d);
      _c2.copy(c.kind === 'golem' ? PAL.swamp2 : PAL.dirtDark);
      out.lerp(_c2, t * 0.85);
      grass *= 1 - t * 0.9;
    }
  }
  // river banks
  const rd = Math.abs(z - riverZ(x));
  if (rd < RIVER_HW + 5) {
    const t = 1 - smoothstep(RIVER_HW + 1, RIVER_HW + 5, rd);
    out.lerp(PAL.sand, t);
    grass *= 1 - t;
    if (h < WATER_Y) out.lerp(PAL.bed, 0.8);
  }
  // rocks / mountains
  const rk = Math.max(smoothstep(0.55, 1.1, slope), smoothstep(10, 22, h));
  if (rk > 0) {
    _c2.copy(PAL.rock).lerp(PAL.rockDark, v);
    out.lerp(_c2, rk);
    grass *= 1 - rk;
  }
  if (h > 34) out.lerp(PAL.snow, smoothstep(34, 44, h));
  // base plot
  const db = Math.max(Math.abs(x), Math.abs(z));
  if (db < 50) grass *= smoothstep(46, 50, db);
  return grass;
}

export function buildTerrainData() {
  for (let iz = 0; iz < GV; iz++) {
    for (let ix = 0; ix < GV; ix++) {
      H[iz * GV + ix] = rawHeight(-WORLD_HALF + ix * RES, -WORLD_HALF + iz * RES);
    }
  }
  for (let iz = 0; iz < GV; iz++) {
    for (let ix = 0; ix < GV; ix++) {
      const x = -WORLD_HALF + ix * RES, z = -WORLD_HALF + iz * RES;
      const i = iz * GV + ix;
      const hl = H[iz * GV + Math.max(ix - 1, 0)], hr = H[iz * GV + Math.min(ix + 1, GN)];
      const hu = H[Math.max(iz - 1, 0) * GV + ix], hd = H[Math.min(iz + 1, GN) * GV + ix];
      const slope = Math.hypot(hr - hl, hd - hu) / (2 * RES);
      const g = colorAt(x, z, H[i], slope, _c);
      COL[i * 4] = _c.r * 255;
      COL[i * 4 + 1] = _c.g * 255;
      COL[i * 4 + 2] = _c.b * 255;
      COL[i * 4 + 3] = g * 255;
    }
  }
}

export let heightTex = null, colorTex = null;
export const chunks = [];
export const CHUNK_CELLS = 40;

export function buildTerrainMeshes(scene) {
  heightTex = new THREE.DataTexture(H, GV, GV, THREE.RedFormat, THREE.FloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter;
  heightTex.needsUpdate = true;
  colorTex = new THREE.DataTexture(COL, GV, GV, THREE.RGBAFormat, THREE.UnsignedByteType);
  colorTex.minFilter = colorTex.magFilter = THREE.LinearFilter;
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.ground, roughness: 0.94, metalness: 0 });
  patchMaterial(mat, { cloud: true });
  const nC = GN / CHUNK_CELLS;
  const lin = new THREE.Color();
  for (let cz = 0; cz < nC; cz++) {
    for (let cx = 0; cx < nC; cx++) {
      const V = CHUNK_CELLS + 1;
      const pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < V; i++) {
          const ix = cx * CHUNK_CELLS + i, iz = cz * CHUNK_CELLS + j;
          const gi = iz * GV + ix;
          const k = j * V + i;
          const x = -WORLD_HALF + ix * RES, z = -WORLD_HALF + iz * RES;
          pos[k * 3] = x;
          pos[k * 3 + 1] = H[gi];
          pos[k * 3 + 2] = z;
          const hl = H[iz * GV + Math.max(ix - 1, 0)], hr = H[iz * GV + Math.min(ix + 1, GN)];
          const hu = H[Math.max(iz - 1, 0) * GV + ix], hd = H[Math.min(iz + 1, GN) * GV + ix];
          let nx = hl - hr, ny = 2 * RES, nz = hu - hd;
          const l = Math.hypot(nx, ny, nz);
          nor[k * 3] = nx / l;
          nor[k * 3 + 1] = ny / l;
          nor[k * 3 + 2] = nz / l;
          lin.setRGB(COL[gi * 4] / 255, COL[gi * 4 + 1] / 255, COL[gi * 4 + 2] / 255, THREE.SRGBColorSpace);
          col[k * 3] = lin.r;
          col[k * 3 + 1] = lin.g;
          col[k * 3 + 2] = lin.b;
          uv[k * 2] = x / 8;
          uv[k * 2 + 1] = z / 8;
        }
      }
      const idx = [];
      for (let j = 0; j < CHUNK_CELLS; j++) {
        for (let i = 0; i < CHUNK_CELLS; i++) {
          const a = j * V + i, b = a + 1, d = a + V, c = d + 1;
          idx.push(a, c, b, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.name = 'terrain';
      scene.add(m);
      chunks.push(m);
    }
  }
  buildRiver(scene);
}

export let waterMat = null;
function buildRiver(scene) {
  const W = RIVER_HW + 5;
  const across = 8;
  const pos = [], edge = [], idx = [];
  let row = 0;
  for (let x = -WORLD_HALF - 10; x <= WORLD_HALF + 10; x += 3) {
    const zc = riverZ(x);
    for (let k = 0; k <= across; k++) {
      const t = k / across * 2 - 1;
      pos.push(x, WATER_Y, zc + t * W);
      edge.push(Math.abs(t));
    }
    if (row > 0) {
      const b0 = (row - 1) * (across + 1), b1 = row * (across + 1);
      for (let k = 0; k < across; k++) idx.push(b0 + k, b0 + k + 1, b1 + k, b1 + k, b0 + k + 1, b1 + k + 1);
    }
    row++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  waterMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(0x1f6f8f) },
        uShallow: { value: new THREE.Color(0x4cc3c9) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uSky: { value: new THREE.Color(0x9ad0ff) },
        uLight: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aEdge;
      uniform float uTime;
      varying vec3 vW; varying float vEdge;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position;
        p.y += sin(p.x*0.35+uTime*1.6)*0.05 + cos(p.z*0.45+uTime*1.25)*0.05;
        vec4 wp = modelMatrix*vec4(p,1.0);
        vW = wp.xyz; vEdge = aEdge;
        vec4 mvPosition = viewMatrix*wp;
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uSky; uniform float uLight;
      uniform sampler2D uNoise;
      varying vec3 vW; varying float vEdge;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec2 flow = vec2(uTime*0.035, 0.0);
        float a = texture2D(uNoise, vW.xz*0.035 + flow).r;
        float b = texture2D(uNoise, vW.xz*0.08 - flow*1.6 + 0.37).r;
        vec3 N = normalize(vec3((a-0.5)*0.9, 1.0, (b-0.5)*0.9));
        vec3 V = normalize(cameraPosition - vW);
        vec3 col = mix(uDeep, uShallow, smoothstep(0.25, 1.0, vEdge));
        col *= uLight;
        float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);
        col = mix(col, uSky, fres*0.55);
        vec3 Hh = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N,Hh),0.0), 180.0);
        col += uSunColor * spec * 2.2;
        float streak = smoothstep(0.66, 0.74, texture2D(uNoise, vec2(vW.x*0.018 - uTime*0.06, vW.z*0.12)).r);
        float foam = smoothstep(0.74, 0.92, vEdge + (a-0.5)*0.3);
        col = mix(col, vec3(0.92,0.98,1.0)*max(uLight,0.4), max(foam*0.9, streak*0.22));
        gl_FragColor = vec4(col, 0.8 + foam*0.2);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  waterMat.uniforms.uTime = U.uTime;
  waterMat.uniforms.uNoise = U.uCloudTex;
  const m = new THREE.Mesh(g, waterMat);
  m.renderOrder = 1;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  scene.add(m);
}

// ray vs heightfield (for picking). Returns distance t or -1
export function raycastTerrain(origin, dir, maxT = 600) {
  let t = 0, prevT = 0;
  let step = 1.0;
  let prevDiff = origin.y - height(origin.x, origin.z);
  if (prevDiff < 0) return -1;
  while (t < maxT) {
    t += step;
    const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    const diff = y - height(x, z);
    if (diff < 0) {
      // refine
      let lo = prevT, hi = t;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        const d = origin.y + dir.y * mid - height(origin.x + dir.x * mid, origin.z + dir.z * mid);
        if (d < 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    prevT = t;
    prevDiff = diff;
    step = Math.max(0.5, Math.min(4, diff * 0.5));
  }
  return -1;
}

// Bake soft shade under tree canopies into the terrain vertex colors and the grass color texture.
export function applyCanopyShade(spots) {
  const shade = new Float32Array(GV * GV).fill(1);
  for (const [x, z, r] of spots) {
    const i0 = Math.max(0, Math.floor((x - r + WORLD_HALF) / RES)), i1 = Math.min(GN, Math.ceil((x + r + WORLD_HALF) / RES));
    const j0 = Math.max(0, Math.floor((z - r + WORLD_HALF) / RES)), j1 = Math.min(GN, Math.ceil((z + r + WORLD_HALF) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = -WORLD_HALF + i * RES - x, dz = -WORLD_HALF + j * RES - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= r) continue;
        const k = j * GV + i;
        shade[k] *= 1 - 0.3 * (1 - smoothstep(r * 0.25, r, d));
      }
    }
  }
  for (let k = 0; k < GV * GV; k++) {
    const s = Math.max(0.5, shade[k]);
    if (s >= 0.999) continue;
    COL[k * 4] *= s;
    COL[k * 4 + 1] *= s;
    COL[k * 4 + 2] *= s;
  }
  if (colorTex) colorTex.needsUpdate = true;
  const nC = GN / CHUNK_CELLS;
  const lin = new THREE.Color();
  for (let cz = 0; cz < nC; cz++) {
    for (let cx = 0; cx < nC; cx++) {
      const m = chunks[cz * nC + cx];
      if (!m) continue;
      const col = m.geometry.attributes.color;
      const V = CHUNK_CELLS + 1;
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < V; i++) {
          const gi = (cz * CHUNK_CELLS + j) * GV + cx * CHUNK_CELLS + i;
          if (shade[gi] >= 0.999) continue;
          lin.setRGB(COL[gi * 4] / 255, COL[gi * 4 + 1] / 255, COL[gi * 4 + 2] / 255, THREE.SRGBColorSpace);
          col.setXYZ(j * V + i, lin.r, lin.g, lin.b);
        }
      }
      col.needsUpdate = true;
    }
  }
}
