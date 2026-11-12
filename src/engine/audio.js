// Fully synthesized sound effects (WebAudio) — no audio files.
import { G } from '../G.js';

let ctx = null, master = null, noiseBuf = null, comp = null;
const last = new Map();
const listener = { x: 0, z: 0 };

export function initAudio() {
  const unlock = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      master = ctx.createGain();
      master.gain.value = G.settings?.sfx ?? 0.8;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
}
export function setVolume(v) {
  if (master) master.gain.value = v;
}
export function setListener(x, z) {
  listener.x = x;
  listener.z = z;
}

function env(g, t, a, peak, d, sustain = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}
function out(vol, pan = 0) {
  const g = ctx.createGain();
  g.gain.value = vol;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(master);
  } else g.connect(master);
  return g;
}
function osc(dest, type, f0, f1, t, dur, vol, a = 0.005) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  const g = ctx.createGain();
  env(g, t, a, vol, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}
function noise(dest, t, dur, vol, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.003) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, vol, dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  const off = Math.random() * 0.5;
  s.start(t, off);
  s.stop(t + a + dur + 0.05);
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SFX = {
  click(d, t) { osc(d, 'sine', 900, 1300, t, 0.05, 0.35); },
  hover(d, t) { osc(d, 'sine', 1400, 1600, t, 0.025, 0.08); },
  buy(d, t) {
    [72, 76, 79, 84].forEach((n, i) => osc(d, 'square', NOTE(n), NOTE(n), t + i * 0.06, 0.12, 0.12));
    [96, 100].forEach((n, i) => osc(d, 'triangle', NOTE(n), NOTE(n), t + 0.24 + i * 0.05, 0.25, 0.15));
    noise(d, t + 0.2, 0.3, 0.06, 'highpass', 6000, 9000, 0.5);
  },
  cant(d, t) { osc(d, 'square', 150, 120, t, 0.12, 0.18); osc(d, 'square', 150, 110, t + 0.15, 0.14, 0.18); },
  collect(d, t) {
    for (let i = 0; i < 6; i++) osc(d, 'triangle', NOTE(84 + i * 2 + ((Math.random() * 3) | 0)), NOTE(86 + i * 2), t + i * 0.045, 0.14, 0.18);
    noise(d, t, 0.35, 0.05, 'highpass', 7000, 9000, 0.5);
  },
  crank(d, t) { noise(d, t, 0.05, 0.4, 'bandpass', 2500, 1200, 4); osc(d, 'square', 220, 90, t + 0.02, 0.07, 0.15); noise(d, t + 0.07, 0.04, 0.25, 'bandpass', 3000, 1800, 5); },
  drop(d, t) { osc(d, 'sine', 260, 70, t, 0.09, 0.35); noise(d, t, 0.04, 0.12, 'lowpass', 900, 400, 1); },
  sell(d, t) { noise(d, t, 0.18, 0.12, 'highpass', 3000, 6000, 0.7); osc(d, 'sine', 1568, 1568, t + 0.02, 0.12, 0.12); osc(d, 'sine', 2349, 2349, t + 0.07, 0.15, 0.1); },
  upgrade(d, t) { osc(d, 'sawtooth', 300, 1400, t, 0.12, 0.08); osc(d, 'sine', 1200, 2000, t + 0.05, 0.1, 0.12); },
  swing(d, t) { noise(d, t, 0.16, 0.35, 'bandpass', 500, 2200, 1.6, 0.02); },
  punch(d, t) { osc(d, 'sine', 140, 50, t, 0.1, 0.5); noise(d, t, 0.05, 0.25, 'lowpass', 1800, 500, 1); },
  hit(d, t) { osc(d, 'sine', 210, 70, t, 0.1, 0.45); noise(d, t, 0.07, 0.35, 'bandpass', 1600, 600, 1.2); },
  crit(d, t) { SFX.hit(d, t); osc(d, 'square', 1200, 1800, t + 0.02, 0.08, 0.12); },
  bow(d, t) { osc(d, 'triangle', 320, 170, t, 0.16, 0.35); noise(d, t, 0.06, 0.15, 'highpass', 3000, 5000, 1); },
  arrowHit(d, t) { noise(d, t, 0.05, 0.3, 'bandpass', 2500, 1200, 3); osc(d, 'sine', 300, 120, t, 0.05, 0.2); },
  magic(d, t) { osc(d, 'sine', 600, 1500, t, 0.18, 0.18); osc(d, 'triangle', 900, 2200, t + 0.03, 0.16, 0.08); noise(d, t, 0.2, 0.06, 'highpass', 5000, 9000, 1); },
  brick(d, t) { noise(d, t, 0.06, 0.4, 'bandpass', 1400, 900, 2.5); osc(d, 'square', 330, 160, t, 0.05, 0.12); },
  shield(d, t) { [64, 68, 71, 76].forEach((n, i) => osc(d, 'triangle', NOTE(n), NOTE(n + 12), t + i * 0.035, 0.3, 0.12)); },
  dash(d, t) { noise(d, t, 0.22, 0.4, 'bandpass', 3000, 400, 1.2, 0.01); osc(d, 'sine', 500, 200, t, 0.15, 0.12); },
  ult(d, t) {
    osc(d, 'sawtooth', 70, 40, t, 1.0, 0.25, 0.05);
    for (let i = 0; i < 6; i++) osc(d, 'sine', 1800 - i * 120, 300, t + 0.1 + i * 0.12, 0.5, 0.05);
  },
  enemyDie(d, t) {
    osc(d, 'square', 520, 180, t, 0.16, 0.12);
    for (let i = 0; i < 5; i++) noise(d, t + 0.05 + i * 0.05 + Math.random() * 0.03, 0.04, 0.25, 'bandpass', 1200 + Math.random() * 1500, 800, 3);
  },
  playerDie(d, t) {
    osc(d, 'sine', 620, 140, t, 0.45, 0.4);
    osc(d, 'triangle', 310, 70, t + 0.05, 0.5, 0.15);
    for (let i = 0; i < 6; i++) noise(d, t + 0.2 + i * 0.06, 0.05, 0.25, 'bandpass', 1400 + Math.random() * 900, 900, 3);
  },
  levelup(d, t) {
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => osc(d, 'square', NOTE(n), NOTE(n), t + i * 0.055, 0.2, 0.09));
    osc(d, 'triangle', NOTE(84), NOTE(96), t + 0.4, 0.6, 0.18);
    noise(d, t + 0.35, 0.7, 0.05, 'highpass', 6000, 10000, 0.5);
  },
  loot(d, t) { osc(d, 'sine', 900, 1500, t, 0.08, 0.22); },
  coin(d, t) { osc(d, 'square', NOTE(88), NOTE(88), t, 0.05, 0.08); osc(d, 'square', NOTE(95), NOTE(95), t + 0.05, 0.12, 0.08); },
  item(d, t) { osc(d, 'triangle', NOTE(79), NOTE(79), t, 0.12, 0.2); osc(d, 'triangle', NOTE(86), NOTE(86), t + 0.08, 0.25, 0.2); },
  raid(d, t) {
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.9;
      osc(d, 'sawtooth', 196, 185, tt, 0.75, 0.22, 0.06);
      osc(d, 'sawtooth', 294, 280, tt, 0.75, 0.12, 0.06);
    }
  },
  build(d, t) {
    noise(d, t, 0.25, 0.25, 'bandpass', 400, 2400, 1, 0.02);
    osc(d, 'sine', 130, 45, t + 0.25, 0.25, 0.55);
    for (let i = 0; i < 4; i++) noise(d, t + 0.3 + i * 0.05, 0.04, 0.18, 'bandpass', 1600 + Math.random() * 800, 900, 3);
  },
  portal(d, t) { osc(d, 'sine', 110, 220, t, 1.2, 0.2, 0.2); osc(d, 'sine', 165, 330, t, 1.2, 0.15, 0.2); noise(d, t, 1.2, 0.08, 'bandpass', 300, 2000, 2, 0.3); },
  teleport(d, t) { osc(d, 'sine', 200, 1600, t, 0.5, 0.25); noise(d, t, 0.5, 0.12, 'bandpass', 500, 6000, 1.5); },
  roar(d, t) {
    osc(d, 'sawtooth', 95, 55, t, 1.3, 0.35, 0.08);
    osc(d, 'sawtooth', 120, 70, t, 1.3, 0.25, 0.08);
    noise(d, t, 1.3, 0.3, 'lowpass', 900, 300, 1, 0.08);
  },
  slam(d, t) { osc(d, 'sine', 90, 28, t, 0.55, 0.9); noise(d, t, 0.45, 0.5, 'lowpass', 1200, 120, 1); },
  warn(d, t) { osc(d, 'square', 880, 880, t, 0.05, 0.06); },
  recall(d, t) { for (let i = 0; i < 8; i++) osc(d, 'sine', NOTE(72 + i * 2), NOTE(74 + i * 2), t + i * 0.12, 0.3, 0.06); },
  heal(d, t) { osc(d, 'sine', NOTE(76), NOTE(83), t, 0.4, 0.15); osc(d, 'sine', NOTE(83), NOTE(88), t + 0.1, 0.4, 0.1); },
  step(d, t) { noise(d, t, 0.035, 0.05, 'lowpass', 600, 300, 1); },
  turret(d, t) { osc(d, 'square', 700, 300, t, 0.1, 0.1); noise(d, t, 0.08, 0.15, 'bandpass', 2500, 900, 2); },
  mission(d, t) {
    [67, 71, 74, 79].forEach((n, i) => osc(d, 'triangle', NOTE(n), NOTE(n), t + i * 0.09, 0.22, 0.2));
    osc(d, 'sine', NOTE(91), NOTE(91), t + 0.36, 0.5, 0.15);
  },
  notify(d, t) { osc(d, 'sine', 700, 1050, t, 0.08, 0.18); },
  bird(d, t) {
    const b = 2400 + Math.random() * 1500;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) osc(d, 'sine', b, b * (1.2 + Math.random() * 0.3), t + i * 0.09, 0.06, 0.05);
  },
  cricket(d, t) { for (let i = 0; i < 3; i++) osc(d, 'square', 4300, 4300, t + i * 0.05, 0.025, 0.02); },
  whoosh(d, t) { noise(d, t, 0.35, 0.2, 'bandpass', 300, 1500, 1.2, 0.08); },
  growl(d, t) { osc(d, 'sawtooth', 110, 80, t, 0.35, 0.12, 0.04); noise(d, t, 0.3, 0.1, 'lowpass', 600, 200, 1, 0.04); },
  squish(d, t) { osc(d, 'sine', 300, 600, t, 0.08, 0.25); noise(d, t, 0.06, 0.12, 'lowpass', 900, 400, 1); },
  vault(d, t) { osc(d, 'square', 160, 140, t, 0.08, 0.2); noise(d, t, 0.08, 0.3, 'bandpass', 900, 500, 2); },
};

