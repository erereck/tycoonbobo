// Lightweight character physics: solids (AABB boxes, circles, ramps) in a spatial hash,
// multi-level ground queries, circle collision with sliding, water blocking.
import { height, isWater, onBridge } from '../world/terrain.js';
import { PLAY_HALF, ARENA } from '../world/layout.js';
import { clamp } from '../util.js';

export const STEP = 1.25;
export const CELL = 8;
const grid = new Map();
const all = new Set();
let disabledTags = new Set();

function key(ix, iz) {
  return ix * 73856093 ^ iz * 19349663;
}
function bounds(s) {
  if (s.type === 'circle') return [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r];
  return [s.minX, s.maxX, s.minZ, s.maxZ];
}

export function addSolid(s) {
  const [a, b, c, d] = bounds(s);
  s._cells = [];
  for (let ix = Math.floor(a / CELL); ix <= Math.floor(b / CELL); ix++) {
    for (let iz = Math.floor(c / CELL); iz <= Math.floor(d / CELL); iz++) {
      const k = key(ix, iz);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(s);
      s._cells.push(k);
    }
  }
  all.add(s);
  return s;
}
export function addSolids(list) {
  for (const s of list) addSolid(s);
}
export function removeSolid(s) {
  if (!all.has(s)) return;
  for (const k of s._cells) {
    const arr = grid.get(k);
    if (!arr) continue;
    const i = arr.indexOf(s);
    if (i >= 0) arr.splice(i, 1);
  }
  all.delete(s);
}
export function removeSolids(list) {
  for (const s of list) removeSolid(s);
}

let qid = 1;
const _near = [];
export function query(minX, maxX, minZ, maxZ) {
  _near.length = 0;
  qid++;
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const arr = grid.get(key(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s._q === qid) continue;
        s._q = qid;
        if (s.tag && disabledTags.has(s.tag)) continue;
        _near.push(s);
      }
    }
  }
  return _near;
}

export function rampTop(s, x, z) {
  let t;
  if (s.axis === 'x') t = (x - s.minX) / (s.maxX - s.minX);
  else if (s.axis === '-x') t = (s.maxX - x) / (s.maxX - s.minX);
  else if (s.axis === 'z') t = (z - s.minZ) / (s.maxZ - s.minZ);
  else t = (s.maxZ - z) / (s.maxZ - s.minZ);
  t = clamp(t, 0, 1);
  return s.h0 + (s.h1 - s.h0) * t;
}
function topAt(s, x, z) {
  return s.type === 'ramp' ? rampTop(s, x, z) : s.top;
}
function contains(s, x, z, pad = 0) {
  if (s.type === 'circle') {
    const dx = x - s.x, dz = z - s.z;
    return dx * dx + dz * dz <= (s.r + pad) * (s.r + pad);
  }
  return x >= s.minX - pad && x <= s.maxX + pad && z >= s.minZ - pad && z <= s.maxZ + pad;
}

export function inArena(x, z) {
  return z < -600;
}

// highest walkable surface at (x,z) not above yRef+STEP
export function groundAt(x, z, yRef) {
  let g = inArena(x, z) ? -80 : height(x, z);
  const near = query(x, x, z, z);
  for (let i = 0; i < near.length; i++) {
    const s = near[i];
    if (!s.walk) continue;
    if (!contains(s, x, z)) continue;
    const t = topAt(s, x, z);
    if (t <= yRef + STEP && t > g) g = t;
  }
  return g;
}

// does solid s block a character standing at feet height y?
function blocks(s, x, z, y, h) {
  const t = topAt(s, x, z);
  return t > y + STEP && s.bottom < y + h - 0.2;
}

export function blockedAt(x, z, y, r, h = 5) {
  const near = query(x - r, x + r, z - r, z + r);
  for (let i = 0; i < near.length; i++) {
    const s = near[i];
    if (!contains(s, x, z, r)) continue;
    if (s.type === 'circle') {
      if (blocks(s, x, z, y, h)) return true;
    } else {
      const cx = clamp(x, s.minX, s.maxX), cz = clamp(z, s.minZ, s.maxZ);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r && blocks(s, s.type === 'ramp' ? clamp(x, s.minX, s.maxX) : x, s.type === 'ramp' ? clamp(z, s.minZ, s.maxZ) : z, y, h)) return true;
    }
  }
  if (!inArena(x, z) && isWater(x, z) && !onBridge(x, z)) return true;
  return false;
}

