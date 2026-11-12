// Geometry for every tycoon structure, written like building in Roblox Studio with parts.
import * as THREE from 'three';
import { getMat, TEX } from '../engine/materials.js';

export const BLD = { x0: -30, x1: 30, z0: -24, z1: 10 };
export const LV = [0, 12, 24];
export const BELT_Z = -19;
export const BELT_TOP = 1.8;
export const BELT_X0 = -21, BELT_X1 = 18;
export const TEAM = 0x0d69ac;
export const ACCENT = 0xf5cd30;

// ---- plot / ground ----
export function plot(b) {
  b.box(88, 0.6, 88, 0, -0.3, 0, { mat: 'studs', color: 0x4a8a3a, solid: true, cast: false });
  // team border
  for (const [sx, sz, x, z] of [[88, 1, 0, -43.5], [88, 1, 0, 43.5], [1, 88, -43.5, 0], [1, 88, 43.5, 0]]) b.box(sx, 0.25, sz, x, 0.12, z, { mat: 'studs', color: TEAM, cast: false });
  // paved walkways
  b.box(12, 0.1, 34, 0, 0.05, 27, { mat: 'studs', color: 0xa3a2a5, cast: false });
  b.box(14, 0.1, 20, 0, 0.05, -34, { mat: 'studs', color: 0xa3a2a5, cast: false });
  b.box(14, 0.1, 10, -37, 0.05, 0, { mat: 'studs', color: 0xa3a2a5, cast: false });
  b.box(14, 0.1, 10, 37, 0.05, 0, { mat: 'studs', color: 0xa3a2a5, cast: false });
  // building floor
  b.box(60, 0.12, 34, 0, 0.06, -7, { mat: 'studs', color: 0x6c6f75, cast: false });
}

export function fence0(b) {
  // humble starting workshop: low wooden fence around the footprint
  const W = 'wood', C = 0x9a6a3c;
  const posts = [];
  for (let x = -30; x <= 30; x += 5) posts.push([x, -24]);
  for (let z = -19; z <= 10; z += 5) { posts.push([-30, z]); posts.push([30, z]); }
  for (const [x, z] of posts) b.box(0.8, 3.4, 0.8, x, 1.7, z, { mat: W, color: 0x7a5230 });
  b.box(60, 0.5, 0.4, 0, 1.2, -24, { mat: W, color: C, solid: true });
  b.box(60, 0.5, 0.4, 0, 2.6, -24, { mat: W, color: C });
  for (const x of [-30, 30]) {
    b.box(0.4, 0.5, 34, x, 1.2, -7, { mat: W, color: C, solid: true });
    b.box(0.4, 0.5, 34, x, 2.6, -7, { mat: W, color: C });
  }
  // fence solids need height
  for (const s of b.solids) { s.bottom = 0; s.top = 3; }
}

// ---- conveyor ----
export function conveyor(b, yb) {
  const top = yb + BELT_TOP;
  const len = BELT_X1 - BELT_X0, cx = (BELT_X0 + BELT_X1) / 2;
  b.box(len, 0.3, 4, cx, top - 0.15, BELT_Z, { mat: 'belt', color: 0xffffff, cast: false });
  b.box(len, 0.9, 0.5, cx, top + 0.1, BELT_Z - 2.25, { mat: 'metal', color: 0x3d4148 });
  b.box(len, 0.9, 0.5, cx, top + 0.1, BELT_Z + 2.25, { mat: 'metal', color: 0x3d4148 });
  b.box(len, 0.25, 0.6, cx, top + 0.62, BELT_Z + 2.25, { mat: 'plastic', color: ACCENT });
  b.box(len, 0.25, 0.6, cx, top + 0.62, BELT_Z - 2.25, { mat: 'plastic', color: ACCENT });
  b.box(len, 1.2, 4.2, cx, yb + 0.6, BELT_Z, { mat: 'metal', color: 0x2c2f35 });
  for (let x = BELT_X0 + 1; x < BELT_X1; x += 6) {
    b.box(0.6, top - yb, 0.6, x, yb + (top - yb) / 2, BELT_Z - 1.8, { mat: 'metal', color: 0x50555e });
    b.box(0.6, top - yb, 0.6, x, yb + (top - yb) / 2, BELT_Z + 1.8, { mat: 'metal', color: 0x50555e });
  }
  b.cyl(0.45, 0.45, 4.2, BELT_X0, top - 0.3, BELT_Z, { mat: 'metal', color: 0x777d86, rot: [Math.PI / 2, 0, 0], seg: 12 });
  b.solid({ type: 'box', minX: BELT_X0 - 0.5, maxX: BELT_X1, minZ: BELT_Z - 2.6, maxZ: BELT_Z + 2.6, bottom: yb, top: top + 0.7 });
}

