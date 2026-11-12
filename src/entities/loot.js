// Loot drops: item pickups (with light beams) and instanced gold coins that magnet to the player.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx } from '../engine/audio.js';
import { groundAt } from '../engine/physics.js';
import { rbox } from './rig.js';
import { ITEMS } from '../defs.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

function itemMesh(id) {
  const g = new THREE.Group();
  const c = ITEMS[id];
  const mat = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.35, emissive: new THREE.Color(c.color).multiplyScalar(0.35) });
  let m;
  if (id === 'gosma') m = new THREE.Mesh(rbox(0.9, 0.75, 0.9, 0.3, 3), new THREE.MeshStandardMaterial({ color: c.color, transparent: true, opacity: 0.85, roughness: 0.1, emissive: new THREE.Color(0x1f6a12) }));
  else if (id === 'couro') m = new THREE.Mesh(rbox(1.2, 0.2, 0.9, 0.08), mat);
  else if (id === 'dente') m = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 5), mat);
  else if (id === 'nucleo') m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.2, 3.0) }));
  else {
    m = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x5a3a1e }));
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.05), mat);
    flag.position.set(0.45, 0.5, 0);
    m.add(pole, flag);
  }
  m.castShadow = true;
  g.add(m);
  return g;
}

export function createLoot(scene) {
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.6, 9, 10, 1, true);
  beamGeo.translate(0, 4.5, 0);
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14).rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 1, roughness: 0.25, emissive: new THREE.Color(0x553300) });
  const MAXC = 260;
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, MAXC);
  coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coins.frustumCulled = false;
  coins.castShadow = true;
  coins.count = 0;
  scene.add(coins);
  const coinList = [];
  const items = [];

  const L = {
    items,
    clearAll() {
      for (const it of items) scene.remove(it.g);
      items.length = 0;
      coinList.length = 0;
    },
    // drop rewards of a dead enemy
    drop(e, def) {
      const x = e.pos.x, z = e.pos.z, y = e.pos.y;
      // coins
      const n = Math.min(10, 3 + Math.floor(def.cash / 25));
      for (let i = 0; i < n; i++) this.coin(x, y + 2, z, def.cash / n);
      for (const [id, chance, count] of def.loot) {
        if (Math.random() < chance) for (let k = 0; k < count; k++) this.item(id, x, y, z);
      }
    },
    coin(x, y, z, value, o = {}) {
      if (coinList.length >= MAXC) {
        G.state.cash += value;
        G.state.lifetime += value;
        return;
      }
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 6;
      coinList.push({ x, y, z, vx: Math.cos(a) * sp, vy: 12 + Math.random() * 8, vz: Math.sin(a) * sp, rot: Math.random() * 6, t: 0, value, magnet: false, delay: o.delay ?? 0.45 + Math.random() * 0.3 });
    },
    item(id, x, y, z) {
      const g = itemMesh(id);
      const c = new THREE.Color(ITEMS[id].color);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.4), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(beam);
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
      g.position.set(x, y + 2, z);
      scene.add(g);
      items.push({ id, g, beam, vx: Math.cos(a) * sp, vy: 14, vz: Math.sin(a) * sp, t: 0, landed: false, magnet: false });
    },
    update(dt) {
      const pl = G.player;
      const px = pl.pos.x, py = pl.pos.y + 2.5, pz = pl.pos.z;
      // items
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.t += dt;
        const p = it.g.position;
        if (it.magnet) {
          const dx = px - p.x, dy = py - p.y, dz = pz - p.z;
          const d = Math.hypot(dx, dy, dz);
          const sp = 18 + it.t * 30;
          if (d < 1.2) {
            G.state.items[it.id] = (G.state.items[it.id] || 0) + 1;
            G.fx.text.add(px, py + 3, pz, '+1 ' + ITEMS[it.id].name, 'item', { jitter: false, vy: 5 });
            G.fx.burst(px, py, pz, ITEMS[it.id].color, 10, 5, 0.5, 0.4);
            sfx('item');
            G.emit('item', it.id);
            scene.remove(it.g);
            items.splice(i, 1);
            continue;
          }
          p.x += (dx / d) * sp * dt;
          p.y += (dy / d) * sp * dt;
          p.z += (dz / d) * sp * dt;
        } else {
          if (!it.landed) {
            it.vy -= 40 * dt;
            p.x += it.vx * dt;
            p.y += it.vy * dt;
            p.z += it.vz * dt;
            const g = groundAt(p.x, p.z, p.y + 1) + 0.9;
            if (p.y < g) {
              p.y = g;
              if (it.vy < -6) it.vy *= -0.4;
              else { it.landed = true; it.baseY = g; }
              it.vx *= 0.5;
              it.vz *= 0.5;
            }
          } else {
            p.y = it.baseY + Math.sin(it.t * 3) * 0.25;
          }
          it.g.children[0].rotation.y += dt * 2;
          if (!pl.dead && it.t > 0.6 && Math.hypot(px - p.x, pz - p.z) < 7 && Math.abs(pl.pos.y - p.y) < 6) it.magnet = true;
          if (it.t > 90) { scene.remove(it.g); items.splice(i, 1); }
        }
        it.beam.material.opacity = 0.25 + Math.sin(it.t * 4) * 0.08;
      }
      // coins
      let n = 0;
      for (let i = coinList.length - 1; i >= 0; i--) {
        const c = coinList[i];
        c.t += dt;
        c.rot += dt * 8;
        if (!c.magnet) {
          c.vy -= 45 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          const g = groundAt(c.x, c.z, c.y + 1) + 0.45;
          if (c.y < g) {
            c.y = g;
            c.vy = c.vy < -5 ? -c.vy * 0.45 : 0;
            c.vx *= 0.6;
            c.vz *= 0.6;
          }
          if (c.t > c.delay && !pl.dead) c.magnet = true;
        } else {
          const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < 1.1 || c.t > 4) {
            G.state.cash += c.value;
            G.state.lifetime += c.value;
            G.ui.cashPop(c.value);
            sfx('coin', { vol: 0.5 });
            coinList.splice(i, 1);
            continue;
          }
          const sp = 20 + (c.t - c.delay) * 50;
          c.x += (dx / d) * sp * dt;
          c.y += (dy / d) * sp * dt;
          c.z += (dz / d) * sp * dt;
        }
      }
      for (const c of coinList) {
        _e.set(0, c.rot, 0);
        _q.setFromEuler(_e);
        _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(1, 1, 1));
        coins.setMatrixAt(n++, _m);
      }
      coins.count = n;
      coins.instanceMatrix.needsUpdate = true;
    },
  };
  return L;
}
