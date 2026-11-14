// Riss-Alarm – WebXR Mixed-Reality-Spiel für Meta Quest (Quest-Browser)
import * as THREE from './vendor/three.module.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 60);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x40205a, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1, 3, 2);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- Audio
const Sound = {
  ctx: null, master: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  listener(pos, fwd, up) {
    const l = this.ctx?.listener; if (!l) return;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else if (l.setPosition) { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  },
  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.6; p.rolloffFactor = 1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  },
  tone(type, f0, f1, dur, vol, pos, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(pos)); o.start(t); o.stop(t + dur + 0.02);
  },
  noiseBurst(dur, vol, f0, f1, pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(pos)); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  shoot(p) { this.tone('square', 1100, 180, 0.09, 0.12, p); },
  bounce(p) { this.tone('sine', 1800, 900, 0.07, 0.18, p); },
  hit(p) { this.noiseBurst(0.07, 0.35, 4000, 600, p); this.tone('triangle', 420, 200, 0.08, 0.15, p); },
  explode(p, big) { this.noiseBurst(big ? 1.2 : 0.45, big ? 0.9 : 0.6, 2500, 120, p); this.tone('sine', big ? 90 : 160, 35, big ? 1.0 : 0.35, 0.5, p); },
  crack(p) { this.noiseBurst(1.0, 0.5, 900, 80, p); this.tone('sawtooth', 70, 38, 1.2, 0.18, p); this.tone('square', 2400, 1200, 0.05, 0.08, p, 0.05); },
  seal(p) { [880, 660, 440, 220].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.12, 0.2, p, i * 0.05)); this.noiseBurst(0.5, 0.4, 6000, 300, p); },
  hurt() { this.tone('square', 220, 60, 0.35, 0.3); this.noiseBurst(0.3, 0.4, 1500, 100); },
  reflect(p) { this.tone('sine', 700, 1400, 0.12, 0.25, p); this.tone('sine', 1400, 2800, 0.12, 0.12, p); },
  enemyShot(p) { this.tone('sawtooth', 300, 600, 0.18, 0.1, p); },
  pickup(p) { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.25, p, i * 0.07)); },
  wave() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.1, 0.1, null, i * 0.08)); },
  boss(p) { this.tone('sawtooth', 110, 45, 1.6, 0.35, p); this.tone('sawtooth', 116, 47, 1.6, 0.3, p); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.3, 0.25, null, i * 0.22)); },
  overheat(p) { this.noiseBurst(0.9, 0.35, 5000, 400, p); this.tone('sine', 900, 200, 0.5, 0.15, p); },
  shieldBlock(p) { this.tone('triangle', 260, 120, 0.15, 0.2, p); },
};

// ---------------------------------------------------------------- Canvas-Texturen
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.userData = { canvas: c, g };
  return t;
}
const glowTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const crackTex = canvasTex(512, 512, (g, w) => {
  g.translate(w / 2, w / 2);
  g.lineCap = 'round';
  const branch = (x, y, ang, len, width, depth) => {
    if (depth > 4 || len < 8) return;
    let cx = x, cy = y; const steps = 5;
    g.beginPath(); g.moveTo(cx, cy);
    for (let i = 0; i < steps; i++) {
      ang += rand(-0.5, 0.5);
      cx += Math.cos(ang) * len / steps; cy += Math.sin(ang) * len / steps; g.lineTo(cx, cy);
      if (Math.random() < 0.35) branch(cx, cy, ang + rand(-1.2, 1.2), len * 0.5, width * 0.6, depth + 1);
    }
    g.lineWidth = width; g.stroke();
  };
  // deterministisch: Seed-PRNG, damit Glow- und Kernpass übereinanderliegen
  let seed = 7;
  const r0 = Math.random;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (const [col, wmul, blur] of [['rgba(255,60,200,0.6)', 3.0, 20], ['rgba(140,250,255,1)', 1, 5]]) {
    seed = 7; Math.random = srand;
    g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = blur;
    for (let i = 0; i < 9; i++) branch(0, 0, (i / 9) * Math.PI * 2 + srand() * 0.4, 230, 7 * wmul, 0);
    Math.random = r0;
  }
});

const textCache = new Map();
function textTexture(text, color = '#fff', px = 64) {
  const key = text + color + px;
  if (textCache.has(key)) return textCache.get(key);
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = `900 ${px}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + px; c.width = w; c.height = px * 1.6;
  g.font = `900 ${px}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = px * 0.3; g.lineWidth = px * 0.12; g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(text, w / 2, c.height / 2); g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.aspect = w / c.height;
  if (textCache.size > 120) textCache.clear();
  textCache.set(key, t); return t;
}

// ---------------------------------------------------------------- Materialien & Geometrien
const M = {
  crawler: new THREE.MeshPhongMaterial({ color: 0x29e6ff, emissive: 0x0b5d7a, shininess: 90, flatShading: true }),
  crawlerHot: new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xff4fd8, flatShading: true }),
  brute: new THREE.MeshPhongMaterial({ color: 0xff8a1f, emissive: 0x7a2a00, shininess: 80, flatShading: true }),
  drone: new THREE.MeshPhongMaterial({ color: 0xc86bff, emissive: 0x4a0f80, shininess: 100, flatShading: true }),
  boss: new THREE.MeshPhongMaterial({ color: 0xff3fb4, emissive: 0x6a0040, shininess: 120, flatShading: true }),
  shard: new THREE.MeshPhongMaterial({ color: 0x8ffcff, emissive: 0x1a6a80, shininess: 120, flatShading: true, transparent: true, opacity: 0.9 }),
  leg: new THREE.MeshPhongMaterial({ color: 0x113344, emissive: 0x0a2a3a }),
  eye: new THREE.MeshBasicMaterial({ color: 0xffee55 }),
  dark: new THREE.MeshPhongMaterial({ color: 0x1c1c2a, shininess: 60 }),
  gunGlow: new THREE.MeshBasicMaterial({ color: 0x38f3ff }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, map: glowTex }),
  heart: new THREE.MeshPhongMaterial({ color: 0xff2255, emissive: 0x8a0022, shininess: 120, flatShading: true }),
};
const G = {
  crystal: new THREE.OctahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  leg: new THREE.CylinderGeometry(0.006, 0.004, 0.09, 4).translate(0, -0.045, 0),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  disc: new THREE.CircleGeometry(1, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, map: glowTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ---------------------------------------------------------------- Partikel (Instanced)
const Particles = (() => {
  const N = 500;
  const mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) mesh.setColorAt(i, col.set(0xffffff));
  scene.add(mesh);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, pos: new V3(), vel: new V3(), size: 0.01, spin: new V3(), rot: new THREE.Euler(), grav: 1 }));
  let next = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
  return {
    burst(pos, color, count = 20, speed = 1.5, size = 0.02, grav = 1, life = 0.8) {
      for (let k = 0; k < count; k++) {
        const p = P[next]; const i = next; next = (next + 1) % N;
        p.pos.copy(pos); p.vel.set(rand(-1, 1), rand(-0.6, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
        p.life = p.max = life * rand(0.6, 1.2); p.size = size * rand(0.5, 1.4); p.grav = grav;
        p.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        mesh.setColorAt(i, col.set(color).offsetHSL(rand(-0.04, 0.04), 0, rand(-0.1, 0.15)));
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life > 0) {
          p.life -= dt; p.vel.y -= 4.0 * p.grav * dt; p.vel.multiplyScalar(1 - 1.2 * dt);
          p.pos.addScaledVector(p.vel, dt);
          if (p.pos.y < Room.floorY + 0.005 && p.vel.y < 0) { p.pos.y = Room.floorY + 0.005; p.vel.y *= -0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; }
          p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
          const k = Math.max(p.life / p.max, 0);
          s.setScalar(p.size * (0.3 + 0.7 * k)); q.setFromEuler(p.rot);
          m4.compose(p.pos, q, s);
        } else { m4.makeScale(0, 0, 0); }
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
})();

// Kurzlebige Effekte (Ringe, Blitze, Punkte-Popups)
const Fx = [];
function addFx(obj, life, update) { scene.add(obj); Fx.push({ obj, life, max: life, update }); }
function updateFx(dt) {
  for (let i = Fx.length - 1; i >= 0; i--) {
    const f = Fx[i]; f.life -= dt;
    const k = 1 - f.life / f.max;
    if (f.life <= 0) { scene.remove(f.obj); f.obj.traverse?.((o) => { if (o.material && o.material.userData.own) o.material.dispose(); }); Fx.splice(i, 1); continue; }
    f.update(f.obj, k, dt);
  }
}
function ripple(pos, normal, color = 0x38f3ff, size = 0.25) {
  const mat = additive(color, 1); mat.userData.own = true;
  const m = new THREE.Mesh(G.plane, mat);
  m.position.copy(pos).addScaledVector(normal, 0.004);
  m.lookAt(m.position.clone().add(normal));
  addFx(m, 0.35, (o, k) => { o.scale.setScalar(size * (0.2 + k)); o.material.opacity = 1 - k; });
}
function flash(pos, color, size = 0.4, life = 0.25) {
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }); mat.userData.own = true;
  const s = new THREE.Sprite(mat); s.position.copy(pos);
  addFx(s, life, (o, k) => { o.scale.setScalar(size * (0.5 + k)); o.material.opacity = 1 - k; });
}
function popup(pos, text, color = '#ffffff', size = 0.07) {
  const tex = textTexture(text, color, 64);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }); mat.userData.own = true;
  const s = new THREE.Sprite(mat); s.renderOrder = 10;
  s.position.copy(pos); s.scale.set(size * tex.userData.aspect, size, 1);
  addFx(s, 1.1, (o, k, dt) => { o.position.y += 0.25 * dt; o.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; });
}

// ---------------------------------------------------------------- Raum (Ebenen)
const Room = {
  planes: [], active: [], ceilY: 3, map: new Map(), fallback: false, floorY: 0, haveReal: false, outlines: new THREE.Group(), outlineOpacity: 0.5,
};
scene.add(Room.outlines);
const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
const occGroup = new THREE.Group(); scene.add(occGroup);
const _occRot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const outlineMat = new THREE.LineBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });

function pip(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}
function setPlanePoly(p, poly) {
  p.poly = poly; p.area = polyArea(poly);
  p.min = [Infinity, Infinity]; p.max = [-Infinity, -Infinity];
  for (const [x, z] of poly) { p.min[0] = Math.min(p.min[0], x); p.min[1] = Math.min(p.min[1], z); p.max[0] = Math.max(p.max[0], x); p.max[1] = Math.max(p.max[1], z); }
  if (p.line) { Room.outlines.remove(p.line); p.line.geometry.dispose(); }
  const pts = poly.map(([x, z]) => new V3(x, 0.003, z));
  p.line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), outlineMat);
  p.line.matrixAutoUpdate = false;
  Room.outlines.add(p.line);
  if (p.occ) { occGroup.remove(p.occ); p.occ.geometry.dispose(); }
  p.occ = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)))), occMat);
  p.occ.matrixAutoUpdate = false; p.occ.renderOrder = -10; p.occ.matrix.copy(p.matrix).multiply(_occRot);
  occGroup.add(p.occ);
}
function setPlaneMatrix(p, arr) {
  if (arr) p.matrix.fromArray(arr);
  p.inv.copy(p.matrix).invert();
  p.normal.set(0, 1, 0).transformDirection(p.matrix);
  p.center.setFromMatrixPosition(p.matrix);
  p.vertical = Math.abs(p.normal.y) < 0.5;
  if (p.line) p.line.matrix.copy(p.matrix);
  if (p.occ) p.occ.matrix.copy(p.matrix).multiply(_occRot);
}
function newPlane(label, real) {
  return { real, label: label || '', matrix: new THREE.Matrix4(), inv: new THREE.Matrix4(), normal: new V3(), center: new V3(), poly: [], area: 0, vertical: false, lastChanged: -1, line: null };
}
function removePlane(p) {
  if (p.line) { Room.outlines.remove(p.line); p.line.geometry.dispose(); }
  if (p.occ) { occGroup.remove(p.occ); p.occ.geometry.dispose(); }
  const i = Room.planes.indexOf(p); if (i >= 0) Room.planes.splice(i, 1);
}

