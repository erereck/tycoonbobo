// Hand-placed forest set dressing: bridges, goblin camps, wolf den, swamp ruins, signposts,
// campfires, and the Goblin King's arena (reached only through the portal).
import * as THREE from 'three';
import { G } from '../G.js';
import { PartBuilder } from '../engine/parts.js';
import { addSolids } from '../engine/physics.js';
import { height } from './terrain.js';
import { CAMPS, BRIDGES, riverZ, ARENA, SIGNS, WATER_Y } from './layout.js';
import { mulberry32 } from '../util.js';
import { sfx } from '../engine/audio.js';

const fires = [];

function tent(b, x, z, rot, color) {
  const y = height(x, z);
  const r = [0, rot, 0];
  b.cone(4.2, 6.5, x, y + 3.25, z, { mat: 'fabric', color, seg: 6, rot: r });
  b.cyl(0.18, 0.18, 7.6, x, y + 3.8, z, { mat: 'wood', color: 0x5a391e });
  b.box(1.8, 2.6, 0.2, x + Math.sin(rot) * 3.3, y + 1.3, z + Math.cos(rot) * 3.3, { mat: 'fabric', color: 0x2a1a10, rot: r });
  b.solid({ type: 'circle', x, z, r: 3.4, bottom: y - 1, top: y + 6, walk: false });
}
function palisade(b, cx, cz, r, gapA, gapW) {
  const n = Math.floor((Math.PI * 2 * r) / 1.3);
  const rnd = mulberry32(Math.floor(cx * 7 + cz));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let da = Math.abs(((a - gapA + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    if (da < gapW) continue;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = height(x, z);
    const h = 4.5 + rnd() * 1.6;
    b.cyl(0.55, 0.6, h, x, y + h / 2 - 0.3, z, { mat: 'wood', color: 0x6b4a2b, seg: 6 });
    b.cone(0.55, 1.1, x, y + h + 0.2, z, { mat: 'wood', color: 0x8a6a45, seg: 6 });
    b.solid({ type: 'circle', x, z, r: 0.75, bottom: y - 1, top: y + h, walk: false });
  }
}
function campfire(b, x, z) {
  const y = height(x, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.sphere(0.5, x + Math.cos(a) * 1.4, y + 0.2, z + Math.sin(a) * 1.4, { mat: 'stone', color: 0x77736c, ico: 0 });
  }
  b.cyl(0.2, 0.25, 2.4, x, y + 0.4, z, { mat: 'wood', color: 0x4a2c16, rot: [0, 0, 1.2] });
  b.cyl(0.2, 0.25, 2.4, x, y + 0.4, z, { mat: 'wood', color: 0x4a2c16, rot: [0, 1.6, 1.2] });
  b.sphere(0.5, x, y + 0.5, z, { mat: 'neon', color: 0xff7a20, ico: 0, emissive: 3 });
  b.solid({ type: 'circle', x, z, r: 1.4, bottom: y - 1, top: y + 1, walk: false });
  G.sky.addLight(x, y + 2, z, 0xff8a30, 2.6, { flicker: 1, range: 30 });
  fires.push({ x, y: y + 0.6, z });
}
function totemPole(b, x, z) {
  const y = height(x, z);
  b.box(1.4, 7, 1.4, x, y + 3.5, z, { mat: 'wood', color: 0x7a4a24, solid: true });
  b.box(2.2, 1.6, 1.8, x, y + 6.2, z, { mat: 'plastic', color: 0x76b043 });
  b.box(0.4, 0.3, 0.1, x - 0.5, y + 6.4, z + 0.92, { mat: 'neon', color: 0xff2a1a });
  b.box(0.4, 0.3, 0.1, x + 0.5, y + 6.4, z + 0.92, { mat: 'neon', color: 0xff2a1a });
  b.cone(0.5, 1.6, x - 1.3, y + 6.6, z, { mat: 'plastic', color: 0x76b043, rot: [0, 0, 1.9] });
  b.cone(0.5, 1.6, x + 1.3, y + 6.6, z, { mat: 'plastic', color: 0x76b043, rot: [0, 0, -1.9] });
  b.box(3.4, 1.2, 0.2, x, y + 4.2, z + 0.8, { mat: 'fabric', color: 0xa01e1e });
}
function bridge(b, x, w) {
  const zc = riverZ(x);
  const len = 30;
  const y = 0.55;
  b.box(w, 0.5, len, x, y - 0.25, zc, { mat: 'wood', color: 0x8a5a2b, solid: true });
  for (let z = zc - len / 2 + 1; z < zc + len / 2; z += 1.6) b.box(w + 0.6, 0.12, 1.3, x, y + 0.05, z, { mat: 'wood', color: 0x9e6a3a, cast: false });
  for (const sx of [-1, 1]) {
    const rx = x + (sx * w) / 2;
    for (let z = zc - len / 2; z <= zc + len / 2; z += 5) {
      b.box(0.5, 3.2, 0.5, rx, y + 1.3, z, { mat: 'wood', color: 0x5a391e });
      b.box(0.6, 4.8, 0.6, rx, y - 2.6, z, { mat: 'wood', color: 0x4a2c16 });
    }
    b.box(0.35, 0.35, len, rx, y + 2.6, zc, { mat: 'wood', color: 0x7a4a24 });
    b.solid({ type: 'box', minX: rx - 0.3, maxX: rx + 0.3, minZ: zc - len / 2, maxZ: zc + len / 2, bottom: y, top: y + 3, walk: false });
  }
}
function signpost(b, x, z, text) {
  const y = height(x, z);
  b.box(0.5, 4.2, 0.5, x, y + 2.1, z, { mat: 'wood', color: 0x5a391e, solid: true });
  b.box(5.2, 1.3, 0.3, x, y + 3.6, z, { mat: 'wood', color: 0x9e6a3a });
  G.ui.worldLabel({ x, y: y + 5.2, z, cls: 'wl-sign', html: text, level: 0, maxDist: 70 });
}
function ruins(b, x, z, rnd) {
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 7;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = height(px, pz);
    const h = 2 + rnd() * 6;
    b.box(1.8, h, 1.8, px, y + h / 2 - 0.3, pz, { mat: 'stone', color: 0x8f9188, rot: [0, rnd() * 3, (rnd() - 0.5) * 0.2], solid: true });
    b.box(2.2, 0.6, 2.2, px, y + h, pz, { mat: 'grass', color: 0x4f8a35, rot: [0, rnd() * 3, 0] });
  }
}

export function buildForest(scene) {
  const b = new PartBuilder({});
  const rnd = mulberry32(31);
  for (const br of BRIDGES) bridge(b, br.x, br.w);
  for (const c of CAMPS) {
    if (c.kind === 'goblinCamp') {
      palisade(b, c.x, c.z, c.r + 3, Math.PI / 2 + 0.2, 0.45);
      tent(b, c.x - 12, c.z - 10, 0.5, 0x7a3a2a);
      tent(b, c.x + 13, c.z - 9, -0.6, 0x5a6a2a);
      tent(b, c.x - 15, c.z + 6, 1.2, 0x6a4a2a);
      campfire(b, c.x, c.z + 3);
      totemPole(b, c.x + 4, c.z - 16);
      totemPole(b, c.x - 4, c.z - 16);
      // crates
      for (let i = 0; i < 5; i++) {
        const x = c.x + 12 + rnd() * 6, z = c.z + 4 + rnd() * 8;
        b.box(1.8, 1.8, 1.8, x, height(x, z) + 0.9, z, { mat: 'wood', color: 0x9a6a3c, rot: [0, rnd() * 2, 0], solid: true });
      }
    } else if (c.kind === 'goblin') {
      tent(b, c.x - 8, c.z - 6, 0.3, 0x6a3a2a);
      tent(b, c.x + 9, c.z - 5, -0.4, 0x4a5a2a);
      campfire(b, c.x, c.z + 1);
      totemPole(b, c.x, c.z - 11);
    } else if (c.kind === 'wolf') {
      // den: rock ring + bones
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
        if (Math.abs(a - Math.PI * 0.5) < 0.6) continue;
        const r = c.r + 1 + rnd() * 2;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const s = 1.8 + rnd() * 1.8;
        b.sphere(s, x, height(x, z) + s * 0.3, z, { mat: 'stone', color: 0x77756e, ico: 0, scale: [1, 0.75, 1] });
        b.solid({ type: 'circle', x, z, r: s * 0.9, bottom: height(x, z) - 1, top: height(x, z) + s, walk: false });
      }
      for (let i = 0; i < 6; i++) {
        const x = c.x + (rnd() - 0.5) * 10, z = c.z + (rnd() - 0.5) * 10;
        b.cyl(0.18, 0.18, 1.6, x, height(x, z) + 0.2, z, { mat: 'plastic', color: 0xeee6d0, rot: [Math.PI / 2, rnd() * 3, 0], cast: false });
      }
    } else if (c.kind === 'golem') {
      ruins(b, c.x, c.z, rnd);
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, r = c.r + 2 + rnd() * 6;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        b.box(2 + rnd() * 3, 0.06, 2 + rnd() * 3, x, height(x, z) + 0.05, z, { mat: 'glass', color: 0x3a6a4a, opacity: 0.7, cast: false });
      }
    } else if (c.kind === 'slime') {
      for (let i = 0; i < 4; i++) {
        const x = c.x + (rnd() - 0.5) * 16, z = c.z + (rnd() - 0.5) * 16;
        b.box(2 + rnd() * 2, 0.08, 2 + rnd() * 2, x, height(x, z) + 0.06, z, { mat: 'slime', color: 0x5fe04a, opacity: 0.6, cast: false, rot: [0, rnd() * 3, 0] });
      }
    }
  }
  for (const s of SIGNS) signpost(b, s.x, s.z, s.text);
  // scattered ruins
  ruins(b, 60, -70, rnd);
  ruins(b, -60, 80, rnd);
  ruins(b, 200, 10, rnd);
  const g = b.build('forest');
  scene.add(g);
  addSolids(b.solids);
  buildArena(scene);
  return { fires };
}

