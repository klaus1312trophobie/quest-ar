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
// Weiches Zimmerlicht von oben + Führungslicht schräg von vorn; der Glanz kommt aus der Umgebungs-Map (Grafik-Werkzeug).
// Bei Lava färbt Gfx.update die Unterseite orange: dann glüht alles von unten.
const hemi = new THREE.HemisphereLight(0xfff4e2, 0x6a5444, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
sun.position.set(0.8, 3, 1.6);
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
      this.master = this.ctx.createGain(); this.master.gain.value = new URLSearchParams(location.search).has('mute') ? 0 : 0.8; this.master.connect(this.ctx.destination);
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
  boing(p) { this.tone('sine', 140, 520, 0.28, 0.3, p); this.tone('triangle', 210, 90, 0.35, 0.12, p, 0.05); },
  bonk(p) { this.tone('square', 220, 70, 0.12, 0.2, p); this.noiseBurst(0.07, 0.25, 900, 300, p); },
  clack(p, v = 0.2) { this.noiseBurst(0.05, v, 2400, 700, p); this.tone('sine', 190, 80, 0.06, v, p); },
  crunch(p) { this.noiseBurst(0.16, 0.3, 500, 1800, p, 'bandpass', 0.8); },
  slap(p) { this.noiseBurst(0.09, 0.6, 3500, 600, p, 'bandpass', 0.6); [880, 660, 440].forEach((f, i) => this.tone('square', f, f * 0.9, 0.09, 0.07, p, 0.08 + i * 0.09)); },
  blow(p) { this.noiseBurst(0.5, 0.045, 700, 1100, p, 'bandpass', 0.7); },
  grab(p) { this.tone('triangle', 330, 520, 0.06, 0.12, p); },
  select() { this.tone('triangle', 620, 820, 0.05, 0.08); },
  hint() { this.tone('sine', 880, 880, 0.1, 0.1); this.tone('sine', 1175, 1175, 0.14, 0.1, null, 0.1); },
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
      // Melodie (Schunkel-Punk): jede zweite Runde, damit es nicht nervt
      const mel = this.melody[this.step % 32];
      if (mel && Math.floor(this.step / 32) % 2 === 1) Sound.tone('triangle', mel, mel, beat * 0.45, 0.16, null, delay, this.musicGain());
      this.next += beat; this.step++;
    }
  },
  musicGain() { return Sound.musicGain; },
  melody: [392, 0, 330, 392, 494, 0, 392, 0, 440, 0, 349, 440, 392, 330, 262, 0, 440, 0, 523, 440, 392, 0, 330, 0, 294, 349, 294, 247, 262, 0, 0, 0],
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
    if (f.life <= 0) { scene.remove(f.obj); f.obj.material?.dispose?.(); if (!f.obj.isSprite) f.obj.traverse((c) => c.geometry?.dispose()); Fx.splice(i, 1); continue; }
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

// ---------------------------------------------------------------- Grafik-Werkzeug (Umgebungslicht, Verschmelzen, Kontaktschatten)
// Umgebungs-Map für Glanz (Gold, Porzellan, Blech): ein Fantasie-Zimmer aus Leuchtflächen, einmal per PMREM vorgefiltert
(() => {
  const env = new THREE.Scene(), geo = new THREE.BoxGeometry(1, 1, 1);
  const box = (sx, sy, sz, x, y, z, color, k = 1, side = THREE.FrontSide) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side }));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); env.add(m);
  };
  box(10, 6, 10, 0, 0, 0, 0x4a4138, 1, THREE.BackSide);
  box(4, 0.1, 4, 0, 2.9, 0, 0xfff2dc, 7);            // Deckenlicht
  box(0.1, 2.4, 3.2, -4.9, 0.4, -0.5, 0xbfd8ff, 9);  // Fenster
  box(0.9, 0.9, 0.1, 3.2, 0.8, -4.9, 0xffb060, 12);  // Stehlampe
  box(3, 0.5, 0.1, 0.5, 1.8, 4.9, 0xfff0d8, 5);
  box(6, 0.1, 6, 0, -2.9, 0, 0x7a5a3c, 1);           // Teppich
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose(); } catch (e) { /* dann eben ohne Glanz */ }
  env.traverse((o) => o.material?.dispose()); geo.dispose();
})();
// Mehrere Geometrien zu einer verschmelzen (eine Zeichnung statt vieler). Teil = [geo, farbe, uvRechteck]
// farbe: Hex oder Funktion (pos, farbe) für Verläufe · uvRechteck [u0, v0, u1, v1] bildet die UVs des Teils in einen Atlas ab
const _mv = new V3(), _mc = new THREE.Color();
function mergeGeos(parts) {
  const pos = [], nor = [], uv = [], col = [];
  for (const [g0, color = 0xffffff, r] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (typeof color !== 'function') _mc.set(color);
    for (let i = 0; i < P.count; i++) {
      _mv.fromBufferAttribute(P, i); pos.push(_mv.x, _mv.y, _mv.z);
      if (typeof color === 'function') color(_mv, _mc);
      col.push(_mc.r, _mc.g, _mc.b);
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      const u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0;
      if (r) uv.push(r[0] + u * (r[2] - r[0]), r[1] + v * (r[3] - r[1])); else uv.push(u, v);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
// Kontaktschatten: weicher Fleck (rund oder eckig) knapp über der Fläche. In AR dunkelt Schwarz mit Alpha das Kamerabild ab.
const blobTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const blobBoxTex = canvasTex(64, 64, (g) => {
  g.shadowColor = '#fff'; g.shadowBlur = 9; g.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) { g.beginPath(); g.roundRect(14, 14, 36, 36, 5); g.fill(); }
});
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), _mc2 = new THREE.Color(0x8a6a2a);
const haloMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0xffc23a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const blobMats = new Map();
function blobMat(box, opacity, glow) {
  const key = (box ? 'b' : 'r') + Math.round(opacity * 10) + (glow ? 'g' : '');
  if (!blobMats.has(key)) blobMats.set(key, new THREE.MeshBasicMaterial({ map: box ? blobBoxTex : blobTex, color: glow ? 0xff6a1a : 0x000000, transparent: true, opacity, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
  return blobMats.get(key);
}
// w, d = Größe des Flecks in Metern (der weiche Rand ist schon drin); glow = Glutschein statt Schatten (auf Lava)
function blob(w, d, opacity = 0.5, box = false, glow = false) {
  const m = new THREE.Mesh(blobGeo, blobMat(box, opacity, glow)); m.scale.set(w, 1, d); m.position.y = 0.004; m.renderOrder = 3; return m;
}
// Testhaken: Bilder von Hand weiterschalten (ein Browser-Tab im Hintergrund bekommt keine Animation-Frames)
window.__gfx = { step(n = 1, ms = 1000 / 60) { for (let i = 0; i < n; i++) loop(lastT + ms); } };

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
// Möbel-Quader aus der Mesh-Erkennung: sagen, wie weit ein Möbel unter seiner Oberseite wirklich reicht
// (ein Hängeregal ist nur ein Brett, kein Klotz bis zum Boden). Lokale z-Achse des Quaders zeigt nach oben.
let boxT = 0;
function updateBoxes(frame, ref, dt) {
  boxT -= dt; if (boxT > 0 || !frame.detectedMeshes) return; boxT = 2;
  const boxes = [];
  frame.detectedMeshes.forEach((m) => {
    const v = m.vertices; if (!v || v.length !== 24) return;
    const pose = frame.getPose(m.meshSpace, ref); if (!pose) return;
    let zmin = 0; for (let i = 2; i < 24; i += 3) zmin = Math.min(zmin, v[i]);
    const q = pose.transform.position;
    boxes.push({ x: q.x, y: q.y, z: q.z, depth: -zmin });
  });
  const key = boxes.map((b) => [b.x, b.y, b.z, b.depth].map((n) => n.toFixed(2)).join()).sort().join('|');
  if (key !== Room.boxKey) { Room.boxKey = key; Room.boxes = boxes; Room.dirty = true; }
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
    // Unterkante: aus dem Möbel-Quader der Quest, sonst geraten (Tischplatten dünn, alles andere Klotz bis zum Boden)
    const box = (Room.boxes || []).find((b) => Math.abs(b.y - p.center.y) < 0.05 && Math.hypot(b.x - p.center.x, b.z - p.center.z) < 0.08);
    const floats = box && p.center.y - box.depth > fy + 0.1;
    const thin = floats || /table|desk/.test(p.label);
    const s = makeSolid('furn', poly, p.center.y, floats ? p.center.y - Math.max(box.depth, 0.03) : thin ? p.center.y - 0.05 : fy - 0.05, { label: p.label });
    World.solids.push(s);
    if (Room.fallback) {
      World.group.add(new THREE.Mesh(prismGeometry(poly, thin ? s.bottom : fy, s.top), fakeFurnMat));
      if (thin && !floats) for (const [x, z] of poly) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, s.bottom - fy, 0.04), fakeFurnMat); leg.position.set(x + Math.sign(p.center.x - x) * 0.05, fy + (s.bottom - fy) / 2, z + Math.sign(p.center.z - z) * 0.05); World.group.add(leg); }
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
      const c0 = renderer.xr.getCamera();
      this.depthInfo = { near: c0.near, far: String(c0.far), w: u.depthWidth.value, h: u.depthHeight.value };
      Err.crumb('depth mesh ' + JSON.stringify(this.depthInfo));
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
const std = (o) => new THREE.MeshStandardMaterial(o);
const SKIN = 0xeaa07c;
const MAT = {
  skin: std({ color: SKIN, roughness: 0.6 }),
  nose: std({ color: 0xe0585a, roughness: 0.35 }),
  shorts: std({ color: 0x5f6b3a, roughness: 0.85 }),
  sock: std({ color: 0xf4f4ee, roughness: 0.9 }),
  sandal: std({ color: 0x5a3a1a, roughness: 0.6 }),
  hair: std({ color: 0x3a2c22, roughness: 0.6 }),
  white: std({ color: 0xffffff, roughness: 0.25 }),
  black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  mouth: new THREE.MeshBasicMaterial({ color: 0x5a1a1a }),
  porcelain: std({ color: 0xffffff, roughness: 0.1, envMapIntensity: 1.2 }),
  gold: std({ color: 0xffc23a, metalness: 1, roughness: 0.17, emissive: 0x2a1700 }),
  water: std({ color: 0x58c8ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }),
  wood: std({ color: 0x9a6a3a, roughness: 0.7 }),
  woodDark: std({ color: 0x5a3a1e, roughness: 0.8 }),
  metal: std({ color: 0xb4bac4, metalness: 1, roughness: 0.3 }),
  bottle: std({ color: 0x6a3208, roughness: 0.1, transparent: true, opacity: 0.92 }),
  cap: std({ color: 0xe0b83a, metalness: 0.9, roughness: 0.3 }),
  crate: std({ color: 0x1f6a3a, roughness: 0.45 }),
  robot: std({ color: 0x2a2c33, roughness: 0.3 }),
  robotTop: std({ color: 0x4a4e5a, roughness: 0.18, metalness: 0.3 }),
  led: new THREE.MeshBasicMaterial({ color: 0x3fd2ff }),
  cushion: std({ color: 0xff4f8b, roughness: 0.3 }),
  paper: std({ color: 0xfbf8f0, roughness: 0.95 }),
  cardboard: std({ color: 0xb08a5a, roughness: 0.95 }),
};
const shirtTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
  for (let x = 0; x < 128; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  // Senffleck, Bierfleck
  g.fillStyle = 'rgba(200,150,30,0.55)'; g.beginPath(); g.ellipse(70, 74, 9, 6, 0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(140,90,30,0.35)'; g.beginPath(); g.ellipse(52, 92, 6, 8, -0.3, 0, Math.PI * 2); g.fill();
});
MAT.shirt = std({ map: shirtTex, roughness: 0.9 });
const paperTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
});
MAT.paper.map = paperTex;
// Atlas: oben die Seitenwand (v > 0.27), unten die Oberseite mit Fächern (v < 0.23)
const crateTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#1f6a3a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#103d21'; for (let x = 16; x < 256; x += 40) { g.beginPath(); g.roundRect(x, 18, 24, 56, 6); g.fill(); }
  g.fillStyle = '#ffd23f'; g.font = '900 54px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('PILS', 128, 148);
  g.fillStyle = '#ff2e88'; g.save(); g.translate(206, 122); g.rotate(-0.25); g.fillRect(-26, -12, 52, 24); g.fillStyle = '#111'; g.font = '900 15px system-ui,sans-serif'; g.fillText('BILLIG', 0, 6); g.restore();
  g.strokeStyle = '#0e3a1e'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 180);
  g.fillStyle = '#0c2a17'; g.fillRect(0, 197, 256, 59);
  g.strokeStyle = '#1f6a3a'; g.lineWidth = 5; g.strokeRect(3, 200, 250, 53);
  g.lineWidth = 2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(i * 51.2, 200); g.lineTo(i * 51.2, 253); g.stroke(); } for (let j = 1; j < 4; j++) { g.beginPath(); g.moveTo(3, 200 + j * 13.25); g.lineTo(253, 200 + j * 13.25); g.stroke(); }
});
MAT.crateSide = std({ map: crateTex, roughness: 0.45 });
// Dosenbier: oben das Etikett (v > 0.25), unten blankes Blech (v < 0.2)
const labelTex = canvasTex(128, 80, (g) => {
  g.fillStyle = '#ffd400'; g.fillRect(0, 0, 128, 62);
  g.fillStyle = '#111'; g.fillRect(0, 0, 128, 9); g.fillRect(0, 50, 128, 12);
  g.font = '900 34px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('BIER', 52, 42);
  g.fillStyle = '#e8102a'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 11 : 16; g.lineTo(106 + Math.cos(a) * r, 29 + Math.sin(a) * r); } g.fill();
  g.fillStyle = '#fff'; g.font = '900 12px system-ui,sans-serif'; g.fillText('0,29', 106, 33);
  g.fillStyle = '#ffd400'; g.font = '900 9px system-ui,sans-serif'; g.fillText('BILLIG · WARM · DOSE', 64, 59);
  g.fillStyle = '#ccd0d6'; g.fillRect(0, 62, 128, 18);
});
labelTex.wrapS = THREE.RepeatWrapping;
MAT.label = std({ map: labelTex, metalness: 0.75, roughness: 0.3 });

