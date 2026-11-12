// The Goblin King: 3-phase boss with telegraphed slams, spins, charges, boulder rain and summons.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx } from '../engine/audio.js';
import { moveBody, groundAt } from '../engine/physics.js';
import { createRig, animateRig, setRigWeapon, makeWeapon, rigParts, rbox, plasticMat } from './rig.js';
import { ENEMIES } from '../defs.js';
import { mergeStatic } from '../engine/parts.js';
import { damage, spawnProjectile, inRadius } from './combat.js';
import { Enemy } from './enemies.js';
import { ARENA } from '../world/layout.js';
import { dampAngle, damp, clamp, lerp } from '../util.js';

function M(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class GoblinKing {
  constructor() {
    this.def = ENEMIES.rei;
    this.type = 'rei';
    this.team = 'enemy';
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.radius = 4.2;
    this.r = 3.2;
    this.h = 12;
    this.vy = 0;
    this.grounded = true;
    this.alive = true;
    this.active = true;
    this.isBoss = true;
    this.yaw = 0;
    const rig = createRig({ head: 0x6aa63a, torso: 0x5a2a20, arms: 0x6aa63a, legs: 0x3a2a1e }, { face: 'goblin', uniqueMats: true });
    const gold = plasticMat(0xffc940, { metal: 1, rough: 0.25 });
    // ears / nose
    const earG = new THREE.ConeGeometry(0.32, 1.5, 4);
    const e1 = M(earG, rig.mats.head, -0.9, 0.75, 0);
    e1.rotation.z = Math.PI / 2 + 0.3;
    const e2 = M(earG, rig.mats.head, 0.9, 0.75, 0);
    e2.rotation.z = -Math.PI / 2 - 0.3;
    const nose = M(new THREE.ConeGeometry(0.2, 0.8, 4).rotateX(Math.PI / 2), rig.mats.head, 0, 0.5, 0.85);
    // crown
    const crown = new THREE.Group();
    crown.position.set(0, 1.32, 0);
    crown.add(M(new THREE.CylinderGeometry(0.72, 0.7, 0.42, 16, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      crown.add(M(new THREE.ConeGeometry(0.16, 0.6, 4), gold, Math.cos(a) * 0.7, 0.45, Math.sin(a) * 0.7));
    }
    const gem = M(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.8, 0.5) }), 0, 0.05, 0.75);
    crown.add(gem);
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.3, 0.2) });
    const ey1 = M(new THREE.BoxGeometry(0.2, 0.12, 0.05), eyeM, -0.24, 0.72, 0.62);
    const ey2 = M(new THREE.BoxGeometry(0.2, 0.12, 0.05), eyeM, 0.24, 0.72, 0.62);
    rig.neck.add(e1, e2, nose, crown, ey1, ey2);
    // belly, cape, pauldrons
    const belly = M(rbox(2.3, 1.7, 1.4, 0.4), plasticMat(0x5f9a34, { unique: true }), 0, 2.7, 0.25);
    const cape = M(new THREE.BoxGeometry(2.4, 3.6, 0.1), plasticMat(0x9a1010, { unique: true }), 0, 2.5, -0.62);
    const fur = plasticMat(0xf2ede0, { unique: true });
    const p1 = M(rbox(1.4, 0.6, 1.4, 0.25), fur, -1.4, 4.1, 0);
    const p2 = M(rbox(1.4, 0.6, 1.4, 0.25), fur, 1.4, 4.1, 0);
    const collar = M(rbox(2.4, 0.5, 1.4, 0.2), fur, 0, 4.05, 0);
    rig.body.add(belly, cape, p1, p2, collar);
    rig.cape = cape;
    setRigWeapon(rig, makeWeapon('clavaRei'));
    rig.root.scale.setScalar(2.8);
    mergeStatic(rig.root);
    this.rig = rig;
    this.root = rig.root;
    this.pos = rig.root.position;
    this.mats = [...Object.values(rig.mats), belly.material, cape.material, fur];
    this.height = 5.2 * 2.8;
    this.state = 'intro';
    this.t = 0;
    this.atkT = 0;
    this.windup = -1;
    this.action = null;
    this.cds = { slam: 4, spin: 9, charge: 7, boulders: 12 };
    this.summoned = { 70: false, 40: false };
    this.speedNow = 0;
    this.minions = [];
    this.flash = 0;
    this.engaged = false;
  }

  spawn(scene) {
    this.pos.set(ARENA.x, 0, ARENA.z - 22);
    this.yaw = 0;
    scene.add(this.root);
    this.state = 'intro';
    this.t = 0;
    this.untargetable = true;
  }
  dispose(scene) {
    scene.remove(this.root);
    for (const m of this.minions) if (m.alive) { m.alive = false; m.removeT = 0; m.root.visible = false; }
    if (this.tele) G.fx.decals.remove(this.tele);
  }
  get phase() {
    const f = this.hp / this.maxHp;
    return f > 0.7 ? 1 : f > 0.35 ? 2 : 3;
  }
  onHit() {
    if (this.hp / this.maxHp < 0.7 && !this.summoned[70]) { this.summoned[70] = true; this.summon(); }
    if (this.hp / this.maxHp < 0.4 && !this.summoned[40]) { this.summoned[40] = true; this.summon(); }
  }
  summon() {
    sfx('roar');
    G.ui.announce('GUARDAS REAIS!', 'O Rei convocou reforços!', 'red', 1.8);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 0.25 + i * Math.PI * 0.25 + Math.PI;
      const x = ARENA.x + Math.cos(a) * 26, z = ARENA.z + Math.sin(a) * 26 * -1;
      const e = new Enemy('minion', x, z, null, { hpMult: 1 + G.state.level * 0.05 });
      e.state = 'raidChase';
      e.raid = { onDeath() {}, flow: null };
      G.enemies.list.push(e);
      this.minions.push(e);
      G.fx.burst(x, 2, z, 0x6aff5a, 20, 8, 0.8, 0.6);
    }
  }
  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    if (this.tele) { G.fx.decals.remove(this.tele); this.tele = null; }
    G.timeScale = 0.25;
    setTimeout(() => (G.timeScale = 1), 1600);
    G.cam.shake(1.6);
    sfx('roar');
    sfx('enemyDie');
    for (const p of rigParts(this.rig)) G.fx.debris.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 30, 10 + Math.random() * 20, (Math.random() - 0.5) * 30, p.size, p.color, 5);
    this.root.visible = false;
    for (let i = 0; i < 6; i++) G.fx.burst(this.pos.x, 6 + i * 2, this.pos.z, [0xffd84a, 0x6aff5a, 0xffffff][i % 3], 40, 22, 1.2, 1.2, 8);
    G.fx.decals.add({ shape: 'shock', x: this.pos.x, z: this.pos.z, y: 0, r: 30, color: 0xffd84a, dur: 1, additive: true });
    for (const m of this.minions) if (m.alive) m.die({});
    // rewards
    G.player.addXp(this.def.xp);
    for (let i = 0; i < 40; i++) G.loot.coin(this.pos.x, 4, this.pos.z, this.def.cash / 40);
    G.state.kills.rei = (G.state.kills.rei || 0) + 1;
    G.state.totalKills++;
    G.state.bossKills++;
    G.emit('kill', 'rei', this);
    G.emit('bossDefeated');
  }

  update(dt) {
    if (!this.alive) return;
    const pl = G.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    const enr = this.phase === 3 ? 0.35 : 0;
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(this.flash + enr * (0.5 + 0.5 * Math.sin(G.t * 6)), this.flash * 0.8, this.flash * 0.8);
    const hl = G.hover === this ? 1 : G.player?.target === this ? 0.5 : 0;
    for (const m of this.mats) if (m.userData.rimU) m.userData.rimU.value.setRGB(0.18 + hl * 1.2 + enr * 0.6, 0.15 + hl * 0.08, 0.17);
    if (this.state === 'intro') {
      if (this.t > 0.6 && !this.roared) {
        this.roared = true;
        sfx('roar');
        G.cam.shake(1.2);
        G.ui.bossIntro();
      }
      animateRig(this.rig, dt, { speed: 0, atk: this.t > 0.6 && this.t < 2 ? (this.t - 0.6) / 1.4 : -1, style: 'cast', hold: true });
      if (this.t > 3.6) {
        this.state = 'fight';
        this.untargetable = false;
        this.engaged = true;
      }
      this.root.rotation.y = this.yaw;
      return;
    }
    if (!pl || pl.dead) {
      animateRig(this.rig, dt, { speed: 0, atk: -1, hold: true });
      return;
    }
    const spMul = this.phase === 3 ? 1.3 : this.phase === 2 ? 1.12 : 1;
    for (const k in this.cds) this.cds[k] -= dt * spMul;
    this.atkT -= dt * spMul;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    let vx = 0, vz = 0, anim = -1, style = 'heavy';
    if (this.action) {
      const a = this.action;
      a.t += dt * spMul;
      const k = a.t / a.dur;
      if (a.kind === 'slam') {
        this.yaw = dampAngle(this.yaw, Math.atan2(a.x - this.pos.x, a.z - this.pos.z), 8, dt);
        anim = Math.min(0.62, k * 0.6);
        if (a.t >= a.dur) {
          this.hitArea(a.x, a.z, a.r, this.def.dmg * 2);
          this.endAction();
        }
      } else if (a.kind === 'spin') {
        anim = -1;
        this.rig.a.spin = k < 1 ? 0 : 0;
        this.rig.body.rotation.y = 0;
        if (a.t >= a.dur && !a.done) {
          a.done = true;
          a.spinT = 0;
          this.hitArea(this.pos.x, this.pos.z, a.r, this.def.dmg * 1.6, true);
        }
        if (a.done) {
          a.spinT += dt;
          this.rig.a.spin = a.spinT * 22;
          if (a.spinT > 0.5) { this.rig.a.spin = 0; this.endAction(); }
        }
      } else if (a.kind === 'charge') {
        if (a.t < a.dur) {
          this.yaw = Math.atan2(a.dx, a.dz);
          anim = 0.2;
        } else {
          const step = 60 * dt;
          moveBody(this, a.dx * step, a.dz * step, dt);
          a.moved += step;
          vx = a.dx;
          vz = a.dz;
          G.fx.dust(this.pos.x, 0, this.pos.z, 2, 2);
          if (!a.hit && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 5.5) {
            a.hit = true;
            damage(pl, this.def.dmg * 1.8, { team: 'enemy' });
            G.cam.shake(0.6);
          }
          if (a.moved >= a.len) { G.cam.shake(0.5); sfx('slam', { x: this.pos.x, z: this.pos.z }); this.endAction(); }
        }
      } else if (a.kind === 'boulders') {
        anim = Math.min(1, k);
        style = 'cast';
        if (a.t >= 0.6 && !a.thrown) {
          a.thrown = true;
          const n = this.phase === 3 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const ang = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 3 + Math.random() * 12;
            let tx = pl.pos.x + Math.cos(ang) * r, tz = pl.pos.z + Math.sin(ang) * r;
            const dd = Math.hypot(tx - ARENA.x, tz - ARENA.z);
            if (dd > ARENA.r - 2) { tx = ARENA.x + (tx - ARENA.x) / dd * (ARENA.r - 2); tz = ARENA.z + (tz - ARENA.z) / dd * (ARENA.r - 2); }
            const tele = G.fx.decals.add({ shape: 'circle', x: tx, z: tz, y: 0, r: 4.5, color: 0xff6a1a, dur: 1.4 + i * 0.12, alpha: 0.85 });
            setTimeout(() => {
              spawnProjectile({ kind: 'boulder', arc: true, x: this.pos.x, y: 14, z: this.pos.z, tx, tz, speed: 26 + Math.random() * 6, team: 'enemy', trail: true,
                onLand: (lx, lz) => {
                  G.fx.decals.remove(tele);
                  this.hitArea(lx, lz, 4.5, this.def.dmg * 1.2, false, true);
                } });
            }, 0);
            void tele;
          }
          sfx('whoosh');
        }
        if (a.t >= a.dur) this.endAction();
      }
    } else {
      // choose an action
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt);
      if (this.cds.boulders <= 0 && this.phase >= 2 && dist > 10) this.startBoulders();
      else if (this.cds.charge <= 0 && dist > 14) this.startCharge(dx / dist, dz / dist, dist);
      else if (this.cds.spin <= 0 && this.phase >= 2 && dist < 11) this.startSpin();
      else if (this.cds.slam <= 0 && dist < 22) this.startSlam(pl.pos.x, pl.pos.z);
      else if (dist > this.def.range + 1) {
        vx = dx / dist;
        vz = dz / dist;
      } else if (this.windup < 0 && this.atkT <= 0) {
        this.windup = 0;
        this.atkT = 1.6;
      }
    }
    if (this.windup >= 0) {
      this.windup += dt / 0.7;
      anim = this.windup;
      style = 'swing';
      if (this.windup >= 0.5 && !this.swung) {
        this.swung = true;
        const fx = this.pos.x + Math.sin(this.yaw) * 5, fz = this.pos.z + Math.cos(this.yaw) * 5;
        G.fx.decals.add({ shape: 'shock', x: fx, z: fz, y: 0, r: 5, color: 0xffa060, dur: 0.3, additive: true });
        if (Math.hypot(pl.pos.x - fx, pl.pos.z - fz) < 5.5) damage(pl, this.def.dmg, { team: 'enemy' });
        sfx('slam', { x: fx, z: fz, vol: 0.6 });
      }
      if (this.windup >= 1) { this.windup = -1; this.swung = false; }
    }
    const sp = this.def.speed * spMul;
    if (!this.action || this.action.kind !== 'charge') moveBody(this, vx * sp * dt, vz * sp * dt, dt);
    this.speedNow = damp(this.speedNow, Math.hypot(vx, vz) * sp, 8, dt);
    if (vx || vz) this.yaw = dampAngle(this.yaw, Math.atan2(vx, vz), 8, dt);
    this.root.rotation.y = this.yaw;
    animateRig(this.rig, dt, { speed: this.speedNow, moveRef: 10, atk: anim, style, hold: true });
    G.fx.blobs.add(this.pos.x, this.pos.y, this.pos.z, 5.2, 0.5);
    if (this.rig.cape) this.rig.cape.rotation.x = 0.2 + Math.sin(G.t * 3) * 0.06 + this.speedNow * 0.01;
    this.minions = this.minions.filter((m) => m.alive);
  }
  endAction() {
    this.action = null;
    if (this.tele) { G.fx.decals.remove(this.tele); this.tele = null; }
  }
  hitArea(x, z, r, dmg, ring = false, small = false) {
    G.cam.shake(small ? 0.35 : 0.9);
    sfx('slam', { x, z });
    G.fx.decals.add({ shape: 'shock', x, z, y: 0, r: r * 1.3, color: 0xffb070, dur: 0.5, additive: true });
    G.fx.dust(x, 0.2, z, small ? 12 : 30, r * 0.7, 0xc0a888);
    G.fx.bricks(x, 0.6, z, [0x7a766c, 0x5d5a52, 0x8a3a2a], small ? 5 : 12, 14, 0.8);
    for (const t of inRadius(x, z, r, 'enemy')) damage(t, dmg, { team: 'enemy' });
    void ring;
  }
  startSlam(x, z) {
    const r = this.phase === 3 ? 10 : 8.5;
    this.action = { kind: 'slam', t: 0, dur: 1.25, x, z, r };
    this.tele = G.fx.decals.add({ shape: 'circle', x, z, y: 0, r, color: 0xff2a10, dur: 1.25 / (this.phase === 3 ? 1.3 : this.phase === 2 ? 1.12 : 1), alpha: 0.95 });
    this.cds.slam = 6;
    sfx('warn');
  }
  startSpin() {
    const r = 12;
    this.action = { kind: 'spin', t: 0, dur: 1.3, r };
    this.tele = G.fx.decals.add({ shape: 'circle', x: this.pos.x, z: this.pos.z, y: 0, r, color: 0xff7a10, dur: 1.3 / 1.12, alpha: 0.9, follow: this.pos });
    this.cds.spin = 10;
    sfx('growl');
  }
  startCharge(dx, dz, dist) {
    const len = Math.min(34, dist + 6);
    this.action = { kind: 'charge', t: 0, dur: 1.0, dx, dz, len, moved: 0, hit: false };
    const mx = this.pos.x + dx * len * 0.5, mz = this.pos.z + dz * len * 0.5;
    this.tele = G.fx.decals.add({ shape: 'rect', x: mx, z: mz, y: 0, w: 8, l: len, rot: Math.atan2(dx, dz) + Math.PI, color: 0xff2a10, dur: 1.0, alpha: 0.9 });
    this.tele.mesh.scale.set(8, 1, len);
    this.tele.mesh.position.set(mx, 0.15, mz);
    this.cds.charge = 9;
    sfx('roar', { vol: 0.5 });
  }
  startBoulders() {
    this.action = { kind: 'boulders', t: 0, dur: 1.6, thrown: false };
    this.cds.boulders = this.phase === 3 ? 9 : 13;
  }
}
