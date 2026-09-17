// AQ-Player Phase 6B — procedural visualizer engine
// 100% canvas/Web Audio math: sin/cos, polar geometry, FFT, feedback and additive glow.

const PRESETS = [
    { id: 'lissajous', name: 'Lissajous Reactor' },
    { id: 'spiral', name: 'Spiral Bloom' },
    { id: 'tunnel', name: 'Plasma Tunnel' },
    { id: 'halo', name: 'FFT Halo' },
    { id: 'flower', name: 'Feedback Flower' },
    { id: 'mesh', name: 'Electric Mesh' },
    { id: 'orbital', name: 'Orbital Scope' },
    { id: 'chaos', name: 'Chaos Garden' }
];

const state = {
    ready: false,
    running: false,
    presetIndex: 0,
    autoMutate: true,
    audioReactive: true,
    feedback: true,
    canvas: null,
    ctx: null,
    feedbackCanvas: null,
    feedbackCtx: null,
    audio: null,
    audioCtx: null,
    analyser: null,
    source: null,
    freqData: null,
    waveData: null,
    resizeObserver: null,
    raf: 0,
    lastTs: 0,
    lastMutation: 0,
    mutationInterval: 11000,
    params: null,
    targets: null,
    hue: 195,
    energy: { bass: 0, mids: 0, highs: 0, level: 0 }
};

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function makeParams() {
    return {
        a: rand(1.4, 6.8),
        b: rand(2.1, 9.4),
        c: rand(0.35, 3.8),
        d: rand(0.25, 2.9),
        petals: randInt(3, 11),
        arms: randInt(3, 8),
        spin: rand(-0.42, 0.42),
        phaseSpeed: rand(0.08, 0.34),
        wobble: rand(0.15, 1.15),
        warp: rand(0.5, 2.4),
        zoom: rand(1.002, 1.016),
        feedbackRotation: rand(-0.009, 0.009),
        decay: rand(0.82, 0.94),
        glow: rand(9, 24),
        thickness: rand(0.8, 1.8),
        hueShift: rand(-35, 35),
        radial: rand(0.6, 1.5),
        meshStep: randInt(18, 34)
    };
}

function mutate(force = false) {
    state.targets = makeParams();
    state.hue = (state.hue + rand(24, 110)) % 360;
    state.lastMutation = performance.now();
    if (force || !state.params) state.params = { ...state.targets };
    updateStatus();
}

function smoothParams() {
    if (!state.params || !state.targets) return;
    Object.keys(state.params).forEach((key) => {
        if (typeof state.params[key] !== 'number') return;
        state.params[key] = lerp(state.params[key], state.targets[key], 0.008);
    });
}

function averageRange(data, start, end) {
    if (!data?.length) return 0;
    const a = clamp(Math.floor(start), 0, data.length - 1);
    const b = clamp(Math.floor(end), a + 1, data.length);
    let sum = 0;
    for (let i = a; i < b; i += 1) sum += data[i];
    return sum / Math.max(1, b - a) / 255;
}

function updateAudioEnergy() {
    const e = state.energy;
    if (!state.audioReactive || !state.analyser || !state.freqData || !state.waveData) {
        const idle = 0.18 + Math.sin(performance.now() * 0.0017) * 0.05;
        e.bass = lerp(e.bass, idle, 0.08);
        e.mids = lerp(e.mids, idle * 0.8, 0.08);
        e.highs = lerp(e.highs, idle * 0.6, 0.08);
        e.level = (e.bass + e.mids + e.highs) / 3;
        return;
    }

    state.analyser.getByteFrequencyData(state.freqData);
    state.analyser.getByteTimeDomainData(state.waveData);

    const bass = averageRange(state.freqData, 0, 28);
    const mids = averageRange(state.freqData, 28, 130);
    const highs = averageRange(state.freqData, 130, Math.min(420, state.freqData.length));

    e.bass = lerp(e.bass, bass, 0.24);
    e.mids = lerp(e.mids, mids, 0.22);
    e.highs = lerp(e.highs, highs, 0.2);
    e.level = (e.bass * 0.45) + (e.mids * 0.35) + (e.highs * 0.2);
}

