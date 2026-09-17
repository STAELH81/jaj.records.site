// AQ-Player Phase 6B final — SVG procedural visualizer.
// Old-school math only: sin/cos, polar curves, FFT, trails, glow and randomized mutation.

const STORAGE_KEY = 'aquerty_visualizer_v1';

const PRESETS = [
  { id: 'lissajous', fr: 'Réacteur Lissajous', en: 'Lissajous Reactor' },
  { id: 'spiral', fr: 'Floraison spirale', en: 'Spiral Bloom' },
  { id: 'tunnel', fr: 'Tunnel plasma', en: 'Plasma Tunnel' },
  { id: 'halo', fr: 'Halo FFT', en: 'FFT Halo' },
  { id: 'flower', fr: 'Fleur à traînées', en: 'Feedback Flower' },
  { id: 'mesh', fr: 'Maillage électrique', en: 'Electric Mesh' },
  { id: 'orbital', fr: 'Oscilloscope orbital', en: 'Orbital Scope' },
  { id: 'chaos', fr: 'Jardin chaotique', en: 'Chaos Garden' }
];

const THEME_HUES = {
  classic: 195,
  dark: 190,
  rose: 325,
  lime: 105,
  silver: 205,
  violet: 272
};

const V = {
  view: null,
  stage: null,
  svg: null,
  scene: null,
  main: null,
  trails: null,
  glowBlur: null,
  preset: 0,
  auto: true,
  reactive: true,
  feedback: true,
  audio: null,
  audioCtx: null,
  analyser: null,
  source: null,
  freq: null,
  wave: null,
  p: null,
  target: null,
  hue: 195,
  lastMutation: 0,
  autoMutationCount: 0,
  history: [],
  raf: 0,
  lastFrame: 0,
  beat: 0,
  beatFloor: .12,
  lastBeat: 0,
  energy: { bass: .2, mids: .14, highs: .1, level: .14 }
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const isEnglish = () => document.documentElement.lang === 'en';
const tr = (fr, en) => isEnglish() ? en : fr;
const presetName = (preset = PRESETS[V.preset]) => isEnglish() ? preset.en : preset.fr;

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    V.preset = clamp(Number.isInteger(saved.preset) ? saved.preset : 0, 0, PRESETS.length - 1);
    V.auto = saved.auto !== false;
    V.reactive = saved.reactive !== false;
    V.feedback = saved.feedback !== false;
  } catch (_) {}
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      preset: V.preset,
      auto: V.auto,
      reactive: V.reactive,
      feedback: V.feedback
    }));
    window.dispatchEvent(new CustomEvent('aq:persistence-changed', {
      detail: { kind: 'visualizer-preferences', at: Date.now() }
    }));
  } catch (_) {}
}

function themeHue(themeId = null) {
  const win = document.getElementById('win-player');
  const id = themeId || win?.dataset.aqPlayerTheme || 'classic';
  return THEME_HUES[id] ?? 195;
}

function newParams() {
  return {
    a: rand(1.6, 6.8),
    b: rand(2.1, 9.2),
    c: rand(.4, 3.7),
    d: rand(.3, 2.9),
    petals: randInt(3, 11),
    arms: randInt(3, 8),
    spin: rand(-.4, .4),
    speed: rand(.08, .35),
    warp: rand(.55, 2.3),
    zoom: rand(.94, 1.08),
    glow: rand(4, 11),
    thick: rand(.8, 1.9),
    mesh: randInt(18, 34)
  };
}

function mutate(hard = false, fromAuto = false) {
  V.target = newParams();
  const base = themeHue();
  V.hue = (base + rand(-55, 115) + 360) % 360;
  V.lastMutation = performance.now();
  V.history.length = 0;
  if (hard || !V.p) V.p = { ...V.target };

  if (fromAuto) {
    V.autoMutationCount += 1;
    // Every fourth automatic mutation, switch to another preset like old media players did.
    if (V.autoMutationCount % 4 === 0) {
      let next = V.preset;
      while (next === V.preset && PRESETS.length > 1) next = randInt(0, PRESETS.length - 1);
      setPreset(next, { mutateNow: false, persist: true });
    }
  }
  updateStatus();
}

function smoothParams() {
  if (!V.p || !V.target) return;
  for (const key of Object.keys(V.p)) {
    if (typeof V.p[key] === 'number') V.p[key] = lerp(V.p[key], V.target[key], .009);
  }
}

