// The tycoon: purchase buttons, droppers, conveyors & ore simulation, upgraders, furnaces,
// vault, turrets, weapon racks, totems, multi-floor building growth and smart floor fading.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx } from '../engine/audio.js';
import { PartBuilder, bakeGeometry } from '../engine/parts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMat, levelMats, patchMaterial, TEX } from '../engine/materials.js';
import { addSolids, removeSolids } from '../engine/physics.js';
import { rebuildBase, setLinks, levelOf } from '../engine/nav.js';
import { spawnProjectile } from '../entities/combat.js';
import { makeWeapon, rbox } from '../entities/rig.js';
import { interactables } from '../picking.js';
import { ITEMS, WEAPONS } from '../defs.js';
import * as S from './structures.js';
import { fmtMoney, easeOutBack, easeOutCubic, damp, clamp } from '../util.js';
import { inArena } from '../engine/physics.js';

const BELT_SPEED = 6.5;
const DROP_H = 18;

// ---------------- purchase table ----------------
// pad: [x, z] on level `lv`
export const PURCHASES = [
  { id: 'c1', name: 'Manivela Reforçada', desc: 'Cada clique na manivela gera minério de $3.', price: 15, lv: 0, pad: [-20.5, -9], req: [] },
  { id: 'd1', name: 'Dropper de Madeira #1', desc: 'Dropper automático: $3 a cada 2s.', price: 35, lv: 0, pad: [-11, -11.5], req: [] },
  { id: 'd2', name: 'Dropper de Madeira #2', desc: 'Mais um dropper de madeira: $3 a cada 1,8s.', price: 90, lv: 0, pad: [-5, -11.5], req: ['d1'] },
  { id: 'c2', name: 'Manivela de Ferro', desc: 'Cada clique na manivela gera minério de $8.', price: 150, lv: 0, pad: [-20.5, -9], req: ['c1', 'd1'] },
  { id: 'espada', name: 'Espada de Madeira', desc: 'Arma corpo a corpo: 21 de dano. (Tecla 2)', price: 120, items: { gosma: 3 }, lv: 0, pad: [24.5, -10], req: ['d1'], weapon: true },
  { id: 'u1', name: 'Lavador de Minério', desc: 'Upgrader: minério que passa vale ×1,5.', price: 260, lv: 0, pad: [11.5, -11.5], req: ['d2'] },
  { id: 'totemQ', name: 'Totem: Tijolo (Q)', desc: 'Desbloqueia a habilidade Q — Tijolo Arremessado.', price: 350, items: { gosma: 4 }, lv: 0, pad: [-12, 5.5], req: ['espada'] },
  { id: 'd3', name: 'Dropper de Pedra #3', desc: 'Minério de ferro: $9 a cada 2,2s.', price: 550, lv: 0, pad: [1, -11.5], req: ['u1'] },
  { id: 'cerca', name: 'Cerca de Madeira', desc: 'Cerca o terreno: saqueadores só entram pelos portões.', price: 400, lv: 0, pad: [9, 18], req: ['d3'] },
  { id: 'd4', name: 'Dropper de Pedra #4', desc: 'Minério de ferro: $12 a cada 2s.', price: 1100, lv: 0, pad: [7, -11.5], req: ['d3'] },
  { id: 'andar1', name: 'Construir 1º Andar', desc: 'Paredes de tijolo, teto e escada para o 1º andar!', price: 1600, lv: 0, pad: [0, -5], req: ['d4'], big: true },
  { id: 'u2', name: 'Forja de Lava', desc: 'Upgrader: minério que passa vale ×2.', price: 2600, items: { couro: 5 }, lv: 0, pad: [15, -11.5], req: ['andar1'] },
  { id: 'arco', name: 'Arco do Caçador', desc: 'Arma à distância: 27 de dano, alcance 21. (Tecla 3)', price: 2000, items: { couro: 6 }, lv: 1, pad: [-15, 5.5], req: ['andar1'], weapon: true },
  { id: 'totemW', name: 'Totem: Escudo (W)', desc: 'Desbloqueia a habilidade W — Escudo de Blocos.', price: 1500, items: { couro: 4 }, lv: 1, pad: [-4, 6], req: ['andar1'] },
  { id: 'esteiraB', name: 'Esteira Superior + Forno Arcano', desc: 'Segunda linha de produção no 1º andar.', price: 4500, lv: 1, pad: [0, -9], req: ['andar1'] },
  { id: 'd5', name: 'Dropper de Cristal #5', desc: 'Cristais mágicos: $45 a cada 2,5s.', price: 6000, items: { nucleo: 2 }, lv: 1, pad: [-12, -11.5], req: ['esteiraB'] },
  { id: 'totemE', name: 'Totem: Avanço (E)', desc: 'Desbloqueia a habilidade E — Avanço.', price: 3500, items: { dente: 5 }, lv: 1, pad: [4, 6], req: ['andar1'] },
  { id: 'muralha', name: 'Muralha de Pedra', desc: 'Substitui a cerca por muralhas e torres de pedra.', price: 7000, items: { dente: 6 }, lv: 0, pad: [9, 18], req: ['cerca', 'andar1'] },
  { id: 'd6', name: 'Dropper de Cristal #6', desc: 'Cristais mágicos: $60 a cada 2,2s.', price: 10000, lv: 1, pad: [-5, -11.5], req: ['d5'] },
  { id: 'u3', name: 'Encantador Rúnico', desc: 'Upgrader: cristal que passa vale ×2,5.', price: 16000, items: { nucleo: 3 }, lv: 1, pad: [8, -11.5], req: ['d5'] },
  { id: 'terraco', name: 'Construir Terraço', desc: 'Paredes do 1º andar, terraço e escada para o topo!', price: 14000, lv: 1, pad: [12, 4], req: ['esteiraB', 'd6'], big: true },
  { id: 'torre1', name: 'Torre de Flechas', desc: 'Defesa automática no terraço contra saqueadores.', price: 9000, lv: 2, pad: [-21, -16], req: ['terraco'] },
  { id: 'totemR', name: 'Totem: Chuva de Tijolos (R)', desc: 'Desbloqueia o ultimate R — Chuva de Tijolos.', price: 22000, items: { nucleo: 5 }, lv: 2, pad: [0, -6], req: ['terraco'] },
  { id: 'runica', name: 'Lâmina Rúnica', desc: 'Lâmina ancestral: 72 de dano em área. (Tecla 4)', price: 28000, items: { nucleo: 4, dente: 10 }, lv: 1, pad: [-11, 5.5], req: ['terraco'], weapon: true },
  { id: 'torre2', name: 'Torre de Flechas II', desc: 'Segunda torre de defesa no terraço.', price: 12000, lv: 2, pad: [21, -16], req: ['torre1'] },
  { id: 'd7', name: 'Dropper Real #7', desc: 'Dropper de ouro: $110 a cada 2,4s.', price: 30000, lv: 1, pad: [2, -11.5], req: ['d6', 'terraco'] },
  { id: 'reforma', name: 'Reforma Real', desc: 'Piso de mármore, lustres, +300 vida do cofre e +100 vida para você.', price: 25000, lv: 0, pad: [6, 5], req: ['terraco'] },
  { id: 'torre3', name: 'Torre de Flechas III', desc: 'Terceira torre de defesa.', price: 20000, lv: 2, pad: [-21, 3], req: ['torre2'] },
  { id: 'portal', name: 'Portal do Rei Goblin', desc: 'A última compra da Floresta. Abre o caminho até o Rei Goblin!', price: 60000, items: { estandarte: 1, dente: 8, nucleo: 4 }, lv: 0, pad: [-9, 27], req: ['__all__'], big: true },
];
const BY_ID = Object.fromEntries(PURCHASES.map((p) => [p.id, p]));