function updateRealPlanes(frame, ref) {
  const det = frame.detectedPlanes;
  if (!det) return;
  const seen = new Set();
  det.forEach((xp) => {
    const pose = frame.getPose(xp.planeSpace, ref);
    if (!pose) return;
    seen.add(xp);
    let p = Room.map.get(xp);
    if (!p) { p = newPlane(xp.semanticLabel, true); Room.map.set(xp, p); Room.planes.push(p); }
    setPlaneMatrix(p, pose.transform.matrix);
    if (xp.lastChangedTime !== p.lastChanged) {
      p.lastChanged = xp.lastChangedTime;
      setPlanePoly(p, Array.from(xp.polygon, (q) => [q.x, q.z]));
      p.line.matrix.copy(p.matrix);
    }
  });
  for (const [xp, p] of Room.map) if (!seen.has(xp)) { removePlane(p); Room.map.delete(xp); }
  if (Room.map.size > 0 && !Room.haveReal) {
    Room.haveReal = true;
    if (Room.fallback) clearFallback();
  }
  computeFloor();
}
// Quest kann Planes mehrerer gescannter Räume liefern (auch anderer Stockwerke).
// Boden = nächster Boden unter dem Kopf, Decke = nächste Decke darüber; alles außerhalb wird ignoriert.
function containsXZ(p, pos) { _la.copy(pos).applyMatrix4(p.inv); return pip(_la.x, _la.z, p.poly); }
function computeFloor() {
  const head = Player.head;
  let floor = null, floorIn = false, ceil = null, ceilIn = false;
  for (const p of Room.planes) {
    if (p.vertical || !p.poly.length) continue;
    const y = p.center.y;
    if (p.label === 'floor' && y < head.y - 0.3) {
      const inside = containsXZ(p, head);
      if (!floor || (inside && !floorIn) || (inside === floorIn && y > floor.center.y)) { floor = p; floorIn = inside; }
    }
    if (p.label === 'ceiling' && y > head.y) {
      const inside = containsXZ(p, head);
      if (!ceil || (inside && !ceilIn) || (inside === ceilIn && y < ceil.center.y)) { ceil = p; ceilIn = inside; }
    }
  }
  Room.floorPlane = floor; Room.ceilPlane = ceil;
  Room.floorY = floor ? floor.center.y : 0;
  Room.ceilY = ceil ? ceil.center.y : Room.floorY + 3.0;
  Room.active = Room.planes.filter((p) => p.poly.length && p.center.y > Room.floorY - 0.35 && p.center.y < Room.ceilY + 0.15);
  for (const p of Room.planes) { const a = Room.active.includes(p); if (p.line) p.line.visible = a; if (p.occ) p.occ.visible = a && p.real; }
}
// Ersatzraum, falls keine Raumdaten vorliegen (5 x 5 m um den Spieler)
function buildFallback() {
  Room.fallback = true;
  const c = Player.head.clone(); c.y = 0;
  const S = 2.5, H = 2.6;
  const make = (pos, normal, w, h, label) => {
    const p = newPlane(label, false);
    const y = normal.clone();
    const x = Math.abs(y.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0).cross(y).normalize();
    const z = new V3().crossVectors(x, y);
    p.matrix.makeBasis(x, y, z).setPosition(pos);
    setPlaneMatrix(p);
    setPlanePoly(p, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
    p.line.matrix.copy(p.matrix);
    Room.planes.push(p);
  };
  make(new V3(c.x + S, H / 2, c.z), new V3(-1, 0, 0), 2 * S, H, 'wall');
  make(new V3(c.x - S, H / 2, c.z), new V3(1, 0, 0), 2 * S, H, 'wall');
  make(new V3(c.x, H / 2, c.z + S), new V3(0, 0, -1), 2 * S, H, 'wall');
  make(new V3(c.x, H / 2, c.z - S), new V3(0, 0, 1), 2 * S, H, 'wall');
  make(new V3(c.x, 0, c.z), new V3(0, 1, 0), 2 * S, 2 * S, 'floor');
  make(new V3(c.x, H, c.z), new V3(0, -1, 0), 2 * S, 2 * S, 'ceiling');
  computeFloor();
}
function clearFallback() {
  for (const p of Room.planes.slice()) if (!p.real) removePlane(p);
  Room.fallback = false;
  computeFloor();
}

// Segment a->b gegen alle Ebenen. Liefert nächsten Treffer.
const _la = new V3(), _lb = new V3();
function raycastPlanes(a, b) {
  let best = null, bestT = Infinity, side = 1;
  for (const p of Room.active) {
    _la.copy(a).applyMatrix4(p.inv); _lb.copy(b).applyMatrix4(p.inv);
    if ((_la.y > 0) === (_lb.y > 0)) continue;
    const t = _la.y / (_la.y - _lb.y);
    if (t >= bestT) continue;
    const x = _la.x + (_lb.x - _la.x) * t, z = _la.z + (_lb.z - _la.z) * t;
    if (x < p.min[0] || x > p.max[0] || z < p.min[1] || z > p.max[1] || !pip(x, z, p.poly)) continue;
    bestT = t; best = p; side = _la.y > 0 ? 1 : -1;
  }
  if (!best) return null;
  return { plane: best, t: bestT, point: a.clone().lerp(b, bestT), normal: best.normal.clone().multiplyScalar(side) };
}
// Freier Punkt: vom Kopf aus Richtung target, aber vor der ersten Wand stoppen
function clampToRoom(from, to, margin = 0.35) {
  const h = raycastPlanes(from, to);
  if (!h) return to;
  const dir = to.clone().sub(from).normalize();
  return h.point.addScaledVector(dir, -margin);
}
function roomFacingNormal(p) {
  const n = p.normal.clone();
  const toHead = Player.head.clone().sub(p.center);
  if (n.dot(toHead) < 0) n.negate();
  return n;
}
// Punkt ist vom Kopf aus sichtbar (keine andere Fläche dazwischen)
function visibleFromHead(w, plane) {
  const dir = w.clone().sub(Player.head); const len = dir.length(); dir.normalize();
  const h = raycastPlanes(Player.head, Player.head.clone().addScaledVector(dir, plane ? len + 0.05 : len));
  if (!plane) return !h;
  return !!h && (h.plane === plane || h.point.distanceTo(w) < 0.15);
}
// Zufallspunkt auf einer Wand in Wurfhöhe
function randomWallPoint(minDist = 1.0) {
  const walls = Room.active.filter((p) => p.vertical && p.area > 0.5 && p.poly.length >= 3 && !/window|door/.test(p.label));
  if (!walls.length) return null;
  const local = new V3();
  for (let tries = 0; tries < 80; tries++) {
    const p = pick(walls);
    local.set(rand(p.min[0], p.max[0]), 0, rand(p.min[1], p.max[1]));
    if (!pip(local.x, local.z, p.poly)) continue;
    const w = local.clone().applyMatrix4(p.matrix);
    const hgt = w.y - Room.floorY;
    if (hgt < 0.45 || hgt > 1.7) continue;
    const flat = new V3(w.x - Player.head.x, 0, w.z - Player.head.z).length();
    if (flat < minDist && tries < 60) continue;
    if (Game.breaches.some((b) => b.pos.distanceTo(w) < 0.9) && tries < 70) continue;
    if (!visibleFromHead(w, p)) continue;
    return { pos: w, normal: roomFacingNormal(p), plane: p };
  }
  return null;
}
function randomCeilingPoint() {
  const p = Room.ceilPlane; if (!p) return null;
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(0, Math.PI * 2), r = rand(0.9, 1.6);
    const w = new V3(Player.head.x + Math.cos(a) * r, p.center.y, Player.head.z + Math.sin(a) * r);
    const l = w.clone().applyMatrix4(p.inv);
    if (!pip(l.x, l.z, p.poly)) continue;
    if (!visibleFromHead(w, p)) continue;
    return { pos: w, normal: roomFacingNormal(p), plane: p };
  }
  return null;
}
function randomSurfacePoint() {
  const tops = Room.active.filter((p) => !p.vertical && p.label !== 'floor' && p.label !== 'ceiling' && p.center.y > Room.floorY + 0.25 && p.center.y < Room.floorY + 1.4 && p.area > 0.08);
  const local = new V3();
  for (let tries = 0; tries < 40 && tops.length; tries++) {
    const p = pick(tops);
    local.set(rand(p.min[0], p.max[0]) * 0.7, 0, rand(p.min[1], p.max[1]) * 0.7);
    if (!pip(local.x, local.z, p.poly)) continue;
    const w = local.clone().applyMatrix4(p.matrix);
    if (!visibleFromHead(w.clone().add(new V3(0, 0.05, 0)), null)) continue;
    return w;
  }
  // sonst: Boden im Raum, 1-2 m entfernt
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(0, Math.PI * 2), r = rand(1.0, 2.0);
    const target = new V3(Player.head.x + Math.cos(a) * r, Player.head.y, Player.head.z + Math.sin(a) * r);
    const p = clampToRoom(Player.head, target, 0.4);
    if (p.distanceTo(Player.head) > 0.7) { p.y = Room.floorY; return p; }
  }
  return new V3(Player.head.x + 1, Room.floorY, Player.head.z);
}

// ---------------------------------------------------------------- Spieler
const Player = {
  head: new V3(0, 1.6, 0), fwd: new V3(0, 0, -1), quat: new THREE.Quaternion(),
  hp: 5, maxHp: 5, score: 0, combo: 0, comboT: 0, invuln: 0, power: { triple: 0, rapid: 0, slow: 0 },
  hurt(n = 1) {
    if (this.invuln > 0 || Game.state !== 'play') return;
    this.hp -= n; this.invuln = 0.8; this.combo = 0;
    Sound.hurt(); Vignette.hit(); Hands.buzzAll(1, 200);
    HUD.dirty = true;
    if (this.hp <= 0) Game.over();
  },
  addScore(base, pos, extra = '') {
    this.combo++; this.comboT = 2.5;
    const mult = Math.min(1 + Math.floor(this.combo / 3), 8);
    const pts = base * mult;
    this.score += pts; HUD.dirty = true;
    popup(pos, `+${pts}${mult > 1 ? ' x' + mult : ''}${extra}`, extra ? '#ffe14f' : '#8ffcff');
  },
};
const Vignette = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0033, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const m = new THREE.Mesh(G.sphere, mat); m.scale.setScalar(0.25); m.renderOrder = 100; scene.add(m);
  let t = 0;
  return { hit() { t = 1; mat.color.set(0xff0033); }, tint(c) { t = 0.8; mat.color.set(c); }, update(dt) { t = Math.max(0, t - dt * 2.2); if (Game.slowT > 0 && t < 0.25) { t = 0.25; mat.color.set(0x6a3cff); } mat.opacity = t * 0.45; m.visible = t > 0; m.position.copy(Player.head); } };
})();

