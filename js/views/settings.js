// views/settings.js — child-accessible settings:
// theme, name+emoji, mute, suggested-time toggle,
// per-day schedule editor (shared with parent.js),
// templates editor (presets) with reusable task modal.

import { get, mutate, subscribe } from '../state.js';
import { TEMPLATE_NAMES, deleteTask } from '../tasks.js';
import { renderScheduleEditorHTML, bindScheduleEditor, openTaskModal } from '../schedule-editor.js';
import '../version.js'; // side-effect: sets self.APP_VERSION
import { checkForUpdates } from '../updater.js';

const THEMES = [
  { id: 'pastel',  label: 'Pastel',         emoji: '🎀' },
  { id: 'bw',      label: 'Black & White',  emoji: '⚫' },
  { id: 'galaxy',  label: 'Galaxy',         emoji: '🌌' },
  { id: 'train',   label: 'Train',          emoji: '🚂' },
  { id: 'girly',   label: 'Cute Girly',     emoji: '💖' },
  { id: 'unicorn', label: 'Unicorn',        emoji: '🦄' }
];

const EMOJI_SUGGESTIONS = ['⭐','🌟','🦄','🐱','🐶','🐰','🦊','🐸','🦋','🌈','🍓','🎀','🚂','🦖','🐼'];

const TEMPLATE_DISPLAY = {
  normal:  '🌤 Normal day',
  weekend: '🌈 Weekend',
  holiday: '🏖 Holiday'
};

let mountedContainer = null;
let unsubscribe = null;
let updateCheckState = 'idle'; // 'idle' | 'checking' | 'up-to-date' | 'error'
let updateCheckClearTimer = null;

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
    container.addEventListener('schedule-editor:redraw', () => { if (mountedContainer) draw(); });
  }
  draw();
}

function draw() {
  if (!mountedContainer) return;
  const state = get();

  mountedContainer.innerHTML = `
    <div class="settings-header">
      <h1 class="page-title">⚙️ Settings</h1>
    </div>

    <div class="card settings-section">
      <h2 class="section-title">🎨 Theme</h2>
      <div class="theme-grid">
        ${THEMES.map(t => themeOptionHtml(t, state.settings.theme === t.id)).join('')}
      </div>
    </div>

    <div class="card settings-section">
      <h2 class="section-title">👤 Your Name</h2>
      <div class="field">
        <label class="field-label" for="setting-name">What should we call you?</label>
        <input id="setting-name" class="field-input" type="text" maxlength="20"
               value="${escapeAttr(state.child.name)}" placeholder="Your name" />
      </div>
      <div class="field">
        <label class="field-label">Pick an emoji</label>
        <div class="emoji-picker">
          <input id="setting-emoji" class="field-input emoji-input" type="text" maxlength="2"
                 value="${escapeAttr(state.child.emoji)}" />
          <div class="emoji-swatches">
            ${EMOJI_SUGGESTIONS.map(e => `<button class="emoji-swatch" data-emoji="${escapeAttr(e)}">${e}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="card settings-section">
      <h2 class="section-title">🔊 Sound</h2>
      <label class="toggle-row">
        <span>Music & sounds</span>
        <input type="checkbox" id="setting-muted" ${!state.settings.muted ? 'checked' : ''} />
        <span class="toggle-pill" aria-hidden="true"></span>
      </label>
    </div>

    <div class="card settings-section">
      <h2 class="section-title">⏰ Task Times</h2>
      <label class="toggle-row">
        <span>Show suggested times on task cards</span>
        <input type="checkbox" id="setting-show-times" ${state.settings.showSuggestedTimes ? 'checked' : ''} />
        <span class="toggle-pill" aria-hidden="true"></span>
      </label>
    </div>

    <div class="card settings-section">
      <h2 class="section-title">📅 My Week</h2>
      ${renderScheduleEditorHTML()}
    </div>

    <div class="card settings-section">
      <h2 class="section-title">✨ Edit templates (presets)</h2>
      <p class="muted small">Templates are starting points you can apply to days. Editing a template does <strong>not</strong> change days you've already set up — use a day's "Reset" button to refresh it.</p>
    </div>

    ${TEMPLATE_NAMES.map(t => templateEditorHtml(t, state.templates[t] || [])).join('')}

    ${versionSectionHtml()}
  `;

  bindEvents();
  bindScheduleEditor(mountedContainer);
}

function versionSectionHtml() {
  const checking = updateCheckState === 'checking';
  let status = '';
  if (updateCheckState === 'up-to-date') {
    status = `<div class="version-status">✨ You're up to date</div>`;
  } else if (updateCheckState === 'error') {
    status = `<div class="version-status version-status-error">⚠️ Couldn't check — try again</div>`;
  }
  return `
    <div class="version-section">
      <div class="version-row">
        <span class="version-label">v${self.APP_VERSION}</span>
        <button class="version-check-btn" id="version-check-btn" ${checking ? 'disabled' : ''}>
          ${checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      ${status}
    </div>
  `;
}

