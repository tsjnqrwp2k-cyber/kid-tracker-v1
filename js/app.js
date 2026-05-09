// app.js — entry point, hash router, mute toggle, service worker.

import { load, get, mutate, subscribe } from './state.js';
import { initVoucherDetector } from './vouchers.js';
import { initAudio } from './audio.js';
import { initReminders } from './reminders.js';
import * as mainView from './views/main.js';
import * as summaryView from './views/summary.js';
import * as settingsView from './views/settings.js';
import * as parentView from './views/parent.js';

const VIEWS = {
  main: mainView,
  summary: summaryView,
  settings: settingsView,
  parent: parentView
};

function getRoute() {
  const hash = location.hash.replace('#', '');
  return VIEWS[hash] ? hash : 'main';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', get().settings.theme);
}

function render() {
  applyTheme();
  const route = getRoute();
  for (const [name, view] of Object.entries(VIEWS)) {
    const el = document.getElementById(`view-${name}`);
    if (!el) continue;
    if (name === route) {
      el.hidden = false;
      view.render(el);
    } else {
      el.hidden = true;
    }
  }
}

function setupNav() {
  document.body.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-nav]');
    if (target) {
      ev.preventDefault();
      location.hash = target.dataset.nav;
    }
  });
  window.addEventListener('hashchange', render);
}

function setupMuteToggle() {
  const btn = document.getElementById('mute-toggle');
  if (!btn) return;
  const update = () => {
    const muted = get().settings.muted;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  };
  btn.addEventListener('click', () => {
    mutate(s => { s.settings.muted = !s.settings.muted; });
  });
  subscribe(update);
  update();
}

function bootstrap() {
  load();
  initAudio();
  initVoucherDetector();
  initReminders();
  setupNav();
  setupMuteToggle();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.error('[sw] registration failed:', err)
    );
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