const MIN_GAP = { sell: 0.05, drop: 0.04, hit: 0.03, step: 0.08, coin: 0.03, upgrade: 0.06, loot: 0.04, crank: 0.05, warn: 0.15, arrowHit: 0.03, turret: 0.08 };

export function sfx(name, o = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const now = ctx.currentTime;
  const gap = MIN_GAP[name] ?? 0.02;
  if (now - (last.get(name) || 0) < gap) return;
  last.set(name, now);
  let vol = o.vol ?? 1;
  let pan = 0;
  if (o.x !== undefined) {
    const dx = o.x - listener.x, dz = o.z - listener.z;
    const d = Math.hypot(dx, dz);
    const range = o.range ?? 70;
    if (d > range) return;
    vol *= 1 - d / range;
    pan = (dx / range) * 1.2;
  }
  if (vol < 0.02) return;
  fn(out(vol, pan), now + (o.delay || 0));
}

// ---------------- ambience beds (procedural wind + river) ----------------
let amb = null;
function startAmbience() {
  const mk = (type, freq, q) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.5 + Math.random() * 0.1;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start();
    return { s, f, g };
  };
  amb = { wind: mk('bandpass', 420, 0.7), river: mk('lowpass', 650, 0.4), t: 0 };
}
export function updateAmbience(dt, o) {
  if (!ctx || ctx.state !== 'running') return;
  if (!amb) startAmbience();
  const now = ctx.currentTime;
  amb.t += dt;
  const gust = 0.55 + 0.45 * Math.max(0, Math.sin(amb.t * 0.31) * Math.sin(amb.t * 0.17 + 1.3));
  amb.wind.g.gain.setTargetAtTime(o.wind * gust * 0.05, now, 0.6);
  amb.wind.f.frequency.setTargetAtTime(330 + 260 * gust, now, 0.8);
  amb.river.g.gain.setTargetAtTime(o.river * 0.085, now, 0.4);
}
SFX.crackle = (d, t) => {
  for (let i = 0; i < 4; i++) noise(d, t + Math.random() * 0.25, 0.015 + Math.random() * 0.02, 0.12 + Math.random() * 0.12, 'highpass', 1800 + Math.random() * 2500, 2000, 1);
};
