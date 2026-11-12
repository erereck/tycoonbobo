// Damage, projectiles, AoE queries, death handling and hit feedback.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx } from '../engine/audio.js';
import { groundAt, blockedAt } from '../engine/physics.js';
import { rbox } from './rig.js';
import { clamp } from '../util.js';

const _v = new THREE.Vector3();
const projectiles = [];
let scene = null;

const PMAT = {};
const PGEO = {};
function projMesh(kind) {
  if (!PGEO.arrow) {
    PGEO.arrow = new THREE.BoxGeometry(0.14, 0.14, 2.2);
    PGEO.orb = new THREE.IcosahedronGeometry(0.55, 1);
    PGEO.brick = rbox(1.6, 0.8, 0.9, 0.08);
    PGEO.bolt = new THREE.OctahedronGeometry(0.6, 0);
    PGEO.boulder = new THREE.DodecahedronGeometry(1.6, 0);
    PMAT.arrow = new THREE.MeshStandardMaterial({ color: 0x8a5a2b });
    PMAT.arrowE = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.6, 0.3) });
    PMAT.orb = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 3) });
    PMAT.brick = new THREE.MeshStandardMaterial({ color: 0xc4281c, roughness: 0.5 });
    PMAT.bolt = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 3.2) });
    PMAT.boulder = new THREE.MeshStandardMaterial({ color: 0x6d655a, roughness: 0.9, flatShading: true });
  }
  const geo = PGEO[kind] || PGEO.orb;
  const mat = kind === 'arrowE' ? PMAT.arrowE : PMAT[kind] || PMAT.orb;
  const m = new THREE.Mesh(kind === 'arrowE' ? PGEO.arrow : geo, mat);
  m.castShadow = kind === 'brick' || kind === 'boulder';
  return m;
}

export function initCombat(s) {
  scene = s;
}

// cached per frame (called many times by projectiles, picking, AoE)
const _tgt = { frame: -1, player: [], enemy: [] };
export function allTargets(team) {
  if (_tgt.frame !== G.frame) {
    _tgt.frame = G.frame;
    const p = _tgt.player;
    p.length = 0;
    for (const e of G.enemies.list) if (e.alive && e.active) p.push(e);
    if (G.boss && G.boss.alive && G.boss.active) p.push(G.boss);
    if (G.tycoon?.dummy) p.push(G.tycoon.dummy);
    const en = _tgt.enemy;
    en.length = 0;
    if (G.player && !G.player.dead) en.push(G.player);
  }
  return team === 'player' ? _tgt.player : _tgt.enemy;
}

export function inRadius(x, z, r, team, y = null) {
  const out = [];
  for (const e of allTargets(team)) {
    const d = Math.hypot(e.pos.x - x, e.pos.z - z);
    if (d <= r + (e.radius || 1) && (y === null || Math.abs(e.pos.y - y) < 8)) out.push(e);
  }
  return out;
}

// amount already final. src: {team, crit, kind, x, z}
export function damage(target, amount, src = {}) {
  if (!target || !target.alive && target !== G.player) return 0;
  if (target === G.player) return G.player.takeDamage(amount, src);
  if (target.invuln) return 0;
  amount = Math.max(1, Math.round(amount));
  target.hp -= amount;
  target.flash = 1;
  target.lastHitT = G.t;
  if (target.onHit) target.onHit(amount, src);
  const crit = src.crit;
  G.fx.text.add(target.pos.x, target.pos.y + (target.height || 4) + 0.8, target.pos.z, String(amount), crit ? 'crit' : 'dmg', { scale: crit ? 1.3 : 1 });
  if (target.hp <= 0 && !target.immortal) {
    target.hp = 0;
    if (target.die) target.die(src);
  } else if (target.immortal && target.hp <= 0) target.hp = target.maxHp;
  return amount;
}

export function spawnProjectile(o) {
  // o: {kind, x,y,z, target (entity) | dir {x,z}, speed, dmg, team, range, pierce, radius, onHit, arc, tx,tz, crit}
  const m = projMesh(o.kind);
  m.position.set(o.x, o.y, o.z);
  scene.add(m);
  const p = { ...o, mesh: m, t: 0, dist: 0, hit: new Set(), sx: o.x, sz: o.z };
  if (o.arc) {
    // ballistic lob to (tx, tz)
    const dx = o.tx - o.x, dz = o.tz - o.z;
    const d = Math.hypot(dx, dz);
    p.flight = Math.max(0.6, d / o.speed);
    p.vx = dx / p.flight;
    p.vz = dz / p.flight;
    const ty = groundAt(o.tx, o.tz, 100);
    p.vy = (ty - o.y + 0.5 * 50 * p.flight * p.flight) / p.flight;
  }
  projectiles.push(p);
  return p;
}