// ---- droppers ----
export const DROPPER_STYLE = {
  manual: { body: 'wood', color: 0x8a5a2b, trim: 0xc4281c, neon: 0xff5040 },
  wood: { body: 'wood', color: 0xa06a36, trim: 0x6b4426, neon: 0x7cff5a },
  stone: { body: 'stone', color: 0x8d8f94, trim: 0x55585e, neon: 0x5ab8ff },
  crystal: { body: 'plastic', color: 0x6a3fb0, trim: 0x2b1a4a, neon: 0xd46aff },
  royal: { body: 'gold', color: 0xffcc40, trim: 0x8a5a10, neon: 0xffe080 },
};
export function dropper(b, x, yb, style, anims) {
  const S = DROPPER_STYLE[style];
  const z = BELT_Z;
  // support pillar + arm
  b.box(1.1, 9.4, 1.1, x, yb + 4.7, -22.6, { mat: 'metal', color: 0x3d4148, solid: true });
  b.box(1.1, 0.9, 4.2, x, yb + 9.1, -21.0, { mat: 'metal', color: 0x3d4148 });
  // hopper
  b.box(3.2, 2.8, 3.2, x, yb + 7.7, z, { mat: S.body, color: S.color });
  b.box(3.5, 0.45, 3.5, x, yb + 9.25, z, { mat: 'plastic', color: S.trim });
  b.box(3.5, 0.35, 3.5, x, yb + 6.4, z, { mat: 'plastic', color: S.trim });
  b.cyl(1.35, 0.55, 1.3, x, yb + 5.6, z, { mat: 'metal', color: 0x50555e, seg: 10 });
  b.box(0.95, 0.5, 0.95, x, yb + 4.75, z, { mat: 'metal', color: 0x2c2f35 });
  // status lights
  b.box(0.5, 0.5, 0.15, x - 0.8, yb + 8.4, z + 1.62, { mat: 'neon', color: S.neon });
  b.box(0.5, 0.5, 0.15, x + 0.8, yb + 8.4, z + 1.62, { mat: 'neon', color: S.neon });
  if (style === 'crystal' || style === 'royal') {
    b.sphere(0.7, x, yb + 10.1, z, { mat: 'neon', color: S.neon, ico: 0, emissive: 2 });
  }
  // spinning gear (animated separate mesh)
  if (anims) {
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 6, 10), getMat('metal', 0xb0b5bc, { tag: b.tag }));
    gear.position.set(x + 1.68, yb + 7.7, z);
    gear.rotation.y = Math.PI / 2;
    gear.castShadow = true;
    anims.push({ mesh: gear, tag: b.tag, fn: (dt, k) => (gear.rotation.x += dt * (1.5 + k * 10)) });
  }
  return { x, y: yb + 4.6, z };
}

// manual crank station
export function manualStation(b, x, anims) {
  const out = dropper(b, x, 0, 'manual', anims);
  // pedestal with big red button
  b.box(2.2, 2.4, 2.2, x, 1.2, -13.6, { mat: 'metal', color: 0x3d4148, solid: true });
  b.box(2.6, 0.4, 2.6, x, 2.6, -13.6, { mat: 'plastic', color: ACCENT });
  b.box(2.0, 0.3, 0.25, x, 1.6, -12.45, { mat: 'neon', color: 0xff3020 });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.55, 20), getMat('emissive', 0xe0261c, { emissive: 0.6 }));
  btn.position.set(x, 3.05, -13.6);
  btn.castShadow = true;
  return { out, btn };
}

// ---- furnace ----
export function furnace(b, yb, arcane = false) {
  const x0 = 18.2, x1 = 25.5, z0 = -23.5, z1 = -14.5;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mat = arcane ? 'stone' : 'brick';
  const col = arcane ? 0x4a3a6a : 0xa34a32;
  const glow = arcane ? 0x6af0ff : 0xff7a20;
  b.box(x1 - x0, 7.5, z1 - z0, cx, yb + 3.75, cz, { mat, color: col, solid: true });
  b.box(x1 - x0 + 0.6, 0.8, z1 - z0 + 0.6, cx, yb + 7.6, cz, { mat: 'stone', color: 0x55585e });
  // mouth facing -x at belt
  b.box(0.3, 2.6, 4.2, x0 - 0.05, yb + BELT_TOP + 1.2, BELT_Z, { mat: 'neon', color: glow, emissive: 2.8 });
  b.box(0.8, 0.6, 5.4, x0 - 0.2, yb + BELT_TOP + 2.8, BELT_Z, { mat: 'stone', color: 0x3a3c40 });
  // front grate glow (south face)
  b.box(3.2, 1.6, 0.3, cx, yb + 1.4, z1 + 0.05, { mat: 'neon', color: glow, emissive: 2.2 });
  for (let i = -1; i <= 1; i++) b.box(0.25, 1.8, 0.4, cx + i * 0.9, yb + 1.4, z1 + 0.15, { mat: 'metal', color: 0x222222 });
  // chimney
  b.cyl(1.2, 1.4, arcane ? 3.0 : 3.0, cx + 1.5, yb + 9.4, cz - 1.5, { mat, color: col, seg: 10 });
  b.cyl(1.45, 1.45, 0.5, cx + 1.5, yb + 10.9, cz - 1.5, { mat: 'stone', color: 0x3a3c40, seg: 10 });
  // sign
  b.box(4.5, 1.2, 0.3, cx, yb + 6.3, z1 + 0.2, { mat: 'plastic', color: arcane ? 0x2b1a4a : 0x3a2418 });
  b.light(x0 - 1.2, yb + BELT_TOP + 1.5, BELT_Z, glow, 1.1);
  return { mouthX: x0 - 0.2, smoke: [cx + 1.5, yb + 11.2, cz - 1.5], glow };
}