function average(data, start, end) {
  if (!data?.length) return 0;
  start = clamp(Math.floor(start), 0, data.length - 1);
  end = clamp(Math.floor(end), start + 1, data.length);
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i];
  return sum / Math.max(1, end - start) / 255;
}

function ensureAudio() {
  if (V.analyser) return;
  V.audio = document.getElementById('audio-player');
  if (!V.audio) return;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    V.audioCtx = new AC();
    V.analyser = V.audioCtx.createAnalyser();
    V.analyser.fftSize = 1024;
    V.analyser.smoothingTimeConstant = .82;
    V.source = V.audioCtx.createMediaElementSource(V.audio);
    V.source.connect(V.analyser);
    V.analyser.connect(V.audioCtx.destination);
    V.freq = new Uint8Array(V.analyser.frequencyBinCount);
    V.wave = new Uint8Array(V.analyser.fftSize);

    const resume = () => {
      if (V.audioCtx?.state === 'suspended') V.audioCtx.resume().catch(() => {});
    };

    V.audio.addEventListener('play', () => {
      resume();
      if ((V.audio.currentTime || 0) < .5) mutate(false, false);
    });
    V.audio.addEventListener('loadedmetadata', () => {
      if (V.auto) mutate(false, false);
    });
    document.addEventListener('pointerdown', resume, { passive: true });
  } catch (error) {
    console.warn('[AQ Visualizer] Web Audio unavailable, idle math stays active.', error);
    V.analyser = null;
  }
}

function updateEnergy(t, ts) {
  let bassRaw = 0;
  if (V.reactive && V.analyser && V.freq && V.wave) {
    V.analyser.getByteFrequencyData(V.freq);
    V.analyser.getByteTimeDomainData(V.wave);
    bassRaw = average(V.freq, 0, 28);
    const midsRaw = average(V.freq, 28, 130);
    const highsRaw = average(V.freq, 130, Math.min(420, V.freq.length));
    V.energy.bass = lerp(V.energy.bass, bassRaw, .28);
    V.energy.mids = lerp(V.energy.mids, midsRaw, .23);
    V.energy.highs = lerp(V.energy.highs, highsRaw, .21);

    V.beatFloor = lerp(V.beatFloor, bassRaw, .045);
    if (bassRaw > Math.max(.18, V.beatFloor * 1.38) && ts - V.lastBeat > 170) {
      V.beat = 1;
      V.lastBeat = ts;
    }
  } else {
    const idle = .2 + Math.sin(t * 1.7) * .055;
    V.energy.bass = lerp(V.energy.bass, idle, .08);
    V.energy.mids = lerp(V.energy.mids, idle * .75, .08);
    V.energy.highs = lerp(V.energy.highs, idle * .52, .08);
    V.beat = Math.max(V.beat, Math.max(0, Math.sin(t * 2.1)) * .08);
  }
  V.beat *= .86;
  V.energy.level = V.energy.bass * .45 + V.energy.mids * .35 + V.energy.highs * .2;
}

function hue(offset = 0, alpha = 1) {
  return `hsla(${(V.hue + offset + 360) % 360}, 100%, 68%, ${alpha})`;
}

function pathFrom(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function polarPath(cx, cy, radiusFn, count = 520, close = true) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = radiusFn(a, i);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pathFrom(pts) + (close ? ' Z' : '');
}

