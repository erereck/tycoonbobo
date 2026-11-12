// Roblox-Studio-like part builder: describe parts (box, cylinder, wedge, sphere...)
// and it merges them per material into a handful of draw calls + emits collision solids.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMat, tileFor } from './materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// world-space box projection UVs so textures tile by stud size
function boxProjectUV(g, tile) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / tile, z / tile);
    else if (nx >= nz) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

export function wedgeGeometry(sx, sy, sz) {
  // triangular prism; slope rises toward +z (high side at +z), base on y=-sy/2
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const v = [
    // bottom
    -hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz,
    -hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz,
    // back (high side, +z)
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz,
    -hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
    // slope
    -hx, -hy, -hz, -hx, hy, hz, hx, hy, hz,
    -hx, -hy, -hz, hx, hy, hz, hx, -hy, -hz,
    // left
    -hx, -hy, -hz, -hx, -hy, hz, -hx, hy, hz,
    // right
    hx, -hy, -hz, hx, hy, hz, hx, -hy, hz,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  return g;
}

export class PartBuilder {
  constructor(o = {}) {
    this.tag = o.tag || null;
    this.cut = o.cut !== false;
    this.groups = new Map();
    this.solids = [];
    this.lights = [];
    this.anchors = {};
  }
  mat(o) {
    return o.material || getMat(o.mat || 'plastic', o.color ?? 0xa3a2a5, { tag: o.tag ?? this.tag, cut: o.cut ?? this.cut, emissive: o.emissive, opacity: o.opacity, side: o.side, night: o.night });
  }
  _add(g, o) {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const m = this.mat(o);
    const cast = o.cast !== false && m.userData.kind !== 'glass';
    const recv = o.recv !== false;
    const key = m.uuid + (cast ? 'c' : '') + (recv ? 'r' : '');
    let e = this.groups.get(key);
    if (!e) {
      e = { mat: m, geos: [], cast, recv };
      this.groups.set(key, e);
    }
    e.geos.push(g);
    return g;
  }
  _xform(g, x, y, z, o) {
    if (o.rot) {
      _e.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(0, 0, 0), _q, _s.set(1, 1, 1));
      g.applyMatrix4(_m);
    }
    g.translate(x, y, z);
  }
  // center-based box
  box(sx, sy, sz, x, y, z, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const kind = o.mat || 'plastic';
    if (kind !== 'neon') boxProjectUV(g, o.tile || tileFor(kind));
    this._xform(g, x, y, z, o);
    this._add(g, o);
    if (o.solid) {
      let hx = sx / 2, hz = sz / 2;
      if (o.rot && Math.abs(Math.sin(o.rot[1] || 0)) > 0.7) [hx, hz] = [hz, hx];
      this.solids.push({ type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, bottom: y - sy / 2, top: y + sy / 2, walk: o.walk !== false, tag: o.solidTag || this.tag });
    }
    return this;
  }
  // bottom-based box helper (y = bottom)
  boxB(sx, sy, sz, x, yb, z, o = {}) {
    return this.box(sx, sy, sz, x, yb + sy / 2, z, o);
  }
  cyl(rt, rb, h, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 16, 1, !!o.open);
    if (o.uvScale) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uvScale[0], uv.getY(i) * o.uvScale[1]);
    }
    this._xform(g, x, y, z, o);
    this._add(g, o);
    if (o.solid) this.solids.push({ type: 'circle', x, z, r: Math.max(rt, rb), bottom: y - h / 2, top: y + h / 2, walk: o.walk !== false, tag: this.tag });
    return this;
  }
  sphere(r, x, y, z, o = {}) {
    const g = o.ico !== undefined ? new THREE.IcosahedronGeometry(r, o.ico) : new THREE.SphereGeometry(r, o.seg || 16, o.segH || 12);
    if (o.scale) g.scale(o.scale[0], o.scale[1], o.scale[2]);
    this._xform(g, x, y, z, o);
    this._add(g, o);
    return this;
  }
  cone(r, h, x, y, z, o = {}) {
    const g = new THREE.ConeGeometry(r, h, o.seg || 12);
    this._xform(g, x, y, z, o);
    this._add(g, o);
    return this;
  }
  wedge(sx, sy, sz, x, y, z, o = {}) {
    const g = wedgeGeometry(sx, sy, sz);
    boxProjectUV(g, tileFor(o.mat || 'plastic'));
    this._xform(g, x, y, z, o);
    this._add(g, o);
    return this;
  }
  torus(r, tube, x, y, z, o = {}) {
    const g = new THREE.TorusGeometry(r, tube, o.rs || 8, o.ts || 24, o.arc || Math.PI * 2);
    this._xform(g, x, y, z, o);
    this._add(g, o);
    return this;
  }
  geo(g, x, y, z, o = {}) {
    this._xform(g, x, y, z, o);
    this._add(g, o);
    return this;
  }
  solid(s) {
    this.solids.push({ walk: true, tag: this.tag, ...s });
    return this;
  }
  ramp(minX, maxX, minZ, maxZ, axis, h0, h1, bottom = 0) {
    // walkable ramp solid: height goes h0 -> h1 along +axis
    this.solids.push({ type: 'ramp', minX, maxX, minZ, maxZ, axis, h0, h1, bottom, top: Math.max(h0, h1), walk: true, tag: this.tag });
    return this;
  }
  light(x, y, z, color = 0xffb060, power = 1, nightOnly = false) {
    this.lights.push({ x, y, z, color, power, nightOnly });
    return this;
  }
  build(name = 'parts') {
    const group = new THREE.Group();
    group.name = name;
    for (const e of this.groups.values()) {
      const g = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, e.mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.recv;
      mesh.userData.cast = e.cast;
      mesh.userData.batchable = true;
      if (e.mat.transparent && e.mat.userData.kind === 'glass') mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      for (const g2 of e.geos) if (g2 !== g) g2.dispose();
    }
    return group;
  }
}

// Merge sibling meshes that share a material (keeps per-limb animation groups intact).
function cleanGeo(g) {
  let c = g.index ? g.toNonIndexed() : g.clone();
  if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
  for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
  return c;
}
export function mergeStatic(root) {
  const parents = [];
  root.traverse((o) => { if (o.children.length) parents.push(o); });
  for (const parent of parents) {
    const groups = new Map();
    for (const c of parent.children) {
      if (!c.isMesh || c.isInstancedMesh || c.children.length || c.userData.noMerge) continue;
      const k = c.material.uuid + (c.castShadow ? 'c' : '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = cleanGeo(m.geometry);
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mm = new THREE.Mesh(merged, list[0].material);
      mm.castShadow = list[0].castShadow;
      mm.receiveShadow = true;
      for (const m of list) parent.remove(m);
      parent.add(mm);
    }
  }
  return root;
}
export function bakeGeometry(mesh, matrix) {
  const g = cleanGeo(mesh.geometry);
  g.applyMatrix4(matrix);
  return g;
}
