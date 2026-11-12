// Sky dome, sun/moon, hemisphere light, fog, day/night cycle and a pooled set of point lights.
import * as THREE from 'three';
import { G } from '../G.js';
import { smoothstep, lerp, clamp } from '../util.js';
import { U, nightMats } from "../engine/materials.js";
import { waterMat } from './terrain.js';

export const DAY_LEN = 420; // seconds per full cycle
export const NIGHT_START = 0.72;

const KEYS = [
  // t, sunCol, sunInt, skyTop, skyHor, hemiSky, hemiGround, hemiInt, env
  [0.0, 0xffa66a, 1.5, 0x6b8fd6, 0xffc28f, 0xc8c0ff, 0x6b5040, 0.75, 0.4],
  [0.08, 0xfff1d8, 3.1, 0x2f86ea, 0xbfe4ff, 0xc4dcff, 0x6a7a3c, 0.85, 0.55],
  [0.5, 0xfff3e0, 3.2, 0x2f86ea, 0xc3e6ff, 0xc4dcff, 0x6a7a3c, 0.85, 0.55],
  [0.62, 0xffc27a, 2.7, 0x4a7ad0, 0xffd6a6, 0xffe2c4, 0x5e5a30, 0.82, 0.5],
  [0.68, 0xff8040, 1.8, 0x4458a8, 0xff8a5a, 0xd8a0ff, 0x4a3434, 0.75, 0.4],
  [0.72, 0xc05a7a, 0.85, 0x1e2a66, 0x8a4a7a, 0x7a70d0, 0x262838, 0.62, 0.3],
  [0.78, 0x8eb0ff, 0.85, 0x081030, 0x1d3068, 0x5470c0, 0x161c2a, 0.45, 0.18],
  [0.95, 0x8eb0ff, 0.85, 0x081030, 0x1d3068, 0x5470c0, 0x161c2a, 0.45, 0.18],
  [1.0, 0xffa66a, 1.5, 0x6b8fd6, 0xffc28f, 0xc8c0ff, 0x6b5040, 0.75, 0.4],
];
const cA = new THREE.Color(), cB = new THREE.Color();
function sampleKeys(t, idx, out) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = smoothstep(0, 1, (t - a[0]) / Math.max(b[0] - a[0], 1e-5));
  if (out) {
    cA.setHex(a[idx]);
    cB.setHex(b[idx]);
    return out.copy(cA).lerp(cB, f);
  }
  return lerp(a[idx], b[idx], f);
}