function shapePath(id, w, h, t, layer = 0) {
  const p = V.p;
  const e = V.energy;
  const cx = w / 2;
  const cy = h / 2;

  if (id === 'lissajous') {
    const pts = [];
    const rx = w * (.28 + e.bass * .1);
    const ry = h * (.31 + e.mids * .1);
    for (let i = 0; i <= 780; i++) {
      const u = i / 780 * Math.PI * 2;
      const A = p.a + Math.sin(t * .17) * .55;
      const B = p.b + Math.cos(t * .11) * .45;
      pts.push([
        cx + Math.sin(u * A + t * p.speed + layer * .16) * rx + Math.sin(u * (p.c + layer) + t * .7) * e.highs * 34,
        cy + Math.sin(u * B + Math.cos(t * .13) + layer * .2) * ry
      ]);
    }
    return pathFrom(pts);
  }

  if (id === 'spiral') {
    const pts = [];
    for (let i = 0; i < 1000; i++) {
      const a = i * .024;
      const rose = Math.sin(a * p.petals + t * .7) * (18 + e.mids * 52);
      const rr = 10 + a * 3.2 + rose + Math.sin(a * p.c - t) * (9 + e.highs * 9);
      const spin = a + t * p.spin;
      pts.push([cx + Math.cos(spin) * rr, cy + Math.sin(spin) * rr * .72]);
    }
    return pathFrom(pts);
  }

  if (id === 'halo') {
    return polarPath(cx, cy, (a, i) => {
      const idx = V.freq?.length ? Math.floor((i / 520) * Math.min(V.freq.length - 1, 360)) : 0;
      const amp = V.freq?.length ? V.freq[idx] / 255 : .25 + Math.sin(a * 7 + t) * .12;
      return Math.min(w, h) * .22 + amp * Math.min(w, h) * .24 + Math.sin(a * p.petals + t) * (7 + e.mids * 10);
    });
  }

  if (id === 'flower') {
    return polarPath(cx, cy, (a) => Math.min(w, h) * (.19 + layer * .025) + Math.sin(a * (p.petals + layer * .45) + t * (.5 + layer * .05)) * (34 + e.bass * 62));
  }

  if (id === 'orbital') {
    return polarPath(cx, cy, (a, i) => {
      const idx = V.wave?.length ? Math.floor((i / 520) * (V.wave.length - 1)) : 0;
      const sample = V.wave?.length ? (V.wave[idx] - 128) / 128 : Math.sin(a * 5 + t) * .2;
      return Math.min(w, h) * (.15 + layer * .05) + sample * (22 + layer * 8) + Math.sin(a * p.a + t) * e.bass * 18;
    });
  }

  if (id === 'chaos') {
    const pts = [];
    for (let i = 0; i <= 620; i++) {
      const u = i / 620 * Math.PI * 2;
      const rr = Math.min(w, h) * (.17 + layer * .018)
        + Math.sin(u * (p.petals + layer) + t * .7) * (25 + e.bass * 58)
        + Math.cos(u * p.c - t * .9) * (10 + e.mids * 28);
      pts.push([
        cx + Math.cos(u * p.a + t * p.spin + layer) * rr,
        cy + Math.sin(u * p.b - t * p.speed + layer * .5) * rr * .67
      ]);
    }
    return pathFrom(pts);
  }

  return '';
}

function svgPath(d, opacity = .8, colorOffset = 0, width = 1.2, extra = '') {
  return `<path d="${d}" fill="none" stroke="${hue(colorOffset, opacity)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" filter="url(#aqGlow)" style="mix-blend-mode:screen" ${extra}/>`;
}

function drawTunnel(w, h, t) {
  const cx = w / 2;
  const cy = h / 2;
  let out = '';
  for (let ring = 0; ring < 22; ring++) {
    const z = ((ring / 22) + t * (.055 + V.energy.mids * .018)) % 1;
    const base = 12 + z * Math.min(w, h) * .62;
    const ox = Math.sin(t * .41 + ring * .37) * (22 + V.energy.highs * 20) * (1 - z);
    const oy = Math.cos(t * .33 + ring * .31) * (18 + V.energy.mids * 16) * (1 - z);
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const a = i / 100 * Math.PI * 2;
      const rr = base + Math.sin(a * V.p.petals + t * V.p.warp + ring) * (3 + V.energy.bass * 20);
      pts.push([cx + ox + Math.cos(a + t * V.p.spin) * rr, cy + oy + Math.sin(a + t * V.p.spin) * rr * .58]);
    }
    out += svgPath(pathFrom(pts) + ' Z', .12 + (1 - z) * .65, ring * 7, .7 + (1 - z) * 1.25);
  }
  return out;
}

function drawMesh(w, h, t) {
  const step = Math.max(15, V.p.mesh);
  let out = '';
  for (let y = -step; y <= h + step; y += step) {
    const pts = [];
    for (let x = -step; x <= w + step; x += 8) {
      pts.push([
        x + Math.cos(y * .032 * V.p.c - t * .65 + x * .008) * (5 + V.energy.highs * 22),
        y + Math.sin(x * .025 * V.p.warp + t * .9 + y * .01) * (10 + V.energy.bass * 40)
      ]);
    }
    out += svgPath(pathFrom(pts), .23, -12, .72);
  }
  for (let x = -step; x <= w + step; x += step) {
    const pts = [];
    for (let y = -step; y <= h + step; y += 8) {
      pts.push([
        x + Math.sin(y * .026 * V.p.warp - t * .72 + x * .012) * (10 + V.energy.mids * 36),
        y + Math.cos(x * .029 * V.p.d + t * .54 + y * .01) * (5 + V.energy.highs * 20)
      ]);
    }
    out += svgPath(pathFrom(pts), .18, 52, .66);
  }
  return out;
}

