// Günther muss mal – WebXR Mixed-Reality-Jump-and-Run für Meta Quest (Quest-Browser)
// Das echte Zimmer ist das Level: Boden, Möbel und Wände aus der Raumeinrichtung der Quest.
import * as THREE from './vendor/three.module.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = THREE.MathUtils.clamp;
const DESK = { on: false };

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
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a4030, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1, 3, 2);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- Audio (alles synthetisch)
const Sound = {
  ctx: null, master: null, musicGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.07; this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
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
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.7; p.rolloffFactor = 0.8;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  },
  tone(type, f0, f1, dur, vol, pos, delay = 0, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.out(pos)); o.start(t); o.stop(t + dur + 0.02);
  },
  noiseBurst(dur, vol, f0, f1, pos, type = 'lowpass', q = 0.7, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(pos)); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
  // Furz: Sägezahn durch Tiefpass, mit schneller Amplitudenmodulation (das "Flattern")
  fart(pos, len = 0.7, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * pitch, t); o.frequency.exponentialRampToValueAtTime(48 * pitch, t + len);
    const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(rand(16, 26), t); lfo.frequency.linearRampToValueAtTime(rand(9, 14), t + len);
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.5;
    const am = this.ctx.createGain(); am.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 4;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.03);
    g.gain.setValueAtTime(0.5, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(am); am.connect(f); f.connect(g); g.connect(this.out(pos));
    o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
    this.noiseBurst(len * 0.8, 0.15, 600, 200, pos);
  },
  burp(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, len = rand(0.45, 0.8);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(95, 125), t); o.frequency.linearRampToValueAtTime(rand(70, 85), t + len);
    const vib = this.ctx.createOscillator(); vib.frequency.value = rand(7, 11); const vg = this.ctx.createGain(); vg.gain.value = 14;
    vib.connect(vg); vg.connect(o.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(this.out(pos)); o.start(t); vib.start(t); o.stop(t + len + 0.05); vib.stop(t + len + 0.05);
  },
  // Günther-Gebrabbel beim Reden
  mumble(pos, n = 6, angry = false) {
    for (let i = 0; i < n; i++) {
      const f = rand(angry ? 160 : 130, angry ? 260 : 210);
      this.tone(angry ? 'square' : 'triangle', f, f * rand(0.75, 1.15), 0.07, angry ? 0.05 : 0.09, pos, i * rand(0.08, 0.11));
    }
  },
  jump(p) { this.tone('sine', 280, 620, 0.14, 0.18, p); },
  land(p) { this.tone('sine', 130, 55, 0.08, 0.25, p); },
  plopp(p) { this.tone('sine', 900, 180, 0.07, 0.35, p); this.noiseBurst(0.08, 0.15, 4000, 1500, p, 'bandpass', 2); },
  place(p) { this.noiseBurst(0.09, 0.25, 1800, 500, p); this.tone('triangle', 520, 760, 0.07, 0.12, p); },
  remove(p) { this.tone('triangle', 760, 420, 0.08, 0.12, p); this.noiseBurst(0.06, 0.15, 900, 2400, p); },
  denied(p) { this.tone('square', 160, 140, 0.12, 0.08, p); },
  sizzle(p) { this.noiseBurst(1.2, 0.5, 6000, 2500, p, 'highpass', 0.5); this.tone('square', 720, 260, 0.5, 0.12, p); },
  suck(p) { this.noiseBurst(1.1, 0.45, 300, 2600, p, 'bandpass', 1.5); this.tone('sawtooth', 200, 900, 0.9, 0.06, p); },
  poof(p) { this.noiseBurst(0.3, 0.3, 2500, 300, p); this.tone('sine', 400, 900, 0.2, 0.1, p); },
  pee(p, dur = 3.4) { this.noiseBurst(dur, 0.22, 3200, 2200, p, 'bandpass', 1.5); this.noiseBurst(dur, 0.08, 900, 700, p, 'bandpass', 3); },
  flush(p) { this.noiseBurst(2.4, 0.7, 3500, 180, p, 'lowpass', 1); this.noiseBurst(1.8, 0.3, 600, 2400, p, 'bandpass', 2, 0.6); },
  win() { [262, 330, 392, 523, 392, 523].forEach((f, i) => { this.tone('square', f, f, 0.14, 0.09, null, i * 0.12); this.tone('sawtooth', f / 2, f / 2, 0.14, 0.06, null, i * 0.12); }); },
  fail() { [392, 370, 349, 330].forEach((f, i) => { this.tone('sawtooth', f, f * (i === 3 ? 0.9 : 1), i === 3 ? 0.9 : 0.35, 0.12, null, i * 0.38); }); },
  levelUp() { [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.15, null, i * 0.08)); },
};

