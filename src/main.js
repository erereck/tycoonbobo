// NOOB EMPIRE — Tycoon da Floresta. Boot + main loop.
import '@fontsource/lilita-one';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import * as THREE from 'three';
import { G, defaultState, defaultSettings } from './G.js';
import { createRenderer } from './engine/renderer.js';
import { initTextures, U, setAnisotropy } from './engine/materials.js';
import { initInput, input } from './engine/input.js';
import { initAudio, sfx, setListener, setVolume, updateAmbience } from './engine/audio.js';
import { createFX } from './engine/fx.js';
import { initNav } from './engine/nav.js';
import { inArena, addSolids } from './engine/physics.js';
import { buildTerrainData, buildTerrainMeshes } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { buildVegetation, grassUniforms } from './world/vegetation.js';
import { buildForest, updateForest } from './world/forest.js';
import { ARENA, PLOT_HALF, riverZ } from './world/layout.js';
import { Player, SPAWN } from './entities/player.js';
import { createEnemies, Enemy } from './entities/enemies.js';
import { GoblinKing } from './entities/boss.js';
import { createLoot } from './entities/loot.js';
import { initCombat, updateProjectiles, clearProjectiles, spawnProjectile } from './entities/combat.js';
import { createTycoon } from './tycoon/tycoon.js';
import { createCameraRig } from './camera.js';
import { createHUD } from './ui/hud.js';
import { createMissions, createRaids, createAbilities, saveGame, loadGame, loadSettings, offlineEarnings } from './systems.js';
import { PartBuilder } from './engine/parts.js';
import { fmtMoney } from './util.js';

const ldFill = document.getElementById('ld-fill');
const ldText = document.getElementById('ld-text');
const tick = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; setTimeout(r, 0); } }; requestAnimationFrame(f); setTimeout(f, 50); });
let _lt = performance.now(), _lname = "start";
async function step(p, text) {
  const now = performance.now();
  if (import.meta.env.DEV) console.log(`[boot] ${_lname}: ${(now - _lt).toFixed(0)}ms`);
  _lt = now;
  _lname = text;
  ldFill.style.width = p + '%';
  ldText.textContent = text;
  await tick();
}

const TIPS = [
  'Dica: pise no botão COLETAR para pegar o dinheiro do cofre.',
  'Dica: segure a tecla da habilidade para mirar e solte para lançar.',
  'Dica: ande com WASD ou setas — ou clique com o botão direito, estilo LoL.',
  'Dica: os goblins atacam sua base quando anoitece — colete o dinheiro antes!',
  'Dica: aperte B para voltar à base e se curar rapidinho.',
  'Dica: dentro da base, aperte V para jogar em primeira pessoa.',
  'Dica: fique fora dos círculos vermelhos — são ataques que vão cair!',
  'Dica: monstros de elite derrubam os itens raros que o tycoon pede.',
];
let tipI = 0;
const tipTimer = setInterval(() => {
  const e = document.getElementById('ld-tip');
  if (!e) return clearInterval(tipTimer);
  tipI = (tipI + 1) % TIPS.length;
  e.textContent = TIPS[tipI];
}, 2200);