// ---- upgraders ----
export const UPG = {
  lavador: { color: 0x3ab8ff, frame: 0xd8dde3, name: 'Lavador' },
  forja: { color: 0xff6a1a, frame: 0x3a2a26, name: 'Forja de Lava' },
  encantador: { color: 0xd24aff, frame: 0x2b1a4a, name: 'Encantador' },
};
export function upgrader(b, x, yb, kind, anims) {
  const U = UPG[kind];
  const top = yb + BELT_TOP;
  b.box(1, 5.2, 1, x, top + 2.4, BELT_Z - 2.9, { mat: 'metal', color: U.frame });
  b.box(1, 5.2, 1, x, top + 2.4, BELT_Z + 2.9, { mat: 'metal', color: U.frame });
  b.box(1.3, 1, 7, x, top + 5.2, BELT_Z, { mat: 'metal', color: U.frame });
  b.box(1.4, 0.35, 7.2, x, top + 5.8, BELT_Z, { mat: 'neon', color: U.color });
  b.box(0.4, 0.4, 5.6, x, top + 4.5, BELT_Z, { mat: 'neon', color: U.color });
  if (kind === 'forja') {
    b.box(3.6, 0.6, 3.6, x, top + 6.0, BELT_Z, { mat: 'stone', color: 0x2a2220 });
    b.box(3.0, 0.2, 3.0, x, top + 6.35, BELT_Z, { mat: 'neon', color: 0xff5010, emissive: 2.6 });
  }
  if (kind === 'lavador') {
    b.cyl(1.4, 1.4, 1.6, x, top + 6.7, BELT_Z, { mat: 'glass', color: 0x7ad0ff, opacity: 0.5, seg: 14 });
  }
  if (kind === 'encantador') {
    b.sphere(1.0, x, top + 7.0, BELT_Z, { mat: 'neon', color: 0xe080ff, ico: 0, emissive: 2.2 });
  }
  // shimmering curtain (separate, additive)
  const cm = new THREE.MeshBasicMaterial({ color: new THREE.Color(U.color).multiplyScalar(1.3), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.4), cm);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(x, top + 1.9, BELT_Z);
  curtain.renderOrder = 6;
  if (anims) anims.push({ mesh: curtain, tag: b.tag, fn: () => (cm.opacity = 0.28 + Math.sin(performance.now() * 0.006 + x) * 0.1) });
  b.solid({ type: 'box', minX: x - 0.6, maxX: x + 0.6, minZ: BELT_Z - 3.5, maxZ: BELT_Z - 2.4, bottom: yb, top: top + 6 });
  b.solid({ type: 'box', minX: x - 0.6, maxX: x + 0.6, minZ: BELT_Z + 2.4, maxZ: BELT_Z + 3.5, bottom: yb, top: top + 6 });
  return { x, color: U.color };
}

// ---- vault + collect pad ----
export function vault(b) {
  const x = 23, z = 2;
  b.box(4.6, 5.2, 4.4, x, 2.6, z, { mat: 'metal', color: 0x3c4048, solid: true });
  b.box(5.0, 0.5, 4.8, x, 5.45, z, { mat: 'gold', color: 0xffc940 });
  b.box(5.0, 0.5, 4.8, x, 0.25, z, { mat: 'gold', color: 0xffc940 });
  b.cyl(1.7, 1.7, 0.4, x, 2.7, z + 2.3, { mat: 'metal', color: 0x6a707a, rot: [Math.PI / 2, 0, 0], seg: 24 });
  b.torus(1.0, 0.13, x, 2.7, z + 2.55, { mat: 'gold', color: 0xffd040, ts: 20 });
  for (let i = 0; i < 4; i++) b.box(0.18, 2.0, 0.18, x, 2.7, z + 2.6, { mat: 'gold', color: 0xffd040, rot: [0, 0, (i * Math.PI) / 4] });
  b.box(2.6, 0.6, 0.2, x, 4.6, z + 2.25, { mat: 'neon', color: 0x40ff70 });
  return { pos: new THREE.Vector3(x, 0, z + 2.6) };
}
export function pad(b, x, y, z, color = 0x2ee05a, w = 4) {
  b.box(w + 0.6, 0.3, w + 0.6, x, y + 0.15, z, { mat: 'plastic', color: 0x2a2d33, cast: false });
}