// Günther, der Assi-Punker: Schottenkaro (unten ein weißer Streifen als Farbfeld für einfarbige Teile, v < 0.18)
const tartanTex = canvasTex(64, 80, (g) => {
  g.fillStyle = '#c0182c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(8,26,18,0.6)'; for (const q of [5, 37]) { g.fillRect(q, 0, 13, 64); g.fillRect(0, q, 64, 13); }
  g.fillStyle = '#f2d21f'; for (const q of [26, 58]) { g.fillRect(q, 0, 2, 64); g.fillRect(0, q, 64, 2); }
  g.fillStyle = 'rgba(255,255,255,0.75)'; for (const q of [0, 32]) { g.fillRect(q, 0, 1, 64); g.fillRect(0, q, 64, 1); }
  g.fillStyle = '#fff'; g.fillRect(0, 64, 64, 16);
});
tartanTex.wrapS = THREE.RepeatWrapping;
// Nackter Oberkörper (Kugel-Abwicklung: Mitte = vorn, Rand = Rücken, oben = Hals)
const torsoTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#eaa07c'; g.fillRect(0, 0, 256, 256);
  let gr = g.createRadialGradient(128, 168, 4, 128, 168, 70); gr.addColorStop(0, 'rgba(255,190,160,0.7)'); gr.addColorStop(1, 'rgba(255,190,160,0)'); g.fillStyle = gr; g.fillRect(0, 90, 256, 166);
  gr = g.createLinearGradient(0, 185, 0, 256); gr.addColorStop(0, 'rgba(150,70,50,0)'); gr.addColorStop(1, 'rgba(150,70,50,0.45)'); g.fillStyle = gr; g.fillRect(0, 185, 256, 71);
  // Brusthaar, Nippel (einer gepierct), Nabel mit Glückspfad
  g.strokeStyle = 'rgba(60,35,25,0.75)'; g.lineWidth = 1.3;
  for (let i = 0; i < 70; i++) { const x = 128 + (Math.random() - 0.5) * 60, y = 62 + Math.random() * 42; g.beginPath(); g.arc(x, y, 2 + Math.random() * 2.5, Math.random() * 6, Math.random() * 6 + 3.5); g.stroke(); }
  for (let i = 0; i < 26; i++) { const y = 150 + i * 3, x = 128 + (Math.random() - 0.5) * (4 + i * 0.3); g.beginPath(); g.arc(x, y, 2, Math.random() * 6, Math.random() * 6 + 3); g.stroke(); }
  g.fillStyle = '#c4705e'; for (const x of [100, 156]) { g.beginPath(); g.arc(x, 92, 5, 0, 7); g.fill(); }
  g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.arc(156, 98, 5, 0, 7); g.stroke();
  g.fillStyle = '#8a4a3a'; g.beginPath(); g.ellipse(128, 166, 4, 5.5, 0, 0, 7); g.fill();
  // Tattoo: Herz mit Banderole
  g.fillStyle = '#b8203a'; g.beginPath(); g.moveTo(178, 150); g.bezierCurveTo(160, 132, 166, 122, 178, 132); g.bezierCurveTo(190, 122, 196, 132, 178, 150); g.fill();
  g.fillStyle = '#f2ead0'; g.fillRect(162, 134, 32, 9); g.fillStyle = '#223'; g.font = '900 8px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('MUTTI', 178, 141.5);
  // Maurerdekolleté hinten über dem Gürtel
  g.strokeStyle = 'rgba(110,50,40,0.9)'; g.lineWidth = 3; for (const x of [0, 256]) { g.beginPath(); g.moveTo(x, 176); g.lineTo(x, 215); g.stroke(); }
});
// Lederweste (alles Durchsichtige ist ausgeschnitten): Nieten, Flicken, Totenkopf auf dem Rücken. Oberste Zeilen = Stahl für die Schulterstacheln.
const vestTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#18181c'; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 0); g.lineTo(256, 164);
  for (let x = 256; x >= 0; x -= 8) g.lineTo(x, 160 + (x / 8 % 2) * 7 + Math.sin(x * 0.7) * 2);
  g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(112, 14); g.lineTo(144, 14); g.quadraticCurveTo(150, 90, 172, 175); g.lineTo(84, 175); g.quadraticCurveTo(106, 90, 112, 14); g.fill();
  for (const x of [64, 192]) { g.beginPath(); g.ellipse(x, 72, 17, 22, 0, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-atop';
  let gr = g.createLinearGradient(0, 0, 256, 0); for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // Steppnähte und Nieten an Revers, Armloch und Saum
  g.strokeStyle = 'rgba(190,190,200,0.55)'; g.lineWidth = 1; g.setLineDash([3, 3]);
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(128 + sx * 22, 18); g.quadraticCurveTo(128 + sx * 28, 90, 128 + sx * 50, 160); g.stroke(); g.beginPath(); g.ellipse(128 + sx * 64, 72, 21, 26, 0, 0, 7); g.stroke(); }
  g.setLineDash([]);
  const stud = (x, y, r = 2.6) => { g.fillStyle = '#9aa0ac'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); g.fill(); };
  for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) { const k = i / 8; stud(128 + sx * (27 + k * k * 27 + k * 4), 24 + k * 128); }
  for (let x = 6; x < 256; x += 14) if (x < 78 || x > 178) stud(x, 150, 2.2);
  // Flicken vorn: Bierkrug (links), Sicherheitsnadel (rechts)
  g.save(); g.translate(176, 112); g.rotate(0.12); g.fillStyle = '#7dff2e'; g.fillRect(-13, -13, 26, 26); g.fillStyle = '#ffb400'; g.fillRect(-7, -5, 11, 14); g.fillStyle = '#fff'; g.fillRect(-8, -9, 13, 5); g.strokeStyle = '#ffb400'; g.lineWidth = 2.5; g.beginPath(); g.arc(5, 2, 4, -1.5, 1.5); g.stroke(); g.restore();
  g.save(); g.translate(80, 104); g.rotate(-0.5); g.strokeStyle = '#e6eaf2'; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, -3); g.lineTo(12, -3); g.arc(12, 0, 3, -1.57, 1.57); g.lineTo(-10, 3); g.stroke(); g.fillStyle = '#e6eaf2'; g.fillRect(-17, -5, 6, 9); g.restore();
  g.save(); g.translate(84, 132); g.rotate(0.2); g.fillStyle = '#ff2e88'; g.fillRect(-12, -6, 24, 12); g.fillStyle = '#111'; g.font = '900 9px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('NÖ.', 0, 3.5); g.restore();
  // Rücken (über die Naht hinweg, deshalb zweimal): Totenkopf mit Iro, oben und unten Schriftbogen
  for (const ox of [0, 256]) {
    g.save(); g.translate(ox, 0); g.textAlign = 'center';
    g.fillStyle = '#f2f0e6'; g.font = '900 19px system-ui,sans-serif'; g.fillText('PUNK', 0, 52);
    g.fillStyle = '#7dff2e'; g.beginPath(); g.moveTo(-5, 72); g.lineTo(-8, 56); g.lineTo(-2, 64); g.lineTo(0, 54); g.lineTo(2, 64); g.lineTo(8, 56); g.lineTo(5, 72); g.fill();
    g.fillStyle = '#f2f0e6'; g.beginPath(); g.arc(0, 86, 17, 0, 7); g.fill(); g.fillRect(-10, 96, 20, 14);
    g.fillStyle = '#18181c'; g.beginPath(); g.ellipse(-7, 86, 5, 6, 0.2, 0, 7); g.ellipse(7, 86, 5, 6, -0.2, 0, 7); g.fill(); g.beginPath(); g.moveTo(0, 93); g.lineTo(-3, 99); g.lineTo(3, 99); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(i * 4 - 0.6, 103, 1.2, 7);
    g.fillStyle = '#ff2e88'; g.font = '900 15px system-ui,sans-serif'; g.fillText('PROST', 0, 130);
    g.restore();
  }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = '#d4dae4'; g.fillRect(0, 0, 256, 9);
});
// Kopf (Mitte = Gesicht): rasierte Seiten, Bartschatten, Säuferbacken, Tränensäcke, Pflaster
const headTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#eaa07c'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 128, d = Math.abs(x - 128);
    const scalp = y < 34 || (d > 62 && y < 80), beard = y > 72 && y < 112 && d < 66;
    if (scalp) { g.fillStyle = 'rgba(50,34,28,0.5)'; g.fillRect(x, y, 1.5, 1.5); } else if (beard) { g.fillStyle = 'rgba(70,62,70,0.42)'; g.fillRect(x, y, 1.3, 1.3); }
  }
  for (const sx of [-1, 1]) {
    let gr = g.createRadialGradient(128 + sx * 36, 72, 1, 128 + sx * 36, 72, 17); gr.addColorStop(0, 'rgba(235,70,80,0.6)'); gr.addColorStop(1, 'rgba(235,70,80,0)'); g.fillStyle = gr; g.fillRect(128 + sx * 36 - 18, 54, 36, 36);
    g.strokeStyle = 'rgba(120,70,110,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.arc(128 + sx * 19, 54, 9, 0.5, 2.64); g.stroke();
  }
  g.strokeStyle = 'rgba(150,80,60,0.6)'; g.lineWidth = 1.4; for (const y of [33, 38]) { g.beginPath(); g.moveTo(108, y); g.quadraticCurveTo(128, y - 2.5, 148, y); g.stroke(); }
  g.save(); g.translate(158, 40); g.rotate(-0.5); g.fillStyle = '#f0c8a0'; g.beginPath(); g.roundRect(-11, -4, 22, 8, 3); g.fill(); g.fillStyle = '#e0b088'; g.fillRect(-4, -4, 8, 8); g.restore();
});
MAT.gv = std({ vertexColors: true, roughness: 0.6 });        // einfarbige Körperteile über Eckenfarben
MAT.gvHead = std({ vertexColors: true, roughness: 0.5 });    // Kopfteile: laufen rot an, wenn's pressiert
MAT.tartan = std({ map: tartanTex, vertexColors: true, roughness: 0.8 });
MAT.torso = std({ map: torsoTex, roughness: 0.6 });
MAT.vest = std({ map: vestTex, roughness: 0.4, alphaTest: 0.5 });
MAT.head = std({ map: headTex, roughness: 0.5 });
MAT.mohawk = std({ vertexColors: true, roughness: 0.55, emissive: 0x2c9a10, emissiveIntensity: 0.6 });
MAT.face = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

// ---------------------------------------------------------------- Günther (Modell)
// Assi-Klischee-Punker: grüner Iro, Lederweste über nacktem Bierbauch, Schottenkaro, dicke Stiefel. Maße in Modell-Einheiten (root × 1.12).
function buildGuenther() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const S = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
  const W = [0.5, 0.08, 0.5, 0.08], BLK = 0x17171b, STEEL = 0xd4dae4, PINK = 0xff2e88;
  // Kugel zur Birne verformen: unten breiter, Wampe nach vorn (Mitte der Textur = vorn, Naht hinten)
  const pear = (ws, hs, rx, ry, rz, belly) => {
    const g = new THREE.SphereGeometry(1, ws, hs).rotateY(-Math.PI / 2), P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), low = clamp(0.25 - y, 0, 1);
      P.setXYZ(i, x * (1 + low * 0.16) * rx, y * ry, z * (z > 0 ? 1 + belly * Math.exp(-((y + 0.3) ** 2) * 3.5) : 0.9 + low * 0.1) * rz);
    }
    g.computeVertexNormals();
    for (let iy = 0; iy <= hs; iy++) { const a = iy * (ws + 1), b = a + ws; _mv.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize(); N.setXYZ(a, _mv.x, _mv.y, _mv.z); N.setXYZ(b, _mv.x, _mv.y, _mv.z); }
    return g;
  };
  // Beine: Karohose, Stiefel mit gelber Naht und pinken Schnürsenkeln
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.013, 0.04, 0); body.add(pivot);
    const parts = [
      [new THREE.CylinderGeometry(0.0098, 0.0088, 0.022, 10).translate(0, -0.011, 0), 0xffffff, [0, 0.25, 2, 0.95]],
      [new THREE.CylinderGeometry(0.0108, 0.0114, 0.011, 10).translate(0, -0.0255, 0), BLK, W],
      [S(1, 10, 8).scale(0.0124, 0.0078, 0.0188).translate(0, -0.031, 0.0055), BLK, W],
      [new THREE.BoxGeometry(0.0231, 0.0012, 0.0371).translate(0, -0.0368, 0.0045), 0xf2d21f, W],
      [new THREE.BoxGeometry(0.0225, 0.0045, 0.0365).translate(0, -0.03775, 0.0045), 0x2a2420, W],
    ];
    for (let i = 0; i < 3; i++) parts.push([new THREE.BoxGeometry(0.013, 0.0017, 0.003).translate(0, -0.0222 - i * 0.0034, 0.0108 + i * 0.0016), PINK, W]);
    pivot.add(new THREE.Mesh(mergeGeos(parts), MAT.tartan));
    legs.push(pivot);
  }
  // Hüfte: Karohose, Nietengürtel, Kette
  const hip = [
    [S(1, 16, 8).scale(0.0285, 0.0135, 0.0262).translate(0, 0.0445, 0), 0xffffff, [0, 0.25, 4, 0.95]],
    [new THREE.TorusGeometry(0.0274, 0.0028, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.93).translate(0, 0.0525, 0), BLK, W],
    [new THREE.BoxGeometry(0.009, 0.007, 0.003).translate(0, 0.0525, 0.0265), STEEL, W],
    [new THREE.TorusGeometry(0.012, 0.0015, 5, 12, Math.PI).rotateZ(Math.PI).scale(1, 1.3, 1).rotateY(Math.PI / 2).translate(-0.0298, 0.0515, 0.002), STEEL, W],
  ];
  for (let i = 0; i < 12; i++) hip.push([new THREE.ConeGeometry(0.002, 0.0034, 4).rotateX(Math.PI / 2).translate(0, 0.0525, 0.0296).rotateY((i + 0.5) / 12 * Math.PI * 2).scale(1, 1, 0.93), STEEL, W]);
  body.add(new THREE.Mesh(mergeGeos(hip), MAT.tartan));
  // Wampe (wackelt): nackter Oberkörper + offene Lederweste mit Schulterstacheln
  const belly = new THREE.Group(); belly.position.y = 0.074; body.add(belly);
  belly.add(new THREE.Mesh(pear(24, 14, 0.0335, 0.03, 0.0285, 0.45), MAT.torso));
  const vest = [[pear(24, 14, 0.0358, 0.0315, 0.0305, 0.2)]];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = 0.016 + i * 0.0065, y = 0.0315 * Math.sqrt(1 - (x / 0.0358) ** 2);
    vest.push([new THREE.ConeGeometry(0.0028, 0.009, 5).translate(0, 0.0038, 0).rotateZ(-sx * (0.3 + i * 0.28)).translate(sx * x, y, -0.001), 0xffffff, [0.5, 0.985, 0.5, 0.985]]);
  }
  belly.add(new THREE.Mesh(mergeGeos(vest), MAT.vest));
  // Arme mit Ellbogen, Nietenarmband
  const upperGeo = mergeGeos([[S(0.0078, 10, 8), SKIN], [new THREE.CapsuleGeometry(0.0062, 0.012, 3, 8).translate(0, -0.011, 0), SKIN]]);
  const fp = [[new THREE.CapsuleGeometry(0.0058, 0.01, 3, 8).translate(0, -0.008, 0), SKIN], [new THREE.CylinderGeometry(0.0075, 0.0075, 0.0065, 10).translate(0, -0.0145, 0), BLK], [S(0.0082, 10, 8).translate(0, -0.0235, 0), SKIN]];
  for (let i = 0; i < 6; i++) fp.push([new THREE.ConeGeometry(0.0017, 0.003, 4).rotateX(Math.PI / 2).translate(0, -0.0145, 0.0084).rotateY(i * Math.PI / 3), STEEL]);
  const foreGeo = mergeGeos(fp);
  const arms = [], fore = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.0345, 0.093, 0); body.add(pivot);
    pivot.add(new THREE.Mesh(upperGeo, MAT.gv));
    const el = new THREE.Group(); el.position.y = -0.021; pivot.add(el); el.add(new THREE.Mesh(foreGeo, MAT.gv));
    pivot.rotation.z = sx * 0.22;
    arms.push(pivot); fore.push(el);
  }
  // Kopf
  const head = new THREE.Group(); head.position.y = 0.112; head.rotation.order = 'YXZ'; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 14).rotateY(-Math.PI / 2).scale(1.04, 0.97, 1), MAT.head));
  const acc = [
    [S(0.0078, 12, 10).translate(0, -0.002, 0.0258), 0xe2504a],                                   // Säufernase
    [new THREE.TorusGeometry(0.0027, 0.0008, 5, 10).translate(0.0048, -0.0078, 0.0292), STEEL],   // Nasenring
    [new THREE.CapsuleGeometry(0.0008, 0.009, 2, 5).rotateZ(0.25).translate(0.0292, -0.0075, 0.001), STEEL],  // Sicherheitsnadel im Ohr
    [S(0.0016, 6, 5).translate(0.0303, -0.012, 0.001), STEEL],
    [new THREE.TorusGeometry(0.0026, 0.0008, 5, 10).rotateY(Math.PI / 2).translate(-0.0288, -0.0055, 0.001), 0xffd23f],
    [new THREE.TorusGeometry(0.0022, 0.0008, 5, 10).rotateY(Math.PI / 2).translate(-0.029, 0.0035, -0.002), STEEL],
    [S(0.0013, 6, 5).translate(-0.0172, 0.0185, 0.0185), STEEL], [S(0.0013, 6, 5).translate(-0.0185, 0.0152, 0.018), STEEL],  // Augenbrauen-Piercing
  ];
  for (const sx of [-1, 1]) {
    acc.push([S(1, 8, 6).scale(0.004, 0.0078, 0.0062).translate(sx * 0.0268, 0.001, -0.001), SKIN]);
    acc.push([S(0.0072, 12, 10).translate(sx * 0.0105, 0.0065, 0.0205), 0xffffff]);
  }
  head.add(new THREE.Mesh(mergeGeos(acc), MAT.gvHead));
  // Iro: Stachelkamm von der Stirn bis in den Nacken, wippt nach
  const spikes = [], lo = new THREE.Color(0x1f9a12), hi = new THREE.Color(0xc8ff3a);
  for (let i = 0; i < 7; i++) {
    const a = 0.95 - i * 0.37, h = 0.026 + 0.016 * Math.sin((i + 0.6) / 7 * Math.PI);
    spikes.push([new THREE.ConeGeometry(0.0078, h, 6).translate(0, h / 2, 0).scale(0.8, 1, 1).rotateX(a).translate(0, Math.cos(a) * 0.0225, Math.sin(a) * 0.0235), (q, c) => c.copy(lo).lerp(hi, clamp((q.length() - 0.026) / 0.03, 0, 1))]);
  }
  const mohawk = new THREE.Mesh(mergeGeos(spikes), MAT.mohawk); head.add(mohawk);
  // Augen: Pupille dreht sich auf dem Augapfel, Lid klappt von oben zu
  const pupilGeo = mergeGeos([[S(0.0037, 10, 8).scale(1, 1, 0.45).translate(0, 0, 0.0058), 0x111111], [S(0.0011, 6, 5).translate(0.0013, 0.0015, 0.0074), 0xffffff]]);
  const lidGeo = mergeGeos([[new THREE.SphereGeometry(0.0079, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd28a70]]);
  const browGeo = mergeGeos([[new THREE.BoxGeometry(0.0135, 0.004, 0.004), BLK]]);
  const eyes = [], brows = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(sx * 0.0105, 0.0065, 0.0205); head.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, MAT.face); eye.add(pupil);
    const lid = new THREE.Mesh(lidGeo, MAT.gvHead); lid.rotation.x = 0.25; eye.add(lid);
    eye.userData = { pupil, lid }; eyes.push(eye);
    const brow = new THREE.Mesh(browGeo, MAT.gv); brow.position.set(sx * 0.0108, 0.0172, 0.0222); brow.rotation.y = sx * 0.3; head.add(brow); brows.push(brow);
  }
  // Mund: kleiner Streifen, dessen Ecken je nach Laune neu gesetzt werden (breit, offen, Mundwinkel, Zähne mit Lücke)
  const mg = new THREE.BufferGeometry(), mp = new Float32Array(26 * 3), mcol = new Float32Array(26 * 3), idx = [];
  for (let i = 0; i < 26; i++) { _mc.set(i < 18 ? 0x4a0f14 : 0xf6f0dc); mcol.set([_mc.r, _mc.g, _mc.b], i * 3); }
  for (let i = 0; i < 8; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  for (const o of [18, 22]) idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.BufferAttribute(mcol, 3)); mg.setIndex(idx);
  const mouth = new THREE.Mesh(mg, MAT.face); mouth.position.set(0, -0.0135, 0.0232); mouth.frustumCulled = false; head.add(mouth);
  mouth.userData.set = (w, o, c, teeth) => {
    const P = mg.attributes.position, yc = (q) => c * (q * q - 0.4) * w * 0.9, hh = (q) => Math.max(0.0007, o * (1 - q * q * 0.8));
    for (let i = 0; i < 9; i++) { const q = i / 4 - 1, x = q * w, z = -x * x * 22; P.setXYZ(i * 2, x, yc(q) + hh(q), z); P.setXYZ(i * 2 + 1, x, yc(q) - hh(q), z); }
    [[-0.6, -0.12], [0.06, 0.6]].forEach(([q0, q1], k) => [q0, q1].forEach((q, j) => {
      const x = q * w, top = yc(q) + hh(q) * 0.95, th = teeth * Math.min(hh(q) * 1.1, 0.0019), z = -x * x * 22 + 0.0003;
      P.setXYZ(18 + k * 4 + j * 2, x, top, z); P.setXYZ(19 + k * 4 + j * 2, x, top - th, z);
    }));
    P.needsUpdate = true;
  };
  mouth.userData.set(0.006, 0.0007, 0.25, 0);
  root.scale.setScalar(1.12);
  return { root, body, legs, arms, head, eyes, mouth, fore, belly, mohawk, brows };
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
  start: ['Ey Riese! Haste mal ’n Klo? Is dringend!', 'Punk’s not dead. Aber meine Blase gleich.', 'Sechs Dosen auf’m Bahnhofsvorplatz. Jetzt rächt sich das.', 'Schicke Bude, Spießer. Wo is der Pott?',
    'Wer stellt sein Klo da oben hin? Das System, Alter. Das System.', 'Los, Taucherbrille! Bau mir was, ich hab Druck auf der Leitung!', 'Ich penn ab heute hier. Aber erst: pissen.', 'Draußen gegen die Wand darf ich nich mehr. Gibt sonst wieder Anzeige.'],
  jump: ['Pogo!', 'Hepp!', 'Uff, meine Stiefel.', 'Hoch die Tassen!', 'Sportlich für ’n Langzeitarbeitslosen, wa?', 'Ich spring sonst nur für Freibier.'],
  lava: ['AUA! MEINE EIER!', 'Meine Stiefel! Die hab ich erst seit ’97!', 'Heiß wie Ratten-Kalles Chili!', 'Ich riech wie ’ne Bratwurst vom Bahnhof.', 'Scheiß Fußbodenheizung, du Bonze!', 'Der Iro brennt! DER IRO BRENNT!', 'Wer heizt denn so? Hast du im Lotto gewonnen?'],
  fall: ['Aua. Mein Steiß.', 'War Absicht. Stagediving.', 'Scheiß Schwerkraft. Auch so ’n Spießer-Gesetz.', 'Bin schon härter gefallen. Aus Kneipen.', 'Pogo ohne Publikum is kacke.', 'Nix passiert. War eh schon alles kaputt.'],
  dieAgain: ['Schon wieder verreckt. Läuft bei mir. Am Bein runter.', 'Ich sterb hier öfter als beim Konzert vorne links.', 'Mach so weiter, dann piss ich dir aus Protest in die Hausschuhe.', 'Mein Köter stellt sich schlauer an als du.',
    'Bist du bei den Bullen oder warum quälst du mich?', 'Früher war mehr Punk. Und weniger Sterben.'],
  beer: ['Dosenbier! Prost, ihr Säcke!', 'Lauwarm. Wie ich’s mag.', 'Die Dose geb ich nachher ab. Pfand is Pfand.', 'Genau das, was meine Blase jetzt braucht. Nich.', 'Auf dich, Spießer! Zahlst ja eh du.', 'Frühstück!',
    'Achtes Bier. Oder neuntes. Mathe war nie meins.', 'Hopfen is Gemüse. Ich leb gesund.'],
  idle: ['Ey Taucherbrille! Glotz nich, bau!', 'Haste mal ’n Euro? Nee? Dann wenigstens ’ne Treppe!', 'Ich steh hier nich zum Schnorren. Ich steh hier zum Pissen.', 'Ich zähl bis drei, dann kriegt deine Zimmerpflanze Dünger.',
    'Hallo? Klopapier? Irgendwas? Du Lauch!', 'Auf der Wache bei den Bullen ging’s schneller.', 'Ich könnt längst am Bahnhof stehen. Da hat’s wenigstens ’ne Hecke.', 'Is das hier ’ne Behörde? Ich wart schon wieder!'],
  high: ['Ich klemm schon die Stiefel zusammen!', 'Gleich läuft’s in die Stiefel. Die sind eh undicht.', 'Das is kein Bier an meinem Bein.', 'Druck wie im Bierfass, Alter!', 'Nich lachen. NICH LACHEN.', 'Ich seh schon gelb!', 'Meine Blase macht Pogo!'],
  close: ['Nich so nah, Riese. Du riechst nach Weichspüler.', 'Abstand, Taucherbrille! Ich hab Flöhe. Glaub ich.', 'Was glotzt du? Noch nie ’n Iro gesehen?', 'Ey, dein Atem. Hast du etwa Zähne geputzt? Spießer.'],
  roll: ['Klopapier als Treppe. Endlich mal sinnvoll.', 'Dreilagig! Du Bonze!', 'Schwebt. Frag nich. Is Anarchie.', 'Mehr davon! Ich bin doch keine Bergziege!', 'Zwei Rollen nehm ich nachher mit. Für die WG.'],
  cushion: ['PFRRRT. Das war ich nich. Diesmal.', 'Riecht wie Ratten-Kalle nach ’m Döner.', 'Raketenantrieb auf Biogas!', 'Hui, mein Arsch fliegt!', 'So klingt mein Wecker.'],
  dildo: ['Alter. Was liegt denn bei DIR so rum?', 'Spießer nach außen, Sau nach innen. Respekt.', 'Der wackelt wie ich nach zwölf Bier.', 'Is der gewaschen?! Ach, egal.', 'So einen hat Pogo-Peter am Rückspiegel hängen.', 'Größer als mein Selbstwertgefühl.'],
  dildoJump: ['BOIIING! Sag das keinem!', 'Vom Dödel in die Luft geschossen. Kommt in den Lebenslauf.', 'Weitsprung mit Gummi-Kalle!', 'Das erzähl ich nich mal Ratten-Kalle.', 'Ich fliiieg! Auf ’nem Pimmel! Punk!'],
  peg: ['Ich steh auf ’nem Dödel an der Wand. Karriere.', 'Wackelt, aber hält. Mehr als meine letzte Beziehung.', 'Saugnapf hält. Deutsche Wertarbeit.'],
  pizza: ['Pizzakarton! Is da noch Rand drin?', 'Fettig, labbrig, trägt nix. Wie ich.', 'Auf so ’nem Karton hab ich schon gepennt.', 'Riecht nach Salami und schlechten Entscheidungen.'],
  pizzaBreak: ['MATSCH! Scheiß Pappe!', 'Durchgeweicht. Wie meine Socken.', 'War eh keine Salami mehr drin.'],
  brush: ['Klobürste. Benutzt. Riech ich bis hier.', 'Balancieren auf ’m Scheißhausbesen. Zirkus Punk.', 'Die Borsten sehen aus wie mein Iro nach ’m Regen.', 'Wer hat die zuletzt angefasst? Nee, sag’s nich.'],
  dryer: ['Föhn! Für ’n Iro! Endlich denkt mal einer mit.', 'Heiße Luft. Kenn ich vom Amt.', 'Ich schweeebe! Wie damals auf ’m Festival.', 'Unten rum wird’s warm. Nich unangenehm.'],
  bonk: ['AUA! Schmeiß nich mit Zeug, du Bulle!', 'Ey! Mein Iro!', 'Körperverletzung! Ich kenn meine Rechte! Glaub ich.', 'Wirf noch mal und ich kack dir in den Schuh.', 'Zielen kannste. Schade drum.'],
  burn: ['Geil, Lagerfeuer!', 'Verkohlt. Kriegste aber wieder, is ja Pfand drauf.', 'Brennt besser als die Mülltonne am Bahnhof.'],
  beerDown: ['Runtergeholt! Äh. Das Bier, mein ich.', 'Guter Wurf. Für ’n Spießer.'],
  empty: ['Alle. Wie mein Bier am Monatsende.', 'Nix mehr da. Willkommen in meinem Leben.', 'Leer. Musste schnorren gehen.'],
  robot: ['Der Staubsauger-Bulle will mir an die Wäsche!', 'Verpiss dich, du Scheiß-Teller!', 'Nich einsaugen! Ich bin kein Krümel, ich bin Punk!', 'Sogar dein Staubsauger is ’n Spießer!', 'Der räumt hier auf! WIDERLICH!'],
  stun: ['Jawoll! Auf die Zwölf, Blechbulle!', 'Der hat fertig. Wie ich jeden Sonntag.', 'Hau ihm noch eine! Für die Anarchie!', 'Ordnungsamt außer Betrieb. Geil.'],
  ride: ['Taxi! Zum Klo! Zahlen tut der Riese.', 'Schwarzfahren auf ’m Staubsauger. Mein Lebenswerk.', 'Ich reit den Bullen-Sauger! Guck, Mama!'],
  stuck: ['Da komm ich nich hoch, du Genie.', 'Ey, ich bin Punk, kein Parkour-Typ!', 'Geht nich. Bau was hin oder trag mich.'],
  pfand: ['Fuffzig Cent fürs Klo?! Halsabschneider! Erst Dosen sammeln!', 'Ohne Pfand kein Pinkeln. Scheiß System.', 'Bezahlklo. Bei DIR zu Hause. Du bist so ’n Spießer.'],
  hint: ['Guck halt mal, was du in der Hand hast, Riese!', 'Tipp vom Fachmann: Mach irgendwas. Schnell.', 'Ich würd ja helfen. Aber ich bin fünfzehn Zentimeter.'],
  restart: ['Nochmal von vorn? Mein Leben in einem Satz.', 'Alles auf Anfang. Wie nach jeder Ausnüchterung.'],
  win: ['Aaaaah. Besser als Freibier.', 'Nich gucken, du Spanner!', 'Läuft. Wortwörtlich.', 'Oh ja. OH JA. Punk’s not dead!', 'Goldenes Klo. Du Bonze. Ich piss trotzdem rein.', 'Und jetzt? Haste noch Bier?', 'Im Stehen. Aus Prinzip.', 'Spülen is was für Spießer.'],
  fail: ['Zu spät. Jetzt is warm im Stiefel.', 'Ich sag einfach, es war Bier.', 'Dein Teppich, dein Problem, Spießer.', 'Danke für nix, du Lauch.', 'Egal. Hose trocknet am Körper.', 'Passiert den Besten. Und mir.'],
  furn: {
    table: ['Dein Tisch klebt. Sympathisch.', 'Tisch. Hier frühstückt der Spießer sein Müsli.'],
    desk: ['Schreibtisch. Igitt. Arbeit.', 'Hier wird also „Homeoffice“ gemacht. In Unterhose, wetten?'],
    couch: ['Geiles Sofa. Hier penn ich ab heute.', 'Auf dem Sofa is mehr los als in meinem Liebesleben. Also: nix.'],
    bed: ['Dein Bett hat Dinge gesehen. Ich seh die Flecken.', 'Bett! Mit Bezug! Dekadent.'],
    shelf: ['Regal voller Bücher. Angeber.', 'Staub und Lebensentscheidungen. Schönes Regal.'],
    storage: ['Im Schrank is bestimmt Schnaps.', 'Was versteckste im Schrank? Deine Punk-Phase?'],
    screen: ['Riesen-Glotze. Hier guckt einer heimlich Schmuddelfilme.', 'Fernseher größer als meine alte Wohnung.'],
    plant: ['Die Pflanze hat Durst. Ich hätt da was.', 'Grünzeug. Kann man das rauchen?'],
    other: ['Was is das denn? Kunst? Spießerkram.'],
  },
  nofurn: ['Kein einziges Möbel? Wohnst du im Abbruchhaus? Respekt.'],
  noroom: ['Kein Zimmer gefunden. Ich steh im Nix. Wie nach ’m Festival.'],
};
// Sprüche aus dem Beutel ziehen: erst wenn alle einer Sorte dran waren, wird neu gemischt
const lineBag = new Map();
let lastSaid = '';
function line(cat) {
  const arr = LINES[cat]; if (!Array.isArray(arr) || !arr.length) return '';
  let bag = lineBag.get(cat);
  if (!bag || !bag.length) { bag = arr.slice().sort(() => Math.random() - 0.5); lineBag.set(cat, bag); }
  let s = bag.pop(); if (s === lastSaid && bag.length) { const t = bag.pop(); bag.push(s); s = t; }
  lastSaid = s; return s;
}

