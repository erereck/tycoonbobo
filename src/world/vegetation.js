// Instanced, chunked vegetation (trees, rocks, bushes, flowers, mushrooms),
// GPU-wrapped grass field and night fireflies.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, mulberry32, smoothstep, fbm } from '../util.js';
import { patchMaterial, U, TEX } from '../engine/materials.js';
import { addSolid } from '../engine/physics.js';
import { height, heightTex, colorTex, COL, GV, RES, applyCanopyShade } from './terrain.js';
import { WORLD_HALF, RIVER_HW, riverZ, CAMPS, pathDist, biomeAt, BRIDGES, WATER_Y } from './layout.js';

// Vertex colors with baked ambient occlusion: darker toward the bottom of each part and on
// downward-facing faces, brighter on sun-facing tops. Free at runtime, big depth boost.
function colored(geo, color, jitter = 0, ao = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const n = pos.count;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const hspan = Math.max(maxY - minY, 1e-3);
  const arr = new Float32Array(n * 3);
  const r = mulberry32(n + (color & 0xffff));
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (r() - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      const v = i + k;
      let f = j;
      if (ao) {
        const t = (pos.getY(v) - minY) / hspan;
        f *= ao[0] + (ao[1] - ao[0]) * Math.pow(t, 0.8);
        f *= 0.8 + 0.2 * (nor.getY(v) * 0.5 + 0.5);
      }
      arr[v * 3] = c.r * f;
      arr[v * 3 + 1] = c.g * f;
      arr[v * 3 + 2] = c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
function at(g, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
  g.scale(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function hash3(x, y, z, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}
function lumpy(geo, amt, seed) {
  // position-hashed jitter so split vertices move together (no cracks)
  const g = geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const qx = Math.round(x * 1000) / 1000, qy = Math.round(y * 1000) / 1000, qz = Math.round(z * 1000) / 1000;
    const k = 1 + (hash3(qx, qy, qz, seed) - 0.5) * amt;
    const ky = 1 + (hash3(qz, qx, qy, seed + 3) - 0.5) * amt;
    p.setXYZ(i, x * k, y * ky, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function makeTreeGeos() {
  const T = {};
  T.pine = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.35, 0.55, 4, 6), 0, 2, 0), 0x6b4a2b, 0.2, [0.45, 1.0]),
    colored(at(lumpy(new THREE.ConeGeometry(3.3, 4.4, 8), 0.12, 1), 0, 5.2, 0), 0x2c6a37, 0.18, [0.5, 1.18]),
    colored(at(lumpy(new THREE.ConeGeometry(2.6, 3.9, 8), 0.12, 2), 0, 7.6, 0), 0x337a3e, 0.18, [0.5, 1.18]),
    colored(at(lumpy(new THREE.ConeGeometry(1.8, 3.3, 8), 0.12, 3), 0, 9.9, 0), 0x3d8d47, 0.18, [0.5, 1.18]),
  ]);
  T.oak = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.5, 0.8, 5.4, 7), 0, 2.7, 0), 0x6e4b2c, 0.2, [0.45, 1.0]),
    colored(at(new THREE.CylinderGeometry(0.2, 0.35, 2.8, 5), 0.9, 4.8, 0.2, 1, 1, 1).rotateZ(-0.6), 0x6e4b2c),
    colored(at(lumpy(new THREE.IcosahedronGeometry(3.3, 0), 0.25, 4), 0, 7.2, 0), 0x4a9a37, 0.22, [0.55, 1.15]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(2.5, 0), 0.25, 5), 2.2, 6.2, 1.1), 0x55a83f, 0.22, [0.55, 1.15]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(2.6, 0), 0.25, 6), -2.0, 6.4, -0.9), 0x449033, 0.22, [0.55, 1.15]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(2.2, 0), 0.25, 7), 0.4, 9.0, -0.6), 0x5cb546, 0.22, [0.55, 1.15]),
  ]);
  T.ball = mergeGeometries([
    colored(at(new THREE.BoxGeometry(1, 6, 1), 0, 3, 0), 0x7a5230, 0.1, [0.45, 1.0]),
    colored(at(new THREE.IcosahedronGeometry(3.5, 1), 0, 8.2, 0), 0x6bbd45, 0.16, [0.55, 1.15]),
  ]);
  const dead = [colored(at(new THREE.CylinderGeometry(0.28, 0.6, 6.5, 6), 0, 3.25, 0), 0x5b4c3c, 0.2, [0.45, 1.0])];
  const br = [[0.8, 4.2, 0.6, -0.9], [-0.7, 5.0, -1.0, 0.8], [0.3, 5.8, 0.7, 0.3]];
  for (const b of br) {
    const g = new THREE.CylinderGeometry(0.1, 0.22, 2.6, 5);
    g.rotateZ(b[3]);
    g.translate(b[0], b[1], b[2] * 0.3);
    dead.push(colored(g, 0x5b4c3c, 0.2));
  }
  T.dead = mergeGeometries(dead);
  T.willow = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.5, 0.85, 5, 7), 0, 2.5, 0), 0x4f3d2a, 0.2, [0.45, 1.0]),
    colored(at(lumpy(new THREE.SphereGeometry(3.6, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.15, 8), 0, 5.4, 0, 1, 1.15, 1), 0x56743a, 0.2, [0.45, 1.1]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(2.2, 0), 0.2, 9), 0, 8.4, 0), 0x61833f, 0.2, [0.55, 1.15]),
  ]);
  T.bush = mergeGeometries([
    colored(at(lumpy(new THREE.IcosahedronGeometry(1.3, 0), 0.25, 10), 0, 0.9, 0), 0x3f8a32, 0.25, [0.5, 1.12]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(1.0, 0), 0.25, 11), 1.0, 0.7, 0.3), 0x4a9a3a, 0.25, [0.5, 1.12]),
    colored(at(lumpy(new THREE.IcosahedronGeometry(0.9, 0), 0.25, 12), -0.8, 0.65, -0.4), 0x37802c, 0.25, [0.5, 1.12]),
  ]);
  T.berry = mergeGeometries([
    T.bush.clone(),
    colored(at(new THREE.IcosahedronGeometry(0.18, 0), 0.6, 1.7, 0.8), 0xe0303a),
    colored(at(new THREE.IcosahedronGeometry(0.18, 0), -0.5, 1.5, 0.9), 0xe0303a),
    colored(at(new THREE.IcosahedronGeometry(0.18, 0), 0.2, 1.9, -0.6), 0xe0303a),
  ]);
  T.flower = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 3), 0, 0.3, 0), 0x3c7a2a),
    colored(at(new THREE.OctahedronGeometry(0.26, 0), 0, 0.68, 0, 1, 0.45, 1), 0xffffff),
    colored(at(new THREE.OctahedronGeometry(0.09, 0), 0, 0.76, 0), 0xffd84a),
  ]);
  T.mushroom = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.13, 0.17, 0.6, 6), 0, 0.3, 0), 0xf0e6d0),
    colored(at(new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.55, 0), 0xd8342c),
  ]);
  T.glow = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6), 0, 0.35, 0), 0x9ff7ff),
    colored(at(new THREE.SphereGeometry(0.38, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.66, 0), 0x22e6ff),
  ]);
  T.log = colored(at(new THREE.CylinderGeometry(0.6, 0.6, 5, 8).rotateZ(Math.PI / 2), 0, 0.55, 0), 0x6b4a2b, 0.15);
  T.stump = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.75, 0.95, 1.0, 8), 0, 0.5, 0), 0x6b4a2b, 0.15),
    colored(at(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 8), 0, 1.02, 0), 0xc9a26b),
  ]);
  for (const k in T) T[k].computeBoundingSphere();
  return T;
}