// Bierzelt-Polka in Endlosschleife; wird schneller, wenn es pressiert
const Music = {
  on: false, next: 0, step: 0, tempo: 132,
  start() { if (!Sound.ctx) return; this.on = true; this.next = Sound.ctx.currentTime + 0.1; this.step = 0; },
  stop() { this.on = false; },
  update() {
    if (!this.on || !Sound.ctx) return;
    const prog = [[131, [262, 330, 392]], [98, [247, 294, 392]], [98, [247, 294, 349]], [131, [262, 330, 392]],
      [175, [262, 349, 440]], [131, [262, 330, 392]], [98, [247, 294, 349]], [131, [262, 330, 392]]];
    const beat = 60 / this.tempo;
    while (this.next < Sound.ctx.currentTime + 0.25) {
      const bar = Math.floor(this.step / 4) % prog.length, b = this.step % 4;
      const [bass, chord] = prog[bar];
      const delay = this.next - Sound.ctx.currentTime;
      if (b % 2 === 0) Sound.tone('sawtooth', b === 0 ? bass : bass * 1.5, (b === 0 ? bass : bass * 1.5) * 0.98, beat * 0.5, 0.5, null, delay, this.musicGain());
      else chord.forEach((f) => Sound.tone('square', f, f, beat * 0.22, 0.12, null, delay, this.musicGain()));
      this.next += beat; this.step++;
    }
  },
  musicGain() { return Sound.musicGain; },
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
const textCache = new Map();
function textTexture(text, color = '#fff', px = 64) {
  const key = text + color + px;
  if (textCache.has(key)) return textCache.get(key);
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = `900 ${px}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + px; c.width = w; c.height = px * 1.6;
  g.font = `900 ${px}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = px * 0.16; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineJoin = 'round';
  g.strokeText(text, w / 2, c.height / 2); g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.aspect = w / c.height;
  if (textCache.size > 120) textCache.clear();
  textCache.set(key, t); return t;
}
function popup(pos, text, color = '#ffffff', size = 0.045, life = 1.3) {
  const tex = textTexture(text, color, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 30; sp.scale.set(size * tex.userData.aspect, size, 1); sp.position.copy(pos);
  addFx(sp, life, (o, k) => { o.position.y += 0.0025; o.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; });
}
const Fx = [];
function addFx(obj, life, update) { scene.add(obj); Fx.push({ obj, life, max: life, update }); }
function updateFx(dt) {
  for (let i = Fx.length - 1; i >= 0; i--) {
    const f = Fx[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.obj); f.obj.material?.dispose?.(); Fx.splice(i, 1); continue; }
    f.update(f.obj, 1 - f.life / f.max, dt);
  }
}

// ---------------------------------------------------------------- Partikel (Points, drei Sorten)
function makeParticles(max, additive, square) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*900.0/max(-mv.z,0.05); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: square
      ? `varying vec3 vC; varying float vA; void main(){ if(vA<=0.0) discard; gl_FragColor=vec4(vC,vA); }`
      : `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=vA*smoothstep(1.0,0.2,d); if(a<=0.01) discard; gl_FragColor=vec4(vC,a); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 8; scene.add(pts);
  const P = [];
  for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, p: new V3(), v: new V3(), c: new THREE.Color(), s: 0.01, grow: 0, g: 0, drag: 0 });
  let cursor = 0;
  return {
    emit(p, v, color, s, life, g = 0, grow = 0, drag = 0) {
      const q = P[cursor]; cursor = (cursor + 1) % max;
      q.p.copy(p); q.v.copy(v); q.c.set(color); q.s = s; q.life = q.max = life; q.g = g; q.grow = grow; q.drag = drag;
    },
    burst(p, color, n, speed, s, life, g = 0, up = 0, grow = 0) {
      for (let i = 0; i < n; i++) {
        const v = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1)); v.y += up;
        this.emit(p, v, color, s * rand(0.6, 1.3), life * rand(0.6, 1.2), g, grow, 1.5);
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const q = P[i];
        if (q.life > 0) {
          q.life -= dt; q.v.y -= q.g * dt; q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt)); q.p.addScaledVector(q.v, dt); q.s += q.grow * dt;
          pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
          col[i * 3] = q.c.r; col[i * 3 + 1] = q.c.g; col[i * 3 + 2] = q.c.b;
          size[i] = q.s; alpha[i] = Math.max(0, Math.min(1, q.life / q.max * 1.5));
        } else alpha[i] = 0;
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = true;
    },
  };
}
const Glow = makeParticles(260, true, false);
const Smoke = makeParticles(220, false, false);
const Bits = makeParticles(200, false, true);
function fartCloud(p, n = 14) {
  for (let i = 0; i < n; i++) {
    const v = new V3(rand(-0.15, 0.15), rand(0.02, 0.12), rand(-0.15, 0.15));
    Smoke.emit(p, v, pick([0x9fd14a, 0x7fb83a, 0xb8d96a, 0x8a9a3a]), rand(0.015, 0.03), rand(1.2, 2.2), -0.02, 0.03, 1.2);
  }
}
function confetti(p, n = 60) {
  for (let i = 0; i < n; i++) {
    const v = new V3(rand(-0.6, 0.6), rand(0.6, 1.4), rand(-0.6, 0.6));
    Bits.emit(p, v, pick([0xffd23f, 0xff5d8f, 0x3fd2ff, 0x7dff6a, 0xffffff, 0xff9f1c]), rand(0.004, 0.007), rand(1.6, 2.6), 1.6, 0, 1.2);
  }
}

// ---------------------------------------------------------------- 2D-Geometrie (Grundriss x/z)
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
const _cp = [0, 0];
function closestOnSeg(x, z, ax, az, bx, bz, out = _cp) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1) : 0;
  out[0] = ax + dx * t; out[1] = az + dz * t; return out;
}
// Nächster Randpunkt eines Polygons; liefert Abstand
function closestOnPoly(x, z, poly, out) {
  let best = Infinity; const c = [0, 0];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    closestOnSeg(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1], c);
    const d = Math.hypot(c[0] - x, c[1] - z);
    if (d < best) { best = d; out[0] = c[0]; out[1] = c[1]; }
  }
  return best;
}
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function rectPoly(cx, cz, hx, hz, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}
function bbox(poly) {
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (const [x, z] of poly) { min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], z); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], z); }
  return { min, max };
}

// ---------------------------------------------------------------- Raum (Ebenen der Quest-Raumeinrichtung)
const Room = { planes: [], active: [], map: new Map(), fallback: false, haveReal: false, floorY: 0, ceilY: 2.6, floorPlane: null, dirty: true, floorPoly: null };
const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const _occRot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const _la = new V3();

function newPlane(label, real) {
  return { real, label: label || 'other', matrix: new THREE.Matrix4(), inv: new THREE.Matrix4(), normal: new V3(), center: new V3(), poly: [], area: 0, vertical: false, lastChanged: -1 };
}
function setPlaneMatrix(p, arr) {
  if (arr) p.matrix.fromArray(arr);
  p.inv.copy(p.matrix).invert();
  p.normal.set(0, 1, 0).transformDirection(p.matrix);
  p.center.setFromMatrixPosition(p.matrix);
  p.vertical = Math.abs(p.normal.y) < 0.5;
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
    if (!p) { p = newPlane(xp.semanticLabel, true); Room.map.set(xp, p); Room.planes.push(p); Room.dirty = true; }
    const before = p.center.clone();
    setPlaneMatrix(p, pose.transform.matrix);
    if (before.distanceToSquared(p.center) > 1e-4) Room.dirty = true;
    if (xp.lastChangedTime !== p.lastChanged) {
      p.lastChanged = xp.lastChangedTime;
      p.poly = Array.from(xp.polygon, (q) => [q.x, q.z]); p.area = polyArea(p.poly);
      Room.dirty = true;
    }
  });
  for (const [xp, p] of Room.map) if (!seen.has(xp)) { Room.planes.splice(Room.planes.indexOf(p), 1); Room.map.delete(xp); Room.dirty = true; }
  if (Room.map.size > 0 && !Room.haveReal) { Room.haveReal = true; if (Room.fallback) clearFallback(); }
}
function containsXZ(p, pos) { _la.copy(pos).applyMatrix4(p.inv); return pip(_la.x, _la.z, p.poly); }
// Die Quest kann Flächen mehrerer gescannter Räume liefern (auch anderer Stockwerke):
// Boden = nächster Boden unter dem Kopf, Decke = nächste darüber, der Rest wird ignoriert.
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
  Room.floorPlane = floor;
  Room.floorY = floor ? floor.center.y : 0;
  Room.ceilY = ceil ? ceil.center.y : Room.floorY + 2.6;
  Room.active = Room.planes.filter((p) => p.poly.length && p.center.y > Room.floorY - 0.35 && p.center.y < Room.ceilY + 0.15);
}
// Ersatzraum ohne Raumdaten (und für den PC-Modus): 5 x 5 m mit Tisch, Sofa, Regal
function buildFallback() {
  Room.fallback = true;
  const c = Player.head.clone(); c.y = 0;
  const f = Player.fwd.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  const r = new V3(-f.z, 0, f.x);
  const at = (fx, rx) => c.clone().addScaledVector(f, fx).addScaledVector(r, rx);
  const yaw = Math.atan2(f.x, f.z);
  const make = (pos, normal, w, h, label, rotY = 0) => {
    const p = newPlane(label, false);
    const y = normal.clone();
    let x = Math.abs(y.y) > 0.9 ? new V3(Math.cos(rotY), 0, -Math.sin(rotY)) : new V3(0, 1, 0).cross(y).normalize();
    const z = new V3().crossVectors(x, y);
    p.matrix.makeBasis(x, y, z).setPosition(pos);
    setPlaneMatrix(p);
    p.poly = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; p.area = w * h;
    Room.planes.push(p);
  };
  const S = 2.5, H = 2.6;
  make(at(2.2, 0).setY(H / 2), f.clone().negate(), 2 * S, H, 'wall');
  make(at(-2.8, 0).setY(H / 2), f.clone(), 2 * S, H, 'wall');
  make(at(-0.3, S).setY(H / 2), r.clone().negate(), 2 * S, H, 'wall');
  make(at(-0.3, -S).setY(H / 2), r.clone(), 2 * S, H, 'wall');
  make(at(-0.3, 0).setY(0), new V3(0, 1, 0), 2 * S, 2 * S, 'floor', yaw);
  make(at(-0.3, 0).setY(H), new V3(0, -1, 0), 2 * S, 2 * S, 'ceiling', yaw);
  make(at(1.3, 1.0).setY(0.74), new V3(0, 1, 0), 1.2, 0.7, 'table', yaw);
  make(at(0.6, -1.9).setY(0.45), new V3(0, 1, 0), 0.8, 1.8, 'couch', yaw);
  make(at(1.95, -0.6).setY(1.1), new V3(0, 1, 0), 0.9, 0.3, 'shelf', yaw);
  Room.dirty = true;
}
function clearFallback() {
  Room.planes = Room.planes.filter((p) => p.real);
  Room.fallback = false; Room.dirty = true;
}

// ---------------------------------------------------------------- Welt: Festkörper (Prismen), Wände, Abfragen
// Solid = { kind, poly:[[x,z]], min, max, top, bottom }  ·  Wall = Strecke im Grundriss mit Höhe
const World = { solids: [], walls: [], dyn: [], group: new THREE.Group(), occ: new THREE.Group() };
scene.add(World.group, World.occ);
const LABEL_DE = { table: 'TISCH', couch: 'SOFA', shelf: 'REGAL', bed: 'BETT', storage: 'SCHRANK', screen: 'BILDSCHIRM', lamp: 'LAMPE', plant: 'PFLANZE', desk: 'SCHREIBTISCH', other: 'OBJEKT' };
function makeSolid(kind, poly, top, bottom, extra = {}) {
  const b = bbox(poly);
  return Object.assign({ kind, poly, min: b.min, max: b.max, top, bottom }, extra);
}
const edgeMat = new THREE.LineBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
const topMat = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const fakeFurnMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a, side: THREE.DoubleSide });
const fakeWallMat = new THREE.MeshLambertMaterial({ color: 0x4a4258, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
const fakeFloorMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a, side: THREE.DoubleSide });

// Prisma (Grundriss-Polygon von y0 bis y1) als Geometrie
function prismGeometry(poly, y0, y1, withTop = true) {
  const pts2 = poly.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(pts2)) pts2.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
  const pos = [];
  if (withTop) for (const [a, b, c] of tris) for (const i of [a, c, b]) pos.push(pts2[i].x, y1, pts2[i].y);
  for (let i = 0; i < pts2.length; i++) {
    const a = pts2[i], b = pts2[(i + 1) % pts2.length];
    pos.push(a.x, y0, a.y, b.x, y0, b.y, b.x, y1, b.y, a.x, y0, a.y, b.x, y1, b.y, a.x, y1, a.y);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
function topGeometry(poly, y) {
  const pts2 = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
  const pos = [];
  for (const [a, b, c] of tris) for (const i of [a, b, c]) pos.push(pts2[i].x, y, pts2[i].y);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

// Die Quest liefert die Flächen ALLER gescannten Räume. Benutzt wird nur der Raum, in dem der Spieler steht:
// Wände müssen am Rand seines Bodens liegen, Möbel über seinem Boden. Fremde Wände mitten im Zimmer wären sonst
// unsichtbare Hindernisse und (als Verdecker) unsichtbare Wände, die das Bild abschneiden.
function nearFloorEdge(x, z, eps) { return closestOnPoly(x, z, Room.floorPoly, [0, 0]) < eps; }
function rebuildWorld() {
  computeFloor();
  for (const c of [...World.group.children]) { World.group.remove(c); c.geometry?.dispose(); }
  for (const c of [...World.occ.children]) { World.occ.remove(c); c.geometry?.dispose(); }
  World.solids = []; World.walls = []; Room.skipped = 0;
  const fy = Room.floorY, fp = Room.floorPlane;
  Room.floorPoly = fp ? fp.poly.map(([x, z]) => { const v = new V3(x, 0, z).applyMatrix4(fp.matrix); return [v.x, v.z]; }) : null;
  if (Room.floorPoly && Room.fallback && DESK.on) World.group.add(new THREE.Mesh(topGeometry(Room.floorPoly, fy - 0.001), fakeFloorMat));
  const strict = !!Room.floorPoly && !Room.fallback;
  const cand = [];
  for (const p of Room.active) {
    if (p === fp || p.label === 'floor' || p.label === 'ceiling') continue;
    const wp = p.poly.map(([x, z]) => new V3(x, 0, z).applyMatrix4(p.matrix));
    if (p.vertical) {
      // Wand: weiteste zwei Punkte im Grundriss = Strecke
      let a = wp[0], b = wp[0], best = -1;
      for (const u of wp) for (const v of wp) { const d = (u.x - v.x) ** 2 + (u.z - v.z) ** 2; if (d > best) { best = d; a = u; b = v; } }
      if (best < 0.04) continue;
      if (strict) {
        const near = (t) => nearFloorEdge(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.3);
        if (!(near(0.15) && near(0.5) && near(0.85))) { Room.skipped++; continue; }
      }
      const y0 = Math.min(...wp.map((v) => v.y)), y1 = Math.max(...wp.map((v) => v.y));
      World.walls.push({ a: [a.x, a.z], b: [b.x, b.z], y0, y1, label: p.label, plane: p });
      if (Room.fallback && DESK.on) {
        const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(p.poly.map(([x, z]) => new THREE.Vector2(x, z)))), fakeWallMat);
        m.matrixAutoUpdate = false; m.matrix.copy(p.matrix).multiply(_occRot); World.group.add(m);
      }
      continue;
    }
    const top = p.center.y - fy;
    if (top < 0.12 || top > 2.2 || p.area < 0.03) continue;
    if (strict && !pip(p.center.x, p.center.z, Room.floorPoly) && !nearFloorEdge(p.center.x, p.center.z, 0.3)) { Room.skipped++; continue; }
    cand.push({ p, poly: wp.map((v) => [v.x, v.z]) });
  }
  // Derselbe Raum mehrfach gescannt → Möbel doppelt: bei Überlappung auf gleicher Höhe die größere Fläche behalten
  cand.sort((a, b) => b.p.area - a.p.area);
  const kept = [];
  for (const c of cand) {
    const dup = kept.some((k) => Math.abs(k.p.center.y - c.p.center.y) < 0.2 && (pip(c.p.center.x, c.p.center.z, k.poly) || pip(k.p.center.x, k.p.center.z, c.poly)));
    if (dup) Room.skipped++; else kept.push(c);
  }
  for (const { p, poly } of kept) {
    // Tischplatten sind dünn (man kann drunter durch), alles andere ist ein Klotz bis zum Boden
    const thin = /table|desk/.test(p.label);
    const s = makeSolid('furn', poly, p.center.y, thin ? p.center.y - 0.05 : fy - 0.05, { label: p.label });
    World.solids.push(s);
    if (Room.fallback) {
      World.group.add(new THREE.Mesh(prismGeometry(poly, thin ? s.bottom : fy, s.top), fakeFurnMat));
      if (thin) for (const [x, z] of poly) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, s.bottom - fy, 0.04), fakeFurnMat); leg.position.set(x + Math.sign(p.center.x - x) * 0.05, fy + (s.bottom - fy) / 2, z + Math.sign(p.center.z - z) * 0.05); World.group.add(leg); }
    } else {
      // Verdecker nur für Möbel (Modus "Möbel"); mit Tiefensensor übernimmt die echte Tiefe
      const m = new THREE.Mesh(prismGeometry(poly, thin ? s.bottom : fy, s.top), occMat); m.renderOrder = -10; World.occ.add(m);
    }
    // Spielflächen-Haut: warmer Schimmer + leuchtende Kante
    const fill = new THREE.Mesh(topGeometry(poly, s.top + 0.002), topMat); fill.renderOrder = 2; World.group.add(fill);
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(([x, z]) => new V3(x, s.top + 0.003, z))), edgeMat); line.renderOrder = 2;
    World.group.add(line);
  }
  Room.dirty = false;
}

// ---------------------------------------------------------------- Verdeckung durch die echte Welt
// 'depth' = Tiefensensor der Quest (echte Verdeckung, auch Hände/Krempel), 'boxes' = nur gescannte Möbel, 'off' = nichts.
const AR_MODES = { depth: 'Tiefensensor', boxes: 'Möbel-Scan', off: 'aus' };
const AR = {
  mode: 'boxes', hasDepth: false, bias: new THREE.Vector2(0.035, 0.015), features: [], depthInfo: null,
  begin(session) {
    this.features = Array.from(session.enabledFeatures || []);
    this.hasDepth = this.features.includes('depth-sensing') && session.depthUsage === 'gpu-optimized';
    let saved = null; try { saved = localStorage.getItem('guenther-occ'); } catch (e) { /* privat */ }
    this.mode = saved && AR_MODES[saved] && (saved !== 'depth' || this.hasDepth) ? saved : (this.hasDepth ? 'depth' : 'boxes');
  },
  cycle() {
    const order = (this.hasDepth ? ['depth'] : []).concat(['boxes', 'off']);
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    try { localStorage.setItem('guenther-occ', this.mode); } catch (e) { /* privat */ }
  },
  // Jedes Bild: Tiefen-Verdecker von three.js ein/aus, Schwelle nachführen
  update() {
    World.occ.visible = this.mode === 'boxes';
    if (!renderer.xr.isPresenting || !this.hasDepth) return;
    const mesh = renderer.xr.getDepthSensingMesh();
    if (!mesh) return;
    const u = mesh.material.uniforms;
    if (!mesh.userData.patched) {
      mesh.userData.patched = true;
      u.uNear = { value: 0.1 }; u.uK = { value: 1 }; u.uBias = { value: this.bias };
      // Wie das Original von three.js, aber die echte Tiefe wird ein paar Zentimeter nach hinten geschoben:
      // alles im Spiel steht direkt AUF echten Flächen und würde sonst im Sensorrauschen flackern.
      mesh.material.fragmentShader = `
uniform sampler2DArray depthColor; uniform float depthWidth; uniform float depthHeight;
uniform float uNear; uniform float uK; uniform vec2 uBias;
void main() {
  vec2 c = vec2(gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight);
  float d = c.x >= 1.0 ? texture(depthColor, vec3(c.x - 1.0, c.y, 1)).r : texture(depthColor, vec3(c.x, c.y, 0)).r;
  if (uBias.x > 0.0) {
    float z = uNear / max(1.0 - d * uK, 1e-5);
    z += uBias.x + uBias.y * z;
    d = clamp((1.0 - uNear / z) / uK, 0.0, 1.0);
  }
  gl_FragDepth = d;
}`;
      mesh.material.needsUpdate = true;
    }
    const cam = renderer.xr.getCamera();
    u.uNear.value = cam.near; u.uK.value = isFinite(cam.far) ? (cam.far - cam.near) / cam.far : 1;
    mesh.visible = this.mode === 'depth';
  },
};
// Raumdaten für die Fehlersuche (per USB auslesbar): localStorage 'guenther-dump'
function roomDump(frame) {
  const r3 = (v) => +v.toFixed(3);
  const d = {
    t: new Date().toISOString(), head: Player.head.toArray().map(r3), floorY: r3(Room.floorY), ceilY: r3(Room.ceilY), fallback: Room.fallback, skipped: Room.skipped,
    ar: { mode: AR.mode, hasDepth: AR.hasDepth, features: AR.features, depth: AR.depthInfo },
    floorPoly: Room.floorPoly?.map((q) => q.map(r3)),
    walls: World.walls.map((w) => ({ a: w.a.map(r3), b: w.b.map(r3), y0: r3(w.y0), y1: r3(w.y1), label: w.label })),
    solids: World.solids.map((s) => ({ label: s.label, top: r3(s.top), bottom: r3(s.bottom), poly: s.poly.map((q) => q.map(r3)) })),
    planes: Room.planes.map((p) => ({ label: p.label, c: p.center.toArray().map(r3), n: p.normal.toArray().map(r3), area: r3(p.area), active: Room.active.includes(p),
      poly: p.poly.map(([x, z]) => new V3(x, 0, z).applyMatrix4(p.matrix).toArray().map(r3)) })),
    meshes: [],
  };
  try {
    frame?.detectedMeshes?.forEach((m) => {
      const v = m.vertices, min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
      for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[i + k]); max[k] = Math.max(max[k], v[i + k]); }
      const pose = frame.getPose(m.meshSpace, renderer.xr.getReferenceSpace());
      d.meshes.push({ label: m.semanticLabel, verts: v.length / 3, min: min.map(r3), max: max.map(r3), pos: pose ? [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z].map(r3) : null });
    });
  } catch (e) { d.meshErr = String(e); }
  try { localStorage.setItem('guenther-dump', JSON.stringify(d)); } catch (e) { /* voll/privat */ }
  return d;
}

const STEP = 0.045, GR = 0.035, GH = 0.15;
function solidsAll() { return World.solids.concat(World.dyn); }
function inSolid(s, x, z, pad = 0) {
  if (x < s.min[0] - pad || x > s.max[0] + pad || z < s.min[1] - pad || z > s.max[1] + pad) return false;
  if (pip(x, z, s.poly)) return true;
  if (pad <= 0) return false;
  return closestOnPoly(x, z, s.poly, [0, 0]) < pad;
}
function onFloor(x, z) { return !Room.floorPoly || pip(x, z, Room.floorPoly) || closestOnPoly(x, z, Room.floorPoly, [0, 0]) < 0.15; }
// Höchste Standfläche unter (x, maxY, z)
function groundAt(x, z, maxY, pad = GR * 0.6) {
  let y = -Infinity, src = null;
  if (onFloor(x, z)) { y = Room.floorY; src = 'floor'; }
  for (const s of solidsAll()) {
    if (s.top > maxY + STEP || s.top <= y) continue;
    if (inSolid(s, x, z, pad)) { y = s.top; src = s; }
  }
  return { y, src };
}
// Kreis (Günther, Saugroboter) aus Festkörpern und Wänden schieben
const _c2 = [0, 0];
function pushOut(pos, r, y0, y1, skip) {
  let hit = false;
  for (const s of solidsAll()) {
    if (s === skip || s.top <= y0 + STEP || s.bottom >= y1) continue;
    if (pos.x < s.min[0] - r || pos.x > s.max[0] + r || pos.z < s.min[1] - r || pos.z > s.max[1] + r) continue;
    const inside = pip(pos.x, pos.z, s.poly);
    const d = closestOnPoly(pos.x, pos.z, s.poly, _c2);
    if (inside) {
      const dx = _c2[0] - pos.x, dz = _c2[1] - pos.z, l = Math.hypot(dx, dz) || 1;
      pos.x = _c2[0] + (dx / l) * r; pos.z = _c2[1] + (dz / l) * r; hit = true;
    } else if (d < r) {
      const dx = pos.x - _c2[0], dz = pos.z - _c2[1], l = d || 1;
      pos.x = _c2[0] + (dx / l) * r; pos.z = _c2[1] + (dz / l) * r; hit = true;
    }
  }
  for (const w of World.walls) {
    if (w.y1 < y0 || w.y0 > y1) continue;
    closestOnSeg(pos.x, pos.z, w.a[0], w.a[1], w.b[0], w.b[1], _c2);
    const dx = pos.x - _c2[0], dz = pos.z - _c2[1], d = Math.hypot(dx, dz);
    if (d < r && d > 1e-6) { pos.x = _c2[0] + (dx / d) * r; pos.z = _c2[1] + (dz / d) * r; hit = true; }
  }
  return hit;
}
// Strahl gegen alle Oberseiten (für "Günther, komm her" und PC-Maus)
function rayTops(o, d, maxT = 8) {
  let best = null;
  const test = (y, ok, src) => {
    if (Math.abs(d.y) < 1e-4) return;
    const t = (y - o.y) / d.y;
    if (t <= 0 || t > maxT || (best && t >= best.t)) return;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (ok(x, z)) best = { t, point: new V3(x, y, z), src };
  };
  test(Room.floorY, (x, z) => onFloor(x, z), 'floor');
  for (const s of solidsAll()) test(s.top, (x, z) => inSolid(s, x, z), s);
  if (best) for (const w of World.walls) {
    const ex = o.x + d.x * best.t, ez = o.z + d.z * best.t;
    if (segCross(o.x, o.z, ex, ez, w.a[0], w.a[1], w.b[0], w.b[1])) {
      // Wand im Weg? Nur wenn der Strahl die Wand in ihrer Höhe trifft
      const dx = ex - o.x, dz = ez - o.z;
      const wx = w.b[0] - w.a[0], wz = w.b[1] - w.a[1];
      const den = dx * wz - dz * wx; if (Math.abs(den) < 1e-9) continue;
      const u = ((w.a[0] - o.x) * wz - (w.a[1] - o.z) * wx) / den;
      const hy = o.y + d.y * best.t * u;
      if (hy > w.y0 && hy < w.y1) return null;
    }
  }
  return best;
}
function losFloor(ax, az, bx, bz, skipWall) {
  for (const w of World.walls) if (w !== skipWall && segCross(ax, az, bx, bz, w.a[0], w.a[1], w.b[0], w.b[1])) return false;
  return true;
}

// ---------------------------------------------------------------- Materialien
const MAT = {
  skin: new THREE.MeshPhongMaterial({ color: 0xf0a982, shininess: 25 }),
  nose: new THREE.MeshPhongMaterial({ color: 0xe0585a, shininess: 60 }),
  shorts: new THREE.MeshPhongMaterial({ color: 0x5f6b3a, shininess: 10 }),
  sock: new THREE.MeshPhongMaterial({ color: 0xf4f4ee }),
  sandal: new THREE.MeshPhongMaterial({ color: 0x5a3a1a, shininess: 30 }),
  hair: new THREE.MeshPhongMaterial({ color: 0x3a2c22, shininess: 40 }),
  white: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 }),
  black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  mouth: new THREE.MeshBasicMaterial({ color: 0x5a1a1a }),
  porcelain: new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 160 }),
  gold: new THREE.MeshPhongMaterial({ color: 0xffc83a, specular: 0xffffff, shininess: 200, emissive: 0x4a3000 }),
  wood: new THREE.MeshPhongMaterial({ color: 0x9a6a3a, shininess: 20 }),
  woodDark: new THREE.MeshPhongMaterial({ color: 0x5a3a1e, shininess: 10 }),
  metal: new THREE.MeshPhongMaterial({ color: 0x8a8f9a, specular: 0xffffff, shininess: 120 }),
  bottle: new THREE.MeshPhongMaterial({ color: 0x6a3208, specular: 0xffd9a0, shininess: 150, transparent: true, opacity: 0.92 }),
  cap: new THREE.MeshPhongMaterial({ color: 0xd8b030, specular: 0xffffff, shininess: 120 }),
  crate: new THREE.MeshPhongMaterial({ color: 0x1f6a3a, shininess: 40 }),
  robot: new THREE.MeshPhongMaterial({ color: 0x2a2c33, specular: 0x8899aa, shininess: 90 }),
  robotTop: new THREE.MeshPhongMaterial({ color: 0x4a4e5a, specular: 0xaabbcc, shininess: 120 }),
  led: new THREE.MeshBasicMaterial({ color: 0x3fd2ff }),
  cushion: new THREE.MeshPhongMaterial({ color: 0xff4f8b, specular: 0xffffff, shininess: 70 }),
  paper: new THREE.MeshPhongMaterial({ color: 0xfbf8f0, shininess: 8 }),
  cardboard: new THREE.MeshPhongMaterial({ color: 0xb08a5a, shininess: 5 }),
};
const shirtTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
  for (let x = 0; x < 128; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  // Senffleck, Bierfleck
  g.fillStyle = 'rgba(200,150,30,0.55)'; g.beginPath(); g.ellipse(70, 74, 9, 6, 0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(140,90,30,0.35)'; g.beginPath(); g.ellipse(52, 92, 6, 8, -0.3, 0, Math.PI * 2); g.fill();
});
MAT.shirt = new THREE.MeshPhongMaterial({ map: shirtTex, shininess: 5 });
const paperTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
});
MAT.paper.map = paperTex;
const crateTex = canvasTex(256, 192, (g) => {
  g.fillStyle = '#1f6a3a'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#174e2b'; for (let x = 16; x < 256; x += 40) g.fillRect(x, 20, 24, 60);
  g.fillStyle = '#ffd23f'; g.font = '900 54px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('PILS', 128, 150);
  g.strokeStyle = '#0e3a1e'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 184);
});
MAT.crateSide = new THREE.MeshPhongMaterial({ map: crateTex, shininess: 40 });
const labelTex = canvasTex(128, 64, (g) => {
  g.fillStyle = '#f2e6c0'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#b01c1c'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 54, 128, 10);
  g.fillStyle = '#3a1a00'; g.font = '900 26px serif'; g.textAlign = 'center'; g.fillText('HELLES', 64, 42);
});
MAT.label = new THREE.MeshPhongMaterial({ map: labelTex, shininess: 30 });

// ---------------------------------------------------------------- Günther (Modell)
function buildGuenther() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.012, 0.044, 0); body.add(pivot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0068, 0.03, 8), MAT.skin); leg.position.y = -0.015; pivot.add(leg);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.012, 8), MAT.sock); sock.position.y = -0.032; pivot.add(sock);
    const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.027), MAT.sandal); sandal.position.set(0, -0.041, 0.004); pivot.add(sandal);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.003, 0.004), MAT.sandal); strap.position.set(0, -0.036, 0.009); pivot.add(strap);
    legs.push(pivot);
  }
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.031, 0.022, 14), MAT.shorts); shorts.position.y = 0.052; body.add(shorts);
  const belly = new THREE.Mesh(S(1, 18, 14), MAT.shirt); belly.scale.set(0.034, 0.036, 0.032); belly.position.y = 0.08; body.add(belly);
  const paunch = new THREE.Mesh(S(1, 14, 10), MAT.shirt); paunch.scale.set(0.028, 0.026, 0.026); paunch.position.set(0, 0.072, 0.011); body.add(paunch);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.033, 0.1, 0); body.add(pivot);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.03, 4, 8), MAT.skin); arm.position.y = -0.019; pivot.add(arm);
    const hand = new THREE.Mesh(S(0.0078, 10, 8), MAT.skin); hand.position.y = -0.04; pivot.add(hand);
    pivot.rotation.z = sx * 0.22;
    arms.push(pivot);
  }
  const head = new THREE.Group(); head.position.y = 0.123; body.add(head);
  head.add(new THREE.Mesh(S(0.029, 20, 16), MAT.skin));
  const stubble = new THREE.Mesh(new THREE.SphereGeometry(0.0293, 20, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4),
    new THREE.MeshBasicMaterial({ color: 0x3a3030, transparent: true, opacity: 0.4, depthWrite: false })); head.add(stubble);
  const nose = new THREE.Mesh(S(0.0088, 12, 10), MAT.nose); nose.position.set(0, -0.003, 0.028); head.add(nose);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(sx * 0.0105, 0.007, 0.0235); head.add(eye);
    eye.add(new THREE.Mesh(S(0.0068, 10, 8), MAT.white));
    const pupil = new THREE.Mesh(S(0.0031, 8, 6), MAT.black); pupil.position.z = 0.0045; eye.add(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), MAT.skin); lid.rotation.x = 0.35; eye.add(lid);
    eyes.push(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.0032, 0.004), MAT.hair); brow.position.set(sx * 0.0105, 0.0165, 0.026); brow.rotation.z = -sx * 0.25; head.add(brow);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.003, 0.004), MAT.mouth); mouth.position.set(0, -0.0185, 0.0245); head.add(mouth);
  // Schnauzer
  for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035, 0.009, 3, 6), MAT.hair); st.rotation.z = Math.PI / 2 + sx * 0.35; st.position.set(sx * 0.0065, -0.0118, 0.027); head.add(st); }
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(S(0.007, 8, 6), MAT.skin); ear.scale.set(0.6, 1, 1); ear.position.set(sx * 0.029, 0.001, 0); head.add(ear); }
  // Haarkranz hinten + drei tapfere Strähnen quer über die Glatze
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.0298, 20, 6, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, Math.PI * 0.36, Math.PI * 0.22), MAT.hair); head.add(fringe);
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.0292, 0.0012, 4, 16, Math.PI * 0.8), MAT.hair);
    s.rotation.set(0, Math.PI / 2, 0); s.rotation.order = 'YXZ'; s.position.z = i * 0.006; s.rotateZ(Math.PI * 0.1); head.add(s);
  }
  root.scale.setScalar(1.12);
  return { root, body, legs, arms, head, eyes, mouth };
}

// Sprechblase über Günthers Kopf
const Bubble = (() => {
  const tex = canvasTex(512, 200, () => {});
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 40; sp.scale.set(0.24, 0.094, 1); sp.center.set(0.5, 0); sp.visible = false; scene.add(sp);
  let t = 0;
  function wrap(g, text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) { const n = cur ? cur + ' ' + w : w; if (g.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }
    if (cur) lines.push(cur); return lines;
  }
  return {
    sprite: sp,
    show(text, dur) {
      const g = tex.userData.g; g.clearRect(0, 0, 512, 200);
      let fs = 40; g.font = `800 ${fs}px system-ui,sans-serif`;
      let lines = wrap(g, text, 460);
      while (lines.length > 3 && fs > 24) { fs -= 4; g.font = `800 ${fs}px system-ui,sans-serif`; lines = wrap(g, text, 460); }
      const h = lines.length * fs * 1.15 + 30, top = 170 - h;
      g.fillStyle = 'rgba(255,255,255,0.96)'; g.strokeStyle = '#222'; g.lineWidth = 5;
      g.beginPath(); g.roundRect(8, top, 496, h, 26); g.moveTo(236, top + h); g.lineTo(256, 196); g.lineTo(280, top + h); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(238, top + h - 5, 40, 6);
      g.fillStyle = '#1a1206'; g.textAlign = 'center'; g.textBaseline = 'top';
      lines.forEach((l, i) => g.fillText(l, 256, top + 15 + i * fs * 1.15));
      tex.needsUpdate = true; sp.visible = true; t = dur;
    },
    update(dt, pos) {
      if (!sp.visible) return;
      t -= dt; if (t <= 0) { sp.visible = false; return; }
      sp.position.copy(pos);
      sp.material.opacity = Math.min(1, t * 3);
    },
    get talking() { return sp.visible && t > 0.4; },
  };
})();

// ---------------------------------------------------------------- Sprüche
const LINES = {
  start: ['Alter, ich muss SO dringend.', 'Wenn ich nicht gleich ein Klo finde, gibt’s hier einen Wasserschaden.', 'Wer stellt denn sein Klo da oben hin? Psychopath.', 'Drei Bier, null Klos. Typisch.', 'Los, du Riese. Bau mir was. Schnell!'],
  jump: ['Hopp!', 'Uff, meine Bandscheibe.', 'Ich bin zu alt für die Scheiße.', 'Hui!', 'Nicht gucken, wenn ich springe!'],
  lava: ['AUA, MEINE EIER!', 'HEISS! HEISS! Wie im Solarium deiner Mutter.', 'Na toll, Sandalen durchgeschmort.', 'Wer hat den Boden auf Stufe 9 gestellt?!', 'Ich riech wie Grillwurst.'],
  fall: ['Aua. Mein Steißbein.', 'Das war Absicht. Für die Haltungsnote.', 'Scheiß Schwerkraft.'],
  beer: ['Prost, ihr Säcke!', 'Noch eins geht. Geht immer.', 'Genau das, was meine Blase jetzt braucht. Nicht.', 'Für die Nerven.', 'Lauwarm. Wie mein Liebesleben.'],
  idle: ['Ey, du da mit der Taucherbrille. Bau mal was!', 'Ich steh hier nicht zum Spaß. Ich steh hier zum Pissen.', 'Glotz nicht so, mach was.', 'Ich zähl bis drei, dann piss ich in deine Pflanze.', 'Hallo? Klopapier? Treppe? Irgendwas?'],
  high: ['Ich klemm schon die Beine zusammen!', 'Gleich läuft’s. Ich schwör.', 'Das ist kein Schweiß am Bein.', 'Mein Tank ist voll, Chef!', 'Nicht lachen. NICHT LACHEN.'],
  roll: ['Klopapier als Treppe. Endlich sinnvoll verwendet.', 'Dreilagig! Luxus!', 'Schwebendes Klopapier. Frag nicht, ist Magie.', 'Mehr! Ich bin kein Bergziege!'],
  cushion: ['PFRRRT. Das war ich nicht.', 'Das Ding riecht nach Onkel Herbert.', 'Raketenantrieb auf Biogas!', 'Hui, mein Hintern fliegt!'],
  robot: ['Der Saugroboter will mich ficken!', 'Verpiss dich, du Scheiß-Teller!', 'Nicht einsaugen, ich bin verheiratet!', 'Der ist schärfer auf mich als meine Ex.'],
  ride: ['Taxi! Zum Klo bitte. Trinkgeld gibt’s keins.', 'Ich reite den Saugroboter. Mama wäre stolz.'],
  win: ['Aaaaaaah. Besser als Sex.', 'Endlich. Fast wie Urlaub.', 'Nicht hingucken, du Spanner!', 'Das war knapp. Wie bei der Bundeswehr.', 'Oh ja. Oh JA. OH JAAA.'],
  fail: ['Zu spät. Jetzt ist es warm.', 'Ich sag einfach, es war Bier.', 'Danke für nichts, du Lauch.', 'Das ist jetzt deine Schuld. Und dein Teppich.'],
  furn: {
    table: 'Euer Tisch ist klebrig. Ich will nicht wissen, wovon.',
    desk: 'Am Schreibtisch wird also nachts heimlich „gearbeitet“.',
    couch: 'Auf dem Sofa ist mehr los als in deiner Beziehung.',
    bed: 'Das Bett hat Dinge gesehen. Schlimme Dinge.',
    shelf: 'Ein Regal voller Staub und Lebensentscheidungen.',
    storage: 'Im Schrank liegt sicher dein Ex-Freund. Oder Socken.',
    screen: 'Bildschirm. Hier wird also Porno geguckt. Äh. Gearbeitet.',
    plant: 'Die Pflanze sieht durstig aus. Ich hätt da was.',
  },
  noroom: ['Kein Raum gefunden. Ich steh im Nichts. Wie nach Silvester.'],
};
const lastLine = new Map();
function line(cat) {
  const arr = LINES[cat]; if (!arr) return '';
  let s; do s = pick(arr); while (arr.length > 1 && s === lastLine.get(cat));
  lastLine.set(cat, s); return s;
}

// ---------------------------------------------------------------- Günther (Steuerung & Physik)
const GRAV = 3.6, JUMP_V = Math.sqrt(2 * GRAV * 0.21), SPEED = 0.42, CUSHION_V = Math.sqrt(2 * GRAV * 0.95);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, map: glowTex });
const Guenther = {
  m: buildGuenther(),
  pos: new V3(), vel: new V3(), yaw: 0, onGround: false, ground: null, airT: 0,
  phase: 0, walkAmt: 0, squash: 1, squashV: 0, blinkT: 2, dead: 0, deadKind: '', sayCd: 0, idleT: 0, check: new V3(), checkT: 0,
  target: null, frozen: false, visible: false, prevGroundSrc: null, rideT: 0,
  init() {
    scene.add(this.m.root); this.m.root.visible = false;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20).rotateX(-Math.PI / 2), shadowMat); this.shadow.renderOrder = 3; scene.add(this.shadow);
    // Ortungsmarke: immer sichtbar, falls er hinter Möbeln verschwindet
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('▼', '#ffd23f', 64), transparent: true, depthTest: false, depthWrite: false, opacity: 0.6 }));
    this.marker.scale.set(0.025, 0.025, 1); this.marker.renderOrder = 35; scene.add(this.marker);
    this.show(false);
  },
  show(v) { this.visible = v; this.m.root.visible = v; this.shadow.visible = v; this.marker.visible = v; if (!v) Bubble.sprite.visible = false; },
  spawn(p) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.check.copy(p); this.dead = 0; this.target = null; this.frozen = false; this.onGround = false;
    const f = Player.head.clone().sub(p); this.yaw = Math.atan2(f.x, f.z);
    this.show(true); this.squash = 0.5;
    Glow.burst(p.clone().add(new V3(0, 0.06, 0)), 0xffd23f, 30, 0.4, 0.012, 0.6); Sound.poof(p);
  },
  say(cat, force = false, text) {
    if (!force && this.sayCd > 0) return;
    const s = text || line(cat); if (!s) return;
    const dur = clamp(1.6 + s.length * 0.055, 2.2, 5);
    Bubble.show(s, dur); this.sayCd = dur + rand(2, 4);
    Sound.mumble(this.pos, Math.min(10, 3 + Math.floor(s.length / 9)), /!/.test(s));
  },
  die(kind) {
    if (this.dead > 0) return;
    if (kind === 'reset') { this.dead = 0.01; this.deadKind = kind; this.target = null; return; }
    this.dead = kind === 'robot' ? 1.4 : 1.2; this.deadKind = kind; this.target = null;
    Game.bladder = Math.min(0.999, Game.bladder + 0.03); Game.falls++;
    if (kind === 'lava') { Sound.sizzle(this.pos); this.say('lava', true); for (let i = 0; i < 25; i++) Smoke.emit(this.pos.clone().add(new V3(rand(-0.03, 0.03), 0.02, rand(-0.03, 0.03))), new V3(rand(-0.05, 0.05), rand(0.15, 0.35), rand(-0.05, 0.05)), 0x333333, 0.02, rand(0.8, 1.5), -0.05, 0.03, 0.5); Glow.burst(this.pos, 0xff7a1a, 20, 0.5, 0.01, 0.5, 0.8, 0.6); }
    else if (kind === 'robot') { Sound.suck(this.pos); this.say('robot', true); }
    else { Sound.land(this.pos); this.say('fall', true); }
  },
  respawn() {
    this.dead = 0; this.vel.set(0, 0, 0);
    const g = groundAt(this.check.x, this.check.z, this.check.y + 0.02);
    const ok = g.src && !(g.src === 'floor' && Level.lava) && g.src.kind !== 'robot' && Math.abs(g.y - this.check.y) < 0.03;
    this.pos.copy(ok ? this.check : Level.spawn);
    this.m.root.scale.setScalar(1.12); this.m.body.rotation.set(0, 0, 0);
    Glow.burst(this.pos.clone().add(new V3(0, 0.06, 0)), 0xffd23f, 24, 0.35, 0.012, 0.5); Sound.poof(this.pos);
    this.squash = 0.5;
  },
  update(dt) {
    if (!this.visible) return;
    this.sayCd -= dt;
    const m = this.m;
    // Tot: Animation abspielen, dann zurück zum Checkpoint
    if (this.dead > 0) {
      this.dead -= dt;
      if (this.deadKind === 'robot' && Robot.obj) {
        const k = 1 - this.dead / 1.4;
        this.pos.lerp(Robot.pos.clone().setY(Room.floorY + 0.04), Math.min(1, dt * 6));
        m.root.scale.setScalar(1.12 * Math.max(0.05, 1 - k)); m.root.rotation.y += dt * 25;
      } else if (this.deadKind === 'lava') {
        this.pos.y -= dt * 0.03; m.body.rotation.z = Math.sin(this.dead * 40) * 0.3;
      }
      this.applyVisual(dt, true);
      if (this.dead <= 0) { m.root.rotation.y = this.yaw; this.respawn(); }
      return;
    }
    if (this.frozen) { this.applyVisual(dt, false); return; }
    // Eingabe → Wunschbewegung
    const mv = Input.move;
    let wx = mv.x, wz = mv.z;
    if (Math.hypot(wx, wz) > 0.1) this.target = null;
    else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.025) this.target = null; else { wx = dx / d; wz = dz / d; }
    }
    const want = Math.min(1, Math.hypot(wx, wz));
    const ax = wx * SPEED, az = wz * SPEED;
    const k = 1 - Math.exp(-dt * (this.onGround ? 14 : 4));
    this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
    // Sprungpuffer + Coyote-Zeit: Sprung zählt kurz vor der Landung und kurz nach der Kante noch
    if (Input.jump) this.jumpBuf = 0.15; else this.jumpBuf = Math.max(0, (this.jumpBuf || 0) - dt);
    this.coyote = this.onGround ? 0.12 : Math.max(0, (this.coyote || 0) - dt);
    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0) && this.vel.y <= 0.01) { this.jumpBuf = 0; this.coyote = 0; this.doJump(JUMP_V); }
    // Beim Hinlaufen selbst springen: an Kanten (wenn das Ziel nicht tiefer liegt) und kurz vor höheren Zielen
    if (this.target && this.onGround) {
      const ahead = groundAt(this.pos.x + wx * 0.06, this.pos.z + wz * 0.06, this.pos.y);
      const dxy = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if ((ahead.y < this.pos.y - STEP && this.target.y > this.pos.y - STEP) || (this.target.y > this.pos.y + STEP && dxy < 0.16)) this.doJump(JUMP_V);
    }
    this.vel.y -= GRAV * dt;
    // Saugroboter-Taxi
    if (this.onGround && this.ground?.kind === 'robot') { this.pos.x += Robot.vel.x * dt; this.pos.z += Robot.vel.z * dt; this.rideT += dt; if (this.rideT > 1.5 && this.rideT < 1.6) this.say('ride'); }
    else this.rideT = 0;
    const prevY = this.pos.y;
    const before = this.pos.clone();
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Saugroboter erwischt ihn am Boden
    if (Robot.obj && this.pos.y < Room.floorY + 0.03 && Math.hypot(this.pos.x - Robot.pos.x, this.pos.z - Robot.pos.z) < Robot.R + GR * 0.6) { this.die('robot'); return; }
    const hit = pushOut(this.pos, GR, this.pos.y, this.pos.y + GH);
    // Automatisch hüpfen, wenn er beim Hinlaufen an einer Stufe hängt
    if (hit && this.target && this.onGround && before.distanceTo(this.pos) < SPEED * dt * 0.4) this.doJump(JUMP_V);
    this.pos.y += this.vel.y * dt;
    // Decke (Tischplatte von unten)
    if (this.vel.y > 0) for (const s of solidsAll()) {
      if (s.bottom > prevY + GH - 0.001 && s.bottom < this.pos.y + GH && inSolid(s, this.pos.x, this.pos.z)) { this.pos.y = s.bottom - GH; this.vel.y = 0; }
    }
    const g = groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    const wasGround = this.onGround;
    if (this.vel.y <= 0 && this.pos.y <= g.y + 0.002 && prevY >= g.y - STEP) {
      this.pos.y = g.y; if (!wasGround && this.airT > 0.12) { this.squash = 0.7; Sound.land(this.pos); Glow.burst(this.pos, 0xffffff, 5, 0.12, 0.006, 0.3); }
      this.vel.y = 0; this.onGround = true; this.ground = g.src; this.airT = 0;
    } else { this.onGround = false; this.airT += dt; }
    if (this.onGround) {
      if (g.src === 'floor' && Level.lava) { this.die('lava'); return; }
      // Furzkissen
      const c = Cushions.list.find((c) => Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < 0.06 && Math.abs(c.pos.y - this.pos.y) < 0.05);
      if (c) { Cushions.fire(c); this.doJump(CUSHION_V, true); }
      // Sicherer Platz für den Checkpoint
      if (g.src !== 'floor' || !Level.lava) {
        if (g.src?.kind !== 'robot') { this.checkT += dt; if (this.checkT > 0.4) this.check.copy(this.pos); }
      }
    } else this.checkT = 0;
    if (this.pos.y < Room.floorY - 0.6) { this.die('fall'); return; }
    // Blickrichtung
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.05) {
      const ty = Math.atan2(this.vel.x, this.vel.z);
      let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 12);
    }
    this.walkAmt += ((this.onGround ? Math.min(1, hs / SPEED) : 0) - this.walkAmt) * Math.min(1, dt * 10);
    this.phase += dt * hs * 55;
    // Rumstehen: Sprüche
    if (want < 0.1 && this.onGround) { this.idleT += dt; if (this.idleT > 9) { this.idleT = 0; this.say(Game.bladder > 0.7 ? 'high' : 'idle'); } } else this.idleT = 0;
    this.applyVisual(dt, false);
  },
  doJump(v, cushion = false) {
    this.vel.y = v; this.onGround = false; this.squash = 1.3; this.airT = 0.01;
    if (!cushion) { Sound.jump(this.pos); if (Math.random() < 0.12) this.say('jump'); }
  },
  applyVisual(dt, dead) {
    const m = this.m;
    m.root.position.copy(this.pos);
    if (!dead) m.root.rotation.y = this.yaw;
    // Squash & Stretch als Feder
    this.squashV += ((1 - this.squash) * 180 - this.squashV * 14) * dt; this.squash += this.squashV * dt;
    if (!this.onGround && !dead) this.squash += (1.08 - this.squash) * Math.min(1, dt * 6);
    m.body.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash));
    const w = this.walkAmt, s = Math.sin(this.phase);
    const dance = !dead && this.onGround && w < 0.2 && Game.bladder > 0.65 && Game.state === 'play';
    if (!this.onGround && !dead) {
      m.legs[0].rotation.set(-0.7, 0, 0); m.legs[1].rotation.set(0.4, 0, 0);
      m.arms[0].rotation.set(0, 0, -2.3); m.arms[1].rotation.set(0, 0, 2.3);
      m.body.position.y = 0;
    } else if (dance) {
      // Pipi-Tanz: Knie zusammen, Hände in den Schritt, zappeln
      const t = performance.now() / 1000;
      m.legs[0].rotation.set(0, 0, 0.14 + Math.sin(t * 18) * 0.05); m.legs[1].rotation.set(0, 0, -0.14 - Math.sin(t * 18) * 0.05);
      m.arms[0].rotation.set(-0.5, 0, 0.35); m.arms[1].rotation.set(-0.5, 0, -0.35);
      m.body.position.y = Math.abs(Math.sin(t * 9)) * 0.006;
      m.body.rotation.y = Math.sin(t * 7) * 0.15;
    } else {
      m.legs[0].rotation.set(s * 0.75 * w, 0, 0); m.legs[1].rotation.set(-s * 0.75 * w, 0, 0);
      m.arms[0].rotation.set(-s * 0.6 * w, 0, -0.22 - w * 0.1); m.arms[1].rotation.set(s * 0.6 * w, 0, 0.22 + w * 0.1);
      m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.005 * w;
      m.body.rotation.y *= 0.8; m.body.rotation.z = Math.sin(this.phase) * 0.06 * w;
    }
    // Blinzeln, Mund beim Reden
    this.blinkT -= dt; const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = rand(1.8, 4.5);
    for (const e of m.eyes) e.scale.y = blink ? 0.15 : 1;
    m.mouth.scale.y = Bubble.talking ? 1 + Math.abs(Math.sin(performance.now() / 45)) * 3.5 : 1;
    m.head.rotation.x = dance ? 0.25 : 0;
    // Schatten auf die Fläche darunter
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.01);
    if (isFinite(g.y)) {
      this.shadow.visible = this.visible;
      this.shadow.position.set(this.pos.x, g.y + 0.004, this.pos.z);
      const h = this.pos.y - g.y; this.shadow.scale.setScalar(clamp(1 - h * 1.5, 0.35, 1)); shadowMat.opacity = clamp(0.5 - h, 0.12, 0.5);
    } else this.shadow.visible = false;
    this.marker.position.set(this.pos.x, this.pos.y + 0.25, this.pos.z);
    this.marker.material.opacity = 0.35 + 0.25 * Math.sin(performance.now() / 300);
    Bubble.update(dt, this.pos.clone().add(new V3(0, 0.19, 0)));
  },
};

// ---------------------------------------------------------------- Requisiten
const Level = { n: 0, lava: false, spawn: new V3(), toilet: null, beers: [], objs: [], origin: new V3(), fwd: new V3(0, 0, -1), avoid: [], spec: null, rolls: 0, cushions: 0 };
function addObj(o) { scene.add(o); Level.objs.push(o); return o; }

// Bierkiste (Plattform auf dem Boden)
function makeCrate(x, z, yaw) {
  const w = 0.3, d = 0.4, h = 0.28, y0 = Room.floorY;
  const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = yaw;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [MAT.crateSide, MAT.crateSide, MAT.crate, MAT.crate, MAT.crateSide, MAT.crateSide]);
  box.position.y = h / 2; g.add(box);
  // Kronkorken-Raster auf der Oberseite
  const capGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.006, 10);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const c = new THREE.Mesh(capGeo, MAT.cap); c.position.set(-0.105 + i * 0.07, h + 0.001, -0.15 + j * 0.075); g.add(c); }
  addObj(g);
  World.dyn.push(makeSolid('crate', rectPoly(x, z, w / 2, d / 2, yaw), y0 + h + 0.004, y0 - 0.05));
  Level.avoid.push(new V3(x, y0 + h, z));
  return y0 + h + 0.004;
}
// Wandbrett mit zwei Konsolen, ragt aus einer echten Wand
function makeLedge(spot, w, d) {
  const g = new THREE.Group(); g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.yaw;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), MAT.wood); board.position.y = -0.011; g.add(board);
  for (const sx of [-1, 1]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), MAT.metal); br.position.set(sx * (w / 2 - 0.04), -0.05, -d / 2 + 0.008); g.add(br);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, d * 0.8), MAT.metal); arm.position.set(sx * (w / 2 - 0.04), -0.027, -d * 0.1); g.add(arm);
  }
  addObj(g);
  World.dyn.push(makeSolid('ledge', rectPoly(spot.x, spot.z, w / 2, d / 2, spot.yaw), spot.y, spot.y - 0.025));
  Level.avoid.push(new V3(spot.x, spot.y, spot.z));
}
// Das goldene Ziel
function makeToilet(p, faceTo) {
  const g = new THREE.Group(); g.position.copy(p);
  g.rotation.y = Math.atan2(faceTo.x - p.x, faceTo.z - p.z);
  const S = 0.75;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * S, 0.03 * S, 0.06 * S, 16), MAT.porcelain); ped.position.y = 0.03 * S; g.add(ped);
  const bowlPts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; bowlPts.push(new THREE.Vector2((0.026 + 0.022 * Math.sin(t * Math.PI / 2)) * S, (0.06 + t * 0.03) * S)); }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 20), MAT.porcelain); bowl.scale.z = 1.25; g.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.03 * S, 18).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x6ad0ff, shininess: 200, transparent: true, opacity: 0.85 }));
  water.position.y = 0.082 * S; water.scale.z = 1.25; g.add(water);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.038 * S, 0.0065 * S, 8, 24).rotateX(Math.PI / 2), MAT.gold); seat.position.y = 0.092 * S; seat.scale.z = 1.25; g.add(seat);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.044 * S, 0.044 * S, 0.006 * S, 24), MAT.gold); lid.scale.z = 1.25; lid.rotation.x = -1.4; lid.position.set(0, 0.14 * S, -0.06 * S); g.add(lid);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.075 * S, 0.075 * S, 0.03 * S), MAT.porcelain); tank.position.set(0, 0.13 * S, -0.068 * S); g.add(tank);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.004 * S, 12), MAT.gold); btn.position.set(0, 0.17 * S, -0.068 * S); g.add(btn);
  // Lichtsäule + Schild, damit man das Ziel im Raum findet
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 20, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uT; varying vec2 vUv; void main(){ float a=(1.0-vUv.y)*0.35*(0.7+0.3*sin(uT*3.0+vUv.y*12.0)); gl_FragColor=vec4(1.0,0.82,0.3,a); }',
  }));
  beam.position.y = 0.6; g.add(beam);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('WC', '#ffd23f', 80), transparent: true, depthWrite: false }));
  sign.scale.set(0.09 * textTexture('WC', '#ffd23f', 80).userData.aspect, 0.09, 1); sign.position.y = 0.32; g.add(sign);
  addObj(g);
  Level.toilet = { pos: p.clone(), g, beam, sign, seatY: p.y + 0.092 * S };
  Level.avoid.push(p.clone());
}
// Bierflasche zum Einsammeln
function makeBeer(p) {
  const g = new THREE.Group(); g.position.copy(p);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.038, 12), MAT.bottle); g.add(body);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.011, 0.012, 12), MAT.bottle); shoulder.position.y = 0.025; g.add(shoulder);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 10), MAT.bottle); neck.position.y = 0.037; g.add(neck);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.004, 10), MAT.cap); cap.position.y = 0.045; g.add(cap);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0113, 0.0113, 0.018, 12, 1, true), MAT.label); g.add(label);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb02e, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.09); g.add(glow);
  addObj(g);
  Level.beers.push({ g, base: p.clone(), t: Math.random() * 6, taken: false });
  Level.avoid.push(p.clone());
}

// Klopapierrollen (vom Spieler gesetzt; schweben)
const CELL = 0.12;
const rollGeo = (() => {
  const shape = new THREE.Shape(); shape.absarc(0, 0, 0.056, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.02, 0, Math.PI * 2, true); shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.114, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.003, 0); return g;
})();
const coreGeo = new THREE.CylinderGeometry(0.0205, 0.0205, 0.118, 16, 1, true).translate(0, 0.06, 0);
const ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.35, depthWrite: false });
const ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false });
const Rolls = {
  list: [],
  add(x, z, y) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const m = new THREE.Mesh(rollGeo, MAT.paper); g.add(m);
    const core = new THREE.Mesh(coreGeo, MAT.cardboard); g.add(core);
    g.rotation.y = Math.random() * 6; g.scale.setScalar(0.01);
    addObj(g);
    const s = makeSolid('roll', rectPoly(x, z, CELL / 2, CELL / 2), y + CELL, y);
    World.dyn.push(s);
    const r = { g, s, pos: new V3(x, y, z), grow: 0 };
    this.list.push(r); return r;
  },
  remove(r) {
    scene.remove(r.g); World.dyn.splice(World.dyn.indexOf(r.s), 1); this.list.splice(this.list.indexOf(r), 1);
    Level.objs.splice(Level.objs.indexOf(r.g), 1);
    Smoke.burst(r.pos.clone().add(new V3(0, 0.06, 0)), 0xffffff, 10, 0.2, 0.015, 0.5);
  },
  update(dt) {
    for (const r of this.list) if (r.grow < 1) { r.grow = Math.min(1, r.grow + dt * 6); const k = r.grow; r.g.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.15 - (1 - k) * 0.9); }
  },
  clear() { this.list = []; },
};
// Wo würde eine Rolle landen? (Raster 12 cm; setzt sich auf Flächen direkt darunter)
function rollCell(x, yRaw, z, exactY = false) {
  const cx = Math.round(x / CELL) * CELL, cz = Math.round(z / CELL) * CELL;
  let y = exactY ? yRaw : Room.floorY + Math.max(0, Math.round((yRaw - Room.floorY - CELL / 2) / CELL)) * CELL;
  const g = groundAt(cx, cz, y + CELL * 0.6, 0);
  if (isFinite(g.y) && g.y > y - 0.001 && g.y < y + CELL * 0.6) y = g.y;
  if (isFinite(g.y) && g.y > y - CELL * 0.5 && g.y <= y) y = g.y;
  return new V3(cx, y, cz);
}
function rollValid(p) {
  const y0 = p.y, y1 = p.y + CELL;
  for (const s of solidsAll()) {
    if (s.top <= y0 + 0.004 || s.bottom >= y1 - 0.004) continue;
    if (s.kind === 'roll') { if (Math.abs(s.min[0] + CELL / 2 - p.x) < CELL - 0.01 && Math.abs(s.min[1] + CELL / 2 - p.z) < CELL - 0.01) return false; continue; }
    if (inSolid(s, p.x, p.z, CELL * 0.45)) return false;
  }
  for (const w of World.walls) { closestOnSeg(p.x, p.z, w.a[0], w.a[1], w.b[0], w.b[1], _c2); if (Math.hypot(p.x - _c2[0], p.z - _c2[1]) < CELL * 0.45) return false; }
  const gp = Guenther.pos;
  if (Guenther.visible && Math.abs(gp.x - p.x) < CELL / 2 + GR && Math.abs(gp.z - p.z) < CELL / 2 + GR && gp.y < y1 && gp.y + GH > y0) return false;
  if (Level.toilet && Level.toilet.pos.distanceTo(p.clone().setY(Math.min(Math.max(Level.toilet.pos.y, y0), y1))) < 0.1) return false;
  return true;
}
// Furzkissen
const cushionGeo = new THREE.SphereGeometry(0.04, 18, 10).scale(1, 0.32, 1);
const Cushions = {
  list: [],
  add(p) {
    const g = new THREE.Group(); g.position.copy(p);
    const m = new THREE.Mesh(cushionGeo, MAT.cushion); m.position.y = 0.012; g.add(m);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.02, 10).rotateX(Math.PI / 2), MAT.cushion); nozzle.position.set(0, 0.008, 0.045); g.add(nozzle);
    addObj(g);
    const c = { g, m, pos: p.clone(), squish: 0 }; this.list.push(c); return c;
  },
  remove(c) { scene.remove(c.g); this.list.splice(this.list.indexOf(c), 1); Level.objs.splice(Level.objs.indexOf(c.g), 1); },
  fire(c) {
    c.squish = 1; Sound.fart(c.pos, rand(0.6, 1.1), rand(0.85, 1.2)); fartCloud(c.pos.clone().add(new V3(0, 0.02, 0)), 18);
    Hands.buzzAll(0.4, 120);
    if (Math.random() < 0.45) Guenther.say('cushion', true);
  },
  update(dt) {
    for (const c of this.list) { c.squish = Math.max(0, c.squish - dt * 2.5); c.m.scale.set(1 + c.squish * 0.3, 1 - c.squish * 0.7, 1 + c.squish * 0.3); }
  },
  clear() { this.list = []; },
};
function cushionSpot(x, y, z) {
  const g = groundAt(x, z, y);
  if (!isFinite(g.y) || y - g.y > 1.2) return null;
  const p = new V3(x, g.y, z);
  const ok = !(g.src === 'floor' && Level.lava) && g.src?.kind !== 'robot' && !Cushions.list.some((c) => c.pos.distanceTo(p) < 0.08)
    && !(Level.toilet && Level.toilet.pos.distanceTo(p) < 0.1);
  return { p, ok };
}

// Saugroboter
const Robot = {
  obj: null, pos: new V3(), vel: new V3(), dir: 0, R: 0.16, solid: null, turnT: 0, brushes: [],
  spawn(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(this.R, this.R, 0.07, 32), MAT.robot); base.position.y = 0.04; g.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(this.R * 0.82, this.R * 0.85, 0.012, 32), MAT.robotTop); top.position.y = 0.08; g.add(top);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), MAT.robot); tower.position.set(0, 0.088, 0.06); g.add(tower);
    const led = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.003, 6, 24).rotateX(Math.PI / 2), MAT.led); led.position.set(0, 0.094, 0.06); g.add(led);
    const bump = new THREE.Mesh(new THREE.CylinderGeometry(this.R + 0.004, this.R + 0.004, 0.03, 32, 1, true, -1.2, 2.4), MAT.robotTop); bump.position.y = 0.035; g.add(bump);
    this.brushes = [];
    for (const sx of [-1, 1]) {
      const b = new THREE.Group(); b.position.set(sx * 0.1, 0.006, 0.1); g.add(b);
      for (let i = 0; i < 3; i++) { const bristle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.002, 0.004), MAT.black); bristle.rotation.y = (i * Math.PI) / 3; b.add(bristle); }
      this.brushes.push(b);
    }
    // Böse Augen
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b })); e.position.set(sx * 0.04, 0.05, this.R - 0.002); g.add(e); }
    addObj(g); this.obj = g;
    this.pos.set(x, Room.floorY, z); this.dir = Math.random() * 6.28;
    this.solid = makeSolid('robot', rectPoly(x, z, 0.12, 0.12), Room.floorY + 0.088, Room.floorY - 0.01);
    World.dyn.push(this.solid);
  },
  clear() { this.obj = null; this.solid = null; },
  update(dt) {
    if (!this.obj) return;
    this.turnT -= dt;
    const sp = 0.16;
    const nx = this.pos.x + Math.sin(this.dir) * sp * dt, nz = this.pos.z + Math.cos(this.dir) * sp * dt;
    const test = new V3(nx, 0, nz);
    // Kollision (ohne sich selbst), Bodenrand
    const solidsBackup = World.dyn; World.dyn = World.dyn.filter((s) => s !== this.solid);
    const hit = pushOut(test, this.R, Room.floorY, Room.floorY + 0.08);
    World.dyn = solidsBackup;
    const offFloor = Room.floorPoly && !pip(nx + Math.sin(this.dir) * this.R, nz + Math.cos(this.dir) * this.R, Room.floorPoly);
    if (hit || offFloor || this.turnT < -rand(4, 9)) { this.dir += (Math.random() < 0.5 ? 1 : -1) * rand(1.6, 2.8); this.turnT = 0; this.vel.set(0, 0, 0); }
    else { this.vel.set((nx - this.pos.x) / dt, 0, (nz - this.pos.z) / dt); this.pos.x = nx; this.pos.z = nz; }
    this.obj.position.copy(this.pos);
    const cur = this.obj.rotation.y; let d = this.dir - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); this.obj.rotation.y = cur + d * Math.min(1, dt * 5);
    for (const b of this.brushes) b.rotation.y += dt * 18;
    const p = rectPoly(this.pos.x, this.pos.z, 0.12, 0.12, this.obj.rotation.y);
    this.solid.poly = p; const bb = bbox(p); this.solid.min = bb.min; this.solid.max = bb.max;
    if (Math.random() < dt * 8) Smoke.emit(this.pos.clone().add(new V3(rand(-0.1, 0.1), 0.01, rand(-0.1, 0.1))), new V3(0, 0.03, 0), 0xb0a090, 0.008, 0.6, 0, 0.01);
  },
};

// Lava-Boden
const lavaMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
  vertexShader: 'varying vec2 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform float uT; varying vec2 vW;
    float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
    void main(){
      vec2 p=vW*3.0; float t=uT*0.15;
      float q=fbm(p+vec2(t,-t*0.7)); float r=fbm(p*1.7+q*2.0-vec2(t*0.6,t));
      float k=smoothstep(0.35,0.85,r);
      vec3 c=mix(vec3(0.25,0.02,0.0),vec3(1.0,0.32,0.02),k); c=mix(c,vec3(1.0,0.85,0.3),smoothstep(0.75,0.95,r));
      gl_FragColor=vec4(c,0.9); }`,
});
const Lava = {
  mesh: null,
  build() {
    this.clear();
    let geo;
    if (Room.floorPoly) geo = topGeometry(Room.floorPoly, Room.floorY + 0.004);
    else geo = new THREE.CircleGeometry(3.5, 48).rotateX(-Math.PI / 2).translate(Level.origin.x, Room.floorY + 0.004, Level.origin.z);
    this.mesh = new THREE.Mesh(geo, lavaMat); this.mesh.renderOrder = 1; scene.add(this.mesh);
  },
  clear() { if (this.mesh) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; } },
  update(dt) {
    if (!this.mesh) return;
    lavaMat.uniforms.uT.value += dt;
    if (Math.random() < dt * 12) {
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 2.5;
      const x = Level.origin.x + Math.cos(a) * r, z = Level.origin.z + Math.sin(a) * r;
      if (onFloor(x, z) && groundAt(x, z, Room.floorY + 0.01).src === 'floor') Glow.emit(new V3(x, Room.floorY + 0.01, z), new V3(rand(-0.02, 0.02), rand(0.08, 0.2), rand(-0.02, 0.02)), pick([0xff6a1a, 0xffa02e, 0xff3a0a]), rand(0.006, 0.012), rand(0.6, 1.2), 0.05);
    }
  },
};

