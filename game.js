'use strict';

const CONFIG = {
  trackLengthM: 100,
  timerSec: 12,
  startCountdownSec: 3,

  impulsePerTapMS: 0.7,
  drag: 0.85,
  maxVelocity: 12,

  simultaneousWindowMs: 40,
  stunMs: 600,
  fallVelocityMultiplier: 0,

  maxRegisteredCps: 20,

  busStartZ: 100,
  busRetreatSpeed: 40, // m/s the bus pulls away at after timer expires
};

const BEST_KEY = 'lftb_best';
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

// ---------- DOM ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('title');
const resultEl = document.getElementById('result');
const hudEl = document.getElementById('hud');
const countdownEl = document.getElementById('countdown');
const debugEl = document.getElementById('debug');
const bestEl = document.getElementById('best');
const playBtn = document.getElementById('play');
const againBtn = document.getElementById('again');
const timerEl = document.getElementById('timer');
const tapeFillEl = document.getElementById('tape-fill');
const resultHead = document.getElementById('result-head');
const resultBody = document.getElementById('result-body');
const resultBest = document.getElementById('result-best');

// ---------- audio ----------
const MUTE_KEY = 'lftb_mute';
const muteBtn = document.getElementById('mute');
let audioCtx = null;
let masterGain = null;
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();

function setMuted(v) {
  muted = !!v;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', muted ? 'unmute' : 'mute');
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
}
setMuted(muted);

muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  ensureAudio();
  setMuted(!muted);
});

function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  } catch { audioCtx = null; }
  return audioCtx;
}

function aNow() { return audioCtx ? audioCtx.currentTime : 0; }

