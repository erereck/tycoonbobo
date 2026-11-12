// Gameplay systems: missions, world ranking, raids/day cycle, ultimate ability, save/load.
import { G, defaultState } from './G.js';
import { sfx } from './engine/audio.js';
import { MISSIONS, WORLD_POP, ENEMIES } from './defs.js';
import { inRadius, damage } from './entities/combat.js';
import { groundAt } from './engine/physics.js';
import { CAMPS } from './world/layout.js';
import { NIGHT_START } from './world/sky.js';
import { fmtMoney, fmtInt } from './util.js';

// ---------------- missions ----------------
export function createMissions() {
  const M = {
    get cur() {
      return MISSIONS[G.state.mission] || null;
    },
    progress(type, a) {
      const m = this.cur;
      if (!m || m.type !== type) return;
      if (type === 'buy' && a !== m.target) return;
      if (type === 'kill' && !m.target.includes(a)) return;
      G.state.missionProg++;
      G.emit('missionProgress');
      if (G.state.missionProg >= m.n) this.complete();
    },
    complete() {
      const m = this.cur;
      if (!m) return;
      if (m.reward.cash) {
        G.state.cash += m.reward.cash;
        G.state.lifetime += m.reward.cash;
      }
      if (m.reward.xp) G.player.addXp(m.reward.xp);
      sfx('mission');
      G.ui.missionComplete(m);
      G.state.mission++;
      G.state.missionProg = 0;
      // instantly satisfied missions (e.g. already bought)
      const n = this.cur;
      if (n && n.type === 'buy' && G.state.purchased.includes(n.target)) setTimeout(() => this.complete(), 900);
      G.emit('missionProgress');
    },
    check() {
      const m = this.cur;
      if (m && m.type === "buy" && G.state.purchased.includes(m.target) && !this._pending) {
        this._pending = true;
        setTimeout(() => { this._pending = false; if (this.cur === m) this.complete(); }, 700);
      }
    },
    hintPos() {
      const m = this.cur;
      if (!m) return null;
      const h = m.hint || '';
      if (h === 'crank') return { x: -17, y: 3, z: -13.6 };
      if (h === 'collect') return { x: 16, y: 0, z: 4 };
      if (h.startsWith('buy:')) {
        const id = h.slice(4);
        const pad = G.tycoon.pads.get(id);
        if (pad) return { x: pad.p.pad[0], y: pad.y, z: pad.p.pad[1] };
        return null;
      }
      if (h.startsWith('camp:')) {
        const c = CAMPS.find((c) => c.id === h.slice(5));
        if (c) return { x: c.x, y: groundAt(c.x, c.z, 50), z: c.z };
      }
      if (h === 'portal') return { x: 0, y: 0, z: 35 };
      return null;
    },
  };
  G.on('crank', () => M.progress('crank'));
  G.on('collect', () => M.progress('collect'));
  G.on('buy', (id) => M.progress('buy', id));
  G.on('kill', (type) => M.progress('kill', type));
  G.on('raidWon', () => M.progress('raid'));
  return M;
}

// ---------------- world rank ----------------
export function worldRank() {
  const s = G.state;
  const score = s.lifetime + (s.level - 1) * 300 + s.totalKills * 20 + s.bossKills * 400000;
  const r = Math.floor(WORLD_POP / Math.pow(1 + score / 18, 1.07));
  return Math.max(2, r);
}

