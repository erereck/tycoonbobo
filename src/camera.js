// MOBA camera (LoL-like: fixed angle, lock/unlock with edge-pan, zoom), first-person inside the base,
// cinematic title orbit, screen shake and the occlusion cut-out uniforms.
import * as THREE from 'three';
import { G } from './G.js';
import { input } from './engine/input.js';
import { U } from './engine/materials.js';
import { clamp, damp, lerp, smoothstep } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _look = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export function createCameraRig(camera) {
  const C = {
    camera,
    mode: 'title',
    target: new THREE.Vector3(0, 0, 0),
    dist: 52,
    distT: 52,
    minD: 24,
    maxD: 84,
    locked: true,
    shakeAmt: 0,
    shakeT: 0,
    fpYaw: Math.PI,
    fpPitch: 0,
    blend: 0,
    fromPos: new THREE.Vector3(),
    fromQuat: new THREE.Quaternion(),
    titleAng: 0.6,
    lookOverride: null,
    shake(a) {
      if (G.settings && !G.settings.shake) return;
      this.shakeAmt = Math.min(2.2, this.shakeAmt + a);
    },
    startBlend(dur = 1.2) {
      this.fromPos.copy(camera.position);
      this.fromQuat.copy(camera.quaternion);
      this.blend = 1;
      this.blendDur = dur;
    },
    setMode(m) {
      if (m === this.mode) return;
      this.startBlend(m === 'fp' || this.mode === 'fp' ? 0.35 : 1.4);
      this.mode = m;
      if (m === 'fp') {
        this.fpYaw = G.player ? G.player.yaw + Math.PI : Math.PI;
        this.fpPitch = -0.05;
      }
      G.emit('cameraMode', m);
    },
    centerOn(p) {
      this.target.set(p.x, p.y, p.z);
    },
    update(dt) {
      const p = G.player;
      if (this.mode === 'title') {
        this.titleAng += dt * 0.04;
        const r = 78;
        _v.set(Math.sin(this.titleAng) * r, 34 + Math.sin(this.titleAng * 0.7) * 6, Math.cos(this.titleAng) * r);
        camera.position.copy(_v);
        // frame the base on the right third (menu sits on the left)
        const off = innerWidth > 760 ? 24 : 0;
        camera.lookAt(-Math.cos(this.titleAng) * off, 7, -4 + Math.sin(this.titleAng) * off);
      } else if (this.mode === 'moba') {
        if (input.wheel) this.distT = clamp(this.distT + input.wheel * 5, this.minD, this.maxD);
        this.dist = damp(this.dist, this.distT, 10, dt);
        const spaceCenter = G.settings?.keymap === 'classic' && input.down('Space');
        const follow = this.locked || spaceCenter || !!(p && p.keyMove);
        if (p && follow) {
          _v.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
          if (spaceCenter && !this.locked) this.target.copy(_v);
          else {
            this.target.x = damp(this.target.x, _v.x, 9, dt);
            this.target.z = damp(this.target.z, _v.z, 9, dt);
            this.target.y = damp(this.target.y, _v.y, 5, dt);
          }
        } else if (!G.ui?.modalOpen) {
          // edge pan + arrow keys
          const edge = 14;
          let px = 0, pz = 0;
          if (input.mx < edge) px = -1;
          if (input.mx > innerWidth - edge) px = 1;
          if (input.my < edge) pz = -1;
          if (input.my > innerHeight - edge) pz = 1;
          const sp = 70 * (this.dist / 52);
          this.target.x += px * sp * dt;
          this.target.z += pz * sp * dt;
          if (p) this.target.y = damp(this.target.y, p.pos.y + 1.5, 4, dt);
        }
        const k = (this.dist - this.minD) / (this.maxD - this.minD);
        const pitch = lerp(0.86, 1.0, k);
        camera.position.set(this.target.x, this.target.y + Math.sin(pitch) * this.dist, this.target.z + Math.cos(pitch) * this.dist);
        camera.lookAt(this.target);
      } else if (this.mode === 'fp' && p) {
        if (input.locked) {
          this.fpYaw -= input.dx * 0.0022;
          this.fpPitch = clamp(this.fpPitch - input.dy * 0.0022, -1.45, 1.45);
        }
        camera.position.set(p.pos.x, p.pos.y + 4.55 + (p.rig ? p.rig.body.position.y * 0.6 : 0), p.pos.z);
        _e.set(this.fpPitch, this.fpYaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(_e);
      } else if (this.mode === 'cine' && this.lookOverride) {
        // scripted shot: slow dolly toward the subject
        const o = this.lookOverride;
        o.t = (o.t || 0) + dt;
        camera.position.copy(o.pos);
        if (o.dolly) camera.position.addScaledVector(o.dolly, o.t);
        _look.copy(o.look);
        camera.lookAt(_look);
      }
      // blend from previous camera
      if (this.blend > 0) {
        this.blend = Math.max(0, this.blend - dt / this.blendDur);
        const t = this.blend * this.blend * (3 - 2 * this.blend);
        _v2.copy(camera.position);
        _q.copy(camera.quaternion);
        camera.position.lerpVectors(_v2, this.fromPos, t);
        camera.quaternion.slerpQuaternions(_q, this.fromQuat, t);
      }
      // shake
      if (this.shakeAmt > 0.001) {
        this.shakeT += dt * 40;
        const a = this.shakeAmt * this.shakeAmt;
        camera.position.x += (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.9)) * 0.35 * a;
        camera.position.y += Math.sin(this.shakeT * 1.7 + 1) * 0.35 * a;
        camera.position.z += Math.sin(this.shakeT * 2.3 + 2) * 0.35 * a;
        this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.8);
      }
      camera.updateMatrixWorld();
      this.updateCut();
    },
    updateCut() {
      const p = G.player;
      if (!p || this.mode !== 'moba' || p.dead) {
        U.uCutOn.value = 0;
        return;
      }
      const R = G.R;
      const bw = R.renderer.domElement.width, bh = R.renderer.domElement.height;
      _v.set(p.pos.x, p.pos.y + 2.6, p.pos.z);
      _v2.copy(_v).applyMatrix4(camera.matrixWorldInverse);
      const depth = -_v2.z;
      _v.project(camera);
      const sx = (_v.x * 0.5 + 0.5) * bw, sy = (_v.y * 0.5 + 0.5) * bh;
      // radius: project a point 4.2 studs to the side
      _v2.set(p.pos.x + 4.2, p.pos.y + 2.6, p.pos.z).project(camera);
      const rx = (_v2.x * 0.5 + 0.5) * bw;
      U.uCut.value.set(sx, sy, Math.abs(rx - sx) * 1.15, depth);
      U.uCutOn.value = 1;
    },
  };
  return C;
}
