// views/parent.js — PIN gate, forced first-login PIN change, parent dashboard.
//
// Parent dashboard sections:
//   1. Star management (pick day, remove/restore stars per completed task)
//   2. Tier reward labels
//   3. Voucher claiming (mark unclaimed → claimed with date)
//   4. Change PIN
//   5. Backup (export / import JSON) — wired in Phase 10
//   6. Reset all data
// Schedule editing lives in the Settings view (linked from here).

import { get, mutate, subscribe, reset, exportJson, importJson } from '../state.js';
import {
  TEMPLATE_NAMES, getTodayKey, removeStar, restoreStar, isStarRemoved
} from '../tasks.js';
import { TIER_NAMES, claimVoucher, setRewardLabel } from '../vouchers.js';

const TIER_DISPLAY = {
  bronze:   { emoji: '🥉', label: 'Bronze',   stars: 25 },
  silver:   { emoji: '🥈', label: 'Silver',   stars: 100 },
  gold:     { emoji: '🥇', label: 'Gold',     stars: 250 },
  platinum: { emoji: '💎', label: 'Platinum', stars: 500 }
};

let mountedContainer = null;
let unsubscribe = null;

let authed = false;
let pinDraft = '';
let pinError = '';
let starMgmtDate = null; // YYYY-MM-DD

export function render(container) {
  mountedContainer = container;
  if (!unsubscribe) {
    unsubscribe = subscribe(() => {
      if (!mountedContainer) return;
      const f = document.activeElement;
      if (f && mountedContainer.contains(f) && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA')) {
        return; // user is typing — preserve focus
      }
      draw();
    });
  }
  if (!starMgmtDate) starMgmtDate = getTodayKey();
  draw();
}

function draw() {
  if (!mountedContainer) return;
  const state = get();
  if (!authed) {
    drawPin();
  } else if (!state.settings.pinChanged) {
    drawForcedPinChange();
  } else {
    drawDashboard();
  }
}

// ---------- PIN entry ----------