// ---------------- raids & day cycle ----------------
export function createRaids() {
  const R = {
    wasNight: false,
    raidActive: false,
    update() {
      const night = G.sky.dayT >= NIGHT_START && G.sky.dayT < 0.97;
      if (night && !this.wasNight) this.onNightfall();
      if (!night && this.wasNight) this.onDawn();
      this.wasNight = night;
      const raid = G.enemies.raid;
      if (raid && !raid.done) {
        this.raidActive = true;
      } else if (this.raidActive) {
        this.raidActive = false;
      }
    },
    canRaid() {
      return G.state.purchased.includes('espada') && !G.inArena;
    },
    onNightfall() {
      if (!this.canRaid()) {
        G.ui.toast('A noite caiu... a floresta fica mais misteriosa.', 'blue');
        return;
      }
      const n = G.state.purchased.length;
      const size = Math.min(14, 3 + Math.floor(n / 3));
      const power = 1 + n * 0.045 + G.state.raidsWon * 0.06;
      G.enemies.startRaid(size, power);
      G.ui.announce('ATAQUE À BASE!', `${size} saqueadores goblins estão vindo roubar seu cofre!`, 'red');
      sfx('raid');
    },
    onDawn() {
      G.ui.toast('O sol nasceu! ☀', 'gold');
      if (G.tycoon) G.tycoon.vault.hp = G.tycoon.vault.maxHp;
    },
  };
  G.on('raidWon', () => {
    G.state.raidsWon++;
    const bonus = Math.round(150 + G.state.purchased.length * 60);
    G.state.cash += bonus;
    G.state.lifetime += bonus;
    G.ui.announce('BASE DEFENDIDA!', `Bônus de defesa: ${fmtMoney(bonus)}`, 'green');
    sfx('mission');
  });
  return R;
}

// ---------------- R: brick rain ----------------
export function createAbilities() {
  const rains = [];
  return {
    brickRain(x, z, r, total) {
      const y = groundAt(x, z, (G.player?.pos.y ?? 0) + 3);
      const tele = G.fx.decals.add({ shape: 'circle', x, z, y, r, color: 0xff9a3a, dur: 2.8, alpha: 0.75, additive: true });
      rains.push({ x, z, y, r, t: 0, tick: 0, total, tele, hits: 0 });
    },
    update(dt) {
      for (let i = rains.length - 1; i >= 0; i--) {
        const rn = rains[i];
        rn.t += dt;
        if (rn.t > 0.5 && rn.t < 2.7) {
          // falling bricks visuals
          for (let k = 0; k < 3; k++) {
            if (Math.random() < dt * 30) {
              const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rn.r;
              const bx = rn.x + Math.cos(a) * d, bz = rn.z + Math.sin(a) * d;
              const cols = [0xc4281c, 0x0d69ac, 0xf5cd30, 0x4b974b, 0xa3a2a5];
              G.fx.debris.spawn(bx, rn.y + 22, bz, 0, -50, 0, [1.6, 0.8, 0.9], cols[(Math.random() * cols.length) | 0], 1.6);
            }
          }
          rn.tick -= dt;
          if (rn.tick <= 0) {
            rn.tick = 0.25;
            const per = rn.total / 8.8;
            for (const e of inRadius(rn.x, rn.z, rn.r, 'player', rn.y)) {
              damage(e, per, { team: 'player' });
              e.slowT = 0.6;
            }
            sfx('brick', { x: rn.x, z: rn.z, vol: 0.7 });
            G.cam.shake(0.12);
          }
        }
        if (rn.t > 2.9) {
          G.fx.decals.remove(rn.tele);
          rains.splice(i, 1);
        }
      }
    },
  };
}

// ---------------- save / load ----------------
const KEY = 'noob-empire-save-v1';
export function saveGame() {
  if (G.wiped) return;
  try {
    G.state.lastSave = Date.now();
    localStorage.setItem(KEY, JSON.stringify(G.state));
    localStorage.setItem(KEY + '-settings', JSON.stringify(G.settings));
  } catch (e) {
    /* ignore */
  }
}
export function loadGame() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const st = JSON.parse(s);
    return { ...defaultState(), ...st, items: { ...defaultState().items, ...(st.items || {}) } };
  } catch (e) {
    return null;
  }
}
export function loadSettings() {
  try {
    const s = localStorage.getItem(KEY + '-settings');
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
export function wipeSave() {
  G.wiped = true;
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
}
export function offlineEarnings(st) {
  // passive income while away (based on droppers owned), capped at 2h
  const away = Math.min(7200, (Date.now() - (st.lastSave || Date.now())) / 1000);
  if (away < 60) return 0;
  const rates = { d1: 1.5, d2: 1.7, d3: 4.1, d4: 6, d5: 18, d6: 27, d7: 46 };
  let r = 0;
  for (const id in rates) if (st.purchased.includes(id)) r += rates[id];
  return Math.floor(r * away * 0.5);
}
export { fmtInt, ENEMIES };
