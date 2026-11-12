// Shared world layout data for the Forest area.
import { distToSegment } from '../util.js';

export const WORLD_HALF = 320;
export const PLAY_HALF = 262; // walkable bounds
export const WATER_Y = -1.25;
export const RIVER_HW = 7.5;
export const PLOT_HALF = 44;
export const ARENA = { x: 0, z: -900, r: 34, y: 0 };

export function riverZ(x) {
  return -116 + 22 * Math.sin(x * 0.017 + 0.6) + 9 * Math.sin(x * 0.043 + 2.0);
}

export const CAMPS = [
  { id: 'slime1', name: 'Gosmas da Clareira', x: -82, z: -24, r: 13, kind: 'slime', respawn: 40, icon: 'slime' },
  { id: 'slime2', name: 'Gosmas do Riacho', x: 84, z: 46, r: 13, kind: 'slime', respawn: 40, icon: 'slime' },
  { id: 'wolf1', name: 'Toca dos Lobos', x: 150, z: -40, r: 15, kind: 'wolf', respawn: 60, icon: 'wolf' },
  { id: 'wolf2', name: 'Matilha do Leste', x: 168, z: 96, r: 15, kind: 'wolf', respawn: 60, icon: 'wolf' },
  { id: 'golem', name: 'Pântano de Musgo', x: -182, z: 44, r: 18, kind: 'golem', respawn: 150, icon: 'golem' },
  { id: 'goblin1', name: 'Patrulha Goblin', x: -128, z: -176, r: 16, kind: 'goblin', respawn: 70, icon: 'goblin' },
  { id: 'goblin2', name: 'Acampamento Goblin', x: 52, z: -196, r: 24, kind: 'goblinCamp', respawn: 75, icon: 'captain' },
];

export const BRIDGES = [
  { x: 0, w: 9 },
  { x: -112, w: 8 },
];

// dirt paths (polylines)
export const PATHS = [
  // north gate -> main bridge -> goblin camp
  [[0, -44], [0, -70], [2, -86], [0, riverZ(0) + 14], [0, riverZ(0) - 14], [14, -140], [34, -170], [52, -192]],
  // bridge -> goblin patrol
  [[14, -140], [-40, -150], [-90, -165], [-128, -176]],
  // west gate -> slimes -> golem swamp
  [[-44, 0], [-62, -8], [-82, -24], [-120, -4], [-150, 22], [-182, 44]],
  // east gate -> slimes2 -> wolves
  [[44, 0], [62, 18], [84, 46], [120, 40], [150, 10], [150, -40]],
  [[120, 40], [150, 70], [168, 96]],
  // south gate loop
  [[0, 44], [0, 70], [-30, 96], [-70, 100], [-110, 70], [-150, 22]],
  [[0, 70], [40, 96], [90, 100], [130, 90], [168, 96]],
  // second bridge north-west
  [[-62, -8], [-90, -60], [-112, riverZ(-112) + 14], [-112, riverZ(-112) - 14], [-128, -176]],
];

export function pathDist(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const d = distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

export function biomeAt(x, z) {
  // returns weights { swamp, pine }
  const swamp = Math.max(0, Math.min(1, (-x - 120) / 50)) * Math.max(0, Math.min(1, 1 - Math.abs(z - 40) / 120));
  const north = Math.max(0, Math.min(1, (-z - 90) / 60));
  return { swamp, north };
}

export const SIGNS = [
  { x: -8, z: -60, text: 'Acampamento Goblin ↑', rot: 0 },
  { x: -54, z: -14, text: '← Gosmas / Pântano', rot: 0 },
  { x: 54, z: 12, text: 'Lobos →', rot: 0 },
];