function drawCurrent(w, h, t) {
  const id = PRESETS[V.preset].id;
  if (id === 'tunnel') {
    V.trails.innerHTML = '';
    return drawTunnel(w, h, t);
  }
  if (id === 'mesh') {
    V.trails.innerHTML = '';
    return drawMesh(w, h, t);
  }

  let out = '';
  const layers = id === 'flower' ? 5 : id === 'orbital' ? 4 : id === 'chaos' ? 6 : id === 'lissajous' ? 3 : 1;
  let primary = '';
  for (let layer = 0; layer < layers; layer++) {
    const d = shapePath(id, w, h, t, layer);
    if (!primary) primary = d;
    out += svgPath(d, .42 + Math.min(layer, 4) * .11, layer * 34, V.p.thick + layer * .08);
  }

  if (V.feedback && primary) {
    V.history.unshift(primary);
    V.history = V.history.slice(0, 8);
    V.trails.innerHTML = V.history.slice(1).map((d, i) => {
      const opacity = Math.max(.025, .15 - i * .017);
      return svgPath(d, opacity, -25 - i * 8, .72, `transform="translate(${(i + 1) * .7} ${(i + 1) * .4}) scale(${1 + i * .0025})"`);
    }).join('');
  } else {
    V.trails.innerHTML = '';
  }
  return out;
}

function updateStatus() {
  const status = document.getElementById('aqmp-visual-status');
  if (!status) return;
  const fft = V.reactive ? tr('FFT ACTIF', 'FFT ON') : tr('FFT COUPÉE', 'FFT OFF');
  const mode = V.auto ? tr('MUTATION AUTO', 'AUTO MUTATE') : tr('MANUEL', 'MANUAL');
  status.textContent = `${presetName()} // ${mode} // ${fft}`;
}

function rebuildPresetOptions() {
  const select = document.getElementById('aqmp-visual-preset');
  if (!select) return;
  const current = V.preset;
  select.innerHTML = '';
  PRESETS.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${String(index + 1).padStart(2, '0')} // ${presetName(preset)}`;
    select.appendChild(option);
  });
  select.value = String(current);
}

function refreshLabels() {
  rebuildPresetOptions();
  const label = document.getElementById('aqmp-vis-preset-label');
  const mutateBtn = document.getElementById('aqmp-visual-mutate');
  const autoText = document.getElementById('aqmp-vis-auto-text');
  const fftText = document.getElementById('aqmp-vis-fft-text');
  const feedbackText = document.getElementById('aqmp-vis-feedback-text');
  const auto = document.getElementById('aqmp-visual-auto');
  const fft = document.getElementById('aqmp-visual-audio');
  const feedback = document.getElementById('aqmp-visual-feedback');

  if (label) label.textContent = tr('PRÉRÉGLAGE', 'PRESET');
  if (mutateBtn) {
    mutateBtn.textContent = tr('VARIER', 'MUTATE');
    mutateBtn.title = tr('Randomiser immédiatement les paramètres du motif', 'Randomize the pattern parameters now');
  }
  if (autoText) autoText.textContent = 'AUTO';
  if (fftText) fftText.textContent = 'FFT';
  if (feedbackText) feedbackText.textContent = tr('TRACES', 'TRAILS');
  if (auto) auto.title = tr('Mutation automatique et changement occasionnel de préréglage', 'Automatic mutation and occasional preset cycling');
  if (fft) fft.title = tr('Réagir au son en temps réel', 'React to audio in real time');
  if (feedback) feedback.title = tr('Conserver des traînées des images précédentes', 'Keep trails from previous frames');
  updateStatus();
}

function setPreset(index, options = {}) {
  const { mutateNow = true, persist = true } = options;
  V.preset = ((index % PRESETS.length) + PRESETS.length) % PRESETS.length;
  const select = document.getElementById('aqmp-visual-preset');
  if (select) select.value = String(V.preset);
  V.history.length = 0;
  if (mutateNow) mutate(true, false);
  if (persist) savePreferences();
  updateStatus();
}