// ---------------------------------------------------------------- Günther (Steuerung & Physik)
const GRAV = 3.6, JUMP_V = Math.sqrt(2 * GRAV * 0.21), SPEED = 0.42, CUSHION_V = Math.sqrt(2 * GRAV * 0.95);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, map: glowTex });
const Guenther = {
  m: buildGuenther(),
  pos: new V3(), vel: new V3(), yaw: 0, onGround: false, ground: null, airT: 0,
  phase: 0, walkAmt: 0, squash: 1, squashV: 0, blinkT: 2, dead: 0, deadKind: '', sayCd: 0, idleT: 0, check: new V3(), checkT: 0,
  target: null, frozen: false, visible: false, prevGroundSrc: null, rideT: 0,
  safeT: 0, boostT: 0, stuckT: 0, deaths: 0, seenFurn: new Set(), ground0: null, inDraft: false,
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
    this.safeT = 2; this.boostT = 0; this.stuckT = 0;
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
    // Jeder dritte Tod: er beschwert sich über den Spieler statt über die Todesart
    const again = ++this.deaths % 3 === 0;
    if (kind === 'lava') { Sound.sizzle(this.pos); this.say(again ? 'dieAgain' : 'lava', true); for (let i = 0; i < 25; i++) Smoke.emit(this.pos.clone().add(new V3(rand(-0.03, 0.03), 0.02, rand(-0.03, 0.03))), new V3(rand(-0.05, 0.05), rand(0.15, 0.35), rand(-0.05, 0.05)), 0x333333, 0.02, rand(0.8, 1.5), -0.05, 0.03, 0.5); Glow.burst(this.pos, 0xff7a1a, 20, 0.5, 0.01, 0.5, 0.8, 0.6); }
    else if (kind === 'robot') { Sound.suck(this.pos); this.say(again ? 'dieAgain' : 'robot', true); }
    else { Sound.land(this.pos); this.say(again ? 'dieAgain' : 'fall', true); }
  },
  respawn() {
    this.dead = 0; this.vel.set(0, 0, 0);
    const g = groundAt(this.check.x, this.check.z, this.check.y + 0.02);
    const ok = g.src && !(g.src === 'floor' && Level.lava) && g.src.kind !== 'robot' && Math.abs(g.y - this.check.y) < 0.03;
    this.pos.copy(ok ? this.check : Level.spawn);
    // Fairer Wiedereinstieg: kurz unverwundbar, nichts blockiert den Platz, der Sauger lauert nicht
    this.safeT = 2; this.boostT = 0;
    for (const r of [...Rolls.list]) if (Math.abs(r.pos.x - this.pos.x) < CELL / 2 + GR && Math.abs(r.pos.z - this.pos.z) < CELL / 2 + GR && r.pos.y < this.pos.y + GH && r.pos.y + CELL > this.pos.y + 0.004) { Rolls.remove(r); Level.rolls++; }
    if (Robot.obj && this.pos.y < Room.floorY + 0.1 && Math.hypot(Robot.pos.x - this.pos.x, Robot.pos.z - this.pos.z) < 0.5) Robot.stun(2.5, true);
    this.m.root.scale.setScalar(1.12); this.m.body.rotation.set(0, 0, 0);
    Glow.burst(this.pos.clone().add(new V3(0, 0.06, 0)), 0xffd23f, 24, 0.35, 0.012, 0.5); Sound.poof(this.pos);
    this.squash = 0.5;
  },
  update(dt) {
    if (!this.visible) return;
    this.sayCd -= dt; this.safeT -= dt;
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
    let k = 1 - Math.exp(-dt * (this.onGround ? 14 : 4));
    // Weitsprung vom Dildo: in der Luft kaum bremsen
    if (this.boostT > 0) { this.boostT -= dt; if (this.onGround) this.boostT = 0; else k *= 0.12; }
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
    // Föhn: Aufwind trägt ihn bis auf Schwebehöhe (Feder gegen die Schwerkraft)
    const dry = Items.updraft(this.pos);
    if (dry) {
      this.vel.y += (GRAV + clamp((dry.pos.y + DRYER_LIFT - this.pos.y) * 16, -3, 5) - this.vel.y * 5) * dt;
      if (!this.inDraft) { this.inDraft = true; this.say('dryer'); }
    } else this.inDraft = false;
    this.vel.y -= GRAV * dt;
    // Saugroboter-Taxi
    if (this.onGround && this.ground?.kind === 'robot') { this.pos.x += Robot.vel.x * dt; this.pos.z += Robot.vel.z * dt; this.rideT += dt; if (this.rideT > 1.5 && this.rideT < 1.6) this.say('ride'); }
    else this.rideT = 0;
    const prevY = this.pos.y;
    const before = this.pos.clone();
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Saugroboter erwischt ihn am Boden
    if (Robot.obj && Robot.stunT <= 0 && this.safeT <= 0 && this.pos.y < Room.floorY + 0.03 && Math.hypot(this.pos.x - Robot.pos.x, this.pos.z - Robot.pos.z) < Robot.R + GR * 0.6) { this.die('robot'); return; }
    const hit = pushOut(this.pos, GR, this.pos.y, this.pos.y + GH);
    // Automatisch hüpfen, wenn er beim Hinlaufen an einer Stufe hängt
    if (hit && this.target && this.onGround && before.distanceTo(this.pos) < SPEED * dt * 0.4) this.doJump(JUMP_V);
    // Kommt er beim Hinlaufen gar nicht voran, gibt er auf statt ewig gegen die Wand zu rennen
    if (this.target) { this.stuckT = before.distanceTo(this.pos) < SPEED * dt * 0.3 ? this.stuckT + dt : Math.max(0, this.stuckT - dt * 0.5); if (this.stuckT > 1.8) { this.target = null; this.stuckT = 0; this.say('stuck'); } } else this.stuckT = 0;
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
      // Saugnapf-Dildo: flacher Weitsprung in Blickrichtung
      const dd = Items.bumper(this.pos);
      if (dd) { Items.bounce(dd); this.doJump(DILDO_V, true); this.boostT = 1.5; this.vel.x = Math.sin(this.yaw) * SPEED * DILDO_BOOST; this.vel.z = Math.cos(this.yaw) * SPEED * DILDO_BOOST; }
      // Betritt er ein Teil (Pizzakarton, Bürste, Wand-Dödel) oder ein Möbel zum ersten Mal?
      if (g.src !== this.ground0) {
        if (g.src?.item) Items.stepOn(g.src.item);
        if (g.src?.kind === 'furn' && !this.seenFurn.has(g.src) && LINES.furn[g.src.label]) { this.seenFurn.add(g.src); this.say('', false, pick(LINES.furn[g.src.label])); }
      }
      this.ground0 = g.src;
      // Sicherer Platz für den Checkpoint
      if (g.src !== 'floor' || !Level.lava) {
        if (g.src?.kind !== 'robot') { this.checkT += dt; if (this.checkT > 0.4) this.check.copy(this.pos); }
      }
    } else { this.checkT = 0; this.ground0 = null; }
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
    if (want < 0.1 && this.onGround) { this.idleT += dt; if (this.idleT > 9) { this.idleT = 0; this.say(Game.bladder > 0.7 ? 'high' : Player.head.distanceTo(this.pos) < 0.55 ? 'close' : 'idle'); } } else this.idleT = 0;
    this.applyVisual(dt, false);
  },
  // Was auf die Rübe gekriegt (geworfenes Teil): er meckert, stirbt aber nicht
  bonk() { this.squash = 0.6; Sound.bonk(this.pos); this.say('bonk', true); Hands.buzzAll(0.5, 80); },
  doJump(v, cushion = false) {
    this.vel.y = v; this.onGround = false; this.squash = 1.3; this.airT = 0.01;
    if (!cushion) { Sound.jump(this.pos); if (Math.random() < 0.12) this.say('jump'); }
  },
  applyVisual(dt, dead) {
    const m = this.m;
    const v = this.v || (this.v = { t: rand(0, 9), p: new Float32Array(14), hy: 0, hp: 0, lid: 0.25, brow: 0.15, mw: 0.006, mo: 0.0007, mc: 0.25, te: 0, red: 0, jig: 0, jigV: 0, mx: 0, mxV: 0, mz: 0, mzV: 0, yaw: 0, fid: '', fidT: 3, fidK: 0, gr: true, step: 0 });
    v.t += dt; const t = v.t;
    m.root.position.copy(this.pos);
    if (!dead) m.root.rotation.y = this.yaw;
    // Squash & Stretch als Feder
    this.squashV += ((1 - this.squash) * 180 - this.squashV * 14) * dt; this.squash += this.squashV * dt;
    if (!this.onGround && !dead) this.squash += (1.08 - this.squash) * Math.min(1, dt * 6);
    m.body.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash));
    const w = this.walkAmt, s = Math.sin(this.phase), st = Game.state;
    const urg = st === 'play' ? clamp((Game.bladder - 0.55) / 0.35, 0, 1) : 0;
    const air = !this.onGround && !dead && !this.frozen, riding = this.onGround && this.ground?.kind === 'robot';
    // Zielpose. Beine: x = vor/zurück, lz = Knie zusammen · Arme: x < 0 = nach vorn, az = abspreizen, e = Ellbogen · Körper: bx = vorbeugen, bz = kippen
    let lx0 = 0, lx1 = 0, lz = 0, ax0 = 0, ax1 = 0, az0 = 0.2, az1 = 0.2, e0 = 0.25, e1 = 0.25, bx = 0, bz = 0, hop = 0, hx = 0, look = 1, yaw = 0, spin = false;
    // Gesicht: lid (0.25 = Schlafzimmerblick, < 0 = aufgerissen, 1.4 = zu), brow > 0 = sorgenvoll, mw/mo = Mund breit/offen, mc = Mundwinkel, te = Zähne
    let lid = 0.25, brow = 0.15, mw = 0.006, mo = 0.0007, mc = 0.3, te = 0, red = urg * 0.8;
    const scream = () => { lid = -0.6; brow = 0.5; mw = 0.006; mo = 0.0055; mc = -0.2; te = 1; };
    if (dead) {
      scream(); look = 0; hx = -0.35;
      az0 = 2.3 + Math.sin(t * 30) * 0.45; az1 = 2.3 - Math.sin(t * 30) * 0.45; lx0 = Math.sin(t * 24) * 0.8; lx1 = -lx0;
      if (this.deadKind === 'lava') {
        // Heiße Sohlen: er hüpft wie auf der Herdplatte, der Hintern qualmt
        hop = Math.abs(Math.sin(t * 20)) * 0.024 + 0.01; bz = Math.sin(t * 17) * 0.18; red = 1;
        if (Math.random() < dt * 50) Glow.emit(this.pos.clone().add(new V3(rand(-0.02, 0.02), 0.01, rand(-0.02, 0.02))), new V3(rand(-0.05, 0.05), rand(0.15, 0.4), rand(-0.05, 0.05)), pick([0xff6a1a, 0xffb02e, 0xff3a0a]), rand(0.006, 0.012), rand(0.25, 0.5), -0.2);
      }
    } else if (this.frozen && st === 'pee') {
      // Am Ziel: Hohlkreuz, beide Hände vorn, Kopf im Nacken, selig
      bx = -0.14; ax0 = ax1 = -0.5; az0 = az1 = -0.2; e0 = e1 = 0.8; hx = -0.4; look = 0; lz = -0.08; bz = Math.sin(t * 38) * 0.012 * (Math.sin(t * 1.7) > 0.6 ? 1 : 0);
      lid = 1.4; brow = 0.4; mw = 0.0065; mo = 0.003; mc = 0.9; red = 0.3;
    } else if (this.frozen && st === 'done') {
      // Erleichtert: dreht sich zum Spieler und jubelt
      yaw = Math.PI; az0 = 2.5 + Math.sin(t * 9) * 0.35; az1 = 2.5 - Math.sin(t * 9) * 0.35; e0 = e1 = 0.4; hop = Math.abs(Math.sin(t * 6)) * 0.012; lx0 = Math.sin(t * 6) * 0.25; lx1 = -lx0;
      lid = 0.05; mw = 0.0082; mo = 0.0028; mc = 1; te = 1;
    } else if (this.frozen && st === 'fail') {
      // Zu spät: Kopf hängt, Knie zusammen, Schluchzer
      hx = 0.5; look = 0; lz = 0.12; ax0 = ax1 = -0.12; az0 = az1 = 0.06; e0 = e1 = 0.12; bx = 0.1; hop = Math.max(0, Math.sin(t * 9)) * 0.002;
      lid = 0.8; brow = 0.8; mw = 0.005; mo = 0.0008; mc = -1; red = 1;
    } else if (air) {
      look = 0.3; lid = -0.5; brow = 0.3; mw = 0.0042; mo = 0.0036; mc = 0;
      if (this.vel.y > 1.4) { spin = true; az0 = az1 = 2.9; lx0 = 0.25; lx1 = -0.1; mw = 0.007; mc = 0.8; te = 1; }  // Raketenstart vom Furzkissen: Korkenzieher
      else if (this.vel.y > 0) { lx0 = -0.9; lx1 = 0.5; az0 = az1 = 2.3; e0 = e1 = 0.2; bx = -0.12; }
      else { az0 = 1.9 + Math.sin(t * 26) * 0.45; az1 = 1.9 - Math.sin(t * 26) * 0.45; lx0 = Math.sin(t * 20) * 0.5; lx1 = -lx0; bx = 0.15; }
      if (this.vel.y > 1.2 && Math.random() < dt * 45) Smoke.emit(this.pos.clone().add(new V3(0, 0.03, 0)), new V3(rand(-0.06, 0.06), -0.1, rand(-0.06, 0.06)), pick([0x9fd14a, 0x7fb83a, 0xb8d96a]), rand(0.012, 0.02), rand(0.5, 0.9), -0.02, 0.04, 1.5);
    } else if (riding) {
      // Saugroboter-Surfen
      const a = Math.sin(t * 5) * 0.3; lz = -0.22; az0 = 1.25 + a; az1 = 1.25 - a; e0 = e1 = 0.1; bz = Math.sin(t * 5) * 0.1; mw = 0.0075; mo = 0.002; mc = 1; te = 1; lid = 0;
    } else {
      // Stehen (besoffen schwanken, zappeln, Pipi-Tanz) ↔ Rennen, überblendet mit der Laufstärke
      const i = 1 - w, d = urg * i, f = 7 + urg * 7;
      if (i > 0.8 && d < 0.05 && !Bubble.talking) { v.fidT -= dt; if (v.fidT < 0) { v.fidT = rand(4, 8); v.fid = st === 'intro' ? pick(['wave', 'wave', 'scratch']) : pick(['scratch', 'butt', 'tap', 'burp']); v.fidK = 1.7; } }
      else if (i < 0.5) v.fidK = 0;
      v.fidK = Math.max(0, v.fidK - dt); const k = Math.sin(Math.min(1, v.fidK / 1.7) * Math.PI) * i;
      lx0 = s * 0.85 * w; lx1 = -lx0; ax0 = -s * 0.7 * w; ax1 = s * 0.7 * w; e0 = e1 = 0.25 + 0.65 * w; az0 = az1 = 0.2 + 0.1 * w;
      bx = 0.2 * w + Math.sin(t * 0.9) * 0.025 * i; bz = (s * 0.07 + Math.sin(this.phase * 0.23) * 0.06) * w + Math.sin(t * 1.3) * 0.045 * i;
      hop = Math.abs(Math.cos(this.phase)) * 0.005 * w; look = 1 - 0.6 * w;
      if (urg > 0.5 && w > 0.3) { ax1 = -0.5; az1 = -0.25; e1 = 0.9; }  // eine Hand hält schon mal zu
      // Pipi-Tanz: Knie zusammen, Hände in den Schritt, von einem Bein aufs andere
      lz += (0.13 + Math.sin(t * f * 2) * 0.04) * d; hop += Math.abs(Math.sin(t * f)) * 0.006 * d; yaw = Math.sin(t * f * 0.8) * 0.18 * d;
      ax0 += -0.55 * d; ax1 += -0.55 * d; az0 -= 0.45 * d; az1 -= 0.45 * d; e0 += 0.65 * d; e1 += 0.65 * d; bx += 0.12 * d;
      if (k > 0) {
        if (v.fid === 'scratch') { ax1 = -0.75 * k; az1 = 0.2 - 0.55 * k; e1 = 0.25 + (1.2 + Math.sin(t * 20) * 0.15) * k; }
        else if (v.fid === 'butt') { ax0 = (0.55 + Math.sin(t * 22) * 0.08) * k; az0 = 0.2 - 0.3 * k; bx += 0.06 * k; }
        else if (v.fid === 'tap') { lx1 = (-0.25 + Math.sin(t * 14) * 0.2) * k; az0 = az1 = 0.2 - 0.35 * k; e0 = e1 = 0.25 + 1.2 * k; ax0 = ax1 = -0.35 * k; }
        else if (v.fid === 'wave') { az1 = 0.2 + (2.5 + Math.sin(t * 12) * 0.25) * k; e1 = 0.25 + 0.4 * k; mc = 1; mo = 0.0022; te = 1; mw = 0.0075; }
        else if (v.fid === 'burp') { hx = -0.35 * k; mo = 0.004 * k; mw = 0.005; bx -= 0.08 * k; }
      }
      // Je voller die Blase, desto verkniffener
      lid += (-0.7 - lid) * urg; brow += (0.65 - brow) * urg; mc += (-0.7 - mc) * urg; mw += 0.002 * urg; mo += 0.0012 * urg; if (urg > 0.3) te = 1;
    }
    if (Bubble.talking && !dead) { mo = 0.0012 + Math.abs(Math.sin(performance.now() / 45)) * 0.0036; if (st === 'play' || st === 'intro') az0 = Math.max(az0, 0.5 + Math.sin(t * 7) * 0.2); }
    // Gelenke weich nachführen
    const P = v.p, T = [lx0, lx1, lz, ax0, ax1, az0, az1, e0, e1, bx, bz, hop, 0, 0], kp = Math.min(1, dt * 30);
    for (let i = 0; i < 12; i++) P[i] += (T[i] - P[i]) * kp;
    m.legs[0].rotation.set(P[0], 0, P[2]); m.legs[1].rotation.set(P[1], 0, -P[2]);
    m.arms[0].rotation.set(P[3], 0, -P[5]); m.arms[1].rotation.set(P[4], 0, P[6]);
    m.fore[0].rotation.x = -P[7]; m.fore[1].rotation.x = -P[8];
    if (spin) v.yaw += dt * 16; else { let d = yaw - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); v.yaw += d * Math.min(1, dt * 8); }
    m.body.rotation.set(P[9], v.yaw, P[10]); m.body.position.y = P[11];
    // Kopf und Pupillen suchen den Spieler
    const hw = m.root.rotation.y + v.yaw, dx = Player.head.x - this.pos.x, dz = Player.head.z - this.pos.z;
    let a = Math.atan2(dx, dz) - hw; a = Math.atan2(Math.sin(a), Math.cos(a));
    const pitch = Math.atan2(Player.head.y - this.pos.y - 0.13, Math.hypot(dx, dz)), see = Math.abs(a) < 2.2 ? look : 0;
    v.hy += (clamp(a, -1, 1) * see - v.hy) * Math.min(1, dt * 6); v.hp += (hx - clamp(pitch, -0.3, 0.9) * 0.5 * see - v.hp) * Math.min(1, dt * 8);
    m.head.rotation.set(v.hp + Math.cos(this.phase * 2) * 0.04 * w, v.hy, 0);
    const py = see > 0 ? clamp(a - v.hy, -0.5, 0.5) * 0.9 : 0, pp = see > 0 ? -clamp(pitch + v.hp, -0.4, 0.5) * 0.8 : 0;
    // Mimik
    this.blinkT -= dt; const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = rand(1.8, 4.5);
    const ke = Math.min(1, dt * 12);
    v.lid += ((blink ? 1.45 : lid) - v.lid) * Math.min(1, dt * 30); v.brow += (brow - v.brow) * ke; v.mw += (mw - v.mw) * ke; v.mo += (mo - v.mo) * Math.min(1, dt * 25); v.mc += (mc - v.mc) * ke; v.te += (te - v.te) * ke; v.red += (red - v.red) * Math.min(1, dt * 3);
    for (let i = 0; i < 2; i++) {
      const u = m.eyes[i].userData, sx = i ? 1 : -1;
      u.lid.rotation.x = v.lid; u.pupil.rotation.set(pp, py, 0); u.pupil.scale.setScalar(v.lid < 0 ? 1 + v.lid * 0.35 : 1);
      m.brows[i].rotation.z = -sx * v.brow; m.brows[i].position.y = 0.0172 + Math.max(0, -v.lid) * 0.004;
    }
    m.mouth.userData.set(v.mw, v.mo, v.mc, v.te);
    MAT.head.color.setRGB(1, 1 - v.red * 0.3, 1 - v.red * 0.34); MAT.gvHead.color.copy(MAT.head.color);
    // Nachwippen: Wampe (Stöße bei jedem Schritt und bei der Landung) und Iro
    const stepN = Math.floor(this.phase / Math.PI);
    if (stepN !== v.step) { v.step = stepN; if (w > 0.4 && this.onGround) v.jigV -= 1.6; }
    if (this.onGround && !v.gr && !dead) {
      v.jigV -= 4;
      for (let i = 0; i < 9; i++) { const q = rand(0, 6.28); Smoke.emit(this.pos.clone().add(new V3(Math.cos(q) * 0.02, 0.006, Math.sin(q) * 0.02)), new V3(Math.cos(q) * 0.16, 0.03, Math.sin(q) * 0.16), 0xe8e0d4, rand(0.008, 0.014), rand(0.3, 0.5), -0.03, 0.03, 4); }
    } else if (!this.onGround && v.gr && this.vel.y > 0.5) {
      v.jigV += 3;
      for (let i = 0; i < 5; i++) Smoke.emit(this.pos.clone().add(new V3(rand(-0.015, 0.015), 0.006, rand(-0.015, 0.015))), new V3(rand(-0.08, 0.08), 0.02, rand(-0.08, 0.08)), 0xe8e0d4, rand(0.007, 0.012), rand(0.25, 0.4), -0.03, 0.03, 4);
    }
    v.gr = this.onGround;
    v.jigV += (-v.jig * 320 - v.jigV * 11) * dt; v.jig = clamp(v.jig + v.jigV * dt, -0.35, 0.35);
    const br = 1 + Math.sin(t * 2.2) * 0.012;
    m.belly.scale.set(br + v.jig * 0.25, 1 - v.jig * 0.4, br + v.jig * 0.3); m.belly.position.y = 0.074 + v.jig * 0.004;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    v.mxV += ((clamp(-hs * 0.7 + this.vel.y * 0.3 - P[11] * 12, -0.6, 0.6) - v.mx) * 200 - v.mxV * 8) * dt; v.mx += v.mxV * dt;
    v.mzV += ((-P[10] * 2.5 - v.mz) * 200 - v.mzV * 8) * dt; v.mz += v.mzV * dt;
    m.mohawk.rotation.set(clamp(v.mx, -0.5, 0.5) * 0.5, 0, clamp(v.mz, -0.6, 0.6));
    // Schweißperlen, wenn es pressiert
    if (urg > 0.45 && !dead && Math.random() < dt * (2 + urg * 8)) {
      const q = rand(0, 6.28);
      Glow.emit(this.pos.clone().add(new V3(Math.cos(q) * 0.03, 0.15, Math.sin(q) * 0.03)), new V3(Math.cos(q) * 0.12, rand(0.15, 0.3), Math.sin(q) * 0.12), 0xbfe8ff, 0.0045, 0.5, 1.6);
    }
    // Schatten auf die Fläche darunter
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.01);
    if (isFinite(g.y)) {
      this.shadow.visible = this.visible;
      this.shadow.position.set(this.pos.x, g.y + 0.004, this.pos.z);
      const h = this.pos.y - g.y; this.shadow.scale.setScalar(1.9 * clamp(1 - h * 1.5, 0.35, 1)); shadowMat.opacity = clamp(0.6 - h, 0.12, 0.6);
    } else this.shadow.visible = false;
    // Ortungsmarke: aus der Nähe unauffällig, von weitem größer
    const far = clamp(Player.head.distanceTo(this.pos) - 0.6, 0, 2);
    this.marker.position.set(this.pos.x, this.pos.y + 0.27, this.pos.z); this.marker.scale.setScalar(0.02 + far * 0.012);
    this.marker.material.opacity = (0.35 + 0.25 * Math.sin(performance.now() / 300)) * clamp(far * 2.5, 0.15, 1);
    Bubble.update(dt, this.pos.clone().add(new V3(0, 0.215, 0)));
  },
};