// ---- building stage 1: L0 walls + L1 slab + stairs ----
export function rampSteps(b, x0, x1, zLow, zHigh, h0, h1, mat, color) {
  // visual stepped block from zLow (h0) to zHigh (h1)
  const n = Math.round(Math.abs(zHigh - zLow));
  const dir = Math.sign(zHigh - zLow);
  for (let i = 0; i < n; i++) {
    const za = zLow + dir * i, zb = zLow + dir * (i + 1);
    const top = h0 + ((h1 - h0) * (i + 1)) / n;
    const bottom = h0 > 0 ? h0 - 0.01 : 0;
    const hgt = top - bottom;
    b.box(x1 - x0, hgt, 1, (x0 + x1) / 2, bottom + hgt / 2, (za + zb) / 2, { mat, color });
    b.box(x1 - x0, 0.12, 0.25, (x0 + x1) / 2, top + 0.06, zb - dir * 0.12 + dir * 0.0, { mat: 'plastic', color: ACCENT, cast: false });
  }
}
export function rails(b, x, z0, z1, hfn, opts = {}) {
  // handrail along z at fixed x; hfn(z) = floor height
  const step = 2;
  for (let z = Math.min(z0, z1); z < Math.max(z0, z1) - 0.01; z += step) {
    const za = z, zb = Math.min(z + step, Math.max(z0, z1));
    const ha = hfn(za), hb = hfn(zb);
    const lo = Math.min(ha, hb), hi = Math.max(ha, hb);
    b.box(0.3, 3.0, 0.3, x, lo + 1.5, za, { mat: 'metal', color: 0x3d4148 });
    const mid = (za + zb) / 2, hm = (ha + hb) / 2;
    const len = Math.hypot(zb - za, hb - ha);
    const ang = Math.atan2(hb - ha, zb - za);
    b.box(0.35, 0.3, len, x, hm + 3.0, mid, { mat: 'plastic', color: opts.color ?? ACCENT, rot: [-ang, 0, 0] });
    b.solid({ type: 'box', minX: x - 0.2, maxX: x + 0.2, minZ: za, maxZ: zb, bottom: lo - 0.1, top: hi + 3.2, walk: false });
  }
}
export function railsX(b, z, x0, x1, y, color = ACCENT) {
  for (let x = x0; x <= x1; x += 2) b.box(0.3, 3.0, 0.3, x, y + 1.5, z, { mat: 'metal', color: 0x3d4148 });
  b.box(x1 - x0, 0.3, 0.35, (x0 + x1) / 2, y + 3.0, z, { mat: 'plastic', color });
  b.solid({ type: 'box', minX: x0, maxX: x1, minZ: z - 0.2, maxZ: z + 0.2, bottom: y, top: y + 3.2, walk: false });
}

function wallWithWindows(b, axis, fixed, a0, a1, y0, y1, o) {
  // axis 'x': wall runs along x at z=fixed; 'z': along z at x=fixed
  const len = a1 - a0, mid = (a0 + a1) / 2, h = y1 - y0;
  const t = 1;
  if (axis === 'x') b.box(len, h, t, mid, y0 + h / 2, fixed, { mat: o.mat, color: o.color, solid: true, tag: o.tag });
  else b.box(t, h, len, fixed, y0 + h / 2, mid, { mat: o.mat, color: o.color, solid: true, tag: o.tag });
  // windows on the outer face (decor)
  if (o.windows) {
    const out = o.out;
    for (let a = a0 + o.wStart; a <= a1 - 3; a += o.wGap) {
      const wy = y0 + h * 0.55;
      if (axis === 'x') {
        b.box(3.4, 3.6, 0.3, a, wy, fixed + out * 0.6, { mat: 'plastic', color: o.frame ?? 0xeeeeee, tag: o.tag });
        b.box(2.8, 3.0, 0.32, a, wy, fixed + out * 0.66, { mat: 'glass', color: 0x9fd8ff, tag: o.tag, opacity: 0.55 });
      } else {
        b.box(0.3, 3.6, 3.4, fixed + out * 0.6, wy, a, { mat: 'plastic', color: o.frame ?? 0xeeeeee, tag: o.tag });
        b.box(0.32, 3.0, 2.8, fixed + out * 0.66, wy, a, { mat: 'glass', color: 0x9fd8ff, tag: o.tag, opacity: 0.55 });
      }
    }
  }
}