async function boot() {
  G.save = saveGame;
  if (import.meta.env.DEV) {
    window.G = G;
    window.__step = (n = 60, ms = 16.7) => { for (let i = 0; i < n; i++) tickFrame(last + ms); };
  }
  const saved = loadGame();
  G.state = saved || defaultState();
  const firstRun = !loadSettings();
  G.settings = { ...defaultSettings(), ...(loadSettings() || {}) };
  const hasSave = !!saved && saved.purchased.length + saved.mission > 0;

  await step(5, 'Ligando o motor gráfico...');
  const R = createRenderer(document.getElementById('game'));
  G.R = R;
  G.scene = R.scene;
  G.camera = R.camera;
  setAnisotropy(Math.min(8, R.renderer.capabilities.getMaxAnisotropy()));
  await step(12, 'Fabricando tijolos e studs...');
  initTextures();
  await step(22, 'Esculpindo o terreno...');
  buildTerrainData();
  buildTerrainMeshes(G.scene);
  G.sky = createSky(G.scene);
  G.sky.dayT = G.state.dayT ?? 0.08;
  G.fx = createFX(G.scene);
  createHUD();
  await step(38, 'Plantando milhares de árvores...');
  G.veg = buildVegetation(G.scene, R.q);
  await step(55, 'Construindo acampamentos goblins...');
  buildForest(G.scene);
  G.loot = createLoot(G.scene);
  initCombat(G.scene);
  G.abilities = createAbilities();
  G.enemies = createEnemies();
  await step(66, 'Montando sua base tycoon...');
  G.tycoon = createTycoon(G.scene);
  await step(76, 'Calculando caminhos...');
  initNav();
  G.player = new Player(G.scene);
  G.scene.add(G.camera);
  G.cam = createCameraRig(G.camera);
  G.cam.locked = G.settings.camLock;
  G.tycoon.loadPurchases();
  G.player.recalc(true);
  G.missions = createMissions();
  G.raids = createRaids();
  G.enemies.init();
  await step(86, 'Acordando os monstros...');
  initInput(R.renderer.domElement);
  initAudio();
  G.ui.init();
  G.on('quality', (q) => {
    G.sky.setShadowQuality(q);
    G.veg.setGrassCount(q.grass);
  });
  R.setQuality(G.settings.quality);
  setVolume(G.settings.sfx);
  if (G.state.purchased.includes('trofeu')) buildTrophy();
  await step(94, 'Compilando shaders...');
  G.cam.update(0.016);
  G.sky.update(0, G.player.pos, G.camera.position);
  await prewarm();
  // first run: quick GPU benchmark picks a sensible quality preset
  if (firstRun) {
    const gl = R.renderer.getContext();
    const ts = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      R.render();
      gl.finish();
      ts.push(performance.now() - t);
    }
    ts.sort((a, b) => a - b);
    const ms = ts[2] * (innerWidth * innerHeight) / Math.max(1, R.renderer.domElement.clientWidth * R.renderer.domElement.clientHeight);
    const pick = ms > 22 ? 'low' : ms > 11 ? 'medium' : 'high';
    if (pick !== G.settings.quality) {
      G.settings.quality = pick;
      R.setQuality(pick);
    }
    if (import.meta.env.DEV) console.log('[boot] gpu bench', ts.map((x) => x.toFixed(1)).join(','), '->', pick);
  }
  await step(100, 'Pronto!');
  document.getElementById('loading').classList.add('hide');
  setTimeout(() => document.getElementById('loading').remove(), 700);

  // offline earnings
  let offline = 0;
  if (saved) {
    offline = offlineEarnings(saved);
    if (offline > 0) G.state.vault += offline;
  }
  G.ui.showTitle(hasSave, () => {
    G.started = true;
    G.ui.showHUD();
    G.cam.setMode('moba');
    G.cam.centerOn(G.player.pos);
    G.tycoon.start();
    sfx('teleport');
    G.fx.beam(G.player.pos.x, 0, G.player.pos.z, 0x7fd8ff, 30, 50);
    if (!hasSave) {
      setTimeout(() => G.ui.openHelp(), 600);
      G.ui.toast('Ande com WASD / setas ou clique com o BOTÃO DIREITO!', 'blue');
    } else if (offline > 0) setTimeout(() => G.ui.offline(offline), 500);
  });
  requestAnimationFrame(frame);
}

