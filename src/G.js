// Global game hub — every system registers itself here.
export const G = {
  t: 0, // game time (s)
  dt: 0,
  realDt: 0,
  frame: 0,
  started: false,
  paused: false,
  timeScale: 1,
  hitStop: 0,
  _ev: new Map(),
  on(ev, fn) {
    if (!this._ev.has(ev)) this._ev.set(ev, []);
    this._ev.get(ev).push(fn);
  },
  emit(ev, a, b, c) {
    const l = this._ev.get(ev);
    if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c);
  },
  state: null,
  settings: null,
};

export const ITEM_IDS = ['gosma', 'couro', 'dente', 'nucleo', 'estandarte'];

export function defaultState() {
  return {
    v: 1,
    cash: 0,
    lifetime: 0,
    vault: 0,
    purchased: [],
    items: { gosma: 0, couro: 0, dente: 0, nucleo: 0, estandarte: 0 },
    mission: 0,
    missionProg: 0,
    level: 1,
    xp: 0,
    weapon: 'punhos',
    kills: {},
    totalKills: 0,
    bossKills: 0,
    raidsWon: 0,
    dayT: 0.08,
    playTime: 0,
    lastSave: Date.now(),
    potions: 3,
  };
}

export function defaultSettings() {
  return {
    quality: 'high',
    sfx: 0.8,
    camLock: true,
    showFps: false,
    shake: true,
    autoQuality: true,
    keymap: 'wasd',
  };
}