function playTap(cps, side) {
  if (muted) return;
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();
  const intensity = Math.min(1, cps / CONFIG.maxRegisteredCps);
  // L and R differ slightly so footsteps feel alternating
  const isLeft = side === 'L';
  // ---- low thud (heel impact) ----
  const thudFreq = (isLeft ? 95 : 110) + intensity * 25;
  const thud = ctxA.createOscillator();
  const tg = ctxA.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(thudFreq * 1.6, t);
  thud.frequency.exponentialRampToValueAtTime(thudFreq * 0.55, t + 0.08);
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  thud.connect(tg).connect(masterGain);
  thud.start(t);
  thud.stop(t + 0.13);
  // ---- noise scuff (shoe on pavement) ----
  const dur = 0.05;
  const bufSize = Math.floor(ctxA.sampleRate * dur);
  const buf = ctxA.createBuffer(1, bufSize, ctxA.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  }
  const src = ctxA.createBufferSource();
  src.buffer = buf;
  const filt = ctxA.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 600 + intensity * 500;
  const ng = ctxA.createGain();
  ng.gain.setValueAtTime(0.06 + intensity * 0.04, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(ng).connect(masterGain);
  src.start(t);
  src.stop(t + dur + 0.01);
}

function playFall() {
  if (muted) return;
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();

  // ---- vocal "ohh" — lower, softer, more "ugh" than scream ----
  const screamDur = 0.4;
  const fundamental = ctxA.createOscillator();
  fundamental.type = 'sawtooth';
  // start mid-low and bend down — no upward swoop
  fundamental.frequency.setValueAtTime(260, t);
  fundamental.frequency.exponentialRampToValueAtTime(110, t + screamDur);
  // gentle vibrato
  const vibrato = ctxA.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.value = 6;
  const vibratoGain = ctxA.createGain();
  vibratoGain.gain.value = 8;
  vibrato.connect(vibratoGain).connect(fundamental.frequency);

  // "OH" / "AW" vowel formants — warmer, less piercing than AH
  const makeFormant = (freq, q, gain) => {
    const f = ctxA.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctxA.createGain();
    g.gain.value = gain;
    f.connect(g);
    return { input: f, output: g };
  };
  const f1 = makeFormant(570, 5, 1.0);
  const f2 = makeFormant(840, 6, 0.5);
  // overall lowpass to kill any remaining harshness
  const tone = ctxA.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1400;
  tone.Q.value = 0.7;

  fundamental.connect(f1.input);
  fundamental.connect(f2.input);

  const screamGain = ctxA.createGain();
  screamGain.gain.setValueAtTime(0.0001, t);
  screamGain.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
  screamGain.gain.setValueAtTime(0.28, t + screamDur * 0.6);
  screamGain.gain.exponentialRampToValueAtTime(0.001, t + screamDur);

  f1.output.connect(tone);
  f2.output.connect(tone);
  tone.connect(screamGain).connect(masterGain);

  fundamental.start(t);
  vibrato.start(t);
  fundamental.stop(t + screamDur + 0.05);
  vibrato.stop(t + screamDur + 0.05);

  // ---- thump (body hitting pavement) just after scream peaks ----
  const thumpT = t + 0.05;
  const thump = ctxA.createOscillator();
  const thumpG = ctxA.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(180, thumpT);
  thump.frequency.exponentialRampToValueAtTime(45, thumpT + 0.18);
  thumpG.gain.setValueAtTime(0.0001, thumpT);
  thumpG.gain.exponentialRampToValueAtTime(0.5, thumpT + 0.005);
  thumpG.gain.exponentialRampToValueAtTime(0.001, thumpT + 0.25);
  thump.connect(thumpG).connect(masterGain);
  thump.start(thumpT);
  thump.stop(thumpT + 0.3);

  // ---- noise burst (skid / oof) ----
  const bufSize = Math.floor(ctxA.sampleRate * 0.25);
  const buf = ctxA.createBuffer(1, bufSize, ctxA.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  }
  const src = ctxA.createBufferSource();
  src.buffer = buf;
  const nf = ctxA.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 700;
  const ng = ctxA.createGain();
  ng.gain.setValueAtTime(0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(nf).connect(ng).connect(masterGain);
  src.start(t);
  src.stop(t + 0.27);
}

function playChord(freqs, dur, type, gain) {
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();
  for (const f of freqs) {
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

function playCatch() {
  if (muted) return;
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();
  // C major arpeggio up, then full chord
  const notes = [261.63, 329.63, 392.00, 523.25];
  notes.forEach((f, i) => {
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const start = t + i * 0.08;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(g).connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.45);
  });
  // sustained chord at end
  setTimeout(() => playChord([261.63, 329.63, 392.00, 523.25], 0.7, 'triangle', 0.1), 360);
}

function playMiss() {
  if (muted) return;
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();
  // sad descending minor tones
  const notes = [392.00, 349.23, 311.13, 261.63]; // G, F, D#, C
  notes.forEach((f, i) => {
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const start = t + i * 0.22;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(g).connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

function playCountdownBeep(finalBeep) {
  if (muted) return;
  const ctxA = ensureAudio();
  if (!ctxA) return;
  const t = aNow();
  const osc = ctxA.createOscillator();
  const g = ctxA.createGain();
  osc.type = 'sine';
  osc.frequency.value = finalBeep ? 880 : 550;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (finalBeep ? 0.35 : 0.15));
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.4);
}

// ---------- canvas sizing ----------
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- game state ----------
const STATE = { TITLE: 'title', COUNTDOWN: 'countdown', RUNNING: 'running', CAUGHT: 'caught', MISSED: 'missed', RESULT: 'result' };
let state = STATE.TITLE;

let position = 0;      // metres travelled
let velocity = 0;      // m/s
let timeLeft = CONFIG.timerSec;
let countdownTime = 0; // counts down from startCountdownSec
let stunUntil = 0;     // performance.now() timestamp while stunned
let lastSide = null;   // 'L' or 'R'
let lastTapTime = -1e9;
let tapStamps = [];    // ms timestamps for rolling CPS & cap
let busZ = CONFIG.busStartZ;
let missedAnimUntil = 0;
let missedAnimStart = 0;
let caughtAnimUntil = 0;
let caughtAnimStart = 0;
let confetti = []; // {x,y,vx,vy,color,rot,vr,life}
let strideAngle = 0;     // advances by PI per valid tap; sign flips per side
let lastFallAt = -1e9;   // for red-flash overlay
let bagAngle = 0;        // handbag pendulum
let bagVel = 0;

// held keys that must be released before counting (blocks keys held through countdown)
const blockedUntilRelease = new Set();
const pressedPhysical = new Set();

// active touch/pointer ids → side, for mobile tap zones
const activePointers = new Map();
const blockedPointers = new Set();

let finalResult = null; // { caught: bool, spare: number }

// ---------- input ----------
function keyToSide(code) {
  if (code === 'ArrowLeft' || code === 'KeyA') return 'L';
  if (code === 'ArrowRight' || code === 'KeyD') return 'R';
  return null;
}

window.addEventListener('keydown', (e) => {
  const side = keyToSide(e.code);
  if (!side) return;
  if (e.repeat) return;
  e.preventDefault();

  pressedPhysical.add(e.code);

  // ignore keys whose press happened before race started (held through countdown)
  if (blockedUntilRelease.has(e.code)) return;

  if (state !== STATE.RUNNING) return;

  handleTap(side);
}, { passive: false });

window.addEventListener('keyup', (e) => {
  pressedPhysical.delete(e.code);
  blockedUntilRelease.delete(e.code);
});

// ---- mobile tap zones: left half / right half of canvas ----
canvas.addEventListener('pointerdown', (e) => {
  // ignore mouse — keep mouse for buttons/UI only
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  const side = e.clientX < window.innerWidth / 2 ? 'L' : 'R';
  activePointers.set(e.pointerId, side);
  if (blockedPointers.has(e.pointerId)) return;
  if (state !== STATE.RUNNING) return;
  handleTap(side);
}, { passive: false });

const releasePointer = (e) => {
  activePointers.delete(e.pointerId);
  blockedPointers.delete(e.pointerId);
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave', releasePointer);

function handleTap(side) {
  const now = performance.now();

  // stunned → drop
  if (now < stunUntil) return;

  // max CPS cap: drop silently if rolling 1s taps >= cap
  pruneTapStamps(now);
  if (tapStamps.length >= CONFIG.maxRegisteredCps) return;

  // fault: simultaneous opposite key within window
  if (lastSide && lastSide !== side && (now - lastTapTime) < CONFIG.simultaneousWindowMs) {
    fall(now);
    return;
  }

  // fault: same-key repeat / double-press
  if (lastSide === side) {
    fall(now);
    return;
  }

  // valid tap
  velocity = Math.min(CONFIG.maxVelocity, velocity + CONFIG.impulsePerTapMS);
  lastSide = side;
  lastTapTime = now;
  tapStamps.push(now);
  strideAngle += Math.PI;
  // kick the handbag in the opposite direction of the side that just landed
  bagVel += (side === 'L' ? 1 : -1) * 4.5;
  playTap(tapStamps.length, side);
}

function pruneTapStamps(now) {
  const cutoff = now - 1000;
  while (tapStamps.length && tapStamps[0] < cutoff) tapStamps.shift();
}

function fall(now) {
  velocity *= CONFIG.fallVelocityMultiplier;
  stunUntil = now + CONFIG.stunMs;
  lastSide = null;
  lastTapTime = -1e9;
  lastFallAt = now;
  playFall();
}

// ---------- flow ----------
function showTitle() {
  state = STATE.TITLE;
  hudEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  countdownEl.classList.add('hidden');
  titleEl.classList.remove('hidden');

  const best = loadBest();
  if (best != null) {
    const taken = (CONFIG.timerSec - best).toFixed(2);
    bestEl.textContent = `Best: caught the bus in ${taken}s with ${best.toFixed(2)}s to spare`;
  } else {
    bestEl.textContent = '';
  }
}

function startRun() {
  ensureAudio();
  titleEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  countdownEl.classList.remove('hidden');

  // reset run state
  position = 0;
  velocity = 0;
  timeLeft = CONFIG.timerSec;
  countdownTime = CONFIG.startCountdownSec;
  stunUntil = 0;
  lastSide = null;
  lastTapTime = -1e9;
  tapStamps = [];
  busZ = CONFIG.busStartZ;
  finalResult = null;
  strideAngle = 0;
  bagAngle = 0;
  bagVel = 0;
  lastFallAt = -1e9;
  confetti = [];
  tapeFillEl.style.width = '0%';
  timerEl.textContent = CONFIG.timerSec.toFixed(2);

  // block any currently-held movement keys until released
  blockedUntilRelease.clear();
  for (const code of pressedPhysical) {
    if (keyToSide(code)) blockedUntilRelease.add(code);
  }
  // same for touches: any finger already on the screen at GO is ignored
  // until lifted and re-tapped
  blockedPointers.clear();
  for (const id of activePointers.keys()) blockedPointers.add(id);

  state = STATE.COUNTDOWN;
}

function endRun(caught) {
  if (caught) {
    const spare = timeLeft;
    finalResult = { caught: true, spare };
    const prev = loadBest();
    finalResult.isBest = prev == null || spare > prev;
    if (finalResult.isBest) saveBest(spare);
    playCatch();
    state = STATE.CAUGHT;
    caughtAnimStart = performance.now();
    caughtAnimUntil = caughtAnimStart + 1800;
    spawnConfetti();
  } else {
    finalResult = { caught: false, spare: 0 };
    state = STATE.MISSED;
    missedAnimStart = performance.now();
    missedAnimUntil = missedAnimStart + 2200;
    playMiss();
  }
}

function spawnConfetti() {
  confetti = [];
  const colors = ['#ffcc33', '#ff5c5c', '#4ecbff', '#8fe380', '#e07ab0', '#c08bff'];
  const cx = W * 0.5, cy = H * 0.45;
  for (let i = 0; i < 90; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 200 + Math.random() * 500;
    confetti.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 200,
      color: colors[i % colors.length],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 12,
      life: 1.5 + Math.random() * 0.8,
      age: 0,
    });
  }
}

function showResult(r, isBest) {
  state = STATE.RESULT;
  hudEl.classList.add('hidden');
  countdownEl.classList.add('hidden');
  resultEl.classList.remove('hidden');

  if (r.caught) {
    resultHead.textContent = 'CAUGHT!';
    resultBody.textContent = `You made it with ${r.spare.toFixed(2)}s to spare.`;
  } else {
    resultHead.textContent = 'MISSED.';
    resultBody.textContent = `The 87 pulls away. You managed ${position.toFixed(1)}m.`;
  }
  const best = loadBest();
  if (best != null) {
    const taken = (CONFIG.timerSec - best).toFixed(2);
    const spare = best.toFixed(2);
    const line = `Caught the bus in ${taken}s with ${spare}s to spare`;
    resultBest.textContent = isBest ? `New best! ${line} 🎉` : `Best: ${line}`;
  } else {
    resultBest.textContent = '';
  }
}

function loadBest() {
  try {
    const v = localStorage.getItem(BEST_KEY);
    if (v == null) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch {}
}

playBtn.addEventListener('click', startRun);
againBtn.addEventListener('click', startRun);

// keyboard shortcuts for buttons
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === STATE.TITLE) { e.preventDefault(); startRun(); }
    else if (state === STATE.RESULT) { e.preventDefault(); startRun(); }
  }
});