export function stage1(b, bF0, bL1) {
  // L0 brick walls (back/left/right) full height
  const y0 = 0, y1 = 11.2;
  const o = { mat: 'brick', color: 0xb5553a };
  wallWithWindows(b, 'x', -23.5, -30, 30, y0, y1, { ...o, windows: true, out: -1, wStart: 6, wGap: 9 });
  wallWithWindows(b, 'z', -29.5, -24, 9, y0, y1, { ...o, windows: true, out: -1, wStart: 4, wGap: 9 });
  wallWithWindows(b, 'z', 29.5, -24, 9, y0, y1, { ...o, windows: true, out: 1, wStart: 4, wGap: 9 });
  // corner pillars
  for (const [x, z] of [[-30, -24], [30, -24], [-30, 10], [30, 10]]) b.box(2.2, 12.4, 2.2, x, 6.2, z, { mat: 'stone', color: 0x8d8f94 });
  // front wall (fades when inside): door gap x [-7,7]
  bF0.box(23, 11.2, 1, -18.5, 5.6, 9.5, { mat: 'brick', color: 0xb5553a, solid: true });
  bF0.box(23, 11.2, 1, 18.5, 5.6, 9.5, { mat: 'brick', color: 0xb5553a, solid: true });
  bF0.box(14, 2.4, 1, 0, 10.0, 9.5, { mat: 'brick', color: 0xb5553a });
  bF0.box(15, 0.6, 1.6, 0, 8.6, 9.6, { mat: 'plastic', color: TEAM });
  for (const x of [-12, -22, 12, 22]) {
    bF0.box(3.4, 3.6, 0.3, x, 6, 10.1, { mat: 'plastic', color: 0xeeeeee });
    bF0.box(2.8, 3.0, 0.32, x, 6, 10.16, { mat: 'glass', color: 0x9fd8ff, opacity: 0.55 });
  }
  // L1 slab (with stairwell hole x[-30,-24] z[-12,8])
  const so = { mat: 'studs', color: 0x8a8d93, solid: true };
  bL1.box(54, 0.8, 34, 3, 11.6, -7, so);
  bL1.box(6, 0.8, 12, -27, 11.6, -18, so);
  bL1.box(6, 0.8, 2, -27, 11.6, 9, so);
  // team trim
  bL1.box(61, 0.6, 1.2, 0, 12.0, 10.3, { mat: 'plastic', color: TEAM });
  bL1.box(61, 0.6, 1.2, 0, 12.0, -24.3, { mat: 'plastic', color: TEAM });
  bL1.box(1.2, 0.6, 35, -30.3, 12.0, -7, { mat: 'plastic', color: TEAM });
  bL1.box(1.2, 0.6, 35, 30.3, 12.0, -7, { mat: 'plastic', color: TEAM });
  // L1 rail around hole
  rails(bL1, -24, -10, 9, () => 12, {});
  // stairs 1 (ramp x[-29,-24], z 8 -> -12, h 0 -> 12)
  rampSteps(b, -29, -24, 8, -12, 0, 12, 'wood', 0x9a6a3c);
  b.ramp(-29, -24, -12, 8, '-z', 0, 12, 0);
  rails(b, -24, -12, 6, (z) => ((8 - z) / 20) * 12);
  // ceiling lights (under the slab, fade with it)
  for (const [x, z] of [[-12, -6], [4, -6], [18, -6], [-4, 3], [12, 3]]) {
    bL1.box(3.4, 0.3, 3.4, x, 11.1, z, { mat: 'metal', color: 0x3d4148 });
    bL1.box(2.6, 0.2, 2.6, x, 10.9, z, { mat: 'neon', color: 0xfff1c8, emissive: 0.9 });
    b.light(x, 9.5, z, 0xfff1c8, 0.6);
  }
}

