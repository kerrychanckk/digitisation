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

// Image demo DOM
const imgFileEl = document.getElementById('imgFile');
const pixelSizeEl = document.getElementById('pixelSize');
const pixelSizeValEl = document.getElementById('pixelSizeVal');
const imgBitsEl = document.getElementById('imgBits');
const imgBitsValEl = document.getElementById('imgBitsVal');
const toGrayEl = document.getElementById('toGray');
const useSampleBtn = document.getElementById('useSample');
const resetViewBtn = document.getElementById('resetView');
const canvasImgOrig = document.getElementById('imgOriginal');
const canvasImgProc = document.getElementById('imgProcessed');
const ctxImgOrig = canvasImgOrig ? canvasImgOrig.getContext('2d') : null;
const ctxImgProc = canvasImgProc ? canvasImgProc.getContext('2d') : null;

let currentImageBitmap = null;

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

// ==========================
// Image Demo Implementation
// ==========================

function updateImageControlsDisplay() {
  if (pixelSizeEl && pixelSizeValEl) pixelSizeValEl.textContent = pixelSizeEl.value;
  if (imgBitsEl && imgBitsValEl) imgBitsValEl.textContent = imgBitsEl.value;
}

function createSampleImageBitmap(width = 640, height = 360) {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const c = off.getContext('2d');

  // Background gradient
  const g = c.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#1a2a6c');
  g.addColorStop(0.5, '#b21f1f');
  g.addColorStop(1, '#fdbb2d');
  c.fillStyle = g;
  c.fillRect(0, 0, width, height);

  // Checkerboard overlay
  const cell = 24;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (((x + y) / cell) % 2 < 1) {
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(x, y, cell, cell);
      }
    }
  }

  // Circles
  for (let i = 0; i < 8; i++) {
    const cx = (i + 1) * (width / 9);
    const cy = height * (0.3 + 0.35 * Math.sin(i * 0.8));
    const r = 18 + (i % 3) * 10;
    c.fillStyle = `hsla(${i * 40}, 90%, 60%, 0.8)`;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  }

  return createImageBitmap(off);
}

function drawImageFit(ctx, img, canvas) {
  if (!ctx || !img || !canvas) return;
  const cw = canvas.width, ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  // Fit image preserving aspect
  const iw = img.width || img.videoWidth || cw;
  const ih = img.height || img.videoHeight || ch;
  const scale = Math.min(cw / iw, ch / ih);
  const dw = Math.floor(iw * scale);
  const dh = Math.floor(ih * scale);
  const dx = Math.floor((cw - dw) / 2);
  const dy = Math.floor((ch - dh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
}

function quantizeChannel(v, bits) {
  const levels = Math.max(2, 1 << (bits | 0));
  const q = Math.round((v / 255) * (levels - 1)) / (levels - 1);
  return Math.max(0, Math.min(255, Math.round(q * 255)));
}

function processImagePixelateAndQuantize() {
  if (!ctxImgOrig || !ctxImgProc || !currentImageBitmap) return;

  updateImageControlsDisplay();

  // Draw original, fitted
  drawImageFit(ctxImgOrig, currentImageBitmap, canvasImgOrig);

  // Render processed: draw image fitted to an offscreen canvas, then pixelate blocks
  const cw = canvasImgProc.width, ch = canvasImgProc.height;
  ctxImgProc.clearRect(0, 0, cw, ch);

  const off = document.createElement('canvas');
  off.width = cw; off.height = ch;
  const c = off.getContext('2d');
  drawImageFit(c, currentImageBitmap, off);

  const pixelSize = Math.max(1, parseInt(pixelSizeEl ? pixelSizeEl.value : '8', 10));
  const bits = Math.max(1, parseInt(imgBitsEl ? imgBitsEl.value : '4', 10));
  const toGray = !!(toGrayEl && toGrayEl.checked);

  const src = c.getImageData(0, 0, cw, ch);
  const dst = ctxImgProc.createImageData(cw, ch);
  const sdata = src.data;
  const ddata = dst.data;

  for (let y = 0; y < ch; y += pixelSize) {
    for (let x = 0; x < cw; x += pixelSize) {
      // Sample top-left of the block (nearest neighbor)
      const idx = ((y * cw) + x) * 4;
      let r = sdata[idx], g = sdata[idx + 1], b = sdata[idx + 2], a = sdata[idx + 3];
      if (toGray) {
        const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        r = g = b = l;
      }
      // Quantise per channel
      r = quantizeChannel(r, bits);
      g = quantizeChannel(g, bits);
      b = quantizeChannel(b, bits);
      // Fill the block
      for (let yy = 0; yy < pixelSize; yy++) {
        const py = y + yy; if (py >= ch) break;
        for (let xx = 0; xx < pixelSize; xx++) {
          const px = x + xx; if (px >= cw) break;
          const p = ((py * cw) + px) * 4;
          ddata[p] = r; ddata[p + 1] = g; ddata[p + 2] = b; ddata[p + 3] = a;
        }
      }
    }
  }

  ctxImgProc.putImageData(dst, 0, 0);
}

async function loadSampleImage() {
  try {
    currentImageBitmap = await createSampleImageBitmap();
    processImagePixelateAndQuantize();
  } catch (e) {
    // ignore
  }
}

function handleFileUpload(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    try {
      currentImageBitmap = await createImageBitmap(img);
      processImagePixelateAndQuantize();
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function wireImageDemo() {
  if (!canvasImgOrig || !canvasImgProc) return; // no image section present
  updateImageControlsDisplay();
  if (imgFileEl) imgFileEl.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleFileUpload(file);
  });
  if (pixelSizeEl) pixelSizeEl.addEventListener('input', processImagePixelateAndQuantize);
  if (imgBitsEl) imgBitsEl.addEventListener('input', processImagePixelateAndQuantize);
  if (toGrayEl) toGrayEl.addEventListener('change', processImagePixelateAndQuantize);
  if (useSampleBtn) useSampleBtn.addEventListener('click', loadSampleImage);
  if (resetViewBtn) resetViewBtn.addEventListener('click', processImagePixelateAndQuantize);

  // Initial sample image to ensure something is visible
  loadSampleImage();
}

// Initialize image demo after main thread settles
setTimeout(wireImageDemo, 0);