// ---------------------------------------------------------------- Hände / Controller
const gunMetal = new THREE.MeshPhongMaterial({ color: 0x2a2d3a, specular: 0x9fb4ff, shininess: 140, flatShading: false });
const gunDark = new THREE.MeshPhongMaterial({ color: 0x12131a, specular: 0x444a66, shininess: 60 });
const gunTrim = new THREE.MeshPhongMaterial({ color: 0xd8dde8, specular: 0xffffff, shininess: 200 });
const coreShader = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uHeat: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uHeat;
    void main(){ float a = vUv.x*6.2831; float y = vUv.y;
      float h1 = 0.5+0.5*sin(a*3.0 + y*18.0 - uTime*(8.0+uHeat*20.0));
      float h2 = 0.5+0.5*sin(-a*2.0 + y*11.0 - uTime*(5.0+uHeat*14.0));
      float e = pow(h1*h2, 2.0);
      vec3 cold = vec3(0.2,0.95,1.0), warm = vec3(1.0,0.55,0.15), hot = vec3(1.0,0.15,0.2);
      vec3 c = uHeat < 0.6 ? mix(cold, warm, uHeat/0.6) : mix(warm, hot, (uHeat-0.6)/0.4);
      gl_FragColor = vec4(c*(0.35+1.4*e), 0.35+0.65*e); }`,
});
function buildBlaster() {
  const g = new THREE.Group();
  const gun = new THREE.Group(); g.add(gun); // Rückstoß-Gruppe
  // Rumpf: Seitenprofil extrudiert
  const prof = new THREE.Shape();
  prof.moveTo(0.05, -0.012); prof.lineTo(0.03, -0.022); prof.lineTo(-0.075, -0.022); prof.lineTo(-0.105, -0.008);
  prof.lineTo(-0.11, 0.012); prof.lineTo(-0.06, 0.024); prof.lineTo(0.02, 0.024); prof.lineTo(0.055, 0.012); prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 });
  bodyGeo.translate(0, 0, -0.016); bodyGeo.rotateY(Math.PI / 2); // Längsachse -> -Z
  const body = new THREE.Mesh(bodyGeo, gunMetal); body.position.set(0, 0.004, -0.02); gun.add(body);
  // Griff
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.032), gunDark); grip.position.set(0, -0.045, 0.045); grip.rotation.x = 0.35; gun.add(grip);
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.034), gunTrim); r.position.set(0, -0.025 - i * 0.014, 0.039 + i * 0.005); r.rotation.x = 0.35; gun.add(r); }
  // Abzugsbügel
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0025, 6, 12, Math.PI), gunDark); guard.position.set(0, -0.022, 0.012); guard.rotation.set(0, Math.PI / 2, Math.PI); gun.add(guard);
  // Leuchtlinien an den Seiten
  for (const sx of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.003, 0.11), M.gunGlow); line.position.set(sx * 0.0215, 0.004, -0.03); gun.add(line);
    const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.003, 0.05), M.gunGlow); line2.position.set(sx * 0.0215, -0.009, -0.06); gun.add(line2);
  }
  // Energiekern: Glasrohr oben mit Wirbelshader
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 16, 1, true).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x99ddff, transparent: true, opacity: 0.25, shininess: 200, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.set(0, 0.034, -0.015); gun.add(glass);
  const coreMat = coreShader.clone();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.066, 16, 1, true).rotateX(Math.PI / 2), coreMat);
  core.position.copy(glass.position); gun.add(core);
  for (const z of [-0.052, 0.022]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12).rotateX(Math.PI / 2), gunTrim); cap.position.set(0, 0.034, z); gun.add(cap); }
  // Lauf mit Beschleunigerringen
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.07, 14).rotateX(Math.PI / 2), gunDark); barrel.position.set(0, 0.004, -0.115); gun.add(barrel);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0155, 0.0022, 6, 6), M.gunGlow.clone()); ring.position.set(0, 0.004, -0.095 - i * 0.02); gun.add(ring); rings.push(ring);
  }
  // drei Gabelzinken um die Mündung
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.05), gunTrim);
    prong.position.set(Math.cos(a) * 0.017, 0.004 + Math.sin(a) * 0.017, -0.15); prong.lookAt(new V3(Math.cos(a) * 0.009, 0.004 + Math.sin(a) * 0.009, -0.2)); gun.add(prong);
    const pt = new THREE.Mesh(G.sphere, M.gunGlow); pt.scale.setScalar(0.003); pt.position.set(Math.cos(a) * 0.012, 0.004 + Math.sin(a) * 0.012, -0.172); gun.add(pt);
  }
  const tip = new THREE.Mesh(G.sphere, additive(0x38f3ff, 0.9)); tip.scale.setScalar(0.02); tip.position.set(0, 0.004, -0.17); gun.add(tip);
  // Holo-Visier mit Hitzeanzeige
  const sightTex = canvasTex(128, 128, () => {});
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: sightTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  sight.position.set(0, 0.058, 0.0); gun.add(sight);
  const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.004), gunDark); sightPost.position.set(0, 0.046, 0.0); gun.add(sightPost);
  // Ziellaser
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(0, 0, 0), new V3(0, 0, -1)]);
  const laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  laser.position.set(0, 0.004, -0.17); g.add(laser);
  g.userData = { tip, laser, gun, rings, coreMat, sightTex, kick: 0, heat: 0, overheat: 0, lastSight: -1 };
  return g;
}
function drawSight(u) {
  const key = Math.round(u.heat * 20) + (u.overheat > 0 ? 100 : 0);
  if (key === u.lastSight) return; u.lastSight = key;
  const g = u.sightTex.userData.g; g.clearRect(0, 0, 128, 128);
  const col = u.overheat > 0 ? '#ff3355' : '#38f3ff';
  g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 40); g.moveTo(64, 88); g.lineTo(64, 108); g.moveTo(20, 64); g.lineTo(40, 64); g.moveTo(88, 64); g.lineTo(108, 64); g.stroke();
  g.strokeStyle = u.heat > 0.7 ? '#ff5533' : '#ffe14f'; g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 52, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * Math.min(u.heat, 1))); g.stroke();
  u.sightTex.needsUpdate = true;
}
function buildShield() {
  const g = new THREE.Group();
  const shape = new THREE.CircleGeometry(0.19, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(shape, mat); g.add(disc);
  const rim = new THREE.LineLoop(new THREE.EdgesGeometry(shape), new THREE.LineBasicMaterial({ color: 0x8ffcff }));
  g.add(rim);
  const hex = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.06, 6), new THREE.MeshBasicMaterial({ color: 0x8ffcff, side: THREE.DoubleSide })); g.add(hex);
  g.position.set(0, 0, -0.1);
  g.userData.mat = mat;
  return g;
}
const dot = new THREE.Mesh(G.sphere, additive(0x38f3ff, 1)); dot.scale.setScalar(0.03); scene.add(dot); dot.visible = false;

const Hands = {
  list: [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    scene.add(c);
    const h = { i, c, src: null, role: null, firing: false, fireT: 0, prev: new V3(), pos: new V3(), vel: new V3(), dir: new V3(), blaster: buildBlaster(), shield: buildShield(), shieldGlow: 0, hudAnchor: new THREE.Group() };
    c.add(h.blaster, h.shield, h.hudAnchor);
    h.blaster.visible = h.shield.visible = false;
    c.addEventListener('connected', (e) => { h.src = e.data; Hands.refresh(); });
    c.addEventListener('disconnected', () => { h.src = null; h.role = null; h.firing = false; Hands.refresh(); });
    c.addEventListener('selectstart', () => { h.firing = true; h.fireT = 0; Game.onTrigger(h); });
    c.addEventListener('selectend', () => { h.firing = false; });
    c.addEventListener('squeezestart', () => Hands.swap());
    return h;
  }),
  swapped: false,
  refresh() {
    const active = this.list.filter((h) => h.src);
    for (const h of active) h.role = (h.src.handedness === 'left') !== this.swapped ? 'shield' : 'blaster';
    if (active.length === 1) active[0].role = 'blaster';
    if (active.length === 2 && active[0].role === active[1].role) { active[0].role = 'blaster'; active[1].role = 'shield'; }
    for (const h of this.list) {
      h.blaster.visible = h.role === 'blaster';
      h.shield.visible = h.role === 'shield';
    }
    HUD.attach();
  },
  swap() {
    this.swapped = !this.swapped;
    this.refresh();
  },
  get shieldHand() { return this.list.find((h) => h.src && h.role === 'shield'); },
  buzz(h, v, ms) { try { h?.src?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch (e) { /* ohne Haptik */ } },
  buzzAll(v, ms) { for (const h of this.list) this.buzz(h, v, ms); },
  update(dt) {
    for (const h of this.list) {
      h.c.updateMatrixWorld(true);
      h.prev.copy(h.pos);
      h.pos.setFromMatrixPosition(h.c.matrixWorld);
      if (dt > 0) h.vel.copy(h.pos).sub(h.prev).divideScalar(dt);
      h.dir.set(0, 0, -1).transformDirection(h.c.matrixWorld);
      if (!h.src) continue;
      if (h.role === 'blaster') {
        const u = h.blaster.userData;
        u.heat = Math.max(0, u.heat - dt * (u.overheat > 0 ? 0.55 : 0.4));
        if (u.overheat > 0) { u.overheat -= dt; if (Math.random() < dt * 30) Particles.burst(h.pos.clone().addScaledVector(h.dir, 0.05).add(new V3(0, 0.04, 0)), 0xdddddd, 1, 0.3, 0.008, -0.3, 0.8); }
        if (h.firing && Game.state === 'play' && u.overheat <= 0) {
          h.fireT -= dt;
          if (h.fireT <= 0) {
            Game.fire(h); const rapid = Player.power.rapid > 0; h.fireT = rapid ? 0.075 : 0.15; u.kick = 1; u.heat += rapid ? 0.02 : 0.085;
            if (u.heat >= 1) { u.overheat = 1.4; Sound.overheat(h.pos); Hands.buzz(h, 0.8, 250); popup(h.pos.clone().add(new V3(0, 0.1, 0)), 'ÜBERHITZT', '#ff3355', 0.035); }
          }
        }
        u.kick = Math.max(0, u.kick - dt * 9);
        u.gun.position.z = u.kick * 0.022; u.gun.rotation.x = u.kick * 0.12;
        u.coreMat.uniforms.uTime.value += dt; u.coreMat.uniforms.uHeat.value = Math.min(u.heat, 1);
        u.rings.forEach((r, i) => { r.rotation.z += dt * (2 + u.heat * 25) * (i % 2 ? -1 : 1); r.material.color.setRGB(0.22 + u.heat * 0.78, 0.95 - u.heat * 0.6, 1 - u.heat * 0.85); });
        drawSight(u);
        // Laser + Punkt auf Oberfläche
        const muzzle = h.pos.clone().addScaledVector(h.dir, 0.15);
        const hit = raycastPlanes(muzzle, muzzle.clone().addScaledVector(h.dir, 10));
        const len = hit ? hit.t * 10 : 3;
        h.blaster.userData.laser.scale.set(1, 1, len);
        if (hit) { dot.visible = true; dot.position.copy(hit.point).addScaledVector(hit.normal, 0.005); } else dot.visible = false;
        h.blaster.userData.tip.scale.setScalar(0.014 + h.blaster.userData.kick * 0.03);
      } else if (h.role === 'shield') {
        h.shieldGlow = Math.max(0, h.shieldGlow - dt * 3);
        h.shield.userData.mat.opacity = 0.22 + h.shieldGlow * 0.6;
      }
    }
    if (!this.list.some((h) => h.src && h.role === 'blaster')) dot.visible = false;
    // B/Y halten (xr-standard Button 5) = Spiel beenden
    const held = this.list.some((h) => h.src?.gamepad?.buttons?.[5]?.pressed);
    if (held) {
      this.exitT = (this.exitT || 0) + dt;
      const left = Math.max(0, 1 - this.exitT);
      if (!this.exitShown || Math.floor(left * 10) !== this.exitShown) { this.exitShown = Math.floor(left * 10); Banner.show('BEENDEN …', 'B/Y gedrückt halten', '#ff3fb4', 0.3); }
      if (this.exitT >= 1) { this.exitT = 0; renderer.xr.getSession()?.end(); }
    } else { this.exitT = 0; this.exitShown = 0; }
  },
};

// ---------------------------------------------------------------- HUD (am Schild-Handgelenk) & Banner
const HUD = (() => {
  const tex = canvasTex(512, 200, () => {});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0586), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.position.set(0, 0.07, 0.02); mesh.rotation.x = -0.6; mesh.renderOrder = 5;
  const H = {
    dirty: true, mesh,
    attach() {
      const h = Hands.shieldHand || Hands.list.find((x) => x.src);
      if (h) h.hudAnchor.add(mesh); else scene.remove(mesh);
    },
    draw() {
      const g = tex.userData.g; g.clearRect(0, 0, 512, 200);
      g.fillStyle = 'rgba(10,4,30,0.72)'; g.beginPath(); g.roundRect(4, 4, 504, 192, 24); g.fill();
      g.strokeStyle = '#38f3ff'; g.lineWidth = 3; g.stroke();
      g.font = '900 30px system-ui,sans-serif'; g.fillStyle = '#8ffcff'; g.textBaseline = 'top';
      g.fillText(`WELLE ${Game.wave}`, 24, 18);
      g.textAlign = 'right'; g.fillStyle = '#ffe14f';
      const mult = Math.min(1 + Math.floor(Player.combo / 3), 8);
      if (mult > 1) g.fillText(`COMBO x${mult}`, 488, 18);
      g.textAlign = 'left'; g.font = '900 64px system-ui,sans-serif'; g.fillStyle = '#ffffff';
      g.fillText(String(Player.score), 24, 56);
      for (let i = 0; i < Player.maxHp; i++) {
        g.fillStyle = i < Player.hp ? '#ff2a6a' : 'rgba(255,255,255,0.15)';
        heart(g, 40 + i * 52, 160, 18);
      }
      g.textAlign = 'right'; g.font = '800 26px system-ui,sans-serif'; let py = 70;
      for (const k in POWER) if (Player.power[k] > 0) { g.fillStyle = POWER[k].css; g.fillText(`${POWER[k].label} ${Math.ceil(Player.power[k])}`, 488, py); py += 32; }
      g.textAlign = 'left';
      tex.needsUpdate = true; H.dirty = false;
    },
  };
  function heart(g, x, y, s) {
    g.beginPath(); g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); g.fill();
  }
  return H;
})();

const Banner = (() => {
  const tex = canvasTex(1024, 384, () => {});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  mesh.renderOrder = 20; scene.add(mesh); mesh.visible = false;
  let timer = 0, sticky = false;
  const target = new V3();
  return {
    show(title, sub = '', color = '#38f3ff', dur = 2.5) {
      const g = tex.userData.g; g.clearRect(0, 0, 1024, 384);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 120; g.font = `900 ${fs}px system-ui,sans-serif`; while (g.measureText(title).width > 960 && fs > 40) { fs -= 6; g.font = `900 ${fs}px system-ui,sans-serif`; } g.shadowColor = color; g.shadowBlur = 30;
      g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(title, 512, 130);
      g.fillStyle = color; g.fillText(title, 512, 130); g.shadowBlur = 0;
      g.font = '700 44px system-ui,sans-serif'; g.fillStyle = '#ffffff';
      sub.split('\n').forEach((line, i) => { g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 6; g.strokeText(line, 512, 250 + i * 56); g.fillText(line, 512, 250 + i * 56); });
      tex.needsUpdate = true; mesh.visible = true; timer = dur; sticky = dur <= 0;
      this.place(true);
    },
    hide() { mesh.visible = false; sticky = false; },
    place(snap) {
      const f = Player.fwd.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
      target.copy(Player.head).addScaledVector(f, 1.5); target.y = Player.head.y + 0.05;
      if (snap) mesh.position.copy(target);
    },
    update(dt) {
      if (!mesh.visible) return;
      if (!sticky) { timer -= dt; if (timer <= 0) { mesh.visible = false; return; } }
      this.place(false);
      mesh.position.lerp(target, 1 - Math.exp(-dt * 3));
      mesh.lookAt(Player.head);
      mesh.material.opacity = sticky ? 1 : Math.min(1, timer * 2);
    },
  };
})();

// ---------------------------------------------------------------- Risse (Portale in echten Wänden)
const portalMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform float uTime; uniform float uOpen; uniform float uHurt;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
      float jag = 0.82 + 0.12*sin(a*7.0+uTime*0.7) + 0.06*sin(a*13.0-uTime*1.3);
      float edge = jag*uOpen;
      if (r > edge) discard;
      float swirl = sin(a*5.0 + r*14.0 - uTime*4.0)*0.5+0.5;
      vec3 col = mix(vec3(0.02,0.0,0.06), vec3(0.35,0.05,0.55), swirl*(1.0-r));
      vec2 sp = vec2(a*6.0 + uTime*0.3, r*10.0 - uTime*0.8);
      float star = step(0.985, h(floor(sp*4.0)));
      col += star*vec3(0.6,0.9,1.0);
      float rim = smoothstep(edge-0.18, edge, r);
      col = mix(col, vec3(1.0,0.25,0.75), rim*0.8) + rim*rim*vec3(0.4,1.0,1.0)*0.6;
      col = mix(col, vec3(1.0), uHurt);
      gl_FragColor = vec4(col, 0.97);
    }`,
});

