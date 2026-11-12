// Forest creatures: models, AI (camps with leash/reset like LoL jungle, raids via flow field),
// elite telegraphed slams, loot and break-apart deaths.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx } from '../engine/audio.js';
import { moveBody, groundAt, inArena, blockedAt } from '../engine/physics.js';
import { flowField, flowDir, flowDistAt } from '../engine/nav.js';
import { createRig, animateRig, setRigWeapon, makeWeapon, rigParts, rbox, plasticMat } from './rig.js';
import { ENEMIES, CAMP_SPAWNS } from '../defs.js';
import { mergeStatic } from '../engine/parts.js';
import { patchMaterial } from '../engine/materials.js';
import { damage, spawnProjectile, inRadius } from './combat.js';
import { CAMPS } from '../world/layout.js';
import { dampAngle, damp, clamp, lerp, randRange } from '../util.js';

const _v = new THREE.Vector3();
const _d = { x: 0, z: 0 };

function uMat(color, o = {}) {
  const m = plasticMat(color, { unique: true, ...o });
  return m;
}
function M(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const HDR = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

// ---------------- models ----------------
function buildSlime(def) {
  const s = def.size;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5fe04a, roughness: 0.1, transparent: true, opacity: 0.82, emissive: new THREE.Color(0x1a5a10), envMapIntensity: 1.4 });
  mat.userData.baseEm = mat.emissive.clone();
  patchMaterial(mat, { cloud: true, rim: 0x26282e });
  const blob = M(rbox(s, s * 0.85, s, s * 0.28, 3), mat, 0, s * 0.425, 0);
  blob.castShadow = true;
  const core = M(rbox(s * 0.45, s * 0.45, s * 0.45, 0.08), plasticMat(0x2c8a22), 0, s * 0.4, 0);
  const eyeM = plasticMat(0x111111, { rough: 0.2 });
  const e1 = M(rbox(s * 0.12, s * 0.24, 0.1, 0.04), eyeM, -s * 0.18, s * 0.55, s * 0.5);
  const e2 = M(rbox(s * 0.12, s * 0.24, 0.1, 0.04), eyeM, s * 0.18, s * 0.55, s * 0.5);
  const sh = HDR(1.6, 1.6, 1.6);
  const h1 = M(new THREE.BoxGeometry(s * 0.05, s * 0.07, 0.05), sh, -s * 0.16, s * 0.6, s * 0.53);
  const h2 = M(new THREE.BoxGeometry(s * 0.05, s * 0.07, 0.05), sh, s * 0.2, s * 0.6, s * 0.53);
  body.add(blob, core, e1, e2, h1, h2);
  return { root, body, mats: [mat], height: s * 0.9, kind: 'slime' };
}

function buildWolf(def) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const col = def.alpha ? 0x3a3c44 : 0x8a8d96;
  const fur = uMat(col, { rough: 0.85 });
  const belly = uMat(def.alpha ? 0x25262c : 0xc9ccd2, { rough: 0.85 });
  const torso = M(rbox(1.8, 1.7, 3.8, 0.25), fur, 0, 2.6, 0);
  const chest = M(rbox(1.6, 1.3, 1.4, 0.2), belly, 0, 2.3, 1.3);
  const headG = new THREE.Group();
  headG.position.set(0, 3.2, 2.1);
  const head = M(rbox(1.5, 1.4, 1.6, 0.22), fur, 0, 0.1, 0.4);
  const snout = M(rbox(0.85, 0.7, 1.1, 0.15), belly, 0, -0.15, 1.5);
  const nose = M(rbox(0.4, 0.3, 0.2, 0.06), plasticMat(0x111111), 0, 0.05, 2.05);
  const eyeC = def.alpha ? HDR(4.2, 0.5, 0.35) : HDR(3.6, 2.9, 0.5);
  const e1 = M(new THREE.BoxGeometry(0.22, 0.16, 0.1), eyeC, -0.4, 0.35, 1.2);
  const e2 = M(new THREE.BoxGeometry(0.22, 0.16, 0.1), eyeC, 0.4, 0.35, 1.2);
  const earG = new THREE.ConeGeometry(0.35, 0.8, 4);
  const ear1 = M(earG, fur, -0.5, 1.1, 0.1);
  const ear2 = M(earG, fur, 0.5, 1.1, 0.1);
  headG.add(head, snout, nose, e1, e2, ear1, ear2);
  const legs = [];
  const legG = rbox(0.55, 1.8, 0.6, 0.12);
  for (const [x, z] of [[-0.6, 1.3], [0.6, 1.3], [-0.6, -1.3], [0.6, -1.3]]) {
    const p = new THREE.Group();
    p.position.set(x, 1.85, z);
    p.add(M(legG, fur, 0, -0.9, 0));
    body.add(p);
    legs.push(p);
  }
  const tailP = new THREE.Group();
  tailP.position.set(0, 3.1, -1.9);
  const tail = M(rbox(0.45, 0.45, 1.9, 0.15), fur, 0, 0, -0.85);
  tailP.add(tail);
  tailP.rotation.x = 0.6;
  body.add(torso, chest, headG, tailP);
  if (def.scale) root.scale.setScalar(def.scale);
  return { root, body, legs, headG, tailP, mats: [fur, belly], height: 3.8 * (def.scale || 1), kind: 'wolf' };
}