export function createSky(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2.2;
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 420;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd2e8ff, 0x5c7438, 1.0);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0xbfe2ff, 120, 380);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: U.uTime,
      uCloud: U.uCloudTex,
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uSunDir, uSunCol; uniform float uNight, uTime; uniform sampler2D uCloud;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.6, h), 0.7));
        col = mix(col, uHor*0.6, smoothstep(0.0, -0.3, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * (1.0 - uNight*0.4);
        // stars
        if (uNight > 0.01 && h > 0.0) {
          vec3 g = floor(d * 220.0);
          float s = step(0.9975, hash(g));
          col += vec3(s) * uNight * smoothstep(0.0, 0.25, h) * (0.6 + 0.4*sin(uTime*3.0 + hash(g)*20.0));
        }
        // clouds
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 0.25 + vec2(uTime*0.003, 0.0);
          float c = texture2D(uCloud, uv).r;
          float cl = smoothstep(0.52, 0.75, c) * smoothstep(0.0, 0.25, h);
          vec3 cc = mix(vec3(1.0), uHor, 0.35) * (1.0 - uNight*0.85);
          col = mix(col, cc, cl * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  // point light pool (fixed count -> no shader recompiles)
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffa040, 0, 26, 1.6);
    scene.add(l);
    pool.push(l);
  }
  const sources = []; // {x,y,z,color,power,flicker,night}

  const sky = {
    sun, hemi, dome, skyMat, pool, sources,
    sunDir: new THREE.Vector3(),
    night: 0,
    dayT: 0.1,
    isNight: false,
    shadowRange: 70,
    addLight(x, y, z, color = 0xffa040, power = 1, o = {}) {
      const s = { x, y, z, color: new THREE.Color(color), power, flicker: o.flicker ?? 0, nightOnly: o.nightOnly ?? false, range: o.range ?? 26, tag: o.tag || null };
      sources.push(s);
      return s;
    },
    removeLight(s) {
      const i = sources.indexOf(s);
      if (i >= 0) sources.splice(i, 1);
    },
    setShadowQuality(q) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      this.shadowRange = q.shadowRange;
      sc.left = -q.shadowRange;
      sc.right = q.shadowRange;
      sc.top = q.shadowRange;
      sc.bottom = -q.shadowRange;
      sc.updateProjectionMatrix();
    },
    update(dt, focus, camPos, arena = false) {
      if (!arena) this.dayT = (this.dayT + dt / DAY_LEN) % 1;
      const t = arena ? 0.64 : this.dayT;
      G.state && (G.state.dayT = this.dayT);
      // night factor
      const nightF = smoothstep(0.68, 0.76, t) * (1 - smoothstep(0.95, 1.0, t));
      this.night = nightF;
      this.isNight = t >= NIGHT_START && t < 0.97;
      // sun direction
      let elev, az;
      if (t < NIGHT_START) {
        const p = t / NIGHT_START;
        elev = Math.sin(p * Math.PI) * 1.05 + 0.12;
        az = lerp(-1.2, 1.4, p);
      } else {
        const p = (t - NIGHT_START) / (1 - NIGHT_START);
        elev = Math.sin(p * Math.PI) * 0.9 + 0.25; // moon
        az = lerp(-1.0, 1.2, p);
      }
      elev = clamp(elev, 0.18, 1.3);
      this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev) * 0.6 + 0.35).normalize();
      sampleKeys(t, 1, sun.color);
      sun.intensity = sampleKeys(t, 2);
      sampleKeys(t, 5, hemi.color);
      sampleKeys(t, 6, hemi.groundColor);
      hemi.intensity = sampleKeys(t, 7);
      G.scene.environmentIntensity = sampleKeys(t, 8);
      sampleKeys(t, 3, skyMat.uniforms.uTop.value);
      sampleKeys(t, 4, skyMat.uniforms.uHor.value);
      skyMat.uniforms.uSunDir.value.copy(this.sunDir);
      skyMat.uniforms.uSunCol.value.copy(sun.color);
      skyMat.uniforms.uNight.value = nightF;
      // fog distance follows the camera zoom so the play area stays crisp and the far forest hazes out
      const camD = G.cam?.mode === 'fp' ? 70 : camPos.distanceTo(focus);
      G.scene.fog.near = Math.max(60, camD * 1.35);
      G.scene.fog.far = camD * 4.6 + 140;
      const fogc = G.scene.fog.color;
      fogc.copy(skyMat.uniforms.uHor.value).lerp(skyMat.uniforms.uTop.value, 0.35);
      if (arena) fogc.setHex(0x2a1c22);
      U.uCloudAmt.value = 1 - nightF * 0.85;
      // lamps and lanterns glow brighter after sunset
      const lampK = 1 + Math.max(nightF, arena ? 1 : 0, smoothstep(0.6, 0.7, t) * 0.6) * 2.2;
      for (const m of nightMats) m.color.copy(m.userData.baseCol).multiplyScalar(lampK);
      if (waterMat) {
        waterMat.uniforms.uSunDir.value.copy(this.sunDir);
        waterMat.uniforms.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity / 2.6);
        waterMat.uniforms.uSky.value.copy(skyMat.uniforms.uHor.value);
        waterMat.uniforms.uLight.value = 1 - nightF * 0.6;
      }
      // shadow camera follows focus, snapped to texels to avoid shimmering
      const range = this.shadowRange;
      const texel = (range * 2) / sun.shadow.mapSize.x;
      const fwd = _f.copy(this.sunDir).negate();
      const right = _r.crossVectors(fwd, _up).normalize();
      const up2 = _u2.crossVectors(right, fwd).normalize();
      let a = focus.x * right.x + focus.y * right.y + focus.z * right.z;
      let b = focus.x * up2.x + focus.y * up2.y + focus.z * up2.z;
      const c = focus.x * fwd.x + focus.y * fwd.y + focus.z * fwd.z;
      a = Math.round(a / texel) * texel;
      b = Math.round(b / texel) * texel;
      _t.set(0, 0, 0).addScaledVector(right, a).addScaledVector(up2, b).addScaledVector(fwd, c);
      sun.target.position.copy(_t);
      sun.position.copy(_t).addScaledVector(this.sunDir, 200);
      sun.target.updateMatrixWorld();
      dome.position.copy(camPos);

      // assign point lights to nearest active sources
      const nightK = smoothstep(0.62, 0.74, t) * (1 - smoothstep(0.96, 1.0, t));
      _cands.length = 0;
      for (const s of sources) {
        if (s.tag && G.base?.hiddenTags?.has(s.tag)) continue;
        const k = s.nightOnly ? Math.max(nightK, arena ? 1 : 0) : 1;
        if (k <= 0.01) continue;
        const d = Math.hypot(s.x - focus.x, s.z - focus.z);
        if (d > 70) continue;
        s._d = d;
        s._k = k;
        _cands.push(s);
      }
      _cands.sort((p, q) => p._d - q._d);
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const s = _cands[i];
        if (!s) { l.intensity = 0; continue; }
        l.position.set(s.x, s.y, s.z);
        l.color.copy(s.color);
        l.distance = s.range;
        const fl = s.flicker ? 1 + Math.sin(G.t * 13 + s.x) * 0.08 * s.flicker + Math.sin(G.t * 7.3 + s.z) * 0.06 * s.flicker : 1;
        l.intensity = s.power * 30 * s._k * fl * smoothstep(70, 45, s._d);
      }
    },
  };
  return sky;
}
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u2 = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _cands = [];