class Breach {
  constructor(spot, queue, opts = {}) {
    this.pos = spot.pos.clone(); this.normal = spot.normal.clone(); this.plane = spot.plane;
    this.queue = queue; this.radius = opts.radius || 0.32; this.hp = opts.hp || 3; this.maxHp = this.hp;
    this.interval = opts.interval || 2.5; this.t = 1.6; this.age = 0; this.dead = false; this.closing = 0; this.boss = !!opts.boss;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos).addScaledVector(this.normal, 0.006);
    this.group.lookAt(this.group.position.clone().add(this.normal));
    this.mat = portalMat.clone();
    this.portal = new THREE.Mesh(G.plane, this.mat); this.portal.scale.setScalar(this.radius * 2);
    this.cracks = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.cracks.position.z = -0.001; this.cracks.rotation.z = rand(0, Math.PI * 2); this.cracks.scale.setScalar(this.radius * 5);
    this.group.add(this.cracks, this.portal);
    scene.add(this.group);
    Sound.crack(this.pos);
    Particles.burst(this.pos, 0xd9c8b0, 18, 1.4, 0.02, 1, 1.2); // Putz bröckelt
    Corruption.onBreach(this);
  }
  lightShaft() {
    const h = this.pos.y - Room.floorY;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(this.radius * 0.8, this.radius * 1.8, h, 24, 1, true), mat);
    this.shaft.position.set(this.pos.x, Room.floorY + h / 2, this.pos.z); scene.add(this.shaft);
  }
  get open() { return this.age > 1.2 && !this.closing; }
  spawnPoint() { return this.pos.clone().addScaledVector(this.normal, 0.05); }
  update(dt) {
    this.age += dt;
    const u = this.mat.uniforms; u.uTime.value += dt; u.uHurt.value = Math.max(0, u.uHurt.value - dt * 4);
    if (this.shaft) this.shaft.material.opacity = (this.closing ? Math.max(0, 1 - this.closing) : Math.min(1, this.age * 0.5)) * (0.12 + 0.05 * Math.sin(this.age * 5));
    if (this.closing) {
      this.closing += dt * 2.5;
      u.uOpen.value = Math.max(0, 1 - this.closing);
      this.cracks.material.opacity = Math.max(0, 1 - this.closing);
      if (this.closing >= 1) this.remove();
      return;
    }
    // Aufbrechen: erst Risse, dann Portal
    this.cracks.material.opacity = Math.min(1, this.age * 1.5);
    u.uOpen.value = THREE.MathUtils.smoothstep(this.age, 0.6, 1.4) * (1 + 0.03 * Math.sin(this.age * 6));
    if (this.age < 1.2) { if (Math.random() < dt * 25) Particles.burst(this.pos, 0xd9c8b0, 2, 0.8, 0.012, 1, 1); return; }
    if (this.queue.length && Game.state === 'play') {
      this.t -= dt;
      if (this.t <= 0) { Game.spawnEnemy(this.queue.shift(), this); this.t = this.interval * rand(0.7, 1.3); }
    } else if (!this.queue.length && !this.boss) {
      this.idle = (this.idle || 0) + dt;
      if (this.idle > 2.5) this.close(false);
    }
  }
  damage(point) {
    if (!this.open || this.boss) { Particles.burst(point, 0xff3fb4, 4, 1, 0.012); return; }
    this.hp--; this.mat.uniforms.uHurt.value = 1;
    Particles.burst(point, 0xff3fb4, 10, 1.6, 0.015);
    Sound.hit(point);
    if (this.hp <= 0) {
      Player.addScore(400 + 100 * Game.wave, this.pos.clone().addScaledVector(this.normal, 0.15), ' VERSIEGELT');
      Sound.seal(this.pos); flash(this.pos, 0x8ffcff, 1.0, 0.4);
      Particles.burst(this.pos, 0x8ffcff, 40, 2.5, 0.025);
      this.queue.length = 0; this.close(true);
    }
  }
  close() { if (!this.closing) this.closing = 0.0001; }
  remove() { this.dead = true; scene.remove(this.group); this.mat.dispose(); this.cracks.material.dispose(); if (this.shaft) { scene.remove(this.shaft); this.shaft.material.dispose(); } }
}

// ---------------------------------------------------------------- Gegner
const _tmp = new V3();
class Enemy {
  constructor(breach, r, hp, pts) {
    this.breach = breach; this.r = r; this.hp = hp; this.pts = pts; this.dead = false; this.t = 0;
    this.pos = breach.spawnPoint(); this.vel = new V3();
    this.group = new THREE.Group(); this.group.position.copy(this.pos); scene.add(this.group);
    this.hitFlash = 0;
  }
  hit(dmg, point, bolt) {
    if (this.dead) return false;
    this.hp -= dmg; this.hitFlash = 0.12;
    Particles.burst(point || this.pos, this.color, 8, 1.4, 0.014);
    Sound.hit(this.pos);
    if (this.hp <= 0) { this.die(bolt); return true; }
    return false;
  }
  die(bolt) {
    this.dead = true;
    let extra = '';
    let base = this.pts;
    if (bolt && bolt.bounces > 0) { base *= 1 + bolt.bounces; extra = ` BANDE x${1 + bolt.bounces}`; }
    if (bolt && bolt.reflected) { base *= 2; extra = ' KONTER'; }
    if (bolt && bolt.melee) { base *= 2; extra = ' SCHLAG'; }
    const isBoss = this instanceof Boss;
    const chance = isBoss ? 1 : this.brute ? 0.45 : this instanceof Drone ? 0.18 : 0.09;
    if (Math.random() < chance) for (let i = 0; i < (isBoss ? 2 : 1); i++) Game.powerups.push(new PowerUp(this.pos.clone().add(new V3(rand(-0.2, 0.2), 0.1, rand(-0.2, 0.2))), pick(Object.keys(POWER))));
    Player.addScore(base, this.pos.clone().add(new V3(0, this.r + 0.08, 0)), extra);
    Particles.burst(this.pos, this.color, 30, 2.2, 0.03 * (this.r / 0.08));
    if (!(this instanceof Boss)) { const fp = this.pos.clone(); fp.y = Room.floorY; for (let i = 0; i < 2 + (this.brute ? 3 : 0); i++) Corruption.addCrystal(fp.clone().add(new V3(rand(-0.12, 0.12), 0, rand(-0.12, 0.12))), new V3(0, 1, 0), rand(0.02, 0.05) * (this.brute ? 1.6 : 1), this.color); }
    flash(this.pos, this.color, this.r * 5, 0.3);
    Sound.explode(this.pos, this.r > 0.2);
    this.remove();
  }
  remove() { this.dead = true; scene.remove(this.group); if (this.shadow) scene.remove(this.shadow); if (this.bar) scene.remove(this.bar); }
  flashMat(mesh, normal) { mesh.material = this.hitFlash > 0 ? M.crawlerHot : normal; }
}

class Crawler extends Enemy {
  constructor(breach, brute = false) {
    const s = brute ? 1.9 : 1;
    super(breach, 0.075 * s, brute ? 6 : 1, brute ? 350 : 100);
    this.brute = brute; this.s = s; this.color = brute ? 0xff8a1f : 0x29e6ff; this.mat = brute ? M.brute : M.crawler;
    this.phase = 'emerge'; this.speed = (brute ? 0.22 : 0.38) + Game.wave * 0.025; this.wob = rand(0, 10); this.side = Math.random() < 0.5 ? -1 : 1;
    this.body = new THREE.Mesh(G.crystal, this.mat); this.body.scale.set(0.07 * s, 0.05 * s, 0.09 * s);
    this.head = new THREE.Mesh(G.crystal, this.mat); this.head.scale.set(0.035 * s, 0.035 * s, 0.04 * s); this.head.position.set(0, 0.01 * s, -0.08 * s);
    const e1 = new THREE.Mesh(G.sphere, M.eye); e1.scale.setScalar(0.009 * s); e1.position.set(-0.016 * s, 0.025 * s, -0.105 * s);
    const e2 = e1.clone(); e2.position.x *= -1;
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const L = new THREE.Mesh(G.leg, M.leg); const side = i < 3 ? -1 : 1; const k = i % 3;
      L.position.set(side * 0.045 * s, 0, (k - 1) * 0.045 * s); L.rotation.z = side * 1.0; L.scale.setScalar(s); L.userData = { side, k };
      this.legs.push(L); this.group.add(L);
    }
    if (brute) { for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(G.crystal, this.mat); sp.scale.set(0.015 * s, 0.05 * s, 0.015 * s); sp.position.set(0, 0.05 * s, (i - 1) * 0.04 * s); this.group.add(sp); } }
    this.group.add(this.body, this.head, e1, e2);
    this.shadow = new THREE.Mesh(G.plane, M.shadow); this.shadow.rotation.x = -Math.PI / 2; this.shadow.scale.setScalar(0.22 * s); scene.add(this.shadow);
    const ug = new THREE.Mesh(G.plane, additive(this.color, 0.55)); ug.rotation.x = -Math.PI / 2; ug.position.y = 0.002; ug.scale.setScalar(2.2); this.shadow.add(ug);
    const eg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffee55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 })); eg.scale.setScalar(0.06 * s); eg.position.set(0, 0.025 * s, -0.11 * s); this.group.add(eg);
    this.start = this.pos.clone(); this.out = this.pos.clone().addScaledVector(breach.normal, 0.25 * s);
    this.group.lookAt(this.group.position.clone().sub(breach.normal)); this.group.rotateY(Math.PI);
    this.group.scale.setScalar(0.01);
  }
  update(dt) {
    this.t += dt; this.hitFlash -= dt;
    this.flashMat(this.body, this.mat); this.flashMat(this.head, this.mat);
    const floor = Room.floorY + 0.045 * this.s;
    if (this.phase === 'emerge') {
      const k = Math.min(this.t / 0.7, 1);
      this.pos.lerpVectors(this.start, this.out, k); this.group.scale.setScalar(0.3 + 0.7 * k);
      if (k >= 1) { this.phase = 'fall'; this.vel.copy(this.breach.normal).multiplyScalar(0.6); this.vel.y = 0.8; }
    } else if (this.phase === 'fall') {
      this.vel.y -= 9.8 * dt; this.pos.addScaledVector(this.vel, dt);
      this.group.rotation.x += dt * 6;
      if (this.pos.y <= floor) {
        this.pos.y = floor; this.phase = 'walk'; this.group.rotation.set(0, 0, 0);
        Particles.burst(this.pos, 0xbbbbbb, 6, 0.6, 0.01); if (this.brute) Sound.explode(this.pos, false);
      }
    } else if (this.phase === 'walk') {
      const to = _tmp.set(Player.head.x - this.pos.x, 0, Player.head.z - this.pos.z);
      const d = to.length(); to.normalize();
      const lateral = new V3(-to.z, 0, to.x).multiplyScalar(Math.sin(this.t * 2.2 + this.wob) * 0.6 * this.side);
      const dir = to.clone().add(lateral).normalize();
      const next = this.pos.clone().addScaledVector(dir, this.speed * dt);
      if (!raycastPlanes(this.pos.clone().setY(floor + 0.05), next.clone().setY(floor + 0.05))) this.pos.copy(next);
      else this.pos.addScaledVector(to, this.speed * dt);
      this.pos.y = floor;
      this.group.rotation.y = Math.atan2(-dir.x, -dir.z);
      for (const L of this.legs) L.rotation.x = Math.sin(this.t * 18 + L.userData.k * 2 + (L.userData.side > 0 ? Math.PI : 0)) * 0.5;
      this.body.position.y = Math.abs(Math.sin(this.t * 18)) * 0.006 * this.s;
      if (d < 0.55) { this.phase = 'leap'; this.t = 0; this.leapFrom = this.pos.clone(); }
    } else if (this.phase === 'leap') {
      const k = this.t / 0.55;
      const target = Player.head.clone().add(new V3(0, -0.15, 0));
      this.pos.lerpVectors(this.leapFrom, target, k); this.pos.y += Math.sin(k * Math.PI) * 0.35;
      this.group.rotation.x = -k * 1.2;
      if (k >= 1) {
        Player.hurt(this.brute ? 2 : 1);
        Particles.burst(this.pos, this.color, 20, 2, 0.02); Sound.explode(this.pos, false);
        this.remove(); return;
      }
    }
    this.group.position.copy(this.pos);
    this.shadow.position.set(this.pos.x, Room.floorY + 0.002, this.pos.z);
    this.shadow.visible = this.phase !== 'emerge';
  }
}

