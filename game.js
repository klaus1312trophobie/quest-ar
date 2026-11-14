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
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 60);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x40205a, 1.4));
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
  planes: [], map: new Map(), fallback: false, floorY: 0, haveReal: false, outlines: new THREE.Group(), outlineOpacity: 0.5,
};
scene.add(Room.outlines);
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
}
function setPlaneMatrix(p, arr) {
  if (arr) p.matrix.fromArray(arr);
  p.inv.copy(p.matrix).invert();
  p.normal.set(0, 1, 0).transformDirection(p.matrix);
  p.center.setFromMatrixPosition(p.matrix);
  p.vertical = Math.abs(p.normal.y) < 0.5;
  if (p.line) p.line.matrix.copy(p.matrix);
}
function newPlane(label, real) {
  return { real, label: label || '', matrix: new THREE.Matrix4(), inv: new THREE.Matrix4(), normal: new V3(), center: new V3(), poly: [], area: 0, vertical: false, lastChanged: -1, line: null };
}
function removePlane(p) {
  if (p.line) { Room.outlines.remove(p.line); p.line.geometry.dispose(); }
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
function computeFloor() {
  let floor = null, low = null;
  for (const p of Room.planes) {
    if (p.vertical) continue;
    if (p.label === 'floor' && (!floor || p.area > floor.area)) floor = p;
    if (!low || p.center.y < low.center.y) low = p;
  }
  if (floor) Room.floorY = floor.center.y;
  else if (low && low.center.y < Player.head.y - 1.0) Room.floorY = low.center.y;
  else Room.floorY = 0;
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
}

// Segment a->b gegen alle Ebenen. Liefert nächsten Treffer.
const _la = new V3(), _lb = new V3();
function raycastPlanes(a, b) {
  let best = null, bestT = Infinity, side = 1;
  for (const p of Room.planes) {
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
// Zufallspunkt auf einer Wand in Wurfhöhe
function randomWallPoint(minDist = 1.0) {
  const walls = Room.planes.filter((p) => p.vertical && p.area > 0.5 && p.poly.length >= 3);
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
    return { pos: w, normal: roomFacingNormal(p), plane: p };
  }
  return null;
}
function randomSurfacePoint() {
  const tops = Room.planes.filter((p) => !p.vertical && p.normal.y > 0 && p.label !== 'floor' && p.center.y > Room.floorY + 0.25 && p.center.y < Room.floorY + 1.4 && p.area > 0.08);
  const local = new V3();
  for (let tries = 0; tries < 40 && tops.length; tries++) {
    const p = pick(tops);
    local.set(rand(p.min[0], p.max[0]) * 0.7, 0, rand(p.min[1], p.max[1]) * 0.7);
    if (!pip(local.x, local.z, p.poly)) continue;
    return local.applyMatrix4(p.matrix);
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
  hp: 5, maxHp: 5, score: 0, combo: 0, comboT: 0, invuln: 0,
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
  return { hit() { t = 1; }, update(dt) { t = Math.max(0, t - dt * 2.2); mat.opacity = t * 0.45; m.visible = t > 0; m.position.copy(Player.head); } };
})();

// ---------------------------------------------------------------- Hände / Controller
function buildBlaster() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.12), M.dark); body.position.set(0, -0.01, 0.0); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.12, 10).rotateX(Math.PI / 2), M.dark); barrel.position.set(0, 0.005, -0.09); g.add(barrel);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 6, 16), M.gunGlow); ring.position.set(0, 0.005, -0.06 - i * 0.03); g.add(ring);
  }
  const tip = new THREE.Mesh(G.sphere, additive(0x38f3ff, 0.9)); tip.scale.setScalar(0.02); tip.position.set(0, 0.005, -0.155); g.add(tip);
  g.userData.tip = tip;
  // Ziellaser
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(0, 0, 0), new V3(0, 0, -1)]);
  const laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  laser.position.set(0, 0.005, -0.15); g.add(laser); g.userData.laser = laser;
  return g;
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
        if (h.firing && Game.state === 'play') { h.fireT -= dt; if (h.fireT <= 0) { Game.fire(h); h.fireT = 0.17; } }
        // Laser + Punkt auf Oberfläche
        const muzzle = h.pos.clone().addScaledVector(h.dir, 0.15);
        const hit = raycastPlanes(muzzle, muzzle.clone().addScaledVector(h.dir, 10));
        const len = hit ? hit.t * 10 : 3;
        h.blaster.userData.laser.scale.set(1, 1, len);
        if (hit) { dot.visible = true; dot.position.copy(hit.point).addScaledVector(hit.normal, 0.005); } else dot.visible = false;
        h.blaster.userData.tip.scale.setScalar(0.02 + (h.fireT > 0.12 ? 0.02 : 0));
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
  }
  get open() { return this.age > 1.2 && !this.closing; }
  spawnPoint() { return this.pos.clone().addScaledVector(this.normal, 0.05); }
  update(dt) {
    this.age += dt;
    const u = this.mat.uniforms; u.uTime.value += dt; u.uHurt.value = Math.max(0, u.uHurt.value - dt * 4);
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
  remove() { this.dead = true; scene.remove(this.group); this.mat.dispose(); this.cracks.material.dispose(); }
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
    Player.addScore(base, this.pos.clone().add(new V3(0, this.r + 0.08, 0)), extra);
    Particles.burst(this.pos, this.color, 30, 2.2, 0.03 * (this.r / 0.08));
    flash(this.pos, this.color, this.r * 5, 0.3);
    Sound.explode(this.pos, this.r > 0.2);
    this.remove();
  }
  remove() { this.dead = true; scene.remove(this.group); if (this.shadow) scene.remove(this.shadow); }
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
    Player.hp = Math.min(Player.maxHp, Player.hp + 2); HUD.dirty = true;
  }
  update(dt) {
    this.t += dt; this.hitFlash -= dt; this.phaseA += dt;
    this.core.material = this.hitFlash > 0 ? M.crawlerHot : M.boss;
    this.group.scale.setScalar(Math.min(1, 0.1 + this.t * 0.4));
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

// ---------------------------------------------------------------- Spiel
const Game = {
  state: 'idle', wave: 0, breaches: [], enemies: [], bolts: [], orbs: [], hearts: [], breakT: 0, waveSpawns: [], best: 0, overT: 0,
  init() {
    try { this.best = Number(localStorage.getItem('rissalarm-best')) || 0; } catch (e) { this.best = 0; }
  },
  intro() {
    this.state = 'intro';
    Banner.show('RISS-ALARM', 'Abzug drücken zum Starten\nGriff: Hände tauschen · B/Y halten: Beenden', '#38f3ff', 0);
  },
  reset() {
    for (const e of this.enemies) e.remove();
    for (const b of this.breaches) b.remove();
    for (const o of [...this.bolts, ...this.orbs]) scene.remove(o.mesh);
    for (const h of this.hearts) h.remove();
    this.enemies = []; this.breaches = []; this.bolts = []; this.orbs = []; this.hearts = []; this.waveSpawns = [];
    Player.hp = Player.maxHp; Player.score = 0; Player.combo = 0; this.wave = 0; HUD.dirty = true;
  },
  start() {
    this.reset(); this.state = 'play'; Banner.hide();
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
    }
    Sound.wave();
  },
  spawnEnemy(type, breach) {
    let e;
    if (type === 'drone') e = new Drone(breach);
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
    const mesh = new THREE.Mesh(boltGeo, boltMat); mesh.position.copy(pos); mesh.lookAt(pos.clone().add(h.dir)); scene.add(mesh);
    this.bolts.push({ pos, vel: h.dir.clone().multiplyScalar(14), mesh, life: 1.6, bounces: 0 });
    Sound.shoot(pos); Hands.buzz(h, 0.35, 30);
    flash(pos, 0x38f3ff, 0.09, 0.08);
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
    Sound.over();
    for (const b of this.breaches) b.close();
    Banner.show('GAME OVER', `${Player.score} Punkte · Welle ${this.wave}\n${rec ? 'NEUER REKORD!' : 'Rekord: ' + this.best}\nAbzug: Neustart · B/Y halten: Beenden`, '#ff3fb4', 0);
  },
  update(dt) {
    // Wellen-Spawns
    if (this.state === 'play') {
      for (const s of this.waveSpawns) {
        if (s.done) continue;
        s.delay -= dt;
        if (s.delay <= 0) {
          const spot = randomWallPoint(s.boss ? 1.6 : 1.0);
          if (!spot) { s.delay = 0.5; continue; }
          s.done = true;
          if (s.boss) {
            const b = new Breach(spot, [], { radius: 0.55, boss: true, interval: 1.2 });
            this.breaches.push(b);
            setTimeout(() => { if (this.state === 'play' && !b.dead) this.enemies.push(new Boss(b, this.wave / 5)); }, 1300);
          } else {
            this.breaches.push(new Breach(spot, s.queue, { hp: 3 + Math.floor(this.wave / 3), interval: Math.max(1.0, 2.8 - this.wave * 0.15) }));
          }
        }
      }
    }
    for (const b of this.breaches) b.update(dt);
    this.breaches = this.breaches.filter((b) => !b.dead);
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    this.updateMelee();
    this.updateBolts(dt);
    this.updateOrbs(dt);
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
      for (const o of this.orbs) { if (o.mine) continue; const t = segSphere(a, end, o.pos, 0.06); if (t >= 0 && t < bestT) { bestT = t; best = { type: 'orb', o }; } }
      const ph = raycastPlanes(a, end);
      if (ph && ph.t < bestT) {
        const br = this.breaches.find((x) => x.plane === ph.plane && x.pos.distanceTo(ph.point) < x.radius * 1.1 && !x.closing);
        if (br) { br.damage(ph.point); kill = true; }
        else if (b.bounces < 2) {
          b.bounces++; b.vel.reflect(ph.normal); b.pos.copy(ph.point).addScaledVector(ph.normal, 0.01);
          ripple(ph.point, ph.normal, 0x38f3ff, 0.3); Sound.bounce(ph.point);
          b.mesh.material = b.bounces === 1 ? boltMatB1 : boltMatB2;
          b.mesh.position.copy(b.pos); b.mesh.lookAt(b.pos.clone().add(b.vel));
          continue;
        } else { Particles.burst(ph.point, 0x38f3ff, 6, 0.8, 0.01); ripple(ph.point, ph.normal, 0x38f3ff, 0.15); kill = true; }
      } else if (best) {
        const p = a.clone().lerp(end, bestT);
        if (best.type === 'enemy') best.e.hit(1, p, b);
        else if (best.type === 'shard') best.e.hitShard(best.s, p);
        else if (best.type === 'orb') { this.killOrb(best.o); Player.addScore(25, p); }
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
      session.addEventListener('end', () => { document.getElementById('ui').style.display = 'flex'; Game.reset(); Game.state = 'idle'; Banner.hide(); clearFallback(); Room.haveReal = false; sessionTime = 0; });
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
window.__game = { Game, Player, Room, Hands, THREE };