// ---------------------------------------------------------------- Spieler, Hände, Eingabe
const Player = { head: new V3(0, 1.6, 0), fwd: new V3(0, 0, -1), quat: new THREE.Quaternion() };
const laserMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const Hands = {
  list: [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    scene.add(c);
    const h = { i, c, src: null, pos: new V3(), dir: new V3(), prev: [], tip: new V3() };
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), laserMat); laser.visible = false; c.add(laser); h.laser = laser;
    // kleine Klorolle an der rechten Hand als "Werkzeug"
    const tool = new THREE.Group(); const tr = new THREE.Mesh(rollGeo, MAT.paper); tr.scale.setScalar(0.35); tr.rotation.x = Math.PI / 2; tr.position.set(0, 0.0, -0.03); tool.add(tr); tool.visible = false; c.add(tool); h.tool = tool;
    c.addEventListener('connected', (e) => { h.src = e.data; });
    c.addEventListener('disconnected', () => { h.src = null; });
    return h;
  }),
  get right() { return this.list.find((h) => h.src?.handedness === 'right') || null; },
  get left() { return this.list.find((h) => h.src?.handedness === 'left') || null; },
  buzz(h, v, ms) { try { h?.src?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch (e) { /* ohne Haptik */ } },
  buzzAll(v, ms) { for (const h of this.list) this.buzz(h, v, ms); },
  update() {
    for (const h of this.list) {
      h.c.updateMatrixWorld(true);
      h.pos.setFromMatrixPosition(h.c.matrixWorld);
      h.dir.set(0, 0, -1).transformDirection(h.c.matrixWorld);
      h.tip.copy(h.pos).addScaledVector(h.dir, 0.1);
      h.tool.visible = !!h.src && h.src.handedness === 'right' && Game.state === 'play';
    }
  },
};
function btn(h, i) { return !!h?.src?.gamepad?.buttons?.[i]?.pressed; }
function edge(h, i) {
  if (!h) return false;
  const now = btn(h, i), was = !!h.prev[i]; return now && !was;
}
const Input = {
  move: new V3(), jump: false,
  ghost: null, ghostPos: null, ghostOk: false, ghostKind: 'roll',
  init() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(rollGeo, ghostMatOk); g.add(m); g.userData.m = m;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    g.add(line); g.userData.line = line;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(ring); g.userData.ring = ring;
    g.visible = false; ring.visible = false; scene.add(g); this.ghost = g;
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.03, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthWrite: false })); this.target.visible = false; scene.add(this.target);
  },
  // Ziel-Vorschau einer Rolle zeigen
  showGhost(p, ok) {
    const g = this.ghost; g.visible = true; g.position.copy(p);
    g.userData.m.material = ok ? ghostMatOk : ghostMatBad;
    const gr = groundAt(p.x, p.z, p.y - 0.001, 0);
    const h = isFinite(gr.y) ? p.y - gr.y : 0;
    g.userData.line.visible = h > 0.02; g.userData.line.scale.y = Math.max(0.001, h);
    g.userData.ring.visible = h > 0.02; if (h > 0.02) g.userData.ring.position.set(p.x, gr.y + 0.004, p.z);
  },
  hideGhost() { this.ghost.visible = false; this.ghost.userData.ring.visible = false; },
  update(dt) {
    this.move.set(0, 0, 0); this.jump = false;
    const f = Player.fwd.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const r = new V3(-f.z, 0, f.x);
    if (DESK.on) { Desk.input(this, f, r); return; }
    const R = Hands.right, L = Hands.left;
    // Bewegung: beide Sticks (wer will, steuert mit rechts)
    for (const h of [L, R]) {
      const ax = h?.src?.gamepad?.axes; if (!ax) continue;
      const sx = ax[2] ?? 0, sy = ax[3] ?? 0;
      if (Math.hypot(sx, sy) > 0.15) this.move.addScaledVector(r, sx).addScaledVector(f, -sy);
    }
    if (this.move.length() > 1) this.move.normalize();
    const play = Game.state === 'play';
    // A/X: im Spiel springen; sonst A = weiter, X = (im Intro) Raum neu scannen
    if (play) { if (edge(R, 4) || edge(L, 4)) this.jump = true; }
    else {
      if (edge(R, 4)) Game.onA();
      if (edge(R, 5) && Game.state === 'intro') { AR.cycle(); Sound.tone('triangle', 520, 700, 0.06, 0.1); }
      if (edge(L, 4)) { if (Game.state === 'intro') Setup.capture(); else Game.onA(); }
    }
    // Rechte Hand: bauen
    if (play && R) {
      const tip = R.tip;
      const cell = rollCell(tip.x, tip.y - CELL / 2, tip.z);
      const ok = rollValid(cell) && Level.rolls > 0;
      this.showGhost(cell, ok);
      if (edge(R, 0)) Game.placeRoll(cell, ok);
      if (edge(R, 1)) Game.placeCushion(tip);
      if (edge(R, 5)) Game.removeAt(tip);
    } else this.hideGhost();
    // Linke Hand: zeigen & rufen, Checkpoint
    if (play && L) {
      const pressing = btn(L, 0);
      L.laser.visible = pressing;
      if (pressing) {
        const hit = rayTops(L.pos, L.dir);
        this.target.visible = !!hit; if (hit) { this.target.position.copy(hit.point).y += 0.004; L.laser.scale.z = hit.t; this.aim = hit.point; } else { L.laser.scale.z = 2; this.aim = null; }
      } else if (L.prev[0]) {
        if (this.aim) { Guenther.target = this.aim.clone(); Sound.tone('triangle', 660, 880, 0.08, 0.1); }
        this.target.visible = false; this.aim = null;
      }
      if (edge(L, 1) && Guenther.dead <= 0) Guenther.die('reset');
    } else if (L) L.laser.visible = false;
    // Y halten = beenden
    if (btn(L, 5)) { this.exitT = (this.exitT || 0) + dt; if (this.exitT > 1) { this.exitT = 0; renderer.xr.getSession()?.end(); } }
    else this.exitT = 0;
    for (const h of Hands.list) { const b = h.src?.gamepad?.buttons; if (b) for (let i = 0; i < b.length; i++) h.prev[i] = b[i].pressed; }
  },
};