function drawPin() {
  const dots = Array.from({ length: 4 }, (_, i) => i < pinDraft.length ? '●' : '○').join(' ');
  mountedContainer.innerHTML = `
    <div class="settings-header">
      <h1 class="page-title">🔒 Parent menu</h1>
    </div>
    <div class="card pin-card">
      <p class="muted">Enter the 4-digit PIN.</p>
      <div class="pin-dots">${dots}</div>
      ${pinError ? `<div class="pin-error">${pinError}</div>` : ''}
      <div class="pin-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-d="${n}">${n}</button>`).join('')}
        <button class="pin-key pin-key-clear" data-action="clear">Clear</button>
        <button class="pin-key" data-d="0">0</button>
        <button class="pin-key pin-key-back" data-action="back">⌫</button>
      </div>
      ${!get().settings.pinChanged
        ? '<p class="muted hint">First time? Default PIN is <strong>1234</strong> — you\'ll be asked to change it.</p>'
        : ''}
    </div>
  `;

  mountedContainer.querySelectorAll('[data-d]').forEach(b => {
    b.addEventListener('click', () => {
      pinError = '';
      if (pinDraft.length < 4) pinDraft += b.dataset.d;
      if (pinDraft.length === 4) submitPin();
      else draw();
    });
  });
  mountedContainer.querySelector('[data-action="clear"]')?.addEventListener('click', () => { pinDraft = ''; pinError = ''; draw(); });
  mountedContainer.querySelector('[data-action="back"]')?.addEventListener('click', () => { pinDraft = pinDraft.slice(0, -1); pinError = ''; draw(); });
}

function submitPin() {
  const expected = get().settings.pin;
  if (pinDraft === expected) {
    authed = true;
    pinDraft = '';
    pinError = '';
    draw();
  } else {
    pinError = 'Wrong PIN — try again';
    pinDraft = '';
    setTimeout(() => { draw(); }, 250);
  }
}

// ---------- Forced PIN change (first login) ----------

let newPinDraft = '';
let confirmPinDraft = '';
let pinChangeError = '';

function drawForcedPinChange() {
  mountedContainer.innerHTML = `
    <div class="settings-header">
      <h1 class="page-title">🔒 Set a new PIN</h1>
    </div>
    <div class="card">
      <p class="muted">Choose a 4-digit PIN you'll remember. You can change it any time later.</p>
      <div class="field">
        <label class="field-label">New PIN</label>
        <input id="new-pin" class="field-input" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" value="${escapeAttr(newPinDraft)}" />
      </div>
      <div class="field">
        <label class="field-label">Confirm new PIN</label>
        <input id="confirm-pin" class="field-input" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" value="${escapeAttr(confirmPinDraft)}" />
      </div>
      ${pinChangeError ? `<div class="pin-error">${pinChangeError}</div>` : ''}
      <button id="save-new-pin" class="btn-primary">Save new PIN</button>
    </div>
  `;

  mountedContainer.querySelector('#new-pin').addEventListener('input', e => { newPinDraft = e.target.value; });
  mountedContainer.querySelector('#confirm-pin').addEventListener('input', e => { confirmPinDraft = e.target.value; });
  mountedContainer.querySelector('#save-new-pin').addEventListener('click', () => {
    if (!/^\d{4}$/.test(newPinDraft)) { pinChangeError = 'PIN must be 4 digits'; draw(); return; }
    if (newPinDraft !== confirmPinDraft) { pinChangeError = 'PINs don\'t match'; draw(); return; }
    mutate(s => { s.settings.pin = newPinDraft; s.settings.pinChanged = true; });
    newPinDraft = '';
    confirmPinDraft = '';
    pinChangeError = '';
    draw();
  });
}

// ---------- Dashboard ----------

function drawDashboard() {
  const state = get();

  mountedContainer.innerHTML = `
    <div class="settings-header">
      <h1 class="page-title">🔒 Parent menu</h1>
      <button class="btn-secondary" id="logout-btn">Lock</button>
    </div>

    ${starSectionHtml(state)}
    ${voucherSectionHtml(state)}
    ${pinChangeSectionHtml()}
    ${backupSectionHtml()}
    ${dangerSectionHtml()}

    <div class="card settings-section">
      <h2 class="section-title">📅 Edit schedules</h2>
      <p class="muted">Templates and day-of-week assignments live in Settings.</p>
      <button class="btn-secondary" data-nav="settings">Open Settings</button>
    </div>
  `;

  bindDashboard();
}

function starSectionHtml(state) {
  const day = state.history[starMgmtDate] || { completed: [], removedStars: [] };
  const completed = day.completed || [];
  const removed = day.removedStars || [];

  return `
    <div class="card settings-section">
      <h2 class="section-title">🌟 Star management</h2>
      <div class="field">
        <label class="field-label">Pick a day</label>
        <input id="star-date" class="field-input" type="date" max="${getTodayKey()}" value="${escapeAttr(starMgmtDate)}" />
      </div>
      <p class="muted">Total stars earned: <strong>${state.stars.earned}</strong> · Removed: <strong>${state.stars.removed}</strong> · Showing: <strong>${Math.max(0, state.stars.earned - state.stars.removed)}</strong></p>
      ${completed.length === 0
        ? '<p class="muted">No tasks were completed on this day.</p>'
        : `<ul class="day-task-list">
            ${completed.map(taskId => {
              const meta = lookupTask(state, taskId);
              const isRemoved = removed.includes(taskId);
              return `
                <li class="day-task ${isRemoved ? 'punished' : ''}">
                  <span class="day-task-emoji">${escapeHtml(meta?.emoji || '⭐')}</span>
                  <span class="day-task-name">${escapeHtml(meta?.name || '[deleted task]')}</span>
                  <span class="day-task-star">${isRemoved ? '✖️' : '⭐'}</span>
                  ${isRemoved
                    ? `<button class="btn-secondary star-action" data-restore="${escapeAttr(taskId)}">Restore</button>`
                    : `<button class="btn-secondary star-action" data-remove="${escapeAttr(taskId)}">Remove star</button>`}
                </li>`;
            }).join('')}
          </ul>`}
    </div>
  `;
}

function voucherSectionHtml(state) {
  const labels = state.vouchers.rewardLabels;
  const earned = state.vouchers.earned;
  const claimed = state.vouchers.claimed;

  return `
    <div class="card settings-section">
      <h2 class="section-title">🎟️ Voucher rewards</h2>
      <p class="muted">Set what each tier represents. The child sees these on their summary.</p>
      ${TIER_NAMES.map(tier => {
        const info = TIER_DISPLAY[tier];
        return `
          <div class="field">
            <label class="field-label">${info.emoji} ${info.label} (at ${info.stars} stars)</label>
            <input class="field-input tier-label-input" data-tier="${tier}" type="text" maxlength="40"
                   value="${escapeAttr(labels[tier] || '')}" placeholder="e.g. 30 minutes iPad" />
          </div>`;
      }).join('')}

      <h3 class="subsection-title">Waiting to claim (${earned.length})</h3>
      ${earned.length === 0
        ? '<p class="muted">None yet.</p>'
        : `<ul class="claim-list">
            ${earned.map(v => {
              const info = TIER_DISPLAY[v.tier];
              return `
                <li class="claim-item">
                  <span class="tier-pill tier-${v.tier}">${info.emoji} ${info.label}</span>
                  <span class="claim-date">earned ${escapeHtml(v.earnedDate)}</span>
                  <button class="btn-primary claim-btn" data-claim="${escapeAttr(v.id)}">Claim</button>
                </li>`;
            }).join('')}
          </ul>`}

      <h3 class="subsection-title">Claimed history (${claimed.length})</h3>
      ${claimed.length === 0
        ? '<p class="muted">None yet.</p>'
        : `<ul class="claim-list">
            ${claimed.slice().reverse().map(v => {
              const info = TIER_DISPLAY[v.tier];
              return `
                <li class="claim-item">
                  <span class="tier-pill tier-${v.tier}">${info.emoji} ${info.label}</span>
                  ${v.label ? `<span class="claim-label">— ${escapeHtml(v.label)}</span>` : ''}
                  <span class="claim-date">claimed ${escapeHtml(v.claimedDate)}</span>
                </li>`;
            }).join('')}
          </ul>`}
    </div>
  `;
}

function pinChangeSectionHtml() {
  return `
    <div class="card settings-section">
      <h2 class="section-title">🔑 Change PIN</h2>
      <div class="field">
        <label class="field-label">New PIN (4 digits)</label>
        <input id="dash-new-pin" class="field-input" type="password" inputmode="numeric" maxlength="4" />
      </div>
      <div class="field">
        <label class="field-label">Confirm new PIN</label>
        <input id="dash-confirm-pin" class="field-input" type="password" inputmode="numeric" maxlength="4" />
      </div>
      <div id="dash-pin-msg" class="pin-msg"></div>
      <button id="dash-save-pin" class="btn-primary">Update PIN</button>
    </div>
  `;
}

function backupSectionHtml() {
  return `
    <div class="card settings-section">
      <h2 class="section-title">💾 Backup &amp; restore</h2>
      <p class="muted">Move the child's progress between devices.</p>
      <div class="bulk-actions">
        <button class="btn-primary" id="export-btn">⬇️ Export backup</button>
        <button class="btn-secondary" id="import-btn">⬆️ Import backup</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
      </div>
      <div id="backup-msg" class="pin-msg"></div>
    </div>
  `;
}

function dangerSectionHtml() {
  return `
    <div class="card settings-section danger-section">
      <h2 class="section-title">⚠️ Reset</h2>
      <p class="muted">This wipes everything: tasks, stars, vouchers, settings.</p>
      <button class="btn-secondary danger-btn" id="reset-btn">Reset everything</button>
    </div>
  `;
}

function bindDashboard() {
  // Logout
  mountedContainer.querySelector('#logout-btn')?.addEventListener('click', () => {
    authed = false;
    pinDraft = '';
    draw();
  });

  // Star management
  const dateInput = mountedContainer.querySelector('#star-date');
  if (dateInput) {
    dateInput.addEventListener('change', () => { starMgmtDate = dateInput.value || getTodayKey(); draw(); });
  }
  mountedContainer.querySelectorAll('[data-remove]').forEach(b => {
    b.addEventListener('click', () => removeStar(starMgmtDate, b.dataset.remove));
  });
  mountedContainer.querySelectorAll('[data-restore]').forEach(b => {
    b.addEventListener('click', () => restoreStar(starMgmtDate, b.dataset.restore));
  });

  // Tier reward labels
  mountedContainer.querySelectorAll('.tier-label-input').forEach(input => {
    input.addEventListener('change', () => setRewardLabel(input.dataset.tier, input.value.trim()));
  });

  // Claim vouchers
  mountedContainer.querySelectorAll('[data-claim]').forEach(b => {
    b.addEventListener('click', () => claimVoucher(b.dataset.claim));
  });

  // Change PIN
  const savePin = mountedContainer.querySelector('#dash-save-pin');
  if (savePin) {
    savePin.addEventListener('click', () => {
      const a = mountedContainer.querySelector('#dash-new-pin').value;
      const b = mountedContainer.querySelector('#dash-confirm-pin').value;
      const msg = mountedContainer.querySelector('#dash-pin-msg');
      if (!/^\d{4}$/.test(a)) { msg.textContent = 'PIN must be 4 digits'; msg.className = 'pin-msg pin-error'; return; }
      if (a !== b) { msg.textContent = 'PINs don\'t match'; msg.className = 'pin-msg pin-error'; return; }
      mutate(s => { s.settings.pin = a; });
      msg.textContent = '✓ PIN updated';
      msg.className = 'pin-msg pin-ok';
      mountedContainer.querySelector('#dash-new-pin').value = '';
      mountedContainer.querySelector('#dash-confirm-pin').value = '';
    });
  }

  // Backup
  const exportBtn = mountedContainer.querySelector('#export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tracker-backup-${getTodayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const msg = mountedContainer.querySelector('#backup-msg');
      msg.textContent = '✓ Backup downloaded';
      msg.className = 'pin-msg pin-ok';
    });
  }
  const importBtn = mountedContainer.querySelector('#import-btn');
  const importFile = mountedContainer.querySelector('#import-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      const msg = mountedContainer.querySelector('#backup-msg');
      reader.onload = () => {
        if (!confirm('Importing will replace ALL current data. Continue?')) {
          importFile.value = '';
          return;
        }
        try {
          importJson(reader.result);
          msg.textContent = '✓ Backup restored';
          msg.className = 'pin-msg pin-ok';
        } catch (err) {
          msg.textContent = '⚠️ ' + err.message;
          msg.className = 'pin-msg pin-error';
        }
        importFile.value = '';
      };
      reader.readAsText(file);
    });
  }

  // Reset
  mountedContainer.querySelector('#reset-btn')?.addEventListener('click', () => {
    if (!confirm('Reset EVERYTHING? This wipes tasks, stars, vouchers, and settings. There is no undo.')) return;
    if (!confirm('Are you really sure? Last chance.')) return;
    reset();
    authed = false;
    location.hash = 'main';
  });
}

function lookupTask(state, taskId) {
  for (const tplName of TEMPLATE_NAMES) {
    const found = state.templates[tplName]?.find(t => t.id === taskId);
    if (found) return found;
  }
  return null;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