// ---------------------------------------------------------------- Requisiten
const Level = { n: 0, lava: false, spawn: new V3(), toilet: null, beers: [], objs: [], origin: new V3(), fwd: new V3(0, 0, -1), avoid: [], spec: null, rolls: 0, cushions: 0 };
function addObj(o) { scene.add(o); Level.objs.push(o); return o; }

// Bierkiste (Plattform auf dem Boden)
function makeCrate(x, z, yaw) {
  const w = 0.3, d = 0.4, h = 0.28, y0 = Room.floorY;
  const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = yaw;
  const bg = new THREE.BoxGeometry(w, h, d), uv = bg.attributes.uv;
  for (let i = 0; i < 24; i++) { const f = i >> 2; uv.setY(i, f === 2 || f === 3 ? 0.02 + uv.getY(i) * 0.19 : 0.28 + uv.getY(i) * 0.72); }
  const box = new THREE.Mesh(bg, MAT.crateSide);
  box.position.y = h / 2; g.add(box); g.add(blob(w * 1.5, d * 1.4, Level.lava ? 0.6 : 0.5, true, Level.lava));
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
  const ws = blob(w * 1.15, 0.16, 0.4, true); ws.rotation.x = Math.PI / 2; ws.position.set(0, -0.07, -d / 2); g.add(ws);  // Schatten an der Wand
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
  g.add(blob(0.17, 0.2, 0.5));
  const halo = blob(0.42, 0.42, 0.5, false, true); halo.material = haloMat; halo.position.y = 0.005; g.add(halo);
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
  const gy = groundAt(p.x, p.z, p.y).y; if (isFinite(gy) && p.y - gy < 0.3 && !Level.lava) { const sh = blob(0.06, 0.06, 0.4); sh.position.set(p.x, gy + 0.004, p.z); addObj(sh); }
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
// Rolle + Papphülse in einem Netz (ein Draw-Call pro Rolle statt zwei)
const rollOneGeo = mergeGeos([[rollGeo, 0xffffff], [coreGeo, 0xb08a5a]]);
const rollMat = MAT.paper.clone(); rollMat.vertexColors = true;
const ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.35, depthWrite: false });
const ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false });
const Rolls = {
  list: [],
  add(x, z, y) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(rollOneGeo, rollMat));
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
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.02, 10).rotateX(Math.PI / 2), MAT.cushion); nozzle.position.set(0, 0.008, 0.045); g.add(nozzle); g.add(blob(0.13, 0.13, 0.4));
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
  obj: null, pos: new V3(), vel: new V3(), dir: 0, R: 0.16, solid: null, turnT: 0, brushes: [], stunT: 0,
  // Betäuben: Schelle mit der Hand oder etwas auf den Deckel geworfen. quiet = ohne Tamtam (Wiedereinstieg)
  stun(t, quiet = false) {
    if (!this.obj) return;
    const fresh = this.stunT <= 0.3; this.stunT = Math.max(this.stunT, t);
    if (quiet || !fresh) return;
    Sound.slap(this.pos); Glow.burst(this.pos.clone().add(new V3(0, 0.1, 0)), 0xffe14f, 16, 0.5, 0.01, 0.5);
    popup(this.pos.clone().add(new V3(0, 0.2, 0)), 'KLATSCH! +25', '#ffd23f', 0.035); Game.bonus += 25;
    Guenther.say('stun', true);
  },
  // Schelle: betäubt und schubst ihn; danach fährt er in Schlagrichtung weiter (so lenkt man das Lava-Taxi)
  slap(v) {
    if (!this.obj) return;
    this.stun(3); const l = Math.hypot(v.x, v.z);
    if (l > 0.05) { this.vel.set(v.x / l, 0, v.z / l).multiplyScalar(Math.min(0.9, l * 0.5)); this.dir = Math.atan2(v.x, v.z); this.turnT = 0; }
  },
  syncSolid() {
    const p = rectPoly(this.pos.x, this.pos.z, 0.12, 0.12, this.obj.rotation.y);
    this.solid.poly = p; const bb = bbox(p); this.solid.min = bb.min; this.solid.max = bb.max;
  },
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
    g.add(blob(0.5, 0.5, Level.lava ? 0.6 : 0.5, false, Level.lava));
    addObj(g); this.obj = g;
    this.pos.set(x, Room.floorY, z); this.dir = Math.random() * 6.28; this.stunT = 0; this.vel.set(0, 0, 0);
    this.solid = makeSolid('robot', rectPoly(x, z, 0.12, 0.12), Room.floorY + 0.088, Room.floorY - 0.01);
    World.dyn.push(this.solid);
  },
  clear() { this.obj = null; this.solid = null; },
  update(dt) {
    if (!this.obj) return;
    const others = () => World.dyn.filter((s) => s !== this.solid);
    if (this.stunT > 0) {
      // Betäubt: rutscht aus, eiert, tut keinem was (und trägt Günther trotzdem)
      this.stunT -= dt; this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      const t2 = new V3(this.pos.x + this.vel.x * dt, 0, this.pos.z + this.vel.z * dt);
      const bk = World.dyn; World.dyn = others(); const h2 = pushOut(t2, this.R, Room.floorY, Room.floorY + 0.08); World.dyn = bk;
      if (h2 || (Room.floorPoly && !pip(t2.x, t2.z, Room.floorPoly))) this.vel.set(0, 0, 0); else { this.pos.x = t2.x; this.pos.z = t2.z; }
      this.obj.position.copy(this.pos); this.obj.rotation.z = this.stunT > 0 ? Math.sin(this.stunT * 30) * 0.05 : 0;
      if (Math.random() < dt * 14) Glow.emit(this.pos.clone().add(new V3(rand(-0.1, 0.1), 0.1, rand(-0.1, 0.1))), new V3(rand(-0.1, 0.1), rand(0.1, 0.3), rand(-0.1, 0.1)), 0xffe14f, 0.008, 0.4, 0.5);
      this.syncSolid(); return;
    }
    this.turnT -= dt;
    const sp = 0.16;
    const nx = this.pos.x + Math.sin(this.dir) * sp * dt, nz = this.pos.z + Math.cos(this.dir) * sp * dt;
    const test = new V3(nx, 0, nz);
    // Kollision (ohne sich selbst), Bodenrand
    const solidsBackup = World.dyn; World.dyn = others();
    const hit = pushOut(test, this.R, Room.floorY, Room.floorY + 0.08);
    World.dyn = solidsBackup;
    let offFloor = Room.floorPoly && !pip(nx + Math.sin(this.dir) * this.R, nz + Math.cos(this.dir) * this.R, Room.floorPoly);
    // Günthers Startplatz ist tabu (kein Lauern am Wiedereinstieg)
    if (!Level.lava) for (const sp of [Level.spawn, Guenther.check]) { const d1 = Math.hypot(nx - sp.x, nz - sp.z); if (d1 < this.R + 0.25 && d1 < Math.hypot(this.pos.x - sp.x, this.pos.z - sp.z)) offFloor = true; }
    if (hit || offFloor || this.turnT < -rand(4, 9)) { this.dir += (Math.random() < 0.5 ? 1 : -1) * rand(1.6, 2.8); this.turnT = 0; this.vel.set(0, 0, 0); }
    else { this.vel.set((nx - this.pos.x) / dt, 0, (nz - this.pos.z) / dt); this.pos.x = nx; this.pos.z = nz; }
    this.obj.position.copy(this.pos);
    const cur = this.obj.rotation.y; let d = this.dir - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); this.obj.rotation.y = cur + d * Math.min(1, dt * 5);
    for (const b of this.brushes) b.rotation.y += dt * 18;
    this.syncSolid();
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