function makeRockGeo(seed) {
  let g = new THREE.DodecahedronGeometry(1, 1);
  g = lumpy(g, 0.35, seed);
  g.scale(1, 0.7, 1);
  g.translate(0, 0.25, 0);
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  // baked AO + moss on the sun-facing top
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const stone = new THREE.Color(0x8d8b84), moss = new THREE.Color(0x587f36), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nor.getY(i);
    const m = smoothstep(0.45, 0.8, ny) * (0.75 + 0.25 * Math.sin(pos.getX(i) * 7 + pos.getZ(i) * 5));
    c.copy(stone).lerp(moss, m);
    const ao = 0.55 + 0.45 * smoothstep(-0.4, 0.9, y);
    col[i * 3] = c.r * ao;
    col[i * 3 + 1] = c.g * ao;
    col[i * 3 + 2] = c.b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const CHUNK = 80;
const NCH = (WORLD_HALF * 2) / CHUNK;

export function buildVegetation(scene, quality) {
  const T = makeTreeGeos();
  const rockGeos = [makeRockGeo(3), makeRockGeo(17), makeRockGeo(29)];
  const vegMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(vegMat, { cut: true, wind: true, windBase: 3.5, cloud: true });
  const vegMatNoCut = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(vegMatNoCut, { cut: false, wind: true, windBase: 0.3, cloud: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, flatShading: true });
  patchMaterial(rockMat, { cut: true, cloud: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.0, 3.0, 3.0) });

  const types = {
    pine: { geo: T.pine, mat: vegMat, cast: true },
    oak: { geo: T.oak, mat: vegMat, cast: true },
    ball: { geo: T.ball, mat: vegMat, cast: true },
    dead: { geo: T.dead, mat: vegMat, cast: true },
    willow: { geo: T.willow, mat: vegMat, cast: true },
    bush: { geo: T.bush, mat: vegMatNoCut, cast: true },
    berry: { geo: T.berry, mat: vegMatNoCut, cast: true },
    flower: { geo: T.flower, mat: vegMatNoCut, cast: false },
    mushroom: { geo: T.mushroom, mat: vegMatNoCut, cast: false },
    glow: { geo: T.glow, mat: glowMat, cast: false },
    log: { geo: T.log, mat: vegMat, cast: true },
    stump: { geo: T.stump, mat: vegMatNoCut, cast: true },
    rock0: { geo: rockGeos[0], mat: rockMat, cast: true },
    rock1: { geo: rockGeos[1], mat: rockMat, cast: true },
    rock2: { geo: rockGeos[2], mat: rockMat, cast: true },
  };
  // buckets[type][chunk] = [{m, c}]
  const buckets = {};
  for (const k in types) buckets[k] = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  function put(type, x, z, scale, ry, tint = 1, tilt = 0, yOff = 0) {
    const y = height(x, z) + yOff;
    const ci = Math.floor((x + WORLD_HALF) / CHUNK) + Math.floor((z + WORLD_HALF) / CHUNK) * NCH;
    q.setFromAxisAngle(yAxis, ry);
    if (tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, tilt * 0.5)));
    m4.compose(p.set(x, y, z), q, s.set(scale, scale, scale));
    let arr = buckets[type].get(ci);
    if (!arr) buckets[type].set(ci, (arr = []));
    arr.push({ m: m4.clone(), t: tint });
  }

  const rnd = mulberry32(2024);
  const fN = makeNoise2D(91), fN2 = makeNoise2D(92);
  const excluded = (x, z, pad) => {
    const db = Math.max(Math.abs(x), Math.abs(z));
    if (db < 54 + pad) return true;
    if (pathDist(x, z) < 4.5 + pad) return true;
    if (Math.abs(z - riverZ(x)) < RIVER_HW + 3 + pad) return true;
    for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r + 4 + pad) return true;
    for (const b of BRIDGES) if (Math.abs(x - b.x) < 8 && Math.abs(z - riverZ(b.x)) < 22) return true;
    return false;
  };
  const treeSpots = [];
  // --- trees ---
  const SP = 5.2;
  for (let z = -WORLD_HALF + 4; z < WORLD_HALF - 2; z += SP) {
    for (let x = -WORLD_HALF + 4; x < WORLD_HALF - 2; x += SP) {
      const jx = x + (rnd() - 0.5) * SP * 0.9, jz = z + (rnd() - 0.5) * SP * 0.9;
      const edge = Math.max(Math.abs(jx), Math.abs(jz));
      const d = fbm(fN, jx * 0.008, jz * 0.008, 3) * 0.5 + 0.5;
      let prob = smoothstep(0.38, 0.62, d) * 0.85 + 0.06;
      const db = edge;
      prob *= smoothstep(56, 120, db) * 0.9 + 0.1;
      if (edge > 240) prob = 0.55 * (1 - smoothstep(290, 310, edge)) + 0.1;
      if (rnd() > prob) continue;
      if (excluded(jx, jz, 1.5)) continue;
      const h = height(jx, jz);
      if (h < WATER_Y + 0.3) continue;
      const b = biomeAt(jx, jz);
      const r = rnd();
      let type;
      if (b.swamp > 0.5) type = r < 0.35 ? 'dead' : r < 0.75 ? 'willow' : 'oak';
      else if (b.north > 0.5 || edge > 240) type = r < 0.72 ? 'pine' : 'oak';
      else type = r < 0.45 ? 'oak' : r < 0.68 ? 'ball' : 'pine';
      const sc = 0.8 + rnd() * 0.6 + (edge > 240 ? 0.3 : 0);
      const tint = 0.85 + rnd() * 0.25;
      put(type, jx, jz, sc, rnd() * Math.PI * 2, tint, 0, -0.2);
      treeSpots.push([jx, jz, sc, type]);
      if (edge < 250) addSolid({ type: 'circle', x: jx, z: jz, r: 0.75 * sc, bottom: h - 1, top: h + 12 * sc, walk: false, tag: null });
    }
  }
  // --- rocks ---
  for (let i = 0; i < 1300; i++) {
    const x = (rnd() * 2 - 1) * (WORLD_HALF - 10), z = (rnd() * 2 - 1) * (WORLD_HALF - 10);
    if (excluded(x, z, 0.5)) continue;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const big = rnd() < (edge > 230 ? 0.6 : 0.18);
    const sc = big ? 1.6 + rnd() * 2.4 : 0.4 + rnd() * 0.8;
    put('rock' + ((rnd() * 3) | 0), x, z, sc, rnd() * 6.28, 0.8 + rnd() * 0.35, (rnd() - 0.5) * 0.3, -0.15 * sc);
    if (sc > 1.3 && edge < 250) addSolid({ type: 'circle', x, z, r: sc * 0.9, bottom: height(x, z) - 1, top: height(x, z) + sc * 1.1, walk: false, tag: null });
  }
  // --- bushes / logs / stumps ---
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() * 2 - 1) * (WORLD_HALF - 20), z = (rnd() * 2 - 1) * (WORLD_HALF - 20);
    if (excluded(x, z, 0)) continue;
    const r = rnd();
    if (r < 0.82) put(rnd() < 0.2 ? 'berry' : 'bush', x, z, 0.7 + rnd() * 0.8, rnd() * 6.28, 0.85 + rnd() * 0.3);
    else if (r < 0.9) put('stump', x, z, 0.7 + rnd() * 0.5, rnd() * 6.28);
    else {
      put('log', x, z, 0.8 + rnd() * 0.4, rnd() * 6.28);
    }
  }
  // --- flowers in meadows ---
  const flowerCols = [0xffffff, 0xffe14d, 0xff6fa8, 0xb07cff, 0xff5a4a, 0x7ad7ff];
  for (let i = 0; i < 9000; i++) {
    const x = (rnd() * 2 - 1) * (WORLD_HALF - 30), z = (rnd() * 2 - 1) * (WORLD_HALF - 30);
    const patch = fN2(x * 0.02, z * 0.02);
    if (patch < 0.25) continue;
    if (excluded(x, z, -1)) {
      const db = Math.max(Math.abs(x), Math.abs(z));
      if (!(db > 46 && db < 54) ) continue;
    }
    const gi = Math.round((z + WORLD_HALF) / RES) * GV + Math.round((x + WORLD_HALF) / RES);
    if (COL[gi * 4 + 3] < 140) continue;
    col.setHex(flowerCols[(Math.floor(fN2(x * 0.05 + 9, z * 0.05) * 3 + 3) + ((rnd() * 2) | 0)) % flowerCols.length]);
    put('flower', x, z, 0.8 + rnd() * 0.7, rnd() * 6.28, col.getHex());
  }
  // --- mushrooms (near trees) & glow mushrooms (swamp) ---
  for (let i = 0; i < 900; i++) {
    const t = treeSpots[(rnd() * treeSpots.length) | 0];
    if (!t) break;
    const a = rnd() * 6.28, d = 1.4 + rnd() * 2.5;
    const x = t[0] + Math.cos(a) * d, z = t[1] + Math.sin(a) * d;
    const b = biomeAt(x, z);
    if (b.swamp > 0.3 || rnd() < 0.12) put('glow', x, z, 0.8 + rnd() * 1.4, rnd() * 6.28);
    else put('mushroom', x, z, 0.7 + rnd() * 0.9, rnd() * 6.28);
  }

  // build instanced meshes
  const meshes = [];
  for (const k in types) {
    const ty = types[k];
    for (const [ci, arr] of buckets[k]) {
      const im = new THREE.InstancedMesh(ty.geo, ty.mat, arr.length);
      for (let i = 0; i < arr.length; i++) {
        im.setMatrixAt(i, arr[i].m);
        if (arr[i].t > 2) col.setHex(arr[i].t);
        else col.setScalar(arr[i].t);
        im.setColorAt(i, col);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = ty.cast;
      im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      im.updateMatrix();
      im.name = 'veg_' + k + '_' + ci;
      scene.add(im);
      meshes.push(im);
    }
  }

  // soft canopy shade baked into the ground + grass colors (fake AO under trees)
  applyCanopyShade(treeSpots.map(([x, z, sc, type]) => [x, z, (type === 'pine' ? 3.6 : type === 'dead' ? 1.6 : 4.2) * sc]));
  const grass = buildGrass(scene, quality.grass);
  const fireflies = buildFireflies(scene);
  return { meshes, grass, fireflies, setGrassCount: (n) => rebuildGrass(grass, n) };
}

