// audio.js — BGM + SFX, single mute toggle wired to state.settings.muted.
//
// SFX are synthesized via Web Audio API (no asset files required).
// BGM tries to load audio/bgm.mp3 — if missing, app stays silent on BGM
// while SFX still work.

import { get, subscribe } from './state.js';

let audioCtx = null;
let bgmEl = null;
let bgmSrcIdx = 0;
let firstGestureBound = false;

const BGM_CANDIDATES = ['audio/bgm.mp3', 'audio/bgm.m4a', 'audio/bgm.wav'];

function ensureCtx() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    console.warn('[audio] AudioContext unavailable:', err);
  }
  return audioCtx;
}

export function initAudio() {
  if (!firstGestureBound) {
    firstGestureBound = true;
    const handler = () => {
      ensureCtx();
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
      if (!get().settings.muted) startBgm();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler);
    document.addEventListener('touchstart', handler);
  }

  // React to mute changes
  let lastMuted = get().settings.muted;
  subscribe(() => {
    const muted = get().settings.muted;
    if (muted === lastMuted) return;
    lastMuted = muted;
    if (muted) stopBgm(); else startBgm();
  });
}

export function startBgm() {
  if (get().settings.muted) return;
  if (!bgmEl) {
    bgmEl = new Audio();
    bgmEl.loop = true;
    bgmEl.volume = 0.3;
    bgmEl.preload = 'auto';
    bgmEl.addEventListener('error', () => {
      bgmSrcIdx += 1;
      if (bgmSrcIdx < BGM_CANDIDATES.length) {
        bgmEl.src = BGM_CANDIDATES[bgmSrcIdx];
        bgmEl.play().catch(() => {});
      }
      // else: silent fallback
    });
    bgmEl.src = BGM_CANDIDATES[0];
  }
  bgmEl.muted = false;
  bgmEl.play().catch(() => {
    // Autoplay blocked — silent fallback. SFX still works.
  });
}

export function stopBgm() {
  if (bgmEl) {
    bgmEl.pause();
    bgmEl.muted = true;
  }
}

export function playSfx(name) {
  if (get().settings.muted) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'running') {
    dispatch(ctx, name);
  } else {
    ctx.resume().then(() => dispatch(ctx, name)).catch(() => {});
  }
}

function dispatch(ctx, name) {
  switch (name) {
    case 'tick':
      return synth(ctx, [{ f: 880, t: 0, d: 0.08 }], 'sine', 0.15);
    case 'confetti':
      return synth(ctx, [
        { f: 523, t: 0,   d: 0.12 },
        { f: 659, t: 0.1, d: 0.12 },
        { f: 784, t: 0.2, d: 0.18 }
      ], 'triangle', 0.18);
    case 'voucher':
      return synth(ctx, [
        { f: 523,  t: 0,    d: 0.16 },
        { f: 659,  t: 0.16, d: 0.16 },
        { f: 784,  t: 0.32, d: 0.16 },
        { f: 1046, t: 0.48, d: 0.36 }
      ], 'triangle', 0.22);
    case 'chime':
      return synth(ctx, [
        { f: 880,  t: 0,    d: 0.25 },
        { f: 1175, t: 0.18, d: 0.4 }
      ], 'sine', 0.16);
  }
}

function synth(ctx, notes, type = 'sine', volume = 0.2) {
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0, now + n.t);
    gain.gain.linearRampToValueAtTime(volume, now + n.t + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + n.t + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.05);
  }
}