// ---------------------------------------------------------------- Gegenstände (Aussehen)
// Jeder Bauer liefert eine frische Gruppe in Metern, Ursprung unten in der Mitte, +Y oben. Geometrien und Materialien sind geteilt.
const ITEM_LOOK = (() => {
  const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // Saugnapf-Dildo: 17 cm hoch, Schaft r = 2.2 cm, Saugnapf r = 3.5 cm
  const jelly = std({ color: 0xff3d9a, roughness: 0.15, emissive: 0x5a0a30 });
  const cupMat = std({ color: 0xff9ccc, roughness: 0.1, transparent: true, opacity: 0.7 });
  const shaftGeo = mergeGeos([
    [lathe([[0.0185, 0.014], [0.022, 0.026], [0.022, 0.06], [0.0215, 0.1], [0.0205, 0.126], [0.0195, 0.132], [0.0235, 0.137], [0.0238, 0.144], [0.0215, 0.157], [0.016, 0.165], [0.008, 0.1693], [0, 0.17]])],
    [new THREE.SphereGeometry(0.0155, 12, 10).translate(-0.013, 0.027, 0.012)], [new THREE.SphereGeometry(0.0155, 12, 10).translate(0.013, 0.027, 0.012)],
  ]);
  const cupGeo = lathe([[0.035, 0], [0.0335, 0.004], [0.025, 0.009], [0.0195, 0.014], [0.0185, 0.02]]);
  // Pizzakarton 24 × 1.2 × 24 cm: oben der Deckeldruck, unten Pappe (v < 0.1)
  const pizzaTex = canvasTex(256, 288, (g) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d0202a'; g.lineWidth = 10; g.strokeRect(9, 9, 238, 238); g.strokeStyle = '#1f8a3a'; g.lineWidth = 4; g.strokeRect(20, 20, 216, 216);
    g.fillStyle = '#e8b040'; g.beginPath(); g.arc(128, 150, 52, 0, 7); g.fill(); g.fillStyle = '#d8402a'; g.beginPath(); g.arc(128, 150, 44, 0, 7); g.fill();
    g.fillStyle = '#f4d060'; g.beginPath(); g.arc(128, 150, 40, 0, 7); g.fill();
    g.fillStyle = '#b02a20'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(128 + Math.cos(i * 0.9) * 24, 150 + Math.sin(i * 0.9) * 24, 7, 0, 7); g.fill(); }
    g.fillStyle = '#d0202a'; g.font = '900 44px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('PIZZA', 128, 76);
    g.fillStyle = '#222'; g.font = '800 15px system-ui,sans-serif'; g.fillText('EXTRA FETTIG · KALT VON GESTERN', 128, 226);
    for (const [x, y, r] of [[52, 120, 26], [206, 190, 30], [190, 60, 18]]) { const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(150,110,30,0.45)'); gr.addColorStop(1, 'rgba(150,110,30,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.fillStyle = '#b89868'; g.fillRect(0, 256, 256, 32);
  });
  const pizzaGeo = new THREE.BoxGeometry(0.24, 0.012, 0.24).translate(0, 0.006, 0);
  for (let i = 0, uv = pizzaGeo.attributes.uv; i < 24; i++) uv.setY(i, (i >> 2) === 2 ? 0.115 + uv.getY(i) * 0.885 : 0.03 + uv.getY(i) * 0.05);
  const pizzaMat = std({ map: pizzaTex, roughness: 0.9 });
  // Klobürste, liegt längs +Z, 36 cm: Griff, Stiel, Borstenkopf (vorn schon etwas bräunlich)
  const plastic = std({ vertexColors: true, roughness: 0.4 });
  const br = []; for (let i = 0; i <= 12; i++) br.push([i === 12 ? 0 : (i % 2 ? 0.015 : 0.009), 0.08 + i * 0.1 / 12]);
  const brushGeo = mergeGeos([
    [new THREE.CylinderGeometry(0.0065, 0.0065, 0.2, 10).translate(0, -0.02, 0), 0xf2f4f6],
    [new THREE.CylinderGeometry(0.011, 0.009, 0.06, 12).translate(0, -0.15, 0), 0x2e9bff], [new THREE.SphereGeometry(0.011, 10, 8).translate(0, -0.169, 0), 0x2e9bff],
    [lathe(br, 14), (q, c) => c.set(0xf4f2ea).lerp(_mc2, clamp((Math.hypot(q.x, q.z) - 0.009) / 0.006, 0, 1) * clamp((q.y - 0.1) / 0.08, 0, 1))],
  ]).rotateX(Math.PI / 2).translate(0, 0.015, 0);
  // Föhn auf dem Rücken, bläst nach oben: Grundfläche 10 × 6 cm, 7 cm hoch
  const dryerGeo = mergeGeos([
    [lathe([[0, 0.002], [0.026, 0.002], [0.03, 0.008], [0.03, 0.05], [0.027, 0.056], [0.027, 0.07], [0.023, 0.07], [0.023, 0.058], [0, 0.058]], 20).translate(-0.02, 0, 0), (q, c) => c.set(q.y > 0.0555 ? 0x2a2c33 : 0xff6a1a)],
    [new THREE.BoxGeometry(0.045, 0.022, 0.028).translate(0.0275, 0.012, 0), 0x2a2c33], [new THREE.CylinderGeometry(0.004, 0.004, 0.012, 6).rotateZ(Math.PI / 2).translate(0.05, 0.008, 0), 0x111111],
  ]);
  const coilGeo = mergeGeos([[new THREE.TorusGeometry(0.017, 0.0022, 5, 18).rotateX(Math.PI / 2).translate(-0.02, 0.061, 0)], [new THREE.TorusGeometry(0.009, 0.0022, 5, 14).rotateX(Math.PI / 2).translate(-0.02, 0.061, 0)]]);
  const coilMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  // Aufwind: Röhre mit nach oben laufenden Schlieren
  const upGeo = new THREE.CylinderGeometry(0.06, 0.045, 0.5, 20, 1, true).translate(0, 0.25, 0);
  const upMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uT; varying vec2 vUv; void main(){ float s=0.5+0.5*sin(vUv.x*37.7+sin(vUv.y*9.0-uT*5.0)*1.5); float w=0.5+0.5*sin(vUv.y*14.0-uT*7.0+vUv.x*12.6); float a=(1.0-vUv.y)*smoothstep(0.0,0.08,vUv.y)*(0.1+0.3*s*s*w); gl_FragColor=vec4(1.0,0.82,0.6,a); }',
  });
  const mk = (...ms) => { const g = new THREE.Group(); for (const m of ms) g.add(m); return g; };
  return {
    dildo() { return mk(new THREE.Mesh(shaftGeo, jelly), new THREE.Mesh(cupGeo, cupMat), blob(0.12, 0.12, 0.45)); },
    pizza() { return mk(new THREE.Mesh(pizzaGeo, pizzaMat), blob(0.33, 0.33, 0.45, true)); },
    brush() { return mk(new THREE.Mesh(brushGeo, plastic), blob(0.07, 0.42, 0.4, true)); },
    dryer() { const gl = new THREE.Sprite(glowMat); gl.scale.setScalar(0.07); gl.position.set(-0.02, 0.07, 0); return mk(new THREE.Mesh(dryerGeo, plastic), new THREE.Mesh(coilGeo, coilMat), gl, blob(0.16, 0.11, 0.45, true)); },
    updraft() { const g = mk(new THREE.Mesh(upGeo, upMat)); g.children[0].renderOrder = 6; g.userData.update = () => { upMat.uniforms.uT.value = performance.now() / 1000; }; return g; },
  };
})();

// ---------------------------------------------------------------- Grafik-Bildtakt (wird von HUD.update jedes Bild gerufen)
const Gfx = {
  ready: false, lava: null,
  update(dt) {
    if (!this.ready) { this.ready = true; shadowMat.map = blobTex; shadowMat.needsUpdate = true; if (window.__g) window.__g.ITEM_LOOK = ITEM_LOOK; }
    if (this.lava !== Level.lava) { this.lava = Level.lava; hemi.groundColor.set(Level.lava ? 0xff5a14 : 0x6a5444); hemi.intensity = Level.lava ? 1.7 : 1.3; }
    const T = Level.toilet;
    if (T && Math.random() < dt * 7) Glow.emit(T.pos.clone().add(new V3(rand(-0.05, 0.05), rand(0.01, 0.14), rand(-0.05, 0.05))), new V3(0, rand(0.01, 0.05), 0), pick([0xffe9a0, 0xffd23f, 0xffffff]), rand(0.004, 0.008), rand(0.3, 0.6));
  },
};