// ---------------------------------------------------------------- HUD (linkes Handgelenk) & Banner
const HUD = (() => {
  const tex = canvasTex(512, 256, () => {});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 25; mesh.visible = false;
  let t = 0;
  function drop(g, x, y, s, fill) {
    g.beginPath(); g.moveTo(x, y - s); g.bezierCurveTo(x + s * 0.9, y - s * 0.1, x + s * 0.8, y + s * 0.8, x, y + s * 0.8);
    g.bezierCurveTo(x - s * 0.8, y + s * 0.8, x - s * 0.9, y - s * 0.1, x, y - s); g.fillStyle = fill; g.fill();
  }
  return {
    mesh,
    attach() {
      const L = DESK.on ? null : Hands.left;
      if (DESK.on) { camera.add(mesh); mesh.position.set(-0.14, -0.085, -0.3); mesh.rotation.set(0, 0, 0); }
      else if (L) { L.c.add(mesh); mesh.position.set(0, 0.06, 0.04); mesh.rotation.set(-0.7, 0, 0); }
    },
    update(dt) {
      mesh.visible = Game.state === 'play' || Game.state === 'pee';
      if (!mesh.visible) return;
      if (!mesh.parent || mesh.parent === scene) this.attach();
      t -= dt; if (t > 0) return; t = 0.2;
      const g = tex.userData.g; g.clearRect(0, 0, 512, 256);
      g.fillStyle = 'rgba(26,18,6,0.82)'; g.beginPath(); g.roundRect(4, 4, 504, 248, 26); g.fill();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.stroke();
      g.textBaseline = 'top'; g.fillStyle = '#ffd23f'; g.font = '900 30px system-ui,sans-serif';
      g.fillText(`LEVEL ${Level.n} · ${Level.spec?.name || ''}`.slice(0, 30), 22, 16);
      // Blasen-Balken
      const b = Game.bladder, warn = b > 0.75;
      drop(g, 40, 92, 22, warn && Math.floor(performance.now() / 250) % 2 ? '#ff4040' : '#ffe14f');
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(74, 76, 410, 34);
      g.fillStyle = warn ? '#ff7a2e' : '#ffe14f'; g.fillRect(74, 76, 410 * b, 34);
      g.fillStyle = '#1a1206'; g.font = '900 24px system-ui,sans-serif'; g.fillText(`BLASE ${Math.round(b * 100)} %`, 84, 81);
      g.font = '800 30px system-ui,sans-serif'; g.fillStyle = '#fff';
      g.fillText(`🍺 ${Game.beers}/${Level.beers.length}`, 22, 132);
      g.fillText(`🧻 ${Level.rolls}`, 190, 132);
      g.fillText(`💨 ${Level.cushions}`, 330, 132);
      g.fillStyle = '#ffd23f'; g.font = '900 40px system-ui,sans-serif'; g.fillText(`${Game.score + Game.levelScore()}`, 22, 186);
      g.font = '600 20px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.textAlign = 'right';
      g.fillText('Abzug: Rolle · Griff: Kissen · B: weg', 492, 200); g.textAlign = 'left';
      tex.needsUpdate = true;
    },
  };
})();
const Banner = (() => {
  const tex = canvasTex(1024, 420, () => {});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.49), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  mesh.renderOrder = 50; scene.add(mesh); mesh.visible = false;
  let timer = 0, sticky = false;
  const target = new V3();
  return {
    show(title, sub = '', color = '#ffd23f', dur = 2.5) {
      const g = tex.userData.g; g.clearRect(0, 0, 1024, 420);
      g.fillStyle = 'rgba(26,18,6,0.55)'; g.beginPath(); g.roundRect(20, 20, 984, 380, 40); g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 110; g.font = `900 ${fs}px system-ui,sans-serif`; while (g.measureText(title).width > 940 && fs > 40) { fs -= 6; g.font = `900 ${fs}px system-ui,sans-serif`; }
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#3a2200'; g.strokeText(title, 512, 110);
      g.fillStyle = color; g.fillText(title, 512, 110);
      const lines = sub.split('\n');
      let sf = lines.length > 4 ? 34 : 42; g.font = `700 ${sf}px system-ui,sans-serif`; g.fillStyle = '#ffffff';
      while (sf > 22 && Math.max(...lines.map((l) => g.measureText(l).width)) > 940) { sf -= 2; g.font = `700 ${sf}px system-ui,sans-serif`; }
      lines.forEach((l, i) => { g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(l, 512, 210 + i * sf * 1.25); g.fillText(l, 512, 210 + i * sf * 1.25); });
      tex.needsUpdate = true; mesh.visible = true; timer = dur; sticky = dur <= 0;
      this.place(true);
    },
    hide() { mesh.visible = false; sticky = false; },
    place(snap) {
      const f = Player.fwd.clone(); f.y = clamp(f.y, -0.45, 0.2); f.normalize();
      target.copy(Player.head).addScaledVector(f, 1.4);
      if (snap) mesh.position.copy(target);
    },
    update(dt) {
      if (!mesh.visible) return;
      if (!sticky) { timer -= dt; if (timer <= 0) { mesh.visible = false; return; } }
      this.place(false);
      mesh.position.lerp(target, 1 - Math.exp(-dt * 2.5));
      mesh.lookAt(Player.head);
      mesh.material.opacity = sticky ? 1 : Math.min(1, timer * 2);
    },
  };
})();