const ORE_DEF = [
  { color: 0x8f8a80, glow: 0 },
  { color: 0xb8c0cc, glow: 0 },
  { color: 0xc77dff, glow: 0.9 },
  { color: 0xffcf40, glow: 0.6 },
];

export function createTycoon(scene) {
  const T = {
    groups: {},
    anims: [],
    tagMeshes: { L1: [], L2: [], F0: [], F1: [] },
    tagAnims: { L1: [], L2: [], F0: [], F1: [] },
    fade: { L1: 1, L2: 1, F0: 1, F1: 1 },
    droppers: [],
    lines: [],
    ores: [],
    pads: new Map(),
    turrets: [],
    crankValue: 1,
    crankCd: 0,
    bonusHp: 0,
    sabotageT: 0,
    buildQueue: [],
    hiddenLevels: new Set(),
    hiddenTags: new Set(),
    instant: false,
  };
  G.base = T;
  const has = (id) => G.state.purchased.includes(id);
  T.has = has;

  // ---------- construction helpers ----------
  function construct(id, fn, o = {}) {
    const builders = new Map();
    const bt = (tag = null) => {
      const k = tag || '_';
      if (!builders.has(k)) builders.set(k, new PartBuilder({ tag }));
      return builders.get(k);
    };
    const extra = [];
    const anims = [];
    const ctx = { b: bt(o.tag || null), bt, extra, anims };
    const ret = fn(ctx) || {};
    const root = new THREE.Group();
    root.name = 'build_' + id;
    const solids = [], lights = [];
    for (const [k, b] of builders) {
      const g = b.build(id + k);
      root.add(g);
      solids.push(...b.solids);
      for (const l of b.lights) lights.push(G.sky.addLight(l.x, l.y, l.z, l.color, l.power, { nightOnly: !!l.nightOnly, flicker: l.nightOnly ? 0 : 0.5, tag: k === "_" ? null : k }));
      const tag = k === '_' ? null : k;
      if (tag && T.tagMeshes[tag]) for (const m of g.children) T.tagMeshes[tag].push(m);
    }
    for (const a of anims) {
      root.add(a.mesh);
      T.anims.push(a);
      if (a.tag && T.tagAnims[a.tag]) T.tagAnims[a.tag].push(a.mesh);
    }
    for (const m of extra) root.add(m.mesh || m);
    scene.add(root);
    addSolids(solids);
    T.groups[id] = { root, solids, lights, anims };
    if (!T.instant && o.animate !== false) dropIn(root, o.big);
    return ret;
  }
  function removeGroup(id) {
    const g = T.groups[id];
    if (!g) return;
    scene.remove(g.root);
    removeSolids(g.solids);
    for (const l of g.lights) G.sky.removeLight(l);
    for (const a of g.anims) {
      const i = T.anims.indexOf(a);
      if (i >= 0) T.anims.splice(i, 1);
    }
    delete T.groups[id];
    rebatch();
  }
  // ---------- static batching: all settled construction merged per material ----------
  let batchRoot = null;
  T.batchPending = -1;
  function rebatch() {
    T.batchPending = -1;
    if (batchRoot) {
      scene.remove(batchRoot);
      for (const m of batchRoot.children) m.geometry.dispose();
    }
    batchRoot = new THREE.Group();
    batchRoot.name = "batch";
    const byKey = new Map();
    for (const tag in T.tagMeshes) T.tagMeshes[tag] = [];
    for (const id in T.groups) {
      const g = T.groups[id];
      const settling = T.buildQueue.includes(g.root);
      g.root.updateMatrixWorld(true);
      g.root.traverse((o) => {
        if (!o.isMesh || !o.userData.batchable) return;
        if (settling) {
          o.visible = true;
          const tg = o.material.userData.tag;
          if (tg && T.tagMeshes[tg]) T.tagMeshes[tg].push(o);
          return;
        }
        const k = o.material.uuid + (o.userData.cast ? "c" : "") + (o.receiveShadow ? "r" : "");
        if (!byKey.has(k)) byKey.set(k, { mat: o.material, cast: o.userData.cast, recv: o.receiveShadow, geos: [] });
        byKey.get(k).geos.push(bakeGeometry(o, o.matrixWorld));
        o.visible = false;
      });
    }
    for (const e of byKey.values()) {
      const geo = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
      if (e.geos.length > 1) for (const g of e.geos) g.dispose();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, e.mat);
      m.castShadow = e.cast;
      m.receiveShadow = e.recv;
      m.userData.cast = e.cast;
      if (e.mat.transparent && e.mat.userData.kind === "glass") m.renderOrder = 2;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      batchRoot.add(m);
      const tag = e.mat.userData.tag;
      if (tag && T.tagMeshes[tag]) T.tagMeshes[tag].push(m);
    }
    scene.add(batchRoot);
    T._fadeInit = false;
  }
  T.rebatch = rebatch;
  function dropIn(root, big) {
    const box = new THREE.Box3().setFromObject(root);
    root.position.y = big ? 30 : DROP_H;
    root.userData.drop = { t: 0, dur: big ? 1.1 : 0.7, h: root.position.y, box, big };
    T.buildQueue.push(root);
  }
  function updateDrops(dt) {
    for (let i = T.buildQueue.length - 1; i >= 0; i--) {
      const r = T.buildQueue[i];
      const d = r.userData.drop;
      d.t += dt;
      const k = clamp(d.t / d.dur, 0, 1);
      r.position.y = d.h * (1 - easeOutBack(k, 1.2));
      const s = 1 + Math.sin(k * Math.PI) * 0.06;
      r.scale.set(s, 1, s);
      if (k >= 1) {
        r.position.y = 0;
        r.scale.set(1, 1, 1);
        T.buildQueue.splice(i, 1);
        T.batchPending = 0.4;
        const bx = d.box;
        const cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
        const w = Math.max(2, (bx.max.x - bx.min.x) * 0.5);
        G.fx.dust(cx, bx.min.y, cz, d.big ? 50 : 18, w, 0xd8ccb0);
        G.fx.bricks(cx, bx.min.y + 1, cz, [0xf5cd30, 0x0d69ac, 0xffffff], d.big ? 10 : 4, 10, 0.5);
        sfx('build', { x: cx, z: cz });
        G.cam.shake(d.big ? 0.7 : 0.25);
      }
    }
  }

  // ---------- start structures ----------
  T.instant = true;
  construct('plot', ({ b }) => {
    S.plot(b);
    S.missionBoard(b, -16, 17);
    for (const [x, z] of [[-40, 40], [40, 40], [-40, -40], [40, -40], [-8, 40], [8, 40], [-14, 12], [14, 12]]) S.lampPost(b, x, z);
  });
  construct('fence0', ({ b }) => S.fence0(b));
  // building sign (only meaningful once walls exist; placed on plot as a standing banner for now)
  const lines = T.lines;
  function makeLine(yb, idx) {
    const L = { yb, top: yb + S.BELT_TOP + 0.5, upgraders: [], furnaceX: 18.0, pending: 0, pendT: 0, idx, active: true, tag: idx === 1 ? 'L1' : null };
    lines[idx] = L;
    return L;
  }
  let manual;
  construct('lineA', (ctx) => {
    S.conveyor(ctx.b, 0);
    const f = S.furnace(ctx.b, 0, false);
    manual = S.manualStation(ctx.b, -17, ctx.anims);
    ctx.extra.push(manual.btn);
    makeLine(0, 0).furnace = f;
  });
  const vaultInfo = construct('vault', ({ b }) => {
    const v = S.vault(b);
    S.pad(b, 16, 0, 4);
    return v;
  });
  T.instant = false;

  // collect pad neon
  const collectMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 0.6) });
  const collectPad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4), collectMat);
  collectPad.position.set(16, 0.35, 4);
  scene.add(collectPad);
  T.collectPos = collectPad.position;

  // vault entity (raid target)
  T.vault = {
    isVault: true,
    pos: vaultInfo.pos,
    maxHp: 600,
    hp: 600,
    alive: true,
    radius: 2.5,
    hit(dmg, src) {
      if (this.hp <= 0) return;
      this.hp -= dmg;
      const steal = Math.min(G.state.vault, Math.ceil(G.state.vault * 0.05 + 4));
      if (steal > 0) {
        G.state.vault -= steal;
        G.fx.text.add(this.pos.x, 7, this.pos.z, '-' + fmtMoney(steal), 'steal');
      }
      sfx('vault', { x: this.pos.x, z: this.pos.z });
      G.fx.sparks(this.pos.x, 3, this.pos.z, 0xffd040, 8);
      G.emit('vaultHit');
      if (this.hp <= 0) {
        this.hp = 0;
        const big = Math.floor(G.state.vault * 0.3);
        G.state.vault -= big;
        T.sabotageT = 25;
        G.ui.announce('COFRE ARROMBADO!', `Os goblins roubaram ${fmtMoney(big + steal)} e sabotaram seus droppers!`, 'red');
        G.cam.shake(0.8);
        sfx('slam');
      }
    },
  };

  // training dummy
  const dm = S.dummyModel();
  dm.position.set(17, 0, 20);
  scene.add(dm);
  addSolids([{ type: 'circle', x: 17, z: 20, r: 1.1, bottom: 0, top: 6, walk: false }]);
  T.dummy = { pos: new THREE.Vector3(17, 0, 20), radius: 1.3, height: 6, hp: 99999, maxHp: 99999, alive: true, active: true, immortal: true, isDummy: true, team: 'enemy', name: 'Boneco de Treino',
    onHit() { this.wob = 1; } };
  T.dummyModel = dm;

  // interactables: crank, mission board, vault info
  const crankPos = { x: -17, y: 2.6, z: -13.6 };
  interactables.push({
    x: crankPos.x, y: crankPos.y, z: crankPos.z, r: 2.2, h: 1.4, level: 0, walkTo: true,
    tip: () => `<b>Dropper Manual</b><br>Clique para gerar minério de <span class="g">${fmtMoney(T.crankValue)}</span>`,
    onClick: (pl) => {
      if (Math.hypot(pl.pos.x - crankPos.x, pl.pos.z - crankPos.z) < 8 && Math.abs(pl.pos.y) < 3) crank();
      else { pl.moveTo(crankPos.x, 0, crankPos.z + 2.6, 0); pl.pendingInteract = { onArrive: () => crank() }; }
    },
    onArrive: () => crank(),
    get x2() { return 0; },
  });
  // fix walk target for right-click on crank (stand in front)
  interactables[interactables.length - 1].z = -13.6;
  interactables.push({
    x: -16, y: 2, z: 17, r: 3.5, h: 5, level: 0,
    tip: () => '<b>Quadro de Missões</b><br>Clique para ver suas missões',
    onClick: () => G.ui.openMissions(),
  });
  interactables.push({
    x: 23, y: 0, z: 2, r: 3, h: 5.5, level: 0,
    tip: () => `<b>Cofre</b><br>Guardado: <span class="g">${fmtMoney(G.state.vault)}</span><br>Vida: ${Math.ceil(T.vault.hp)}/${T.vault.maxHp}<br><i>Pise no botão COLETAR!</i>`,
  });

  // labels
  T.vaultLabel = G.ui.worldLabel({ x: 23, y: 7.6, z: 2, cls: 'wl-vault', level: 0 });
  T.collectLabel = G.ui.worldLabel({ x: 16, y: 2.6, z: 4, cls: 'wl-collect', html: 'COLETAR', level: 0 });
  T.crankLabel = G.ui.worldLabel({ x: -17, y: 5.0, z: -13.6, cls: 'wl-crank', html: 'CLIQUE!', level: 0 });
  G.ui.worldLabel({ x: -16, y: 8.2, z: 17, cls: 'wl-board', html: 'MISSÕES', level: 0 });
  G.ui.worldLabel({ x: 17, y: 7.6, z: 20, cls: 'wl-board', html: 'BONECO DE TREINO', level: 0, maxDist: 60 });

  function crank() {
    if (T.crankCd > 0) return;
    T.crankCd = 0.11;
    spawnOre(-17, 4.4, 0, 0, T.crankValue, 0);
    manual.btn.position.y = 2.82;
    G.fx.burst(-17, 3.2, -13.6, 0xff5040, 6, 4, 0.4, 0.3);
    sfx('crank');
    G.emit('crank');
    T.crankPress = 0.12;
  }
  T.crank = crank;

  // ---------- ores ----------
  const oreGeos = [new THREE.IcosahedronGeometry(0.62, 0), rbox(0.95, 0.95, 0.95, 0.12, 1), new THREE.OctahedronGeometry(0.75, 0), rbox(1.1, 0.6, 0.7, 0.1, 1)];
  const oreMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.25, flatShading: true });
  patchMaterial(oreMat, { glow: true, cut: false });
  const MAXO = 260;
  const oreMeshes = oreGeos.map((g) => {
    const geo = g.clone();
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAXO), 1);
    glow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', glow);
    const m = new THREE.InstancedMesh(geo, oreMat, MAXO);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    for (let i = 0; i < MAXO; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(m);
    return m;
  });
  function spawnOre(x, y, line, type, value, lat = null) {
    if (T.ores.length >= MAXO * 2) return;
    const d = ORE_DEF[type];
    T.ores.push({ x, y, z: S.BELT_Z + (lat ?? (Math.random() - 0.5) * 1.6), vy: 0, on: false, line, type, value, glow: d.glow, col: new THREE.Color(d.color), rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 6, passed: 0 });
  }
  T.spawnOre = spawnOre;

  // ---------- purchasables registry ----------
  const ownedOrder = ['punhos', 'espada', 'arco', 'runica'];
  T.ownedWeapons = () => ownedOrder.filter((w) => w === 'punhos' || has(w));
  const rackSpots = {};

  const BUILD = {
    c1: () => { T.crankValue = 3; },
    c2: () => { T.crankValue = 8; },
    d1: () => addDropper('d1', -11, 0, 'wood', 2.0, 3, 0),
    d2: () => addDropper('d2', -5, 0, 'wood', 1.8, 3, 0),
    d3: () => addDropper('d3', 1, 0, 'stone', 2.2, 9, 1),
    d4: () => addDropper('d4', 7, 0, 'stone', 2.0, 12, 1),
    d5: () => addDropper('d5', -12, 1, 'crystal', 2.5, 45, 2),
    d6: () => addDropper('d6', -5, 1, 'crystal', 2.2, 60, 2),
    d7: () => addDropper('d7', 2, 1, 'royal', 2.4, 110, 3),
    u1: () => addUpgrader('u1', 11.5, 0, 'lavador', 1.5),
    u2: () => addUpgrader('u2', 15, 0, 'forja', 2),
    u3: () => addUpgrader('u3', 8, 1, 'encantador', 2.5),
    espada: () => addWeaponDisplay('espada'),
    arco: () => addWeaponDisplay('arco'),
    runica: () => addWeaponDisplay('runica'),
    totemQ: () => construct('totemQ', ({ b, anims }) => S.totem(b, -12, 0, 1, 'Q', anims)),
    totemW: () => construct('totemW', ({ b, anims }) => S.totem(b, -4, 12, 1.5, 'W', anims), { tag: 'L1' }),
    totemE: () => construct('totemE', ({ b, anims }) => S.totem(b, 4, 12, 1.5, 'E', anims), { tag: 'L1' }),
    totemR: () => construct('totemR', ({ b, anims }) => S.totem(b, 0, 24, -11, 'R', anims), { tag: 'L2' }),
    cerca: () => construct('cerca', ({ b }) => S.cerca(b)),
    muralha: () => { removeGroup('cerca'); construct('muralha', ({ b }) => S.muralha(b), { big: true }); },
    andar1: () => {
      removeGroup('fence0');
      construct('andar1', ({ b, bt, extra }) => {
        S.stage1(b, bt('F0'), bt('L1'));
        // big sign over the door (hidden together with the front wall when you're inside)
        const st = S.signTexture('tycoonbobo', 'área 1 • floresta');
        const side = getMat('plastic', 0x0b4f8f);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.6), [side, side, side, side, new THREE.MeshStandardMaterial({ map: st, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.18, emissiveMap: st }), side]);
        sign.position.set(0, 14.6, 10.6);
        sign.castShadow = true;
        extra.push(sign);
        T.tagAnims.F0.push(sign);
      }, { big: true });
    },
    esteiraB: () => {
      construct('esteiraB', (ctx) => {
        S.conveyor(ctx.b, 12);
        const f = S.furnace(ctx.b, 12, true);
        makeLine(12, 1).furnace = f;
      }, { tag: 'L1' });
    },
    terraco: () => construct('terraco', ({ b, bt }) => S.stage2(bt('L1'), bt('F1'), bt('L2')), { big: true }),
    torre1: () => addTurret('torre1', -25.5, -19.5),
    torre2: () => addTurret('torre2', 25.5, -19.5),
    torre3: () => addTurret('torre3', -25.5, 5.5),
    reforma: () => {
      construct('reforma', ({ b, bt }) => {
        b.box(58, 0.06, 32, 0, 0.16, -7, { mat: 'marble', color: 0xd8d2c6, cast: false });
        b.box(10, 0.08, 26, 0, 0.2, -2, { mat: 'fabric', color: 0xb01e2a, cast: false });
        const l1 = bt('L1');
        l1.box(52, 0.06, 32, 3, 12.04, -7, { mat: 'marble', color: 0xd8d2c6, cast: false });
        for (const [x, z] of [[-10, -4], [10, -4]]) {
          b.cyl(0.08, 0.08, 2.5, x, 9.8, z, { mat: 'gold', color: 0xffc940 });
          b.torus(1.8, 0.2, x, 8.4, z, { mat: 'gold', color: 0xffc940, rot: [Math.PI / 2, 0, 0] });
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.sphere(0.32, x + Math.cos(a) * 1.8, 8.9, z + Math.sin(a) * 1.8, { mat: 'neon', color: 0xfff0c0, ico: 0 }); }
          b.light(x, 8, z, 0xffe0a0, 1.0);
        }
        b.box(4.8, 0.3, 4.6, 23, 5.75, 2, { mat: 'gold', color: 0xffd040 });
      });
      T.vault.maxHp += 300;
      T.vault.hp = T.vault.maxHp;
      T.bonusHp = 100;
      G.player?.recalc();
    },
    portal: () => buildPortal(),
  };

  function addDropper(id, x, line, style, interval, value, type) {
    const yb = line === 1 ? 12 : 0;
    let out;
    construct(id, ({ b, anims }) => { out = S.dropper(b, x, yb, style, anims); }, { tag: line === 1 ? 'L1' : null });
    T.droppers.push({ id, x: out.x, y: out.y, line, interval, value, type, t: Math.random() * interval, pulse: 0 });
  }
  function addUpgrader(id, x, line, kind, mult) {
    const yb = line === 1 ? 12 : 0;
    let u;
    construct(id, ({ b, anims }) => { u = S.upgrader(b, x, yb, kind, anims); }, { tag: line === 1 ? 'L1' : null });
    const L = lines[line];
    L.upgraders.push({ x, mult, color: u.color, kind });
    L.upgraders.sort((a, b) => a.x - b.x);
  }
  function addWeaponDisplay(id) {
    const spots = { espada: [28.4, 4.2, -11.5, 0, 0], arco: [-15, 15.2, 1.2, 1, 12], runica: [-11, 15.2, 1.2, 1, 12] };
    const s = spots[id];
    if (!rackSpots[id]) {
      if (id === 'espada' && !T.groups.rackA) construct('rackA', ({ b }) => S.rack(b, 28.5, 0, -11.5, Math.PI / 2));
      if ((id === 'arco' || id === 'runica') && !T.groups.rackB) construct('rackB', ({ b }) => S.rack(b, -13, 12, 0.6, 0), { tag: 'L1' });
    }
    const w = makeWeapon(id);
    w.scale.setScalar(1.3);
    if (id === 'espada') { w.position.set(27.9, 3.6, -11.5); w.rotation.set(-Math.PI / 2, 0, Math.PI / 2); }
    else { w.position.set(s[0], 15.0, 1.25); w.rotation.set(-Math.PI / 2, 0, 0); }
    scene.add(w);
    rackSpots[id] = w;
    if (id !== 'espada') T.tagAnims.L1.push(w);
    if (!T.instant) G.player.equip(id);
  }
  function addTurret(id, x, z) {
    let head;
    construct(id, ({ b, anims }) => { head = S.turret(b, x, 24, z, anims); anims.push({ mesh: head, tag: 'L2', fn: () => {} }); }, { tag: 'L2' });
    T.turrets.push({ head, x, y: 29.6, z, cd: 0, range: 62 });
  }

  // ---------- portal ----------
  T.portalActive = false;
  let vortex = null;
  function buildPortal() {
    construct('portal', ({ b }) => S.portalArch(b), { big: true });
    const vm = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv*2.0-1.0; p.y *= 1.0;
          float r = length(p); if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float sw = sin(a*5.0 + r*14.0 - uTime*5.0)*0.5+0.5;
          float sw2 = sin(a*3.0 - r*9.0 + uTime*3.0)*0.5+0.5;
          vec3 c1 = vec3(0.2, 1.5, 0.3), c2 = vec3(0.45, 0.08, 1.1);
          vec3 col = mix(c2, c1, sw*0.7 + sw2*0.3);
          col += vec3(0.8,1.3,0.7) * pow(1.0 - r, 3.0);
          float edge = smoothstep(1.0, 0.85, r);
          gl_FragColor = vec4(col, edge*(0.75+0.25*sw));
        }`,
    });
    vortex = new THREE.Mesh(new THREE.CircleGeometry(7, 48), vm);
    vortex.position.set(0, 8.2, 35);
    vortex.scale.set(1, 1.15, 1);
    vortex.renderOrder = 6;
    scene.add(vortex);
    T.portalActive = true;
    T.portalMat = vm;
    G.sky.addLight(0, 6, 33, 0x6aff7a, 0.9, { range: 22 });
    G.ui.worldLabel({ x: 0, y: 23.5, z: 35, cls: 'wl-portal', html: 'PORTAL DO REI GOBLIN', level: 0, maxDist: 140 });
    interactables.push({ x: 0, y: 2, z: 35, r: 7, h: 14, level: 0, walkTo: true, tip: () => '<b>Portal do Rei Goblin</b><br>Entre para enfrentar o chefe da Floresta!', onClick: (pl) => { pl.moveTo(0, 0, 34.2, 0); }, onArrive: () => {} });
  }

  // ---------- pads ----------
  const padGeo = new THREE.BoxGeometry(4, 0.32, 4);
  const padMatOk = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.5) });
  const padMatNo = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.2) });
  const rimGeo = new THREE.BoxGeometry(4.8, 0.22, 4.8);
  const rimMat = getMat('plastic', 0x23262c, { cut: false });
  function unlocked(p) {
    if (has(p.id)) return false;
    if (p.req.includes('__all__')) return PURCHASES.every((q) => q.id === p.id || has(q.id));
    return p.req.every(has);
  }
  function itemsOk(p) {
    if (!p.items) return true;
    for (const k in p.items) if ((G.state.items[k] || 0) < p.items[k]) return false;
    return true;
  }
  function priceHTML(p) {
    let s = `<div class="pp-price ${G.state.cash >= p.price ? '' : 'no'}">${fmtMoney(p.price)}</div>`;
    if (p.items) {
      s += '<div class="pp-items">';
      for (const k in p.items) {
        const okk = (G.state.items[k] || 0) >= p.items[k];
        s += `<span class="pp-it ${okk ? '' : 'no'}"><i class="ico-${k}"></i>${G.state.items[k] || 0}/${p.items[k]}</span>`;
      }
      s += '</div>';
    }
    return s;
  }
  function refreshPads() {
    for (const p of PURCHASES) {
      const show = unlocked(p);
      const cur = T.pads.get(p.id);
      if (show && !cur) {
        const y = S.LV[p.lv];
        const g = new THREE.Group();
        g.position.set(p.pad[0], y, p.pad[1]);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = 0.11;
        rim.receiveShadow = true;
        const top = new THREE.Mesh(padGeo, padMatNo);
        top.position.y = 0.28;
        g.add(rim, top);
        g.scale.setScalar(0.01);
        scene.add(g);
        const label = G.ui.worldLabel({ x: p.pad[0], y: y + 4.2, z: p.pad[1], cls: 'wl-pad', level: p.lv, maxDist: 90 });
        const entry = { p, g, top, label, y, on: false, appear: 0, lastHTML: '' };
        T.pads.set(p.id, entry);
        interactables.push(entry.inter = {
          x: p.pad[0], y, z: p.pad[1], r: 2.8, h: 1, level: p.lv, walkTo: true,
          tip: () => `<b>${p.name}</b><br>${p.desc}<br>${priceHTML(p)}`,
          onClick: (pl) => pl.moveTo(p.pad[0], y, p.pad[1], p.lv),
          onArrive: () => {},
        });
        if (!T.instant && T.started) {
          G.fx.burst(p.pad[0], y + 1, p.pad[1], 0x7aff8a, 14, 6, 0.6, 0.5);
          sfx('notify', { x: p.pad[0], z: p.pad[1] });
        }
      } else if (!show && cur) {
        removePad(p.id);
      }
    }
  }
  function removePad(id) {
    const e = T.pads.get(id);
    if (!e) return;
    scene.remove(e.g);
    G.ui.removeLabel(e.label);
    const i = interactables.indexOf(e.inter);
    if (i >= 0) interactables.splice(i, 1);
    T.pads.delete(id);
  }
  T.refreshPads = refreshPads;

  function tryBuy(id) {
    const p = BY_ID[id];
    if (!p || has(id)) return;
    if (G.state.cash < p.price) {
      G.ui.toast(`Faltam ${fmtMoney(p.price - G.state.cash)} para ${p.name}`, 'red');
      sfx('cant');
      return false;
    }
    if (!itemsOk(p)) {
      const miss = Object.keys(p.items).filter((k) => (G.state.items[k] || 0) < p.items[k]).map((k) => `${p.items[k] - (G.state.items[k] || 0)}× ${ITEMS[k].name}`).join(', ');
      G.ui.toast(`Faltam itens: ${miss} — derrote inimigos na floresta!`, 'red');
      sfx('cant');
      return false;
    }
    G.state.cash -= p.price;
    if (p.items) for (const k in p.items) G.state.items[k] -= p.items[k];
    G.state.purchased.push(id);
    const e = T.pads.get(id);
    if (e) {
      G.fx.burst(p.pad[0], e.y + 1, p.pad[1], 0x7aff8a, 24, 10, 0.7, 0.6);
      removePad(id);
    }
    sfx('buy');
    if (p.big && G.cam.mode === 'moba') {
      const prev = G.cam.distT;
      G.cam.distT = Math.max(prev, 80);
      setTimeout(() => { if (G.cam.distT === 80 || G.cam.distT === Math.max(prev, 80)) G.cam.distT = prev; }, 3400);
    }
    G.fx.bricks(G.player.pos.x, G.player.pos.y + 2, G.player.pos.z, [0x2fd35a, 0xffd23f, 0x1f9bff], 8, 9, 0.45);
    BUILD[id] && BUILD[id]();
    afterBuild();
    G.ui.toast(`Comprado: ${p.name}!`, 'green');
    G.emit('buy', id);
    G.save && G.save();
    return true;
  }
  T.tryBuy = tryBuy;

  function afterBuild() {
    rebuildBase();
    const links = [];
    if (has('andar1')) links.push({ a: { level: 0, x: -26.5, z: 6.6 }, b: { level: 1, x: -26.5, z: -10.6 } });
    if (has('terraco')) links.push({ a: { level: 1, x: 26.5, z: -13.3 }, b: { level: 2, x: 26.5, z: 2.6 } });
    setLinks(links);
    refreshPads();
  }

  // ---------- load from save ----------
  T.loadPurchases = () => {
    T.instant = true;
    for (const id of G.state.purchased) BUILD[id] && BUILD[id]();
    T.instant = false;
    afterBuild();
    rebatch();
  };

  // ---------- floor fading ----------
  const _hl = new Set(), _ht = new Set();
  function updateFade(dt) {
    const p = G.player;
    const inside = p && !p.dead && p.pos.x > S.BLD.x0 && p.pos.x < S.BLD.x1 && p.pos.z > S.BLD.z0 && p.pos.z < S.BLD.z1 + 0.5 && !inArena(p.pos.x, p.pos.z);
    const lvl = p ? levelOf(p.pos.x, p.pos.y + 0.5, p.pos.z) : 0;
    const fp = G.cam.mode === 'fp' || G.cam.mode === 'title';
    const want = {
      L1: inside && !fp && lvl === 0 && has('andar1'),
      L2: inside && !fp && lvl <= 1 && has('terraco'),
      F0: inside && !fp && lvl === 0 && has('andar1'),
      F1: inside && !fp && lvl <= 1 && has('terraco'),
    };
    _hl.clear();
    _ht.clear();
    for (const tag in want) {
      const target = want[tag] ? (tag[0] === 'F' ? 0.08 : 0.1) : 1;
      const prev = T.fade[tag];
      const cur = damp(prev, target, 9, dt);
      T.fade[tag] = Math.abs(cur - target) < 0.004 ? target : cur;
      const f = T.fade[tag];
      if (f !== prev || T._fadeInit !== true) {
        for (const m of levelMats[tag]) {
          m.opacity = (m.userData.baseOpacity ?? 1) * f;
          m.depthWrite = f > 0.97 && m.userData.kind !== 'glass';
        }
        const cast = f > 0.5;
        for (const m of T.tagMeshes[tag]) {
          if (m.userData.cast) m.castShadow = cast;
          if (m.material.isMeshBasicMaterial) m.visible = f > 0.5;
        }
        for (const a of T.tagAnims[tag]) a.visible = f > 0.35;
      }
      if (want[tag]) {
        if (tag === 'L1') _hl.add(1);
        if (tag === 'L2') _hl.add(2);
        _ht.add(tag);
      }
    }
    T._fadeInit = true;
    T.hiddenLevels = _hl;
    T.hiddenTags = _ht;
  }

  // ---------- update ----------
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  T.update = (dt) => {
    if (T.batchPending >= 0) {
      T.batchPending -= dt;
      if (T.batchPending < 0 && T.buildQueue.length === 0) rebatch();
      else if (T.batchPending < 0) T.batchPending = 0.2;
    }
    T.crankCd -= dt;
    T.sabotageT = Math.max(0, T.sabotageT - dt);
    updateDrops(dt);
    updateFade(dt);
    // crank button spring
    if (T.crankPress > 0) T.crankPress -= dt;
    manual.btn.position.y = damp(manual.btn.position.y, 3.05, 18, dt);
    // belt texture scroll
    TEX.belt.offset.x -= (BELT_SPEED * dt) / 4;
    // anims
    const k = T.sabotageT > 0 ? 0 : 1;
    for (const a of T.anims) a.fn(dt, k);
    // droppers
    if (T.sabotageT <= 0) {
      for (const d of T.droppers) {
        const L = lines[d.line];
        if (!L) continue;
        d.t -= dt;
        if (d.t <= 0) {
          d.t += d.interval;
          spawnOre(d.x, d.y, d.line, d.type, d.value);
          if (!(L.tag === 'L1' && T.fade.L1 < 0.5)) G.fx.alpha.emit(d.x, d.y - 0.3, S.BELT_Z, 0, -1.5, 0, 0.45, 1.0, 2.2, 0xe8e0d0, 0xe8e0d0, 0.35, 0, 2);
          if (G.player && Math.abs(G.player.pos.y - (d.line ? 12 : 0)) < 8) sfx('drop', { x: d.x, z: S.BELT_Z, vol: 0.35, range: 40 });
          d.pulse = 1;
        }
      }
    } else if (Math.random() < dt * 6) {
      const d = T.droppers[(Math.random() * T.droppers.length) | 0];
      if (d) G.fx.sparks(d.x, d.y + 3, S.BELT_Z, 0xffa040, 4);
    }
    // ores
    const counts = [0, 0, 0, 0];
    for (let i = T.ores.length - 1; i >= 0; i--) {
      const o = T.ores[i];
      const L = lines[o.line];
      if (!L) { T.ores.splice(i, 1); continue; }
      if (!o.on) {
        o.vy -= 70 * dt;
        o.y += o.vy * dt;
        o.rx += o.spin * dt;
        if (o.y <= L.top) {
          o.y = L.top;
          o.on = true;
          o.vy = 0;
        }
      } else {
        const px = o.x;
        o.x += BELT_SPEED * dt;
        o.ry += dt * 0.6;
        for (let u = o.passed; u < L.upgraders.length; u++) {
          const up = L.upgraders[u];
          if (px < up.x && o.x >= up.x) {
            o.value *= up.mult;
            o.passed = u + 1;
            o.glow = Math.min(2.2, o.glow + 0.55);
            o.col.lerp(new THREE.Color(up.color), 0.45);
            G.fx.burst(o.x, o.y + 0.5, o.z, up.color, 5, 4, 0.45, 0.3);
            if (Math.abs(G.player.pos.y - L.yb) < 8) sfx('upgrade', { x: o.x, z: o.z, vol: 0.4, range: 40 });
          }
        }
        if (o.x >= L.furnaceX) {
          G.state.vault += o.value;
          L.pending += o.value;
          G.fx.sparks(L.furnaceX + 0.5, o.y + 0.8, S.BELT_Z, L.furnace.glow, 3);
          T.ores.splice(i, 1);
          continue;
        }
      }
      if (L.tag === 'L1' && T.fade.L1 < 0.5) continue;
      const ti = o.type;
      const mesh = oreMeshes[ti];
      const n = counts[ti];
      if (n >= MAXO) continue;
      _e.set(o.rx, o.ry, 0);
      _q.setFromEuler(_e);
      _m4.compose(_p.set(o.x, o.y + 0.1, o.z), _q, _s);
      mesh.setMatrixAt(n, _m4);
      mesh.setColorAt(n, o.col);
      mesh.geometry.attributes.aGlow.array[n] = o.glow;
      counts[ti]++;
    }
    for (let t = 0; t < oreMeshes.length; t++) {
      const m = oreMeshes[t];
      m.count = counts[t];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.geometry.attributes.aGlow.needsUpdate = true;
    }
    // furnace sale popups
    for (const L of lines) {
      if (!L) continue;
      L.pendT -= dt;
      if (L.pending > 0 && L.pendT <= 0) {
        L.pendT = 0.45;
        if (!(L.tag === 'L1' && T.fade.L1 < 0.5)) G.fx.text.add(L.furnaceX + 2, L.yb + 6.5, S.BELT_Z + 2, '+' + fmtMoney(L.pending), 'cash', { vy: 4, spread: 0.5 });
        if (Math.abs(G.player.pos.y - L.yb) < 8) sfx('sell', { x: L.furnaceX, z: S.BELT_Z, vol: 0.5, range: 50 });
        L.pending = 0;
      }
      const near = G.player && Math.abs(G.player.pos.x - 0) < 80 && Math.abs(G.player.pos.z) < 80 && !(L.tag === 'L1' && T.fade.L1 < 0.5);
      if (near && L.furnace && Math.random() < dt * 14) G.fx.add.emit(L.furnaceX - 0.4, L.yb + S.BELT_TOP + 0.6 + Math.random() * 2, S.BELT_Z + (Math.random() - 0.5) * 3.6, -1 - Math.random() * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.5, 0.32, 0.05, L.furnace.glow, 0xff3000, 1, -1, 0.5);
      if (near) for (const u of L.upgraders) {
        if (Math.random() > dt * 10) continue;
        const ux = u.x + (Math.random() - 0.5) * 0.6, uy = L.yb + S.BELT_TOP + 0.5 + Math.random() * 3.2, uz = S.BELT_Z + (Math.random() - 0.5) * 4;
        if (u.kind === 'lavador') G.fx.add.emit(ux, uy + 2, uz, (Math.random() - 0.5) * 2, -6, (Math.random() - 0.5) * 2, 0.4, 0.35, 0.15, 0x8ad8ff, 0x3a9aff, 0.9, 10, 0.5);
        else if (u.kind === 'forja') G.fx.add.emit(ux, uy, uz, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 0.7, 0.3, 0.05, 0xffb040, 0xff3000, 1, 2, 0.5);
        else G.fx.add.emit(ux, uy, uz, (Math.random() - 0.5) * 1, 1 + Math.random(), (Math.random() - 0.5) * 1, 0.9, 0.45, 0.05, 0xe080ff, 0x8040ff, 1, -1, 0.5);
      }
      if (L.furnace && Math.random() < dt * 2.5) G.fx.smoke(L.furnace.smoke[0], L.furnace.smoke[1], L.furnace.smoke[2], L.idx === 1 ? 0x8a7aa8 : 0x6a6a6a, 1.6);
    }
    // collect pad
    const p = G.player;
    collectMat.color.setRGB(0.3, 1.8 + Math.sin(G.t * 4) * 0.5, 0.6);
    if (p && !p.dead) {
      const onCollect = Math.abs(p.pos.x - 16) < 2.4 && Math.abs(p.pos.z - 4) < 2.4 && p.pos.y < 2;
      if (onCollect && !T.onCollect) {
        if (G.state.vault >= 1) {
          const v = Math.floor(G.state.vault);
          G.state.vault -= v;
          const n = Math.min(14, 3 + Math.floor(Math.log10(v + 1) * 3));
          for (let i = 0; i < n; i++) G.loot.coin(23, 4, 4.5, v / n, { delay: 0.15 + i * 0.03 });
          sfx('collect');
          G.fx.text.add(16, 4, 4, '+' + fmtMoney(v), 'cash big', { jitter: false, vy: 6 });
          G.ui.flyCoins(16, 2, 4, Math.min(16, 4 + Math.floor(Math.log10(v + 1) * 3)));
          G.emit('collect', v);
        } else {
          G.ui.toast('O cofre está vazio — gire a manivela!', 'blue');
        }
      }
      T.onCollect = onCollect;
      // pads
      for (const e of T.pads.values()) {
        const on = Math.abs(p.pos.x - e.p.pad[0]) < 2.4 && Math.abs(p.pos.z - e.p.pad[1]) < 2.4 && Math.abs(p.pos.y - e.y) < 1.5;
        if (on && !e.on) tryBuy(e.p.id);
        e.on = on;
      }
    }
    // pad visuals / labels
    const hidden = T.hiddenLevels;
    for (const e of T.pads.values()) {
      e.appear = Math.min(1, e.appear + dt * 3);
      const ok = G.state.cash >= e.p.price && itemsOk(e.p);
      if (ok && !e.notified) {
        e.notified = true;
        if (T.started && !T.instant) {
          G.ui.toast('Você já pode comprar: ' + e.p.name + '!', 'green');
          sfx('notify');
        }
      }
      e.top.material = ok ? padMatOk : padMatNo;
      const s = easeOutBack(e.appear) * (1 + Math.sin(G.t * 5 + e.p.pad[0]) * (ok ? 0.04 : 0.015));
      e.g.scale.set(s, 1, s);
      e.g.visible = !hidden.has(e.p.lv);
      if (ok && e.g.visible && Math.random() < dt * 5) G.fx.add.emit(e.p.pad[0] + (Math.random() - 0.5) * 3.6, e.y + 0.4, e.p.pad[1] + (Math.random() - 0.5) * 3.6, 0, 2.5 + Math.random() * 2, 0, 0.8, 0.45, 0.1, 0x7aff8a, 0xffffff, 1, 0, 0.5);
      const html = `<div class="pp-name">${e.p.name}</div>${priceHTML(e.p)}`;
      if (html !== e.lastHTML) { e.label.setHTML(html); e.lastHTML = html; }
    }
    T.vaultLabel.setHTML(`<div class="v-amt">${fmtMoney(G.state.vault)}</div><div class="v-hp"><i style="width:${(T.vault.hp / T.vault.maxHp) * 100}%"></i></div>`);
    // turrets
    for (const tu of T.turrets) {
      tu.cd -= dt;
      let best = null, bd = tu.range;
      for (const e of G.enemies.list) {
        if (!e.alive || !e.active) continue;
        const d = Math.hypot(e.pos.x - tu.x, e.pos.z - tu.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const yaw = Math.atan2(best.pos.x - tu.x, best.pos.z - tu.z);
        tu.head.rotation.y = yaw;
        if (tu.cd <= 0) {
          tu.cd = 1.1;
          spawnProjectile({ kind: 'bolt', x: tu.x, y: tu.y, z: tu.z, target: best, speed: 65, dmg: 55 + G.state.purchased.length * 2, team: 'player', color: 0x60d0ff });
          sfx('turret', { x: tu.x, z: tu.z });
        }
      } else tu.head.rotation.y += dt * 0.4;
    }
    // dummy wobble
    const dmy = T.dummy;
    dmy.wob = Math.max(0, (dmy.wob || 0) - dt * 2.5);
    T.dummyModel.rotation.z = Math.sin(G.t * 18) * 0.12 * dmy.wob;
    // portal
    if (T.portalActive && vortex) {
      T.portalMat.uniforms.uTime.value = G.t;
      if (Math.random() < dt * 12) G.fx.add.emit((Math.random() - 0.5) * 12, 1 + Math.random() * 14, 35 + (Math.random() - 0.5), 0, 0, 3, 1, 0.6, 0.1, 0x5acc50, 0x8040cc, 0.8);
      if (p && !p.dead && Math.abs(p.pos.x) < 6 && Math.abs(p.pos.z - 35) < 1.6 && p.pos.y < 3 && !T.portalCooldown) {
        T.portalCooldown = true;
        G.ui.confirmPortal();
      }
      if (p && Math.abs(p.pos.z - 35) > 4) T.portalCooldown = false;
    }
    // vault regen out of raids
    if (!G.enemies.raid || G.enemies.raid.done) T.vault.hp = Math.min(T.vault.maxHp, T.vault.hp + dt * 20);
  };

  T.start = () => {
    for (const e of T.pads.values()) if (G.state.cash >= e.p.price && itemsOk(e.p)) e.notified = true;
    T.started = true;
    refreshPads();
  };
  return T;
}