function ensureAudioGraph() {
    if (state.analyser) return;
    const audio = document.getElementById('audio-player');
    if (!audio) return;
    state.audio = audio;

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        state.audioCtx = new AudioContextClass();
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 1024;
        state.analyser.smoothingTimeConstant = 0.82;
        state.source = state.audioCtx.createMediaElementSource(audio);
        state.source.connect(state.analyser);
        state.analyser.connect(state.audioCtx.destination);
        state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
        state.waveData = new Uint8Array(state.analyser.fftSize);

        const resume = () => {
            if (state.audioCtx?.state === 'suspended') state.audioCtx.resume().catch(() => {});
        };
        audio.addEventListener('play', resume);
        document.addEventListener('pointerdown', resume, { passive: true });
    } catch (error) {
        console.warn('[AQ Visualizer] Web Audio graph unavailable; idle procedural mode enabled.', error);
        state.analyser = null;
    }
}

function hsl(alpha = 1, offset = 0) {
    const hue = (state.hue + offset + 360) % 360;
    return `hsla(${hue}, 95%, 66%, ${alpha})`;
}

function setupStroke(ctx, alpha = 0.8, offset = 0, width = null) {
    ctx.strokeStyle = hsl(alpha, offset);
    ctx.lineWidth = width ?? state.params.thickness;
    ctx.shadowColor = hsl(0.95, offset);
    ctx.shadowBlur = state.params.glow + state.energy.bass * 28;
    ctx.globalCompositeOperation = 'lighter';
}