class Drone extends Enemy {
  constructor(breach) {
    super(breach, 0.09, 2, 220);
    this.color = 0xc86bff;
    this.core = new THREE.Mesh(G.crystal, M.drone); this.core.scale.set(0.06, 0.09, 0.06);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 20), M.drone); this.ring.rotation.x = Math.PI / 2;
    this.eye = new THREE.Mesh(G.sphere, M.eye); this.eye.scale.setScalar(0.022);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc86bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    this.glow.scale.setScalar(0.3);
    this.group.add(this.core, this.ring, this.eye, this.glow);
    this.shootT = rand(2.0, 3.0); this.target = this.pickTarget(); this.retarget = rand(3, 5);
    this.group.scale.setScalar(0.01);
  }
  pickTarget() {
    const toB = this.breach.pos.clone().sub(Player.head); toB.y = 0; toB.normalize();
    const a = rand(-1.0, 1.0); const r = rand(1.1, 1.9);
    const dir = toB.applyAxisAngle(new V3(0, 1, 0), a);
    const t = Player.head.clone().addScaledVector(dir, r); t.y = Player.head.y + rand(-0.25, 0.45);
    return clampToRoom(Player.head, t, 0.35);
  }
  update(dt) {
    this.t += dt; this.hitFlash -= dt;
    this.core.material = this.hitFlash > 0 ? M.crawlerHot : M.drone;
    this.group.scale.setScalar(Math.min(1, 0.2 + this.t * 1.2));
    this.retarget -= dt; if (this.retarget <= 0) { this.target = this.pickTarget(); this.retarget = rand(3, 5); }
    const to = this.target.clone().sub(this.pos);
    this.vel.addScaledVector(to, dt * 2.0).multiplyScalar(1 - dt * 1.6);
    this.pos.addScaledVector(this.vel, dt);
    this.group.position.copy(this.pos); this.group.position.y += Math.sin(this.t * 3) * 0.03;
    this.ring.rotation.z += dt * 4;
    this.group.lookAt(Player.head);
    if (Math.random() < dt * 25) Particles.burst(this.group.position.clone().add(new V3(0, -0.07, 0)), 0xc86bff, 1, 0.25, 0.01, -0.2, 0.5);
    if (this.t > 1.2) {
      this.shootT -= dt;
      this.eye.scale.setScalar(0.022 + (this.shootT < 0.6 ? 0.02 * (1 - this.shootT / 0.6) : 0));
      if (this.shootT <= 0) { this.shootT = rand(2.6, 4.0) * Math.max(0.55, 1 - Game.wave * 0.04); Game.enemyShot(this.group.position.clone(), Player.head); }
    }
  }
}

class Boss extends Enemy {
  constructor(breach, level) {
    super(breach, 0.3, 18 + level * 8, 5000 * level);
    this.color = 0xff3fb4; this.level = level;
    this.core = new THREE.Mesh(G.ico, M.boss); this.core.scale.setScalar(0.28);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3fb4, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    this.halo.scale.setScalar(1.3);
    this.group.add(this.core, this.halo);
    this.maxHp = this.hp;
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    bg.scale.set(0.62, 0.05, 1);
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: 0xff3fb4 }));
    this.fill.scale.set(0.6, 0.035, 1); this.fill.position.set(-0.3, 0, 0.001);
    this.bar.add(bg, this.fill); scene.add(this.bar);
    this.shards = [];
    this.makeShards();
    this.shootT = 2.5; this.spawnT = 6; this.regenT = 0; this.phaseA = 0;
    this.group.scale.setScalar(0.01);
    this.home = clampToRoom(Player.head, Player.head.clone().addScaledVector(breach.pos.clone().sub(Player.head).setY(0).normalize(), 2.2).setY(Player.head.y + 0.35), 0.6);
    Sound.boss(this.pos);
  }
  makeShards() {
    for (const s of this.shards) this.group.remove(s.mesh);
    this.shards = [];
    const n = 6 + Math.min(this.level, 3) * 2;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(G.crystal, M.shard); mesh.scale.set(0.05, 0.11, 0.05);
      this.group.add(mesh); this.shards.push({ mesh, hp: 2, a: (i / n) * Math.PI * 2, tilt: i % 2 ? 0.5 : -0.5, world: new V3() });
    }
  }
  hit(dmg, point, bolt) {
    if (this.shards.length) {
      Particles.burst(point || this.pos, 0x8ffcff, 6, 1.2, 0.012); Sound.shieldBlock(this.pos);
      popup(point || this.pos, 'SCHILD!', '#8ffcff', 0.05);
      return false;
    }
    const r = super.hit(dmg, point, bolt); HUD.dirty = true; return r;
  }
  hitShard(s, point) {
    s.hp--; Particles.burst(point, 0x8ffcff, 10, 1.6, 0.015); Sound.hit(point);
    if (s.hp <= 0) {
      this.group.remove(s.mesh); this.shards.splice(this.shards.indexOf(s), 1);
      Player.addScore(150, point); flash(point, 0x8ffcff, 0.3);
      if (!this.shards.length) { this.regenT = 9; popup(this.pos.clone().add(new V3(0, 0.45, 0)), 'KERN OFFEN!', '#ff3fb4', 0.09); Sound.reflect(this.pos); }
    }
  }
  die(bolt) {
    super.die(bolt);
    Particles.burst(this.pos, 0xffffff, 80, 3.5, 0.04, 0.6, 1.6);
    flash(this.pos, 0xff3fb4, 3, 0.8); Sound.explode(this.pos, true); Hands.buzzAll(1, 400);
    this.breach.close();
    Corruption.purge(this.pos.clone());
    Player.hp = Math.min(Player.maxHp, Player.hp + 2); HUD.dirty = true;
  }
  update(dt) {
    this.t += dt; this.hitFlash -= dt; this.phaseA += dt;
    this.core.material = this.hitFlash > 0 ? M.crawlerHot : M.boss;
    this.group.scale.setScalar(Math.min(1, 0.1 + this.t * 0.4));
    this.bar.position.copy(this.pos).add(new V3(0, 0.75 * this.group.scale.x, 0)); this.bar.lookAt(Player.head);
    this.fill.scale.x = 0.6 * Math.max(0, this.hp / this.maxHp);
    this.fill.material.color.set(this.shards.length ? 0x8ffcff : (Math.floor(this.t * 6) % 2 ? 0xff3fb4 : 0xffffff));
    const sway = new V3(Math.sin(this.phaseA * 0.6) * 0.6, Math.sin(this.phaseA * 1.1) * 0.15, 0);
    const right = new V3().subVectors(this.home, Player.head).setY(0).normalize(); right.set(-right.z, 0, right.x);
    const goal = this.t < 2.5 ? this.breach.pos.clone().addScaledVector(this.breach.normal, 0.5) : this.home.clone().addScaledVector(right, sway.x).add(new V3(0, sway.y, 0));
    this.pos.lerp(goal, 1 - Math.exp(-dt * 1.2));
    this.group.position.copy(this.pos);
    this.core.rotation.x += dt * 0.7; this.core.rotation.y += dt * 1.1;
    const open = !this.shards.length;
    this.halo.material.opacity = open ? 0.9 + 0.1 * Math.sin(this.t * 20) : 0.5;
    this.shards.forEach((s, i) => {
      s.a += dt * (1.2 + 0.2 * this.level);
      s.mesh.position.set(Math.cos(s.a) * 0.5, Math.sin(s.a * 2 + i) * 0.12 + s.tilt * Math.sin(s.a) * 0.4, Math.sin(s.a) * 0.5);
      s.mesh.rotation.y += dt * 3;
      s.world.copy(s.mesh.position).multiplyScalar(this.group.scale.x).add(this.pos);
    });
    if (open) { this.regenT -= dt; if (this.regenT <= 0) { this.makeShards(); popup(this.pos.clone().add(new V3(0, 0.45, 0)), 'SCHILD ZURÜCK', '#8ffcff', 0.06); } }
    if (this.t < 3) return;
    this.shootT -= dt;
    if (this.shootT <= 0) {
      this.shootT = Math.max(1.4, 2.6 - this.level * 0.3);
      const n = 3 + this.level;
      for (let i = 0; i < n; i++) {
        const tgt = Player.head.clone().add(new V3((i - (n - 1) / 2) * 0.35, rand(-0.15, 0.15), 0).applyQuaternion(Player.quat));
        Game.enemyShot(this.pos.clone(), tgt, 1.6);
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 7; this.breach.queue.push('crawler', 'crawler'); }
  }
}

// ---------------------------------------------------------------- Projektile
const boltGeo = new THREE.CapsuleGeometry(0.008, 0.09, 2, 6).rotateX(Math.PI / 2);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xbffcff });
const trailGeo = new THREE.CylinderGeometry(0.004, 0.018, 0.35, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.17);
const trailMat = new THREE.MeshBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
const starTex = canvasTex(64, 64, (g) => {
  g.translate(32, 32); g.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-2.5, 0); g.lineTo(0, 30); g.lineTo(2.5, 0); g.fill(); }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-14, -14, 28, 28);
});
function muzzleFlash(pos, dir) {
  const mat = new THREE.SpriteMaterial({ map: starTex, color: 0x9ffcff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, rotation: Math.random() * 6 }); mat.userData.own = true;
  const s = new THREE.Sprite(mat); s.position.copy(pos);
  addFx(s, 0.07, (o, k) => { o.scale.setScalar(0.07 * (1 + k)); o.material.opacity = 1 - k; });
}
const orbGeo = new THREE.IcosahedronGeometry(0.035, 1);
const orbMatE = new THREE.MeshBasicMaterial({ color: 0xff2a6a });
const orbMatP = new THREE.MeshBasicMaterial({ color: 0x38f3ff });

function segSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0;
  if (A < 1e-9) return -1;
  const disc = B * B - 4 * A * C; if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : -1;
}

// ---------------------------------------------------------------- Herz-Pickup
class Heart {
  constructor(pos) {
    this.pos = pos.clone(); this.pos.y += 0.12; this.t = 0; this.dead = false;
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    const shape = new THREE.Shape(); const s = 0.05;
    shape.moveTo(0, -s * 0.9); shape.bezierCurveTo(-s * 1.6, s * 0.2, -s * 0.6, s * 1.3, 0, s * 0.4); shape.bezierCurveTo(s * 0.6, s * 1.3, s * 1.6, s * 0.2, 0, -s * 0.9);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 8 }).center();
    this.mesh = new THREE.Mesh(geo, M.heart); this.group.add(this.mesh);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 0.5; this.group.add(beam);
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a6a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); g.scale.setScalar(0.3); this.group.add(g);
    scene.add(this.group);
    popup(this.pos.clone().add(new V3(0, 0.15, 0)), 'HERZ!', '#ff2a6a', 0.06);
  }
  update(dt) {
    this.t += dt; this.mesh.rotation.y += dt * 2; this.group.position.y = this.pos.y + Math.sin(this.t * 2.5) * 0.02;
    const touch = Hands.list.some((h) => h.src && h.pos.distanceTo(this.group.position) < 0.2) || Player.head.distanceTo(this.group.position) < 0.35;
    if (touch) {
      this.dead = true; scene.remove(this.group);
      Player.hp = Math.min(Player.maxHp, Player.hp + 1); HUD.dirty = true;
      Sound.pickup(this.pos); Particles.burst(this.group.position, 0xff2a6a, 25, 1.5, 0.02); Hands.buzzAll(0.6, 120);
      popup(this.group.position.clone(), '+1 LEBEN', '#ff2a6a');
    }
  }
  remove() { this.dead = true; scene.remove(this.group); }
}

