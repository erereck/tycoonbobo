// Multi-level navigation grids + A* (with stair links) + flow fields for raids.
import { groundAt, blockedAt, inArena } from './physics.js';
import { height, isWater, onBridge } from '../world/terrain.js';
import { PLAY_HALF } from '../world/layout.js';

const AGENT_R = 0.95;

class Grid {
  constructor(level, x0, z0, w, h, cell, yRef) {
    Object.assign(this, { level, x0, z0, w, h, cell, yRef });
    this.walk = new Uint8Array(w * h);
    this.gy = new Float32Array(w * h);
    this.offset = 0;
  }
  ix(x) { return Math.floor((x - this.x0) / this.cell); }
  iz(z) { return Math.floor((z - this.z0) / this.cell); }
  cx(ix) { return this.x0 + (ix + 0.5) * this.cell; }
  cz(iz) { return this.z0 + (iz + 0.5) * this.cell; }
  inside(x, z) {
    const ix = this.ix(x), iz = this.iz(z);
    return ix >= 0 && iz >= 0 && ix < this.w && iz < this.h;
  }
  probe(ix, iz) {
    const x = this.cx(ix), z = this.cz(iz);
    const i = iz * this.w + ix;
    if (this.level === 0) {
      const th = height(x, z);
      if (isWater(x, z) && !onBridge(x, z)) { this.walk[i] = 0; return; }
      const g = groundAt(x, z, Math.max(th, 0) + 0.6);
      this.gy[i] = g;
      this.walk[i] = blockedAt(x, z, g, AGENT_R) ? 0 : 1;
      if (Math.abs(x) > PLAY_HALF - 2 || Math.abs(z) > PLAY_HALF - 2) this.walk[i] = 0;
    } else {
      const g = groundAt(x, z, this.yRef);
      this.gy[i] = g;
      this.walk[i] = Math.abs(g - this.yRef) < 1.4 && !blockedAt(x, z, g, AGENT_R) ? 1 : 0;
    }
  }
  build(minX = -1e9, maxX = 1e9, minZ = -1e9, maxZ = 1e9) {
    const ix0 = Math.max(0, this.ix(minX)), ix1 = Math.min(this.w - 1, this.ix(maxX));
    const iz0 = Math.max(0, this.iz(minZ)), iz1 = Math.min(this.h - 1, this.iz(maxZ));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) this.probe(ix, iz);
  }
}

export const grids = [];
let total = 0;
let links = []; // {a:{level,x,z}, b:{level,x,z}, na, nb}
let linkMap = new Map();
let gScore, came, stamp, heapIds, heapF, gen = 1;

export function initNav() {
  const L0 = new Grid(0, -PLAY_HALF, -PLAY_HALF, (PLAY_HALF * 2) / 2, (PLAY_HALF * 2) / 2, 2, 0);
  const L1 = new Grid(1, -30, -26, 60, 38, 1, 12);
  const L2 = new Grid(2, -30, -26, 60, 38, 1, 24);
  grids.push(L0, L1, L2);
  let off = 0;
  for (const g of grids) {
    g.offset = off;
    off += g.w * g.h;
  }
  total = off;
  gScore = new Float32Array(total);
  came = new Int32Array(total);
  stamp = new Uint32Array(total);
  heapIds = new Int32Array(total + 16);
  heapF = new Float32Array(total + 16);
  L0.build();
  L1.build();
  L2.build();
}

export function rebuildBase() {
  grids[0].build(-52, 52, -52, 52);
  grids[1].build();
  grids[2].build();
  relink();
  flowCache.clear();
}

export function setLinks(list) {
  links = list;
  relink();
}
function nodeOf(level, x, z, searchR = 6) {
  const g = grids[level];
  if (!g) return -1;
  let ix = g.ix(x), iz = g.iz(z);
  if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h) {
    ix = Math.max(0, Math.min(g.w - 1, ix));
    iz = Math.max(0, Math.min(g.h - 1, iz));
  }
  if (g.walk[iz * g.w + ix]) return g.offset + iz * g.w + ix;
  let best = -1, bd = 1e9;
  for (let r = 1; r <= searchR; r++) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= g.w || jz >= g.h) continue;
        if (!g.walk[jz * g.w + jx]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = g.offset + jz * g.w + jx; }
      }
    if (best >= 0) return best;
  }
  return -1;
}
function relink() {
  linkMap = new Map();
  for (const l of links) {
    l.na = nodeOf(l.a.level, l.a.x, l.a.z, 3);
    l.nb = nodeOf(l.b.level, l.b.x, l.b.z, 3);
    if (l.na < 0 || l.nb < 0) continue;
    const d = Math.hypot(l.a.x - l.b.x, l.a.z - l.b.z) + 12;
    if (!linkMap.has(l.na)) linkMap.set(l.na, []);
    if (!linkMap.has(l.nb)) linkMap.set(l.nb, []);
    linkMap.get(l.na).push([l.nb, d]);
    linkMap.get(l.nb).push([l.na, d]);
  }
}