// ---------------- Boss arena ----------------
function buildArena(scene) {
  const b = new PartBuilder({});
  const { x, z } = ARENA;
  const R = ARENA.r + 4;
  // floor
  b.box(240, 4, 240, x, -2, z, { mat: 'grass', color: 0x3d4a2a, solid: true, cast: false });
  b.box(96, 0.3, 96, x, 0.0, z, { mat: 'stone', color: 0x5d5a52, cast: false });
  b.cyl(R, R, 0.3, x, 0.12, z, { mat: 'stone', color: 0x7a766c, seg: 48, cast: false });
  b.cyl(R * 0.55, R * 0.55, 0.36, x, 0.14, z, { mat: 'brick', color: 0x8a3a2a, seg: 40, cast: false });
  b.cyl(R * 0.2, R * 0.2, 0.42, x, 0.18, z, { mat: 'gold', color: 0xb08a30, seg: 24, cast: false });
  // walls (ring of tall blocks)
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wx = x + Math.cos(a) * (R + 3), wz = z + Math.sin(a) * (R + 3);
    const south = Math.sin(a) > 0.25;
    const h = south ? 2.6 : 14 + (i % 3) * 3;
    b.box(9, h, 4, wx, h / 2, wz, { mat: 'stone', color: 0x6d6a62, rot: [0, -a + Math.PI / 2, 0] });
    if (south) {
      if (i % 2 === 0) {
        const tx = x + Math.cos(a) * (R + 0.6), tz = z + Math.sin(a) * (R + 0.6);
        b.box(0.5, 3.6, 0.5, tx, 1.8, tz, { mat: "wood", color: 0x4a2c16 });
        b.sphere(0.55, tx, 4.0, tz, { mat: "neon", color: 0xff7a20, ico: 0, emissive: 3 });
        fires.push({ x: tx, y: 4.2, z: tz });
      }
    } else if (i % 2 === 0) {
      b.box(2.2, 2.4, 2.2, wx, h + 1.2, wz, { mat: 'stone', color: 0x5d5a52, rot: [0, -a, 0] });
      // torches
      const tx = x + Math.cos(a) * (R + 0.6), tz = z + Math.sin(a) * (R + 0.6);
      b.box(0.5, 4, 0.5, tx, 2, tz, { mat: 'wood', color: 0x4a2c16 });
      b.sphere(0.55, tx, 4.4, tz, { mat: 'neon', color: 0xff7a20, ico: 0, emissive: 3 });
      if (i % 4 === 0) G.sky.addLight(tx, 5, tz, 0xff8030, 2.6, { flicker: 1, range: 40 });
      fires.push({ x: tx, y: 4.6, z: tz });
    } else {
      // banners
      const bx = x + Math.cos(a) * (R + 0.8), bz = z + Math.sin(a) * (R + 0.8);
      b.box(3.2, 7, 0.2, bx, 8, bz, { mat: 'fabric', color: 0xa01e1e, rot: [0, -a + Math.PI / 2, 0] });
      b.box(1.2, 1.2, 0.25, bx, 9, bz, { mat: 'plastic', color: 0x76b043, rot: [0, -a + Math.PI / 2, 0] });
    }
  }
  // throne at the north
  const tz0 = z - R + 2;
  b.box(10, 1.6, 6, x, 0.8, tz0, { mat: 'stone', color: 0x4a4740 });
  b.box(6.5, 3, 3.5, x, 3.1, tz0 - 0.5, { mat: 'gold', color: 0xd4a530 });
  b.box(7, 10, 1.4, x, 7, tz0 - 2, { mat: 'gold', color: 0xd4a530 });
  b.box(5.6, 8, 0.4, x, 7, tz0 - 1.2, { mat: 'fabric', color: 0x8a1414 });
  for (const sx of [-3.8, 3.8]) b.cone(0.7, 2.4, x + sx, 13.2, tz0 - 2, { mat: 'gold', color: 0xd4a530, seg: 6 });
  b.sphere(1, x, 12.5, tz0 - 2, { mat: 'neon', color: 0x6aff5a, ico: 0, emissive: 2.6 });
  // pillars inside
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = x + Math.cos(a) * 20, pz = z + Math.sin(a) * 20;
    b.cyl(1.6, 1.9, 11, px, 5.5, pz, { mat: 'stone', color: 0x7a766c, seg: 10, solid: true });
    b.box(4.2, 1, 4.2, px, 11.4, pz, { mat: 'stone', color: 0x5d5a52 });
  }
  // dark backdrop cliffs outside
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.sin(a) > -0.15) continue;
    const cx = x + Math.cos(a) * (R + 22), cz = z + Math.sin(a) * (R + 22);
    b.box(26, 40, 20, cx, 18, cz, { mat: 'stone', color: 0x3d3a35, rot: [0, -a, 0], cast: false });
  }
  const g = b.build('arena');
  scene.add(g);
  addSolids(b.solids);
  // exit portal (after victory) is handled by boss module
}

export function updateForest(dt) {
  // crackle from the nearest campfire
  const pl = G.player?.pos;
  if (pl && Math.random() < dt * 2.5) {
    let best = null, bd = 32;
    for (const f of fires) {
      const d = Math.abs(f.x - pl.x) + Math.abs(f.z - pl.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) sfx("crackle", { x: best.x, z: best.z, range: 40, vol: 0.8 });
  }
  for (const f of fires) {
    if (Math.random() < dt * 10) {
      const p = G.player?.pos;
      if (p && Math.abs(p.x - f.x) + Math.abs(p.z - f.z) > 120) continue;
      G.fx.add.emit(f.x + (Math.random() - 0.5) * 0.8, f.y, f.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 3, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, 1.3, 0.2, 0xffb040, 0xff3000, 1, -2, 0.5);
      if (Math.random() < 0.3) G.fx.smoke(f.x, f.y + 2, f.z, 0x555555, 1.2);
    }
  }
  void WATER_Y;
}