function frame(ts) {
  V.raf = requestAnimationFrame(frame);
  if (!V.view?.classList.contains('active') || !V.stage || !V.svg) return;
  if (ts - V.lastFrame < 28) return; // ~35 fps, authentic and lighter on CPU.
  V.lastFrame = ts;

  const rect = V.stage.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width || 640));
  const h = Math.max(160, Math.round(rect.height || 360));
  V.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const t = ts * .001;
  if (V.auto && ts - V.lastMutation > 11000) mutate(false, true);
  smoothParams();
  updateEnergy(t, ts);
  V.hue = (V.hue + .018 + V.energy.highs * .11) % 360;

  if (V.target) {
    V.target.a += Math.sin(t * .17) * .0007;
    V.target.b += Math.cos(t * .11) * .0008;
    V.target.spin += Math.sin(t * .07) * .000015;
  }

  try {
    V.main.innerHTML = drawCurrent(w, h, t);
  } catch (error) {
    console.error('[AQ Visualizer] frame error', error);
    const pts = [];
    for (let x = 0; x <= w; x += 5) pts.push([x, h / 2 + Math.sin(x * .035 + t * 3) * h * .18]);
    V.main.innerHTML = svgPath(pathFrom(pts), .95, 0, 1.5);
  }

  const scale = 1 + V.energy.bass * .025 + V.beat * .045;
  if (V.scene) V.scene.setAttribute('transform', `translate(${w / 2} ${h / 2}) scale(${scale.toFixed(4)}) translate(${-w / 2} ${-h / 2})`);
  if (V.glowBlur) V.glowBlur.setAttribute('stdDeviation', String((2.4 + V.energy.level * 3.8 + V.beat * 2.2).toFixed(2)));

  const meter = document.getElementById('aqmp-visual-meter-fill');
  if (meter) meter.style.width = `${clamp(V.energy.level * 125, 4, 100)}%`;
}