// ---------------------------------------------------------------- Einrichtung (Raum zeigen, Günther kommentiert)
const Setup = {
  group: new THREE.Group(), t: 0, key: '', msg: '', captureUsed: false, commented: false,
  begin() { this.t = 0; this.key = ''; this.msg = ''; this.commented = false; scene.add(this.group); },
  end() { this.clear(); scene.remove(this.group); },
  clear() { for (const c of [...this.group.children]) { this.group.remove(c); c.material?.dispose?.(); } },
  stats() {
    const furn = World.solids.filter((s) => s.kind === 'furn');
    return { walls: World.walls.length, furn: furn.length, floor: !!Room.floorPoly, real: Room.haveReal, labels: furn.map((s) => s.label) };
  },
  update(dt) {
    this.t += dt;
    if (this.t < 1.2) return;
    const st = this.stats(); const key = JSON.stringify(st) + this.msg + Guenther.visible + AR.mode;
    if (key === this.key) return;
    this.key = key; this.clear();
    for (const s of World.solids) {
      const tex = textTexture(LABEL_DE[s.label] || s.label.toUpperCase(), '#ffd23f', 48);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(0.05 * tex.userData.aspect, 0.05, 1);
      sp.position.set((s.min[0] + s.max[0]) / 2, s.top + 0.1, (s.min[1] + s.max[1]) / 2); this.group.add(sp);
    }
    const roomTxt = st.real ? `${st.walls} Wände · ${st.furn} Möbel · Boden ${st.floor ? 'erkannt' : 'fehlt'}` : 'Kein Raumscan gefunden: virtuelles Zimmer aktiv';
    const keys = DESK.on ? 'Enter: Los geht’s' : `A: Los geht’s · X: Raum neu scannen\nB: Verdeckung durch echte Dinge [${AR_MODES[AR.mode]}]`;
    Banner.show('GÜNTHER MUSS MAL', `${this.msg ? this.msg + '\n' : ''}${roomTxt}\n${keys}${DESK.on ? '\nGünther laufen lassen, springen, Klorollen bauen' : ''}`, '#ffd23f', 0);
    if (!this.commented && Guenther.visible) {
      this.commented = true;
      const lbl = st.labels.find((l) => LINES.furn[l]);
      setTimeout(() => Guenther.say('', true, lbl ? LINES.furn[lbl] : (st.real ? 'Kein einziges Möbelstück? Wohnst du in ’ner Turnhalle?' : LINES.noroom[0])), 600);
    }
  },
  async capture() {
    const session = renderer.xr.getSession();
    if (this.captureUsed) { this.msg = 'Neuscan nur 1x pro Sitzung (Y halten, neu starten)'; this.key = ''; return; }
    if (!session || typeof session.initiateRoomCapture !== 'function') { this.msg = 'Neuscan hier nicht verfügbar: Quest-Einstellungen > Raumeinrichtung'; this.key = ''; return; }
    this.captureUsed = true;
    try { await session.initiateRoomCapture(); this.msg = 'Raum aktualisiert'; } catch (e) { this.msg = 'Raumscan abgebrochen'; }
    this.key = ''; this.commented = false;
  },
};