function gridOfNode(n) {
  for (let i = grids.length - 1; i >= 0; i--) if (n >= grids[i].offset) return grids[i];
  return grids[0];
}
function nodePos(n, out) {
  const g = gridOfNode(n);
  const li = n - g.offset;
  const ix = li % g.w, iz = (li / g.w) | 0;
  out.x = g.cx(ix);
  out.z = g.cz(iz);
  out.y = g.gy[li];
  out.level = g.level;
  return out;
}

export function levelOf(x, y, z) {
  if (inArena(x, z)) return -1;
  const g1 = grids[1];
  if (g1 && g1.inside(x, z)) {
    if (y > 20.5) return 2;
    if (y > 8.5) return 1;
  }
  return 0;
}

// heap
let hn = 0;
function hpush(id, f) {
  let i = hn++;
  heapIds[i] = id;
  heapF[i] = f;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapF[p] <= heapF[i]) break;
    [heapIds[p], heapIds[i]] = [heapIds[i], heapIds[p]];
    [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
    i = p;
  }
}
function hpop() {
  const top = heapIds[0];
  hn--;
  if (hn > 0) {
    heapIds[0] = heapIds[hn];
    heapF[0] = heapF[hn];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < hn && heapF[l] < heapF[m]) m = l;
      if (r < hn && heapF[r] < heapF[m]) m = r;
      if (m === i) break;
      [heapIds[m], heapIds[i]] = [heapIds[i], heapIds[m]];
      [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
      i = m;
    }
  }
  return top;
}

const _a = {}, _b = {};
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

export function lineClear(g, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / (g.cell * 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(steps, 1);
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const ix = g.ix(x), iz = g.iz(z);
    if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h) return false;
    if (!g.walk[iz * g.w + ix]) return false;
  }
  return true;
}