function buildGoblin(def, type) {
  const raider = !!def.raider;
  const colors = { head: 0x76b043, torso: type === 'capitao' ? 0x5a2a20 : 0x7a4f2c, arms: 0x76b043, legs: 0x4a3a2c };
  const rig = createRig(colors, { face: 'goblin', uniqueMats: true });
  // ears
  const earG = new THREE.ConeGeometry(0.3, 1.3, 4);
  const em = rig.mats.head;
  const e1 = M(earG, em, -0.85, 0.75, 0);
  e1.rotation.z = Math.PI / 2 + 0.35;
  const e2 = M(earG, em, 0.85, 0.75, 0);
  e2.rotation.z = -Math.PI / 2 - 0.35;
  const nose = M(new THREE.ConeGeometry(0.16, 0.6, 4).rotateX(Math.PI / 2), em, 0, 0.55, 0.75);
  rig.neck.add(e1, e2, nose);
  if (type === 'arqueiro') {
    const hood = M(rbox(1.45, 0.75, 1.45, 0.2), plasticMat(0x2f5a2a), 0, 1.15, -0.05);
    rig.neck.add(hood);
  }
  if (raider) {
    const band = M(rbox(1.32, 0.3, 1.32, 0.1), plasticMat(0xc0302a), 0, 0.95, 0);
    rig.neck.add(band);
  }
  if (type === 'capitao' || type === 'minion') {
    const metal = plasticMat(0x8d939c, { metal: 0.8, rough: 0.3 });
    const helm = M(rbox(1.4, 0.6, 1.4, 0.18), metal, 0, 1.15, 0);
    const h1 = M(new THREE.ConeGeometry(0.22, 1.1, 6), plasticMat(0xf0e8d0), -0.75, 1.55, 0);
    h1.rotation.z = 0.6;
    const h2 = M(new THREE.ConeGeometry(0.22, 1.1, 6), plasticMat(0xf0e8d0), 0.75, 1.55, 0);
    h2.rotation.z = -0.6;
    rig.neck.add(helm);
    if (type === 'capitao') {
      rig.neck.add(h1, h2);
      const sp1 = M(rbox(1.3, 0.5, 1.4, 0.15), metal, -1.4, 4.1, 0);
      const sp2 = M(rbox(1.3, 0.5, 1.4, 0.15), metal, 1.4, 4.1, 0);
      const cape = M(new THREE.BoxGeometry(2.0, 3.2, 0.1), plasticMat(0xa01e1e), 0, 2.6, -0.6);
      rig.body.add(sp1, sp2, cape);
      rig.cape = cape;
    }
  }
  if (def.weapon) setRigWeapon(rig, makeWeapon(def.weapon));
  const sc = 0.82 * (def.scale || 1);
  rig.root.scale.setScalar(sc);
  return { root: rig.root, rig, mats: Object.values(rig.mats), height: 5.2 * sc, kind: 'goblin' };
}

