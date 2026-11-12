// Game data: weapons, items, enemy archetypes, abilities, missions.

export const WEAPONS = {
  punhos: { id: 'punhos', name: 'Punhos', dmg: 9, as: 1.5, range: 3.4, style: 'punch', ranged: false, hold: false, desc: 'Socos de noob. Melhor que nada!' },
  espada: { id: 'espada', name: 'Espada de Madeira', dmg: 21, as: 1.25, range: 4.4, style: 'swing', ranged: false, hold: true, desc: 'Lâmina de madeira firme. Clássico.' },
  arco: { id: 'arco', name: 'Arco do Caçador', dmg: 27, as: 1.05, range: 21, style: 'shoot', ranged: true, hold: true, proj: 'arrow', desc: 'Ataca de longe. Kite os inimigos!' },
  runica: { id: 'runica', name: 'Lâmina Rúnica', dmg: 72, as: 1.15, range: 5.2, style: 'swing', ranged: false, hold: true, cleave: 0.6, cleaveR: 5.5, desc: 'Lâmina ancestral. Golpes atingem em área.' },
};
export const WEAPON_ORDER = ['punhos', 'espada', 'arco', 'runica'];

export const ITEMS = {
  gosma: { name: 'Gosma', color: '#6fe35a', dark: '#2f8f2a' },
  couro: { name: 'Couro de Lobo', color: '#b9835a', dark: '#6b4428' },
  dente: { name: 'Dente de Goblin', color: '#f4ecd0', dark: '#9c8f63' },
  nucleo: { name: 'Núcleo de Musgo', color: '#3fe6d6', dark: '#127a72' },
  estandarte: { name: 'Estandarte Goblin', color: '#ff4a3d', dark: '#8a1a14' },
};

export const ABILITIES = {
  Q: { key: 'Q', name: 'Tijolo Arremessado', cd: 5, desc: 'Arremessa um tijolo que atravessa inimigos. Dano: 35 + 110% da arma.', unlock: 'totemQ', cast: 'line', range: 24 },
  W: { key: 'W', name: 'Escudo de Blocos', cd: 14, desc: 'Blocos orbitam você: escudo de 50 + 12/nível por 3,5s e +35% velocidade.', unlock: 'totemW', cast: 'self' },
  E: { key: 'E', name: 'Avanço', cd: 9, desc: 'Avança na direção do cursor, causando 30 + 70% da arma em quem atravessar.', unlock: 'totemE', cast: 'line', range: 11 },
  R: { key: 'R', name: 'Chuva de Tijolos', cd: 55, desc: 'Tijolos caem do céu numa área por 2,2s: 240 + 300% da arma de dano total e lentidão.', unlock: 'totemR', cast: 'area', range: 26, radius: 9 },
  D: { key: 'D', name: 'Poção de Vida', cd: 1, desc: 'Cura 45% da vida em 4s. Recarrega na base.', cast: 'self' },
  F: { key: 'F', name: 'Flash', cd: 45, desc: 'Teleporta uma curta distância na direção do cursor.', cast: 'line', range: 9 },
  B: { key: 'B', name: 'Voltar à Base', cd: 0, desc: 'Canaliza por 4s e volta para a base.', cast: 'self' },
};