function clearOrFeedback(ctx, w, h) {
    if (!state.feedback) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00030b';
        ctx.fillRect(0, 0, w, h);
        return;
    }

    const fctx = state.feedbackCtx;
    if (!fctx) return;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, w, h);
    fctx.drawImage(state.canvas, 0, 0, w, h);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0, 3, 12, ${1 - state.params.decay})`;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = state.params.decay;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(state.params.feedbackRotation);
    ctx.scale(state.params.zoom, state.params.zoom);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(state.feedbackCanvas, 0, 0, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawLissajous(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * (0.28 + e.bass * 0.08);
    const ry = h * (0.3 + e.mids * 0.09);

    for (let layer = 0; layer < 3; layer += 1) {
        setupStroke(ctx, 0.5 + layer * 0.12, layer * 35);
        ctx.beginPath();
        for (let i = 0; i <= 900; i += 1) {
            const u = (i / 900) * Math.PI * 2;
            const wa = p.a + Math.sin(t * 0.17) * 0.55;
            const wb = p.b + Math.cos(t * 0.11) * 0.45;
            const x = cx + Math.sin(u * wa + t * p.phaseSpeed + layer * 0.18) * rx;
            const y = cy + Math.sin(u * wb + Math.cos(t * 0.13) + layer * 0.21) * ry;
            const bend = Math.sin(u * (p.c + layer) + t * 0.7) * e.highs * 26;
            if (i === 0) ctx.moveTo(x + bend, y); else ctx.lineTo(x + bend, y);
        }
        ctx.stroke();
    }
}

function drawSpiral(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    setupStroke(ctx, 0.8, 20, 1.15);
    ctx.beginPath();
    for (let i = 0; i < 1200; i += 1) {
        const a = i * 0.023;
        const rose = Math.sin(a * p.petals + t * 0.7) * (22 + e.mids * 46);
        const r = 14 + a * 3.7 + rose + Math.sin(a * p.c - t) * 10;
        const spin = a + t * p.spin;
        const x = cx + Math.cos(spin) * r * p.radial;
        const y = cy + Math.sin(spin) * r * 0.72;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawTunnel(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    const rings = 24;
    for (let r = 0; r < rings; r += 1) {
        const z = ((r / rings) + t * 0.055) % 1;
        const radius = 12 + z * Math.min(w, h) * 0.63;
        const ox = Math.sin(t * 0.41 + r * 0.37) * 22 * (1 - z);
        const oy = Math.cos(t * 0.33 + r * 0.31) * 18 * (1 - z);
        setupStroke(ctx, 0.12 + (1 - z) * 0.62, r * 7, 0.8 + (1 - z) * 1.4);
        ctx.beginPath();
        const pts = 90;
        for (let i = 0; i <= pts; i += 1) {
            const a = (i / pts) * Math.PI * 2;
            const wob = Math.sin(a * p.petals + t * p.warp + r) * (3 + e.bass * 16);
            const rr = radius + wob;
            const x = cx + ox + Math.cos(a + t * p.spin) * rr;
            const y = cy + oy + Math.sin(a + t * p.spin) * rr * 0.58;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

function drawHalo(ctx, w, h, t) {
    const cx = w / 2;
    const cy = h / 2;
    const data = state.freqData;
    const bins = data?.length ? Math.min(180, data.length) : 180;
    const base = Math.min(w, h) * 0.22;
    setupStroke(ctx, 0.86, 0, 1.1);
    ctx.beginPath();
    for (let i = 0; i <= bins; i += 1) {
        const idx = i % bins;
        const a = (idx / bins) * Math.PI * 2 - Math.PI / 2 + t * 0.05;
        const amp = data?.length ? data[Math.floor((idx / bins) * Math.min(data.length - 1, 360))] / 255 : 0.25 + Math.sin(a * 7 + t) * 0.12;
        const r = base + amp * Math.min(w, h) * 0.22 + Math.sin(a * state.params.petals + t) * 7;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    for (let k = 0; k < 2; k += 1) {
        setupStroke(ctx, 0.28, 55 + k * 40, 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, base * (0.72 + k * 0.34) + state.energy.bass * 18, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawFlower(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    for (let layer = 0; layer < 5; layer += 1) {
        setupStroke(ctx, 0.24 + layer * 0.11, layer * 26, 0.8);
        ctx.beginPath();
        for (let i = 0; i <= 720; i += 1) {
            const a = (i / 720) * Math.PI * 2;
            const petals = p.petals + layer * 0.5;
            const rr = Math.min(w, h) * (0.18 + layer * 0.035) + Math.sin(a * petals + t * (0.45 + layer * 0.04)) * (36 + e.bass * 54);
            const x = cx + Math.cos(a + t * p.spin) * rr;
            const y = cy + Math.sin(a + t * p.spin) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

function drawMesh(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const step = Math.max(14, p.meshStep);
    setupStroke(ctx, 0.24, -12, 0.7);
    for (let y = -step; y <= h + step; y += step) {
        ctx.beginPath();
        for (let x = -step; x <= w + step; x += 5) {
            const yy = y + Math.sin(x * 0.025 * p.warp + t * 0.9 + y * 0.01) * (10 + e.bass * 34);
            const xx = x + Math.cos(y * 0.032 * p.c - t * 0.65 + x * 0.008) * (5 + e.highs * 18);
            if (x === -step) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
    }
    setupStroke(ctx, 0.19, 52, 0.65);
    for (let x = -step; x <= w + step; x += step) {
        ctx.beginPath();
        for (let y = -step; y <= h + step; y += 5) {
            const xx = x + Math.sin(y * 0.026 * p.warp - t * 0.72 + x * 0.012) * (10 + e.mids * 30);
            const yy = y + Math.cos(x * 0.029 * p.d + t * 0.54 + y * 0.01) * (5 + e.highs * 16);
            if (y === -step) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
    }
}

function drawOrbital(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    const wave = state.waveData;

    for (let ring = 0; ring < 4; ring += 1) {
        setupStroke(ctx, 0.38 + ring * 0.1, ring * 38, 0.9);
        ctx.beginPath();
        const pts = 360;
        for (let i = 0; i <= pts; i += 1) {
            const a = (i / pts) * Math.PI * 2;
            const waveIndex = wave?.length ? Math.floor((i / pts) * (wave.length - 1)) : 0;
            const sample = wave?.length ? (wave[waveIndex] - 128) / 128 : Math.sin(a * 5 + t) * 0.2;
            const base = Math.min(w, h) * (0.12 + ring * 0.07);
            const rr = base + sample * (22 + ring * 7) + Math.sin(a * p.a + t * 0.8) * e.bass * 15;
            const x = cx + Math.cos(a + t * p.spin * (ring % 2 ? -1 : 1)) * rr * (1 + ring * 0.05);
            const y = cy + Math.sin(a + t * p.spin) * rr * (0.72 + ring * 0.04);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

function drawChaos(ctx, w, h, t) {
    const p = state.params;
    const e = state.energy;
    const cx = w / 2;
    const cy = h / 2;
    for (let layer = 0; layer < 6; layer += 1) {
        setupStroke(ctx, 0.18 + layer * 0.09, layer * 31, 0.65 + layer * 0.08);
        ctx.beginPath();
        for (let i = 0; i <= 620; i += 1) {
            const u = (i / 620) * Math.PI * 2;
            const r = Math.min(w, h) * (0.18 + layer * 0.018)
                + Math.sin(u * (p.petals + layer) + t * 0.7) * (28 + e.bass * 52)
                + Math.cos(u * p.c - t * 0.9) * (12 + e.mids * 24);
            const x = cx + Math.cos(u * p.a + t * p.spin + layer) * r;
            const y = cy + Math.sin(u * p.b - t * p.phaseSpeed + layer * 0.5) * r * 0.66;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}

const DRAWERS = {
    lissajous: drawLissajous,
    spiral: drawSpiral,
    tunnel: drawTunnel,
    halo: drawHalo,
    flower: drawFlower,
    mesh: drawMesh,
    orbital: drawOrbital,
    chaos: drawChaos
};

function resizeCanvas() {
    const canvas = state.canvas;
    const host = document.getElementById('aqmp-visual-stage');
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(2, Math.floor(rect.width * dpr));
    const height = Math.max(2, Math.floor(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    state.feedbackCanvas.width = width;
    state.feedbackCanvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.feedbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(ts) {
    state.raf = requestAnimationFrame(frame);
    if (!state.running || !state.ctx || !state.canvas) return;

    const rect = state.canvas.getBoundingClientRect();
    const w = Math.max(2, rect.width);
    const h = Math.max(2, rect.height);
    const t = ts * 0.001;

    if (state.autoMutate && ts - state.lastMutation > state.mutationInterval) mutate(false);
    smoothParams();
    updateAudioEnergy();

    // Tiny drift keeps every preset alive even with silent audio.
    state.targets.a += Math.sin(t * 0.17) * 0.0007;
    state.targets.b += Math.cos(t * 0.11) * 0.0008;
    state.targets.spin += Math.sin(t * 0.07) * 0.000015;

    clearOrFeedback(state.ctx, w, h);
    state.ctx.save();
    state.ctx.globalAlpha = 1;
    const preset = PRESETS[state.presetIndex];
    const draw = DRAWERS[preset.id] || drawLissajous;
    draw(state.ctx, w, h, t);
    state.ctx.restore();

    updateMeter();
}

function setPreset(index) {
    const safe = ((index % PRESETS.length) + PRESETS.length) % PRESETS.length;
    state.presetIndex = safe;
    const select = document.getElementById('aqmp-visual-preset');
    if (select) select.value = String(safe);
    mutate(true);
    updateStatus();
}

function updateMeter() {
    const meter = document.getElementById('aqmp-visual-meter-fill');
    if (meter) meter.style.width = `${clamp(state.energy.level * 100, 2, 100)}%`;
}

function updateStatus() {
    const label = document.getElementById('aqmp-visual-status');
    if (!label) return;
    const preset = PRESETS[state.presetIndex];
    label.textContent = `${preset.name} // ${state.autoMutate ? 'AUTO MUTATE' : 'MANUAL'} // ${state.audioReactive ? 'FFT ON' : 'FFT OFF'}`;
}