// ---- building stage 2: L1 walls + roof (L2) + stairs 2 ----
export function stage2(bL1, bF1, bL2) {
  const y0 = 12, y1 = 23.2;
  const o = { mat: 'wood', color: 0xb98a55, tag: 'L1' };
  wallWithWindows(bL1, 'x', -23.5, -30, 30, y0, y1, { ...o, windows: true, out: -1, wStart: 6, wGap: 9 });
  wallWithWindows(bL1, 'z', -29.5, -24, 9, y0, y1, { ...o, windows: true, out: -1, wStart: 4, wGap: 9 });
  wallWithWindows(bL1, 'z', 29.5, -24, 9, y0, y1, { ...o, windows: true, out: 1, wStart: 4, wGap: 9 });
  for (const [x, z] of [[-30, -24], [30, -24], [-30, 10], [30, 10]]) bL1.box(2.2, 12, 2.2, x, 18, z, { mat: 'stone', color: 0x8d8f94 });
  // front wall with big windows
  bF1.box(60, 3, 1, 0, 13.5, 9.5, { mat: 'wood', color: 0xb98a55, solid: true });
  bF1.box(60, 2.2, 1, 0, 22.1, 9.5, { mat: 'wood', color: 0xb98a55 });
  for (let x = -27; x <= 27; x += 9) bF1.box(1.4, 6, 1.1, x, 18, 9.5, { mat: 'wood', color: 0x8a5a2b });
  for (let x = -22.5; x <= 22.5; x += 9) bF1.box(7.6, 6, 0.3, x, 18, 9.5, { mat: 'glass', color: 0x9fd8ff, opacity: 0.4 });
  bF1.solid({ type: 'box', minX: -30, maxX: 30, minZ: 9, maxZ: 10, bottom: 12, top: 23.2, walk: false });
  // L2 roof slab (hole x[24,30] z[-12,4])
  const so = { mat: 'studs', color: 0x6c6f75, solid: true };
  bL2.box(54, 0.8, 34, -3, 23.6, -7, so);
  bL2.box(6, 0.8, 12, 27, 23.6, -18, so);
  bL2.box(6, 0.8, 6, 27, 23.6, 7, so);
  // parapets
  const po = { mat: 'stone', color: 0x9a9ca2 };
  bL2.box(61, 1.8, 1, 0, 24.9, -23.6, po);
  bL2.box(61, 1.8, 1, 0, 24.9, 9.6, po);
  bL2.box(1, 1.8, 34, -29.6, 24.9, -7, po);
  bL2.box(1, 1.8, 34, 29.6, 24.9, -7, po);
  for (let x = -28; x <= 28; x += 4) {
    bL2.box(1.6, 1.2, 1.2, x, 26.4, -23.6, po);
    bL2.box(1.6, 1.2, 1.2, x, 26.4, 9.6, po);
  }
  for (let z = -22; z <= 8; z += 4) {
    bL2.box(1.2, 1.2, 1.6, -29.6, 26.4, z, po);
    bL2.box(1.2, 1.2, 1.6, 29.6, 26.4, z, po);
  }
  bL2.box(61.5, 0.5, 1.3, 0, 24.15, 10.2, { mat: 'plastic', color: TEAM });
  bL2.solid({ type: 'box', minX: -30, maxX: 30, minZ: -24, maxZ: -23.1, bottom: 24, top: 27, walk: false });
  bL2.solid({ type: 'box', minX: -30, maxX: 30, minZ: 9.1, maxZ: 10, bottom: 24, top: 27, walk: false });
  bL2.solid({ type: 'box', minX: -30, maxX: -29.1, minZ: -24, maxZ: 10, bottom: 24, top: 27, walk: false });
  bL2.solid({ type: 'box', minX: 29.1, maxX: 30, minZ: -24, maxZ: 10, bottom: 24, top: 27, walk: false });
  rails(bL2, 24, -12, 2, () => 24, {});
  // stairs 2 (ramp x[24,29], z -12 -> 4, h 12 -> 24)
  rampSteps(bL1, 24, 29, -12, 4, 12, 24, 'wood', 0x9a6a3c);
  bL1.ramp(24, 29, -12, 4, 'z', 12, 24, 12);
  rails(bL1, 24, -10, 4, (z) => 12 + ((z + 12) / 16) * 12);
  // L1 ceiling lights
  for (const [x, z] of [[-12, -6], [4, -6], [16, -6], [-4, 3], [12, 3]]) {
    bL2.box(3.4, 0.3, 3.4, x, 23.1, z, { mat: 'metal', color: 0x3d4148 });
    bL2.box(2.6, 0.2, 2.6, x, 22.9, z, { mat: 'neon', color: 0xfff1c8, emissive: 0.9 });
  }
  // flag pole on roof
  bL2.cyl(0.25, 0.3, 12, -20, 30, 4, { mat: 'metal', color: 0xd0d4da });
  bL2.sphere(0.5, -20, 36.2, 4, { mat: 'gold', color: 0xffcc40 });
}

// ---- perimeter fences ----
const GATES = { s: [-7, 7], n: [-7, 7], w: [-6, 6], e: [-6, 6] };
function perimeterSegments() {
  const H = 43.2;
  const segs = [];
  // south (z=H) and north (z=-H) along x, with gates
  for (const [z, g] of [[H, GATES.s], [-H, GATES.n]]) {
    segs.push(['x', z, -H, g[0]]);
    segs.push(['x', z, g[1], H]);
  }
  for (const [x, g] of [[-H, GATES.w], [H, GATES.e]]) {
    segs.push(['z', x, -H, g[0]]);
    segs.push(['z', x, g[1], H]);
  }
  return segs;
}
export function cerca(b) {
  const C = 0x8a5a2b;
  for (const [ax, f, a0, a1] of perimeterSegments()) {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    for (let a = a0; a <= a1 + 0.01; a += 3) {
      if (ax === 'x') b.box(0.7, 3.6, 0.7, a, 1.8, f, { mat: 'wood', color: 0x6b4426 });
      else b.box(0.7, 3.6, 0.7, f, 1.8, a, { mat: 'wood', color: 0x6b4426 });
    }
    for (const y of [1.2, 2.7]) {
      if (ax === 'x') b.box(len, 0.45, 0.35, mid, y, f, { mat: 'wood', color: C });
      else b.box(0.35, 0.45, len, f, y, mid, { mat: 'wood', color: C });
    }
    if (ax === 'x') b.solid({ type: 'box', minX: a0, maxX: a1, minZ: f - 0.4, maxZ: f + 0.4, bottom: 0, top: 3.6, walk: false });
    else b.solid({ type: 'box', minX: f - 0.4, maxX: f + 0.4, minZ: a0, maxZ: a1, bottom: 0, top: 3.6, walk: false });
  }
}
export function muralha(b) {
  const S = 0x9a9ca2;
  for (const [ax, f, a0, a1] of perimeterSegments()) {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    if (ax === 'x') b.box(len, 6, 1.6, mid, 3, f, { mat: 'stone', color: S, solid: true });
    else b.box(1.6, 6, len, f, 3, mid, { mat: 'stone', color: S, solid: true });
    for (let a = a0 + 1; a < a1 - 0.5; a += 3) {
      if (ax === 'x') b.box(1.6, 1.3, 1.8, a, 6.6, f, { mat: 'stone', color: S });
      else b.box(1.8, 1.3, 1.6, f, 6.6, a, { mat: 'stone', color: S });
    }
    if (ax === 'x') b.box(len, 0.4, 1.9, mid, 5.9, f, { mat: 'plastic', color: TEAM });
    else b.box(1.9, 0.4, len, f, 5.9, mid, { mat: 'plastic', color: TEAM });
  }
  // corner towers
  for (const [x, z] of [[-43, -43], [43, -43], [-43, 43], [43, 43]]) {
    b.cyl(3.2, 3.6, 10, x, 5, z, { mat: 'stone', color: 0x8d8f94, seg: 10, solid: true });
    b.cyl(3.8, 3.8, 1.2, x, 10.4, z, { mat: 'stone', color: 0x7a7c82, seg: 10 });
    b.cone(4.2, 4.5, x, 13.2, z, { mat: 'plastic', color: TEAM, seg: 10 });
    b.light(x, 12, z, 0xffb060, 0.8);
  }
  // gate arches
  for (const [x, z, rot] of [[0, 43.2, 0], [0, -43.2, 0], [-43.2, 0, Math.PI / 2], [43.2, 0, Math.PI / 2]]) {
    const r = [0, rot, 0];
    const ox = rot ? 0 : 7.8, oz = rot ? 7.8 : 0;
    b.box(2.2, 9, 2.2, x - ox, 4.5, z - oz, { mat: 'stone', color: 0x8d8f94, rot: r });
    b.box(2.2, 9, 2.2, x + ox, 4.5, z + oz, { mat: 'stone', color: 0x8d8f94, rot: r });
    b.box(18, 1.8, 2.4, x, 9.6, z, { mat: 'stone', color: 0x7a7c82, rot: r });
    b.box(8, 1.2, 0.3, x + (rot ? 1.3 : 0), 9.6, z + (rot ? 0 : 1.3), { mat: 'plastic', color: TEAM, rot: r });
  }
}