// enemy archetypes
export const ENEMIES = {
  gosminha: { name: 'Gosminha', hp: 34, dmg: 5, as: 0.9, range: 2.6, speed: 9, radius: 1.0, xp: 9, cash: 6, loot: [['gosma', 0.55, 1]], aggro: 13, model: 'slime', size: 1.6 },
  gosma: { name: 'Gosma Grande', hp: 95, dmg: 9, as: 0.8, range: 3.2, speed: 8, radius: 1.6, xp: 22, cash: 14, loot: [['gosma', 1, 2]], aggro: 14, model: 'slime', size: 2.6, split: 'gosminha' },
  lobo: { name: 'Lobo', hp: 150, dmg: 13, as: 1.25, range: 3.2, speed: 14, radius: 1.3, xp: 34, cash: 22, loot: [['couro', 0.7, 1]], aggro: 17, model: 'wolf' },
  loboAlfa: { name: 'Lobo Alfa', hp: 380, dmg: 22, as: 1.1, range: 3.8, speed: 15, radius: 1.8, xp: 80, cash: 55, loot: [['couro', 1, 2]], aggro: 18, model: 'wolf', scale: 1.45, alpha: true },
  goblin: { name: 'Goblin', hp: 240, dmg: 18, as: 1.0, range: 3.8, speed: 12, radius: 1.1, xp: 48, cash: 38, loot: [['dente', 0.6, 1]], aggro: 18, model: 'goblin', weapon: 'clava' },
  arqueiro: { name: 'Goblin Arqueiro', hp: 170, dmg: 15, as: 0.8, range: 19, speed: 11, radius: 1.1, xp: 48, cash: 38, loot: [['dente', 0.6, 1]], aggro: 22, model: 'goblin', weapon: 'arcoGoblin', ranged: true },
  capitao: { name: 'Capitão Goblin', hp: 1100, dmg: 34, as: 0.8, range: 4.6, speed: 12, radius: 1.8, xp: 260, cash: 320, loot: [['estandarte', 1, 1], ['dente', 1, 3]], aggro: 20, model: 'goblin', weapon: 'machado', scale: 1.35, elite: true, slam: true },
  golem: { name: 'Golem de Musgo', hp: 1600, dmg: 42, as: 0.55, range: 5.5, speed: 7.5, radius: 3.0, xp: 360, cash: 420, loot: [['nucleo', 1, 2]], aggro: 20, model: 'golem', elite: true, slam: true },
  raider: { name: 'Saqueador Goblin', hp: 200, dmg: 15, as: 1.0, range: 3.8, speed: 11, radius: 1.1, xp: 30, cash: 25, loot: [['dente', 0.3, 1]], aggro: 16, model: 'goblin', weapon: 'clava', raider: true },
  raiderLobo: { name: 'Lobo Saqueador', hp: 160, dmg: 12, as: 1.2, range: 3.2, speed: 14, radius: 1.3, xp: 25, cash: 20, loot: [['couro', 0.3, 1]], aggro: 16, model: 'wolf', raider: true },
  rei: { name: 'Rei Goblin', hp: 9000, dmg: 55, as: 0.7, range: 7, speed: 10, radius: 4.2, xp: 2000, cash: 25000, loot: [], aggro: 999, model: 'king', boss: true },
  minion: { name: 'Guarda Real', hp: 260, dmg: 16, as: 1.0, range: 3.8, speed: 13, radius: 1.1, xp: 20, cash: 30, loot: [['dente', 0.3, 1]], aggro: 99, model: 'goblin', weapon: 'clava' },
};

export const CAMP_SPAWNS = {
  slime: [['gosma', 0, 0], ['gosminha', 4, 3], ['gosminha', -4, 2.5], ['gosminha', 1, -4]],
  wolf: [['loboAlfa', 0, 0], ['lobo', 4.5, 2], ['lobo', -4.5, 2]],
  goblin: [['goblin', 0, 0], ['goblin', 4, 3], ['arqueiro', -4, -3]],
  goblinCamp: [['capitao', 0, -4], ['goblin', 6, 2], ['goblin', -6, 2], ['arqueiro', 8, -8], ['arqueiro', -8, -8]],
  golem: [['golem', 0, 0]],
};

export const XP_TABLE = (lvl) => Math.round(60 + 55 * Math.pow(lvl - 1, 1.45));
export const MAX_LEVEL = 18;

