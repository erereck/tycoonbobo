// Roblox-styled HUD: cash, items, world rank, leaderboard, missions, LoL-like ability bar,
// hotbar, minimap, toasts, world labels, health bars, menus and screens.
import * as THREE from 'three';
import { G } from '../G.js';
import { sfx, setVolume } from '../engine/audio.js';
import { input } from '../engine/input.js';
import { ICON, FACE } from './icons.js';
import { ITEMS, WEAPONS, ABILITIES, XP_TABLE, MAX_LEVEL, MISSIONS, keymap } from '../defs.js';
import { CAMPS, PLAY_HALF, riverZ, ARENA } from '../world/layout.js';
import { COL, GV } from '../world/terrain.js';
import { worldRank, saveGame, wipeSave } from '../systems.js';
import { NIGHT_START, DAY_LEN } from '../world/sky.js';
import { fmtMoney, fmtInt, fmtShort, fmtTime, clamp, mulberry32 } from '../util.js';
import { findPath } from '../engine/nav.js';
import { groundAt, inArena } from '../engine/physics.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
};
const _v = new THREE.Vector3();
const _els = {};
const EL = (id) => _els[id] || (_els[id] = document.getElementById(id));
const T = (id, v) => { const e = EL(id); if (e && e._t !== v) { e._t = v; e.textContent = v; } };
const SW = (id, v) => { const e = EL(id); if (e && e._w !== v) { e._w = v; e.style.width = v; } };

const NAMES = ['xX_ProBuilder_Xx', 'Bloxy_Kevin2009', 'noobmaster_br', 'Pedrinho_Gamer', 'SuperTycoon_BR', 'Luana_Bloxy', 'CaioOGrande', 'MinerFox77', 'ToddyBloxer', 'KingDoBloco', 'Gabizinha_YT', 'TurboNoob', 'OLendario_PT', 'DarkSlayer_BR', 'Mineirinho3000', 'BraboDoTycoon', 'Robloxeiro_99', 'ZeDaEsteira', 'Tijolinho', 'MestreDropper', 'Duda_Builder', 'CapitaoCubo', 'Bacon_Hair_BR', 'GuestDaSilva'];
const AVC = ['#f5cd30', '#0d69ac', '#4b974b', '#c4281c', '#b05cff', '#ff8ad8', '#ffffff', '#1b2a35'];