// ---- weapon racks ----
export function rack(b, x, y, z, rotY = 0) {
  const r = [0, rotY, 0];
  b.box(6, 4.6, 0.6, x, y + 3.3, z, { mat: 'wood', color: 0x6b4426, rot: r, solid: true });
  b.box(6.6, 0.5, 1.0, x, y + 5.8, z, { mat: 'plastic', color: TEAM, rot: r });
  b.box(6.6, 1.0, 1.2, x, y + 0.5, z, { mat: 'wood', color: 0x4a2c16, rot: r, solid: true });
}

// ---- totems ----
export const TOTEM_COL = { Q: 0xff7a2a, W: 0x46c8ff, E: 0xffd84a, R: 0xff3b3b };
export function totem(b, x, y, z, key, anims) {
  b.box(3, 0.8, 3, x, y + 0.4, z, { mat: 'stone', color: 0x7a7c82, solid: true });
  b.box(2.2, 3.4, 2.2, x, y + 2.5, z, { mat: 'stone', color: 0x9a9ca2, solid: true });
  b.box(2.6, 0.5, 2.6, x, y + 4.4, z, { mat: 'gold', color: 0xffc940 });
  b.box(0.3, 1.4, 0.3, x - 1.2, y + 2.6, z + 1.12, { mat: 'neon', color: TOTEM_COL[key] });
  b.box(0.3, 1.4, 0.3, x + 1.2, y + 2.6, z + 1.12, { mat: 'neon', color: TOTEM_COL[key] });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), getMat('neon', TOTEM_COL[key], { tag: b.tag, emissive: 1.1 }));
  cube.position.set(x, y + 6.2, z);
  anims.push({ mesh: cube, tag: b.tag, fn: (dt) => { cube.rotation.y += dt * 1.4; cube.rotation.x += dt * 0.7; cube.position.y = y + 6.2 + Math.sin(performance.now() * 0.002 + x) * 0.3; } });
  b.light(x, y + 6, z, TOTEM_COL[key], 0.5);
}

// ---- turret ----
export function turret(b, x, y, z, anims, scene) {
  b.box(4, 3.2, 4, x, y + 1.6, z, { mat: 'stone', color: 0x8d8f94, solid: true });
  b.box(4.6, 0.6, 4.6, x, y + 3.5, z, { mat: 'plastic', color: TEAM });
  b.cyl(1.2, 1.4, 1.4, x, y + 4.4, z, { mat: 'metal', color: 0x3d4148, seg: 12 });
  const head = new THREE.Group();
  head.position.set(x, y + 5.6, z);
  const wm = getMat('wood', 0x7a4a24, { tag: b.tag });
  const mm = getMat('metal', 0x50555e, { tag: b.tag });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 4.6), wm);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 0.6), mm);
  bow.position.z = 1.6;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), getMat('neon', 0x46c8ff, { tag: b.tag }));
  gem.position.set(0, 0.9, -0.6);
  for (const m of [stock, bow]) { m.castShadow = true; }
  head.add(stock, bow, gem);
  anims.push({ mesh: head, tag: b.tag, fn: (dt) => { gem.rotation.y += dt * 3; } });
  return head;
}