// missions: type: 'crank'|'collect'|'buy'|'kill'|'killAny'|'cash'|'raid'|'item'|'boss'
export const MISSIONS = [
  { id: 'm1', title: 'Gire a Manivela', desc: 'Clique no botão vermelho do Dropper Manual 10 vezes.', type: 'crank', n: 10, reward: { cash: 10 }, hint: 'crank' },
  { id: 'm2', title: 'Pegue seu Dinheiro', desc: 'Pise no botão COLETAR para pegar o dinheiro do cofre.', type: 'collect', n: 1, reward: { cash: 15 }, hint: 'collect' },
  { id: 'm3', title: 'Automatize!', desc: 'Compre o Dropper de Madeira #1.', type: 'buy', target: 'd1', n: 1, reward: { cash: 25 }, hint: 'buy:d1' },
  { id: 'm4', title: 'Caçada de Gosmas', desc: 'Saia da base e derrote 4 Gosmas a oeste.', type: 'kill', target: ['gosma', 'gosminha'], n: 4, reward: { cash: 60, xp: 40 }, hint: 'camp:slime1' },
  { id: 'm5', title: 'Arme-se', desc: 'Compre a Espada de Madeira no Arsenal (usa Gosma).', type: 'buy', target: 'espada', n: 1, reward: { cash: 80 }, hint: 'buy:espada' },
  { id: 'm6', title: 'Linha de Produção', desc: 'Compre o Lavador de Minério.', type: 'buy', target: 'u1', n: 1, reward: { cash: 150 }, hint: 'buy:u1' },
  { id: 'm7', title: 'Expandir a Base', desc: 'Construa o 1º Andar da sua base.', type: 'buy', target: 'andar1', n: 1, reward: { cash: 400, xp: 80 }, hint: 'buy:andar1' },
  { id: 'm8', title: 'A Matilha', desc: 'Derrote 5 Lobos a leste.', type: 'kill', target: ['lobo', 'loboAlfa'], n: 5, reward: { cash: 600, xp: 120 }, hint: 'camp:wolf1' },
  { id: 'm9', title: 'Defenda a Base', desc: 'Sobreviva a um ataque noturno à sua base.', type: 'raid', n: 1, reward: { cash: 900, xp: 150 }, hint: 'raid' },
  { id: 'm10', title: 'Território Goblin', desc: 'Atravesse a ponte ao norte e derrote 8 Goblins.', type: 'kill', target: ['goblin', 'arqueiro'], n: 8, reward: { cash: 1800, xp: 250 }, hint: 'camp:goblin1' },
  { id: 'm11', title: 'O Gigante do Pântano', desc: 'Derrote o Golem de Musgo no pântano a oeste.', type: 'kill', target: ['golem'], n: 1, reward: { cash: 3000, xp: 300 }, hint: 'camp:golem' },
  { id: 'm12', title: 'Ataque ao Acampamento', desc: 'Derrote o Capitão Goblin e pegue o Estandarte.', type: 'kill', target: ['capitao'], n: 1, reward: { cash: 6000, xp: 400 }, hint: 'camp:goblin2' },
  { id: 'm13', title: 'Construa o Terraço', desc: 'Expanda sua base com o Terraço.', type: 'buy', target: 'terraco', n: 1, reward: { cash: 5000 }, hint: 'buy:terraco' },
  { id: 'm14', title: 'O Portal', desc: 'Compre o Portal do Rei Goblin — a última compra da Floresta.', type: 'buy', target: 'portal', n: 1, reward: { cash: 0, xp: 300 }, hint: 'buy:portal' },
  { id: 'm15', title: 'Destrone o Rei', desc: 'Entre no portal e derrote o Rei Goblin!', type: 'kill', target: ['rei'], n: 1, reward: { cash: 0 }, hint: 'portal' },
];

export const WORLD_POP = 8_100_000_000;

// Control schemes. Ability ids stay Q/W/E/R/D/F/B; only the physical keys change.
// Arrow keys always move the Noob, in both schemes.
export const KEYMAPS = {
  wasd: {
    name: 'WASD + mouse',
    binds: { Q: 'KeyQ', W: 'KeyF', E: 'KeyE', R: 'KeyR', D: 'KeyC', F: 'Space', B: 'KeyB' },
    labels: { Q: 'Q', W: 'F', E: 'E', R: 'R', D: 'C', F: '␣', B: 'B' },
    move: true,
  },
  classic: {
    name: 'Clássico (LoL)',
    binds: { Q: 'KeyQ', W: 'KeyW', E: 'KeyE', R: 'KeyR', D: 'KeyD', F: 'KeyF', B: 'KeyB' },
    labels: { Q: 'Q', W: 'W', E: 'E', R: 'R', D: 'D', F: 'F', B: 'B' },
    move: false,
  },
};
export function keymap(settings) {
  return KEYMAPS[settings?.keymap] || KEYMAPS.wasd;
}