function installUI(view) {
    if (!view || document.getElementById('aqmp-visual-stage')) return;

    const oldField = view.querySelector('#aqmp-visual-field');
    const oldCopy = view.querySelector('#aqmp-visual-copy');
    oldField?.remove();
    oldCopy?.remove();

    view.innerHTML = `
        <div id="aqmp-visual-stage">
            <canvas id="aqmp-visual-canvas" aria-label="AQ-Player procedural visualizer"></canvas>
            <div id="aqmp-visual-scanlines" aria-hidden="true"></div>
        </div>
        <div id="aqmp-visual-controls">
            <span class="aqmp-vis-label">PRESET</span>
            <select id="aqmp-visual-preset"></select>
            <button type="button" id="aqmp-visual-prev" class="aqmp-vis-btn">◀</button>
            <button type="button" id="aqmp-visual-next" class="aqmp-vis-btn">▶</button>
            <button type="button" id="aqmp-visual-mutate" class="aqmp-vis-btn">MUTATE</button>
            <label><input id="aqmp-visual-auto" type="checkbox" checked> AUTO</label>
            <label><input id="aqmp-visual-audio" type="checkbox" checked> FFT</label>
            <label><input id="aqmp-visual-feedback" type="checkbox" checked> FEEDBACK</label>
            <div id="aqmp-visual-meter"><div id="aqmp-visual-meter-fill"></div></div>
            <span id="aqmp-visual-status"></span>
        </div>
    `;

    const style = document.createElement('style');
    style.id = 'aqmp-visualizer-6b-styles';
    style.textContent = `
        #aqmp-visual-view { flex-direction: column; background:#00030b !important; }
        #aqmp-visual-stage { position:relative; flex:1 1 auto; min-height:0; overflow:hidden; background:#00030b; border-bottom:1px solid #486785; }
        #aqmp-visual-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; background:#00030b; }
        #aqmp-visual-scanlines { position:absolute; inset:0; pointer-events:none; opacity:.12; background:repeating-linear-gradient(to bottom, rgba(255,255,255,.28) 0, rgba(255,255,255,.28) 1px, transparent 1px, transparent 3px); mix-blend-mode:screen; }
        #aqmp-visual-controls { flex:0 0 38px; display:flex; align-items:center; gap:5px; padding:5px 7px; box-sizing:border-box; background:linear-gradient(to bottom,#c8d8e7,#6e8eab 48%,#456985 52%,#9bb5ca); color:#0b3158; font:8px Tahoma,sans-serif; white-space:nowrap; }
        #aqmp-visual-controls select { height:22px; max-width:155px; border:1px solid #5d7b99; background:#f4f8fb; color:#0c3158; font:9px Tahoma,sans-serif; }
        .aqmp-vis-label { font-weight:bold; }
        .aqmp-vis-btn { height:22px; padding:0 7px; border:1px solid #607f9e; border-radius:8px; background:linear-gradient(to bottom,#fff,#d7e5ef 45%,#7297b8 52%,#eef5fa); color:#0d355e; font:bold 8px Tahoma,sans-serif; cursor:pointer; }
        .aqmp-vis-btn:active { transform:translateY(1px); }
        #aqmp-visual-controls label { display:flex; align-items:center; gap:2px; }
        #aqmp-visual-meter { flex:1 1 60px; min-width:45px; max-width:110px; height:7px; overflow:hidden; border:1px inset #c7d8e7; border-radius:5px; background:#102136; }
        #aqmp-visual-meter-fill { width:2%; height:100%; background:linear-gradient(to right,#4ba51f,#b7ef65,#e9ff8b); box-shadow:0 0 5px #b8ff72; }
        #aqmp-visual-status { overflow:hidden; max-width:175px; text-overflow:ellipsis; color:#08294d; font-weight:bold; }
        @media (max-width: 840px) { #aqmp-visual-controls label, #aqmp-visual-status { display:none; } #aqmp-visual-controls select { max-width:120px; } }
    `;
    document.head.appendChild(style);

    state.canvas = document.getElementById('aqmp-visual-canvas');
    state.ctx = state.canvas.getContext('2d', { alpha: false });
    state.feedbackCanvas = document.createElement('canvas');
    state.feedbackCtx = state.feedbackCanvas.getContext('2d');

    const select = document.getElementById('aqmp-visual-preset');
    PRESETS.forEach((preset, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${String(index + 1).padStart(2, '0')} // ${preset.name}`;
        select.appendChild(option);
    });
    select.value = String(state.presetIndex);
    select.addEventListener('change', () => setPreset(Number(select.value)));
    document.getElementById('aqmp-visual-prev').addEventListener('click', () => setPreset(state.presetIndex - 1));
    document.getElementById('aqmp-visual-next').addEventListener('click', () => setPreset(state.presetIndex + 1));
    document.getElementById('aqmp-visual-mutate').addEventListener('click', () => mutate(true));
    document.getElementById('aqmp-visual-auto').addEventListener('change', (event) => { state.autoMutate = event.target.checked; updateStatus(); });
    document.getElementById('aqmp-visual-audio').addEventListener('change', (event) => { state.audioReactive = event.target.checked; updateStatus(); });
    document.getElementById('aqmp-visual-feedback').addEventListener('change', (event) => { state.feedback = event.target.checked; });

    state.resizeObserver = new ResizeObserver(resizeCanvas);
    state.resizeObserver.observe(document.getElementById('aqmp-visual-stage'));
    resizeCanvas();
    ensureAudioGraph();
    mutate(true);
    state.ready = true;
    state.running = true;
    updateStatus();
    if (!state.raf) state.raf = requestAnimationFrame(frame);
}

function boot() {
    const view = document.getElementById('aqmp-visual-view');
    if (view) {
        installUI(view);
        return true;
    }
    return false;
}

if (!boot()) {
    const observer = new MutationObserver(() => {
        if (boot()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.AQVisualizer = {
    presets: PRESETS.map((preset) => ({ ...preset })),
    next: () => setPreset(state.presetIndex + 1),
    previous: () => setPreset(state.presetIndex - 1),
    mutate: () => mutate(true),
    setPreset,
    getPreset: () => PRESETS[state.presetIndex],
    setAutoMutate: (enabled) => { state.autoMutate = !!enabled; updateStatus(); },
    setAudioReactive: (enabled) => { state.audioReactive = !!enabled; updateStatus(); },
    setFeedback: (enabled) => { state.feedback = !!enabled; }
};