// ---------------------------------------------------------------- Spieler, Hände, Eingabe
const Player = { head: new V3(0, 1.6, 0), fwd: new V3(0, 0, -1), quat: new THREE.Quaternion() };
const laserMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const Hands = {
  list: [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    scene.add(c);
    const h = { i, c, src: null, pos: new V3(), dir: new V3(), prev: [], tip: new V3(), vel: new V3(), last: new V3(), has: false };
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
      h.tool.visible = !!h.src && h.src.handedness === 'right' && Game.state === 'play' && !Items.held;
    }
  },
  // Geschwindigkeit der Controller (geglättet) fürs Werfen und für Schellen
  track(dt) {
    for (const h of this.list) {
      if (!h.src) { h.has = false; h.vel.set(0, 0, 0); continue; }
      if (h.has && dt > 0.001) h.vel.lerp(_hv.copy(h.pos).sub(h.last).divideScalar(dt), 0.4);
      h.last.copy(h.pos); h.has = true;
    }
  },
};
const _hv = new V3(), _yUp = new V3(0, 1, 0);
function btn(h, i) { return !!h?.src?.gamepad?.buttons?.[i]?.pressed; }
function edge(h, i) {
  if (!h) return false;
  const now = btn(h, i), was = !!h.prev[i]; return now && !was;
}
const Input = {
  move: new V3(), jump: false,
  ghost: null, ghostPos: null, ghostOk: false, ghostKind: 'roll',
  item: 'roll', ghosts: {}, trigT: -1, cyc: false, rsT: 0, labelText: '',
  init() {
    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    g.add(line); g.userData.line = line;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(ring); g.userData.ring = ring;
    g.visible = false; ring.visible = false; scene.add(g); this.ghost = g;
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.03, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthWrite: false })); this.target.visible = false; scene.add(this.target);
    // Schildchen: gewähltes Teil und Vorrat (Platzhalter, bis das HUD es zeigt)
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); this.label.renderOrder = 36; this.label.visible = false; scene.add(this.label);
    this.setItem('roll', true);
  },
  // Vorschau des gewählten Teils zeigen (grün = geht, rot = geht nicht)
  showGhost(p, ok, kind = 'roll', yaw = 0, peg = null) {
    const g = this.ghost; g.visible = true; g.position.copy(p);
    this.ghostPos = p; this.ghostOk = ok; this.ghostKind = kind;
    let m = this.ghosts[kind];
    if (!m) { m = this.ghosts[kind] = itemMesh(kind); g.add(m); }
    for (const k in this.ghosts) this.ghosts[k].visible = k === kind;
    const mat = ok ? ghostMatOk : ghostMatBad;
    if (m.userData.mat !== mat) { m.userData.mat = mat; m.traverse((o) => { if (o.isMesh) o.material = mat; }); }
    if (peg) m.quaternion.setFromUnitVectors(_yUp, _hv.set(peg[0], 0, peg[1])); else m.quaternion.setFromAxisAngle(_yUp, yaw);
    const gr = groundAt(p.x, p.z, p.y - 0.001, 0);
    const h = isFinite(gr.y) ? p.y - gr.y : 0;
    g.userData.line.visible = h > 0.02; g.userData.line.scale.y = Math.max(0.001, h);
    g.userData.ring.visible = h > 0.02; if (h > 0.02) g.userData.ring.position.set(p.x, gr.y + 0.004, p.z);
  },
  hideGhost() { this.ghost.visible = false; this.ghost.userData.ring.visible = false; },
  // Teil wählen: Werkzeug an der rechten Hand zeigt, was gleich gesetzt wird
  setItem(kind, quiet = false) {
    this.item = kind; if (!quiet) Sound.select();
    for (const h of Hands.list) { h.tool.clear(); const m = itemMesh(kind); m.scale.setScalar(kind === 'roll' ? 0.35 : 0.3); m.rotation.x = -Math.PI / 2; m.position.set(0, 0, -0.03); h.tool.add(m); }
  },
  cycle(d) {
    const kinds = ITEM_ORDER.filter((k) => Level.has[k]); if (kinds.length < 2) return;
    this.setItem(kinds[(kinds.indexOf(this.item) + d + kinds.length * 2) % kinds.length]);
  },
  showLabel(pos) {
    const n = Level.inv[this.item], text = `${ITEM_DEF[this.item].name} ×${n}`, lb = this.label;
    if (text !== this.labelText) { this.labelText = text; const tex = textTexture(text, n > 0 ? '#ffd23f' : '#ff6a4a', 40); lb.material.map = tex; lb.material.needsUpdate = true; lb.userData.aspect = tex.userData.aspect; }
    lb.visible = true;
    if (pos) { if (lb.parent !== scene) scene.add(lb); lb.position.copy(pos).y += 0.075; lb.scale.set(0.02 * lb.userData.aspect, 0.02, 1); }
    else { if (lb.parent !== camera) camera.add(lb); lb.position.set(0.13, -0.1, -0.3); lb.scale.set(0.012 * lb.userData.aspect, 0.012, 1); }
  },
  update(dt) {
    this.move.set(0, 0, 0); this.jump = false;
    const f = Player.fwd.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const r = new V3(-f.z, 0, f.x);
    const play = Game.state === 'play';
    if (!play) { this.label.visible = false; this.trigT = -1; }
    if (DESK.on) { Desk.input(this, f, r); return; }
    Hands.track(dt);
    const R = Hands.right, L = Hands.left;
    // Bewegung: linker Stick (der rechte blättert durch die Teile; fehlt die linke Hand, steuert der rechte)
    for (const h of L ? [L] : [R]) {
      const ax = h?.src?.gamepad?.axes; if (!ax) continue;
      const sx = ax[2] ?? 0, sy = ax[3] ?? 0;
      if (Math.hypot(sx, sy) > 0.15) this.move.addScaledVector(r, sx).addScaledVector(f, -sy);
    }
    if (this.move.length() > 1) this.move.normalize();
    // A/X: im Spiel springen; sonst A = weiter, X = (im Intro) Raum neu scannen, (sonst) Level nochmal
    if (play) { if (edge(R, 4) || edge(L, 4)) this.jump = true; }
    else {
      if (edge(R, 4)) Game.onA();
      if (edge(R, 5) && Game.state === 'intro') { AR.cycle(); Sound.tone('triangle', 520, 700, 0.06, 0.1); }
      if (edge(L, 4)) { if (Game.state === 'intro') Setup.capture(); else Game.onX(); }
      // Intro: Start-Level mit dem linken Stick wählen
      const lx = L?.src?.gamepad?.axes?.[2] ?? 0;
      if (Math.abs(lx) > 0.6) { if (!this.cyc) { this.cyc = true; if (Game.state === 'intro') Game.pickLevel(lx > 0 ? 1 : -1); } } else if (Math.abs(lx) < 0.3) this.cyc = false;
    }
    // Rechte Hand: bauen. Stick links/rechts wählt das Teil, kurzer Abzug setzt es schwebend ins Raster,
    // Abzug halten greift es (oder ein schon gesetztes unter der Spitze), loslassen lässt es fallen bzw. wirft es.
    if (play && R) {
      const sx = R.src.gamepad?.axes?.[2] ?? 0;
      if (Math.abs(sx) > 0.6) { if (!this.cyc) { this.cyc = true; this.cycle(sx > 0 ? 1 : -1); } } else if (Math.abs(sx) < 0.3) this.cyc = false;
      const tip = R.tip;
      if (Items.held) {
        this.hideGhost(); Items.carry(tip);
        if (!btn(R, 0)) { Items.release(tip, R.vel); Hands.buzz(R, 0.2, 30); }
      } else {
        const sp = Items.spot(this.item, tip, R.dir);
        sp.ok = sp.ok && Level.inv[this.item] > 0;
        this.showGhost(sp.p, sp.ok, this.item, sp.yaw, sp.peg);
        if (edge(R, 0)) this.trigT = 0;
        if (this.trigT >= 0) {
          if (btn(R, 0)) { this.trigT += dt; if (this.trigT >= 0.25) { this.trigT = -1; if (Items.grab(tip)) Hands.buzz(R, 0.5, 60); } }
          else { this.trigT = -1; Game.placeItem(sp); }
        }
        if (edge(R, 1)) Game.placeCushion(tip);
        if (edge(R, 5)) Game.removeAt(tip);
      }
      this.showLabel(tip);
    } else { this.hideGhost(); this.label.visible = false; }
    // Linke Hand: zeigen & rufen, Checkpoint
    if (play && L) {
      const pressing = btn(L, 0);
      L.laser.visible = pressing;
      if (pressing) {
        const hit = rayTops(L.pos, L.dir);
        this.target.visible = !!hit; if (hit) { this.target.position.copy(hit.point).y += 0.004; L.laser.scale.z = hit.t; this.aim = hit.point; } else { L.laser.scale.z = 2; this.aim = null; }
      } else if (L.prev[0]) {
        if (this.aim) { Guenther.target = Game.snapTarget(this.aim); Sound.tone('triangle', 660, 880, 0.08, 0.1); }
        this.target.visible = false; this.aim = null;
      }
      if (edge(L, 1) && Guenther.dead <= 0) Guenther.die('reset');
      // Linken Stick 1 s reindrücken = Level neu starten (gleicher Aufbau)
      if (btn(L, 3)) { if (this.rsT >= 0 && (this.rsT += dt) > 1) { this.rsT = -1; Game.restart(); } } else this.rsT = 0;
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
      Gfx.update(dt);
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
      g.font = '900 24px system-ui,sans-serif'; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#1a1206';
      g.strokeText(`BLASE ${Math.round(b * 100)} %`, 84, 81); g.fillStyle = '#fff'; g.fillText(`BLASE ${Math.round(b * 100)} %`, 84, 81);
      g.font = '800 30px system-ui,sans-serif'; g.fillStyle = '#fff';
      g.fillText(`🍺 ${Game.beers}/${Level.need || Level.beers.length}${Level.need ? ' Pfand' : ''}`, 22, 126);
      g.fillStyle = '#ffd23f'; g.font = '900 34px system-ui,sans-serif'; g.textAlign = 'right'; g.fillText(`${Game.score + Game.levelScore()}`, 490, 124); g.textAlign = 'left';
      // Inventar: alle Sachen dieses Levels, die gewählte hervorgehoben
      const kinds = ITEM_ORDER.filter((k) => Level.has?.[k]); const short = { roll: 'ROLLE', cushion: 'KISSEN', dildo: 'DILDO', pizza: 'PIZZA', brush: 'BÜRSTE', dryer: 'FÖHN' };
      const cw = 480 / Math.max(kinds.length, 1);
      kinds.forEach((k, i) => {
        const x = 16 + i * cw, sel = k === Input.item;
        g.fillStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.12)'; g.beginPath(); g.roundRect(x, 168, cw - 6, 70, 12); g.fill();
        g.fillStyle = sel ? '#1a1206' : '#fff'; g.textAlign = 'center';
        g.font = '900 30px system-ui,sans-serif'; g.fillText(String(Level.inv[k]), x + cw / 2 - 3, 172);
        g.font = '800 17px system-ui,sans-serif'; g.fillText(short[k] || k, x + cw / 2 - 3, 210);
      });
      g.textAlign = 'left';
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
    const st = this.stats(); const key = JSON.stringify(st) + this.msg + Guenther.visible + AR.mode + Game.startAt;
    if (key === this.key) return;
    this.key = key; this.clear();
    for (const s of World.solids) {
      const tex = textTexture(LABEL_DE[s.label] || s.label.toUpperCase(), '#ffd23f', 48);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(0.05 * tex.userData.aspect, 0.05, 1);
      sp.position.set((s.min[0] + s.max[0]) / 2, s.top + 0.1, (s.min[1] + s.max[1]) / 2); this.group.add(sp);
    }
    const roomTxt = st.real ? `${st.walls} Wände · ${st.furn} Möbel · Boden ${st.floor ? 'erkannt' : 'fehlt'}` : 'Kein Raumscan gefunden: virtuelles Zimmer aktiv';
    const lv = `Level ${Game.startAt}${Game.save.unlocked > 1 ? (DESK.on ? ' (Pfeil ←/→)' : ' (linker Stick ←/→)') : ''}`;
    const keys = DESK.on ? `Enter: Los geht’s · ${lv}` : `A: Los geht’s · ${lv} · X: Raum neu scannen\nB: Verdeckung durch echte Dinge [${AR_MODES[AR.mode]}]`;
    Banner.show('GÜNTHER MUSS MAL', `${this.msg ? this.msg + '\n' : ''}${roomTxt}\n${keys}\nEin Punk muss pissen. Dein Wohnzimmer ist sein Parcours.`, '#ffd23f', 0);
    if (!this.commented && Guenther.visible) {
      this.commented = true;
      const lbl = st.labels.find((l) => LINES.furn[l]);
      setTimeout(() => Guenther.say('', true, lbl ? pick(LINES.furn[lbl]) : (st.real ? LINES.nofurn[0] : LINES.noroom[0])), 600);
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

// ---------------------------------------------------------------- Kram zum Hinstellen (Item-System) & Fall-Physik
// Level.inv = Vorrat je Sorte, Level.has = was es in diesem Level gibt, Input.item = gewählte Sorte.
// Rolle und Furzkissen laufen weiter über Rolls/Cushions. Alle Meshes kommen aus itemMesh(kind):
// Ursprung unten Mitte, +Y oben (Bürste längs +Z). ITEM_LOOK (Grafik) ersetzt die Platzhalter aus ITEM_MESH.
const ITEM_ORDER = ['roll', 'cushion', 'dildo', 'pizza', 'brush', 'dryer'];
const ITEM_DEF = {
  roll: { name: 'KLOROLLE', r: 0.055, h: CELL }, cushion: { name: 'FURZKISSEN', r: 0.04, h: 0.025 }, dildo: { name: 'SAUGNAPF-DILDO', r: 0.035, h: 0.17 },
  pizza: { name: 'PIZZAKARTON', r: 0.06, h: 0.012 }, brush: { name: 'KLOBÜRSTE', r: 0.03, h: 0.03 }, dryer: { name: 'FÖHN', r: 0.05, h: 0.07 },
};
const DILDO_V = Math.sqrt(2 * GRAV * 0.4), DILDO_BOOST = 2.2, DRYER_LIFT = 0.52, DRYER_R = 0.075;
const ITEM_MESH = {
  roll() { const g = new THREE.Group(); g.add(new THREE.Mesh(rollOneGeo, rollMat)); return g; },
  cushion() { const g = new THREE.Group(); const m = new THREE.Mesh(cushionGeo, MAT.cushion); m.position.y = 0.012; g.add(m); return g; },
  dildo() {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.012, 16), MAT.cushion); cup.position.y = 0.006; g.add(cup);
    const shaft = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.114, 6, 14), MAT.cushion); shaft.position.y = 0.091; g.add(shaft);
    return g;
  },
  pizza() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.24), MAT.cardboard); box.position.y = 0.006; g.add(box);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20).rotateX(-Math.PI / 2), MAT.nose); dot.position.y = 0.0125; g.add(dot);
    return g;
  },
  brush() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.27, 8).rotateX(Math.PI / 2), MAT.white); stick.position.set(0, 0.015, -0.045); g.add(stick);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.09, 10).rotateX(Math.PI / 2), MAT.hair); head.position.set(0, 0.015, 0.135); g.add(head);
    return g;
  },
  dryer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.06), MAT.robot); body.position.y = 0.0225; g.add(body);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.028, 14), MAT.metal); noz.position.y = 0.056; g.add(noz);
    return g;
  },
};
function itemMesh(kind) { return (typeof ITEM_LOOK !== 'undefined' && ITEM_LOOK[kind]) ? ITEM_LOOK[kind]() : ITEM_MESH[kind](); }
Level.inv = { roll: 0, cushion: 0, dildo: 0, pizza: 0, brush: 0, dryer: 0 }; Level.has = { roll: true };
Object.defineProperty(Level, 'rolls', { get() { return this.inv.roll; }, set(v) { this.inv.roll = v; } });
Object.defineProperty(Level, 'cushions', { get() { return this.inv.cushion; }, set(v) { this.inv.cushion = v; } });
const Items = {
  list: [], bodies: [], held: null,
  clear() { this.list = []; this.bodies = []; this.held = null; },
  // Gehaltenes Teil wegpacken (Sieg, Niederlage): zurück in den Vorrat
  stow() { const h = this.held; if (!h) return; this.held = null; scene.remove(h.g); Level.objs.splice(Level.objs.indexOf(h.g), 1); Level.inv[h.kind]++; },
  // Ist der Platz frei? (Punkte im Grundriss, Höhenbereich)
  free(pts, y0, y1) {
    const gp = Guenther.pos;
    for (const [x, z] of pts) {
      for (const s of solidsAll()) if (s.top > y0 + 0.004 && s.bottom < y1 - 0.004 && inSolid(s, x, z)) return false;
      if (Guenther.visible && Math.hypot(gp.x - x, gp.z - z) < GR + 0.03 && gp.y < y1 && gp.y + GH > y0) return false;
      if (Level.toilet && Math.hypot(Level.toilet.pos.x - x, Level.toilet.pos.z - z) < 0.09 && Math.abs(Level.toilet.pos.y - y0) < 0.2) return false;
    }
    return true;
  },
  // Dildo an Wand oder Möbelseite: klebt waagerecht als Trittstufe
  pegSpot(tip) {
    let bd = 0.1, bx = 0, bz = 0;
    for (const w of World.walls) {
      if (tip.y < w.y0 || tip.y > w.y1) continue;
      closestOnSeg(tip.x, tip.z, w.a[0], w.a[1], w.b[0], w.b[1], _c2); const d = Math.hypot(tip.x - _c2[0], tip.z - _c2[1]);
      if (d < bd && d > 1e-4) { bd = d; bx = _c2[0]; bz = _c2[1]; }
    }
    for (const s of solidsAll()) {
      if ((s.kind !== 'furn' && s.kind !== 'crate') || tip.y > s.top - 0.03 || tip.y < s.bottom + 0.03) continue;
      if (tip.x < s.min[0] - 0.1 || tip.x > s.max[0] + 0.1 || tip.z < s.min[1] - 0.1 || tip.z > s.max[1] + 0.1 || pip(tip.x, tip.z, s.poly)) continue;
      const d = closestOnPoly(tip.x, tip.z, s.poly, _c2);
      if (d < bd && d > 1e-4) { bd = d; bx = _c2[0]; bz = _c2[1]; }
    }
    if (bd >= 0.1) return null;
    const nx = (tip.x - bx) / bd, nz = (tip.z - bz) / bd, y = Math.max(Room.floorY + 0.06, Math.round(tip.y / 0.03) * 0.03);
    return { p: new V3(bx, y, bz), yaw: Math.atan2(nx, nz), peg: [nx, nz], ok: this.free([[bx + nx * 0.06, bz + nz * 0.06], [bx + nx * 0.15, bz + nz * 0.15]], y - 0.022, y + 0.022) };
  },
  // Wo käme das Teil hin? exact = Punkt liegt schon auf einer Fläche (PC-Maus)
  spot(kind, tip, dir, exact = false) {
    const sp = { kind, p: tip.clone(), yaw: 0, peg: null, ok: false }, fy = Room.floorY;
    if (kind === 'roll') { sp.p = exact ? rollCell(tip.x, tip.y, tip.z, true) : rollCell(tip.x, tip.y - CELL / 2, tip.z); sp.ok = rollValid(sp.p); return sp; }
    if (kind === 'pizza' || kind === 'brush') {
      const q = kind === 'pizza' ? CELL : CELL / 2, th = ITEM_DEF[kind].h;
      const x = kind === 'pizza' ? (Math.round(tip.x / CELL - 0.5) + 0.5) * CELL : Math.round(tip.x / 0.06) * 0.06, z = kind === 'pizza' ? (Math.round(tip.z / CELL - 0.5) + 0.5) * CELL : Math.round(tip.z / 0.06) * 0.06;
      let y = exact ? tip.y : fy + Math.max(1, Math.round((tip.y - fy) / q)) * q - th;
      const g = groundAt(x, z, y + 0.03, 0); if (isFinite(g.y) && g.y > y - 0.05 && g.y <= y + 0.03) y = g.y;
      sp.p.set(x, y, z); let pts;
      if (kind === 'pizza') pts = [[x, z], [x - 0.1, z - 0.1], [x + 0.1, z - 0.1], [x - 0.1, z + 0.1], [x + 0.1, z + 0.1]];
      else { sp.yaw = Math.round(Math.atan2(dir.x, dir.z) / (Math.PI / 4)) * (Math.PI / 4); const sx = Math.sin(sp.yaw), cz = Math.cos(sp.yaw); pts = [-0.17, -0.085, 0, 0.085, 0.17].map((t) => [x + sx * t, z + cz * t]); }
      sp.ok = this.free(pts, y + 0.002, y + th); return sp;
    }
    if (kind === 'dildo' && !exact) { const pg = this.pegSpot(tip); if (pg) return Object.assign(sp, pg); }
    const c = cushionSpot(Math.round(tip.x / 0.02) * 0.02, tip.y + (exact ? 0.01 : 0), Math.round(tip.z / 0.02) * 0.02);
    if (!c) return sp;
    sp.p = c.p; sp.ok = c.ok && (kind === 'cushion' || !this.list.some((it) => !it.s && it.pos.distanceTo(c.p) < 0.09));
    return sp;
  },
  place(kind, p, yaw = 0, peg = null) {
    if (kind === 'roll') return Rolls.add(p.x, p.z, p.y);
    if (kind === 'cushion') return Cushions.add(p);
    const g = itemMesh(kind); g.position.copy(p);
    const it = { kind, g, pos: p.clone(), yaw, peg, s: null, wob: 0, t: 0, steps: 0, fall: 0, grow: 0, q: new THREE.Quaternion() };
    if (peg) it.q.setFromUnitVectors(_yUp, new V3(peg[0], 0, peg[1])); else it.q.setFromAxisAngle(_yUp, yaw);
    g.quaternion.copy(it.q); g.scale.setScalar(0.01); addObj(g);
    if (kind === 'pizza') it.s = makeSolid('pizza', rectPoly(p.x, p.z, 0.12, 0.12, yaw), p.y + 0.012, p.y, { item: it });
    if (kind === 'brush') it.s = makeSolid('brush', rectPoly(p.x, p.z, 0.028, 0.18, yaw), p.y + 0.03, p.y, { item: it });
    if (peg) it.s = makeSolid('peg', rectPoly(p.x + peg[0] * 0.085, p.z + peg[1] * 0.085, 0.03, 0.085, yaw), p.y + 0.022, p.y - 0.022, { item: it });
    if (it.s) World.dyn.push(it.s);
    this.list.push(it); return it;
  },
  remove(it) {
    scene.remove(it.g); this.list.splice(this.list.indexOf(it), 1);
    const i = Level.objs.indexOf(it.g); if (i >= 0) Level.objs.splice(i, 1);
    if (it.s) World.dyn.splice(World.dyn.indexOf(it.s), 1);
  },
  // Nächstes gesetztes Teil (jede Sorte) an einem Punkt
  findAt(p, bd = 0.11) {
    let best = null;
    for (const r of Rolls.list) { const d = Math.hypot(r.pos.x - p.x, r.pos.y + CELL / 2 - p.y, r.pos.z - p.z); if (d < bd) { bd = d; best = { kind: 'roll', ref: r }; } }
    for (const c of Cushions.list) { const d = c.pos.distanceTo(p); if (d < bd) { bd = d; best = { kind: 'cushion', ref: c }; } }
    for (const it of this.list) {
      let d;
      if (it.s) { const dy = p.y - clamp(p.y, it.s.bottom, it.s.top); d = pip(p.x, p.z, it.s.poly) ? Math.abs(dy) : Math.hypot(closestOnPoly(p.x, p.z, it.s.poly, [0, 0]), dy); }
      else d = Math.hypot(it.pos.x - p.x, it.pos.y + clamp(p.y - it.pos.y, 0, ITEM_DEF[it.kind].h) - p.y, it.pos.z - p.z);
      if (d < bd) { bd = d; best = { kind: it.kind, ref: it }; }
    }
    return best;
  },
  take(f) { if (f.kind === 'roll') Rolls.remove(f.ref); else if (f.kind === 'cushion') Cushions.remove(f.ref); else this.remove(f.ref); },
  // Greifen: gesetztes Teil unter der Spitze, sonst eins aus dem Vorrat
  grab(tip) {
    const f = this.findAt(tip, 0.09); let kind;
    if (f) { kind = f.kind; this.take(f); }
    else { kind = Input.item; if (Level.inv[kind] <= 0) { Sound.denied(tip); return false; } Level.inv[kind]--; }
    this.held = { kind, g: addObj(itemMesh(kind)) }; this.carry(tip); Sound.grab(tip); return true;
  },
  carry(tip) { const h = this.held; if (h) h.g.position.set(tip.x, tip.y - ITEM_DEF[h.kind].h / 2, tip.z); },
  release(tip, vel) { const h = this.held; if (!h) return; this.held = null; this.carry.call({ held: h }, tip); this.drop(h.kind, h.g.position.clone(), vel, h.g); },
  // Fallendes Teil: Schwerkraft, prallt von Flächen/Wänden ab, bleibt liegen und wird dort zum normalen Teil
  drop(kind, pos, vel, g) {
    const d = ITEM_DEF[kind], v = vel.clone(); if (v.length() > 4) v.setLength(4);
    if (!g) { g = addObj(itemMesh(kind)); g.position.copy(pos); }
    const b = { kind, g, pos: pos.clone(), vel: v, r: d.r, h: d.h, age: 0, hits: 0, bonked: false, spin: new V3(rand(-5, 5), rand(-5, 5), rand(-5, 5)).multiplyScalar(Math.min(1.5, 0.3 + v.length() * 0.5)) };
    this.bodies.push(b); return b;
  },
  endBody(b, refund) {
    scene.remove(b.g); const i = Level.objs.indexOf(b.g); if (i >= 0) Level.objs.splice(i, 1);
    this.bodies.splice(this.bodies.indexOf(b), 1); if (refund) Level.inv[b.kind]++;
  },
  settle(b) {
    this.endBody(b, false); Sound.clack(b.pos, 0.15);
    if (b.kind === 'roll') { const r = Rolls.add(b.pos.x, b.pos.z, b.pos.y); r.grow = 1; r.g.scale.setScalar(1); return; }
    if (b.kind === 'cushion') { const c = cushionSpot(b.pos.x, b.pos.y + 0.01, b.pos.z); if (c && c.ok) Cushions.add(c.p); else Level.inv.cushion++; return; }
    const it = this.place(b.kind, b.pos, b.kind === 'brush' ? Math.atan2(b.vel.x, b.vel.z) || b.g.rotation.y : 0); it.grow = 1; it.g.scale.setScalar(1);
    if (b.kind === 'dildo') { it.wob = 1; Sound.plopp(b.pos); }
  },
  stepBody(b, dt) {
    const G = Guenther; b.age += dt;
    const n = Math.min(8, Math.max(1, Math.ceil(b.vel.length() * dt / 0.03))), h = dt / n;
    for (let i = 0; i < n; i++) {
      b.vel.y -= 6 * h;
      const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
      b.pos.x += b.vel.x * h; b.pos.z += b.vel.z * h;
      // Wände nie durchschlagen
      for (const w of World.walls) if (py + b.h > w.y0 && py < w.y1 && segCross(px, pz, b.pos.x, b.pos.z, w.a[0], w.a[1], w.b[0], w.b[1])) { b.pos.x = px; b.pos.z = pz; b.vel.x *= -0.4; b.vel.z *= -0.4; Sound.clack(b.pos); break; }
      const qx = b.pos.x, qz = b.pos.z;
      if (pushOut(b.pos, b.r, b.pos.y, b.pos.y + b.h)) {
        const nx = b.pos.x - qx, nz = b.pos.z - qz, l = Math.hypot(nx, nz);
        if (l > 1e-5) { const vn = (b.vel.x * nx + b.vel.z * nz) / l; if (vn < 0) { b.vel.x -= 1.4 * vn * nx / l; b.vel.z -= 1.4 * vn * nz / l; } }
      }
      b.pos.y += b.vel.y * h;
      if (b.vel.y > 0) for (const s of solidsAll()) if (s.bottom > py + b.h - 0.001 && s.bottom < b.pos.y + b.h && inSolid(s, b.pos.x, b.pos.z)) { b.pos.y = s.bottom - b.h; b.vel.y *= -0.3; }
      const sp = b.vel.length();
      // Sauger getroffen: betäubt
      if (Robot.obj && sp > 0.3 && b.pos.y < Room.floorY + 0.12 && Math.hypot(b.pos.x - Robot.pos.x, b.pos.z - Robot.pos.z) < Robot.R + b.r) { Robot.stun(4); b.vel.set(rand(-0.4, 0.4), 1, rand(-0.4, 0.4)); b.hits++; }
      // Günther getroffen: Beule, kein Tod
      if (!b.bonked && sp > 0.4 && G.visible && G.dead <= 0 && Math.hypot(b.pos.x - G.pos.x, b.pos.z - G.pos.z) < b.r + GR && b.pos.y < G.pos.y + GH && b.pos.y + b.h > G.pos.y + 0.03) {
        b.bonked = true; const ax = b.pos.x - G.pos.x, az = b.pos.z - G.pos.z, l = Math.hypot(ax, az) || 1;
        b.vel.set(ax / l * 0.6, 0.8, az / l * 0.6); G.bonk();
      }
      // Bier runterholen
      for (const be of Level.beers) if (!be.taken && sp > 0.4 && Math.hypot(be.base.x - b.pos.x, be.base.y - b.pos.y - b.h / 2, be.base.z - b.pos.z) < 0.07 + b.r * 0.5) {
        const gg = groundAt(be.base.x, be.base.z, be.base.y, 0);
        if (isFinite(gg.y) && be.base.y - gg.y > 0.12 && !(gg.src === 'floor' && Level.lava)) { be.base.y = gg.y + 0.05; popup(be.base.clone(), 'RUNTERGEHOLT', '#ffd23f', 0.03); Sound.plopp(be.base); G.say('beerDown'); }
      }
      const g = groundAt(b.pos.x, b.pos.z, Math.max(py, b.pos.y), Math.min(b.r, 0.03));
      if (b.vel.y <= 0 && b.pos.y <= g.y) {
        b.pos.y = g.y;
        if (g.src === 'floor' && Level.lava) {
          // In der Lava verbrennt es; der Vorrat kommt zurück (kein Soft-Lock), kostet aber Nerven = Blase
          Sound.sizzle(b.pos); Smoke.burst(b.pos, 0x333333, 12, 0.2, 0.02, 1, -0.05, 0.2, 0.03); popup(b.pos.clone().add(new V3(0, 0.12, 0)), 'VERKOHLT · PFAND ZURÜCK', '#ff7a2e', 0.03);
          Game.bladder = Math.min(0.99, Game.bladder + 0.02); G.say('burn'); this.endBody(b, true); return;
        }
        if (g.src?.kind === 'robot') { Robot.stun(4); b.vel.set(rand(-0.5, 0.5), 1.1, rand(-0.5, 0.5)); b.hits++; continue; }
        if (b.vel.y < -0.7 && b.hits < 3) { b.vel.y *= -0.3; b.vel.x *= 0.6; b.vel.z *= 0.6; b.hits++; b.spin.multiplyScalar(0.5); Sound.clack(b.pos, Math.min(0.3, sp * 0.1)); }
        else {
          b.vel.y = 0; const f = Math.max(0, 1 - 10 * h); b.vel.x *= f; b.vel.z *= f;
          if (Math.hypot(b.vel.x, b.vel.z) < 0.12 || b.age > 5) { this.settle(b); return; }
        }
      }
      if (b.pos.y < Room.floorY - 0.5 || b.age > 8) { this.endBody(b, true); return; }
    }
    b.g.position.copy(b.pos); b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
  },
  // Föhn unter dem Punkt? Dildo zum Abspringen?
  updraft(p) { for (const it of this.list) if (it.kind === 'dryer' && p.y > it.pos.y - 0.01 && p.y < it.pos.y + 0.75 && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < DRYER_R) return it; return null; },
  bumper(p) { for (const it of this.list) if (it.kind === 'dildo' && !it.peg && Math.abs(it.pos.y - p.y) < 0.05 && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < 0.06) return it; return null; },
  bounce(it) { it.wob = 1; Sound.boing(it.pos); Hands.buzzAll(0.4, 100); if (Math.random() < 0.6) Guenther.say('dildoJump', true); },
  stepOn(it) {
    it.wob = 1;
    if (it.kind === 'pizza') { Sound.crunch(it.pos); if (++it.steps >= 3 && it.fall <= 0) it.fall = 0.7; else if (it.steps === 1) Guenther.say('pizza'); }
    else if (it.steps++ === 0) Guenther.say(it.peg ? 'peg' : it.kind);
  },
  update(dt) {
    for (const it of [...this.list]) {
      it.t += dt; it.wob = Math.max(0, it.wob - dt * 1.2);
      if (it.grow < 1) { it.grow = Math.min(1, it.grow + dt * 6); it.g.scale.setScalar(1 + Math.sin(it.grow * Math.PI) * 0.15 - (1 - it.grow) * 0.9); }
      if (it.kind === 'dildo') { it.g.quaternion.copy(it.q); it.g.rotateX(Math.sin(it.t * 24) * 0.4 * it.wob); it.g.rotateZ(Math.cos(it.t * 19) * 0.25 * it.wob); }
      else if (it.kind === 'pizza') {
        it.g.position.y = it.pos.y - it.steps * 0.004 - it.wob * 0.004;
        if (it.fall > 0) { it.g.rotation.z = Math.sin(it.t * 50) * 0.05; if ((it.fall -= dt) <= 0) { Bits.burst(it.pos, 0xb08a5a, 14, 0.3, 0.008, 0.8, 1.5); popup(it.pos.clone().add(new V3(0, 0.08, 0)), 'MATSCH', '#ff7a2e', 0.03); Guenther.say('pizzaBreak', true); this.remove(it); } }
      } else if (it.kind === 'dryer') {
        if (Math.random() < dt * 25) Smoke.emit(it.pos.clone().add(new V3(rand(-0.03, 0.03), 0.07, rand(-0.03, 0.03))), new V3(0, rand(0.4, 0.7), 0), 0xfff0d0, 0.006, 0.8, 0, 0.01);
        if (it.t > 0.45) { it.t = 0; if (Guenther.pos.distanceTo(it.pos) < 1.2) Sound.blow(it.pos); }
      }
    }
    for (const b of [...this.bodies]) this.stepBody(b, dt);
    // Schelle: Hand schnell durch den Sauger ziehen
    if (Robot.obj && Robot.stunT <= 0.5) for (const h of Hands.list) if (h.src && h.vel.length() > 1.1 && h.pos.y < Room.floorY + 0.35 && Math.hypot(h.pos.x - Robot.pos.x, h.pos.z - Robot.pos.z) < Robot.R + 0.07) { Robot.slap(h.vel); Hands.buzz(h, 1, 150); }
  },
};

