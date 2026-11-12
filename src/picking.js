// Analytical mouse picking: enemies, interactables, terrain + walkable floors (respecting faded levels).
import * as THREE from 'three';
import { G } from './G.js';
import { input } from './engine/input.js';
import { raycastTerrain } from './world/terrain.js';
import { raycastSolids, inArena } from './engine/physics.js';
import { levelOf } from './engine/nav.js';
import { allTargets } from './entities/combat.js';

const ray = new THREE.Ray();
const ndc = new THREE.Vector2();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

export const interactables = []; // {x,y,z,r,h, level, kind, onClick, tip, enabled()}

export function mouseRay(x = input.mx, y = input.my) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.origin.setFromMatrixPosition(G.camera.matrixWorld);
  ray.direction.set(ndc.x, ndc.y, 0.5).unproject(G.camera).sub(ray.origin).normalize();
  return ray;
}
export function centerRay() {
  ray.origin.setFromMatrixPosition(G.camera.matrixWorld);
  G.camera.getWorldDirection(ray.direction);
  return ray;
}

function hiddenLevel(level) {
  return G.base && G.base.hiddenLevels && G.base.hiddenLevels.has(level);
}

// ray vs vertical cylinder approx by sphere at center
function hitSphere(r, cx, cy, cz, rad) {
  _c.set(cx, cy, cz);
  const d = r.distanceSqToPoint(_c);
  if (d > rad * rad) return -1;
  return r.origin.distanceTo(_c);
}

export function pickEnemy(r) {
  let best = null, bt = Infinity;
  for (const e of allTargets('player')) {
    if (e.untargetable) continue;
    const h = e.height || 4;
    const rad = Math.max(e.radius || 1, 1.2) + 0.6;
    const t = hitSphere(r, e.pos.x, e.pos.y + h * 0.5, e.pos.z, rad + h * 0.15);
    if (t >= 0 && t < bt) { bt = t; best = e; }
  }
  return best;
}

export function pickInteract(r) {
  let best = null, bt = Infinity;
  for (const it of interactables) {
    if (it.enabled && !it.enabled()) continue;
    if (it.level !== undefined && hiddenLevel(it.level)) continue;
    const t = hitSphere(r, it.x, it.y + (it.h || 1) * 0.5, it.z, it.r || 1.5);
    if (t >= 0 && t < bt) { bt = t; best = it; }
  }
  return best;
}

export function pickGround(r) {
  let tBest = Infinity;
  if (!inArena(G.player?.pos.x ?? 0, G.player?.pos.z ?? 0)) {
    const tt = raycastTerrain(r.origin, r.direction, 800);
    if (tt >= 0) tBest = tt;
  } else {
    // arena: plane at y=0
    if (r.direction.y < 0) tBest = (0 - r.origin.y) / r.direction.y;
  }
  const hs = raycastSolids(r.origin, r.direction, (s) => {
    if (!s.walk || s.pick === false) return false;
    const lv = s.level ?? (s.tag === 'L1' || s.tag === 'F1' ? 1 : s.tag === 'L2' ? 2 : 0);
    return !hiddenLevel(lv) && !(s.tag && G.base?.hiddenTags?.has(s.tag));
  });
  if (hs && hs.t < tBest) tBest = hs.t;
  if (tBest === Infinity) return null;
  r.at(tBest, _p);
  return { x: _p.x, y: _p.y, z: _p.z, level: levelOf(_p.x, _p.y + 0.2, _p.z) };
}

// cursor ground point on the player's own plane (for ability aiming)
export function aimPoint(r, y) {
  if (Math.abs(r.direction.y) < 1e-4) return null;
  const t = (y - r.origin.y) / r.direction.y;
  if (t < 0) return null;
  r.at(t, _p);
  return { x: _p.x, y, z: _p.z };
}