export function createHUD() {
  const root = document.getElementById('ui');
  const U = {
    modalOpen: false,
    labels: [],
    _cash: 0,
    _rank: 8.1e9,
    income: [],
  };
  G.ui = U;

  // ---------- skeleton ----------
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div id="wl-root"></div><div id="hb-root"></div>
    <div id="hud" style="display:none">
      <div id="tl">
        <div id="tl-row">
          <div id="menu-btn" class="pe" title="Menu (Esc)"><i></i></div>
          <div id="cash" class="stroke"><div class="ci">$</div><span id="cash-v">$0</span><span id="cash-rate"></span></div>
        </div>
        <div id="items"></div>
      </div>
      <div id="tc">
        <div id="rank" class="stroke"><div class="globe">${ICON.globe}</div><div><div class="lbl">RANKING MUNDIAL</div><div class="num" id="rank-v">#8.100.000.000</div><div class="goal" id="rank-g">Meta: #1 do Planeta Terra</div></div></div>
        <div id="clock" class="stroke-s"><span id="clock-i">☀</span><span id="clock-t">Dia</span></div>
      </div>
      <div id="lb" class="panel pe"><div class="hd stroke-s"><span>Jogadores</span><span style="opacity:.7">Ranking · $</span></div><div id="lb-rows"></div></div>
      <div id="mt" class="panel"><div class="k"><span id="mt-k">MISSÃO 1/15</span><span id="mt-n"></span></div><div class="t stroke-s" id="mt-t"></div><div class="d" id="mt-d"></div><div class="bar"><i id="mt-b"></i></div><div class="h" id="mt-h"></div></div>
      <div id="target" class="panel"><div class="tg-top"><span class="tg-n stroke-s" id="tg-n"></span><span class="tg-tag" id="tg-tag"></span></div><div class="tg-b"><em id="tg-l"></em><i id="tg-f"></i><span class="stroke-s" id="tg-t"></span></div></div>
      <div id="guide-arrow"><div class="ga-a"></div><div class="ga-d stroke-s" id="ga-d"></div></div>
      <div id="confetti"></div>
      <div id="toasts"></div>
      <div id="channel"><div class="t stroke-s" id="ch-t"></div><div class="b"><i id="ch-b"></i></div></div>
      <div id="bossbar"><div class="nm stroke">REI GOBLIN</div><div class="sub stroke-s">Senhor da Floresta</div><div class="b"><em id="bb-l"></em><i id="bb-f"></i><span class="stroke-s" id="bb-t"></span></div><div class="ph"><b></b><b></b><b></b></div></div>
      <div id="hb-name" class="stroke"></div>
      <div id="hotbar" class="pe"></div>
      <div id="champ">
        <div id="portrait"><div class="face">${FACE}</div><div class="lvl stroke-s" id="lvl">1</div></div>
        <div id="champ-main" class="panel">
          <div id="abil"></div>
          <div id="bars">
            <div class="hpbar"><div class="lag" id="hp-lag"></div><div class="f" id="hp-f"></div><div class="sh" id="hp-sh"></div><div class="tk" id="hp-tk"></div><span class="stroke-s" id="hp-t"></span></div>
            <div class="xpbar"><i id="xp-f"></i></div>
          </div>
        </div>
        <div id="stats" class="panel"></div>
      </div>
      <div id="mm" class="panel pe"><div id="mm-btns"><div class="ibtn pe" id="b-fp" title="1ª pessoa (V) — só na base">V</div><div class="ibtn pe" id="b-lock" title="Travar câmera (Y)">Y</div><div class="ibtn pe" id="b-help" title="Controles">?</div></div><canvas id="mm-c" width="220" height="220"></canvas></div>
      <div id="death"><div class="c"><div class="t1 stroke">VOCÊ FOI DERROTADO!</div><div class="t2 stroke-s" id="death-t"></div></div></div>
      <div id="announce"></div>
      <div id="fps"></div>
      <div id="xhair"></div>
    </div>
    <div id="tip" class="panel"></div>
    `
  );
  const hud = $('#hud');
  const wlRoot = $('#wl-root');
  const hbRoot = $('#hb-root');

  // items
  const itemsEl = $('#items');
  const itemEls = {};
  for (const k in ITEMS) {
    const e = h(`<div class="chip stroke-s" title="${ITEMS[k].name}"><span class="ico">${ICON[k]}</span><span>0</span></div>`);
    itemsEl.appendChild(e);
    itemEls[k] = { el: e, v: e.querySelector('span:last-child'), last: -1 };
  }
  // abilities
  const abil = $('#abil');
  const slots = {};
  for (const k of ['Q', 'W', 'E', 'R', '|', 'D', 'F', 'B']) {
    if (k === '|') { abil.appendChild(h('<div class="sep"></div>')); continue; }
    const sm = 'DFB'.includes(k);
    const e = h(`<div class="slot ${sm ? 'sm' : ''} pe" data-k="${k}"><div class="ic">${ICON[k]}</div><div class="cd"></div><div class="lock"><span class="ico" style="width:24px;height:24px">${ICON.lock}</span></div><div class="key stroke-s">${k}</div>${k === 'D' ? '<div class="chg stroke-s"></div>' : ''}</div>`);
    abil.appendChild(e);
    e.addEventListener('mouseenter', () => {
      const a = ABILITIES[k];
      const r = e.getBoundingClientRect();
      U.tooltip(`<b>${a.name} [${keymap(G.settings).labels[k] === "␣" ? "Espaço" : keymap(G.settings).labels[k]}]</b><br>${a.desc}<br><span style="opacity:.75">Recarga: ${a.cd}s</span>${a.unlock && !G.player.abilityUnlocked(k) ? '<br><span style="color:#ff8a7a">🔒 Compre o totem no Tycoon</span>' : ''}`, r.left, r.top - 10, true);
    });
    e.addEventListener('mouseleave', () => U.tooltip(null));
    slots[k] = { el: e, cd: e.querySelector('.cd'), chg: e.querySelector('.chg'), lastP: -1, lastL: null };
  }
  U.refreshKeys = () => {
    const L = keymap(G.settings).labels;
    for (const k in slots) slots[k].el.querySelector('.key').textContent = L[k] || k;
  };
  U.refreshKeys();
  // hotbar
  const hotbar = $('#hotbar');
  const hbSlots = [];
  for (let i = 0; i < 4; i++) {
    const e = h(`<div class="hb-slot"><span class="n stroke-s">${i + 1}</span><span class="ic"></span></div>`);
    e.addEventListener('click', () => {
      const w = G.tycoon.ownedWeapons()[i];
      if (w) G.player.equip(w);
    });
    hotbar.appendChild(e);
    hbSlots.push(e);
  }
  $('#menu-btn').addEventListener('click', () => U.openPause());
  $('#b-lock').addEventListener('click', () => { G.cam.locked = !G.cam.locked; G.settings.camLock = G.cam.locked; });
  $('#b-fp').addEventListener('click', () => G.toggleFP());
  $('#b-help').addEventListener('click', () => U.openHelp());

  // ---------- toasts / announce ----------
  const toasts = $('#toasts');
  U.toast = (text, cls = '') => {
    const e = h(`<div class="toast ${cls} stroke-s">${text}</div>`);
    toasts.appendChild(e);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 2950);
  };
  const ann = $('#announce');
  let annT = null;
  U.announce = (t1, t2 = '', cls = 'gold', dur = 3) => {
    ann.className = cls;
    ann.innerHTML = `<div class="a1 stroke">${t1}</div><div class="a2 stroke-s">${t2}</div>`;
    clearTimeout(annT);
    annT = setTimeout(() => { ann.classList.add('out'); }, dur * 1000);
  };
  U.confetti = (n = 46) => {
    const box = EL('confetti');
    const cols = ['#ffd23f', '#2fd35a', '#1f9bff', '#ff4a3d', '#b05cff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const e = document.createElement('div');
      e.className = 'cf';
      const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 360;
      e.style.setProperty('--x', (Math.cos(a) * d).toFixed(0) + 'px');
      e.style.setProperty('--y', (Math.sin(a) * d * 0.7 + 180 + Math.random() * 200).toFixed(0) + 'px');
      e.style.setProperty('--r', ((Math.random() - 0.5) * 1440).toFixed(0) + 'deg');
      e.style.background = cols[i % cols.length];
      e.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
      box.appendChild(e);
      setTimeout(() => e.remove(), 1900);
    }
  };
  // coins that fly from a world position into the cash counter (tycoon classic)
  U.flyCoins = (wx, wy, wz, n = 10) => {
    _v.set(wx, wy, wz).project(G.camera);
    if (_v.z > 1) return;
    const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    const tr = EL('cash').getBoundingClientRect();
    const tx = tr.left + 22, ty = tr.top + tr.height / 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'flycoin';
      root.appendChild(c);
      const ox = (Math.random() - 0.5) * 120, oy = (Math.random() - 0.5) * 80 - 40;
      const delay = i * 35;
      const t0 = performance.now() + delay;
      const dur = 650 + Math.random() * 200;
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = k * k * (3 - 2 * k);
        const mx = sx + ox, my = sy + oy;
        const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * tx;
        const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ty;
        c.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (1 - e * 0.4).toFixed(2) + ')';
        if (k < 1) requestAnimationFrame(step);
        else { c.remove(); U.cashPop(); }
      };
      c.style.transform = 'translate(' + sx + 'px,' + sy + 'px)';
      requestAnimationFrame(step);
    }
  };
  U.missionComplete = (m) => {
    U.confetti();
    U.announce('MISSÃO COMPLETA!', `${m.title}${m.reward.cash ? ' — +' + fmtMoney(m.reward.cash) : ''}${m.reward.xp ? ' +' + m.reward.xp + ' XP' : ''}`, 'gold', 2.6);
    $('#mt').classList.remove('flash');
    void $('#mt').offsetWidth;
    $('#mt').classList.add('flash');
    G.fx.ring(G.player.pos.x, G.player.pos.y + 1, G.player.pos.z, 0xffd84a, 3, 30, 10);
  };
  U.cashPop = (v) => {
    const c = $('#cash');
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
  };
  let dmgPulse = 0;
  U.damagePulse = (k) => { dmgPulse = Math.min(0.75, dmgPulse + k * 0.8 + 0.15); };
  // channel
  let chT = 0, chDur = 0;
  U.channel = (text, dur) => {
    const c = $('#channel');
    if (!text) { c.style.display = 'none'; chDur = 0; return; }
    c.style.display = 'block';
    T('ch-t', text);
    chT = 0;
    chDur = dur;
  };

  // ---------- tooltip ----------
  const tip = $('#tip');
  let tipLast = '', tipOwner = null;
  U.tooltip = (html, x, y, above = false, owner = 'hud') => {
    if (!html) {
      if (tipOwner && tipOwner !== owner) return;
      if (tipOwner === null && tipLast === '') return;
      tip.style.display = 'none';
      tipLast = '';
      tipOwner = null;
      return;
    }
    if (tipOwner === 'hud' && owner === 'world') return;
    tipOwner = owner;
    if (html !== tipLast) { tip.innerHTML = html; tipLast = html; }
    tip.style.display = 'block';
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let tx = x + 18, ty = y + 18;
    if (above) { tx = x; ty = y - hh; }
    tx = clamp(tx, 6, innerWidth - w - 6);
    ty = clamp(ty, 6, innerHeight - hh - 6);
    tip.style.transform = `translate(${tx}px,${ty}px)`;
  };
  tip.style.left = '0';
  tip.style.top = '0';
  let curCls = '';
  U.setCursor = (c) => {
    if (c === curCls) return;
    document.body.classList.remove('cur-' + curCls);
    document.body.classList.add('cur-' + c);
    curCls = c;
  };
  U.setCursor('default');
  U.inspect = () => {};

  // ---------- world labels ----------
  U.worldLabel = (o) => {
    const el = document.createElement('div');
    el.className = 'wl stroke-s ' + (o.cls || '');
    if (o.html) el.innerHTML = o.html;
    wlRoot.appendChild(el);
    const L = { ...o, el, maxDist: o.maxDist ?? 80, shown: true, setHTML(s) { el.innerHTML = s; } };
    U.labels.push(L);
    return L;
  };
  U.removeLabel = (L) => {
    const i = U.labels.indexOf(L);
    if (i >= 0) U.labels.splice(i, 1);
    L.el.remove();
  };
  function updateLabels() {
    const cam = G.camera;
    const W = innerWidth, H = innerHeight;
    const hidden = G.base?.hiddenLevels;
    const fp = G.cam.mode === 'fp';
    for (const L of U.labels) {
      let show = G.cam.mode !== 'title';
      if (show && hidden && L.level !== undefined && hidden.has(L.level)) show = false;
      if (show && L.hideFn && L.hideFn()) show = false;
      let d = 0;
      if (show) {
        d = cam.position.distanceTo(_v.set(L.x, L.y, L.z));
        if (d > L.maxDist * (fp ? 0.5 : 1)) show = false;
      }
      if (show) {
        _v.project(cam);
        if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) show = false;
      }
      if (!show) {
        if (L.shown) { L.el.style.display = 'none'; L.shown = false; }
        continue;
      }
      if (!L.shown) { L.el.style.display = 'block'; L.shown = true; }
      const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
      const sc = clamp(52 / d, 0.55, 1.15);
      L.el.style.transform = `translate(-50%,-100%) translate(${sx | 0}px,${sy | 0}px) scale(${sc.toFixed(3)})`;
    }
  }

  // ---------- enemy health bars ----------
  const hbPool = [];
  let hbUsed = 0;
  function getHB() {
    let e = hbPool[hbUsed];
    if (!e) {
      const el = h('<div class="ehb"><div class="nm stroke-s"></div><div class="b"><em></em><i></i></div></div>');
      hbRoot.appendChild(el);
      e = { el, nm: el.querySelector('.nm'), f: el.querySelector('i'), l: el.querySelector('em'), last: -1, cls: '' };
      hbPool.push(e);
    }
    hbUsed++;
    return e;
  }
  function updateHB() {
    hbUsed = 0;
    const cam = G.camera;
    const W = innerWidth, H = innerHeight;
    const list = [...G.enemies.list];
    if (G.tycoon?.dummy && G.player.target === G.tycoon.dummy) list.push(G.tycoon.dummy);
    if (G.cam.mode !== 'title') for (const e of list) {
      if (!e.alive || !e.active) continue;
      if (e.isDummy && G.t - (e.lastHitT || -9) > 3) continue;
      _v.set(e.pos.x, e.pos.y + (e.height || 4) + 1.0, e.pos.z);
      const d = cam.position.distanceTo(_v);
      if (d > 110) continue;
      _v.project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
      const b = getHB();
      const elite = !!e.def?.elite;
      const cls = 'ehb' + (elite ? ' elite' : '') + (e.raid ? ' raid' : '') + (e.isDummy ? ' dummy' : '');
      if (b.cls !== cls) { b.el.className = cls; b.cls = cls; }
      const name = elite || e.isDummy ? (e.def?.name || e.name || '') : '';
      if (b.nm.textContent !== name) b.nm.textContent = name;
      const p = clamp(e.hp / e.maxHp, 0, 1);
      if (p !== b.last) { b.f.style.width = (p * 100).toFixed(1) + '%'; b.l.style.width = (p * 100).toFixed(1) + '%'; b.last = p; }
      b.el.style.display = 'block';
      const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
      b.el.style.transform = `translate(-50%,-100%) translate(${sx | 0}px,${sy | 0}px)`;
    }
    for (let i = hbUsed; i < hbPool.length; i++) hbPool[i].el.style.display = 'none';
  }

  // ---------- leaderboard ----------
  const lbRows = $('#lb-rows');
  function updateLB() {
    const my = worldRank();
    const rows = [];
    rows.push({ n: 'O_Imperador_Bloxy', r: 1, c: '∞', col: '#ffd23f' });
    rows.push({ dots: true });
    const rnd = mulberry32(Math.floor(Math.log2(my) * 3));
    const gapUp = Math.max(1, Math.floor(my * 0.00002) + 1);
    const items = [];
    for (let i = 2; i >= 1; i--) items.push({ r: Math.max(2, my - gapUp * i - Math.floor(rnd() * gapUp)), cm: 1 + i * 0.08 });
    items.push({ me: true, r: my });
    for (let i = 1; i <= 2; i++) items.push({ r: my + gapUp * i + Math.floor(rnd() * gapUp), cm: 1 - i * 0.07 });
    for (const it of items) {
      if (it.me) rows.push({ n: 'Você (Noob)', r: my, c: fmtMoney(G.state.lifetime), me: true, col: '#f5cd30' });
      else rows.push({ n: NAMES[Math.floor(rnd() * NAMES.length)], r: it.r, c: fmtMoney(G.state.lifetime * it.cm + 10), col: AVC[Math.floor(rnd() * AVC.length)] });
    }
    lbRows.innerHTML = rows.map((r) => (r.dots ? '<div class="dots">• • •</div>' : `<div class="row ${r.me ? 'me' : ''}"><span class="n"><i class="av" style="background:${r.col}"></i>${r.n}</span><span class="r">#${r.r < 1e8 ? fmtInt(r.r) : fmtShort(r.r)}</span><span class="c">${r.c}</span></div>`)).join('');
  }
  $('#lb').addEventListener('click', () => $('#lb').classList.toggle('min'));

  // ---------- minimap ----------
  const mmC = $('#mm-c');
  const mm = mmC.getContext('2d');
  const MS = 220;
  const S = MS / (PLAY_HALF * 2);
  const bg = document.createElement('canvas');
  bg.width = bg.height = MS;
  function buildMinimapBG() {
    const src = document.createElement('canvas');
    src.width = src.height = GV;
    const sc = src.getContext('2d');
    const img = sc.createImageData(GV, GV);
    for (let i = 0; i < GV * GV; i++) {
      img.data[i * 4] = COL[i * 4] * 0.85;
      img.data[i * 4 + 1] = COL[i * 4 + 1] * 0.85;
      img.data[i * 4 + 2] = COL[i * 4 + 2] * 0.85;
      img.data[i * 4 + 3] = 255;
    }
    sc.putImageData(img, 0, 0);
    const b = bg.getContext('2d');
    const off = (-320 + PLAY_HALF) * S, size = 640 * S;
    b.imageSmoothingEnabled = true;
    b.drawImage(src, off, off, size, size);
    // river
    b.strokeStyle = '#3fa8d8';
    b.lineWidth = 15 * S + 2;
    b.lineCap = 'round';
    b.beginPath();
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 6) {
      const px = (x + PLAY_HALF) * S, pz = (riverZ(x) + PLAY_HALF) * S;
      x === -PLAY_HALF ? b.moveTo(px, pz) : b.lineTo(px, pz);
    }
    b.stroke();
    // vignette edge
    const gr = b.createRadialGradient(MS / 2, MS / 2, MS * 0.3, MS / 2, MS / 2, MS * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.45)');
    b.fillStyle = gr;
    b.fillRect(0, 0, MS, MS);
  }
  const toMM = (x, z) => [(x + PLAY_HALF) * S, (z + PLAY_HALF) * S];
  const fromMM = (px, py) => [px / S - PLAY_HALF, py / S - PLAY_HALF];
  const CAMP_COL = { slime: '#6fe35a', wolf: '#b9bec8', golem: '#3fe6d6', goblin: '#ff7a3a', captain: '#ff4a3d' };
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const corner = new THREE.Vector3();
  function drawMinimap() {
    mm.clearRect(0, 0, MS, MS);
    const arena = inArena(G.player.pos.x, G.player.pos.z);
    if (arena) {
      mm.fillStyle = '#2a2420';
      mm.fillRect(0, 0, MS, MS);
      const sc = MS / (ARENA.r * 2.6);
      const cx = MS / 2, cy = MS / 2;
      mm.fillStyle = '#5d5a52';
      mm.beginPath();
      mm.arc(cx, cy, ARENA.r * sc, 0, Math.PI * 2);
      mm.fill();
      const P = (x, z) => [cx + (x - ARENA.x) * sc, cy + (z - ARENA.z) * sc];
      if (G.boss && G.boss.alive) {
        const [bx, by] = P(G.boss.pos.x, G.boss.pos.z);
        mm.fillStyle = '#ff3a2a';
        mm.beginPath();
        mm.arc(bx, by, 9, 0, Math.PI * 2);
        mm.fill();
        mm.strokeStyle = '#ffd84a';
        mm.lineWidth = 2;
        mm.stroke();
      }
      for (const e of G.enemies.list) if (e.alive) { const [x, y] = P(e.pos.x, e.pos.z); mm.fillStyle = '#ff5a4a'; mm.fillRect(x - 3, y - 3, 6, 6); }
      const [px, py] = P(G.player.pos.x, G.player.pos.z);
      drawArrow(px, py, G.player.yaw);
      return;
    }
    mm.drawImage(bg, 0, 0);
    // base
    const [bx0, bz0] = toMM(-44, -44);
    mm.strokeStyle = '#1f9bff';
    mm.lineWidth = 2.5;
    mm.strokeRect(bx0, bz0, 88 * S, 88 * S);
    mm.fillStyle = 'rgba(31,155,255,.25)';
    mm.fillRect(bx0, bz0, 88 * S, 88 * S);
    // camps
    mm.font = 'bold 10px Fredoka, sans-serif';
    mm.textAlign = 'center';
    for (const c of G.enemies.camps) {
      const [x, y] = toMM(c.x, c.z);
      if (c.cleared) {
        mm.fillStyle = 'rgba(20,24,34,.85)';
        mm.beginPath();
        mm.arc(x, y, 8, 0, Math.PI * 2);
        mm.fill();
        mm.fillStyle = '#fff';
        mm.fillText(Math.ceil(c.timer), x, y + 3.5);
      } else {
        mm.fillStyle = CAMP_COL[c.icon] || '#fff';
        mm.strokeStyle = '#10141c';
        mm.lineWidth = 2;
        mm.beginPath();
        mm.arc(x, y, c.kind === 'goblinCamp' || c.kind === 'golem' ? 6.5 : 5, 0, Math.PI * 2);
        mm.fill();
        mm.stroke();
      }
    }
    // enemies
    for (const e of G.enemies.list) {
      if (!e.alive || !e.active) continue;
      const [x, y] = toMM(e.pos.x, e.pos.z);
      mm.fillStyle = e.raid ? '#ff2a1a' : '#ff8a7a';
      mm.fillRect(x - (e.raid ? 2.5 : 1.5), y - (e.raid ? 2.5 : 1.5), e.raid ? 5 : 3, e.raid ? 5 : 3);
    }
    // portal
    if (G.tycoon.portalActive) {
      const [x, y] = toMM(0, 35);
      mm.fillStyle = '#8aff7a';
      mm.beginPath();
      mm.arc(x, y, 4, 0, Math.PI * 2);
      mm.fill();
    }
    // mission ping
    const hp = G.missions.hintPos();
    if (hp) {
      const [x, y] = toMM(hp.x, hp.z);
      const r = 6 + ((G.t * 8) % 8);
      mm.strokeStyle = `rgba(255,216,74,${1 - ((G.t * 8) % 8) / 8})`;
      mm.lineWidth = 2.5;
      mm.beginPath();
      mm.arc(x, y, r, 0, Math.PI * 2);
      mm.stroke();
      mm.fillStyle = '#ffd84a';
      mm.beginPath();
      mm.arc(x, y, 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    // camera frustum
    plane.constant = -G.player.pos.y;
    mm.strokeStyle = 'rgba(255,255,255,.85)';
    mm.lineWidth = 1.5;
    mm.beginPath();
    let first = true;
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      ray.setFromCamera({ x: nx, y: ny }, G.camera);
      if (!ray.ray.intersectPlane(plane, corner)) continue;
      const [x, y] = toMM(corner.x, corner.z);
      first ? mm.moveTo(x, y) : mm.lineTo(x, y);
      first = false;
    }
    mm.stroke();
    const [px, py] = toMM(G.player.pos.x, G.player.pos.z);
    drawArrow(px, py, G.player.yaw);
  }
  function drawArrow(x, y, yaw) {
    mm.save();
    mm.translate(x, y);
    mm.rotate(-yaw + Math.PI);
    mm.fillStyle = '#ffd23f';
    mm.strokeStyle = '#10141c';
    mm.lineWidth = 2;
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5.5, 6);
    mm.lineTo(0, 3);
    mm.lineTo(-5.5, 6);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
  }
  mmC.addEventListener('contextmenu', (e) => e.preventDefault());
  mmC.addEventListener('mousedown', (e) => {
    if (inArena(G.player.pos.x, G.player.pos.z)) return;
    const r = mmC.getBoundingClientRect();
    const [x, z] = fromMM(e.clientX - r.left, e.clientY - r.top);
    if (e.button === 2) {
      G.player.moveTo(x, groundAt(x, z, 50), z, 0);
      G.fx.decals.add({ shape: 'marker', x, z, r: 1.6, color: 0x40ff70, dur: 0.6, additive: true });
    } else if (e.button === 0) {
      G.cam.locked = false;
      G.cam.target.set(x, groundAt(x, z, 50), z);
    }
    e.stopPropagation();
  });

  // ---------- modals ----------
  let modal = null;
  function openModal(html, id = '') {
    closeModal();
    modal = h(`<div class="modal-bg" id="${id}"><div class="modal panel">${html}</div></div>`);
    root.appendChild(modal);
    U.modalOpen = true;
    sfx('click');
    if (document.pointerLockElement) document.exitPointerLock();
    return modal;
  }
  function closeModal() {
    if (modal) modal.remove();
    modal = null;
    U.modalOpen = false;
  }
  U.closeModal = closeModal;
  U.openPause = () => {
    const m = openModal(`<h2 class="stroke">MENU</h2><div class="btns" style="flex-direction:column;align-items:stretch">
      <button class="rbtn" data-a="resume">CONTINUAR</button>
      <button class="rbtn blue" data-a="missions">MISSÕES</button>
      <button class="rbtn blue" data-a="settings">CONFIGURAÇÕES</button>
      <button class="rbtn yellow" data-a="help">CONTROLES</button>
      <button class="rbtn gray" data-a="save">SALVAR JOGO</button></div>`);
    m.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a === 'resume') closeModal();
      if (a === 'missions') U.openMissions();
      if (a === 'settings') U.openSettings();
      if (a === 'help') U.openHelp();
      if (a === 'save') { saveGame(); U.toast('Jogo salvo!', 'green'); closeModal(); }
    });
  };
  U.openMissions = () => {
    const list = MISSIONS.map((m, i) => {
      const st = i < G.state.mission ? 'done' : i === G.state.mission ? 'cur' : 'lock';
      return `<div class="m ${st}"><div class="st">${st === 'done' ? '✓' : i + 1}</div><div><div class="tt stroke-s">${m.title}</div><div class="dd">${m.desc}${m.reward.cash ? ' — Recompensa: ' + fmtMoney(m.reward.cash) : ''}</div></div></div>`;
    }).join('');
    const m = openModal(`<h2 class="stroke">MISSÕES DA FLORESTA</h2><div class="mlist">${list}</div><div class="btns"><button class="rbtn" data-a="close">FECHAR</button></div>`);
    m.addEventListener('click', (e) => { if (e.target.dataset?.a === 'close') closeModal(); });
  };
  U.openSettings = () => {
    const s = G.settings;
    const m = openModal(`<h2 class="stroke">CONFIGURAÇÕES</h2>
      <div class="row"><span>Controles</span><select id="s-k"><option value="wasd">WASD + mouse (Q F E R · C poção · Espaço Flash)</option><option value="classic">Clássico LoL (botão direito · Q W E R · D F)</option></select></div>
      <div class="row"><span>Qualidade gráfica</span><select id="s-q"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="ultra">Ultra</option></select></div>
      <div class="row"><span>Resolução automática (mantém o FPS)</span><div class="tgl ${s.autoQuality ? 'on' : ''}" data-t="autoQuality"></div></div>
      <div class="row"><span>Volume dos efeitos</span><input type="range" id="s-v" min="0" max="1" step="0.05" value="${s.sfx}"></div>
      <div class="row"><span>Tremor de tela</span><div class="tgl ${s.shake ? 'on' : ''}" data-t="shake"></div></div>
      <div class="row"><span>Mostrar FPS (F3)</span><div class="tgl ${s.showFps ? 'on' : ''}" data-t="showFps"></div></div>
      <div class="row"><span>Câmera travada no Noob (Y)</span><div class="tgl ${G.cam.locked ? 'on' : ''}" data-t="camLock"></div></div>
      <div class="btns"><button class="rbtn" data-a="close">OK</button><button class="rbtn red small" data-a="wipe">APAGAR PROGRESSO</button></div>`);
    const q = m.querySelector('#s-q');
    q.value = s.quality;
    q.addEventListener('change', () => { s.quality = q.value; G.R.setQuality(q.value); saveGame(); });
    const ks = m.querySelector('#s-k');
    ks.value = s.keymap || 'wasd';
    ks.addEventListener('change', () => { s.keymap = ks.value; U.refreshKeys(); saveGame(); U.toast('Controles: ' + keymap(s).name, 'blue'); });
    m.querySelector('#s-v').addEventListener('input', (e) => { s.sfx = +e.target.value; setVolume(s.sfx); });
    m.addEventListener('click', (e) => {
      const t = e.target.dataset?.t;
      if (t) {
        if (t === 'camLock') { G.cam.locked = !G.cam.locked; s.camLock = G.cam.locked; e.target.classList.toggle('on', G.cam.locked); }
        else { s[t] = !s[t]; e.target.classList.toggle('on', s[t]); }
        if (t === 'showFps') $('#fps').style.display = s.showFps ? 'block' : 'none';
        sfx('click');
        saveGame();
      }
      const a = e.target.dataset?.a;
      if (a === 'close') closeModal();
      if (a === 'wipe') {
        if (confirm('Apagar TODO o progresso e recomeçar do zero?')) { wipeSave(); location.reload(); }
      }
    });
  };
  U.openHelp = () => {
    const k = (x) => `<span class="kb">${x}</span>`;
    const km = keymap(G.settings);
    const L = km.labels;
    const ab = (id) => (L[id] === '␣' ? 'Espaço' : L[id]);
    const moveRows = km.move
      ? `${k('W A S D')}<span>Andar (as setas também andam)</span>
      ${k('Botão direito')}<span>Andar até o ponto / atacar inimigo</span>
      ${k('Botão esquerdo')}<span>Atacar inimigo · clicar na manivela, quadro de missões, etc.</span>`
      : `${k('Botão direito')}<span>Andar / atacar inimigo (segure para continuar andando) · setas também andam</span>
      ${k('Botão esquerdo')}<span>Clicar na manivela, quadro de missões · atacar inimigo</span>
      ${k('A')}<span>Ataque-movimento (depois clique com o esquerdo)</span>
      ${k('S')}<span>Parar</span>`;
    const m = openModal(`<h2 class="stroke">CONTROLES</h2><p style="text-align:center;margin:-4px 0 10px;font-weight:700;color:#ffe58a">Esquema: ${km.name} <span style="opacity:.75;font-weight:600">(troque em Configurações)</span></p><div class="keys">
      ${moveRows}
      ${k([ab('Q'), ab('W'), ab('E'), ab('R')].join(' '))}<span>Habilidades: Tijolo, Escudo, Avanço, Chuva — segure para mirar, solte para lançar</span>
      ${k(ab('D'))}<span>Poção de vida</span>
      ${k(ab('F'))}<span>Flash (teleporte curto)</span>
      ${k('B')}<span>Voltar para a base</span>
      ${k('1 2 3 4')}<span>Trocar de arma</span>
      ${k('V')}<span>Primeira pessoa (só dentro da base) — WASD/setas + mouse, Espaço pula, E/clique interage</span>
      ${k('Y')}<span>Travar/destravar câmera${km.move ? '' : ' · ' + k('Espaço') + ' centraliza'}</span>
      ${k('Roda')}<span>Zoom</span>
      ${k('Esc')}<span>Menu</span>
      ${k('Tab')}<span>Minimizar ranking</span>
    </div><p style="font-size:14px;color:#cdd5e6;line-height:1.4">Pise nos <b style="color:#5dff7f">botões verdes</b> para comprar melhorias. O dinheiro vai para o <b>cofre</b> — pise em <b>COLETAR</b> para pegar. Itens raros caem dos monstros da floresta. A última compra é o <b>Portal do Rei Goblin</b>!</p>
    <div class="btns"><button class="rbtn" data-a="close">ENTENDI!</button></div>`);
    m.addEventListener('click', (e) => { if (e.target.dataset?.a === 'close') closeModal(); });
  };
  U.confirmPortal = () => {
    const m = openModal(`<h2 class="stroke" style="color:#8aff7a">PORTAL DO REI GOBLIN</h2><p style="text-align:center;font-size:17px;font-weight:600">O Rei Goblin aguarda em seu trono.<br>Está pronto para a batalha?</p><p style="text-align:center;color:#ffb0a8;font-size:14px">Dica: fique fora dos círculos vermelhos! Use Flash (${keymap(G.settings).labels.F === "␣" ? "Espaço" : keymap(G.settings).labels.F}) e Avanço (E) para desviar.</p><div class="btns"><button class="rbtn red" data-a="go">ENTRAR!</button><button class="rbtn gray" data-a="no">Ainda não</button></div>`);
    m.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a === 'go') { closeModal(); G.enterArena(); }
      if (a === 'no') closeModal();
    });
  };
  U.victory = () => {
    U.confetti(90);
    const s = G.state;
    const m = openModal(`<div class="crown">👑</div><div class="big stroke">REI GOBLIN DERROTADO!</div><p style="font-weight:700;font-size:17px">Você conquistou a Floresta! Seu ranking mundial disparou.</p>
      <div class="stats"><div>Ranking Mundial<b>#${fmtInt(worldRank())}</b></div><div>Dinheiro total<b>${fmtMoney(s.lifetime)}</b></div><div>Monstros derrotados<b>${fmtInt(s.totalKills)}</b></div><div>Tempo de jogo<b>${fmtTime(s.playTime)}</b></div></div>
      <div class="next">🏜️ PRÓXIMA ÁREA: <span style="color:#ffd23f">DESERTO ESCALDANTE</span> — em breve!<br><span style="font-size:13px;opacity:.85">Ainda faltam muitos jogadores na sua frente até o #1 do planeta Terra...</span></div>
      <div class="btns"><button class="rbtn" data-a="close">CONTINUAR JOGANDO</button></div>`, 'victory');
    m.addEventListener('click', (e) => { if (e.target.dataset?.a === 'close') closeModal(); });
  };
  U.offline = (v) => {
    const m = openModal(`<h2 class="stroke">BEM-VINDO DE VOLTA!</h2><p style="text-align:center;font-size:18px;font-weight:600">Enquanto você estava fora, seus droppers geraram</p><div style="text-align:center;font-family:var(--font-title);font-size:48px;color:#5dff7f" class="stroke">+${fmtMoney(v)}</div><div class="btns"><button class="rbtn" data-a="close">COLETAR!</button></div>`);
    m.addEventListener('click', (e) => { if (e.target.dataset?.a === 'close') { closeModal(); sfx('collect'); } });
  };
  U.bossIntro = () => {
    U.announce('REI GOBLIN', 'Senhor da Floresta', 'red', 2.4);
    $('#bossbar').style.display = 'block';
  };
  U.hideBoss = () => { $('#bossbar').style.display = 'none'; };

  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest && e.target.closest('.rbtn, .ibtn, .hb-slot, #menu-btn');
    if (b && b !== U._hoverBtn) { U._hoverBtn = b; sfx('hover'); }
    if (!b) U._hoverBtn = null;
  });
  // ---------- title ----------
  U.showTitle = (hasSave, onPlay) => {
    const t = h(`<div id="title"><div class="logo">tycoon<span>bobo</span></div><div class="tag stroke-s">🌲 Tycoon da Floresta — do noob ao <span style="color:#ffd23f">#1 do planeta Terra</span></div>
      <div class="menu"><button class="rbtn" data-a="play">${hasSave ? 'CONTINUAR' : 'JOGAR'}</button>${hasSave ? '<button class="rbtn red small" data-a="new">NOVO JOGO</button>' : ''}<button class="rbtn blue small" data-a="help">COMO JOGAR</button><button class="rbtn gray small" data-a="settings">CONFIGURAÇÕES</button></div>
      <div class="foot">Protótipo • Área 1: Floresta • Feito com Three.js</div><div class="ver">v0.2 • build profissional</div></div>`);
    root.appendChild(t);
    t.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (!a) return;
      sfx('click');
      if (a === 'play') { t.classList.add('hide'); setTimeout(() => t.remove(), 600); onPlay(false); }
      if (a === 'new') { if (confirm('Começar um jogo novo? O progresso atual será apagado.')) { wipeSave(); location.reload(); } }
      if (a === 'help') U.openHelp();
      if (a === 'settings') U.openSettings();
    });
  };
  U.showHUD = () => { hud.style.display = "block"; wlRoot.style.display = "block"; hbRoot.style.display = "block"; document.getElementById("float-root").style.display = "block"; };
  document.getElementById("float-root").style.display = "none";
  wlRoot.style.display = 'none';
  hbRoot.style.display = 'none';

  // ---------- per-frame ----------
  let lbT = 0, mmT = 0, fpsT = 0, frames = 0, rankShown = 0, incomeT = 0, lastCash = 0;
  let hpLag = 1;
  U.init = () => {
    buildMinimapBG();
    U._cash = G.state.cash;
    rankShown = worldRank();
    lastCash = G.state.lifetime;
    updateLB();
  };
  U.update = (dt) => {
    const s = G.state;
    const p = G.player;
    // cash counter
    U._cash += (s.cash - U._cash) * Math.min(1, dt * 10);
    if (Math.abs(s.cash - U._cash) < 0.5) U._cash = s.cash;
    T('cash-v', fmtMoney(U._cash));
    incomeT += dt;
    if (incomeT >= 1) {
      U.income.push(s.lifetime - lastCash);
      lastCash = s.lifetime;
      if (U.income.length > 10) U.income.shift();
      incomeT = 0;
      const rate = U.income.reduce((a, b) => a + b, 0) / Math.max(1, U.income.length);
      T('cash-rate', rate >= 1 ? `+${fmtMoney(rate)}/s` : '');
    }
    for (const k in itemEls) {
      const ie = itemEls[k];
      const v = s.items[k] || 0;
      if (v !== ie.last) {
        if (ie.last >= 0 && v > ie.last) { ie.el.classList.remove('pop'); void ie.el.offsetWidth; ie.el.classList.add('pop'); }
        ie.v.textContent = v;
        ie.last = v;
      }
    }
    // rank
    const r = worldRank();
    if (r < rankShown) {
      const diff = rankShown - r;
      rankShown -= Math.max(1, Math.ceil(diff * Math.min(1, dt * 6)));
      if (rankShown < r) rankShown = r;
      const n = $('#rank-v');
      if (!n.classList.contains('up')) { n.classList.add('up'); setTimeout(() => n.classList.remove('up'), 600); }
    } else rankShown = r;
    T('rank-v', '#' + fmtInt(rankShown));
    // clock
    const night = G.sky.dayT >= NIGHT_START && G.sky.dayT < 0.97;
    const raid = G.enemies.raid && !G.enemies.raid.done;
    const ck = $('#clock');
    const cls = raid ? 'raid' : night ? 'night' : '';
    if (ck.dataset.c !== cls) { ck.className = cls + ' stroke-s'; ck.dataset.c = cls; }
    if (inArena(p.pos.x, p.pos.z)) { T('clock-i', '⚔'); T('clock-t', 'Arena do Rei Goblin'); }
    else if (raid) { T('clock-i', '⚠'); T('clock-t', `ATAQUE! Saqueadores: ${G.enemies.raidersAlive()} · Cofre ${Math.ceil(G.tycoon.vault.hp)}/${G.tycoon.vault.maxHp}`); }
    else if (night) { T('clock-i', '☾'); T('clock-t', 'Noite'); }
    else {
      T('clock-i', '☀');
      const left = (NIGHT_START - G.sky.dayT) * DAY_LEN;
      T('clock-t', G.raids.canRaid() ? `Dia · ataque ao anoitecer em ${fmtTime(left)}` : 'Dia');
    }
    // missions
    const m = G.missions.cur;
    if (m) {
      T('mt-k', `MISSÃO ${s.mission + 1}/${MISSIONS.length}`);
      T('mt-n', `${Math.min(s.missionProg, m.n)}/${m.n}`);
      T('mt-t', m.title);
      T('mt-d', m.desc);
      SW('mt-b', (Math.min(1, s.missionProg / m.n) * 100).toFixed(0) + '%');
      T('mt-h', G.missions.hintPos() ? '➜ Siga o feixe dourado / ponto no minimapa' : '');
    } else {
      T('mt-k', 'FLORESTA CONCLUÍDA');
      T('mt-t', 'Rumo ao #1!');
      T('mt-d', 'Continue enriquecendo. Novas áreas em breve!');
      SW('mt-b', '100%');
      T('mt-n', '');
      T('mt-h', '');
    }
    // abilities
    for (const k in slots) {
      const sl = slots[k];
      const a = ABILITIES[k];
      const locked = !p.abilityUnlocked(k);
      if (locked !== sl.lastL) { sl.el.classList.toggle('locked', locked); sl.lastL = locked; }
      const cd = k === 'B' ? (p.recallT >= 0 ? 4 - p.recallT : 0) : p.cd[k] || 0;
      const max = k === 'B' ? 4 : a.cd;
      const pc = cd > 0 ? (cd / max) * 100 : 0;
      if (Math.abs(pc - sl.lastP) > 0.5 || (pc === 0 && sl.lastP !== 0)) {
        sl.cd.style.setProperty('--p', pc.toFixed(1) + '%');
        sl.cd.textContent = cd > 0 && k !== 'B' ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
        if (sl.lastP > 0 && pc === 0 && !locked) { sl.el.classList.remove('flash'); void sl.el.offsetWidth; sl.el.classList.add('flash'); }
        sl.lastP = pc;
      }
      sl.el.classList.toggle('aim', p.aiming === k);
      if (k === 'D') sl.chg.textContent = s.potions;
    }
    // hp / xp
    const hpP = clamp(p.hp / p.maxHp, 0, 1);
    hpLag += (hpP - hpLag) * Math.min(1, dt * (hpP < hpLag ? 2.5 : 20));
    SW('hp-f', (hpP * 100).toFixed(1) + '%');
    SW('hp-lag', (Math.max(hpLag, hpP) * 100).toFixed(1) + '%');
    const shP = clamp(p.shield / p.maxHp, 0, 1 - hpP);
    const sh = $('#hp-sh');
    sh.style.left = (hpP * 100).toFixed(1) + '%';
    sh.style.width = (shP * 100).toFixed(1) + '%';
    $('#hp-tk').style.setProperty('--tick', `${(100 / (p.maxHp / 100)).toFixed(2)}%`);
    T('hp-t', `${Math.ceil(p.hp)} / ${p.maxHp}` + (p.shield > 0 ? ` (+${Math.ceil(p.shield)})` : ''));
    SW('xp-f', (s.level >= MAX_LEVEL ? 100 : (s.xp / XP_TABLE(s.level)) * 100).toFixed(1) + '%');
    T('lvl', s.level);
    const w = p.weapon;
    const statsH = `<span>⚔ <b>${Math.round(p.attackDamage)}</b></span><span>⚡ <b>${p.attackSpeed.toFixed(2)}</b></span><span>➹ <b>${w.range}</b></span><span>👟 <b>${Math.round(p.moveSpeed)}</b></span>`;
    if (statsH !== U._statsH) { U._statsH = statsH; EL("stats").innerHTML = statsH; }
    EL("xhair").style.display = G.cam.mode === "fp" ? "block" : "none";
    // hotbar
    const owned = G.tycoon.ownedWeapons();
    for (let i = 0; i < 4; i++) {
      const id = owned[i];
      const e = hbSlots[i];
      const want = id || '';
      if (e.dataset.w !== want) {
        e.dataset.w = want;
        e.querySelector('.ic').innerHTML = id ? ICON[id] : '';
        e.classList.toggle('empty', !id);
      }
      e.classList.toggle('sel', id === s.weapon);
    }
    T('hb-name', WEAPONS[s.weapon]?.name || '');
    // channel
    if (chDur > 0) {
      chT += dt;
      SW('ch-b', Math.min(100, (chT / chDur) * 100) + '%');
    }
    // boss
    if (G.boss && G.boss.alive && G.boss.engaged) {
      const b = G.boss;
      const bp = clamp(b.hp / b.maxHp, 0, 1);
      SW('bb-f', (bp * 100).toFixed(2) + '%');
      SW('bb-l', (bp * 100).toFixed(2) + '%');
      T('bb-t', `${fmtInt(Math.ceil(b.hp))} / ${fmtInt(b.maxHp)}`);
      const ph = $('#bossbar').querySelectorAll('.ph b');
      ph.forEach((e, i) => e.classList.toggle('on', i < b.phase));
    }
    // death
    const de = $('#death');
    if (p.dead) {
      de.style.display = 'grid';
      T('death-t', `Renascendo na base em ${Math.ceil(p.respawnT)}...`);
    } else de.style.display = 'none';
    // post fx
    dmgPulse = Math.max(0, dmgPulse - dt * 1.6);
    const lowHp = !p.dead && hpP < 0.3 ? (0.3 - hpP) * 1.2 * (0.6 + 0.4 * Math.sin(G.t * 6)) : 0;
    G.R.grade.uniforms.uDamage.value = Math.max(dmgPulse, lowHp);
    const desT = p.dead ? 1 : 0;
    G.R.grade.uniforms.uDesat.value += (desT - G.R.grade.uniforms.uDesat.value) * Math.min(1, dt * 3);
    // world labels, health bars
    updateLabels();
    updateHB();
    lbT -= dt;
    if (lbT <= 0) { lbT = 2; updateLB(); }
    mmT -= dt;
    if (mmT <= 0) { mmT = 1 / 20; drawMinimap(); }
    // fps
    frames++;
    fpsT += G.realDt;
    if (fpsT >= 0.5) {
      if (G.settings.showFps) {
        const info = G.R.renderer.info;
        T('fps', `${Math.round(frames / fpsT)} FPS · ${info.render.calls} draws · ${(info.render.triangles / 1000).toFixed(0)}k tris · res ${(G.R.resScale * 100).toFixed(0)}%`);
      }
      frames = 0;
      fpsT = 0;
    }
    // target frame (hovered enemy first, then current target)
    {
      const tg = G.hover || (p.target && (p.target.alive || p.target.isDummy) ? p.target : null);
      const fr = EL('target');
      const show = tg && !(tg.isBoss && G.boss?.engaged) && G.cam.mode === 'moba';
      if (show) {
        if (fr._s !== 1) { fr.style.display = 'block'; fr._s = 1; }
        const name = tg.def?.name || tg.name || '';
        T('tg-n', name);
        const tag = tg.isDummy ? 'TREINO' : tg.isBoss ? 'CHEFE' : tg.raid ? 'SAQUEADOR' : tg.def?.elite ? 'ELITE' : 'FLORESTA';
        const tcls = 'tg-tag ' + (tg.isBoss ? 'boss' : tg.raid ? 'raid' : tg.def?.elite ? 'elite' : '');
        const te = EL('tg-tag');
        if (te._c !== tcls) { te._c = tcls; te.className = tcls; }
        T('tg-tag', tag);
        const hp = tg.isDummy ? 1 : clamp(tg.hp / tg.maxHp, 0, 1);
        SW('tg-f', (hp * 100).toFixed(1) + '%');
        SW('tg-l', (hp * 100).toFixed(1) + '%');
        T('tg-t', tg.isDummy ? '∞' : `${fmtInt(Math.ceil(tg.hp))} / ${fmtInt(tg.maxHp)}`);
      } else if (fr._s !== 0) { fr.style.display = 'none'; fr._s = 0; }
    }
    // offscreen objective arrow
    {
      const ga = EL('guide-arrow');
      const hpos = G.missions.hintPos();
      let show = false;
      if (hpos && G.cam.mode === 'moba' && !G.inArena && !p.dead) {
        _v.set(hpos.x, hpos.y + 2, hpos.z).project(G.camera);
        const behind = _v.z > 1;
        const W = innerWidth, H = innerHeight;
        let sx = _v.x, sy = -_v.y;
        if (behind) { sx = -sx; sy = -sy; }
        const off = behind || Math.abs(sx) > 0.92 || Math.abs(sy) > 0.85;
        if (off) {
          show = true;
          const ang = Math.atan2(sy, sx);
          const mx = W / 2 - 70, my = H / 2 - 110;
          const tt = Math.min(mx / Math.max(Math.abs(Math.cos(ang)), 1e-3), my / Math.max(Math.abs(Math.sin(ang)), 1e-3));
          const ex = W / 2 + Math.cos(ang) * tt, ey = H / 2 + Math.sin(ang) * tt;
          ga.style.transform = `translate(${ex | 0}px,${ey | 0}px)`;
          ga.firstElementChild.style.transform = `rotate(${(ang + Math.PI / 2).toFixed(3)}rad)`;
          T('ga-d', Math.round(Math.hypot(hpos.x - p.pos.x, hpos.z - p.pos.z)) + 'm');
        }
      }
      if (show !== ga._s) { ga.style.display = show ? 'block' : 'none'; ga._s = show; }
    }
    G.R.grade.uniforms.uCA.value = Math.min(1.2, dmgPulse * 1.6);
    // keys
    if (input.hit('Escape')) {
      if (U.modalOpen) closeModal();
      else if (G.cam.mode === 'fp') G.toggleFP();
      else U.openPause();
    }
    if (input.hit('F3')) { G.settings.showFps = !G.settings.showFps; $('#fps').style.display = G.settings.showFps ? 'block' : 'none'; }
    if (input.hit('Tab')) $('#lb').classList.toggle('min');
    $('#b-lock').classList.toggle('on', G.cam.locked);
    $('#b-fp').classList.toggle('on', G.cam.mode === 'fp');
  };
  const applyScale = () => {
    const s = clamp(Math.min(innerHeight / 880, innerWidth / 1480), 0.58, 1);
    document.documentElement.style.setProperty("--s", s.toFixed(3));
  };
  addEventListener("resize", applyScale);
  applyScale();
  if (G.settings.showFps) $('#fps').style.display = 'block';
  return U;
}