// ---------------- GPU grass ----------------
const GRASS_R = 56;
function grassGeometry(count) {
  const TILE = GRASS_R * 2;
  const r = mulberry32(777);
  const blades = 3;
  const pos = new Float32Array(count * blades * 9);
  const tuft = new Float32Array(count * blades * 9);
  const tip = new Float32Array(count * blades * 3);
  let v = 0;
  for (let i = 0; i < count; i++) {
    const tx = r() * TILE, tz = r() * TILE, seed = r();
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + r() * 0.8;
      const lean = 0.18 + r() * 0.25;
      const h = 0.75 + r() * 0.7;
      const w = 0.13 + r() * 0.07;
      const ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const verts = [
        [ox - px, 0, oz - pz, 0],
        [ox + px, 0, oz + pz, 0],
        [ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean, 1],
      ];
      for (const vv of verts) {
        pos[v * 3] = vv[0];
        pos[v * 3 + 1] = vv[1];
        pos[v * 3 + 2] = vv[2];
        tuft[v * 3] = tx;
        tuft[v * 3 + 1] = tz;
        tuft[v * 3 + 2] = seed;
        tip[v] = vv[3];
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTuft', new THREE.BufferAttribute(tuft, 3));
  g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

export const grassUniforms = {
  uCenter: { value: new THREE.Vector2() },
};

function buildGrass(scene, count) {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uPlayer = U.uPlayer;
    sh.uniforms.uCenter = grassUniforms.uCenter;
    sh.uniforms.uHeightTex = { value: heightTex };
    sh.uniforms.uColorTex = { value: colorTex };
    sh.uniforms.uCloudTex = U.uCloudTex;
    sh.uniforms.uCloudAmt = U.uCloudAmt;
    sh.vertexShader =
      `uniform float uTime; uniform vec3 uPlayer; uniform vec2 uCenter; uniform sampler2D uHeightTex; uniform sampler2D uColorTex;
       attribute vec3 aTuft; attribute float aTip; varying vec3 vGCol; varying vec3 vNWorld;
       float hAt(vec2 p){
         vec2 g = (p + ${WORLD_HALF.toFixed(1)}) / ${RES.toFixed(1)};
         vec2 i = floor(g); vec2 f = g - i;
         float tx = 1.0 / ${GV.toFixed(1)};
         vec2 uv = (i + 0.5) * tx;
         float h00 = texture2D(uHeightTex, uv).r;
         float h10 = texture2D(uHeightTex, uv + vec2(tx, 0.0)).r;
         float h01 = texture2D(uHeightTex, uv + vec2(0.0, tx)).r;
         float h11 = texture2D(uHeightTex, uv + vec2(tx, tx)).r;
         if (f.x > f.y) return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
         return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
       }
      ` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      `float TILE = ${(GRASS_R * 2).toFixed(1)};
       vec2 wp = uCenter + mod(aTuft.xy - uCenter, TILE) - TILE * 0.5;
       float sd = aTuft.z;
       float ang = sd * 6.2831;
       float cs = cos(ang), sn = sin(ang);
       vec3 lp = vec3(position.x * cs - position.z * sn, position.y, position.x * sn + position.z * cs);
       vec2 tuv = (wp + ${WORLD_HALF.toFixed(1)}) / ${(WORLD_HALF * 2).toFixed(1)};
       vec4 tc = texture2D(uColorTex, tuv);
       float h = hAt(wp);
       float dist = length(wp - uCenter);
       float fade = 1.0 - smoothstep(${(GRASS_R * 0.72).toFixed(1)}, ${(GRASS_R * 0.98).toFixed(1)}, dist);
       float keep = step(fract(sd * 13.17), tc.a * 1.1 - 0.05);
       float sc = keep * fade * (0.75 + fract(sd * 7.31) * 0.6);
       lp *= sc;
       float wv = sin(uTime * 1.9 + wp.x * 0.12 + wp.y * 0.08) + 0.5 * sin(uTime * 3.1 + wp.x * 0.37);
       lp.x += wv * 0.22 * aTip * sc;
       lp.z += cos(uTime * 1.6 + wp.y * 0.2) * 0.14 * aTip * sc;
       vec2 dp = wp - uPlayer.xz;
       float pd = length(dp);
       float push = (1.0 - smoothstep(0.4, 2.4, pd)) * aTip * step(abs(uPlayer.y - h), 3.0);
       lp.xz += normalize(dp + 0.0001) * push * 0.9;
       lp.y -= push * 0.45 * sc;
       vec3 transformed = vec3(wp.x, h, wp.y) + lp;
       float hv = fract(sd * 5.31);
       vec3 tint = mix(vec3(1.0), vec3(1.2, 1.08, 0.66), step(0.88, hv));
       tint = mix(tint, vec3(0.8, 1.06, 0.84), step(hv, 0.14));
       float grad = aTip * aTip * 0.45 + aTip * 0.55;
       vGCol = tc.rgb * tint * mix(0.42, 1.32, grad) * (0.9 + fract(sd * 3.7) * 0.2);
       vNWorld = transformed;`
    );
    sh.fragmentShader =
      `varying vec3 vGCol; varying vec3 vNWorld; uniform sampler2D uCloudTex; uniform float uCloudAmt; uniform float uTime;\n` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vGCol;');
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       { float cn = texture2D(uCloudTex, vNWorld.xz * 0.0032 + vec2(uTime * 0.0055, uTime * 0.0032)).r;
         float cs2 = mix(1.0, 0.45, smoothstep(0.5, 0.74, cn) * uCloudAmt);
         reflectedLight.directDiffuse *= cs2; }`
    );
  };
  mat.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.Mesh(grassGeometry(count), mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'grass';
  scene.add(mesh);
  return mesh;
}
function rebuildGrass(mesh, count) {
  mesh.geometry.dispose();
  mesh.geometry = grassGeometry(count);
}

// ---------------- fireflies ----------------
function buildFireflies(scene) {
  const N = 260;
  const r = mulberry32(5);
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = r() * 120;
    pos[i * 3 + 1] = 0.6 + r() * 4;
    pos[i * 3 + 2] = r() * 120;
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uCenter: grassUniforms.uCenter, uAmt: { value: 0 }, uTex: { value: TEX.sprite }, uHeightTex: { value: heightTex } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uCenter; uniform float uAmt; uniform sampler2D uHeightTex;
      attribute float aSeed; varying float vA;
      void main(){
        float T = 120.0;
        vec2 wp = uCenter + mod(position.xz - uCenter, T) - T*0.5;
        wp += vec2(sin(uTime*0.5 + aSeed*30.0), cos(uTime*0.4 + aSeed*17.0)) * 2.0;
        vec2 tuv = (wp + ${WORLD_HALF.toFixed(1)}) / ${(WORLD_HALF * 2).toFixed(1)};
        float h = texture2D(uHeightTex, tuv).r;
        vec3 p = vec3(wp.x, h + position.y + sin(uTime*1.3 + aSeed*10.0)*0.6, wp.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed*2.0) + aSeed * 40.0);
        vA = uAmt * blink * (1.0 - smoothstep(40.0, 58.0, length(wp - uCenter)));
        gl_PointSize = (90.0 / -mv.z) * (0.6 + aSeed*0.6) * (${(window.devicePixelRatio || 1).toFixed(2)});
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; varying float vA;
      void main(){
        float a = texture2D(uTex, gl_PointCoord).a * vA;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.45) * 3.0 * a, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  scene.add(pts);
  return pts;
}