// Render one hidden frame containing every material/shader variant the game can show later
// (all enemy types, the boss, projectiles, decals, loot) so nothing stutters on first use.
async function prewarm() {
  const temps = [];
  const types = ['gosma', 'lobo', 'loboAlfa', 'goblin', 'arqueiro', 'capitao', 'golem', 'raider', 'minion'];
  types.forEach((t, i) => {
    const e = new Enemy(t, -6 + (i % 5) * 3, 6 + Math.floor(i / 5) * 3);
    temps.push(e);
  });
  const king = new GoblinKing();
  king.spawn(G.scene);
  king.pos.set(4, 0, 2);
  for (const k of ['arrow', 'arrowE', 'brick', 'bolt', 'orb', 'boulder']) spawnProjectile({ kind: k, x: 0, y: 3, z: 0, dir: { x: 1, z: 0 }, speed: 0, range: 99, team: 'none' });
  const decs = ['circle', 'rect', 'ring', 'marker', 'shock', 'glow'].map((sh) => G.fx.decals.add({ shape: sh, x: 0, z: 0, y: 0.2, r: 2, w: 2, l: 4, persist: true }));
  for (const id of ['gosma', 'couro', 'dente', 'nucleo', 'estandarte']) G.loot.item(id, 2, 1, 2);
  G.fx.debris.spawn(0, 3, 0, 0, 0, 0, 1, 0xffffff, 0.5);
  G.fx.blobs.add(0, 0, 0, 1);
  G.fx.update(0.016, G.camera, G.R.renderer.domElement.height);
  try {
    if (G.R.renderer.compileAsync) await G.R.renderer.compileAsync(G.scene, G.camera);
  } catch (e) {
    /* ignore */
  }
  G.R.render();
  for (const e of temps) e.dispose();
  king.dispose(G.scene);
  clearProjectiles();
  for (const d of decs) G.fx.decals.remove(d);
  G.loot.clearAll();
  G.R.render();
}

// ---------------- first person ----------------
G.lockPointer = () => {
  try {
    const p = G.R.renderer.domElement.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* pointer lock unavailable */
  }
};
G.toggleFP = () => {
  if (G.cam.mode === 'fp') {
    G.cam.setMode('moba');
    if (document.pointerLockElement) document.exitPointerLock();
    G.ui.toast('Câmera MOBA', 'blue');
    return;
  }
  if (!G.player.inBase || G.player.dead) {
    G.ui.toast('A 1ª pessoa só funciona dentro da sua base!', 'red');
    sfx('cant');
    return;
  }
  G.player.stop();
  G.cam.setMode('fp');
  G.lockPointer();
  G.ui.toast('1ª PESSOA — WASD + mouse · Espaço pula · E/clique interage · V sai', 'blue');
};