// ---------------------------------------------------------------- Level-Bau aus dem echten Raum
const LEVELS = [
  { name: 'Kleines Geschäft', target: 'crate', crates: 0, ledges: 1, rolls: 6, cushions: 1, time: 150, tip: 'Stell ihm zwei Klorollen als Treppe hin.' },
  { name: 'Hoch hinaus', target: 'furn', h: 0.7, crates: 1, ledges: 2, rolls: 12, cushions: 2, time: 160, tip: 'Furzkissen = Raketenstart. Griff-Taste.' },
  { name: 'Der Boden ist Lava', target: 'furn', h: 0.6, lava: true, crates: 2, ledges: 2, rolls: 18, cushions: 2, time: 170, tip: 'Boden nicht berühren! Bau eine Brücke.' },
  { name: 'Der Sauger', target: 'ledge', h: 1.0, robot: true, crates: 1, ledges: 2, rolls: 16, cushions: 2, time: 160, tip: 'Der Saugroboter frisst Günther. Blockier ihn mit Rollen.' },
  { name: 'Lava-Taxi', target: 'high', lava: true, robot: true, crates: 2, ledges: 3, rolls: 20, cushions: 3, time: 180, tip: 'Der Saugroboter ist hitzefest. Aufsteigen!' },
];
function levelSpec(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1];
  return { name: `Nachschlag ${n - LEVELS.length}`, target: pick(['furn', 'ledge', 'high']), h: rand(0.7, 1.3), lava: Math.random() < 0.6, robot: Math.random() < 0.5,
    crates: 2, ledges: 3, rolls: 18, cushions: 2, time: Math.max(120, 180 - (n - LEVELS.length) * 10), tip: 'Jetzt wird’s eng. Wie in Günthers Hose.' };
}
function nearAvoid(p, d) { return Level.avoid.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < d && Math.abs(a.y - p.y) < 0.5); }
// Freier Bodenpunkt im Blickfeld des Spielers
function freeFloorPoint(rmin, rmax, spread = 1.4, margin = 0.25, avoidD = 0.45) {
  const o = Level.origin, fa = Math.atan2(Level.fwd.x, Level.fwd.z);
  for (let tries = 0; tries < 300; tries++) {
    const relax = tries > 200;
    const a = fa + rand(-spread, spread) * (relax ? 1.6 : 1), r = rand(rmin, rmax) * (relax ? rand(0.6, 1) : 1);
    const x = o.x + Math.sin(a) * r, z = o.z + Math.cos(a) * r;
    if (Room.floorPoly && (!pip(x, z, Room.floorPoly) || closestOnPoly(x, z, Room.floorPoly, [0, 0]) < margin)) continue;
    if (solidsAll().some((s) => inSolid(s, x, z, margin))) continue;
    if (World.walls.some((w) => { closestOnSeg(x, z, w.a[0], w.a[1], w.b[0], w.b[1], _c2); return Math.hypot(x - _c2[0], z - _c2[1]) < margin; })) continue;
    if (!losFloor(o.x, o.z, x, z)) continue;
    const p = new V3(x, Room.floorY, z);
    if (nearAvoid(p, avoidD * (relax ? 0.6 : 1))) continue;
    return p;
  }
  return o.clone().addScaledVector(Level.fwd, 0.8).setY(Room.floorY);
}
// Platz für ein Wandbrett auf einer echten Wand in Höhe h
function ledgeSpot(h, w, d) {
  const o = Level.origin;
  const walls = World.walls.filter((wl) => Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]) > w + 0.25 && !/window|door/.test(wl.label) && wl.y1 > Room.floorY + h + 0.2);
  for (let tries = 0; tries < 200 && walls.length; tries++) {
    const wl = pick(walls);
    const len = Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]);
    const s = rand((w / 2 + 0.1) / len, 1 - (w / 2 + 0.1) / len);
    const px = wl.a[0] + (wl.b[0] - wl.a[0]) * s, pz = wl.a[1] + (wl.b[1] - wl.a[1]) * s;
    let nx = -(wl.b[1] - wl.a[1]) / len, nz = (wl.b[0] - wl.a[0]) / len;
    if (nx * (o.x - px) + nz * (o.z - pz) < 0) { nx = -nx; nz = -nz; }
    const dist = Math.hypot(o.x - px, o.z - pz);
    if (dist > 3.6 && tries < 150) continue;
    const cx = px + nx * (d / 2 + 0.004), cz = pz + nz * (d / 2 + 0.004), y = Room.floorY + h;
    if (!losFloor(o.x, o.z, px + nx * 0.02, pz + nz * 0.02, wl)) continue;
    if (World.solids.some((sd) => sd.top > y - 0.3 && sd.bottom < y + 0.2 && inSolid(sd, cx, cz, w / 2 + 0.05))) continue;
    if (nearAvoid(new V3(cx, y, cz), 0.45)) continue;
    // Das Brett liegt mit der langen Seite an der Wand: lokale x-Achse = Wandrichtung
    return { x: cx, y, z: cz, yaw: Math.atan2(nx, nz), n: [nx, nz] };
  }
  return null;
}
// Platz auf einer Möbel-Oberseite (mit Randabstand)
function spotOnTop(s, margin = 0.08) {
  for (let i = 0; i < 80; i++) {
    const x = rand(s.min[0], s.max[0]), z = rand(s.min[1], s.max[1]);
    if (!pip(x, z, s.poly) || closestOnPoly(x, z, s.poly, [0, 0]) < margin) continue;
    const p = new V3(x, s.top, z); if (nearAvoid(p, 0.25)) continue;
    return p;
  }
  return null;
}
function furnTops(minH, maxH) {
  const o = Level.origin;
  return World.solids.filter((s) => s.kind === 'furn' && s.top - Room.floorY >= minH && s.top - Room.floorY <= maxH && (s.max[0] - s.min[0]) > 0.2 && (s.max[1] - s.min[1]) > 0.2
    && Math.hypot((s.min[0] + s.max[0]) / 2 - o.x, (s.min[1] + s.max[1]) / 2 - o.z) < 4);
}
function clearLevel() {
  for (const o of Level.objs) scene.remove(o);
  Level.objs = []; Level.beers = []; Level.avoid = []; Level.toilet = null;
  World.dyn = []; Rolls.clear(); Cushions.clear(); Robot.clear(); Lava.clear();
}
function buildLevel(n) {
  clearLevel();
  if (Room.dirty) rebuildWorld();
  const spec = levelSpec(n); Level.spec = spec; Level.n = n; Level.lava = !!spec.lava;
  Level.origin.copy(Player.head).setY(Room.floorY);
  Level.fwd.copy(Player.fwd).setY(0); if (Level.fwd.lengthSq() < 1e-4) Level.fwd.set(0, 0, -1); Level.fwd.normalize();
  Level.avoid.push(Level.origin.clone());
  // Start
  const sp = freeFloorPoint(0.55, 0.95, 0.6, 0.25, 0.3);
  if (Level.lava) { const top = makeCrate(sp.x, sp.z, Math.atan2(Level.fwd.x, Level.fwd.z)); Level.spawn.set(sp.x, top, sp.z); }
  else { Level.spawn.copy(sp); Level.avoid.push(sp.clone()); }
  // Ziel
  let goal = null;
  const placeOnFurn = (list) => { for (const s of list) { const p = spotOnTop(s, 0.09); if (p) return p; } return null; };
  if (spec.target === 'crate') {
    const p = freeFloorPoint(1.1, 1.7, 0.9, 0.3, 0.6);
    const top = makeCrate(p.x, p.z, rand(-0.5, 0.5) + Math.atan2(Level.fwd.x, Level.fwd.z)); goal = new V3(p.x, top, p.z);
  } else if (spec.target === 'furn') {
    const list = furnTops(0.35, 1.3).sort((a, b) => Math.abs(a.top - Room.floorY - spec.h) - Math.abs(b.top - Room.floorY - spec.h));
    goal = placeOnFurn(list);
  } else if (spec.target === 'high') {
    goal = placeOnFurn(furnTops(0.5, 1.6).sort((a, b) => b.top - a.top));
  }
  if (!goal) {
    const s = ledgeSpot(spec.h || 1.0, 0.36, 0.2) || ledgeSpot(0.6, 0.36, 0.2);
    if (s) { makeLedge(s, 0.36, 0.2); goal = new V3(s.x, s.y, s.z); }
  }
  if (!goal) { const p = freeFloorPoint(1.2, 1.8, 0.9, 0.3, 0.6); const top = makeCrate(p.x, p.z, 0); goal = new V3(p.x, top, p.z); }
  makeToilet(goal, Level.origin.clone().setY(goal.y));
  // Zusatz-Plattformen
  const ledges = [];
  for (let i = 0; i < spec.crates; i++) { const p = freeFloorPoint(0.7, 2.2, 1.3, 0.25, 0.5); const top = makeCrate(p.x, p.z, rand(0, 3.14)); ledges.push(new V3(p.x, top, p.z)); }
  for (let i = 0; i < spec.ledges; i++) { const s = ledgeSpot(rand(0.3, Math.min(1.2, (goal.y - Room.floorY) + 0.1)), 0.28, 0.15); if (s) { makeLedge(s, 0.28, 0.15); ledges.push(new V3(s.x, s.y, s.z)); } }
  // Bier: eins schwebt auf halbem Weg, Rest auf Plattformen, Möbeln, Boden
  const spots = [];
  spots.push(Level.spawn.clone().lerp(goal, 0.55).add(new V3(0, 0.18, 0)));
  for (const l of ledges) spots.push(l.clone().add(new V3(0, 0.05, 0)));
  for (const s of furnTops(0.3, 1.5)) { const p = spotOnTop(s, 0.06); if (p) spots.push(p.add(new V3(0, 0.05, 0))); }
  if (!Level.lava) for (let i = 0; i < 3; i++) spots.push(freeFloorPoint(0.5, 2.0, 1.4, 0.2, 0.4).add(new V3(0, 0.05, 0)));
  else for (let i = 0; i < 2; i++) { const p = freeFloorPoint(0.6, 1.8, 1.2, 0.2, 0.4); spots.push(p.add(new V3(0, rand(0.2, 0.45), 0))); }
  const chosen = [spots[0], ...spots.slice(1).sort(() => Math.random() - 0.5)].slice(0, 5);
  for (const p of chosen) makeBeer(p);
  // Rollen-Budget: Grundwert + Höhe + Strecke (bei Lava)
  const hgt = goal.y - Level.spawn.y, dist = Math.hypot(goal.x - Level.spawn.x, goal.z - Level.spawn.z);
  Level.rolls = spec.rolls + Math.ceil(Math.max(0, hgt) / CELL) + (Level.lava ? Math.ceil(dist / 0.24) : 0);
  Level.cushions = spec.cushions;
  if (Level.lava) Lava.build();
  if (spec.robot) { const p = freeFloorPoint(1.0, 2.2, 1.6, Robot.R + 0.05, 0.5); Robot.spawn(p.x, p.z); }
}