function install(view) {
  if (!view || view.dataset.visualSvg === '1') return false;
  view.dataset.visualSvg = '1';
  view.innerHTML = `
    <div id="aqmp-visual-stage">
      <svg id="aqmp-visual-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-label="${tr('Visualiseur procédural AQ-Player', 'AQ-Player procedural visualizer')}">
        <defs>
          <filter id="aqGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur id="aqGlowBlur" stdDeviation="3.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="#00030b"/>
        <g id="aqmp-visual-scene">
          <g id="aqmp-visual-trails"></g>
          <g id="aqmp-visual-main"></g>
        </g>
      </svg>
      <div id="aqmp-visual-scanlines" aria-hidden="true"></div>
    </div>
    <div id="aqmp-visual-controls">
      <span class="aqmp-vis-label" id="aqmp-vis-preset-label"></span>
      <select id="aqmp-visual-preset"></select>
      <button type="button" id="aqmp-visual-prev" class="aqmp-vis-btn" title="${tr('Préréglage précédent', 'Previous preset')}">◀</button>
      <button type="button" id="aqmp-visual-next" class="aqmp-vis-btn" title="${tr('Préréglage suivant', 'Next preset')}">▶</button>
      <button type="button" id="aqmp-visual-mutate" class="aqmp-vis-btn"></button>
      <label><input id="aqmp-visual-auto" type="checkbox"> <span id="aqmp-vis-auto-text"></span></label>
      <label><input id="aqmp-visual-audio" type="checkbox"> <span id="aqmp-vis-fft-text"></span></label>
      <label><input id="aqmp-visual-feedback" type="checkbox"> <span id="aqmp-vis-feedback-text"></span></label>
      <div id="aqmp-visual-meter"><div id="aqmp-visual-meter-fill"></div></div>
      <span id="aqmp-visual-status"></span>
    </div>`;

  if (!document.getElementById('aqmp-visual-svg-styles')) {
    const style = document.createElement('style');
    style.id = 'aqmp-visual-svg-styles';
    style.textContent = `
      #aqmp-visual-view{width:100%!important;align-self:stretch!important;align-items:stretch!important;justify-content:stretch!important;flex-direction:column!important;background:#00030b!important}
      #aqmp-visual-stage{position:relative;width:100%;flex:1 1 auto;min-height:160px;overflow:hidden;background:#00030b;border-bottom:1px solid var(--aqp-border,#486785)}
      #aqmp-visual-svg{position:absolute;inset:0;width:100%;height:100%;display:block;background:#00030b}
      #aqmp-visual-scanlines{position:absolute;inset:0;pointer-events:none;opacity:.1;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.22) 0,rgba(255,255,255,.22) 1px,transparent 1px,transparent 3px);mix-blend-mode:screen}
      #aqmp-visual-controls{width:100%;flex:0 0 40px;display:flex;align-items:center;gap:5px;padding:5px 7px;box-sizing:border-box;background:var(--aqp-bottom,linear-gradient(to bottom,#c8d8e7,#6e8eab 48%,#456985 52%,#9bb5ca));color:var(--aqp-text,#0b3158);font:8px Tahoma,sans-serif;white-space:nowrap}
      #aqmp-visual-controls select{height:22px;max-width:175px;border:1px solid var(--aqp-border,#5d7b99);background:var(--aqp-panel,#f4f8fb);color:var(--aqp-text,#0c3158);font:9px Tahoma,sans-serif}
      .aqmp-vis-label{font-weight:bold}.aqmp-vis-btn{height:22px;padding:0 7px;border:1px solid var(--aqp-border,#607f9e);border-radius:8px;background:var(--aqp-button,linear-gradient(to bottom,#fff,#d7e5ef 45%,#7297b8 52%,#eef5fa));color:var(--aqp-text,#0d355e);font:bold 8px Tahoma,sans-serif;cursor:pointer}
      #aqmp-visual-controls label{display:flex;align-items:center;gap:2px;cursor:pointer}#aqmp-visual-meter{flex:1 1 60px;min-width:45px;max-width:110px;height:7px;overflow:hidden;border:1px inset var(--aqp-border,#c7d8e7);border-radius:5px;background:#102136}#aqmp-visual-meter-fill{width:4%;height:100%;background:linear-gradient(to right,#4ba51f,#b7ef65,#e9ff8b);box-shadow:0 0 5px #b8ff72}#aqmp-visual-status{overflow:hidden;max-width:220px;text-overflow:ellipsis;color:var(--aqp-text,#08294d);font-weight:bold}
      @media(max-width:840px){#aqmp-visual-controls label,#aqmp-visual-status{display:none}#aqmp-visual-controls select{max-width:130px}}
    `;
    document.head.appendChild(style);
  }

  V.view = view;
  V.stage = document.getElementById('aqmp-visual-stage');
  V.svg = document.getElementById('aqmp-visual-svg');
  V.scene = document.getElementById('aqmp-visual-scene');
  V.main = document.getElementById('aqmp-visual-main');
  V.trails = document.getElementById('aqmp-visual-trails');
  V.glowBlur = document.getElementById('aqGlowBlur');

  const select = document.getElementById('aqmp-visual-preset');
  select.addEventListener('change', () => setPreset(Number(select.value), { persist: true }));
  document.getElementById('aqmp-visual-prev').addEventListener('click', () => setPreset(V.preset - 1));
  document.getElementById('aqmp-visual-next').addEventListener('click', () => setPreset(V.preset + 1));
  document.getElementById('aqmp-visual-mutate').addEventListener('click', () => mutate(true, false));

  const auto = document.getElementById('aqmp-visual-auto');
  const audio = document.getElementById('aqmp-visual-audio');
  const feedback = document.getElementById('aqmp-visual-feedback');
  auto.checked = V.auto;
  audio.checked = V.reactive;
  feedback.checked = V.feedback;

  auto.addEventListener('change', e => { V.auto = e.target.checked; savePreferences(); updateStatus(); });
  audio.addEventListener('change', e => { V.reactive = e.target.checked; savePreferences(); updateStatus(); });
  feedback.addEventListener('change', e => { V.feedback = e.target.checked; V.history.length = 0; savePreferences(); });

  const observer = new MutationObserver(() => {
    if (view.classList.contains('active')) {
      ensureAudio();
      refreshLabels();
    }
  });
  observer.observe(view, { attributes: true, attributeFilter: ['class'] });

  ensureAudio();
  mutate(true, false);
  refreshLabels();
  if (!V.raf) V.raf = requestAnimationFrame(frame);
  return true;
}

function boot() {
  const view = document.getElementById('aqmp-visual-view');
  if (view) return install(view);
  return false;
}

loadPreferences();
if (!boot()) {
  const observer = new MutationObserver(() => {
    if (boot()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener('aq:language-changed', refreshLabels);
window.addEventListener('aq:player-theme-changed', event => {
  V.hue = themeHue(event.detail?.theme);
  mutate(false, false);
});

window.AQVisualizer = {
  presets: PRESETS.map(preset => ({ id: preset.id, name: presetName(preset) })),
  next: () => setPreset(V.preset + 1),
  previous: () => setPreset(V.preset - 1),
  mutate: () => mutate(true, false),
  setPreset,
  wake: ensureAudio,
  getPreset: () => ({ id: PRESETS[V.preset].id, name: presetName() }),
  getPreferences: () => ({ preset: V.preset, auto: V.auto, reactive: V.reactive, feedback: V.feedback })
};