// ---------------------------------------------------------------- Level-Bau aus dem echten Raum
const LEVELS = [
  { name: 'Erstmal schiffen', target: 'crate', crates: 0, ledges: 1, rolls: 6, inv: {}, time: 150, tip: 'Rechter Abzug: Klorolle. Bau dem Punk ’ne Treppe aufs Klo.' },
  { name: 'Hoch die Tassen', target: 'furn', h: 0.7, crates: 1, ledges: 2, rolls: 12, inv: { cushion: 2 }, intro: 'cushion', time: 160, tip: 'Furzkissen (Griff-Taste): draufspringen = Raketenstart.' },
  { name: 'Fußbodenheizung', target: 'furn', h: 0.6, lava: true, crates: 2, ledges: 2, rolls: 10, inv: { cushion: 1, pizza: 8 }, intro: 'pizza', time: 170, tip: 'Pizzakarton: billige breite Brücke. Hält drei Tritte, dann Matsch.' },
  { name: 'Spießers Geheimnis', target: 'furn', h: 0.5, lava: true, crates: 2, ledges: 2, rolls: 14, inv: { cushion: 1, pizza: 3, dildo: 3 }, intro: 'dildo', time: 180, tip: 'Saugnapf-Dildo: am Boden = Weitsprung. An Wand oder Möbel geklatscht = Trittstufe.' },
  { name: 'Der Ordnungshüter', target: 'ledge', h: 0.9, robot: true, crates: 1, ledges: 2, rolls: 16, inv: { cushion: 2, dildo: 1 }, time: 170, tip: 'Der Sauger frisst Günther. Wirf ihm was auf den Deckel (Abzug halten, loslassen) oder gib ihm ’ne Schelle.' },
  { name: 'Scheißhausbesen', target: 'high', lava: true, crates: 2, ledges: 3, rolls: 14, inv: { cushion: 1, brush: 5, pizza: 3 }, intro: 'brush', time: 180, tip: 'Klobürste: schmaler Steg, drei Rollen lang, in Zeigerichtung.' },
  { name: 'Föhnfrisur', target: 'high', crates: 1, ledges: 2, rolls: 8, inv: { cushion: 1, dryer: 2, brush: 2 }, intro: 'dryer', time: 170, tip: 'Föhn: Aufwind. Günther schwebt einen halben Meter hoch.' },
  { name: 'Schwarzfahrer', target: 'furn', h: 0.8, lava: true, robot: true, crates: 2, ledges: 3, rolls: 18, inv: { cushion: 2, pizza: 4, dildo: 2 }, time: 190, tip: 'Der Sauger ist hitzefest: aufsteigen. Schelle = er fährt in Schlagrichtung.' },
  { name: 'Bezahlklo', target: 'high', pfand: 2, crates: 2, ledges: 3, rolls: 18, inv: { cushion: 2, dildo: 2, brush: 3, dryer: 1 }, time: 200, tip: 'Das Klo kostet. Erst zwei Dosen Pfand sammeln.' },
  { name: 'Endgegner Blase', target: 'high', lava: true, robot: true, pfand: 2, crates: 2, ledges: 3, rolls: 20, inv: { cushion: 2, pizza: 5, dildo: 2, brush: 3, dryer: 1 }, time: 210, tip: 'Alles auf einmal. Punk’s not dead, aber gleich nass.' },
];
function levelSpec(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1];
  const k = n - LEVELS.length;
  return { name: `Nachschlag ${k}`, target: pick(['furn', 'ledge', 'high']), h: rand(0.7, 1.3), lava: Math.random() < 0.6, robot: Math.random() < 0.5, pfand: Math.random() < 0.3 ? 2 : 0,
    crates: 2, ledges: 3, rolls: 18, inv: { cushion: 2, pizza: 4, dildo: 2, brush: 2, dryer: 1 }, time: Math.max(130, 190 - k * 8), tip: 'Jetzt wird’s eng. Wie in Günthers Lederhose.' };
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
  // Notnagel (winziges oder vollgestelltes Zimmer): irgendein freier Fleck im Raster, zur Not vor den Füßen
  for (let r = 0.3; r < 3; r += 0.15) for (let a = 0; a < 6.28; a += 0.5) {
    const x = o.x + Math.sin(fa + a) * r, z = o.z + Math.cos(fa + a) * r;
    if (Room.floorPoly && (!pip(x, z, Room.floorPoly) || closestOnPoly(x, z, Room.floorPoly, [0, 0]) < 0.12)) continue;
    if (solidsAll().some((s) => inSolid(s, x, z, 0.12))) continue;
    return new V3(x, Room.floorY, z);
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
  // Geometrien freigeben (pro Level neu gebaute sonst ein Leck; geteilte lädt three.js bei Bedarf einfach neu hoch)
  for (const o of Level.objs) { scene.remove(o); o.traverse((c) => c.geometry?.dispose()); }
  Level.objs = []; Level.beers = []; Level.avoid = []; Level.toilet = null;
  World.dyn = []; Rolls.clear(); Cushions.clear(); Items.clear(); Robot.clear(); Lava.clear();
}
// keep = dasselbe Level nochmal mit gleichem Aufbau (gleicher Zufalls-Startwert, gleicher Standort)
function buildLevel(n, keep = false) {
  clearLevel();
  if (Room.dirty) rebuildWorld();
  keep = keep && Level.n === n && !!Level.spec;
  if (!keep) {
    Level.spec = levelSpec(n); Level.seed = (Math.random() * 1e9) | 0;
    Level.origin.copy(Player.head).setY(Room.floorY);
    Level.fwd.copy(Player.fwd).setY(0); if (Level.fwd.lengthSq() < 1e-4) Level.fwd.set(0, 0, -1); Level.fwd.normalize();
  }
  const mr = Math.random; let sd = Level.seed >>> 0;
  Math.random = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  try { layoutLevel(n, Level.spec); } finally { Math.random = mr; }
}
function layoutLevel(n, spec) {
  Level.n = n; Level.lava = !!spec.lava;
  Level.avoid.push(Level.origin.clone());
  // Start
  const sp = freeFloorPoint(0.55, 0.95, 0.6, 0.25, 0.3);
  if (Level.lava) { const top = makeCrate(sp.x, sp.z, Math.atan2(Level.fwd.x, Level.fwd.z)); Level.spawn.set(sp.x, top, sp.z); }
  else { Level.spawn.copy(sp); Level.avoid.push(sp.clone()); }
  // Ziel
  let goal = null;
  // Möbel, über denen noch was hängt (Regalbrett überm Tisch), taugen nicht als Klo-Platz
  const placeOnFurn = (list) => { for (const s of list) { const p = spotOnTop(s, 0.09); if (p && !World.solids.some((o) => o !== s && o.bottom < p.y + 0.35 && o.top > p.y + 0.01 && inSolid(o, p.x, p.z, 0.06))) return p; } return null; };
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
  for (const k of ITEM_ORDER) Level.inv[k] = spec.inv?.[k] || 0;
  Level.rolls = spec.rolls + Math.ceil(Math.max(0, hgt) / CELL) + (Level.lava ? Math.ceil(dist / 0.24) : 0);
  for (const k of ITEM_ORDER) Level.has[k] = Level.inv[k] > 0;
  // Blasenzeit: der Spieler muss selbst durchs Zimmer laufen und sich bücken
  Level.time = spec.time + dist * 10 + Math.max(0, hgt) * 25;
  Level.need = Math.min(spec.pfand || 0, Level.beers.length);
  if (Level.lava) Lava.build();
  if (spec.robot) { const p = freeFloorPoint(1.0, 2.2, 1.6, Robot.R + 0.05, 0.5); Robot.spawn(p.x, p.z); }
}