// ---------------- arena ----------------
G.inArena = false;
let exitPortal = null;
G.enterArena = () => {
  if (G.inArena) return;
  G.inArena = true;
  clearProjectiles();
  G.R.grade.uniforms.uFlash.value = 1;
  sfx('teleport');
  sfx('portal');
  G.player.teleport(ARENA.x, 0, ARENA.z + 24);
  G.player.yaw = Math.PI;
  G.boss = new GoblinKing();
  G.boss.spawn(G.scene);
  G.cam.distT = 72;
  // intro cinematic: letterbox + slow dolly on the king
  G.player.stop();
  G.cinematic = { t: 0, dur: 3.4 };
  G.cam.lookOverride = { pos: new THREE.Vector3(ARENA.x + 12, 8, ARENA.z - 22 + 40), look: new THREE.Vector3(ARENA.x, 10.5, ARENA.z - 22), dolly: new THREE.Vector3(-1.6, 0.35, -2.6), t: 0 };
  G.cam.setMode("cine");
  document.body.classList.add("cine");
};
function endCinematic() {
  G.cinematic = null;
  document.body.classList.remove("cine");
  G.cam.setMode("moba");
  G.cam.centerOn(G.player.pos);
}
G.leaveArena = () => {
  if (!G.inArena) return;
  G.inArena = false;
  if (G.cinematic) endCinematic();
  if (G.boss) {
    G.boss.dispose(G.scene);
    if (G.boss.alive) G.ui.toast('O Rei Goblin recuperou as forças...', 'red');
    G.boss = null;
  }
  if (exitPortal) {
    G.scene.remove(exitPortal);
    exitPortal = null;
  }
  G.ui.hideBoss();
  G.R.grade.uniforms.uFlash.value = 0.8;
  G.cam.distT = 52;
};
G.on('bossDefeated', () => {
  setTimeout(() => {
    G.ui.hideBoss();
    G.ui.announce('VITÓRIA!', 'A Floresta é sua!', 'gold', 3);
    sfx('levelup');
  }, 1500);
  setTimeout(() => G.ui.victory(), 4200);
  if (!G.state.purchased.includes('trofeu')) {
    G.state.purchased.push('trofeu');
    buildTrophy();
  }
  // exit portal at arena center
  const m = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.0, 2.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(ARENA.x, 7, ARENA.z);
  G.scene.add(m);
  exitPortal = m;
  G.ui.toast('Entre no feixe azul no centro da arena para voltar!', 'blue');
  saveGame();
});
function buildTrophy() {
  const b = new PartBuilder({});
  b.box(3, 2.5, 3, 12, 1.25, 1, { mat: 'marble', color: 0xf4f2ee, solid: true });
  b.box(3.4, 0.4, 3.4, 12, 2.7, 1, { mat: 'gold', color: 0xffc940 });
  b.cyl(1.0, 0.9, 0.9, 12, 3.6, 1, { mat: 'gold', color: 0xffc940, seg: 16 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.cone(0.22, 0.8, 12 + Math.cos(a) * 0.9, 4.4, 1 + Math.sin(a) * 0.9, { mat: 'gold', color: 0xffc940 });
  }
  b.sphere(0.3, 12, 3.7, 1.95, { mat: 'neon', color: 0x6aff5a, ico: 0 });
  b.light(12, 5, 1, 0xffd060, 0.8);
  const g = b.build('trophy');
  G.scene.add(g);
  addSolids(b.solids);
  G.ui.worldLabel({ x: 12, y: 6.5, z: 1, cls: 'wl-board', html: '👑 COROA DO REI GOBLIN', level: 0 });
}

// ---------------- guide beam ----------------
let guide = null;
function updateGuide() {
  if (!guide) {
    const g = new THREE.CylinderGeometry(0.9, 1.4, 60, 16, 1, true);
    g.translate(0, 30, 0);
    guide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    guide.frustumCulled = false;
    G.scene.add(guide);
  }
  const hp = G.started ? G.missions.hintPos() : null;
  const p = G.player.pos;
  const show = hp && !G.inArena && Math.hypot(hp.x - p.x, hp.z - p.z) > 5 && G.cam.mode !== 'fp' && !(G.base.hiddenLevels.has(1) && hp.y > 8);
  guide.visible = !!show;
  if (show) {
    guide.position.set(hp.x, hp.y, hp.z);
    guide.material.opacity = 0.16 + Math.sin(G.t * 3) * 0.06;
    if (Math.random() < 0.3) G.fx.add.emit(hp.x + (Math.random() - 0.5) * 2, hp.y + 0.5, hp.z + (Math.random() - 0.5) * 2, 0, 6 + Math.random() * 6, 0, 1.2, 0.7, 0.1, 0xffd84a, 0xffffff, 1);
  }
}

// ---------------- dev helpers (testing) ----------------
const DEV_KEYS = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');
function devKeys() {
  if (!DEV_KEYS) return;
  if (input.hit('F9')) {
    G.state.cash += 50000;
    G.state.lifetime += 50000;
    for (const k in G.state.items) G.state.items[k] += 10;
    G.ui.toast('[DEV] +$50K e +10 de cada item', 'gold');
  }
  if (input.hit('F10')) {
    G.sky.dayT = 0.7;
    G.ui.toast('[DEV] Anoitecendo...', 'gold');
  }
}

// ---------------- main loop ----------------
let last = performance.now();
let saveT = 20, ambT = 3;
const focus = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  tickFrame(now);
}
function tickFrame(now) {
  const rdt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  G.realDt = rdt;
  let dt = rdt * G.timeScale;
  if (G.hitStop > 0) {
    G.hitStop -= rdt;
    dt *= 0.08;
  }
  if (G.ui.modalOpen && G.started) dt = 0;
  G.dt = dt;
  G.t += dt;
  G.frame++;
  U.uTime.value = G.t;
  const p = G.player;
  const arena = inArena(p.pos.x, p.pos.z);

  if (G.started) {
    devKeys();
    if (G.cinematic) {
      G.cinematic.t += rdt;
      if (G.cinematic.t >= G.cinematic.dur) endCinematic();
    } else     p.handleInput(dt);
    if (dt > 0) {
      p.update(dt);
      G.enemies.update(dt);
      if (G.boss) G.boss.update(dt);
      updateProjectiles(dt);
      G.loot.update(dt);
      G.abilities.update(dt);
      G.raids.update();
      G.state.playTime += dt;
      G.missions.check();
    }
    if (G.cam.mode === 'fp' && !p.inBase) {
      G.toggleFP();
    }
    if (exitPortal && G.boss && !G.boss.alive) {
      exitPortal.rotation.y += dt;
      if (Math.hypot(p.pos.x - ARENA.x, p.pos.z - ARENA.z) < 3.4) {
        p.teleport(SPAWN.x, 0, SPAWN.z);
        G.leaveArena();
        G.fx.beam(SPAWN.x, 0, SPAWN.z, 0x6fc8ff, 30, 50);
        sfx('teleport');
      }
    }
    saveT -= rdt;
    if (saveT <= 0) {
      saveT = 20;
      saveGame();
    }
  } else {
    // title screen: keep the base alive
    p.update(rdt);
  }
  G.tycoon.update(dt > 0 ? dt : 0);
  updateForest(dt);
  updateGuide();

  G.cam.update(rdt);
  focus.copy(G.cam.mode === 'title' ? new THREE.Vector3(0, 0, 0) : p.pos);
  G.sky.update(dt, focus, G.camera.position, arena);
  U.uPlayer.value.copy(p.pos);
  if (G.cam.mode === 'moba') grassUniforms.uCenter.value.set(G.cam.target.x, G.cam.target.z);
  else grassUniforms.uCenter.value.set(p.pos.x, p.pos.z);
  G.veg.fireflies.material.uniforms.uAmt.value = arena ? 0 : Math.max(G.sky.night, 0.15);
  G.fx.update(dt, G.camera, G.R.renderer.domElement.height);
  setListener(G.cam.mode === 'moba' ? G.cam.target.x : p.pos.x, G.cam.mode === 'moba' ? G.cam.target.z : p.pos.z);
  if (G.started) G.ui.update(rdt);
  // flash decay
  const gu = G.R.grade.uniforms;
  gu.uFlash.value = Math.max(0, gu.uFlash.value - rdt * 1.8);
  gu.uNight.value = arena ? 0.25 : G.sky.night * 0.85;
  // ambience beds: wind everywhere, river noise near the water
  {
    const lx = G.cam.mode === 'moba' ? G.cam.target.x : p.pos.x, lz = G.cam.mode === 'moba' ? G.cam.target.z : p.pos.z;
    const rd = Math.abs(lz - riverZ(lx));
    const river = arena ? 0 : Math.max(0, Math.min(1, 1 - (rd - 8) / 45));
    const indoor = G.cam.mode === 'fp' || (G.base?.hiddenLevels?.size ?? 0) > 0;
    updateAmbience(rdt, { wind: G.started ? (arena ? 0.5 : indoor ? 0.35 : 0.8 + G.sky.night * 0.3) : 0.6, river });
  }
  ambT -= rdt;
  if (ambT <= 0 && G.started && !arena) {
    ambT = 1.5 + Math.random() * 4;
    if (G.sky.night > 0.5) sfx('cricket', { vol: 0.5 });
    else sfx('bird', { vol: 0.35 });
  }
  G.R.adapt(rdt);
  G.R.render();
  input.endFrame();
}

addEventListener('beforeunload', () => {
  if (G.started) saveGame();
});
void PLOT_HALF;
void fmtMoney;
boot().catch((e) => {
  console.error(e);
  ldText.textContent = 'Erro ao carregar: ' + e.message;
});