// ---------------------------------------------------------------- Spielablauf
const Game = {
  state: 'idle', bladder: 0, beers: 0, score: 0, falls: 0, t: 0, warned: 0, peeT: 0, best: 0, rollsUsed: 0,
  init() {
    try { this.best = +localStorage.getItem('guenther-best') || 0; } catch (e) { this.best = 0; }
    Guenther.init(); Input.init();
  },
  intro() {
    this.state = 'intro'; this.score = 0; Level.n = 0;
    clearLevel(); Setup.begin(); Music.stop();
    setTimeout(() => {
      if (this.state !== 'intro') return;
      if (Room.dirty) rebuildWorld();
      Level.origin.copy(Player.head).setY(Room.floorY); Level.fwd.copy(Player.fwd).setY(0).normalize();
      const p = freeFloorPoint(0.5, 0.8, 0.4, 0.2, 0.2); Guenther.spawn(p);
    }, 1500);
  },
  start(n) {
    Setup.end(); Banner.hide();
    buildLevel(n);
    this.state = 'play'; this.bladder = n === 1 ? 0.15 : 0.25; this.beers = 0; this.falls = 0; this.t = 0; this.warned = 0; this.rollsUsed = 0;
    Guenther.spawn(Level.spawn);
    Banner.show(`LEVEL ${n}: ${Level.spec.name.toUpperCase()}`, Level.spec.tip + '\nBring Günther zum goldenen Klo!', '#ffd23f', 4);
    Sound.levelUp(); Music.start(); Music.tempo = 132;
    setTimeout(() => Guenther.say('start', true), 1200);
    HUD.attach();
  },
  onA() {
    if (this.state === 'intro' && Guenther.visible) this.start(1);
    else if (this.state === 'fail') this.start(Level.n);
    else if (this.state === 'done') this.start(Level.n + 1);
  },
  levelScore() { return this.beers * 100; },
  placeRoll(cell, ok) {
    if (!ok) { Sound.denied(cell); if (Level.rolls <= 0) popup(cell.clone().add(new V3(0, 0.15, 0)), 'KEINE ROLLEN MEHR', '#ff6a4a', 0.03); return; }
    Rolls.add(cell.x, cell.z, cell.y); Level.rolls--; this.rollsUsed++;
    Sound.place(cell); Hands.buzz(Hands.right, 0.25, 40);
    Smoke.burst(cell.clone().add(new V3(0, 0.06, 0)), 0xffffff, 6, 0.15, 0.012, 0.4);
    if (this.rollsUsed === 3 || Math.random() < 0.06) Guenther.say('roll');
  },
  placeCushion(tip) {
    const c = cushionSpot(Math.round(tip.x / 0.02) * 0.02, tip.y, Math.round(tip.z / 0.02) * 0.02);
    if (!c || !c.ok || Level.cushions <= 0) { Sound.denied(tip); return; }
    Cushions.add(c.p); Level.cushions--; Sound.fart(c.p, 0.25, 1.6); Hands.buzz(Hands.right, 0.3, 50);
  },
  removeAt(p) {
    let best = null, bd = 0.11;
    for (const r of Rolls.list) { const d = r.pos.clone().add(new V3(0, CELL / 2, 0)).distanceTo(p); if (d < bd) { bd = d; best = r; } }
    for (const c of Cushions.list) { const d = c.pos.distanceTo(p); if (d < bd) { bd = d; best = c; } }
    if (!best) return;
    if (best.s) { Rolls.remove(best); Level.rolls++; } else { Cushions.remove(best); Level.cushions++; }
    Sound.remove(p);
  },
  update(dt) {
    if (this.state === 'intro') { Setup.update(dt); return; }
    if (this.state === 'play') {
      this.t += dt;
      this.bladder += dt / Level.spec.time;
      Music.tempo = this.bladder > 0.75 ? 132 + (this.bladder - 0.75) * 240 : 132;
      if (this.bladder > 0.5 && this.warned < 1) { this.warned = 1; Guenther.say('high', true); }
      if (this.bladder > 0.8 && this.warned < 2) { this.warned = 2; Guenther.say('high', true); Banner.show('BLASE 80 %', 'Beeil dich!', '#ff7a2e', 2); }
      if (this.bladder >= 1) return this.fail();
      // Bier einsammeln
      const gc = Guenther.pos.clone().add(new V3(0, 0.07, 0));
      for (const b of Level.beers) {
        if (b.taken) continue;
        b.t += dt; b.g.position.y = b.base.y + Math.sin(b.t * 2.5) * 0.008; b.g.rotation.y += dt * 1.6;
        if (Guenther.dead <= 0 && b.g.position.distanceTo(gc) < 0.075) {
          b.taken = true; scene.remove(b.g); this.beers++; this.bladder = Math.min(0.995, this.bladder + 0.06);
          Sound.plopp(b.g.position); if (Math.random() < 0.6) setTimeout(() => Sound.burp(Guenther.pos), 350);
          Glow.burst(b.g.position, 0xffc04a, 22, 0.35, 0.01, 0.6);
          popup(b.g.position.clone().add(new V3(0, 0.05, 0)), '+100 PROST', '#ffd23f', 0.03);
          if (Math.random() < 0.5) Guenther.say('beer', true);
        }
      }
      // Am Klo?
      const T = Level.toilet;
      if (T) {
        T.beam.material.uniforms.uT.value += dt; T.sign.position.y = 0.32 + Math.sin(this.t * 2) * 0.02;
        if (Guenther.onGround && Guenther.dead <= 0 && Math.hypot(Guenther.pos.x - T.pos.x, Guenther.pos.z - T.pos.z) < 0.075 && Math.abs(Guenther.pos.y - T.pos.y) < 0.06) this.win();
      }
    } else if (this.state === 'pee') {
      this.peeT += dt;
      const T = Level.toilet, G = Guenther;
      // Er stellt sich vors Klo, Rücken zum Spieler, und lässt laufen
      if (this.peeT < 3.6 && Math.random() < dt * 40) {
        const f = new V3(Math.sin(T.g.rotation.y), 0, Math.cos(T.g.rotation.y));
        Glow.emit(G.pos.clone().add(new V3(0, 0.055, 0)).addScaledVector(f, -0.02), f.clone().multiplyScalar(-0.12).add(new V3(0, 0.08, 0)), 0xffe14f, 0.005, 0.35, 1.2);
      }
      if (this.peeT > 3.6 && !this.flushed) { this.flushed = true; Sound.flush(T.pos); confetti(T.pos.clone().add(new V3(0, 0.15, 0))); Sound.win(); this.showResult(); }
    }
  },
  win() {
    this.state = 'pee'; this.peeT = 0; this.flushed = false;
    const G = Guenther, T = Level.toilet;
    G.frozen = true; G.target = null; G.pos.copy(T.pos).add(new V3(Math.sin(T.g.rotation.y), 0, Math.cos(T.g.rotation.y)).multiplyScalar(0.05));
    G.yaw = T.g.rotation.y + Math.PI; G.walkAmt = 0;
    G.say('win', true); Sound.pee(G.pos); Music.stop();
  },
  showResult() {
    const rollBonus = Level.rolls * 15, cushionBonus = Level.cushions * 40, bladderBonus = Math.round((1 - this.bladder) * 600);
    const pts = this.levelScore() + rollBonus + cushionBonus + bladderBonus;
    this.score += pts;
    const rating = bladderBonus > 250 && this.falls === 0 ? 3 : bladderBonus > 100 ? 2 : 1;
    if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('guenther-best', String(this.best)); } catch (e) { /* privat */ } }
    this.state = 'done';
    Banner.show('ERLEICHTERT!', `${'🧻'.repeat(rating)}${'·'.repeat(3 - rating)}\nBier ${this.beers}×100 · Rest-Rollen +${rollBonus} · Kissen +${cushionBonus} · Blase +${bladderBonus}\nGesamt ${this.score} · Rekord ${this.best}\n${DESK.on ? 'Enter' : 'A'}: nächstes Level`, '#7dff6a', 0);
  },
  fail() {
    this.state = 'fail'; Music.stop(); Sound.fail();
    Guenther.frozen = true; Guenther.say('fail', true);
    const p = Guenther.pos.clone();
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xffe14f, transparent: true, opacity: 0.75, shininess: 200 }));
    puddle.position.copy(p).y += 0.003; puddle.scale.setScalar(0.1); addObj(puddle);
    addFx(new THREE.Object3D(), 2, (o, k) => puddle.scale.setScalar(0.1 + k * 0.9));
    Banner.show('ZU SPÄT.', 'Günther hat sich eingenässt.\nDas riecht man bis hier.\n' + (DESK.on ? 'Enter' : 'A') + ': nochmal versuchen', '#ff7a2e', 0);
  },
  exit() {
    this.state = 'idle'; Music.stop(); clearLevel(); Setup.end(); Banner.hide(); Guenther.show(false);
  },
};