// ---------------------------------------------------------------- Spielablauf
const Game = {
  state: 'idle', bladder: 0, beers: 0, score: 0, falls: 0, t: 0, warned: 0, peeT: 0, best: 0, rollsUsed: 0,
  bonus: 0, startAt: 1, save: { unlocked: 1 }, hintT: 0, stallT: 0, bestD: 99, walkHint: false, pfandT: 0,
  init() {
    try { this.best = +localStorage.getItem('guenther-best') || 0; } catch (e) { this.best = 0; }
    try { this.save = Object.assign({ unlocked: 1 }, JSON.parse(localStorage.getItem('guenther-save') || '{}')); } catch (e) { /* privat */ }
    this.startAt = this.save.unlocked;
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
  start(n, keep = false) {
    Setup.end(); Banner.hide();
    buildLevel(n, keep);
    this.state = 'play'; this.bladder = n === 1 ? 0.15 : 0.25; this.beers = 0; this.falls = 0; this.t = 0; this.warned = 0; this.rollsUsed = 0;
    this.bonus = 0; this.hintT = 6; this.stallT = 0; this.bestD = 99; this.walkHint = false; this.pfandT = 0;
    if (n > this.save.unlocked) { this.save.unlocked = n; try { localStorage.setItem('guenther-save', JSON.stringify(this.save)); } catch (e) { /* privat */ } }
    Guenther.deaths = 0; Guenther.seenFurn.clear();
    Input.setItem(Level.spec.intro || 'roll', true);
    Guenther.spawn(Level.spawn);
    Banner.show(`LEVEL ${n}: ${Level.spec.name.toUpperCase()}`, Level.spec.tip + '\nBring Günther zum goldenen Klo!', '#ffd23f', 5);
    Sound.levelUp(); Music.start(); Music.tempo = 132;
    setTimeout(() => Guenther.say('start', true), 1200);
    HUD.attach();
  },
  // Neustart mit gleichem Aufbau (Stick-Klick halten, PC: N; nach Sieg/Pleite: X)
  restart() { if (!Level.n) return; this.start(Level.n, true); setTimeout(() => Guenther.say('restart', true), 400); },
  onX() { if (this.state === 'fail' || this.state === 'done') this.restart(); },
  pickLevel(d) { this.startAt = clamp(this.startAt + d, 1, this.save.unlocked); Sound.select(); },
  // Aufs Klo gezeigt? Dann genau dorthin laufen
  snapTarget(p) { const T = Level.toilet; return T && Math.hypot(p.x - T.pos.x, p.z - T.pos.z) < 0.14 && Math.abs(p.y - T.pos.y) < 0.1 ? T.pos.clone() : p.clone(); },
  placeItem(sp) {
    const kind = sp.kind;
    if (!sp.ok) { Sound.denied(sp.p); if (Level.inv[kind] <= 0) { popup(sp.p.clone().add(new V3(0, 0.15, 0)), 'ALLE', '#ff6a4a', 0.03); Guenther.say('empty'); } return; }
    if (kind === 'roll') return this.placeRoll(sp.p, true);
    Level.inv[kind]--; Hands.buzz(Hands.right, 0.25, 40);
    if (kind === 'cushion') { Cushions.add(sp.p); Sound.fart(sp.p, 0.25, 1.6); return; }
    Items.place(kind, sp.p, sp.yaw, sp.peg); Sound.place(sp.p); if (kind === 'dildo') Sound.plopp(sp.p);
    if (Math.random() < 0.5) Guenther.say(kind);
  },
  // Kontext-Tipps: Level 1 erklärt Rolle und Laufen erst, wenn es hakt; später der Level-Tipp, wenn nichts vorangeht
  coach(dt) {
    const G = Guenther, T = Level.toilet; if (!T) return;
    const d = Math.hypot(G.pos.x - T.pos.x, G.pos.z - T.pos.z) + Math.abs(T.pos.y - G.pos.y) * 2;
    if (d < this.bestD - 0.1) { this.bestD = d; this.stallT = 0; } else this.stallT += dt;
    if ((this.hintT -= dt) > 0) return;
    let h = null;
    if (Level.n === 1 && this.rollsUsed === 0) h = ['KLOROLLE SETZEN', DESK.on ? 'Linksklick neben die Bierkiste mit dem Klo' : 'Rechte Hand neben die Bierkiste mit dem Klo halten, Abzug drücken'];
    else if (Level.n === 1 && !this.walkHint && this.stallT > 10) { this.walkHint = true; h = ['UND JETZT RAUF DA', DESK.on ? 'Pfeiltasten + Leertaste · oder F: hinlaufen lassen' : 'Linker Stick + X/A · oder linker Abzug: aufs Klo zeigen']; }
    else if (this.stallT > 40) { this.stallT = 15; h = ['TIPP', Level.spec.tip]; Guenther.say('hint', true); }
    if (h) { Banner.show(h[0], h[1], '#3fd2ff', 4); Sound.hint(); this.hintT = 14; }
  },
  onA() {
    if (this.state === 'intro' && Guenther.visible) this.start(this.startAt);
    else if (this.state === 'fail') this.start(Level.n, true);
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
    const f = Items.findAt(p);
    if (f && f.kind !== 'roll' && f.kind !== 'cushion') { Items.take(f); Level.inv[f.kind]++; Sound.remove(p); return; }
    if (!best) return;
    if (best.s) { Rolls.remove(best); Level.rolls++; } else { Cushions.remove(best); Level.cushions++; }
    Sound.remove(p);
  },
  update(dt) {
    if (this.state === 'intro') { Setup.update(dt); return; }
    if (this.state === 'play') {
      this.t += dt;
      if (this.t > 4) this.bladder += dt / (Level.time || Level.spec.time);
      this.coach(dt); this.pfandT -= dt;
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
          popup(b.g.position.clone().add(new V3(0, 0.05, 0)), '+100 PFAND', '#ffd23f', 0.03);
          if (Math.random() < 0.5) Guenther.say('beer', true);
        }
      }
      // Am Klo?
      const T = Level.toilet;
      if (T) {
        T.beam.material.uniforms.uT.value += dt; T.sign.position.y = 0.32 + Math.sin(this.t * 2) * 0.02;
        if (Guenther.onGround && Guenther.dead <= 0 && Math.hypot(Guenther.pos.x - T.pos.x, Guenther.pos.z - T.pos.z) < 0.075 && Math.abs(Guenther.pos.y - T.pos.y) < 0.06) {
          if (this.beers >= (Level.need || 0)) this.win();
          else if (this.pfandT <= 0) { this.pfandT = 6; Guenther.say('pfand', true); Banner.show('BEZAHLKLO', `Erst ${Level.need} Dosen Pfand sammeln (${this.beers}/${Level.need})`, '#ff7a2e', 3); Sound.denied(T.pos); }
        }
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
    Items.stow();
    this.state = 'pee'; this.peeT = 0; this.flushed = false;
    const G = Guenther, T = Level.toilet;
    G.frozen = true; G.target = null; G.pos.copy(T.pos).add(new V3(Math.sin(T.g.rotation.y), 0, Math.cos(T.g.rotation.y)).multiplyScalar(0.05));
    G.yaw = T.g.rotation.y + Math.PI; G.walkAmt = 0;
    G.say('win', true); Sound.pee(G.pos); Music.stop();
  },
  showResult() {
    const rollBonus = Level.rolls * 15, cushionBonus = Level.cushions * 40, bladderBonus = Math.round((1 - this.bladder) * 600);
    const pts = this.levelScore() + rollBonus + cushionBonus + bladderBonus + this.bonus;
    this.score += pts;
    const rating = bladderBonus > 250 && this.falls === 0 ? 3 : bladderBonus > 100 ? 2 : 1;
    if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('guenther-best', String(this.best)); } catch (e) { /* privat */ } }
    this.state = 'done';
    const verdict = ['', 'Knapp. Der Stiefel is feucht.', 'Paar Tropfen daneben. Punk halt.', 'Trocken geblieben. Fast schon spießig.'][rating];
    Banner.show('ERLEICHTERT!', `${'🧻'.repeat(rating)}${'·'.repeat(3 - rating)}  ${verdict}\nDosenpfand ${this.beers}×100 · Rest-Rollen +${rollBonus} · Kissen +${cushionBonus} · Blase +${bladderBonus}${this.bonus ? ' · Randale +' + this.bonus : ''}\nGesamt ${this.score} · Rekord ${this.best}\n${DESK.on ? 'Enter: nächstes Level · N: nochmal' : 'A: nächstes Level · X: nochmal'}`, '#7dff6a', 0);
  },
  fail() {
    Items.stow();
    this.state = 'fail'; Music.stop(); Sound.fail();
    Guenther.frozen = true; Guenther.say('fail', true);
    const p = Guenther.pos.clone();
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xffe14f, transparent: true, opacity: 0.75, shininess: 200 }));
    puddle.position.copy(p).y += 0.003; puddle.scale.setScalar(0.1); addObj(puddle);
    addFx(new THREE.Object3D(), 2, (o, k) => puddle.scale.setScalar(0.1 + k * 0.9));
    Banner.show('ZU SPÄT.', 'Günther hat sich eingenässt.\nPunk’s not dead. Aber die Hose.\n' + (DESK.on ? 'Enter' : 'A') + ': nochmal versuchen', '#ff7a2e', 0);
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
    addEventListener('keydown', (e) => {
      this.keys.add(e.code); if (e.code === 'Enter') Game.onA(); if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyN' && !e.repeat) { if (Game.state === 'play') Game.restart(); else Game.onX(); }
      if (Game.state === 'intro' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) Game.pickLevel(e.code === 'ArrowLeft' ? -1 : 1);
    });
    addEventListener('wheel', (e) => { this.wheel = Math.sign(e.deltaY); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    const cv = renderer.domElement;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => { this.drag = true; this.moved = 0; this.btn = e.button; this.downT = performance.now(); this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
    addEventListener('pointerup', (e) => { if (this.drag && this.moved < 5) this.clicks.push(e.button); this.drag = false; });
    addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.drag && !Items.held) { this.moved += Math.abs(e.movementX) + Math.abs(e.movementY); this.yaw -= e.movementX * 0.004; this.pitch = clamp(this.pitch - e.movementY * 0.004, -1.4, 1.2); }
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
    const hit = rayTops(ray.ray.origin, ray.ray.direction), play = Game.state === 'play';
    // Teile: 1–6 wählen, Mausrad blättert; Linksklick setzt, Linke Taste halten trägt (loslassen = fallen lassen), T wirft
    if (play) {
      ITEM_ORDER.forEach((kd, i) => { if (k.has('Digit' + (i + 1)) && Level.has[kd] && inp.item !== kd) inp.setItem(kd); });
      if (this.wheel) inp.cycle(this.wheel);
      inp.showLabel(null);
    }
    this.wheel = 0;
    const tDown = k.has('KeyT') && !this.tPrev; this.tPrev = k.has('KeyT');
    if (play && Items.held) {
      inp.hideGhost();
      const cp = ray.ray.origin.clone().addScaledVector(ray.ray.direction, this.carryD);
      const hv = this.carryP ? cp.clone().sub(this.carryP).divideScalar(Math.max(0.008, this.carryDt || 0.016)) : new V3();
      this.carryP = cp; Items.carry(cp);
      if (tDown) Items.release(cp, ray.ray.direction.clone().multiplyScalar(2.5).add(new V3(0, 1, 0)));
      else if (!this.drag) Items.release(cp, hv.multiplyScalar(0.5));
    } else if (play && hit) {
      const sp = Items.spot(inp.item, hit.point, ray.ray.direction, true);
      sp.ok = sp.ok && Level.inv[inp.item] > 0;
      inp.showGhost(sp.p, sp.ok, inp.item, sp.yaw, sp.peg);
      for (const b of this.clicks) { if (b === 0) Game.placeItem(sp); if (b === 2) Game.placeCushion(hit.point.clone().add(new V3(0, 0.01, 0))); }
      const grabAt = hit.point.clone().add(new V3(0, 0.03, 0));
      if ((this.drag && this.btn === 0 && this.moved < 5 && performance.now() - this.downT > 250) || tDown) {
        if (Items.grab(grabAt)) { this.moved = 99; this.carryD = clamp(hit.t - 0.06, 0.3, 2.5); this.carryP = null; if (tDown) Items.release(ray.ray.origin.clone().addScaledVector(ray.ray.direction, 0.4), ray.ray.direction.clone().multiplyScalar(2.5).add(new V3(0, 1, 0))); }
      }
      if (k.has('KeyE') && !this.ePrev) Game.removeAt(grabAt);
      if (k.has('KeyF') && !this.fPrev) Guenther.target = Game.snapTarget(hit.point);
      // G: dem Sauger unter dem Mauszeiger eine Schelle geben
      if (k.has('KeyG') && !this.gPrev && Robot.obj && Math.hypot(hit.point.x - Robot.pos.x, hit.point.z - Robot.pos.z) < Robot.R + 0.1) Robot.slap(f.clone().multiplyScalar(1.5));
    } else inp.hideGhost();
    this.gPrev = k.has('KeyG');
    this.ePrev = k.has('KeyE'); this.fPrev = k.has('KeyF');
    this.clicks.length = 0;
  },
  update(dt) {
    const k = this.keys, sp = 1.4 * dt; this.carryDt = dt;
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
// Fehlerprotokoll und Wegmarken, per USB auslesbar (localStorage 'guenther-err' / 'guenther-crumbs').
// Ein Fehler im Bild-Callback würde sonst die Schleife von three.js beenden: das Bild friert ein.
const Err = {
  list: [], seen: new Set(), crumbs: [], t0: Date.now(), renderFails: 0, lastFrame: 0, frames: 0,
  log(where, e) {
    const m = (where + ': ' + (e?.stack || e?.message || e)).slice(0, 700);
    if (this.seen.has(m)) return; this.seen.add(m);
    this.list.push({ t: new Date().toISOString(), m });
    try { localStorage.setItem('guenther-err', JSON.stringify(this.list.slice(-20))); } catch (x) { /* privat */ }
    console.error(m);
  },
  crumb(text) {
    this.crumbs.push([+((Date.now() - this.t0) / 1000).toFixed(1), text]);
    try { localStorage.setItem('guenther-crumbs', JSON.stringify(this.crumbs.slice(-60))); } catch (x) { /* privat */ }
  },
  // Tiefensensor macht Ärger → Sitzung beenden und beim nächsten Start ohne ihn
  depthOff(why) {
    this.crumb('depthOff: ' + why);
    try { localStorage.setItem('guenther-nodepth', '1'); } catch (x) { /* privat */ }
    document.getElementById('msg').textContent = 'Der Tiefensensor hat gesponnen und ist jetzt aus. Bitte nochmal „AR STARTEN“ drücken.';
    try { renderer.xr.getSession()?.end(); } catch (x) { /* schon zu */ }
  },
};
addEventListener('error', (e) => Err.log('window', e.error || e.message));
addEventListener('unhandledrejection', (e) => Err.log('promise', e.reason));
// Wachhund: läuft die AR-Sitzung, aber es kommen keine Bilder mehr, ist die Schleife gestorben
setInterval(() => {
  if (!renderer.xr.isPresenting || document.visibilityState !== 'visible' || !Err.lastFrame) return;
  if (performance.now() - Err.lastFrame > 2500) {
    Err.log('watchdog', 'keine Bilder seit ' + Math.round(performance.now() - Err.lastFrame) + ' ms');
    if (AR.hasDepth) Err.depthOff('Schleife steht'); else { Err.crumb('restart loop'); Err.lastFrame = performance.now(); renderer.setAnimationLoop(loop); }
  }
}, 1000);
function loop(t, frame) {
  Err.lastFrame = performance.now();
  if (frame && ++Err.frames === 1) Err.crumb('first frame');
  try { tick(t, frame); } catch (e) { Err.log('tick', e); }
  if (Game.state !== Err.state) { Err.state = Game.state; Err.crumb('state ' + Game.state + ' L' + Level.n); }
  try { renderer.render(scene, camera); Err.renderFails = 0; }
  catch (e) { Err.log('render', e); if (++Err.renderFails === 30 && renderer.xr.isPresenting && AR.hasDepth) Err.depthOff('render'); }
}
function tick(t, frame) {
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
    updateBoxes(frame, ref, dt);
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
    Items.update(dt);
    Lava.update(dt);
    edgeMat.opacity = 0.35 + 0.2 * Math.sin(t / 400);
  }
  Glow.update(dt); Smoke.update(dt); Bits.update(dt);
  Music.update();
  updateFx(dt);
  HUD.update(dt);
  Banner.update(dt);
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
      let session, noDepth = false;
      const q = new URLSearchParams(location.search);
      try { noDepth = q.has('nodepth') || (localStorage.getItem('guenther-nodepth') === '1' && !q.has('depth')); } catch (e) { /* privat */ }
      const opt = ['plane-detection'].concat(q.has('nomesh') ? [] : ['mesh-detection'], noDepth ? [] : ['depth-sensing']);
      Err.crumbs = []; Err.t0 = Date.now(); Err.frames = 0; Err.lastFrame = 0; Err.crumb('request ' + opt.join(','));
      try {
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'], optionalFeatures: opt,
          ...(noDepth ? {} : { depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: [] } }),
        });
      } catch (e) {
        Err.log('requestSession', e);
        session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection'] });
      }
      AR.begin(session);
      Err.crumb('session ' + AR.features.join(',') + ' depthUsage=' + session.depthUsage + ' fmt=' + session.depthDataFormat);
      session.addEventListener('end', () => {
        Err.crumb('session end, frames=' + Err.frames);
        for (const h of Hands.list) h.prev.length = 0;
        for (const k of ['trigT', 'cyc', 'rsT', 'exitT', 'aim']) if (k in Input) Input[k] = k === 'aim' ? null : 0;
        boxT = 0;
        Game.exit(); Setup.captureUsed = false; document.getElementById('ui').style.display = 'flex';
        Room.planes = []; Room.map.clear(); Room.boxes = []; Room.boxKey = ''; Room.haveReal = false; Room.fallback = false; Room.dirty = true; sessionTime = 0;
      });
      await renderer.xr.setSession(session);
      Err.crumb('setSession ok');
      document.getElementById('ui').style.display = 'none';
      sessionTime = 0; dumpT = 0;
      Game.intro();
    } catch (e) { Err.log('start', e); msg.textContent = 'Start fehlgeschlagen: ' + e.message; }
  };
}
renderer.setAnimationLoop(loop);
setup();
if (new URLSearchParams(location.search).has('desk')) { Sound.init(); Desk.start(); }

// Für automatisierte Tests
window.__g = { Err, AR, roomDump, renderer, scene, Game, Guenther, Level, Room, World, Rolls, Cushions, Robot, Input, Player, Desk, THREE, rollCell, rollValid, groundAt, buildLevel, Items, ITEM_DEF, ITEM_ORDER, itemMesh, Hands, tick, LINES, LEVELS };