function waterBlocked(x, z) {
  return !inArena(x, z) && isWater(x, z) && !onBridge(x, z);
}

// push circle out of blocking solids (in place). returns true if collided
function resolve(p, r, h) {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    const near = query(p.x - r, p.x + r, p.z - r, p.z + r);
    let moved = false;
    for (let i = 0; i < near.length; i++) {
      const s = near[i];
      if (s.type === 'circle') {
        const dx = p.x - s.x, dz = p.z - s.z;
        const rr = r + s.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (!blocks(s, p.x, p.z, p.y, h)) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = rr - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
        moved = hit = true;
      } else {
        const cx = clamp(p.x, s.minX, s.maxX), cz = clamp(p.z, s.minZ, s.maxZ);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (!blocks(s, cx, cz, p.y, h)) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else {
          // center inside: push along min axis
          const l = p.x - s.minX, rr2 = s.maxX - p.x, u = p.z - s.minZ, dd = s.maxZ - p.z;
          const m = Math.min(l, rr2, u, dd);
          if (m === l) p.x = s.minX - r;
          else if (m === rr2) p.x = s.maxX + r;
          else if (m === u) p.z = s.minZ - r;
          else p.z = s.maxZ + r;
        }
        moved = hit = true;
      }
    }
    if (!moved) break;
  }
  return hit;
}

// Move a character body {pos:Vector3, vy, grounded, r, h}
export function moveBody(b, dx, dz, dt, opts = {}) {
  const p = b.pos;
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / (b.r * 0.5)));
  const sx = dx / steps, sz = dz / steps;
  let collided = false;
  for (let i = 0; i < steps; i++) {
    const ox = p.x, oz = p.z;
    p.x += sx;
    p.z += sz;
    if (resolve(p, b.r, b.h)) collided = true;
    if (waterBlocked(p.x, p.z)) {
      // slide along axes
      if (!waterBlocked(p.x, oz)) p.z = oz;
      else if (!waterBlocked(ox, p.z)) p.x = ox;
      else { p.x = ox; p.z = oz; }
      collided = true;
    }
  }
  // world bounds
  if (inArena(p.x, p.z)) {
    const dx2 = p.x - ARENA.x, dz2 = p.z - ARENA.z;
    const d = Math.hypot(dx2, dz2);
    if (d > ARENA.r) {
      p.x = ARENA.x + (dx2 / d) * ARENA.r;
      p.z = ARENA.z + (dz2 / d) * ARENA.r;
    }
  } else {
    p.x = clamp(p.x, -PLAY_HALF, PLAY_HALF);
    p.z = clamp(p.z, -PLAY_HALF, PLAY_HALF);
  }
  // vertical
  const g = groundAt(p.x, p.z, p.y);
  if (b.grounded && g < p.y && p.y - g < STEP + 0.3 && b.vy <= 0) {
    p.y = g; // stick down slopes/steps
  }
  if (p.y <= g + 0.001) {
    if (g - p.y > 0) p.y = Math.min(g, p.y + Math.max(dt * 30, (g - p.y) * 0.6));
    if (g - p.y < 0.02) p.y = g;
    b.vy = Math.max(0, b.vy);
    b.grounded = true;
  } else {
    b.vy -= (opts.gravity ?? 70) * dt;
    p.y += b.vy * dt;
    if (p.y <= g) {
      p.y = g;
      b.vy = 0;
      b.grounded = true;
    } else b.grounded = false;
  }
  return collided;
}

export function setDisabledTags(tags) {
  disabledTags = new Set(tags);
}

// ray vs AABB solids; returns {t, s} nearest
export function raycastSolids(o, d, filter) {
  let best = Infinity, bs = null;
  for (const s of all) {
    if (s.type === 'circle') continue;
    if (filter && !filter(s)) continue;
    const top = s.type === 'ramp' ? s.top : s.top;
    let tmin = -Infinity, tmax = Infinity;
    const mins = [s.minX, s.bottom, s.minZ], maxs = [s.maxX, top, s.maxZ];
    const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(ds[a]) < 1e-9) {
        if (os[a] < mins[a] || os[a] > maxs[a]) { ok = false; break; }
      } else {
        let t1 = (mins[a] - os[a]) / ds[a], t2 = (maxs[a] - os[a]) / ds[a];
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (!ok || tmax < 0) continue;
    const t = tmin > 0 ? tmin : tmax;
    if (t < best) {
      best = t;
      bs = s;
    }
  }
  return bs ? { t: best, s: bs } : null;
}

export function allSolids() {
  return all;
}