// ---------------------------------------------------------------- PC-Modus (ohne Brille, zum Ausprobieren)
const Desk = {
  keys: new Set(), yaw: 0, pitch: -0.35, mouse: new THREE.Vector2(), drag: false, moved: 0, clicks: [],
  start() {
    DESK.on = true;
    document.getElementById('ui').style.display = 'none'; document.getElementById('deskhelp').style.display = 'block';
    renderer.setClearColor(0x2a2018, 1);
    Player.head.set(0, 1.45, 0.6); this.yaw = 0; this.pitch = -0.45;
    this.applyCam();
    buildFallback(); rebuildWorld();
    Player.head.set(0, 1.15, 1.7); this.pitch = -0.42; this.applyCam();
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'Enter') Game.onA(); if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    const cv = renderer.domElement;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => { this.drag = true; this.moved = 0; this.btn = e.button; this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
    addEventListener('pointerup', (e) => { if (this.drag && this.moved < 5) this.clicks.push(e.button); this.drag = false; });
    addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.drag) { this.moved += Math.abs(e.movementX) + Math.abs(e.movementY); this.yaw -= e.movementX * 0.004; this.pitch = clamp(this.pitch - e.movementY * 0.004, -1.4, 1.2); }
    });
    Game.intro();
  },
  applyCam() {
    camera.position.copy(Player.head);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    Player.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  },
  input(inp, f, r) {
    const k = this.keys;
    if (k.has('ArrowUp')) inp.move.add(f); if (k.has('ArrowDown')) inp.move.sub(f);
    if (k.has('ArrowRight')) inp.move.add(r); if (k.has('ArrowLeft')) inp.move.sub(r);
    if (inp.move.lengthSq() > 1) inp.move.normalize();
    if (k.has('Space') && !this.spacePrev) inp.jump = true;
    this.spacePrev = k.has('Space');
    if (k.has('KeyR') && !this.rPrev && Guenther.dead <= 0 && Game.state === 'play') Guenther.die('reset');
    this.rPrev = k.has('KeyR');
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.mouse, camera);
    const hit = rayTops(ray.ray.origin, ray.ray.direction);
    if (Game.state === 'play' && hit) {
      const cell = rollCell(hit.point.x, hit.point.y, hit.point.z, true);
      const ok = rollValid(cell) && Level.rolls > 0;
      inp.showGhost(cell, ok);
      for (const b of this.clicks) { if (b === 0) Game.placeRoll(cell, ok); if (b === 2) Game.placeCushion(hit.point.clone().add(new V3(0, 0.01, 0))); }
      if (k.has('KeyE') && !this.ePrev) Game.removeAt(hit.point.clone().add(new V3(0, 0.03, 0)));
      if (k.has('KeyF') && !this.fPrev) Guenther.target = hit.point.clone();
    } else inp.hideGhost();
    this.ePrev = k.has('KeyE'); this.fPrev = k.has('KeyF');
    this.clicks.length = 0;
  },
  update(dt) {
    const k = this.keys, sp = 1.4 * dt;
    const f = new V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new V3(-f.z, 0, f.x);
    if (k.has('KeyW')) Player.head.addScaledVector(f, sp); if (k.has('KeyS')) Player.head.addScaledVector(f, -sp);
    if (k.has('KeyD')) Player.head.addScaledVector(r, sp); if (k.has('KeyA')) Player.head.addScaledVector(r, -sp);
    if (k.has('KeyQ')) Player.head.y -= sp; if (k.has('KeyZ')) Player.head.y += sp;
    this.applyCam();
  },
};

// ---------------------------------------------------------------- Hauptschleife
let lastT = 0, dumpT = 0;
let sessionTime = 0;
const _up = new V3();
function loop(t, frame) {
  const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.05); lastT = t;
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
    if (!Room.haveReal && !Room.fallback && sessionTime > 2.5) buildFallback();
    // Während des Spiels die Welt nur neu bauen, wenn sich echte Flächen ändern
    if (Room.dirty && (Game.state === 'intro' || sessionTime < 6)) rebuildWorld();
    AR.update();
    dumpT -= dt; if (dumpT <= 0 && sessionTime > 3) { dumpT = 10; roomDump(frame); }
  } else if (DESK.on) {
    Desk.update(dt);
    Sound.listener(Player.head, Player.fwd, new V3(0, 1, 0));
  }
  if (Game.state !== 'idle') {
    Hands.update();
    Input.update(dt);
    Game.update(dt);
    Guenther.update(dt);
    Robot.update(dt);
    Rolls.update(dt);
    Cushions.update(dt);
    Lava.update(dt);
    edgeMat.opacity = 0.35 + 0.2 * Math.sin(t / 400);
  }
  Glow.update(dt); Smoke.update(dt); Bits.update(dt);
  Music.update();
  updateFx(dt);
  HUD.update(dt);
  Banner.update(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Start
const startBtn = document.getElementById('start');
const msg = document.getElementById('msg');
Game.init();
document.getElementById('desk').onclick = () => { Sound.init(); Sound.ctx?.resume?.(); Desk.start(); };
async function setup() {
  if (!navigator.xr) { startBtn.textContent = 'Kein WebXR'; msg.textContent = 'Öffne diese Seite im Browser der Meta Quest.'; return; }
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { ok = false; }
  if (!ok) { startBtn.textContent = 'AR nicht verfügbar'; msg.textContent = 'Dieses Gerät unterstützt kein immersive-ar. Öffne die Seite im Browser der Meta Quest.'; return; }
  startBtn.disabled = false; startBtn.textContent = 'AR STARTEN';
  startBtn.onclick = async () => {
    Sound.init(); Sound.ctx?.resume?.();
    try {
      let session;
      try {
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['plane-detection', 'mesh-detection', 'depth-sensing'],
          depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: [] },
        });
      } catch (e) {
        session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection'] });
      }
      AR.begin(session);
      session.addEventListener('end', () => {
        Game.exit(); Setup.captureUsed = false; document.getElementById('ui').style.display = 'flex';
        Room.planes = []; Room.map.clear(); Room.haveReal = false; Room.fallback = false; Room.dirty = true; sessionTime = 0;
      });
      await renderer.xr.setSession(session);
      document.getElementById('ui').style.display = 'none';
      sessionTime = 0; dumpT = 0;
      Game.intro();
    } catch (e) { msg.textContent = 'Start fehlgeschlagen: ' + e.message; }
  };
}
renderer.setAnimationLoop(loop);
setup();
if (new URLSearchParams(location.search).has('desk')) { Sound.init(); Desk.start(); }

// Für automatisierte Tests
window.__g = { AR, roomDump, renderer, scene, Game, Guenther, Level, Room, World, Rolls, Cushions, Robot, Input, Player, Desk, THREE, rollCell, rollValid, groundAt, buildLevel };