function buildGolem() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8c80, roughness: 0.95, flatShading: true, emissive: new THREE.Color(0) });
  patchMaterial(stone, { cloud: true, rim: 0x26282e });
  const moss = uMat(0x4f9a35, { rough: 0.95 });
  const crystal = HDR(0.4, 3.4, 3.7);
  const legs = [];
  for (const x of [-1.5, 1.5]) {
    const p = new THREE.Group();
    p.position.set(x, 3.4, 0);
    p.add(M(rbox(2.1, 3.4, 2.2, 0.35), stone, 0, -1.7, 0));
    body.add(p);
    legs.push(p);
  }
  const torso = M(rbox(5.4, 4.6, 3.6, 0.6), stone, 0, 5.8, 0);
  const mossTop = M(rbox(5.6, 1.1, 3.8, 0.4), moss, 0, 8.2, 0);
  const headG = new THREE.Group();
  headG.position.set(0, 8.4, 1.0);
  const head = M(rbox(2.4, 2.0, 2.2, 0.4), stone, 0, 0.6, 0);
  const e1 = M(new THREE.BoxGeometry(0.5, 0.3, 0.1), crystal, -0.55, 0.75, 1.12);
  const e2 = M(new THREE.BoxGeometry(0.5, 0.3, 0.1), crystal, 0.55, 0.75, 1.12);
  headG.add(head, e1, e2);
  const arms = [];
  for (const x of [-3.6, 3.6]) {
    const p = new THREE.Group();
    p.position.set(x, 7.6, 0);
    const a = M(rbox(2.2, 5.0, 2.2, 0.4), stone, 0, -2.4, 0);
    const fist = M(rbox(2.7, 2.3, 2.7, 0.45), stone, 0, -5.3, 0);
    const mm = M(rbox(2.3, 0.6, 2.3, 0.2), moss, 0, 0.1, 0);
    p.add(a, fist, mm);
    body.add(p);
    arms.push(p);
  }
  const cr = new THREE.OctahedronGeometry(0.8, 0);
  for (const [x, y, z, s] of [[-1.5, 9.2, -1, 1.2], [1.2, 9.5, -0.6, 1.5], [0, 7, -2, 1.1], [2.6, 8.6, 0.4, 0.8]]) {
    const c = M(cr, crystal, x, y, z);
    c.scale.set(s * 0.7, s * 1.4, s * 0.7);
    c.castShadow = false;
    body.add(c);
  }
  body.add(torso, mossTop, headG);
  return { root, body, legs, arms, headG, mats: [stone, moss], height: 10.5, kind: 'golem' };
}

// ---------------- enemy ----------------
let uid = 1;
export class Enemy {
  constructor(type, x, z, camp = null, o = {}) {
    this.id = uid++;
    this.type = type;
    this.def = ENEMIES[type];
    const d = this.def;
    this.camp = camp;
    this.team = 'enemy';
    this.maxHp = Math.round(d.hp * (o.hpMult || 1));
    this.hp = this.maxHp;
    this.dmg = d.dmg * (o.dmgMult || 1);
    this.radius = d.radius;
    this.r = Math.min(d.radius, 1.6);
    this.h = 4;
    this.vy = 0;
    this.grounded = true;
    this.alive = true;
    this.active = true;
    this.home = new THREE.Vector3(x, 0, z);
    this.state = d.raider ? 'raid' : 'idle';
    this.atkT = 0;
    this.windup = -1;
    this.slamCd = 4 + Math.random() * 2;
    this.special = null;
    this.wanderT = Math.random() * 3;
    this.wander = null;
    this.flash = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.speedNow = 0;
    this.hopT = Math.random();
    this.lastHitT = -99;
    this.raid = o.raid || null;
    let m;
    if (d.model === 'slime') m = buildSlime(d);
    else if (d.model === 'wolf') m = buildWolf(d);
    else if (d.model === 'golem') m = buildGolem(d);
    else m = buildGoblin(d, type);
    mergeStatic(m.root);
    this.model = m;
    this.height = m.height;
    this.root = m.root;
    this.pos = this.root.position;
    this.pos.set(x, groundAt(x, z, 50), z);
    this.home.y = this.pos.y;
    G.scene.add(this.root);
  }