// ---- portal ----
export function portalArch(b) {
  const x = 0, z = 35;
  const S = 0x6d6f76;
  b.box(3.2, 16, 3.2, x - 8, 8, z, { mat: 'stone', color: S, solid: true });
  b.box(3.2, 16, 3.2, x + 8, 8, z, { mat: 'stone', color: S, solid: true });
  b.box(20, 3, 3.6, x, 17.2, z, { mat: 'stone', color: 0x5d5f66 });
  b.box(4, 4, 4, x, 19.4, z, { mat: 'stone', color: 0x5d5f66 });
  b.sphere(1.3, x, 19.6, z + 2.0, { mat: 'neon', color: 0x6aff5a, ico: 0, emissive: 1.8 });
  for (const sx of [-8, 8]) {
    for (let y = 3; y < 15; y += 3.2) b.box(0.4, 1.4, 0.3, x + sx, y, z + 1.66, { mat: 'neon', color: 0x6aff5a, emissive: 1.3 });
    b.box(4.4, 1.2, 4.4, x + sx, 0.6, z, { mat: 'stone', color: 0x4a4c52 });
    // goblin skulls/horns
    b.cone(0.5, 2.2, x + sx, 17.4, z + 1.9, { mat: 'plastic', color: 0xf0e8d0, rot: [Math.PI / 2.4, 0, sx > 0 ? -0.4 : 0.4] });
  }
  b.box(22, 0.5, 9, x, 0.25, z, { mat: 'stone', color: 0x55575e, cast: false });
}

// ---- misc ----
export function missionBoard(b, x, z) {
  b.box(0.7, 6, 0.7, x - 3.4, 3, z, { mat: 'wood', color: 0x5a391e, solid: true });
  b.box(0.7, 6, 0.7, x + 3.4, 3, z, { mat: 'wood', color: 0x5a391e, solid: true });
  b.box(7.2, 4.0, 0.4, x, 3.6, z, { mat: 'wood', color: 0x9a6a3c });
  b.wedge(8.2, 1.2, 1.6, x, 6.2, z, { mat: 'wood', color: 0xc4281c, rot: [0, Math.PI, 0] });
  b.box(8.2, 0.2, 1.6, x, 5.55, z, { mat: 'wood', color: 0x7a1a12 });
  const r = Math.random;
  for (let i = 0; i < 5; i++) b.box(1.3, 1.6, 0.06, x - 2.6 + i * 1.3, 3.6 + (i % 2) * 0.35, z + 0.24, { mat: 'plastic', color: i === 2 ? 0xfff2b0 : 0xf4f0e6, rot: [0, 0, (r() - 0.5) * 0.2] });
  b.box(1.2, 1.2, 0.2, x, 1.1, z + 0.1, { mat: 'neon', color: 0xffd84a, emissive: 0.9 });
}
export function lampPost(b, x, z, h = 7) {
  b.cyl(0.25, 0.35, h, x, h / 2, z, { mat: 'metal', color: 0x2c2f35, seg: 8, solid: true });
  b.box(1.2, 1.4, 1.2, x, h + 0.5, z, { mat: 'metal', color: 0x2c2f35 });
  b.box(0.9, 1.0, 0.9, x, h + 0.5, z, { mat: 'neon', color: 0xffd9a0, emissive: 0.9, night: true });
  b.cone(0.95, 0.7, x, h + 1.55, z, { mat: 'metal', color: 0x2c2f35, seg: 4, rot: [0, Math.PI / 4, 0] });
  b.light(x, h + 0.3, z, 0xffc070, 0.8, true);
}
export function dummyModel() {
  const g = new THREE.Group();
  const straw = getMat('fabric', 0xd9b56a);
  const wood = getMat('wood', 0x6b4426);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), wood);
  post.position.y = 1.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 1.1), straw);
  body.position.y = 3.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.5), wood);
  arm.position.y = 4.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), straw);
  head.position.y = 5.5;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.06, 20).rotateX(Math.PI / 2), getMat('plastic', 0xc4281c));
  t.position.set(0, 3.6, 0.58);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 16).rotateX(Math.PI / 2), getMat('plastic', 0xffffff));
  t2.position.set(0, 3.6, 0.6);
  for (const m of [post, body, arm, head, t, t2]) { m.castShadow = true; g.add(m); }
  return g;
}
export function signTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1d7fd1');
  gr.addColorStop(1, '#0b4f8f');
  x.fillStyle = gr;
  x.fillRect(0, 0, 1024, 256);
  x.lineWidth = 18;
  x.strokeStyle = '#f5cd30';
  x.strokeRect(9, 9, 1006, 238);
  x.font = '900 120px "Lilita One", "Fredoka", Arial Black, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 16;
  x.strokeStyle = '#0a1a2a';
  x.strokeText(text, 512, sub ? 112 : 132);
  x.fillStyle = '#ffffff';
  x.fillText(text, 512, sub ? 112 : 132);
  if (sub) {
    x.font = '700 44px "Fredoka", Arial, sans-serif';
    x.fillStyle = '#ffe58a';
    x.fillText(sub, 512, 205);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export { TEX };
