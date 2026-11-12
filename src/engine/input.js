// Input state: keys, mouse, clicks, wheel, pointer lock.
export const input = {
  keys: new Set(),
  pressed: new Set(),
  released: new Set(),
  mx: innerWidth / 2,
  my: innerHeight / 2,
  dx: 0,
  dy: 0,
  wheel: 0,
  buttons: 0,
  clicks: [],
  ups: [],
  locked: false,
  canvas: null,
  down(code) {
    return this.keys.has(code);
  },
  hit(code) {
    return this.pressed.has(code);
  },
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.clicks.length = 0;
    this.ups.length = 0;
    this.wheel = 0;
    this.dx = 0;
    this.dy = 0;
  },
};

const BLOCK = new Set(['Tab', 'Space', 'F1', 'F3', 'ArrowUp', 'ArrowDown']);

export function initInput(canvas) {
  input.canvas = canvas;
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (BLOCK.has(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    input.released.add(e.code);
  });
  addEventListener('blur', () => input.keys.clear());
  addEventListener('mousemove', (e) => {
    input.mx = e.clientX;
    input.my = e.clientY;
    input.dx += e.movementX || 0;
    input.dy += e.movementY || 0;
  });
  canvas.addEventListener("mousedown", (e) => {
    input.buttons = e.buttons;
    input.mx = e.clientX;
    input.my = e.clientY;
    input.clicks.push({ b: e.button, x: e.clientX, y: e.clientY, shift: e.shiftKey });
  });
  addEventListener('mouseup', (e) => {
    input.buttons = e.buttons;
    input.ups.push({ b: e.button });
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      input.wheel += Math.sign(e.deltaY);
    },
    { passive: false }
  );
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
}
