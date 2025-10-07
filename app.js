// State and DOM
const freqEl = document.getElementById('freq');
const freqValEl = document.getElementById('freqVal');
const fsEl = document.getElementById('fs');
const fsValEl = document.getElementById('fsVal');
const bitsEl = document.getElementById('bits');
const bitsValEl = document.getElementById('bitsVal');
const windowEl = document.getElementById('window');
const windowValEl = document.getElementById('windowVal');
const zohEl = document.getElementById('zoh');

const canvasOriginal = document.getElementById('canvasOriginal');
const canvasProcessed = document.getElementById('canvasProcessed');
const ctxOrig = canvasOriginal.getContext('2d');
const ctxProc = canvasProcessed.getContext('2d');

const playOriginalBtn = document.getElementById('playOriginal');
const playProcessedBtn = document.getElementById('playProcessed');

let audioCtx = null;

// Helpers
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function quantize(sample, bits) {
  const levels = Math.max(2, 1 << clamp(bits | 0, 1, 24));
  const normalized = (clamp(sample, -1, 1) + 1) * 0.5;
  const q = Math.round(normalized * (levels - 1)) / (levels - 1);
  return clamp(q * 2 - 1, -1, 1);
}

function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0c0f1e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2e44';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;
  const stepY = 40;
  for (let y = 0; y <= h; y += stepY) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  const stepX = 100;
  for (let x = 0; x <= w; x += stepX) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  // axis at 0
  ctx.strokeStyle = '#3a3f5f';
  ctx.beginPath(); ctx.moveTo(0, h/2 + 0.5); ctx.lineTo(w, h/2 + 0.5); ctx.stroke();
  ctx.restore();
}

function render() {
  const freq = parseFloat(freqEl.value);
  const fs = parseFloat(fsEl.value);
  const bits = parseInt(bitsEl.value, 10);
  const windowMs = parseFloat(windowEl.value);

  freqValEl.textContent = freq.toString();
  fsValEl.textContent = fs.toString();
  bitsValEl.textContent = bits.toString();
  windowValEl.textContent = windowMs.toString();

  const w = canvasOriginal.width;
  const h = canvasOriginal.height;
  drawGrid(ctxOrig, w, h);
  drawGrid(ctxProc, w, h);

  const duration = windowMs / 1000;
  const midY = h / 2;
  const amp = h * 0.4; // scale to 80% height

  // Render high-res original signal
  ctxOrig.save();
  ctxOrig.strokeStyle = '#6aa0ff';
  ctxOrig.lineWidth = 2;
  ctxOrig.beginPath();
  const samples = w * 4; // oversample for smooth curve
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * duration;
    const x = (i / samples) * w;
    const y = midY - Math.sin(2 * Math.PI * freq * t) * amp;
    if (i === 0) ctxOrig.moveTo(x, y); else ctxOrig.lineTo(x, y);
  }
  ctxOrig.stroke();
  ctxOrig.restore();

  // Compute discrete samples at sampling rate
  const numSamples = Math.floor(fs * duration) + 1;
  const sampleTimes = new Array(numSamples);
  const sampleValues = new Array(numSamples);
  for (let n = 0; n < numSamples; n++) {
    const t = (n / fs);
    sampleTimes[n] = t;
    sampleValues[n] = Math.sin(2 * Math.PI * freq * t);
  }

  // Draw sample points
  ctxProc.save();
  ctxProc.fillStyle = '#ffd166';
  ctxProc.strokeStyle = '#ffd166';
  for (let n = 0; n < numSamples; n++) {
    const t = sampleTimes[n];
    if (t > duration) break;
    const x = (t / duration) * w;
    const y = midY - sampleValues[n] * amp;
    ctxProc.beginPath();
    ctxProc.arc(x, y, 3, 0, Math.PI * 2);
    ctxProc.fill();
  }
  ctxProc.restore();

  // Quantised, ZOH (staircase) or linear connect
  const doZoh = zohEl.checked;
  ctxProc.save();
  ctxProc.strokeStyle = '#ff7a6a';
  ctxProc.lineWidth = 2;
  ctxProc.beginPath();
  let started = false;
  for (let n = 0; n < numSamples; n++) {
    const t = sampleTimes[n];
    if (t > duration) break;
    const qv = quantize(sampleValues[n], bits);
    const x = (t / duration) * w;
    const y = midY - qv * amp;
    if (!started) { ctxProc.moveTo(0, y); started = true; }
    if (doZoh) {
      // horizontal line until next sample
      ctxProc.lineTo(x, y);
      const nextT = (n + 1) < numSamples ? sampleTimes[n + 1] : duration;
      const nextX = ((Math.min(nextT, duration)) / duration) * w;
      ctxProc.lineTo(nextX, y);
    } else {
      if (n === 0) ctxProc.moveTo(x, y); else ctxProc.lineTo(x, y);
    }
  }
  ctxProc.stroke();
  ctxProc.restore();

  requestAnimationFrame(render);
}

// Audio playback
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playOriginalTone() {
  const ac = ensureAudio();
  const freq = parseFloat(freqEl.value);
  const duration = 1.5; // seconds
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + 0.02);
  gain.gain.setValueAtTime(0.4, ac.currentTime + duration - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function playProcessedTone() {
  const ac = ensureAudio();
  const freq = parseFloat(freqEl.value);
  const fs = parseFloat(fsEl.value);
  const bits = parseInt(bitsEl.value, 10);
  const duration = 1.5; // seconds

  // We simulate sampling at fs and quantisation at bits, then upsample to context rate using ZOH
  const contextRate = ac.sampleRate;
  const totalFrames = Math.floor(duration * contextRate);

  const buffer = ac.createBuffer(1, totalFrames, contextRate);
  const out = buffer.getChannelData(0);

  let t = 0;
  const dt = 1 / contextRate;
  const Ts = 1 / fs;
  let nextSampleTime = 0;
  let heldValue = 0;

  for (let i = 0; i < totalFrames; i++, t += dt) {
    if (t + 1e-12 >= nextSampleTime) {
      const sample = Math.sin(2 * Math.PI * freq * nextSampleTime);
      heldValue = quantize(sample, bits);
      nextSampleTime += Ts;
    }
    out[i] = heldValue * 0.7; // ZOH held amplitude
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.9, ac.currentTime + 0.02);
  gain.gain.setValueAtTime(0.9, ac.currentTime + duration - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  src.connect(gain).connect(ac.destination);
  src.start();
}

// Wire up
playOriginalBtn.addEventListener('click', playOriginalTone);
playProcessedBtn.addEventListener('click', playProcessedTone);

// Kickoff render loop
requestAnimationFrame(render);