export function findPath(sx, sy, sz, tx, ty, tz, tLevel = null, maxIter = 60000) {
  const sl = levelOf(sx, sy, sz);
  if (sl < 0) return [{ x: tx, y: ty, z: tz, level: -1 }];
  const tl = tLevel ?? levelOf(tx, ty, tz);
  if (tl < 0) return null;
  const start = nodeOf(sl, sx, sz, 8);
  const goal = nodeOf(tl, tx, tz, 10);
  if (start < 0 || goal < 0) return null;
  // direct line on same level
  if (sl === tl && lineClear(grids[sl], sx, sz, tx, tz)) {
    const g = grids[tl];
    const gi = goal - g.offset;
    const gx = g.walk[g.iz(tz) * g.w + g.ix(tx)] ? tx : g.cx(gi % g.w);
    const gz = g.walk[g.iz(tz) * g.w + g.ix(tx)] ? tz : g.cz((gi / g.w) | 0);
    return [{ x: gx, y: ty, z: gz, level: tl }];
  }
  gen++;
  hn = 0;
  nodePos(goal, _b);
  const goalY = _b.y;
  const H = (n) => {
    nodePos(n, _a);
    return Math.hypot(_a.x - _b.x, _a.z - _b.z) + Math.abs(_a.y - goalY);
  };
  gScore[start] = 0;
  came[start] = -1;
  stamp[start] = gen;
  hpush(start, H(start));
  let found = false, it = 0;
  let bestN = start, bestH = Infinity;
  while (hn > 0 && it++ < maxIter) {
    const n = hpop();
    if (n === goal) { found = true; break; }
    const g = gridOfNode(n);
    const li = n - g.offset;
    const ix = li % g.w, iz = (li / g.w) | 0;
    const gs = gScore[n];
    const hh = H(n);
    if (hh < bestH) { bestH = hh; bestN = n; }
    for (let d = 0; d < 8; d++) {
      const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
      if (jx < 0 || jz < 0 || jx >= g.w || jz >= g.h) continue;
      const lj = jz * g.w + jx;
      if (!g.walk[lj]) continue;
      if (d >= 4 && (!g.walk[iz * g.w + jx] || !g.walk[jz * g.w + ix])) continue;
      const m = g.offset + lj;
      const ng = gs + DIRS[d][2] * g.cell;
      if (stamp[m] === gen && ng >= gScore[m]) continue;
      stamp[m] = gen;
      gScore[m] = ng;
      came[m] = n;
      hpush(m, ng + H(m));
    }
    const lk = linkMap.get(n);
    if (lk) {
      for (const [m, c] of lk) {
        const ng = gs + c;
        if (stamp[m] === gen && ng >= gScore[m]) continue;
        stamp[m] = gen;
        gScore[m] = ng;
        came[m] = n;
        hpush(m, ng + H(m));
      }
    }
  }
  const end = found ? goal : bestN;
  const raw = [];
  for (let n = end; n !== -1; n = came[n]) {
    raw.push(nodePos(n, {}));
    if (raw.length > 5000) break;
  }
  raw.reverse();
  if (found) {
    const last = raw[raw.length - 1];
    const g = grids[tl];
    if (g.inside(tx, tz) && g.walk[g.iz(tz) * g.w + g.ix(tx)]) {
      last.x = tx;
      last.z = tz;
    }
  }
  // smooth: string pull within same level
  const out = [];
  let anchor = { x: sx, z: sz, level: sl };
  let i = 0;
  while (i < raw.length) {
    let j = i;
    // advance while line from anchor is clear and same level
    while (j + 1 < raw.length && raw[j + 1].level === anchor.level && lineClear(grids[anchor.level], anchor.x, anchor.z, raw[j + 1].x, raw[j + 1].z)) j++;
    if (raw[j].level !== anchor.level || j === i) {
      out.push(raw[i]);
      anchor = raw[i];
      i++;
    } else {
      out.push(raw[j]);
      anchor = raw[j];
      i = j + 1;
    }
  }
  return out.length ? out : null;
}

// ---- flow field toward a target on level 0 ----
const flowCache = new Map();
export function flowField(tx, tz) {
  const key = Math.round(tx) + ',' + Math.round(tz);
  if (flowCache.has(key)) return flowCache.get(key);
  const g = grids[0];
  const dist = new Float32Array(g.w * g.h).fill(1e9);
  const t = nodeOf(0, tx, tz, 8);
  if (t < 0) return null;
  hn = 0;
  dist[t] = 0;
  hpush(t, 0);
  while (hn > 0) {
    const n = hpop();
    const ix = n % g.w, iz = (n / g.w) | 0;
    const dn = dist[n];
    for (let d = 0; d < 8; d++) {
      const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
      if (jx < 0 || jz < 0 || jx >= g.w || jz >= g.h) continue;
      const m = jz * g.w + jx;
      if (!g.walk[m]) continue;
      if (d >= 4 && (!g.walk[iz * g.w + jx] || !g.walk[jz * g.w + ix])) continue;
      const nd = dn + DIRS[d][2];
      if (nd < dist[m]) {
        dist[m] = nd;
        hpush(m, nd);
      }
    }
  }
  const f = { dist, g };
  flowCache.set(key, f);
  return f;
}
export function flowDir(f, x, z, out) {
  const g = f.g;
  const ix = g.ix(x), iz = g.iz(z);
  out.x = 0;
  out.z = 0;
  if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h) return false;
  let best = f.dist[iz * g.w + ix], bx = -1, bz = -1;
  const R = best >= 1e8 ? 3 : 1;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (!dx && !dz) continue;
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= g.w || jz >= g.h) continue;
      const v = f.dist[jz * g.w + jx] + (R > 1 ? Math.hypot(dx, dz) : 0);
      if (v < best) { best = v; bx = jx; bz = jz; }
    }
  if (bx < 0) return false;
  out.x = g.cx(bx) - x;
  out.z = g.cz(bz) - z;
  const l = Math.hypot(out.x, out.z) || 1;
  out.x /= l;
  out.z /= l;
  return true;
}
export function flowDistAt(f, x, z) {
  const g = f.g;
  const ix = g.ix(x), iz = g.iz(z);
  if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h) return 1e9;
  return f.dist[iz * g.w + ix];
}