function setUpdateCheckState(next) {
  updateCheckState = next;
  if (mountedContainer) draw();
}

function templateEditorHtml(name, tasks) {
  return `
    <div class="card settings-section">
      <h2 class="section-title">${TEMPLATE_DISPLAY[name]} template</h2>
      <div class="template-tasks">
        ${tasks.length === 0
          ? '<p class="muted">No tasks yet. Tap "Add task" to start.</p>'
          : tasks.map(t => taskRowHtml(name, t)).join('')
        }
      </div>
      <button class="btn-primary template-add" data-template="${name}">+ Add task</button>
    </div>
  `;
}

function taskRowHtml(template, task) {
  return `
    <div class="task-row">
      <span class="task-row-emoji">${escapeHtml(task.emoji || '⭐')}</span>
      <span class="task-row-name">${escapeHtml(task.name || '')}</span>
      <span class="task-row-period">${task.period === 'evening' ? '🌙' : '☀️'}</span>
      ${task.time ? `<span class="task-row-time">${escapeHtml(task.time)}</span>` : ''}
      <button class="task-row-edit"   data-edit-task="${escapeAttr(task.id)}"   data-template="${template}">✏️</button>
      <button class="task-row-delete" data-delete-task="${escapeAttr(task.id)}" data-template="${template}">🗑</button>
    </div>
  `;
}

function bindEvents() {
  // Themes
  mountedContainer.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => mutate(s => { s.settings.theme = btn.dataset.theme; }));
  });

  // Name + emoji
  const nameInput = mountedContainer.querySelector('#setting-name');
  if (nameInput) nameInput.addEventListener('input', () => mutate(s => { s.child.name = nameInput.value.trim(); }));
  const emojiInput = mountedContainer.querySelector('#setting-emoji');
  if (emojiInput) emojiInput.addEventListener('input', () => mutate(s => { s.child.emoji = emojiInput.value || '⭐'; }));
  mountedContainer.querySelectorAll('.emoji-swatch[data-emoji]').forEach(b => {
    b.addEventListener('click', () => {
      const e = b.dataset.emoji;
      if (emojiInput) emojiInput.value = e;
      mutate(s => { s.child.emoji = e; });
    });
  });

  // Toggles
  const muted = mountedContainer.querySelector('#setting-muted');
  if (muted) muted.addEventListener('change', () => mutate(s => { s.settings.muted = !muted.checked; }));
  const showTimes = mountedContainer.querySelector('#setting-show-times');
  if (showTimes) showTimes.addEventListener('change', () => mutate(s => { s.settings.showSuggestedTimes = showTimes.checked; }));

  // Check for updates
  const checkBtn = mountedContainer.querySelector('#version-check-btn');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      if (updateCheckState === 'checking') return;
      if (updateCheckClearTimer) { clearTimeout(updateCheckClearTimer); updateCheckClearTimer = null; }
      setUpdateCheckState('checking');
      try {
        const result = await checkForUpdates();
        if (result === 'update-found') {
          // The auto-banner is now showing — it IS the answer. Reset the button.
          setUpdateCheckState('idle');
        } else if (result === 'no-sw') {
          // Service worker not registered (e.g. file:// or unsupported browser).
          setUpdateCheckState('error');
          updateCheckClearTimer = setTimeout(() => setUpdateCheckState('idle'), 3000);
        } else {
          setUpdateCheckState('up-to-date');
          updateCheckClearTimer = setTimeout(() => setUpdateCheckState('idle'), 3000);
        }
      } catch (err) {
        console.error('[update-check] failed:', err);
        setUpdateCheckState('error');
        updateCheckClearTimer = setTimeout(() => setUpdateCheckState('idle'), 3000);
      }
    });
  }

  // Templates editor — add/edit/delete (uses shared modal)
  mountedContainer.querySelectorAll('.template-add').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal({ target: 'template', key: btn.dataset.template, taskId: null }));
  });
  mountedContainer.querySelectorAll('[data-edit-task]').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal({ target: 'template', key: btn.dataset.template, taskId: btn.dataset.editTask }));
  });
  mountedContainer.querySelectorAll('[data-delete-task]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this task from the template?')) return;
      deleteTask(btn.dataset.template, btn.dataset.deleteTask);
    });
  });
}

function themeOptionHtml(theme, active) {
  return `
    <button class="theme-option ${active ? 'active' : ''}" data-theme="${theme.id}">
      <div class="theme-swatch theme-swatch-${theme.id}"></div>
      <div class="theme-label">${theme.emoji} ${theme.label}</div>
    </button>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
