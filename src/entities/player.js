// The Noob: LoL-style controls (right-click move/attack, A-move, QWER/D/F/B), FP mode inside base,
// stats/leveling, abilities, death & respawn.
import * as THREE from 'three';
import { G } from '../G.js';
import { input } from '../engine/input.js';
import { sfx } from '../engine/audio.js';
import { moveBody, groundAt, blockedAt, inArena } from '../engine/physics.js';
import { findPath, levelOf } from '../engine/nav.js';
import { createRig, animateRig, setRigWeapon, makeWeapon, rigParts, rbox } from './rig.js';
import { WEAPONS, ABILITIES, XP_TABLE, MAX_LEVEL, keymap } from '../defs.js';
import { damage, spawnProjectile, inRadius, allTargets } from './combat.js';
import { Trail } from '../engine/fx.js';
import { mouseRay, centerRay, pickEnemy, pickInteract, pickGround, aimPoint } from '../picking.js';
import { clamp, dampAngle, damp, lerp } from '../util.js';
import { PLOT_HALF } from '../world/layout.js';

export const SPAWN = new THREE.Vector3(0, 0, 22);
const NOOB = { head: 0xf5cd30, torso: 0x0d69ac, arms: 0xf5cd30, legs: 0xa4bd47 };
const _v = new THREE.Vector3(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3();

export class Player {
  constructor(scene) {
    this.rig = createRig(NOOB, { uniqueMats: true });
    this.rig.root.name = 'player';
    scene.add(this.rig.root);
    this.pos = this.rig.root.position;
    this.pos.copy(SPAWN);
    this.vy = 0;
    this.grounded = true;
    this.r = 0.85;
    this.h = 5;
    this.yaw = Math.PI;
    this.team = 'player';
    this.radius = 1;
    this.height = 5.2;
    this.alive = true;
    this.dead = false;
    this.path = null;
    this.pathI = 0;
    this.target = null;
    this.attackMove = false;
    this.atkTimer = 0;
    this.atkAnim = -1;
    this.atkHitDone = false;
    this.repathT = 0;
    this.cd = { Q: 0, W: 0, E: 0, R: 0, D: 0, F: 0 };
    this.shield = 0;
    this.shieldT = 0;
    this.hasteT = 0;
    this.respawnT = 0;
    this.recallT = -1;
    this.lastHitT = -99;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.dashHit = new Set();
    this.healT = 0;
    this.aiming = null;
    this.aimDecal = null;
    this.rangeDecal = null;
    this.armedA = false;
    this.holdMoveT = 0;
    this.stepT = 0;
    this.speedNow = 0;
    this.orbit = [];
    this.inBase = true;
    this.combatT = -99;
    this.pendingInteract = null;
    this.fpVel = new THREE.Vector3();
    this.hp = 100;
    // first-person viewmodel (arm + tool), parented to the camera
    this.vm = new THREE.Group();
    this.vmArm = new THREE.Mesh(rbox(0.55, 1.9, 0.55, 0.08), this.rig.mats.arms);
    this.vmArm.position.set(0, -0.6, 0);
    this.vmPivot = new THREE.Group();
    this.vmPivot.add(this.vmArm);
    this.vmTool = new THREE.Group();
    this.vmTool.position.set(0, -1.5, 0);
    this.vmTool.rotation.y = Math.PI;
    this.vmPivot.add(this.vmTool);
    this.vm.add(this.vmPivot);
    this.vm.position.set(0.75, -0.75, -1.25);
    this.vm.visible = false;
    G.camera.add(this.vm);
    this.recalc(true);
    this.equip(G.state.weapon, true);
    this.buildOrbit(scene);
    // player rim, weapon trail, selection + target rings
    for (const m of Object.values(this.rig.mats)) if (m.userData.rimU) m.userData.rimU.value.setRGB(0.16, 0.3, 0.5);
    this.trail = new Trail(scene, 0xfff0d0, 16, 0.18);
    this.selRing = G.fx.decals.add({ shape: 'ring', x: this.pos.x, z: this.pos.z, y: this.pos.y, r: 1.8, color: 0x46d0ff, persist: true, follow: this.pos, alpha: 0.55, additive: true });
    this.tgtRing = G.fx.decals.add({ shape: 'ring', x: 0, z: 0, y: 0, r: 2, color: 0xff3a2a, persist: true, follow: { x: 0, y: -999, z: 0 }, alpha: 0.9, additive: true });
  }

  get weapon() {
    return WEAPONS[G.state.weapon] || WEAPONS.punhos;
  }
  get level() {
    return G.state.level;
  }
  recalc(full = false) {
    const L = this.level;
    const bonusHp = (G.tycoon?.bonusHp || 0);
    this.maxHp = Math.round(130 + 24 * (L - 1) + bonusHp);
    this.dmgMult = 1 + 0.07 * (L - 1);
    this.baseSpeed = 16;
    if (full) this.hp = this.maxHp;
    this.hp = Math.min(this.hp, this.maxHp);
  }
  get attackDamage() {
    return this.weapon.dmg * this.dmgMult;
  }
  get attackSpeed() {
    return this.weapon.as * (1 + 0.02 * (this.level - 1));
  }
  get moveSpeed() {
    return this.baseSpeed * (this.hasteT > 0 ? 1.35 : 1) * (this.recallT >= 0 ? 0 : 1);
  }
  equip(id, silent = false) {
    if (!WEAPONS[id]) return;
    G.state.weapon = id;
    setRigWeapon(this.rig, id === 'punhos' ? null : makeWeapon(id));
    if (this.vmTool) {
      this.vmTool.clear();
      if (id !== "punhos") {
        const w = makeWeapon(id);
        w.scale.setScalar(0.55);
        this.vmTool.add(w);
      }
    }
    if (!silent) {
      sfx('item');
      G.fx.burst(this.pos.x, this.pos.y + 3, this.pos.z, 0xfff0a0, 14, 7, 0.6, 0.5);
    }
    G.emit('weapon', id);
  }

  buildOrbit(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x46c8ff, emissive: 0x1a8fd0, emissiveIntensity: 1.2, roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rbox(0.9, 0.9, 0.9, 0.12), mat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.orbit.push(m);
    }
  }

  addXp(n) {
    if (G.state.level >= MAX_LEVEL) return;
    G.state.xp += n;
    let up = false;
    while (G.state.level < MAX_LEVEL && G.state.xp >= XP_TABLE(G.state.level)) {
      G.state.xp -= XP_TABLE(G.state.level);
      G.state.level++;
      up = true;
    }
    if (up) {
      const old = this.maxHp;
      this.recalc();
      this.hp += this.maxHp - old;
      sfx('levelup');
      G.fx.ring(this.pos.x, this.pos.y + 0.5, this.pos.z, 0xffd84a, 4, 40, 14);
      G.fx.beam(this.pos.x, this.pos.y, this.pos.z, 0xffd84a, 30, 40);
      G.fx.decals.add({ shape: 'shock', x: this.pos.x, z: this.pos.z, y: this.pos.y, r: 8, color: 0xffd84a, dur: 0.6, additive: true });
      G.ui.toast(`SUBIU DE NÍVEL! Nível ${G.state.level}`, 'gold');
      G.R.grade.uniforms.uFlashColor.value.setRGB(1, 0.85, 0.35);
      G.R.grade.uniforms.uFlash.value = 0.35;
      setTimeout(() => G.R.grade.uniforms.uFlashColor.value.setRGB(1, 1, 1), 900);
      G.emit('levelup', G.state.level);
    }
  }

  takeDamage(amount, src = {}) {
    if (this.dead || this.invulnT > 0) return 0;
    amount = Math.max(1, Math.round(amount));
    let a = amount;
    if (this.shield > 0) {
      const s = Math.min(this.shield, a);
      this.shield -= s;
      a -= s;
      G.fx.burst(this.pos.x, this.pos.y + 3, this.pos.z, 0x60d0ff, 6, 6, 0.5, 0.3);
    }
    this.hp -= a;
    this.lastHitT = G.t;
    this.combatT = G.t;
    this.flash = 1;
    G.fx.text.add(this.pos.x, this.pos.y + 6, this.pos.z, '-' + amount, 'pdmg');
    G.ui.damagePulse(Math.min(1, amount / this.maxHp * 4));
    sfx('hit', { vol: 0.7 });
    if (this.recallT >= 0) this.cancelRecall();
    if (this.hp <= 0) this.die(src);
    return amount;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    if (G.cam.mode === 'fp') G.toggleFP();
    this.clearAim();
    this.path = null;
    this.target = null;
    this.recallT = -1;
    sfx('playerDie');
    for (const p of rigParts(this.rig)) G.fx.debris.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 12, 8 + Math.random() * 8, (Math.random() - 0.5) * 12, p.size, p.color, 3.5);
    this.rig.root.visible = false;
    this.respawnT = 4 + this.level * 0.4;
    G.cam.shake(0.8);
    G.emit('playerDeath');
  }

  respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.pos.copy(SPAWN);
    this.vy = 0;
    this.rig.root.visible = true;
    this.invulnT = 2;
    G.fx.beam(SPAWN.x, SPAWN.y, SPAWN.z, 0x7fd8ff, 30, 50);
    G.fx.ring(SPAWN.x, 0.5, SPAWN.z, 0x7fd8ff, 4, 30, 10);
    sfx('teleport');
    if (G.leaveArena) G.leaveArena();
    G.cam.centerOn(this.pos);
    G.emit('playerRespawn');
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vy = 0;
    this.path = null;
    this.target = null;
    G.cam.centerOn(this.pos);
  }

  // ------------ commands ------------
  moveTo(x, y, z, level, keepTarget = false) {
    if (this.dead) return false;
    const p = findPath(this.pos.x, this.pos.y, this.pos.z, x, y, z, level);
    if (!keepTarget) {
      this.target = null;
      this.attackMove = false;
    }
    if (!p || !p.length) return false;
    this.path = p;
    this.pathI = 0;
    if (this.recallT >= 0) this.cancelRecall();
    return true;
  }
  attackTarget(e) {
    this.target = e;
    this.attackMove = false;
    this.path = null;
    this.repathT = 0;
    if (this.recallT >= 0) this.cancelRecall();
  }
  stop() {
    this.path = null;
    this.target = null;
    this.attackMove = false;
  }

  // ------------ abilities ------------
  abilityUnlocked(k) {
    const a = ABILITIES[k];
    if (!a.unlock) return true;
    return G.state.purchased.includes(a.unlock);
  }
  canCast(k) {
    if (this.dead) return false;
    if (!this.abilityUnlocked(k)) {
      G.ui.toast('Habilidade bloqueada — compre o totem no Tycoon!', 'red');
      sfx('cant');
      return false;
    }
    if (this.cd[k] > 0) {
      sfx('cant');
      return false;
    }
    if (k === 'D' && G.state.potions <= 0) {
      G.ui.toast('Sem poções! Volte à base para recarregar.', 'red');
      sfx('cant');
      return false;
    }
    return true;
  }
  cast(k, pt) {
    if (!this.canCast(k)) return;
    const a = ABILITIES[k];
    const wd = this.attackDamage;
    const dx = pt ? pt.x - this.pos.x : Math.sin(this.yaw), dz = pt ? pt.z - this.pos.z : Math.cos(this.yaw);
    const dl = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / dl, z: dz / dl };
    if (this.recallT >= 0) this.cancelRecall();
    switch (k) {
      case 'Q': {
        this.yaw = Math.atan2(dir.x, dir.z);
        this.castAnim = 0;
        spawnProjectile({ kind: 'brick', x: this.pos.x + dir.x, y: this.pos.y + 3.2, z: this.pos.z + dir.z, dir, speed: 46, range: a.range, dmg: 35 + 1.1 * wd, team: 'player', pierce: true, radius: 1.3 });
        sfx('swing');
        sfx('whoosh');
        break;
      }
      case 'W': {
        this.shield = 50 + 12 * this.level;
        this.shieldT = 3.5;
        this.hasteT = 2;
        sfx('shield');
        G.fx.ring(this.pos.x, this.pos.y + 2, this.pos.z, 0x46c8ff, 3, 24, 8);
        break;
      }
      case 'E': {
        this.yaw = Math.atan2(dir.x, dir.z);
        this.dashDir.set(dir.x, 0, dir.z);
        this.dashT = 0.2;
        this.dashLeft = a.range;
        this.dashHit.clear();
        this.path = null;
        sfx('dash');
        break;
      }
      case 'R': {
        let tx = pt.x, tz = pt.z;
        const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (d > a.range) {
          tx = this.pos.x + (dx / dl) * a.range;
          tz = this.pos.z + (dz / dl) * a.range;
        }
        this.castAnim = 0;
        G.abilities.brickRain(tx, tz, a.radius, 240 + 3 * wd);
        sfx('ult');
        break;
      }
      case 'D': {
        G.state.potions--;
        this.healT = 4;
        sfx('heal');
        G.fx.burst(this.pos.x, this.pos.y + 3, this.pos.z, 0xff5a7a, 18, 6, 0.6, 0.8, -3);
        break;
      }
      case 'F': {
        let best = null;
        for (let s = a.range; s >= 0; s -= 0.5) {
          const x = this.pos.x + dir.x * s, z = this.pos.z + dir.z * s;
          const g = groundAt(x, z, this.pos.y + 1);
          if (Math.abs(g - this.pos.y) < 2 && !blockedAt(x, z, g, this.r)) {
            best = { x, y: g, z };
            break;
          }
        }
        if (best) {
          G.fx.burst(this.pos.x, this.pos.y + 2.5, this.pos.z, 0xfff27a, 22, 8, 0.7, 0.4);
          this.pos.set(best.x, best.y, best.z);
          this.path = null;
          this.yaw = Math.atan2(dir.x, dir.z);
          G.fx.burst(this.pos.x, this.pos.y + 2.5, this.pos.z, 0xfff27a, 22, 8, 0.7, 0.4);
          sfx('teleport', { vol: 0.6 });
        }
        break;
      }
    }
    this.cd[k] = a.cd;
    G.emit('cast', k);
  }

  startRecall() {
    if (this.dead || this.recallT >= 0) return;
    if (G.boss && G.boss.active && G.boss.alive && inArena(this.pos.x, this.pos.z) && G.boss.engaged) {
      // allowed but resets boss
    }
    this.recallT = 0;
    this.path = null;
    this.target = null;
    this.recallDecal = G.fx.decals.add({ shape: 'ring', x: this.pos.x, z: this.pos.z, y: this.pos.y, r: 3, color: 0x5fb8ff, dur: 4, follow: this.pos, persist: true, additive: true });
    sfx('recall');
    G.ui.channel('Voltando à base...', 4);
  }
  cancelRecall() {
    this.recallT = -1;
    if (this.recallDecal) {
      G.fx.decals.remove(this.recallDecal);
      this.recallDecal = null;
    }
    G.ui.channel(null);
  }

  // ------------ input ------------
  handleInput(dt) {
    if (G.ui.modalOpen || this.dead || G.cinematic) {
      this.clearAim();
      this.keyMove = null;
      return;
    }
    const fp = G.cam.mode === 'fp';
    // weapons hotbar
    const owned = G.tycoon ? G.tycoon.ownedWeapons() : ['punhos'];
    for (let i = 0; i < 4; i++) {
      if (input.hit('Digit' + (i + 1)) && owned[i] && owned[i] !== G.state.weapon) this.equip(owned[i]);
    }
    if (input.hit('KeyV')) G.toggleFP();
    if (fp) return this.handleFP(dt);

    const r = mouseRay();
    const hovEnemy = pickEnemy(r);
    const hovInt = hovEnemy ? null : pickInteract(r);
    G.hover = hovEnemy;
    G.hoverInt = hovInt;
    G.ui.setCursor(this.armedA ? 'attack' : hovEnemy ? 'attack' : hovInt ? 'hand' : 'default');
    if (hovInt && hovInt.tip) G.ui.tooltip(hovInt.tip(), input.mx, input.my, false, 'world');
    else G.ui.tooltip(null, 0, 0, false, 'world');

    const km = keymap(G.settings);
    if (!km.move) {
      if (input.hit('KeyA')) this.armedA = true;
      if (input.hit('KeyS')) { this.stop(); this.armedA = false; }
    }
    if (input.hit(km.binds.B)) this.startRecall();
    if (input.hit('KeyY')) { G.cam.locked = !G.cam.locked; G.settings.camLock = G.cam.locked; G.ui.toast(G.cam.locked ? 'Câmera travada' : 'Câmera livre (bordas movem)', 'blue'); }

    // keyboard movement: arrows always, WASD in the WASD scheme (screen-relative: up = north)
    let mx = 0, mz = 0;
    if (input.down('ArrowUp') || (km.move && input.down('KeyW'))) mz -= 1;
    if (input.down('ArrowDown') || (km.move && input.down('KeyS'))) mz += 1;
    if (input.down('ArrowLeft') || (km.move && input.down('KeyA'))) mx -= 1;
    if (input.down('ArrowRight') || (km.move && input.down('KeyD'))) mx += 1;
    if (mx || mz) {
      const l = Math.hypot(mx, mz);
      this.keyMove = { x: mx / l, z: mz / l };
      this.path = null;
      this.target = null;
      this.attackMove = false;
      this.armedA = false;
      this.pendingInteract = null;
      if (this.recallT >= 0) this.cancelRecall();
    } else this.keyMove = null;

    // abilities: hold to aim, release to cast (quick cast with indicator)
    for (const k of ['Q', 'W', 'E', 'R', 'D', 'F']) {
      if (input.hit(km.binds[k])) {
        const a = ABILITIES[k];
        if (a.cast === 'self') {
          this.cast(k, null);
        } else if (this.canCast(k)) {
          this.aiming = k;
        }
      }
    }
    if (this.aiming) {
      const k = this.aiming;
      const pt = aimPoint(r, this.pos.y) || { x: this.pos.x, z: this.pos.z + 1 };
      this.showAim(k, pt);
      if (input.released.has(km.binds[k])) {
        this.cast(k, pt);
        this.clearAim();
      }
      for (const c of input.clicks) if (c.b === 2) { this.clearAim(); input.clicks.length = 0; break; }
    }

    // mouse
    for (const c of input.clicks) {
      if (c.b === 2) {
        this.armedA = false;
        this.holdMoveT = 0.18;
        this.rightClick(hovEnemy, hovInt, r, true);
      } else if (c.b === 0) {
        if (this.armedA) {
          this.armedA = false;
          const g = pickGround(r);
          if (g) {
            this.moveTo(g.x, g.y, g.z, g.level);
            this.attackMove = true;
            G.fx.decals.add({ shape: 'marker', x: g.x, z: g.z, y: g.y, r: 1.6, color: 0xff4040, dur: 0.5, additive: true });
          }
        } else if (hovInt && hovInt.onClick) {
          hovInt.onClick(this);
        } else if (hovEnemy) {
          // left click on an enemy attacks it (handy when moving with the keyboard)
          this.keyMove = null;
          this.rightClick(hovEnemy, null, r, false);
        }
      }
    }
    // hold right mouse to keep moving
    if (input.buttons & 2 && !this.aiming) {
      this.holdMoveT -= dt;
      if (this.holdMoveT <= 0) {
        this.holdMoveT = 0.16;
        if (!this.target) this.rightClick(null, null, r, false);
      }
    }
  }

  rightClick(enemy, inter, r, marker) {
    if (enemy) {
      this.attackTarget(enemy);
      G.fx.decals.add({ shape: 'ring', follow: enemy.pos, x: enemy.pos.x, z: enemy.pos.z, y: enemy.pos.y, r: (enemy.radius || 1) + 0.8, color: 0xff3030, dur: 0.35, additive: true });
      return;
    }
    if (inter && inter.walkTo) {
      this.moveTo(inter.x, inter.y, inter.z, inter.level);
      if (inter.onArrive) this.pendingInteract = inter;
      if (marker) G.fx.decals.add({ shape: 'marker', x: inter.x, z: inter.z, y: inter.y, r: 1.6, color: 0x40ff70, dur: 0.45, additive: true });
      return;
    }
    const g = pickGround(r);
    if (!g) return;
    this.pendingInteract = null;
    this.moveTo(g.x, g.y, g.z, g.level);
    if (marker) G.fx.decals.add({ shape: 'marker', x: g.x, z: g.z, y: g.y, r: 1.6, color: 0x40ff70, dur: 0.45, additive: true });
  }

  showAim(k, pt) {
    const a = ABILITIES[k];
    const dx = pt.x - this.pos.x, dz = pt.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (!this.rangeDecal) this.rangeDecal = G.fx.decals.add({ shape: 'ring', x: this.pos.x, z: this.pos.z, y: this.pos.y, r: a.range, color: 0x7fd0ff, persist: true, follow: this.pos, alpha: 0.7, additive: true });
    this.rangeDecal.mesh.scale.set(a.range * 2, 1, a.range * 2);
    if (a.cast === 'line') {
      const L = a.range;
      if (!this.aimDecal) this.aimDecal = G.fx.decals.add({ shape: 'rect', x: 0, z: 0, y: this.pos.y, w: k === 'Q' ? 2.4 : 2, l: L, color: 0x7fd0ff, persist: true, alpha: 0.75, additive: true });
      const ux = dx / d, uz = dz / d;
      this.aimDecal.mesh.scale.set(k === 'Q' ? 2.4 : 2, 1, L);
      this.aimDecal.mesh.position.set(this.pos.x + ux * L * 0.5, this.pos.y + 0.15, this.pos.z + uz * L * 0.5);
      this.aimDecal.mesh.rotation.y = Math.atan2(ux, uz) + Math.PI;
      this.aimDecal.mesh.material.uniforms.uProgress.value = 1;
      this.aimDecal.dur = 1e9;
    } else if (a.cast === 'area') {
      let tx = pt.x, tz = pt.z;
      if (d > a.range) { tx = this.pos.x + (dx / d) * a.range; tz = this.pos.z + (dz / d) * a.range; }
      if (!this.aimDecal) this.aimDecal = G.fx.decals.add({ shape: 'circle', x: tx, z: tz, y: this.pos.y, r: a.radius, color: 0xff9a3a, persist: true, alpha: 0.8, additive: true });
      this.aimDecal.mesh.position.set(tx, this.pos.y + 0.15, tz);
      this.aimDecal.dur = 1e9;
      this.aimDecal.t = 0;
    }
  }
  clearAim() {
    this.aiming = null;
    if (this.aimDecal) { G.fx.decals.remove(this.aimDecal); this.aimDecal = null; }
    if (this.rangeDecal) { G.fx.decals.remove(this.rangeDecal); this.rangeDecal = null; }
  }

  handleFP(dt) {
    G.ui.setCursor('none');
    if (!input.locked && input.clicks.length) {
      G.lockPointer();
      input.clicks.length = 0;
      return;
    }
    const yaw = G.cam.fpYaw;
    let fx = 0, fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    const l = Math.hypot(fx, fz) || 1;
    // camera forward = (-sin yaw, -cos yaw)
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    const wx = (fx * cz + fz * sx) / l, wz = (-fx * sx + fz * cz) / l;
    const sp = this.moveSpeed;
    this.fpVel.x = damp(this.fpVel.x, wx * sp * (fx || fz ? 1 : 0), 14, dt);
    this.fpVel.z = damp(this.fpVel.z, wz * sp * (fx || fz ? 1 : 0), 14, dt);
    this.yaw = yaw + Math.PI;
    if (input.hit('Space') && this.grounded) {
      this.vy = 26;
      this.grounded = false;
    }
    if (input.hit('KeyE') || input.clicks.some((c) => c.b === 0)) {
      const r = centerRay();
      const it = pickInteract(r);
      if (it && it.onClick && Math.hypot(it.x - this.pos.x, it.z - this.pos.z) < 9) it.onClick(this);
      else {
        // melee/ranged toward look direction
        const tg = allTargets('player').filter((e) => Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < this.weapon.range + 3);
        if (tg.length) this.attackTarget(tg[0]);
      }
    }
    if (input.hit('KeyB')) this.startRecall();
  }

  // ------------ update ------------
  update(dt) {
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.invulnT = Math.max(0, (this.invulnT || 0) - dt);
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      this.updateExtras(false);
      return;
    }
    const plot = Math.abs(this.pos.x) < PLOT_HALF && Math.abs(this.pos.z) < PLOT_HALF && !inArena(this.pos.x, this.pos.z);
    this.inBase = plot;
    // regen
    if (plot) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt);
      if (G.state.potions < 3) { G.state.potions = 3; }
    } else if (G.t - this.lastHitT > 6) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.012 * dt);
    if (this.healT > 0) {
      this.healT -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.45 * (dt / 4));
      if (Math.random() < dt * 12) G.fx.add.emit(this.pos.x + (Math.random() - 0.5) * 2, this.pos.y + 1 + Math.random() * 3, this.pos.z + (Math.random() - 0.5) * 2, 0, 3, 0, 0.6, 0.5, 0.1, 0x7aff8a, 0xffffff, 1);
    }
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.shield = 0;
    }
    this.hasteT = Math.max(0, this.hasteT - dt);
    this.flash = Math.max(0, (this.flash || 0) - dt * 5);
    for (const m of Object.values(this.rig.mats)) m.emissive.setRGB(this.flash * 0.9, this.flash * 0.15, this.flash * 0.1);

    // recall channel
    if (this.recallT >= 0) {
      this.recallT += dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        G.fx.add.emit(this.pos.x + Math.cos(a) * 2.5, this.pos.y + 0.3, this.pos.z + Math.sin(a) * 2.5, 0, 4 + Math.random() * 4, 0, 0.8, 0.6, 0.1, 0x6fc8ff, 0xffffff, 1);
      }
      if (this.recallT >= 4) {
        this.cancelRecall();
        G.fx.beam(this.pos.x, this.pos.y, this.pos.z, 0x6fc8ff, 30, 40);
        this.teleport(SPAWN.x, SPAWN.y, SPAWN.z);
        if (G.leaveArena) G.leaveArena();
        G.fx.beam(SPAWN.x, 0, SPAWN.z, 0x6fc8ff, 30, 50);
        sfx('teleport');
      }
    }

    let vx = 0, vz = 0;
    const fp = G.cam.mode === 'fp';
    if (this.dashT > 0) {
      const sp = this.dashLeft / this.dashT;
      const step = Math.min(this.dashLeft, (11 / 0.2) * dt);
      this.dashLeft -= step;
      this.dashT -= dt;
      vx = this.dashDir.x * step / dt;
      vz = this.dashDir.z * step / dt;
      G.fx.add.emit(this.pos.x, this.pos.y + 2.5, this.pos.z, 0, 0, 0, 0.35, 1.6, 0.2, 0xfff2a0, 0xffa040, 0.8);
      for (const e of inRadius(this.pos.x, this.pos.z, 2.6, 'player', this.pos.y)) {
        if (this.dashHit.has(e)) continue;
        this.dashHit.add(e);
        damage(e, 30 + 0.7 * this.attackDamage, { team: 'player' });
        sfx('punch', { x: e.pos.x, z: e.pos.z });
      }
      void sp;
    } else if (fp) {
      vx = this.fpVel.x;
      vz = this.fpVel.z;
      if (this.target) {
        const t = this.target;
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.radius || 1);
        if (!t.alive || d > this.weapon.range + 1) this.target = null;
        else if (this.atkAnim < 0 && this.atkTimer <= 0) this.startAttack();
      }
    } else if (this.keyMove) {
      const sp = this.moveSpeed;
      vx = this.keyMove.x * sp;
      vz = this.keyMove.z * sp;
      this.yaw = dampAngle(this.yaw, Math.atan2(this.keyMove.x, this.keyMove.z), 18, dt);
    } else {
      // targeting / attack-move acquisition
      if (this.target && (!this.target.alive || this.target.untargetable)) this.target = null;
      if (this.attackMove && !this.target) {
        let best = null, bd = 16;
        for (const e of allTargets('player')) {
          if (e.isDummy) continue;
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) { this.target = best; this.path = null; }
      }
      if (this.target) {
        const t = this.target;
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.radius || 1);
        if (d <= this.weapon.range) {
          this.path = null;
          this.yaw = dampAngle(this.yaw, Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z), 20, dt);
          if (this.atkAnim < 0 && this.atkTimer <= 0) this.startAttack();
        } else {
          this.repathT -= dt;
          if (this.repathT <= 0 || !this.path) {
            this.repathT = 0.25;
            const p = findPath(this.pos.x, this.pos.y, this.pos.z, t.pos.x, t.pos.y, t.pos.z);
            this.path = p;
            this.pathI = 0;
          }
        }
      }
    }
    // follow path
    if (!fp && this.dashT <= 0 && this.path && this.atkAnim < 0.0 + (this.atkHitDone ? 1 : 0) * 2) {
      const wp = this.path[this.pathI];
      if (wp) {
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const last = this.pathI === this.path.length - 1;
        if (d < (last ? 0.35 : 0.9)) {
          this.pathI++;
          if (this.pathI >= this.path.length) {
            this.path = null;
            if (this.pendingInteract) {
              const pi = this.pendingInteract;
              this.pendingInteract = null;
              pi.onArrive && pi.onArrive(this);
            }
          }
        } else {
          const sp = Math.min(this.moveSpeed, d / dt);
          vx = (dx / d) * sp;
          vz = (dz / d) * sp;
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 16, dt);
        }
      } else this.path = null;
    }
    if (fp && (Math.abs(vx) + Math.abs(vz) > 0.5)) {
      // keep yaw from camera
    }
    // attack animation progression (movement cancels windup)
    if (this.atkAnim >= 0) {
      if ((this.path || this.keyMove) && !fp && !this.atkHitDone) this.atkAnim = -1;
      else {
        const dur = Math.min(0.7, 0.9 / this.attackSpeed);
        this.atkAnim += dt / dur;
        const hp = this.weapon.style === 'shoot' ? 0.6 : this.weapon.style === 'swing' ? 0.45 : 0.32;
        if (!this.atkHitDone && this.atkAnim >= hp) {
          this.atkHitDone = true;
          this.attackHit();
        }
        if (this.atkAnim >= 1) this.atkAnim = -1;
      }
    }
    this.atkTimer -= dt;

    const before = { x: this.pos.x, z: this.pos.z };
    moveBody(this, vx * dt, vz * dt, dt);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.speedNow = damp(this.speedNow, moved, 18, dt);
    if (this.speedNow > 2 && this.grounded) {
      this.stepT -= dt * this.speedNow;
      if (this.stepT <= 0) {
        this.stepT = 6.5;
        sfx('step', { vol: 0.6 });
        if (G.cam.mode !== 'fp') G.fx.alpha.emit(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + 0.2, this.pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5, 0.55, 0.7, 1.8, 0xd6c8a6, 0xd6c8a6, 0.32, 0, 2);
      }
    }
    // stuck while following path -> drop
    if (this.path && this.speedNow < 0.3 && Math.hypot(vx, vz) > 1) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.6) { this.path = null; this.stuckT = 0; }
    } else this.stuckT = 0;

    if (this.castAnim !== undefined && this.castAnim >= 0) {
      this.castAnim += dt * 3;
      if (this.castAnim > 1) this.castAnim = -1;
    }
    // animate
    this.rig.root.rotation.y = this.yaw;
    const atk = this.atkAnim >= 0 ? this.atkAnim : this.castAnim >= 0 ? this.castAnim : -1;
    const style = this.atkAnim >= 0 ? this.weapon.style : 'cast';
    animateRig(this.rig, dt, { speed: this.speedNow, moveRef: 16, atk, style, hold: this.weapon.hold && G.started, wave: !G.started, air: !this.grounded && this.vy > -40 && this.vy !== 0 });
    if (!G.started) this.yaw = Math.atan2(G.camera.position.x - this.pos.x, G.camera.position.z - this.pos.z);
    // shield orbit
    for (let i = 0; i < this.orbit.length; i++) {
      const m = this.orbit[i];
      m.visible = this.shield > 0 && !fp;
      if (!m.visible) continue;
      const a = G.t * 3 + (i / this.orbit.length) * Math.PI * 2;
      m.position.set(this.pos.x + Math.cos(a) * 2.6, this.pos.y + 2.6 + Math.sin(a * 2) * 0.6, this.pos.z + Math.sin(a) * 2.6);
      m.rotation.set(a, a * 1.3, 0);
    }
    // hide own body in first person
    this.rig.body.visible = !fp;
    this.updateExtras(fp);
    this.vm.visible = fp && !this.dead;
    if (fp) {
      const bob = Math.sin(this.rig.phase) * Math.min(1, this.speedNow / 16);
      this.vm.position.set(0.75 + bob * 0.04, -0.78 + Math.abs(bob) * 0.05, -1.25);
      let rx = 1.25;
      if (this.atkAnim >= 0) {
        const t = this.atkAnim;
        rx += t < 0.4 ? t * 2.2 : 0.88 - (t - 0.4) * 3.2;
      }
      this.vmPivot.rotation.set(rx, -0.2, -0.12);
    }
  }

  // rings, contact shadow and weapon trail
  updateExtras(fp) {
    const vis = !fp && !this.dead && G.cam.mode !== 'title';
    this.selRing.mesh.visible = vis;
    const t = this.target;
    if (vis && t && (t.alive || t.isDummy)) {
      this.tgtRing.o.follow = t.pos;
      const r = (t.radius || 1) + 0.9;
      this.tgtRing.mesh.scale.set(r * 2, 1, r * 2);
      this.tgtRing.mesh.visible = true;
    } else this.tgtRing.mesh.visible = false;
    if (!fp && !this.dead) {
      const gy = this.grounded ? this.pos.y : groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
      const air = Math.min(1, (this.pos.y - gy) / 8);
      this.blobY = gy;
      G.fx.blobs.add(this.pos.x, gy, this.pos.z, 1.5 * (1 - air * 0.3), 0.5 * (1 - air * 0.6));
    }
    // trail: sword swings and dash
    const w = this.rig.weapon;
    const style = this.weapon.style;
    if (!fp && w && style === 'swing' && this.atkAnim >= 0.28 && this.atkAnim <= 0.78) {
      w.updateWorldMatrix(true, false);
      const len = G.state.weapon === 'runica' ? 4.9 : 4.4;
      _ta.set(0, 0, 1.1).applyMatrix4(w.matrixWorld);
      _tb.set(0, 0, len).applyMatrix4(w.matrixWorld);
      this.trail.setColor(G.state.weapon === 'runica' ? 0x46e8ff : 0xfff0d0);
      this.trail.push(_ta, _tb, G.t);
    } else if (!fp && this.dashT > 0) {
      _ta.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
      _tb.set(this.pos.x, this.pos.y + 4.2, this.pos.z);
      this.trail.setColor(0xffd84a);
      this.trail.push(_ta, _tb, G.t);
    }
    this.trail.update(G.t);
  }

  startAttack() {
    this.atkAnim = 0;
    this.atkHitDone = false;
    this.atkTimer = 1 / this.attackSpeed;
    if (this.weapon.style === 'swing') sfx('swing', { vol: 0.8 });
    if (this.weapon.style === 'punch') sfx('swing', { vol: 0.4 });
  }
  attackHit() {
    const t = this.target;
    if (!t || !t.alive) return;
    const w = this.weapon;
    const crit = Math.random() < 0.12;
    const dmg = this.attackDamage * (crit ? 1.75 : 1) * (0.92 + Math.random() * 0.16);
    this.combatT = G.t;
    if (w.ranged) {
      const sx = this.pos.x + Math.sin(this.yaw) * 1.4, sz = this.pos.z + Math.cos(this.yaw) * 1.4;
      spawnProjectile({ kind: 'arrow', x: sx, y: this.pos.y + 3.6, z: sz, target: t, speed: 70, dmg, team: 'player', crit });
      sfx('bow');
      return;
    }
    const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.radius || 1);
    if (d > w.range + 1.5) return;
    damage(t, dmg, { team: 'player', crit });
    sfx(crit ? 'crit' : w.style === 'punch' ? 'punch' : 'hit', { x: t.pos.x, z: t.pos.z });
    const hx = t.pos.x, hz = t.pos.z;
    G.fx.burst(hx, t.pos.y + (t.height || 4) * 0.55, hz, crit ? 0xffd040 : 0xffffff, crit ? 14 : 8, 8, 0.55, 0.3);
    if (crit) { G.hitStop = 0.05; G.cam.shake(0.25); }
    if (w.cleave) {
      for (const e of inRadius(t.pos.x, t.pos.z, w.cleaveR, 'player', t.pos.y)) {
        if (e === t) continue;
        damage(e, dmg * w.cleave, { team: 'player' });
      }
      G.fx.decals.add({ shape: 'shock', x: t.pos.x, z: t.pos.z, y: t.pos.y, r: w.cleaveR, color: 0x40e0ff, dur: 0.3, additive: true });
    }
  }
}
