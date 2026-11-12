// Visual effects: GPU point particles, brick debris, floating DOM text, ground decals
// (telegraphs, range rings, click markers), shockwaves and beams.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../G.js';
import { TEX } from './materials.js';
import { groundAt } from './physics.js';
import { clamp, lerp } from '../util.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 4), 4);
    this.size = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col.setUsage(THREE.DynamicDrawUsage);
    this.size.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aSize', this.size);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: TEX.sprite }, uScale: { value: 800 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uScale/max(-mv.z,0.1); vC = aColor; }`,
      fragmentShader: additive
        ? `uniform sampler2D uTex; varying vec4 vC; void main(){ float a = texture2D(uTex, gl_PointCoord).a*vC.a; gl_FragColor = vec4(vC.rgb*a, a); }`
        : `uniform sampler2D uTex; varying vec4 vC; void main(){ float a = texture2D(uTex, gl_PointCoord).a*vC.a; if(a<0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, col0, col1, alpha = 1, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    _c.set(col0);
    this.c0[i * 3] = _c.r; this.c0[i * 3 + 1] = _c.g; this.c0[i * 3 + 2] = _c.b;
    _c.set(col1 ?? col0);
    this.c1[i * 3] = _c.r; this.c1[i * 3 + 1] = _c.g; this.c1[i * 3 + 2] = _c.b;
    this.a0[i] = alpha;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }
  copy(d, s) {
    this.p[d * 3] = this.p[s * 3]; this.p[d * 3 + 1] = this.p[s * 3 + 1]; this.p[d * 3 + 2] = this.p[s * 3 + 2];
    this.v[d * 3] = this.v[s * 3]; this.v[d * 3 + 1] = this.v[s * 3 + 1]; this.v[d * 3 + 2] = this.v[s * 3 + 2];
    this.life[d] = this.life[s]; this.maxLife[d] = this.maxLife[s];
    this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s];
    for (let k = 0; k < 3; k++) { this.c0[d * 3 + k] = this.c0[s * 3 + k]; this.c1[d * 3 + k] = this.c1[s * 3 + k]; }
    this.a0[d] = this.a0[s]; this.grav[d] = this.grav[s]; this.drag[d] = this.drag[s];
  }
  update(dt) {
    const P = this.pos.array, C = this.col.array, S = this.size.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        if (i !== this.n) this.copy(i, this.n);
        continue;
      }
      const k = 1 - Math.exp(-this.drag[i] * dt);
      this.v[i * 3] -= this.v[i * 3] * k;
      this.v[i * 3 + 2] -= this.v[i * 3 + 2] * k;
      this.v[i * 3 + 1] -= this.v[i * 3 + 1] * k + this.grav[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      for (let c = 0; c < 3; c++) C[i * 4 + c] = lerp(this.c0[i * 3 + c], this.c1[i * 3 + c], t);
      C[i * 4 + 3] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.55) / 0.45));
      S[i] = lerp(this.s0[i], this.s1[i], t);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.size.needsUpdate = true;
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, this.n * 3);
    this.col.clearUpdateRanges();
    this.col.addUpdateRange(0, this.n * 4);
    this.size.clearUpdateRanges();
    this.size.addUpdateRange(0, this.n);
  }
}

// brick debris (instanced rounded cubes with simple physics)
class Debris {
  constructor(scene, max = 360) {
    this.max = max;
    const geo = new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
  }
  spawn(x, y, z, vx, vy, vz, size, color, life = 1.6) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, z, vx, vy, vz, sx: size[0] ?? size, sy: size[1] ?? size, sz: size[2] ?? size, rx: Math.random() * 6, ry: Math.random() * 6, rz: 0, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, life, max: life, color: new THREE.Color(color) });
  }
  update(dt) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.life -= dt;
      if (d.life <= 0) { this.items.splice(i, 1); continue; }
      d.vy -= 55 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.ry += d.wy * dt;
      const g = groundAt(d.x, d.z, d.y + 0.5) + d.sy * 0.5;
      if (d.y < g) {
        d.y = g;
        if (d.vy < -4) { d.vy *= -0.35; } else d.vy = 0;
        d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.6; d.wy *= 0.6;
      }
    }
    for (const d of this.items) {
      if (n >= this.max) break;
      const k = clamp(d.life / 0.4, 0, 1);
      this._e.set(d.rx, d.ry, d.rz);
      this._q.setFromEuler(this._e);
      this._m.compose(_v.set(d.x, d.y, d.z), this._q, this._s.set(d.sx * k, d.sy * k, d.sz * k));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, d.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ground decals: one shader for circles, rects, rings, markers
const DECAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const DECAL_FS = /* glsl */ `
uniform vec3 uColor; uniform float uProgress, uAlpha, uShape, uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0-1.0;
  float a = 0.0;
  if (uShape < 0.5) { // circle telegraph
    float d = length(p);
    if (d > 1.0) discard;
    float edge = smoothstep(0.9, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
    float fill = step(d, uProgress) * 0.35;
    float ring = smoothstep(uProgress-0.04, uProgress, d) * (1.0 - smoothstep(uProgress, uProgress+0.01, d));
    a = max(edge*0.95, fill + ring*0.6) + 0.12;
  } else if (uShape < 1.5) { // rect telegraph, progress along +y
    float ex = 1.0 - smoothstep(0.9, 1.0, abs(p.x));
    float edge = max(smoothstep(0.88, 0.96, abs(p.x)), smoothstep(0.94, 0.99, abs(p.y)));
    float t = vUv.y;
    float fill = step(t, uProgress) * 0.35;
    a = max(edge*0.9, fill) * step(abs(p.x), 1.0) + 0.1;
  } else if (uShape < 2.5) { // thin ring
    float d = length(p);
    a = smoothstep(0.94, 0.975, d) * (1.0 - smoothstep(0.975, 1.0, d));
    a += (1.0 - smoothstep(0.0, 1.0, d)) * 0.06 * step(d, 1.0);
  } else if (uShape < 3.5) { // click marker (shrinking ring + spokes)
    float d = length(p);
    float r = 1.0 - uProgress*0.6;
    a = smoothstep(r-0.12, r-0.04, d) * (1.0 - smoothstep(r-0.04, r, d));
    float ang = atan(p.y, p.x);
    float sp = step(0.92, cos(ang*4.0 + uTime*3.0)) * smoothstep(r-0.5, r-0.2, d) * (1.0 - step(r, d));
    a = max(a, sp);
    a *= 1.0 - uProgress;
  } else if (uShape < 4.5) { // shockwave
    float d = length(p);
    float r = uProgress;
    a = smoothstep(r-0.18, r, d) * (1.0 - smoothstep(r, r+0.02, d)) * (1.0 - uProgress);
  } else { // soft glow disc
    float d = length(p);
    a = (1.0 - smoothstep(0.0, 1.0, d));
    a = a*a;
  }
  gl_FragColor = vec4(uColor, clamp(a,0.0,1.0)*uAlpha);
}`;

class Decals {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  get() {
    let d = this.pool.pop();
    if (!d) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        uniforms: { uColor: { value: new THREE.Color() }, uProgress: { value: 0 }, uAlpha: { value: 1 }, uShape: { value: 0 }, uTime: { value: 0 } },
        vertexShader: DECAL_VS,
        fragmentShader: DECAL_FS,
      });
      const m = new THREE.Mesh(this.geo, mat);
      m.renderOrder = 3;
      m.frustumCulled = false;
      d = { mesh: m };
    }
    this.scene.add(d.mesh);
    return d;
  }
  // o: {shape:'circle'|'rect'|'ring'|'marker'|'shock'|'glow', x,z,y, r or w,l, rot, color, dur, follow, alpha, additive}
  add(o) {
    const d = this.get();
    const m = d.mesh;
    const shapes = { circle: 0, rect: 1, ring: 2, marker: 3, shock: 4, glow: 5 };
    m.material.uniforms.uShape.value = shapes[o.shape] ?? 0;
    m.material.uniforms.uColor.value.set(o.color ?? 0xff3020);
    m.material.uniforms.uAlpha.value = o.alpha ?? 0.9;
    m.material.uniforms.uProgress.value = 0;
    m.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (o.shape === 'rect') m.scale.set(o.w * 2 * 0.5 * 2, 1, o.l);
    else m.scale.set((o.r || 1) * 2, 1, (o.r || 1) * 2);
    if (o.shape === 'rect') m.scale.set(o.w, 1, o.l);
    m.rotation.set(0, o.rot || 0, 0);
    const y = o.y ?? groundAt(o.x, o.z, 100) ;
    m.position.set(o.x, y + 0.12, o.z);
    d.o = o;
    d.t = 0;
    d.dur = o.dur ?? 1;
    this.active.push(d);
    return d;
  }
  remove(d) {
    const i = this.active.indexOf(d);
    if (i >= 0) this.active.splice(i, 1);
    this.scene.remove(d.mesh);
    this.pool.push(d);
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.t += dt;
      const u = d.mesh.material.uniforms;
      u.uTime.value = G.t;
      u.uProgress.value = clamp(d.t / d.dur, 0, 1);
      if (d.o.follow) {
        const f = d.o.follow;
        d.mesh.position.set(f.x, (f.y ?? 0) + 0.15, f.z);
      }
      if (d.o.grow) {
        const s = lerp(d.o.grow[0], d.o.grow[1], u.uProgress.value);
        d.mesh.scale.set(s * 2, 1, s * 2);
      }
      if (!d.o.persist && d.t >= d.dur) this.remove(d);
    }
  }
}

// floating DOM text
class FloatText {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'float-root';
    document.getElementById('ui').appendChild(this.root);
    this.pool = [];
    this.active = [];
  }
  add(x, y, z, text, cls = 'dmg', o = {}) {
    let e = this.pool.pop();
    if (!e) {
      e = { el: document.createElement('div') };
      this.root.appendChild(e.el);
    }
    e.el.className = 'ft ' + cls;
    e.el.textContent = text;
    e.el.style.display = 'block';
    e.x = x + (o.jitter !== false ? (Math.random() - 0.5) * 1.2 : 0);
    e.y = y;
    e.z = z + (o.jitter !== false ? (Math.random() - 0.5) * 1.2 : 0);
    e.vy = o.vy ?? 6;
    e.vx = (Math.random() - 0.5) * (o.spread ?? 3);
    e.t = 0;
    e.life = o.life ?? 0.9;
    e.scale = o.scale ?? 1;
    this.active.push(e);
    if (this.active.length > 70) this.recycle(0);
  }
  recycle(i) {
    const e = this.active[i];
    e.el.style.display = 'none';
    this.active.splice(i, 1);
    this.pool.push(e);
  }
  update(dt, camera) {
    const w = innerWidth, h = innerHeight;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t += dt;
      if (e.t >= e.life) { this.recycle(i); continue; }
      e.vy -= 12 * dt;
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      _v.set(e.x, e.y, e.z).project(camera);
      if (_v.z > 1) { e.el.style.opacity = 0; continue; }
      const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
      const k = e.t / e.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.2);
      e.el.style.transform = `translate(-50%,-50%) translate(${sx | 0}px,${sy | 0}px) scale(${(pop * e.scale).toFixed(3)})`;
      e.el.style.opacity = k > 0.7 ? (1 - (k - 0.7) / 0.3).toFixed(2) : 1;
    }
  }
}

// Soft contact shadows under every character: one instanced draw call.
// Opacity is encoded in the (unused) Y scale of each flat instance.
class Blobs {
  constructor(scene, max = 96) {
    this.max = max;
    this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `varying vec2 vUv; varying float vA;
        void main(){ vUv = uv; vA = length(instanceMatrix[1].xyz);
          vec4 p = instanceMatrix * vec4(position.x, 0.0, position.z, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `varying vec2 vUv; varying float vA;
        void main(){ float d = length(vUv * 2.0 - 1.0); float a = (1.0 - smoothstep(0.15, 1.0, d)); gl_FragColor = vec4(0.02, 0.03, 0.05, a * a * vA); }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    this.m = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  add(x, y, z, r, a = 0.42) {
    if (this.n >= this.max) return;
    const e = this.m.elements;
    e.fill(0);
    e[0] = r * 2; e[5] = a; e[10] = r * 2; e[15] = 1;
    e[12] = x; e[13] = y + 0.06; e[14] = z;
    this.mesh.setMatrixAt(this.n++, this.m);
  }
  flush() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
    this.n = 0;
  }
}

// Ribbon trail that follows two points (blade base + tip) — used for weapon swings and dashes.
export class Trail {
  constructor(scene, color = 0xffffff, seg = 18, life = 0.2) {
    this.seg = seg;
    this.life = life;
    this.samples = [];
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(seg * 2 * 3), 3);
    this.alp = new THREE.BufferAttribute(new Float32Array(seg * 2), 1);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.alp.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aA', this.alp);
    const idx = [];
    for (let i = 0; i < seg - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * 1.6, vA); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  setColor(c) {
    this.mat.uniforms.uColor.value.set(c);
  }
  push(a, b, t) {
    const s = this.samples;
    s.unshift({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, t });
    if (s.length > this.seg) s.length = this.seg;
  }
  update(now) {
    const s = this.samples;
    while (s.length && now - s[s.length - 1].t > this.life) s.pop();
    if (s.length < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const P = this.pos.array, A = this.alp.array;
    for (let i = 0; i < this.seg; i++) {
      const p = s[Math.min(i, s.length - 1)];
      const k = i < s.length ? Math.max(0, 1 - (now - p.t) / this.life) * (1 - i / this.seg) : 0;
      P[i * 6] = p.ax; P[i * 6 + 1] = p.ay; P[i * 6 + 2] = p.az;
      P[i * 6 + 3] = p.bx; P[i * 6 + 4] = p.by; P[i * 6 + 5] = p.bz;
      A[i * 2] = k * 0.15;
      A[i * 2 + 1] = k * 0.9;
    }
    this.pos.needsUpdate = true;
    this.alp.needsUpdate = true;
  }
}

export function createFX(scene) {
  const add = new Particles(scene, 3000, true);
  const alpha = new Particles(scene, 1500, false);
  const debris = new Debris(scene);
  const decals = new Decals(scene);
  const text = new FloatText();
  const blobs = new Blobs(scene);
  const fx = {
    add, alpha, debris, decals, text, blobs,
    update(dt, camera, pixelH) {
      const s = pixelH / (2 * Math.tan((camera.fov * Math.PI) / 360));
      add.mat.uniforms.uScale.value = s;
      alpha.mat.uniforms.uScale.value = s;
      blobs.flush();
      add.update(dt);
      alpha.update(dt);
      debris.update(dt);
      decals.update(dt);
      text.update(dt, camera);
    },
    // ---- presets ----
    burst(x, y, z, color, n = 16, speed = 8, size = 0.6, life = 0.6, grav = 10) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
        const r = Math.sqrt(1 - u * u);
        const sp = speed * (0.4 + Math.random() * 0.6);
        add.emit(x, y, z, Math.cos(a) * r * sp, u * sp + speed * 0.3, Math.sin(a) * r * sp, life * (0.6 + Math.random() * 0.6), size, size * 0.2, color, color, 1, grav, 2);
      }
    },
    sparks(x, y, z, color = 0xffc040, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 6 + Math.random() * 10;
        add.emit(x, y, z, Math.cos(a) * sp, 4 + Math.random() * 8, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, 0.35, 0.05, color, 0xff4010, 1, 30, 1);
      }
    },
    dust(x, y, z, n = 10, r = 1, color = 0xcfc0a0) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3;
        alpha.emit(x + Math.cos(a) * r * Math.random(), y + 0.2, z + Math.sin(a) * r * Math.random(), Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 0.6 + Math.random() * 0.6, 1.2, 3.2, color, color, 0.55, -1, 3);
      }
    },
    smoke(x, y, z, color = 0x777777, size = 2) {
      alpha.emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.8, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, 2 + Math.random(), size, size * 3, color, 0x999999, 0.45, -0.5, 0.5);
    },
    ring(x, y, z, color, r = 3, n = 24, speed = 6) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        add.emit(x + Math.cos(a) * r * 0.3, y, z + Math.sin(a) * r * 0.3, Math.cos(a) * speed, 0.5, Math.sin(a) * speed, 0.5, 0.7, 0.2, color, color, 1, 0, 3);
      }
    },
    bricks(x, y, z, colors, n = 8, speed = 9, size = 0.6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.4 + Math.random() * 0.7);
        debris.spawn(x, y, z, Math.cos(a) * sp, 6 + Math.random() * 10, Math.sin(a) * sp, size * (0.6 + Math.random() * 0.6), colors[i % colors.length], 1.2 + Math.random() * 1.2);
      }
    },
    beam(x, y, z, color, h = 30, n = 30) {
      for (let i = 0; i < n; i++) {
        add.emit(x + (Math.random() - 0.5) * 1.5, y + Math.random() * 2, z + (Math.random() - 0.5) * 1.5, 0, 10 + Math.random() * 20, 0, 0.8 + Math.random() * 0.6, 0.9, 0.3, color, 0xffffff, 1, 0, 0.5);
      }
    },
    shock(x, z, r, color = 0xffffff, dur = 0.45, y) {
      return decals.add({ shape: 'shock', x, z, y, r, color, dur, alpha: 1, additive: true });
    },
    float(x, y, z, text, cls, o) {
      text_(x, y, z, text, cls, o);
    },
  };
  const text_ = (x, y, z, t, c, o) => text.add(x, y, z, t, c, o);
  return fx;
}