export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    const m = p.mesh;
    let done = false;
    if (p.arc) {
      p.vy -= 50 * dt;
      m.position.x += p.vx * dt;
      m.position.y += p.vy * dt;
      m.position.z += p.vz * dt;
      m.rotation.x += dt * 4;
      m.rotation.z += dt * 3;
      if (p.trail) G.fx.alpha.emit(m.position.x, m.position.y, m.position.z, 0, 0.5, 0, 0.7, 1.5, 3, 0x8a7a66, 0x8a7a66, 0.4, 0, 1);
      if (p.t >= p.flight || m.position.y < groundAt(m.position.x, m.position.z, m.position.y + 2)) {
        if (p.onLand) p.onLand(m.position.x, m.position.z);
        done = true;
      }
    } else if (p.target) {
      const t = p.target;
      if (!t.alive && t !== G.player) {
        done = true;
      } else {
        _v.set(t.pos.x, t.pos.y + (t.height || 4) * 0.55, t.pos.z).sub(m.position);
        const d = _v.length();
        const step = p.speed * dt;
        if (d <= step + 0.5) {
          if (p.onHit) p.onHit(t, m.position);
          else damage(t, p.dmg, { team: p.team, crit: p.crit, kind: p.kind });
          impact(p, m.position);
          done = true;
        } else {
          _v.multiplyScalar(1 / d);
          m.position.addScaledVector(_v, step);
          m.lookAt(m.position.x + _v.x, m.position.y + _v.y, m.position.z + _v.z);
          if (p.kind === 'orb' || p.kind === 'bolt') G.fx.add.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.3, 0.9, 0.1, p.color || 0x60e0ff, 0xffffff, 1);
        }
      }
      if (p.t > 4) done = true;
    } else {
      // skillshot along dir
      const step = p.speed * dt;
      m.position.x += p.dir.x * step;
      m.position.z += p.dir.z * step;
      p.dist += step;
      if (p.kind === 'brick') {
        m.rotation.x += dt * 14;
        m.rotation.y = Math.atan2(p.dir.x, p.dir.z);
        G.fx.add.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.25, 0.7, 0.1, 0xff6040, 0xffa060, 0.8);
      } else {
        m.lookAt(m.position.x + p.dir.x, m.position.y, m.position.z + p.dir.z);
      }
      const targets = allTargets(p.team);
      for (const e of targets) {
        if (p.hit.has(e)) continue;
        const r = (e.radius || 1) + (p.radius || 0.8);
        if (Math.hypot(e.pos.x - m.position.x, e.pos.z - m.position.z) < r && Math.abs(e.pos.y + 2 - m.position.y) < 6) {
          p.hit.add(e);
          if (p.onHit) p.onHit(e, m.position);
          else damage(e, p.dmg, { team: p.team, crit: p.crit, kind: p.kind });
          impact(p, m.position);
          if (!p.pierce) { done = true; break; }
        }
      }
      if (p.dist >= p.range) done = true;
      if (blockedAt(m.position.x, m.position.z, m.position.y - 2.5, 0.2, 3)) {
        impact(p, m.position);
        done = true;
      }
    }
    if (done) {
      scene.remove(m);
      projectiles.splice(i, 1);
    }
  }
}

function impact(p, pos) {
  if (p.kind === 'brick') {
    sfx('brick', { x: pos.x, z: pos.z });
    G.fx.sparks(pos.x, pos.y, pos.z, 0xff8040, 8);
  } else if (p.kind === 'arrow' || p.kind === 'arrowE') {
    sfx('arrowHit', { x: pos.x, z: pos.z });
    G.fx.burst(pos.x, pos.y, pos.z, 0xffe0a0, 6, 5, 0.4, 0.3);
  } else if (p.kind === 'bolt' || p.kind === 'orb') {
    G.fx.burst(pos.x, pos.y, pos.z, p.color || 0x60e0ff, 14, 9, 0.7, 0.4);
  }
}

export function clearProjectiles() {
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
}

// generic "hit flash" for rigs: tint emissive on given materials
export function applyFlash(mats, f) {
  for (const m of mats) {
    if (!m.emissive) continue;
    m.emissive.setRGB(f * 0.9, f * 0.9, f * 0.9);
  }
}
export { clamp };