  onHit(amount, src) {
    if (this.state === 'idle' || this.state === 'return') {
      this.state = 'chase';
      if (this.camp) this.camp.aggro();
    }
    if (this.state === 'raid') this.state = 'raidChase';
    if (this.model.kind === 'slime') sfx('squish', { x: this.pos.x, z: this.pos.z, vol: 0.6 });
    // juice: scale pop + small knockback away from the player (not for elites)
    this.pop = 1;
    if (this.baseScale === undefined) this.baseScale = this.root.scale.x;
    const pl = G.player;
    if (pl && !this.def.elite && !this.special) {
      const dx = this.pos.x - pl.pos.x, dz = this.pos.z - pl.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const k = src?.kind === 'brick' ? 1.6 : 0.9;
      this.kb = { x: (dx / l) * k, z: (dz / l) * k };
    }
  }

  die(src) {
    if (!this.alive) return;
    this.alive = false;
    const d = this.def;
    this.root.visible = false;
    for (const p of this.model.rig ? rigParts(this.model.rig) : this.partsGeneric()) {
      G.fx.debris.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 14, 6 + Math.random() * 10, (Math.random() - 0.5) * 14, p.size, p.color, 2.2);
    }
    G.fx.burst(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, this.model.kind === 'slime' ? 0x6fe35a : 0xffffff, 16, 9, 0.7, 0.5);
    sfx(this.model.kind === 'slime' ? 'squish' : 'enemyDie', { x: this.pos.x, z: this.pos.z });
    if (d.elite) { G.cam.shake(0.5); G.hitStop = 0.08; }
    // rewards
    const pl = G.player;
    if (pl && !pl.dead && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 80) pl.addXp(d.xp);
    G.loot.drop(this, d);
    G.state.kills[this.type] = (G.state.kills[this.type] || 0) + 1;
    G.state.totalKills++;
    G.emit('kill', this.type, this);
    if (d.split) {
      for (let i = 0; i < 2; i++) {
        const e = new Enemy(d.split, this.pos.x + (i ? 1.5 : -1.5), this.pos.z + (Math.random() - 0.5) * 2, this.camp);
        e.state = 'chase';
        e.vy = 14;
        e.grounded = false;
        G.enemies.list.push(e);
        if (this.camp) this.camp.members.push(e);
      }
    }
    if (this.camp) this.camp.onDeath(this);
    if (this.raid) this.raid.onDeath(this);
    if (this.telegraph) { G.fx.decals.remove(this.telegraph); this.telegraph = null; }
    this.removeT = 0.1;
  }

  partsGeneric() {
    const parts = [];
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      o.matrixWorld.decompose(p, q, s);
      parts.push({ pos: p, size: [(bb.max.x - bb.min.x) * s.x, (bb.max.y - bb.min.y) * s.y, (bb.max.z - bb.min.z) * s.z], color: o.material.color ? o.material.color.getHex() : 0xffffff });
    });
    return parts.slice(0, 14);
  }

  dispose() {
    G.scene.remove(this.root);
  }

  // ---------- AI ----------
  update(dt) {
    const pl = G.player;
    const d = this.def;
    const distP = pl ? Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) : 1e9;
    // sleep far away (camps only)
    const far = distP > 150 && !this.raid;
    this.active = !far;
    this.root.visible = !far;
    if (far) return;
    this.flash = Math.max(0, this.flash - dt * 6);
    // hover / target highlight is a red rim (LoL-style outline feel), hit flash is white emissive
    const hl = G.hover === this ? 1 : G.player?.target === this ? 0.6 : 0;
    this.hl = damp(this.hl || 0, hl, 14, dt);
    if (this.flash > 0 || this.hl > 0.001 || this._lit) {
      this._lit = this.flash > 0 || this.hl > 0.001;
      for (const m of this.model.mats) {
        if (m.emissive) {
          const b = m.userData.baseEm;
          m.emissive.setRGB(this.flash + (b ? b.r : 0), this.flash * 0.9 + (b ? b.g : 0), this.flash * 0.9 + (b ? b.b : 0));
        }
        if (m.userData.rimU) m.userData.rimU.value.setRGB(0.15 + this.hl * 1.3, 0.15 + this.hl * 0.08, 0.17 + this.hl * 0.05);
      }
    }
    // hit pop + knockback recovery
    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 6);
      const s = (this.baseScale || 1) * (1 + Math.sin(this.pop * Math.PI) * 0.09);
      this.root.scale.setScalar(s);
    }
    if (this.kb) {
      moveBody(this, this.kb.x * dt * 10, this.kb.z * dt * 10, dt);
      this.kb.x *= Math.exp(-dt * 10);
      this.kb.z *= Math.exp(-dt * 10);
      if (Math.abs(this.kb.x) + Math.abs(this.kb.z) < 0.02) this.kb = null;
    }
    const plOk = pl && !pl.dead && Math.abs(pl.pos.y - this.pos.y) < 7 && !pl.inBaseSafe;
    let vx = 0, vz = 0, want = null;
    const leash = this.camp ? this.camp.r + 28 : 40;
    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    this.slamCd -= dt;
    this.atkT -= dt;

    if (this.special) {
      this.updateSpecial(dt);
    } else {
      switch (this.state) {
        case 'idle': {
          if (plOk && distP < d.aggro && !pl.inBase) {
            this.state = 'chase';
            if (this.camp) this.camp.aggro();
            if (this.model.kind === 'wolf') sfx('growl', { x: this.pos.x, z: this.pos.z });
            break;
          }
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 2 + Math.random() * 4;
            const a = Math.random() * Math.PI * 2, r = Math.random() * (this.camp ? this.camp.r * 0.45 : 4);
            this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
          }
          if (this.wander) {
            want = this.wander;
            if (Math.hypot(want.x - this.pos.x, want.z - this.pos.z) < 0.8) this.wander = null;
          }
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt);
          break;
        }
        case 'return': {
          want = this.home;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.6 * dt);
          if (homeD < 1.5) this.state = 'idle';
          break;
        }
        case 'chase':
        case 'raidChase': {
          if (!plOk || (this.state === 'chase' && (homeD > leash || pl.inBase))) {
            this.state = this.state === 'raidChase' ? 'raid' : 'return';
            if (this.camp && this.state === 'return') this.camp.reset();
            break;
          }
          if (this.state === 'raidChase' && distP > 34) { this.state = 'raid'; break; }
          const reach = d.range + (pl.radius || 1) + this.radius * 0.3;
          // elite slam
          if (d.slam && this.slamCd <= 0 && distP < 16) {
            this.startSlam(pl);
            break;
          }
          if (this.model.kind === 'wolf' && this.slamCd <= 0 && distP > 6 && distP < 13) {
            this.startPounce(pl);
            break;
          }
          if (distP <= reach) {
            this.faceTo(pl.pos, dt);
            if (this.windup < 0 && this.atkT <= 0) this.startAttack();
          } else if (this.windup < 0) want = pl.pos;
          break;
        }
        case 'raid': {
          const vault = G.tycoon?.vault;
          if (plOk && distP < d.aggro) { this.state = 'raidChase'; break; }
          if (!vault) break;
          const vd = Math.hypot(vault.pos.x - this.pos.x, vault.pos.z - this.pos.z);
          if (vd < 4.5) {
            this.faceTo(vault.pos, dt);
            if (this.windup < 0 && this.atkT <= 0) this.startAttack(vault);
          } else {
            const f = this.raid?.flow;
            if (f && flowDistAt(f, this.pos.x, this.pos.z) < 1e8 && flowDir(f, this.pos.x, this.pos.z, _d)) {
              vx = _d.x;
              vz = _d.z;
            } else want = vault.pos;
          }
          break;
        }
      }
    }
    // windup -> strike
    if (this.windup >= 0) {
      this.windup += dt / 0.5;
      if (this.windup >= 1) {
        this.windup = -1;
        this.strike();
      }
    }
    // move
    let sp = d.speed * (this.slowT > 0 ? 0.55 : 1);
    this.slowT = Math.max(0, (this.slowT || 0) - dt);
    if (this.state === 'return') sp *= 1.4;
    if (this.state === 'idle') sp *= 0.35;
    if (want) {
      const dx = want.x - this.pos.x, dz = want.z - this.pos.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.3) { vx = dx / l; vz = dz / l; }
    }
    if (this.special || this.windup >= 0) { vx = 0; vz = 0; }
    if (vx || vz) this.yaw = dampAngle(this.yaw, Math.atan2(vx, vz), 10, dt);
    // slime hop movement
    let mul = 1;
    if (this.model.kind === 'slime') {
      this.hopT += dt * 2.2;
      const ph = this.hopT % 1;
      mul = ph < 0.55 ? 1.6 : 0.05;
      if (ph < 0.02 && (vx || vz)) this.vy = 9;
    }
    // separation from other enemies
    const near = G.enemies.list;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === this || !o.alive) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const dd = ox * ox + oz * oz;
      const rr = (this.r + o.r) * 1.1;
      if (dd < rr * rr && dd > 1e-4) {
        const l = Math.sqrt(dd);
        vx += (ox / l) * 0.6;
        vz += (oz / l) * 0.6;
      }
    }
    const before = this.pos.x + this.pos.z;
    moveBody(this, vx * sp * mul * dt, vz * sp * mul * dt, dt);
    this.speedNow = damp(this.speedNow, Math.hypot(vx, vz) * sp * (this.model.kind === 'slime' ? 0.5 : 1), 10, dt);
    void before;
    this.root.rotation.y = this.yaw;
    this.animate(dt);
    G.fx.blobs.add(this.pos.x, this.grounded ? this.pos.y : groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5), this.pos.z, Math.max(1.2, this.radius * 1.25), 0.42);
  }

  faceTo(p, dt) {
    this.yaw = dampAngle(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 12, dt);
  }

  startAttack(tgt) {
    this.windup = 0;
    this.atkTarget = tgt || G.player;
    this.atkT = 1 / this.def.as;
    if (this.def.ranged) sfx('bow', { x: this.pos.x, z: this.pos.z, vol: 0.5 });
  }
  strike() {
    const t = this.atkTarget;
    const d = this.def;
    if (!t) return;
    if (t.isVault) {
      t.hit(this.dmg, this);
      return;
    }
    if (d.ranged) {
      spawnProjectile({ kind: 'arrowE', x: this.pos.x, y: this.pos.y + this.height * 0.65, z: this.pos.z, target: t, speed: 48, dmg: this.dmg, team: 'enemy' });
      return;
    }
    const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    if (dist <= d.range + (t.radius || 1) + this.radius * 0.3 + 1.2 && t.alive !== false) {
      damage(t, this.dmg * (0.9 + Math.random() * 0.2), { team: 'enemy', src: this });
      if (this.model.kind === 'wolf') sfx('growl', { x: this.pos.x, z: this.pos.z, vol: 0.5 });
      else sfx('punch', { x: this.pos.x, z: this.pos.z, vol: 0.7 });
    } else sfx('swing', { x: this.pos.x, z: this.pos.z, vol: 0.4 });
  }

  startSlam(pl) {
    this.slamCd = 6.5 + Math.random() * 2;
    const r = this.type === 'golem' ? 8 : 6;
    const tx = this.type === 'golem' ? pl.pos.x : this.pos.x, tz = this.type === 'golem' ? pl.pos.z : this.pos.z;
    this.special = { kind: 'slam', t: 0, dur: 1.15, x: tx, z: tz, r };
    this.telegraph = G.fx.decals.add({ shape: 'circle', x: tx, z: tz, y: groundAt(tx, tz, this.pos.y + 3), r, color: 0xff3a1a, dur: 1.15, alpha: 0.9 });
    sfx('warn', { x: tx, z: tz });
    if (this.type === 'golem') sfx('growl', { x: this.pos.x, z: this.pos.z });
  }
  startPounce(pl) {
    this.slamCd = 5 + Math.random() * 3;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz);
    this.special = { kind: 'pounce', t: 0, dur: 0.55, dx: dx / l, dz: dz / l, len: l - 1, hit: false };
    this.vy = 16;
    this.grounded = false;
    sfx('growl', { x: this.pos.x, z: this.pos.z });
  }
  updateSpecial(dt) {
    const s = this.special;
    s.t += dt;
    if (s.kind === 'slam') {
      this.faceTo({ x: s.x, z: s.z }, dt);
      if (s.t >= s.dur) {
        this.special = null;
        this.telegraph = null;
        G.cam.shake(0.6);
        sfx('slam', { x: s.x, z: s.z });
        G.fx.decals.add({ shape: 'shock', x: s.x, z: s.z, r: s.r * 1.3, color: 0xffb070, dur: 0.5, additive: true });
        G.fx.dust(s.x, groundAt(s.x, s.z, this.pos.y + 3), s.z, 24, s.r * 0.8, 0xb8a888);
        G.fx.bricks(s.x, groundAt(s.x, s.z, this.pos.y + 3) + 0.5, s.z, [0x7a7468, 0x5f5a50, 0x8b6b45], 10, 12, 0.7);
        for (const t of inRadius(s.x, s.z, s.r, 'enemy')) damage(t, this.dmg * 1.8, { team: 'enemy', src: this });
      }
    } else if (s.kind === 'pounce') {
      const step = (s.len / s.dur) * dt;
      moveBody(this, s.dx * step, s.dz * step, dt);
      const pl = G.player;
      if (!s.hit && pl && !pl.dead && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 2.6) {
        s.hit = true;
        damage(pl, this.dmg * 1.3, { team: 'enemy' });
      }
      if (s.t >= s.dur) this.special = null;
    }
  }

  animate(dt) {
    const m = this.model;
    const atk = this.windup >= 0 ? this.windup : -1;
    if (m.kind === 'goblin') {
      const style = this.def.ranged ? 'shoot' : this.special?.kind === 'slam' ? 'heavy' : 'swing';
      const sAtk = this.special?.kind === 'slam' ? Math.min(1, this.special.t / this.special.dur) * 0.6 : atk;
      animateRig(m.rig, dt, { speed: this.speedNow, moveRef: 12, atk: sAtk, style, hold: true, air: !this.grounded });
      if (m.rig.cape) m.rig.cape.rotation.x = 0.15 + this.speedNow * 0.02 + Math.sin(G.t * 4) * 0.05;
    } else if (m.kind === 'slime') {
      const ph = this.hopT % 1;
      const sq = this.grounded ? (ph < 0.55 ? 1 + Math.sin(ph / 0.55 * Math.PI) * 0.12 : 1 - Math.sin((ph - 0.55) / 0.45 * Math.PI) * 0.15) : 1.12;
      const a = atk >= 0 ? Math.sin(atk * Math.PI) * 0.3 : 0;
      m.body.scale.set(1 / Math.sqrt(sq) + a * 0.3, sq + a, 1 / Math.sqrt(sq) + a * 0.3);
      if (this.special?.kind === 'slam') m.body.scale.y = 1 - Math.min(1, this.special.t / this.special.dur) * 0.4;
    } else if (m.kind === 'wolf') {
      const sp = this.speedNow;
      this.ph = (this.ph || 0) + dt * (3 + sp * 0.8);
      const a = Math.min(1, sp / 8) * 0.8;
      m.legs[0].rotation.x = Math.sin(this.ph) * a;
      m.legs[3].rotation.x = Math.sin(this.ph) * a;
      m.legs[1].rotation.x = -Math.sin(this.ph) * a;
      m.legs[2].rotation.x = -Math.sin(this.ph) * a;
      m.tailP.rotation.y = Math.sin(G.t * 6) * 0.3;
      m.headG.rotation.x = atk >= 0 ? -Math.sin(atk * Math.PI) * 0.6 : Math.sin(G.t * 2) * 0.05;
      m.body.rotation.x = this.special?.kind === 'pounce' ? -0.3 : 0;
    } else if (m.kind === 'golem') {
      const sp = this.speedNow;
      this.ph = (this.ph || 0) + dt * (1.5 + sp * 0.35);
      const a = Math.min(1, sp / 5) * 0.5;
      m.legs[0].rotation.x = Math.sin(this.ph) * a;
      m.legs[1].rotation.x = -Math.sin(this.ph) * a;
      let ar = Math.sin(this.ph) * a * 0.6;
      if (this.special?.kind === 'slam') {
        const t = this.special.t / this.special.dur;
        ar = t < 0.8 ? -lerp(0, 2.8, t / 0.8) : -2.8 + (t - 0.8) / 0.2 * 3.2;
        m.arms[0].rotation.x = ar;
        m.arms[1].rotation.x = ar;
      } else if (atk >= 0) {
        m.arms[1].rotation.x = atk < 0.6 ? -lerp(0, 1.8, atk / 0.6) : -1.8 + (atk - 0.6) / 0.4 * 1.8;
        m.arms[0].rotation.x = -ar;
      } else {
        m.arms[0].rotation.x = -ar;
        m.arms[1].rotation.x = ar;
      }
      m.body.position.y = Math.abs(Math.sin(this.ph)) * 0.25 * a;
      m.headG.rotation.y = Math.sin(G.t * 0.7) * 0.2;
    }
  }
}