// ---------- main loop ----------
let lastT = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsDisplay = 0;

function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  // clamp dt to avoid spiral-of-death on tab refocus
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  update(dt, now);
  render(dt, now);

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.25) {
    fpsDisplay = fpsFrames / fpsAccum;
    fpsAccum = 0; fpsFrames = 0;
  }

  if (DEBUG) {
    debugEl.classList.remove('hidden');
    pruneTapStamps(now);
    debugEl.textContent =
      `fps  ${fpsDisplay.toFixed(0)}\n` +
      `vel  ${velocity.toFixed(2)} m/s\n` +
      `cps  ${tapStamps.length}\n` +
      `dist ${position.toFixed(2)} m\n` +
      `t    ${timeLeft.toFixed(2)} s\n` +
      `st   ${state}`;
  }

  requestAnimationFrame(frame);
}

function update(dt, now) {
  if (state === STATE.COUNTDOWN) {
    countdownTime -= dt;
    const n = Math.ceil(countdownTime);
    const label = n > 0 ? String(n) : 'GO!';
    if (countdownEl.textContent !== label) {
      countdownEl.textContent = label;
      if (n > 0) playCountdownBeep(false);
      else playCountdownBeep(true);
    }
    if (countdownTime <= -0.4) {
      countdownEl.classList.add('hidden');
      state = STATE.RUNNING;
      lastT = performance.now(); // avoid dt spike
    }
    return;
  }

  if (state === STATE.RUNNING) {
    // physics
    // drag = 0.85 "per frame" in the spec is unplayable at 60fps (velocity decays
    // to ~6e-5/sec, no tap rate can overcome it). Treat 0.85 as applied ~6x/sec
    // instead, giving a per-second factor of ~0.38 — threshold to catch the bus
    // lands around 11–12 Hz alternation. Framerate-independent.
    velocity *= Math.pow(CONFIG.drag, 4 * dt);

    // handbag pendulum: spring toward zero with damping, kicked by taps
    const k = 30, c = 3.5; // stiffness, damping
    bagVel += (-k * bagAngle - c * bagVel) * dt;
    bagAngle += bagVel * dt;
    if (velocity < 0.001) velocity = 0;
    if (velocity > CONFIG.maxVelocity) velocity = CONFIG.maxVelocity;

    position += velocity * dt;

    // bus approach: z = busStartZ - position. Clamp at minimum visual z so the
    // bus doesn't grow to fill the screen as granny closes the gap.
    busZ = Math.max(28, CONFIG.busStartZ - position);

    // timer
    timeLeft -= dt;

    // HUD
    timerEl.textContent = Math.max(0, timeLeft).toFixed(2);
    const frac = Math.max(0, Math.min(1, position / CONFIG.trackLengthM));
    tapeFillEl.style.width = (frac * 100) + '%';

    if (position >= CONFIG.trackLengthM) {
      endRun(true);
      return;
    }
    if (timeLeft <= 0) {
      timeLeft = 0;
      endRun(false);
      return;
    }
    return;
  }

  if (state === STATE.MISSED) {
    // bus pulls away to horizon
    busZ += CONFIG.busRetreatSpeed * dt;
    if (now >= missedAnimUntil) {
      showResult(finalResult, false);
    }
    return;
  }

  if (state === STATE.CAUGHT) {
    // update confetti
    for (const p of confetti) {
      p.age += dt;
      p.vy += 600 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    confetti = confetti.filter(p => p.age < p.life && p.y < H + 40);
    if (now >= caughtAnimUntil) {
      showResult(finalResult, finalResult.isBest);
    }
    return;
  }
}

// ---------- render ----------
const BUILDING_PALETTE = ['#7c5a8a', '#5a7c8a', '#8a6a5a', '#6a8a5a', '#8a8a5a', '#5a6a8a', '#a07a8a'];

// deterministic pseudo-random in [0,1) from integer seed
function hash01(n) {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}

function render(dt, now) {
  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#f8c1a8');
  sky.addColorStop(0.55, '#8db8e0');
  sky.addColorStop(1, '#5a7fa8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const horizonY = H * 0.45;
  const groundY = H;
  const roadHalfBottom = W * 0.48;
  const roadHalfTop = W * 0.03;

  // perspective helpers
  const focal = 30;
  const zToY = (z) => horizonY + (groundY - horizonY) * (focal / (focal + z));
  const zToHalfWidth = (z) => roadHalfTop + (roadHalfBottom - roadHalfTop) * (focal / (focal + z));
  const scaleAtZ = (z) => focal / (focal + z);

  // ---- parallax buildings (behind horizon, slow drift) ----
  const bldBaseY = horizonY;
  const bldUnit = W * 0.05;
  const bldOffset = position * 6; // pixels of horizontal scroll per metre
  // draw two building strips at different parallax depths for depth cue
  for (let layer = 0; layer < 2; layer++) {
    const layerScale = layer === 0 ? 1.0 : 0.6;
    const layerSpeed = layer === 0 ? 1.0 : 0.5;
    const layerY = bldBaseY - bldUnit * 0.4 * (1 - layer * 0.5);
    const slotW = bldUnit * (1.4 + layer * 0.4);
    const startX = -((bldOffset * layerSpeed) % slotW) - slotW;
    const slots = Math.ceil(W / slotW) + 3;
    const baseSeed = layer * 9973 + Math.floor(((bldOffset * layerSpeed) - (bldOffset * layerSpeed) % slotW) / slotW);
    for (let i = 0; i < slots; i++) {
      const seed = baseSeed + i;
      const h = (0.6 + hash01(seed) * 1.4) * bldUnit * (1.2 + layer * 0.4) * layerScale;
      const w = slotW * (0.7 + hash01(seed * 7 + 1) * 0.25);
      const x = startX + i * slotW + (slotW - w) * 0.5;
      const colorIdx = Math.floor(hash01(seed * 13 + 3) * BUILDING_PALETTE.length);
      ctx.fillStyle = BUILDING_PALETTE[colorIdx];
      ctx.fillRect(x, layerY - h, w, h + 4);
      // windows
      ctx.fillStyle = 'rgba(255, 230, 160, 0.55)';
      const wRows = Math.max(2, Math.floor(h / (bldUnit * 0.32)));
      const wCols = Math.max(2, Math.floor(w / (bldUnit * 0.28)));
      for (let r = 1; r < wRows; r++) {
        for (let c = 0; c < wCols; c++) {
          if (hash01(seed * 31 + r * 17 + c) > 0.45) continue;
          const wx = x + (c + 0.5) * (w / wCols) - 1.5;
          const wy = layerY - h + r * (h / wRows);
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }

  // ---- ground strip below horizon ----
  ctx.fillStyle = '#3d5a3a';
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // ---- road polygon ----
  ctx.beginPath();
  ctx.moveTo(W * 0.5 - roadHalfBottom, groundY);
  ctx.lineTo(W * 0.5 + roadHalfBottom, groundY);
  ctx.lineTo(W * 0.5 + roadHalfTop, horizonY);
  ctx.lineTo(W * 0.5 - roadHalfTop, horizonY);
  ctx.closePath();
  ctx.fillStyle = '#2a2a2d';
  ctx.fill();

  // ---- centre stripes ----
  const stripeSpacing = 6;
  const stripeLen = 3;
  const offset = position % stripeSpacing;
  ctx.fillStyle = '#ecd24a';
  for (let i = 0; i < 60; i++) {
    const zNear = i * stripeSpacing - offset;
    const zFar = zNear + stripeLen;
    if (zFar < 0) continue;
    if (zNear > 300) break;
    const yNear = zToY(Math.max(0, zNear));
    const yFar = zToY(zFar);
    const wNear = Math.max(2, roadHalfBottom * 0.012 * scaleAtZ(Math.max(0, zNear)) * 8);
    const wFar = Math.max(1, roadHalfBottom * 0.012 * scaleAtZ(zFar) * 8);
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - wNear / 2, yNear);
    ctx.lineTo(W * 0.5 + wNear / 2, yNear);
    ctx.lineTo(W * 0.5 + wFar / 2, yFar);
    ctx.lineTo(W * 0.5 - wFar / 2, yFar);
    ctx.closePath();
    ctx.fill();
  }

  // road edge lines
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 - roadHalfBottom, groundY);
  ctx.lineTo(W * 0.5 - roadHalfTop, horizonY);
  ctx.moveTo(W * 0.5 + roadHalfBottom, groundY);
  ctx.lineTo(W * 0.5 + roadHalfTop, horizonY);
  ctx.stroke();

  // ---- lamp-posts at fixed z intervals on both sides ----
  const lampSpacing = 22;
  const lampOffset = position % lampSpacing;
  // back-to-front so near posts overlap far posts
  const lamps = [];
  for (let i = 0; i < 25; i++) {
    const z = i * lampSpacing - lampOffset;
    if (z < 0.5 || z > 240) continue;
    lamps.push(z);
  }
  lamps.sort((a, b) => b - a);
  // base lamp dimensions in "world pixels" — much beefier
  const LAMP_BASE_H = 650;
  const LAMP_BASE_ARM = 140;
  const LAMP_BASE_POLE = 18;
  const LAMP_BASE_HEAD = 28;
  for (const z of lamps) {
    const y = zToY(z);
    const hw = zToHalfWidth(z);
    const s = scaleAtZ(z);
    const poleH = LAMP_BASE_H * s;
    const armW = LAMP_BASE_ARM * s;
    const poleW = Math.max(1.2, LAMP_BASE_POLE * s);
    const headR = Math.max(2, LAMP_BASE_HEAD * s);
    for (const sign of [-1, 1]) {
      const baseX = W * 0.5 + sign * (hw + 14 * s + 4);
      const topY = y - poleH;
      // pole shadow on the side facing sun
      ctx.fillStyle = '#1c1c1f';
      ctx.fillRect(baseX - poleW / 2, topY, poleW, poleH);
      // small base/foot
      ctx.fillRect(baseX - poleW * 1.2, y - poleW * 1.2, poleW * 2.4, poleW * 1.2);
      // arm out over the road
      ctx.strokeStyle = '#1c1c1f';
      ctx.lineCap = 'round';
      ctx.lineWidth = poleW * 0.85;
      ctx.beginPath();
      ctx.moveTo(baseX, topY + poleW);
      // gentle curved arm
      ctx.quadraticCurveTo(baseX - sign * armW * 0.4, topY - armW * 0.15, baseX - sign * armW, topY + armW * 0.05);
      ctx.stroke();
      // lamp housing (cone hanging down)
      const lhx = baseX - sign * armW;
      const lhy = topY + armW * 0.05;
      ctx.fillStyle = '#2a2a2d';
      ctx.beginPath();
      ctx.moveTo(lhx - headR * 0.8, lhy);
      ctx.lineTo(lhx + headR * 0.8, lhy);
      ctx.lineTo(lhx + headR * 0.5, lhy + headR * 0.7);
      ctx.lineTo(lhx - headR * 0.5, lhy + headR * 0.7);
      ctx.closePath();
      ctx.fill();
      // glowing bulb
      ctx.fillStyle = '#fff2b8';
      ctx.beginPath();
      ctx.ellipse(lhx, lhy + headR * 0.6, headR * 0.55, headR * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // glow halo
      const glowR = headR * 2.2;
      const grad = ctx.createRadialGradient(lhx, lhy + headR * 0.6, 0, lhx, lhy + headR * 0.6, glowR);
      grad.addColorStop(0, 'rgba(255, 230, 160, 0.5)');
      grad.addColorStop(1, 'rgba(255, 230, 160, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lhx, lhy + headR * 0.6, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- bus (double-decker, faked 3D via front face + angled side panel) ----
  if (busZ >= 0) {
    drawBus(busZ, zToY, zToHalfWidth, scaleAtZ);
  }

  // ---- miss: dust cloud puff behind retreating bus ----
  if (state === STATE.MISSED) {
    const age = (now - missedAnimStart) / 1000;
    const puffCount = 6;
    for (let i = 0; i < puffCount; i++) {
      const phase = (age - i * 0.15) % 1.2;
      if (phase < 0 || phase > 1.0) continue;
      const by = zToY(Math.max(6, busZ - 3));
      const puffY = by + 10 - phase * 20;
      const puffX = W * 0.5 + (i - puffCount / 2) * 25 + Math.sin(i * 7) * 8;
      const r = 15 + phase * 35;
      ctx.fillStyle = `rgba(180, 170, 160, ${0.55 * (1 - phase)})`;
      ctx.beginPath();
      ctx.arc(puffX, puffY, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- procedural granny ----
  const stunned = now < stunUntil;
  drawGranny(W * 0.5, H * 0.84, Math.min(W, H) * 0.32, stunned, now);

  // ---- confetti (on top of granny, drawn last in world layer) ----
  if (state === STATE.CAUGHT || confetti.length) {
    for (const p of confetti) {
      const fade = p.age > p.life - 0.4 ? Math.max(0, (p.life - p.age) / 0.4) : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-5, -2, 10, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---- tap-zone hints (fade out after first valid tap) ----
  if (state === STATE.RUNNING && tapStamps.length < 2) {
    const fade = Math.max(0, 1 - tapStamps.length * 0.5);
    ctx.save();
    ctx.globalAlpha = fade * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, Math.min(W, H) * 0.012);
    ctx.lineCap = 'round';
    const hintY = H * 0.55;
    const hintR = Math.min(W, H) * 0.06;
    // left chevron
    ctx.beginPath();
    ctx.moveTo(W * 0.12 + hintR * 0.5, hintY - hintR);
    ctx.lineTo(W * 0.12 - hintR * 0.5, hintY);
    ctx.lineTo(W * 0.12 + hintR * 0.5, hintY + hintR);
    ctx.stroke();
    // right chevron
    ctx.beginPath();
    ctx.moveTo(W * 0.88 - hintR * 0.5, hintY - hintR);
    ctx.lineTo(W * 0.88 + hintR * 0.5, hintY);
    ctx.lineTo(W * 0.88 - hintR * 0.5, hintY + hintR);
    ctx.stroke();
    // label only when no taps yet
    if (tapStamps.length === 0) {
      ctx.globalAlpha = fade * 0.45;
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.min(W, H) * 0.025}px -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('TAP', W * 0.12, hintY + hintR * 1.4);
      ctx.fillText('TAP', W * 0.88, hintY + hintR * 1.4);
    }
    ctx.restore();
  }

  // ---- catch/miss banner text ----
  if (state === STATE.CAUGHT) {
    const age = (now - caughtAnimStart) / 1000;
    const scale = 1 + Math.min(0.3, age * 3);
    ctx.save();
    ctx.translate(W * 0.5, H * 0.28);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 7;
    ctx.font = `900 ${Math.min(W, H) * 0.11}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('CAUGHT IT!', 0, 0);
    ctx.fillText('CAUGHT IT!', 0, 0);
    ctx.restore();
  } else if (state === STATE.MISSED) {
    const age = (now - missedAnimStart) / 1000;
    const slideY = Math.min(1, age * 2) * H * 0.28;
    ctx.save();
    ctx.translate(W * 0.5, slideY + H * 0.05);
    ctx.fillStyle = '#e8e8e8';
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 6;
    ctx.font = `900 ${Math.min(W, H) * 0.1}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('MISSED...', 0, 0);
    ctx.fillText('MISSED...', 0, 0);
    ctx.restore();
  }

  // ---- OOPS HUD text ----
  if (stunned) {
    const age = now - lastFallAt;
    const wobble = Math.sin(age / 30) * 6;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#c01010';
    ctx.lineWidth = 6;
    ctx.font = `900 ${Math.min(W, H) * 0.12}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(W * 0.5, H * 0.42 + wobble);
    ctx.rotate(-0.08);
    ctx.strokeText('OOPS!', 0, 0);
    ctx.fillText('OOPS!', 0, 0);
    ctx.restore();
  }

  // ---- red flash on fall (~120ms) ----
  const flashAge = now - lastFallAt;
  if (flashAge >= 0 && flashAge < 120) {
    ctx.fillStyle = `rgba(220, 30, 30, ${0.55 * (1 - flashAge / 120)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBus(z, zToY, zToHalfWidth, scaleAtZ) {
  const s = scaleAtZ(z);
  const by = zToY(z);
  const hw = zToHalfWidth(z);
  // base width scales with perspective but also with a larger intrinsic size
  const busW = Math.max(30, hw * 1.3);
  const busH = busW * 0.95; // double-decker = tall
  const cx = W * 0.5;
  const frontLeft = cx - busW * 0.5;
  const frontRight = cx + busW * 0.5;
  const topY = by - busH;
  const bottomY = by;

  // ---- front face (red, with vertical shading) ----
  const faceGrad = ctx.createLinearGradient(frontLeft, 0, frontRight, 0);
  faceGrad.addColorStop(0, '#8a1f1f');
  faceGrad.addColorStop(0.3, '#c43232');
  faceGrad.addColorStop(1, '#e04040');
  ctx.fillStyle = faceGrad;
  ctx.fillRect(frontLeft, topY, busW, busH);
  // subtle highlight on right edge
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(frontRight - busW * 0.04, topY, busW * 0.04, busH);

  // roof dome
  ctx.fillStyle = '#651818';
  ctx.beginPath();
  ctx.moveTo(frontLeft + busW * 0.04, topY);
  ctx.quadraticCurveTo(cx, topY - busH * 0.05, frontRight - busW * 0.04, topY);
  ctx.closePath();
  ctx.fill();

  // destination blind: black rectangle with yellow "87 ..." text
  const signH = busH * 0.09;
  const signY = topY + busH * 0.03;
  ctx.fillStyle = '#111';
  ctx.fillRect(frontLeft + busW * 0.1, signY, busW * 0.8, signH);
  if (signH > 8) {
    ctx.fillStyle = '#ffcc33';
    ctx.font = `700 ${Math.floor(signH * 0.8)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('87 BUS STOP', cx, signY + signH * 0.55);
  }

  // upper deck windows (4-across)
  const upperY = topY + busH * 0.16;
  const upperH = busH * 0.26;
  const windowBandX = frontLeft + busW * 0.07;
  const windowBandW = busW * 0.86;
  ctx.fillStyle = '#2b2b30';
  ctx.fillRect(windowBandX, upperY, windowBandW, upperH);
  ctx.strokeStyle = '#8a1f1f';
  ctx.lineWidth = Math.max(1, busW * 0.012);
  for (let i = 1; i < 4; i++) {
    const x = windowBandX + (windowBandW / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, upperY);
    ctx.lineTo(x, upperY + upperH);
    ctx.stroke();
  }
  // interior light glow behind upper-deck windows
  const upperLight = ctx.createLinearGradient(0, upperY, 0, upperY + upperH);
  upperLight.addColorStop(0, 'rgba(255, 220, 150, 0.0)');
  upperLight.addColorStop(1, 'rgba(255, 220, 150, 0.18)');
  ctx.fillStyle = upperLight;
  ctx.fillRect(windowBandX, upperY, windowBandW, upperH);

  // inter-deck strip
  ctx.fillStyle = '#8a1f1f';
  ctx.fillRect(frontLeft, topY + busH * 0.44, busW, busH * 0.08);

  // lower deck: windshield + driver
  const lowerY = topY + busH * 0.55;
  const lowerH = busH * 0.26;
  ctx.fillStyle = '#1f2a3a';
  ctx.fillRect(windowBandX, lowerY, windowBandW, lowerH);
  // windshield reflection sheen
  const sheen = ctx.createLinearGradient(windowBandX, lowerY, windowBandX + windowBandW, lowerY + lowerH);
  sheen.addColorStop(0, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(0.5, 'rgba(180,220,255,0.25)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(windowBandX, lowerY, windowBandW, lowerH);
  // wiper arms
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(1, busW * 0.008);
  for (let i = 0; i < 2; i++) {
    const wx = windowBandX + windowBandW * (0.28 + i * 0.44);
    ctx.beginPath();
    ctx.moveTo(wx, lowerY + lowerH * 0.95);
    ctx.lineTo(wx + busW * 0.12, lowerY + lowerH * 0.15);
    ctx.stroke();
  }

  // grille / bumper area
  const bumperY = topY + busH * 0.84;
  const bumperH = busH * 0.1;
  ctx.fillStyle = '#1a1a1d';
  ctx.fillRect(frontLeft, bumperY, busW, bumperH);
  // headlights
  ctx.fillStyle = '#fff8d0';
  const hlR = Math.max(2, busW * 0.045);
  ctx.beginPath(); ctx.arc(frontLeft + busW * 0.12, bumperY + bumperH * 0.5, hlR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(frontRight - busW * 0.12, bumperY + bumperH * 0.5, hlR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,248,208,0.25)';
  ctx.beginPath(); ctx.arc(frontLeft + busW * 0.12, bumperY + bumperH * 0.5, hlR * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(frontRight - busW * 0.12, bumperY + bumperH * 0.5, hlR * 1.8, 0, Math.PI * 2); ctx.fill();
  // number plate
  ctx.fillStyle = '#e7e7a0';
  ctx.fillRect(cx - busW * 0.11, bumperY + bumperH * 0.25, busW * 0.22, bumperH * 0.5);
  if (busW > 120) {
    ctx.fillStyle = '#111';
    ctx.font = `700 ${Math.floor(bumperH * 0.38)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LFB 87', cx, bumperY + bumperH * 0.5);
  }

  // shadow underneath (no wheels — they live behind the front face)
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, bottomY + busH * 0.05, busW * 0.55, Math.max(2, busH * 0.035), 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGranny(cx, baseY, height, stunned, now) {
  // unit: 1u ≈ head radius. total height ~ 5.5u for stout granny proportions.
  const u = height / 5.5;
  let sx = 0, sy = 0;
  if (stunned) {
    sx = (Math.random() - 0.5) * 6;
    sy = (Math.random() - 0.5) * 6;
  }
  cx += sx;
  baseY += sy;

  let bob = 0;
  if (state === STATE.RUNNING && !stunned) {
    bob = Math.sin(now / 70) * Math.min(3, velocity * 0.5);
  } else if (state === STATE.CAUGHT) {
    // happy jumping hop — decays over time
    const age = (now - caughtAnimStart) / 1000;
    bob = -Math.abs(Math.sin(age * 7)) * Math.max(0, 28 - age * 10);
  } else if (state === STATE.MISSED) {
    // slump down slightly
    const age = (now - missedAnimStart) / 1000;
    bob = Math.min(10, age * 10);
  }

  const stride = stunned || state === STATE.CAUGHT || state === STATE.MISSED ? 0 : strideAngle;
  const legSwing = Math.sin(stride);
  const kickAmp = stunned || state === STATE.CAUGHT || state === STATE.MISSED ? 0 : Math.min(0.7, 0.3 + velocity * 0.035);

  // body anchors (top-down)
  const headR = u * 0.85;
  const headY = baseY - u * 4.6 + bob;
  const neckY = headY + headR * 0.85;
  const shoulderY = neckY + u * 0.25;
  const torsoH = u * 1.5;
  const hipY = shoulderY + torsoH;
  const skirtH = u * 1.3;
  const skirtBottomY = hipY + skirtH;
  const legLen = baseY - skirtBottomY;

  // ---- legs (drawn first, behind skirt) ----
  drawLeg(cx - u * 0.32, skirtBottomY, legLen, +legSwing * kickAmp, '#222', '#0c0c0c', baseY + sy);
  drawLeg(cx + u * 0.32, skirtBottomY, legLen, -legSwing * kickAmp, '#222', '#0c0c0c', baseY + sy);

  // ---- skirt (purple, tapered trapezoid) ----
  ctx.fillStyle = '#5b3a7a';
  ctx.beginPath();
  ctx.moveTo(cx - u * 0.85, hipY);
  ctx.lineTo(cx + u * 0.85, hipY);
  ctx.lineTo(cx + u * 1.05, skirtBottomY);
  ctx.lineTo(cx - u * 1.05, skirtBottomY);
  ctx.closePath();
  ctx.fill();
  // skirt fold shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(cx, hipY + 1);
  ctx.lineTo(cx + u * 0.05, skirtBottomY);
  ctx.lineTo(cx - u * 0.05, skirtBottomY);
  ctx.closePath();
  ctx.fill();
  // skirt hem
  ctx.fillStyle = '#3e2855';
  ctx.fillRect(cx - u * 1.05, skirtBottomY - u * 0.08, u * 2.1, u * 0.08);

  // ---- torso (cardigan, narrower rounded rect) ----
  ctx.fillStyle = '#a04a4a';
  const torsoW = u * 1.5;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(cx - torsoW / 2, shoulderY, torsoW, torsoH + u * 0.05, [u * 0.4, u * 0.4, u * 0.1, u * 0.1]);
  } else {
    ctx.rect(cx - torsoW / 2, shoulderY, torsoW, torsoH + u * 0.05);
  }
  ctx.fill();
  // shading on left side
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(cx - torsoW / 2, shoulderY, torsoW * 0.35, torsoH + u * 0.05, [u * 0.4, 0, 0, u * 0.1]);
  } else {
    ctx.rect(cx - torsoW / 2, shoulderY, torsoW * 0.35, torsoH);
  }
  ctx.fill();
  // collar V
  ctx.fillStyle = '#ecc8a0';
  ctx.beginPath();
  ctx.moveTo(cx - u * 0.28, shoulderY + u * 0.05);
  ctx.lineTo(cx + u * 0.28, shoulderY + u * 0.05);
  ctx.lineTo(cx, shoulderY + u * 0.5);
  ctx.closePath();
  ctx.fill();
  // buttons (small, gold, vertical)
  ctx.fillStyle = '#d4a838';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, shoulderY + u * 0.7 + i * u * 0.32, u * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- arms ----
  const armLen = u * 1.4;
  const backShoulderX = cx - torsoW * 0.45;
  const backShoulderY = shoulderY + u * 0.2;
  let backSwing = -legSwing * 0.35;
  let handAngle = 0.55 + Math.sin(now / 220) * 0.04;
  if (state === STATE.CAUGHT) {
    // arms thrown up in a V
    const age = (now - caughtAnimStart) / 1000;
    const shake = Math.sin(age * 18) * 0.08;
    backSwing = -Math.PI * 0.85 + shake;      // up and slightly out
    handAngle = -Math.PI * 0.85 - shake;       // mirrored up
  } else if (state === STATE.MISSED) {
    // both arms droop down and forward
    backSwing = 0.25;
    handAngle = 0.15;
  }
  drawArm(backShoulderX, backShoulderY, armLen, backSwing, '#a04a4a', '#ecc8a0', u * 0.28);

  const frontShoulderX = cx + torsoW * 0.45;
  const frontShoulderY = shoulderY + u * 0.2;
  // bag-arm pose uses handAngle (overridden above in caught/missed states)
  const handX = frontShoulderX + Math.sin(handAngle) * armLen;
  const handY = frontShoulderY + Math.cos(handAngle) * armLen;
  ctx.strokeStyle = '#a04a4a';
  ctx.lineCap = 'round';
  ctx.lineWidth = u * 0.28;
  ctx.beginPath();
  ctx.moveTo(frontShoulderX, frontShoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  ctx.fillStyle = '#ecc8a0';
  ctx.beginPath();
  ctx.arc(handX, handY, u * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // ---- handbag pendulum ----
  const bagLen = u * 0.6;
  const bagX = handX + Math.sin(bagAngle) * bagLen;
  const bagY = handY + Math.cos(bagAngle) * bagLen;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = Math.max(1, u * 0.06);
  ctx.beginPath();
  ctx.moveTo(handX - u * 0.05, handY);
  ctx.lineTo(bagX - u * 0.18, bagY - u * 0.1);
  ctx.moveTo(handX + u * 0.05, handY);
  ctx.lineTo(bagX + u * 0.18, bagY - u * 0.1);
  ctx.stroke();
  ctx.fillStyle = '#7a4a1a';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bagX - u * 0.3, bagY - u * 0.1, u * 0.6, u * 0.45, u * 0.08);
  else ctx.rect(bagX - u * 0.3, bagY - u * 0.1, u * 0.6, u * 0.45);
  ctx.fill();
  ctx.fillStyle = '#5a3210';
  ctx.fillRect(bagX - u * 0.3, bagY - u * 0.1, u * 0.6, u * 0.07);
  // bag clasp
  ctx.fillStyle = '#d4a838';
  ctx.beginPath();
  ctx.arc(bagX, bagY - u * 0.06, u * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // ---- neck ----
  ctx.fillStyle = '#d4b088';
  ctx.fillRect(cx - u * 0.16, neckY - u * 0.1, u * 0.32, u * 0.35);

  // ---- head (skin) ----
  ctx.fillStyle = '#ecc8a0';
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // ---- grey hair on top of head, leaving face uncovered ----
  ctx.fillStyle = '#d8d8d8';
  ctx.beginPath();
  // crown cap: half-circle sitting on top of head, ears-height
  ctx.arc(cx, headY, headR, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.closePath();
  ctx.fill();
  // side wisps past ears
  ctx.beginPath();
  ctx.ellipse(cx - headR * 0.88, headY + headR * 0.05, headR * 0.22, headR * 0.35, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + headR * 0.88, headY + headR * 0.05, headR * 0.22, headR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // bun on top
  ctx.beginPath();
  ctx.arc(cx, headY - headR * 0.95, headR * 0.38, 0, Math.PI * 2);
  ctx.fill();
  // hair shadow line at hairline
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = Math.max(1, headR * 0.04);
  ctx.beginPath();
  ctx.arc(cx, headY, headR - headR * 0.01, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.stroke();

  // ---- panic level: builds with distance covered + time pressure ----
  const progress = Math.max(0, Math.min(1, position / CONFIG.trackLengthM));
  const timePressure = Math.max(0, 1 - timeLeft / CONFIG.timerSec);
  const panic = stunned ? 0 : Math.max(progress, timePressure * 0.9);

  // ---- cheeks: redder + bigger as panic rises ----
  const cheekAlpha = 0.35 + panic * 0.55;
  const cheekR = headR * (0.16 + panic * 0.1);
  ctx.fillStyle = `rgba(${Math.round(220 + panic * 20)}, ${Math.round(110 - panic * 40)}, ${Math.round(110 - panic * 50)}, ${cheekAlpha})`;
  ctx.beginPath();
  ctx.arc(cx - headR * 0.48, headY + headR * 0.28, cheekR, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.48, headY + headR * 0.28, cheekR, 0, Math.PI * 2);
  ctx.fill();

  // ---- sweat drops: appear from forehead and trickle down, more when panicked ----
  if (panic > 0.2 && state === STATE.RUNNING) {
    const dropCount = panic > 0.6 ? 3 : panic > 0.4 ? 2 : 1;
    for (let i = 0; i < dropCount; i++) {
      // each drop has its own falling cycle offset in time
      const cycleMs = 900 - panic * 300;
      const phase = ((now + i * 350) % cycleMs) / cycleMs; // 0..1
      const sideSign = i % 2 === 0 ? -1 : 1;
      const startX = cx + sideSign * headR * (0.55 + (i * 0.08));
      const startY = headY - headR * 0.75;
      const dy = phase * headR * 1.8;
      const dropX = startX + sideSign * phase * headR * 0.08;
      const dropY = startY + dy;
      const fade = phase < 0.85 ? 1 : (1 - (phase - 0.85) / 0.15);
      ctx.fillStyle = `rgba(140, 200, 240, ${0.85 * fade})`;
      // teardrop shape: circle body + point on top
      ctx.beginPath();
      ctx.arc(dropX, dropY, headR * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dropX - headR * 0.06, dropY - headR * 0.02);
      ctx.quadraticCurveTo(dropX, dropY - headR * 0.22, dropX + headR * 0.06, dropY - headR * 0.02);
      ctx.closePath();
      ctx.fill();
      // white highlight
      ctx.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
      ctx.beginPath();
      ctx.arc(dropX - headR * 0.03, dropY - headR * 0.03, headR * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- glasses ----
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(1, headR * 0.07);
  const eyeY = headY - headR * 0.08;
  const eyeR = headR * 0.18;
  ctx.beginPath();
  ctx.arc(cx - headR * 0.32, eyeY, eyeR, 0, Math.PI * 2);
  ctx.moveTo(cx + headR * 0.32 + eyeR, eyeY);
  ctx.arc(cx + headR * 0.32, eyeY, eyeR, 0, Math.PI * 2);
  ctx.moveTo(cx - headR * 0.14, eyeY);
  ctx.lineTo(cx + headR * 0.14, eyeY);
  ctx.stroke();
  // pupils
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx - headR * 0.32, eyeY, headR * 0.05, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.32, eyeY, headR * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // ---- mouth: grows wider and more circular as panic rises ----
  if (stunned) {
    ctx.fillStyle = '#5a2020';
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.45, headR * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (state === STATE.CAUGHT) {
    // big upward smile
    ctx.strokeStyle = '#3a1010';
    ctx.lineWidth = Math.max(2, headR * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.3, headR * 0.32, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // teeth visible inside smile
    ctx.fillStyle = 'rgba(245, 235, 220, 0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, headY + headR * 0.45, headR * 0.22, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (state === STATE.MISSED) {
    // sad downturn
    ctx.strokeStyle = '#3a1010';
    ctx.lineWidth = Math.max(2, headR * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.7, headR * 0.28, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (state === STATE.RUNNING) {
    // mouth size scales from small pant (panic 0) to wide O (panic 1)
    const mouthW = headR * (0.14 + panic * 0.25);
    const mouthH = headR * (0.08 + panic * 0.28);
    const mouthY = headY + headR * (0.45 + panic * 0.05);
    // outer mouth
    ctx.fillStyle = '#3a1010';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.fill();
    // inner shadow / throat
    if (panic > 0.3) {
      ctx.fillStyle = '#1a0505';
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + mouthH * 0.15, mouthW * 0.7, mouthH * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // teeth hint at high panic
    if (panic > 0.55) {
      ctx.fillStyle = 'rgba(240, 230, 210, 0.75)';
      ctx.fillRect(cx - mouthW * 0.8, mouthY - mouthH * 0.85, mouthW * 1.6, mouthH * 0.18);
    }
  } else {
    ctx.fillStyle = '#5a2020';
    ctx.fillRect(cx - headR * 0.15, headY + headR * 0.42, headR * 0.3, headR * 0.05);
  }
}

function drawLeg(hipX, hipY, len, angle, trouserColor, shoeColor, baseY) {
  const kneeX = hipX + Math.sin(angle) * len * 0.5;
  const kneeY = hipY + Math.cos(angle) * len * 0.5;
  const footX = hipX + Math.sin(angle) * len;
  const footY = Math.min(baseY, hipY + Math.cos(angle) * len);
  ctx.strokeStyle = trouserColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, len * 0.18);
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  // shoe
  ctx.fillStyle = shoeColor;
  ctx.beginPath();
  ctx.ellipse(footX + Math.sin(angle) * len * 0.05, footY, len * 0.18, len * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawArm(shX, shY, len, angle, sleeveColor, skinColor, thickness) {
  const elbowX = shX + Math.sin(angle) * len * 0.5;
  const elbowY = shY + Math.cos(angle) * len * 0.5;
  const handX = shX + Math.sin(angle) * len;
  const handY = shY + Math.cos(angle) * len;
  ctx.strokeStyle = sleeveColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, thickness || len * 0.18);
  ctx.beginPath();
  ctx.moveTo(shX, shY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(handX, handY, Math.max(len * 0.11, (thickness || len * 0.18) * 0.5), 0, Math.PI * 2);
  ctx.fill();
}

// kick it off
showTitle();
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