// ---------------------------------------------------------------- Raumverwandlung (prozedural aus echten Raumdaten)
const MAX_SEEDS = 8;
const corruptMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uSeeds: { value: Array.from({ length: MAX_SEEDS }, () => new THREE.Vector4()) }, uTime: { value: 0 }, uLevel: { value: 0 }, uPurge: { value: 0 } },
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform vec4 uSeeds[${MAX_SEEDS}]; uniform float uTime; uniform float uLevel; uniform float uPurge;
    varying vec2 vP;
    vec2 h2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
    float vor(vec2 x){ vec2 n=floor(x), f=fract(x); float d1=8.0, d2=8.0;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=h2(n+g); o=0.5+0.42*sin(uTime*0.25+6.2831*o);
        float d=length(g+o-f); if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; } }
      return d2-d1; }
    void main(){
      float m=0.0, front=0.0, dmin=99.0;
      for(int i=0;i<${MAX_SEEDS};i++){ vec4 s=uSeeds[i]; if(s.z<=0.001) continue;
        float d=length(vP-s.xy); float r=s.z;
        float wob = 0.12*sin(atan(vP.y-s.y, vP.x-s.x)*5.0 + s.w*3.0 + uTime*0.4);
        float rr = r*(1.0+wob);
        m=max(m, smoothstep(rr, rr*0.55, d)); front=max(front, smoothstep(0.035,0.0,abs(d-rr))); dmin=min(dmin,d); }
      if(m<0.01 && front<0.01) discard;
      float v1 = 1.0-smoothstep(0.0,0.06,vor(vP*3.2));
      float v2 = uLevel > 0.35 ? (1.0-smoothstep(0.0,0.045,vor(vP*9.0+3.1)))*0.55*smoothstep(0.35,0.6,uLevel) : 0.0;
      float pulse = 0.5+0.5*sin(uTime*2.4 - dmin*8.0);
      vec3 cA=vec3(0.15,0.95,1.0), cB=vec3(1.0,0.2,0.75), cC=vec3(0.55,0.2,1.0);
      float k = h2(floor(vP*3.2)).x;
      vec3 col = mix(mix(cA,cC,k), cB, smoothstep(0.3,1.0,uLevel)*k);
      float veins = (v1*(0.45+0.55*pulse) + v2)*m;
      vec3 c = col*(0.35+veins*1.6) + front*vec3(1.0,0.6,1.0)*0.6;
      float a = veins + 0.18*m*(0.4+uLevel) + front*0.35;
      c = mix(c, vec3(1.0), uPurge);
      gl_FragColor = vec4(c, clamp(a,0.0,0.95)*(1.0-uPurge*0.6));
    }`,
});

const Corruption = {
  level: 0, debt: 0, time: 0, purgeT: 0, surfaces: new Map(), spreadT: 3, crystalT: 0,
  group: new THREE.Group(),
  init() {
    scene.add(this.group);
    // Kristallcluster (Instanced)
    const N = 420;
    this.N = N;
    this.crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).scale(0.35, 1, 0.35).translate(0, 0.7, 0),
      new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x2a1060, specular: 0xffffff, shininess: 150, flatShading: true, transparent: true, opacity: 0.92 }), N);
    this.crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.crystals.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) { this.crystals.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.crystals.setColorAt(i, c.set(0xffffff)); }
    this.cData = []; this.cNext = 0;
    scene.add(this.crystals);
    // Sporen
    const S = 260; this.S = S;
    const pos = new Float32Array(S * 3), col = new Float32Array(S * 3);
    this.sp = Array.from({ length: S }, () => ({ v: new V3(rand(-0.03, 0.03), rand(0.01, 0.06), rand(-0.03, 0.03)), ph: rand(0, 10) }));
    for (let i = 0; i < S; i++) { c.setHSL(rand(0.5, 0.92), 1, 0.65); col.set([c.r, c.g, c.b], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.spores = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, map: glowTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spores.frustumCulled = false; this.sporesInit = false;
    scene.add(this.spores);
  },
  surf(p) {
    let s = this.surfaces.get(p);
    if (s && s.poly !== p.poly) { this.group.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh = null; }
    if (!s) { s = { seeds: [], mesh: null, mat: corruptMat.clone() }; s.mat.uniforms.uSeeds.value = Array.from({ length: MAX_SEEDS }, () => new THREE.Vector4()); this.surfaces.set(p, s); }
    if (!s.mesh) {
      const shape = new THREE.Shape(p.poly.map(([x, z]) => new THREE.Vector2(x, z)));
      s.mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), s.mat); s.mesh.matrixAutoUpdate = false; s.mesh.renderOrder = 1; s.poly = p.poly;
      this.group.add(s.mesh);
    }
    return s;
  },
  addSeed(p, world, target) {
    if (!p || !p.poly.length) return;
    const s = this.surf(p);
    const l = world.clone().applyMatrix4(p.inv);
    const near = s.seeds.find((q) => Math.hypot(q.x - l.x, q.z - l.z) < q.r * 0.7);
    if (near) { near.target = Math.max(near.target, target); return; }
    if (s.seeds.length >= MAX_SEEDS) { s.seeds.sort((a, b) => b.r - a.r); s.seeds.pop(); }
    s.seeds.push({ x: l.x, z: l.z, r: 0.02, target, w: rand(0, 6) });
  },
  onBreach(b) {
    const L = this.level;
    this.addSeed(b.plane, b.pos, 0.5 + L * 1.8);
    // Fuß der Wand auf dem Boden infizieren
    if (Room.floorPlane) { const f = b.pos.clone().addScaledVector(b.normal, 0.25); f.y = Room.floorY; this.addSeed(Room.floorPlane, f, 0.35 + L * 1.5); }
  },
  // "Intelligente" Ausbreitung: bevorzugt dort, wo der Spieler hinschaut, und Richtung Spieler
  spread() {
    const L = this.level; if (L < 0.08) return;
    const cand = Room.active.filter((p) => p.poly.length && p.area > 0.15 && p.label !== 'window' && p.label !== 'door');
    if (!cand.length) return;
    let best = null, bestS = -1e9;
    for (let i = 0; i < 12; i++) {
      const p = pick(cand);
      const l = new V3(rand(p.min[0], p.max[0]), 0, rand(p.min[1], p.max[1]));
      if (!pip(l.x, l.z, p.poly)) continue;
      const w = l.applyMatrix4(p.matrix);
      const to = w.clone().sub(Player.head); const d = to.length(); to.normalize();
      let score = to.dot(Player.fwd) * 1.5 - Math.abs(d - 2.0) * 0.4 + Math.random() * 0.6;
      if (p === Room.ceilPlane && L < 0.5) score -= 2;
      const s = this.surfaces.get(p); if (s && s.seeds.length) score += 0.4; // Nachbarschaft wächst zusammen
      if (score > bestS) { bestS = score; best = { p, w }; }
    }
    if (best) this.addSeed(best.p, best.w, 0.3 + L * rand(0.8, 2.2));
  },
  spawnCrystalCluster() {
    const list = [...this.surfaces.entries()].filter(([p, s]) => s.seeds.length && Room.active.includes(p));
    if (!list.length) return;
    const [p, s] = pick(list); const seed = pick(s.seeds);
    const n = 2 + Math.floor(Math.random() * 4);
    const nn = roomFacingNormal(p); if (p === Room.floorPlane) nn.set(0, 1, 0);
    const base = new V3();
    for (let tries = 0; tries < 6; tries++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * seed.r * 0.85;
      const lx = seed.x + Math.cos(a) * r, lz = seed.z + Math.sin(a) * r;
      if (!pip(lx, lz, p.poly)) continue;
      base.set(lx, 0, lz).applyMatrix4(p.matrix);
      if (p === Room.floorPlane && Math.hypot(base.x - Player.head.x, base.z - Player.head.z) < 0.6) continue; // nicht unter die Füße
      const big = 0.5 + this.level;
      for (let k = 0; k < n; k++) {
        const up = nn.clone().add(new V3(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6))).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), up);
        const h = rand(0.03, 0.16) * big * (k === 0 ? 1.4 : 1);
        const pos = base.clone().add(new V3(rand(-0.04, 0.04), 0, rand(-0.04, 0.04)).projectOnPlane(nn));
        const i = this.cNext; this.cNext = (this.cNext + 1) % this.N;
        this.cData[i] = { pos, q, h, w: h * rand(0.25, 0.45), t: 0, grow: rand(0.6, 1.4), alive: true };
        this.crystals.setColorAt(i, new THREE.Color().setHSL(pick([0.5, 0.53, 0.78, 0.88]), 0.9, rand(0.55, 0.75)));
      }
      this.crystals.instanceColor.needsUpdate = true;
      return;
    }
  },
  addCrystal(pos, nn, h, color) {
    const i = this.cNext; this.cNext = (this.cNext + 1) % this.N;
    const up = nn.clone().add(new V3(rand(-0.7, 0.7), 0, rand(-0.7, 0.7))).normalize();
    this.cData[i] = { pos, q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), up), h, w: h * 0.4, t: 0, grow: 3, alive: true };
    this.crystals.setColorAt(i, new THREE.Color(color)); this.crystals.instanceColor.needsUpdate = true;
  },
  purge(origin) {
    this.purgeT = 1; this.debt += 0.35;
    for (const s of this.surfaces.values()) for (const q of s.seeds) { q.r *= 0.4; q.target *= 0.5; }
    for (let i = 0; i < this.cData.length; i++) { const d = this.cData[i]; if (d && d.alive && Math.random() < 0.7) { d.alive = false; Particles.burst(d.pos, 0x8ffcff, 3, 1.5, 0.012); } }
    // Schockwellen-Ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.material.userData.own = true; ring.rotation.x = -Math.PI / 2; ring.position.set(origin.x, Room.floorY + 0.05, origin.z);
    addFx(ring, 1.2, (o, k) => { o.scale.setScalar(0.2 + k * 7); o.material.opacity = 1 - k; });
    popup(origin.clone().add(new V3(0, 0.6, 0)), 'RAUM GEREINIGT', '#ffffff', 0.1);
  },
  reset() {
    for (const s of this.surfaces.values()) { this.group.remove(s.mesh); s.mesh?.geometry.dispose(); s.mat.dispose(); }
    this.surfaces.clear(); this.level = 0; this.debt = 0;
    for (let i = 0; i < this.cData.length; i++) if (this.cData[i]) this.cData[i].alive = false;
  },
  update(dt) {
    this.time += dt;
    const playing = Game.state === 'play' || Game.state === 'over';
    const target = playing ? clamp((Game.wave - 1) / 9 + 0.04, 0, 1) - this.debt : 0;
    this.debt = Math.max(0, this.debt - dt * 0.01);
    this.level += (Math.max(0, target) - this.level) * Math.min(1, dt * 0.25);
    const L = this.level;
    this.purgeT = Math.max(0, this.purgeT - dt * 1.2);
    // Flächen
    const grow = 0.05 + L * 0.12;
    for (const [p, s] of this.surfaces) {
      if (!Room.planes.includes(p)) { this.group.remove(s.mesh); s.mesh?.geometry.dispose(); s.mat.dispose(); this.surfaces.delete(p); continue; }
      this.surf(p);
      s.mesh.visible = Room.active.includes(p);
      const off = roomFacingNormal(p).dot(p.normal) > 0 ? 0.004 : -0.004;
      s.mesh.matrix.copy(p.matrix).multiply(_rotX90).premultiply(_tmpM.makeTranslation(p.normal.x * off, p.normal.y * off, p.normal.z * off));
      s.seeds.forEach((q, i) => { q.r += (q.target - q.r) * Math.min(1, dt * grow * 2); s.mat.uniforms.uSeeds.value[i].set(q.x, q.z, q.r, q.w); });
      for (let i = s.seeds.length; i < MAX_SEEDS; i++) s.mat.uniforms.uSeeds.value[i].set(0, 0, 0, 0);
      s.mat.uniforms.uTime.value = this.time; s.mat.uniforms.uLevel.value = L; s.mat.uniforms.uPurge.value = this.purgeT;
    }
    if (Game.state === 'play') {
      this.spreadT -= dt; if (this.spreadT <= 0) { this.spreadT = Math.max(1.2, 5 - L * 4); this.spread(); }
      const maxC = Math.floor(30 + L * 380);
      const alive = this.cData.filter((d) => d && d.alive).length;
      this.crystalT -= dt; if (this.crystalT <= 0 && alive < maxC && L > 0.02) { this.crystalT = Math.max(0.25, 1.4 - L * 1.2); this.spawnCrystalCluster(); }
    }
    // Kristalle animieren
    const m = this.crystals; const sc = new V3();
    for (let i = 0; i < this.cData.length; i++) {
      const d = this.cData[i]; if (!d) continue;
      if (d.alive) d.t = Math.min(1, d.t + dt * d.grow); else d.t = Math.max(0, d.t - dt * 3);
      const k = d.t * d.t * (3 - 2 * d.t);
      const pulse = 1 + 0.04 * Math.sin(this.time * 3 + i);
      sc.set(d.w * k, d.h * k * pulse, d.w * k);
      m.setMatrixAt(i, _tmpM.compose(d.pos, d.q, sc));
      if (!d.alive && d.t <= 0) this.cData[i] = null;
    }
    m.instanceMatrix.needsUpdate = true;
    m.material.emissive.setHSL(0.75 - L * 0.1, 0.8, 0.12 + 0.08 * Math.sin(this.time * 2));
    // Sporen
    const pos = this.spores.geometry.attributes.position;
    const fy = Room.floorY, cy = Room.ceilY;
    for (let i = 0; i < this.S; i++) {
      const sp = this.sp[i];
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!this.sporesInit || y > cy || Math.hypot(x - Player.head.x, z - Player.head.z) > 3) {
        const a = rand(0, Math.PI * 2), r = rand(0.4, 3); x = Player.head.x + Math.cos(a) * r; z = Player.head.z + Math.sin(a) * r; y = rand(fy, this.sporesInit ? fy + 0.3 : cy);
      }
      x += (sp.v.x + Math.sin(this.time * 0.7 + sp.ph) * 0.02) * dt; y += sp.v.y * dt; z += (sp.v.z + Math.cos(this.time * 0.6 + sp.ph) * 0.02) * dt;
      pos.setXYZ(i, x, y, z);
    }
    this.sporesInit = true; pos.needsUpdate = true;
    this.spores.material.opacity = Math.min(1, L * 1.4);
    // Umgebungslicht verfärbt sich
    hemi.color.setRGB(0.81 + L * 0.19, 0.9 - L * 0.4, 1.0);
    outlineMat.color.setRGB(0.22 + L * 0.78, 0.95 - L * 0.7, 1 - L * 0.3);
  },
};
const _rotX90 = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const _tmpM = new THREE.Matrix4();
Corruption.init();

// ---------------------------------------------------------------- Prozedurale Musik
const Music = {
  on: false, step: 0, next: 0, timer: null, out: null,
  start() {
    if (!Sound.ctx || this.on) return;
    this.on = true; this.step = 0; this.next = Sound.ctx.currentTime + 0.15;
    this.out = Sound.ctx.createGain(); this.out.gain.value = 0.0; this.out.gain.setTargetAtTime(0.2, Sound.ctx.currentTime, 0.8); this.out.connect(Sound.master);
    this.timer = setInterval(() => this.tick(), 25);
  },
  stop() {
    if (!this.on) return; this.on = false; clearInterval(this.timer);
    const o = this.out; o.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.4); setTimeout(() => o.disconnect(), 2500);
  },
  v(type, f0, f1, t, dur, vol, cut = 0) {
    const c = Sound.ctx; const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cut) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 6; o.connect(f); node = f; }
    node.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  n(t, dur, vol, hp) {
    const c = Sound.ctx; const s = c.createBufferSource(); s.buffer = Sound.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  tick() {
    const c = Sound.ctx; if (!c) return;
    const bpm = Math.min(140, 104 + Game.wave * 3);
    const spb = 60 / bpm / 4 * (Game.slowT > 0 ? 1.8 : 1);
    while (this.next < c.currentTime + 0.12) { this.play(this.step, this.next, spb); this.next += spb; this.step = (this.step + 1) % 64; }
  },
  play(s, t, spb) {
    const I = Game.intensity();
    const boss = Game.enemies.some((e) => e instanceof Boss);
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const root = (boss ? [40, 40, 41, 39] : [45, 41, 43, 40])[Math.floor(s / 16)];
    if (s % 4 === 0) this.v('sine', 150, 42, t, 0.28, 0.9);
    if (I > 0.25 && s % 8 === 4) { this.n(t, 0.16, 0.35, 1200); this.v('triangle', 220, 120, t, 0.08, 0.25); }
    if (I > 0.1 && s % 2 === 1) this.n(t, 0.04, s % 4 === 3 ? 0.18 : 0.09, 7000);
    if (s % 2 === 0) this.v('sawtooth', mf(root + [0, 0, 12, 0, 7, 0, 12, 10][(s / 2) % 8]), mf(root + [0, 0, 12, 0, 7, 0, 12, 10][(s / 2) % 8]), t, spb * 1.7, 0.22, 300 + I * 1500);
    if (I > 0.45) { const m = root + 24 + [0, 3, 7, 10, 12, 10, 7, 3][s % 8]; this.v('square', mf(m), mf(m), t, spb * 0.9, 0.035 + I * 0.03, 2500); }
    if (s % 16 === 0 && (boss || I > 0.7)) { for (const d of [0, 3, 7]) { this.v('sawtooth', mf(root + 12 + d) * 1.003, mf(root + 12 + d), t, spb * 15, 0.05, 1200); } }
  },
};

// ---------------------------------------------------------------- Power-ups
const POWER = {
  triple: { color: 0xffe14f, css: '#ffe14f', label: 'DREIFACHSCHUSS', dur: 12 },
  rapid: { color: 0xff7a3f, css: '#ff7a3f', label: 'SCHNELLFEUER', dur: 10 },
  slow: { color: 0xb18cff, css: '#b18cff', label: 'ZEITLUPE', dur: 6 },
};
class PowerUp {
  constructor(pos, type) {
    this.type = type; this.pos = pos.clone(); this.pos.y = Math.max(this.pos.y, Room.floorY + 0.5); this.t = 0; this.life = 12; this.dead = false;
    const P = POWER[type];
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshPhongMaterial({ color: P.color, emissive: P.color, emissiveIntensity: 0.5, transparent: true, opacity: 0.55, flatShading: true, shininess: 200 }));
    this.wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.075, 0)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: P.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.setScalar(0.35);
    const tex = textTexture(P.label, P.css, 48);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); this.label.scale.set(0.04 * tex.userData.aspect, 0.04, 1); this.label.position.y = 0.13;
    this.group.add(this.shell, this.wire, glow, this.label);
    scene.add(this.group);
    Sound.tone('triangle', 660, 1320, 0.25, 0.15, this.pos);
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.group.position.set(this.pos.x, this.pos.y + Math.sin(this.t * 2.2) * 0.04, this.pos.z);
    this.shell.rotation.x += dt * 1.3; this.shell.rotation.y += dt * 1.9; this.wire.rotation.copy(this.shell.rotation);
    this.group.visible = this.life > 3 || Math.floor(this.life * 8) % 2 === 0;
    if (this.life <= 0) this.remove();
    if (Hands.list.some((h) => h.src && h.pos.distanceTo(this.group.position) < 0.15)) this.collect();
  }
  collect() {
    if (this.dead) return;
    const P = POWER[this.type];
    Player.power[this.type] = P.dur; HUD.dirty = true;
    popup(this.group.position.clone(), P.label + '!', P.css, 0.07);
    Particles.burst(this.group.position, P.color, 30, 2, 0.02);
    [880, 1175, 1568].forEach((f, i) => Sound.tone('square', f, f, 0.1, 0.12, null, i * 0.05));
    Hands.buzzAll(0.7, 120);
    if (this.type === 'slow') { Sound.tone('sine', 400, 80, 1.0, 0.3); Vignette.tint(0x6a3cff); }
    this.remove();
  }
  remove() { this.dead = true; scene.remove(this.group); }
}

// ---------------------------------------------------------------- Richtungspfeile zu Gefahren außerhalb des Blicks
const Arrows = (() => {
  const geo = new THREE.ConeGeometry(0.018, 0.05, 3);
  const pool = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, depthTest: false, depthWrite: false }));
    m.renderOrder = 30; m.visible = false; scene.add(m); return m;
  });
  const Y = new V3(0, 1, 0), dir = new V3(), perp = new V3();
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const threats = [];
      if (Game.state === 'play') {
        for (const b of Game.breaches) if (!b.closing) threats.push(b.pos);
        for (const e of Game.enemies) if (e instanceof Boss) threats.push(e.pos);
      }
      let k = 0;
      for (const p of threats) {
        if (k >= pool.length) break;
        dir.copy(p).sub(Player.head).normalize();
        if (dir.dot(Player.fwd) > 0.75) continue;
        perp.copy(dir).addScaledVector(Player.fwd, -dir.dot(Player.fwd));
        if (perp.lengthSq() < 1e-4) perp.set(0, -1, 0);
        perp.normalize();
        const m = pool[k++];
        m.visible = true;
        m.position.copy(Player.head).addScaledVector(Player.fwd, 0.6).addScaledVector(perp, 0.2 + 0.015 * Math.sin(t * 8));
        m.quaternion.setFromUnitVectors(Y, perp);
        m.material.opacity = 0.6 + 0.4 * Math.sin(t * 8);
      }
      for (; k < pool.length; k++) pool[k].visible = false;
    },
  };
})();

// ---------------------------------------------------------------- Einschussspuren
const scorchTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(10,5,20,0.85)'); gr.addColorStop(0.45, 'rgba(30,10,40,0.6)'); gr.addColorStop(0.7, 'rgba(56,243,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const scorches = [];
function scorch(point, normal) {
  const mat = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); mat.userData.own = true;
  const m = new THREE.Mesh(G.plane, mat);
  m.position.copy(point).addScaledVector(normal, 0.003); m.lookAt(m.position.clone().add(normal)); m.rotation.z = rand(0, 6);
  const sz = rand(0.05, 0.09); m.scale.setScalar(sz);
  addFx(m, 9, (o, k) => { o.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25; });
  scorches.push(m);
  if (scorches.length > 40) { const o = scorches.shift(); o.material.opacity = 0; }
}

// ---------------------------------------------------------------- Spiel
const Game = {
  state: 'idle', wave: 0, breaches: [], enemies: [], bolts: [], orbs: [], hearts: [], powerups: [], slowT: 0, breakT: 0, waveSpawns: [], best: 0, overT: 0,
  init() {
    try { this.best = Number(localStorage.getItem('rissalarm-best')) || 0; } catch (e) { this.best = 0; }
  },
  intensity() {
    const boss = this.enemies.some((e) => e instanceof Boss);
    return clamp(0.15 + Corruption.level * 0.5 + this.enemies.length * 0.05 + (boss ? 0.4 : 0), 0, 1);
  },
  intro() {
    this.state = 'intro';
    Banner.show('RISS-ALARM', `Abzug drücken zum Starten\nGriff: Hände tauschen · B/Y halten: Beenden${this.best ? '\nRekord: ' + this.best : ''}`, '#38f3ff', 0);
  },
  reset() {
    for (const e of this.enemies) e.remove();
    for (const b of this.breaches) b.remove();
    for (const o of [...this.bolts, ...this.orbs]) scene.remove(o.mesh);
    for (const h of this.hearts) h.remove();
    for (const p of this.powerups) p.remove();
    this.powerups = []; this.slowT = 0; Player.power = { triple: 0, rapid: 0, slow: 0 };
    this.enemies = []; this.breaches = []; this.bolts = []; this.orbs = []; this.hearts = []; this.waveSpawns = [];
    Player.hp = Player.maxHp; Player.score = 0; Player.combo = 0; this.wave = 0; HUD.dirty = true;
    Corruption.reset();
  },
  start() {
    this.reset(); this.state = 'play'; Banner.hide(); Music.start();
    this.nextWave();
  },
  nextWave() {
    this.wave++; HUD.dirty = true;
    const w = this.wave;
    if (w % 5 === 0) {
      Banner.show(`WELLE ${w}`, 'BOSS: KRISTALLKÖNIGIN', '#ff3fb4', 3);
      this.waveSpawns = [{ delay: 2.0, boss: true }];
    } else {
      Banner.show(`WELLE ${w}`, w === 1 ? 'Schieß auf die Risse, um sie zu versiegeln!' : '', '#38f3ff', 2.5);
      const nb = Math.min(1 + Math.floor((w + 1) / 2), 4);
      const per = 2 + Math.floor(w * 0.7);
      this.waveSpawns = [];
      for (let i = 0; i < nb; i++) {
        const q = [];
        for (let k = 0; k < per; k++) {
          const r = Math.random();
          if (w >= 4 && r < 0.14) q.push('brute');
          else if (w >= 2 && r < 0.2 + w * 0.04) q.push('drone');
          else q.push('crawler');
        }
        if (w === 2 && !q.includes('drone')) q[q.length - 1] = 'drone';
        this.waveSpawns.push({ delay: 1.5 + i * 3.5, queue: q });
      }
      if (w >= 6 && Room.ceilPlane) {
        const q = []; for (let k = 0; k < 2 + Math.floor(w / 3); k++) q.push(Math.random() < 0.6 ? 'drone' : 'crawler');
        this.waveSpawns.push({ delay: 5, queue: q, ceiling: true });
      }
    }
    Sound.wave();
  },
  spawnEnemy(type, breach) {
    let e;
    if (type === 'boss') e = new Boss(breach, Math.max(1, Math.round(this.wave / 5)));
    else if (type === 'drone') e = new Drone(breach);
    else if (type === 'brute') e = new Crawler(breach, true);
    else e = new Crawler(breach);
    this.enemies.push(e);
  },
  onTrigger(h) {
    Sound.init(); Sound.ctx?.resume?.();
    if (this.state === 'intro') { this.start(); return; }
    if (this.state === 'over' && this.overT <= 0) { this.start(); return; }
  },
  fire(h) {
    const pos = h.pos.clone().addScaledVector(h.dir, 0.16);
    muzzleFlash(pos, h.dir);
    const up = new V3(0, 1, 0).transformDirection(h.c.matrixWorld);
    const dirs = Player.power.triple > 0 ? [-0.1, 0, 0.1].map((a) => h.dir.clone().applyAxisAngle(up, a)) : [h.dir];
    for (const d of dirs) {
      const mesh = new THREE.Mesh(boltGeo, Player.power.triple > 0 ? boltMatB1 : boltMat); mesh.position.copy(pos); mesh.lookAt(pos.clone().add(d)); scene.add(mesh);
      const trail = new THREE.Mesh(trailGeo, trailMat); mesh.add(trail);
      this.bolts.push({ pos: pos.clone(), vel: d.clone().multiplyScalar(14), mesh, life: 1.6, bounces: 0 });
    }
    Sound.shoot(pos); Hands.buzz(h, 0.35, 30);
  },
  enemyShot(from, to, speed = 1.7) {
    const vel = to.clone().sub(from).normalize().multiplyScalar(speed * (1 + this.wave * 0.03));
    const mesh = new THREE.Mesh(orbGeo, orbMatE); mesh.position.copy(from); scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a6a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.setScalar(0.18); mesh.add(glow);
    this.orbs.push({ pos: from.clone(), vel, mesh, glow, life: 7, mine: false });
    Sound.enemyShot(from);
  },
  over() {
    this.state = 'over'; this.overT = 2;
    const rec = Player.score > this.best;
    if (rec) { this.best = Player.score; try { localStorage.setItem('rissalarm-best', String(this.best)); } catch (e) { /* egal */ } }
    Sound.over(); Music.stop();
    for (const b of this.breaches) b.close();
    Banner.show('GAME OVER', `${Player.score} Punkte · Welle ${this.wave}\n${rec ? 'NEUER REKORD!' : 'Rekord: ' + this.best}\nAbzug: Neustart · B/Y halten: Beenden`, '#ff3fb4', 0);
  },
  update(rdt) {
    // Power-up-Timer (Echtzeit) und Zeitlupe
    for (const k in Player.power) if (Player.power[k] > 0) { Player.power[k] = Math.max(0, Player.power[k] - rdt); if (Player.power[k] === 0) HUD.dirty = true; }
    this.slowT = Player.power.slow;
    const dt = this.slowT > 0 ? rdt * 0.35 : rdt;
    if (Math.random() < rdt * 2) HUD.dirty = true;
    // Wellen-Spawns
    if (this.state === 'play') {
      for (const s of this.waveSpawns) {
        if (s.done) continue;
        s.delay -= dt;
        if (s.delay <= 0) {
          const spot = s.ceiling ? randomCeilingPoint() : randomWallPoint(s.boss ? 1.6 : 1.0);
          if (!spot) { s.delay = 0.5; s.tries = (s.tries || 0) + 1; if (s.tries > 12 && !s.boss) s.done = true; continue; }
          s.done = true;
          if (s.boss) {
            this.breaches.push(new Breach(spot, ['boss'], { radius: 0.55, boss: true, interval: 1.2 }));
          } else {
            const nb = new Breach(spot, s.queue, { hp: (s.ceiling ? 6 : 3) + Math.floor(this.wave / 3), interval: Math.max(1.0, 2.8 - this.wave * 0.15), radius: s.ceiling ? 0.55 : 0.32 });
            this.breaches.push(nb);
            if (s.ceiling) { Banner.show('DIE DECKE BRICHT', 'Schau nach oben!', '#ff3fb4', 2.5); Sound.boss(spot.pos); nb.lightShaft(); }
          }
        }
      }
    }
    for (const b of this.breaches) b.update(dt);
    this.breaches = this.breaches.filter((b) => !b.dead);
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    this.updateMelee();
    this.updateBolts(rdt);
    this.updateOrbs(dt);
    for (const p of this.powerups) p.update(rdt);
    this.powerups = this.powerups.filter((p) => !p.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const h of this.hearts) h.update(dt);
    this.hearts = this.hearts.filter((h) => !h.dead);

    if (Player.comboT > 0) { Player.comboT -= dt; if (Player.comboT <= 0) { Player.combo = 0; HUD.dirty = true; } }
    Player.invuln -= dt;

    if (this.state === 'play') {
      const pending = this.waveSpawns.some((s) => !s.done) || this.breaches.some((b) => b.queue.length && !b.closing) || this.enemies.length;
      if (!pending && !this.breakT) {
        this.breakT = 4;
        const bonus = 250 * this.wave;
        Player.score += bonus; HUD.dirty = true;
        Banner.show('WELLE GESCHAFFT', `+${bonus} Bonus`, '#8ffcff', 3);
        Sound.wave();
        for (const b of this.breaches) b.close();
        if (Player.hp < Player.maxHp && this.hearts.length < 2) this.hearts.push(new Heart(randomSurfacePoint()));
      }
      if (this.breakT) { this.breakT -= dt; if (this.breakT <= 0) { this.breakT = 0; this.nextWave(); } }
    }
    if (this.state === 'over') this.overT -= dt;
  },
  updateMelee() {
    for (const h of Hands.list) {
      if (!h.src || h.vel.length() < 1.3) continue;
      for (const e of this.enemies) {
        if (e.dead || e instanceof Boss) continue;
        if (h.pos.distanceTo(e.pos) < e.r + 0.09) {
          Hands.buzz(h, 1, 80);
          e.hit(e instanceof Crawler && !e.brute ? 99 : 2, e.pos.clone(), { melee: true, bounces: 0 });
        }
      }
    }
  },
  updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      let kill = b.life <= 0;
      const a = b.pos.clone(), end = b.pos.clone().addScaledVector(b.vel, dt);
      // Treffer: Gegner / Schilde / Orbs
      let bestT = Infinity, best = null;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e instanceof Boss) {
          for (const s of e.shards) { const t = segSphere(a, end, s.world, 0.08); if (t >= 0 && t < bestT) { bestT = t; best = { type: 'shard', e, s }; } }
        }
        const t = segSphere(a, end, e.pos, e.r + 0.02); if (t >= 0 && t < bestT) { bestT = t; best = { type: 'enemy', e }; }
      }
      for (const pu of this.powerups) { const t = segSphere(a, end, pu.group.position, 0.12); if (t >= 0 && t < bestT) { bestT = t; best = { type: 'power', pu }; } }
      for (const o of this.orbs) { if (o.mine) continue; const t = segSphere(a, end, o.pos, 0.06); if (t >= 0 && t < bestT) { bestT = t; best = { type: 'orb', o }; } }
      const ph = raycastPlanes(a, end);
      if (ph && ph.t < bestT) {
        const br = this.breaches.find((x) => x.plane === ph.plane && x.pos.distanceTo(ph.point) < x.radius * 1.1 && !x.closing);
        if (br) { br.damage(ph.point); kill = true; }
        else if (b.bounces < 2) {
          b.bounces++; b.vel.reflect(ph.normal); b.pos.copy(ph.point).addScaledVector(ph.normal, 0.01);
          ripple(ph.point, ph.normal, 0x38f3ff, 0.3); Sound.bounce(ph.point); scorch(ph.point, ph.normal);
          b.mesh.material = b.bounces === 1 ? boltMatB1 : boltMatB2;
          b.mesh.position.copy(b.pos); b.mesh.lookAt(b.pos.clone().add(b.vel));
          continue;
        } else { Particles.burst(ph.point, 0x38f3ff, 6, 0.8, 0.01); ripple(ph.point, ph.normal, 0x38f3ff, 0.15); scorch(ph.point, ph.normal); kill = true; }
      } else if (best) {
        const p = a.clone().lerp(end, bestT);
        if (best.type === 'enemy') best.e.hit(1, p, b);
        else if (best.type === 'shard') best.e.hitShard(best.s, p);
        else if (best.type === 'orb') { this.killOrb(best.o); Player.addScore(25, p); }
        else if (best.type === 'power') best.pu.collect();
        kill = true;
      } else {
        b.pos.copy(end);
      }
      if (kill) { scene.remove(b.mesh); this.bolts.splice(i, 1); continue; }
      b.mesh.position.copy(b.pos);
    }
  },
  killOrb(o) { o.dead = true; scene.remove(o.mesh); Particles.burst(o.pos, o.mine ? 0x38f3ff : 0xff2a6a, 10, 1.2, 0.012); },
  updateOrbs(dt) {
    const sh = Hands.shieldHand;
    const inv = sh ? new THREE.Matrix4().copy(sh.shield.matrixWorld).invert() : null;
    const local = new V3();
    for (const o of this.orbs) {
      if (o.dead) continue;
      o.life -= dt;
      const prev = o.pos.clone();
      if (o.mine && o.target && !o.target.dead) {
        const want = o.target.pos.clone().sub(o.pos).normalize().multiplyScalar(o.vel.length());
        o.vel.lerp(want, 1 - Math.exp(-dt * 6));
      }
      o.pos.addScaledVector(o.vel, dt);
      o.mesh.position.copy(o.pos); o.mesh.rotation.x += dt * 5; o.mesh.rotation.y += dt * 7;
      if (o.life <= 0) { this.killOrb(o); continue; }
      const wall = raycastPlanes(prev, o.pos);
      if (wall) { ripple(wall.point, wall.normal, o.mine ? 0x38f3ff : 0xff2a6a, 0.2); this.killOrb(o); continue; }
      if (!o.mine) {
        if (sh && this.state === 'play') {
          sh.shield.updateMatrixWorld(true);
          local.copy(o.pos).applyMatrix4(inv);
          if (Math.abs(local.z) < 0.09 && Math.hypot(local.x, local.y) < 0.24) { this.reflectOrb(o, sh); continue; }
        }
        if (o.pos.distanceTo(Player.head) < 0.16) { this.killOrb(o); Player.hurt(1); continue; }
      } else {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (e instanceof Boss && e.shards.length) {
            const s = e.shards.find((s) => s.world.distanceTo(o.pos) < 0.1);
            if (s) { e.hitShard(s, o.pos.clone()); e.hitShard(s, o.pos.clone()); this.killOrb(o); break; }
          }
          if (o.pos.distanceTo(e.pos) < e.r + 0.05) { e.hit(e instanceof Boss ? 2 : 3, o.pos.clone(), { reflected: true, bounces: 0 }); this.killOrb(o); break; }
        }
      }
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
  },
  reflectOrb(o, sh) {
    o.mine = true; o.mesh.material = orbMatP; o.glow.material.color.set(0x38f3ff);
    let target = null, bestD = Infinity;
    for (const e of this.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(o.pos); if (d < bestD) { bestD = d; target = e; } }
    o.target = target; o.life = 4;
    const dir = target ? target.pos.clone().sub(o.pos).normalize() : sh.dir.clone();
    o.vel.copy(dir).multiplyScalar(5);
    sh.shieldGlow = 1; Hands.buzz(sh, 0.8, 60);
    Sound.reflect(o.pos); flash(o.pos, 0x38f3ff, 0.35, 0.2);
    popup(o.pos.clone(), 'PARIERT!', '#8ffcff', 0.05);
  },
};
const boltMatB1 = new THREE.MeshBasicMaterial({ color: 0xffe14f });
const boltMatB2 = new THREE.MeshBasicMaterial({ color: 0xff7a3f });

// ---------------------------------------------------------------- Hauptschleife
const clock = new THREE.Clock();
let sessionTime = 0;
const _q = new THREE.Quaternion(), _fwd = new V3(), _up = new V3();
function loop(t, frame) {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (frame) {
    const ref = renderer.xr.getReferenceSpace();
    const vp = frame.getViewerPose(ref);
    if (vp) {
      const p = vp.transform.position, o = vp.transform.orientation;
      Player.head.set(p.x, p.y, p.z); Player.quat.set(o.x, o.y, o.z, o.w);
      Player.fwd.set(0, 0, -1).applyQuaternion(Player.quat);
      _up.set(0, 1, 0).applyQuaternion(Player.quat);
      Sound.listener(Player.head, Player.fwd, _up);
    }
    updateRealPlanes(frame, ref);
    sessionTime += dt;
    if (!Room.haveReal && !Room.fallback && sessionTime > 2.5) {
      buildFallback();
      if (Game.state === 'intro') Banner.show('RISS-ALARM', 'Keine Raumdaten: virtueller Raum aktiv\n(Quest: Raum einrichten für echte Wände)\nAbzug drücken zum Starten', '#38f3ff', 0);
    }
    // Wandkonturen: im Intro deutlich, im Spiel dezent
    const targetOp = Game.state === 'play' ? 0.12 : 0.55;
    outlineMat.opacity += (targetOp - outlineMat.opacity) * Math.min(1, dt * 2);
  }
  Hands.update(dt);
  Game.update(dt);
  Corruption.update(dt);
  Arrows.update(dt);
  Particles.update(dt);
  updateFx(dt);
  Vignette.update(dt);
  Banner.update(dt);
  if (HUD.dirty) HUD.draw();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Start
const btn = document.getElementById('start');
const msg = document.getElementById('msg');
Game.init();
async function setup() {
  if (!navigator.xr) { btn.textContent = 'Kein WebXR'; msg.textContent = 'Öffne diese Seite im Browser der Meta Quest.'; return; }
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { ok = false; }
  if (!ok) { btn.textContent = 'AR nicht verfügbar'; msg.textContent = 'Dieses Gerät unterstützt kein immersive-ar. Öffne die Seite im Browser der Meta Quest.'; return; }
  btn.disabled = false; btn.textContent = 'AR STARTEN';
  btn.onclick = async () => {
    Sound.init(); Sound.ctx?.resume?.();
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['plane-detection', 'hand-tracking'],
      });
      session.addEventListener('end', () => { Music.stop(); document.getElementById('ui').style.display = 'flex'; Game.reset(); Game.state = 'idle'; Banner.hide(); clearFallback(); Room.haveReal = false; sessionTime = 0; });
      await renderer.xr.setSession(session);
      document.getElementById('ui').style.display = 'none';
      sessionTime = 0;
      Game.intro();
    } catch (e) { msg.textContent = 'Start fehlgeschlagen: ' + e.message; }
  };
}
renderer.setAnimationLoop(loop);
setup();

// Für automatisierte Tests
window.__game = { Game, Player, Room, Hands, THREE, Corruption, PowerUp, Music };