// ---------------- camps ----------------
class Camp {
  constructor(def) {
    Object.assign(this, def);
    this.members = [];
    this.timer = 0;
    this.cleared = false;
  }
  spawn() {
    this.members = [];
    for (const [type, ox, oz] of CAMP_SPAWNS[this.kind]) {
      const e = new Enemy(type, this.x + ox, this.z + oz, this);
      this.members.push(e);
      G.enemies.list.push(e);
    }
    this.cleared = false;
    G.fx.dust(this.x, groundAt(this.x, this.z, 50), this.z, 10, 4);
  }
  aggro() {
    for (const m of this.members) if (m.alive && (m.state === 'idle' || m.state === 'return')) m.state = 'chase';
  }
  reset() {
    for (const m of this.members) if (m.alive) m.state = 'return';
  }
  onDeath() {
    if (this.members.every((m) => !m.alive)) {
      this.cleared = true;
      this.timer = this.respawn;
      G.emit('campCleared', this);
    }
  }
  update(dt) {
    if (this.cleared) {
      this.timer -= dt;
      if (this.timer <= 0) this.spawn();
    }
  }
}

// ---------------- raids ----------------
class Raid {
  constructor(size, power) {
    this.alive = 0;
    this.total = size;
    this.done = false;
    const v = G.tycoon.vault;
    this.flow = flowField(v.pos.x, v.pos.z);
    const spots = [[0, -78], [-64, -10], [62, 20], [-30, 92], [40, 94], [0, 72]];
    const off = Math.floor(Math.random() * spots.length);
    for (let i = 0; i < size; i++) {
      const sp = spots[(off + (i % 3)) % spots.length];
      let x = sp[0], z = sp[1];
      for (let k = 0; k < 12; k++) {
        const tx = sp[0] + (Math.random() - 0.5) * 10, tz = sp[1] + (Math.random() - 0.5) * 10;
        if (!blockedAt(tx, tz, groundAt(tx, tz, 50), 1.1)) { x = tx; z = tz; break; }
      }
      const type = power > 1.5 && i % 3 === 2 ? 'raiderLobo' : 'raider';
      const e = new Enemy(type, x, z, null, { raid: this, hpMult: power, dmgMult: 0.8 + power * 0.25 });
      e.state = 'raid';
      G.enemies.list.push(e);
      this.alive++;
    }
  }
  onDeath() {
    this.alive--;
    if (this.alive <= 0 && !this.done) {
      this.done = true;
      G.emit('raidWon');
    }
  }
}

export function createEnemies() {
  const E = {
    list: [],
    camps: CAMPS.map((c) => new Camp(c)),
    raid: null,
    init() {
      for (const c of this.camps) c.spawn();
    },
    startRaid(size, power) {
      this.raid = new Raid(size, power);
      return this.raid;
    },
    update(dt) {
      for (const c of this.camps) c.update(dt);
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (!e.alive) {
          e.removeT -= dt;
          if (e.removeT <= 0) {
            e.dispose();
            this.list.splice(i, 1);
          }
          continue;
        }
        e.update(dt);
      }
    },
    raidersAlive() {
      return this.list.filter((e) => e.alive && e.raid).length;
    },
  };
  return E;
}
