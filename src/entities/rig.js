// R6-style blocky character rig (the classic Noob, goblins, the Goblin King) + procedural animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEX, patchMaterial } from '../engine/materials.js';
import { clamp, lerp, damp } from '../util.js';

const geoCache = new Map();
export function rbox(w, h, d, r = 0.12, seg = 2) {
  const k = `${w}|${h}|${d}|${r}|${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, r);
    geoCache.set(k, g);
  }
  return g;
}

let headGeo = null, faceGeo = null;
function getHeadGeo() {
  if (headGeo) return headGeo;
  // rounded cylinder (classic R6 head mesh)
  const pts = [];
  const R = 0.62, Hh = 0.6, c = 0.2;
  pts.push(new THREE.Vector2(0, -Hh));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - c + Math.cos(a) * c, -Hh + c + Math.sin(a) * c));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - c + Math.cos(a) * c, Hh - c + Math.sin(a) * c));
  }
  pts.push(new THREE.Vector2(0, Hh));
  headGeo = new THREE.LatheGeometry(pts, 28);
  faceGeo = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.9, 20, 1, true, -0.95, 1.9);
  return headGeo;
}

const matCache = new Map();
export function plasticMat(color, o = {}) {
  const key = color + '|' + (o.emissive || 0) + '|' + (o.metal || 0) + '|' + (o.rough ?? '') + '|' + (o.cut ?? '');
  if (matCache.has(key) && !o.unique) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.5,
    metalness: o.metal || 0,
    emissive: new THREE.Color(o.emissive || 0),
    emissiveIntensity: o.emissiveIntensity ?? 1,
    normalMap: TEX.plasticN,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  patchMaterial(m, { cut: o.cut ?? false, cloud: true, rim: o.unique ? (o.rim ?? 0x26282e) : null });
  if (!o.unique) matCache.set(key, m);
  return m;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * colors: {head, torso, arms, legs}  opts: {scale, face:'smile'|'goblin', uniqueMats}
 * Rig local forward = +Z. Root at feet.
 */
export function createRig(colors, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const u = !!opts.uniqueMats;
  const mats = {
    head: plasticMat(colors.head, { unique: u }),
    torso: plasticMat(colors.torso, { unique: u }),
    arms: plasticMat(colors.arms ?? colors.head, { unique: u }),
    legs: plasticMat(colors.legs, { unique: u }),
  };
  const torso = mesh(rbox(2, 2, 1, 0.1), mats.torso, 0, 3, 0);
  body.add(torso);
  const neck = new THREE.Group();
  neck.position.set(0, 4, 0);
  body.add(neck);
  const head = mesh(getHeadGeo(), mats.head, 0, 0.62, 0);
  neck.add(head);
  const faceTex = opts.face === 'goblin' ? TEX.goblinFace : TEX.face;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, alphaTest: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 0.62, 0);
  neck.add(face);
  const mkLimb = (x, y, mat) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    const m = mesh(rbox(1, 2, 1, 0.1), mat, 0, -1, 0);
    p.add(m);
    body.add(p);
    return p;
  };
  const armL = mkLimb(-1.5, 4, mats.arms);
  const armR = mkLimb(1.5, 4, mats.arms);
  armL.children[0].position.y = -0.95;
  armR.children[0].position.y = -0.95;
  const legL = mkLimb(-0.5, 2, mats.legs);
  const legR = mkLimb(0.5, 2, mats.legs);
  const hand = new THREE.Group();
  hand.position.set(0, -1.85, 0);
  armR.add(hand);
  const handL = new THREE.Group();
  handL.position.set(0, -1.85, 0);
  armL.add(handL);
  if (opts.scale) root.scale.setScalar(opts.scale);
  const rig = {
    root, body, torso, neck, head, face, armL, armR, legL, legR, hand, handL, mats,
    phase: 0,
    weapon: null,
    a: { walk: 0, atk: -1, style: 'punch', air: 0, cast: 0, idleT: Math.random() * 10, spin: 0, lean: 0 },
    meshes() {
      const out = [];
      root.traverse((o) => { if (o.isMesh) out.push(o); });
      return out;
    },
  };
  return rig;
}

export function setRigWeapon(rig, weaponObj) {
  if (rig.weapon) rig.hand.remove(rig.weapon);
  rig.weapon = weaponObj;
  if (weaponObj) rig.hand.add(weaponObj);
}

/**
 * s: { speed (studs/s), moveRef (speed for full stride), atk (0..1 or -1), style, air, cast (0..1), dt }
 */
export function animateRig(rig, dt, s) {
  const A = rig.a;
  A.idleT += dt;
  const moving = clamp(s.speed / (s.moveRef || 14), 0, 1.4);
  A.walk = damp(A.walk, moving, 12, dt);
  rig.phase += dt * (4 + s.speed * 0.55);
  const sw = Math.sin(rig.phase) * A.walk;
  const legAmp = 0.95, armAmp = 0.85;
  let la = sw * armAmp, ra = -sw * armAmp;
  let lla = -sw * legAmp, rla = sw * legAmp;
  let laz = 0, raz = 0;
  // idle breathing
  const idle = 1 - clamp(A.walk * 3, 0, 1);
  la += Math.sin(A.idleT * 1.6) * 0.06 * idle;
  ra -= Math.sin(A.idleT * 1.6) * 0.06 * idle;
  laz = -0.05 * idle;
  raz = 0.05 * idle;
  rig.body.position.y = Math.abs(Math.sin(rig.phase)) * 0.18 * A.walk + Math.sin(A.idleT * 1.6) * 0.03 * idle;
  rig.body.rotation.y = 0;
  rig.body.rotation.x = A.walk * 0.06;
  // holding a tool (R6 style: arm forward)
  if (s.hold && s.atk < 0) {
    ra = -1.45 + Math.sin(A.idleT * 2) * 0.03 + sw * 0.15;
    raz = 0;
  }
  // airborne
  A.air = damp(A.air, s.air ? 1 : 0, 10, dt);
  la = lerp(la, -2.9, A.air);
  ra = lerp(ra, -2.9, A.air);
  lla = lerp(lla, 0.3, A.air);
  rla = lerp(rla, -0.3, A.air);
  // attacks
  if (s.atk >= 0) {
    const t = s.atk;
    switch (s.style) {
      case 'swing': {
        // raise -> slam -> recover
        let r;
        if (t < 0.35) r = lerp(-0.4, -2.9, t / 0.35);
        else if (t < 0.55) r = lerp(-2.9, -0.35, (t - 0.35) / 0.2);
        else r = lerp(-0.35, -0.6, (t - 0.55) / 0.45);
        ra = r;
        raz = 0.15;
        rig.body.rotation.y = t < 0.35 ? -0.25 * (t / 0.35) : lerp(-0.25, 0.35, clamp((t - 0.35) / 0.2, 0, 1));
        la = lerp(la, 0.3, 0.6);
        break;
      }
      case 'heavy': {
        let r;
        if (t < 0.45) r = lerp(-0.4, -3.1, t / 0.45);
        else if (t < 0.6) r = lerp(-3.1, -0.2, (t - 0.45) / 0.15);
        else r = -0.2;
        ra = r;
        la = r;
        rig.body.rotation.x = t < 0.45 ? -0.15 : 0.3;
        break;
      }
      case 'shoot': {
        la = -1.5;
        laz = -0.1;
        ra = -1.5;
        raz = t < 0.6 ? lerp(0, 0.6, t / 0.6) : lerp(0.6, 0, (t - 0.6) / 0.4);
        rig.body.rotation.y = -0.5;
        break;
      }
      case 'cast': {
        const k = Math.sin(clamp(t, 0, 1) * Math.PI);
        la = -1.6 * k - 0.2;
        ra = -1.6 * k - 0.2;
        laz = -0.25 * k;
        raz = 0.25 * k;
        break;
      }
      case 'bite': {
        rig.body.rotation.x = Math.sin(t * Math.PI) * 0.5;
        break;
      }
      default: {
        // punch alternating
        const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
        ra = lerp(ra, -1.65, k);
        rig.body.rotation.y = 0.3 * k;
        la = lerp(la, -0.6, k * 0.5);
      }
    }
  }
  if (s.wave) {
    // friendly title-screen wave
    ra = -2.7 + Math.sin(A.idleT * 9) * 0.25;
    raz = 0.35 + Math.sin(A.idleT * 9) * 0.3;
  }
  if (A.spin) rig.body.rotation.y += A.spin;
  rig.armL.rotation.set(la, 0, laz);
  rig.armR.rotation.set(ra, 0, raz);
  rig.legL.rotation.x = lla;
  rig.legR.rotation.x = rla;
  rig.neck.rotation.y = Math.sin(A.idleT * 0.5) * 0.15 * idle;
}

// ---------- weapons ----------
function bowInto(g, half, bulge, wood, str) {
  // vertical bow in the arm frame: long axis local z, bulging toward local -y (forward when aiming)
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = (i / 6) * 2 - 1;
    pts.push([-(1 - t * t) * bulge, t * half]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [y1, z1] = pts[i], [y2, z2] = pts[i + 1];
    const len = Math.hypot(y2 - y1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, len + 0.06), wood);
    m.position.set(0, (y1 + y2) / 2, (z1 + z2) / 2);
    m.rotation.x = Math.atan2(-(y2 - y1), z2 - z1);
    m.castShadow = true;
    g.add(m);
  }
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, half * 2), str);
  s.position.set(0, 0.05, 0);
  g.add(s);
}
const W = {};
function wmat(c, o) { return plasticMat(c, o); }
export function makeWeapon(id) {
  const g = new THREE.Group();
  if (id === 'espada') {
    const handle = mesh(rbox(0.35, 0.35, 1.1, 0.06), wmat(0x6b4426), 0, 0, 0.3);
    const guard = mesh(rbox(1.2, 0.3, 0.3, 0.06), wmat(0x8a5a2b), 0, 0, 0.9);
    const blade = mesh(rbox(0.45, 0.18, 3.0, 0.06), wmat(0xd9b07a), 0, 0, 2.5);
    const tip = mesh(new THREE.ConeGeometry(0.26, 0.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), wmat(0xd9b07a), 0, 0, 4.25);
    g.add(handle, guard, blade, tip);
  } else if (id === "arco") {
    bowInto(g, 1.7, 0.55, wmat(0x7a4a24), wmat(0xeeeeee));
    g.add(mesh(rbox(0.34, 0.34, 0.55, 0.06), wmat(0x3b2a1a), 0, 0, 0));
  } else if (id === "runica") {
    const handle = mesh(rbox(0.36, 0.36, 1.2, 0.06), wmat(0x222228, { metal: 0.6, rough: 0.3 }), 0, 0, 0.3);
    const guard = mesh(rbox(1.6, 0.35, 0.35, 0.08), wmat(0x5a5a66, { metal: 0.9, rough: 0.25 }), 0, 0, 0.95);
    const blade = mesh(rbox(0.6, 0.16, 3.8, 0.06), wmat(0x30323a, { metal: 0.9, rough: 0.2 }), 0, 0, 2.95);
    const rune = mesh(new THREE.BoxGeometry(0.2, 0.2, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3.6, 4.2) }), 0, 0, 3.0);
    const gem = mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.4, 4.4) }), 0, 0, 0.95);
    rune.castShadow = gem.castShadow = false;
    g.add(handle, guard, blade, rune, gem);
  } else if (id === 'clava') {
    const h = mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.2, 7).rotateX(Math.PI / 2), wmat(0x6b4426), 0, 0, 1.4);
    const k1 = mesh(new THREE.IcosahedronGeometry(0.55, 0), wmat(0x5a391e), 0, 0, 2.9);
    g.add(h, k1);
  } else if (id === 'machado') {
    const h = mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 6).rotateX(Math.PI / 2), wmat(0x5a391e), 0, 0, 1.5);
    const b = mesh(rbox(0.25, 1.6, 1.2, 0.08), wmat(0x9aa0aa, { metal: 0.8, rough: 0.3 }), 0, 0.7, 2.9);
    g.add(h, b);
  } else if (id === "arcoGoblin") {
    bowInto(g, 1.4, 0.45, wmat(0x4a3018), wmat(0xd8d0b0));
  } else if (id === "clavaRei") {
    const h = mesh(new THREE.CylinderGeometry(0.3, 0.6, 4.6, 8).rotateX(Math.PI / 2), wmat(0x4a2c16), 0, 0, 2.0);
    const k = mesh(new THREE.IcosahedronGeometry(1.15, 0), wmat(0x3b2412), 0, 0, 4.4);
    g.add(h, k);
    const sp = wmat(0xb8bcc4, { metal: 0.9, rough: 0.3 });
    for (let i = 0; i < 8; i++) {
      const c = mesh(new THREE.ConeGeometry(0.2, 0.9, 5), sp, 0, 0, 0);
      const a = (i / 8) * Math.PI * 2;
      c.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 4.4 + (i % 2 ? 0.4 : -0.4));
      c.rotation.z = a - Math.PI / 2;
      g.add(c);
    }
  }
  return g;
}

// rigid break-apart: returns world transforms of all meshes for debris
export function rigParts(rig) {
  const parts = [];
  rig.root.updateMatrixWorld(true);
  rig.root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    o.matrixWorld.decompose(p, q, s);
    parts.push({ pos: p, size: [(bb.max.x - bb.min.x) * s.x, (bb.max.y - bb.min.y) * s.y, (bb.max.z - bb.min.z) * s.z], color: o.material.color ? o.material.color.getHex() : 0xffffff });
  });
  return parts;
}
