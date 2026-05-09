// views/settings.js — child-accessible settings:
// theme, name+emoji, mute, suggested-time toggle, day-of-week mapping,
// bulk apply, template editors (add/edit/delete tasks).

import { get, mutate, subscribe } from '../state.js';
import {
  DAYS_OF_WEEK, TEMPLATE_NAMES,
  addTask, updateTask, deleteTask, applyTemplateToDays, newTaskId
} from '../tasks.js';

const THEMES = [
  { id: 'pastel',  label: 'Pastel',         emoji: '🎀' },
  { id: 'bw',      label: 'Black & White',  emoji: '⚫' },
  { id: 'galaxy',  label: 'Galaxy',         emoji: '🌌' },
  { id: 'train',   label: 'Train',          emoji: '🚂' },
  { id: 'girly',   label: 'Cute Girly',     emoji: '💖' },
  { id: 'unicorn', label: 'Unicorn',        emoji: '🦄' }
];

const EMOJI_SUGGESTIONS = ['⭐','🌟','🦄','🐱','🐶','🐰','🦊','🐸','🦋','🌈','🍓','🎀','🚂','🦖','🐼'];

const TASK_EMOJI_SUGGESTIONS = ['🦷','🛁','👕','🥣','📚','🎒','🍎','💧','🧹','📖','💤','🧴','🌅','🚶','🎵','🏃','🎨','🎮','🐕','🌳'];

const TEMPLATE_DISPLAY = { normal: '🌤 Normal day', weekend: '🌈 Weekend', holiday: '🏖 Holiday' };
const DAY_DISPLAY = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};

let mountedContainer = null;
let unsubscribe = null;
let bulkSelection = { template: 'normal', days: new Set() };

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
      <p class="muted">Each day uses a template. Tap a day to change which template it uses.</p>
      <div class="day-grid">
        ${DAYS_OF_WEEK.map(d => dayCellHtml(d, state.dayTemplateMap[d])).join('')}
      </div>

      <div class="bulk-apply">
        <h3 class="subsection-title">Quick apply</h3>
        <div class="bulk-row">
          <label class="field-label">Apply</label>
          <select class="field-select" id="bulk-template">
            ${TEMPLATE_NAMES.map(t => `<option value="${t}" ${bulkSelection.template === t ? 'selected' : ''}>${TEMPLATE_DISPLAY[t]}</option>`).join('')}
          </select>
        </div>
        <div class="bulk-row">
          <label class="field-label">to days</label>
          <div class="bulk-days">
            ${DAYS_OF_WEEK.map(d => `
              <label class="bulk-day-chip ${bulkSelection.days.has(d) ? 'selected' : ''}">
                <input type="checkbox" data-bulk-day="${d}" ${bulkSelection.days.has(d) ? 'checked' : ''} />
                <span>${DAY_DISPLAY[d]}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bulk-actions">
          <button class="btn-secondary" id="bulk-weekdays">Mon–Fri</button>
          <button class="btn-secondary" id="bulk-weekend">Sat+Sun</button>
          <button class="btn-secondary" id="bulk-clear">Clear</button>
          <button class="btn-primary" id="bulk-apply" ${bulkSelection.days.size === 0 ? 'disabled' : ''}>Apply</button>
        </div>
      </div>
    </div>

    ${TEMPLATE_NAMES.map(t => templateEditorHtml(t, state.templates[t] || [])).join('')}
  `;

  bindEvents();
}

function dayCellHtml(day, currentTemplate) {
  return `
    <button class="day-cell" data-day="${day}">
      <div class="day-cell-name">${DAY_DISPLAY[day]}</div>
      <div class="day-cell-template">${TEMPLATE_DISPLAY[currentTemplate || 'normal']}</div>
    </button>
  `;
}

function templateEditorHtml(name, tasks) {
  return `
    <div class="card settings-section">
      <h2 class="section-title">${TEMPLATE_DISPLAY[name]} template</h2>
      <div class="template-tasks">
        ${tasks.length === 0
          ? '<p class="muted">No tasks yet. Tap “Add task” to start.</p>'
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
      <button class="task-row-edit" data-edit-task="${escapeAttr(task.id)}" data-template="${template}">✏️</button>
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
  mountedContainer.querySelectorAll('.emoji-swatch').forEach(b => {
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

  // Day cells — cycle template
  mountedContainer.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const day = cell.dataset.day;
      const current = get().dayTemplateMap[day] || 'normal';
      const idx = TEMPLATE_NAMES.indexOf(current);
      const next = TEMPLATE_NAMES[(idx + 1) % TEMPLATE_NAMES.length];
      mutate(s => { s.dayTemplateMap[day] = next; });
    });
  });

  // Bulk apply
  const tplSelect = mountedContainer.querySelector('#bulk-template');
  if (tplSelect) tplSelect.addEventListener('change', () => { bulkSelection.template = tplSelect.value; });

  mountedContainer.querySelectorAll('[data-bulk-day]').forEach(cb => {
    cb.addEventListener('change', () => {
      const day = cb.dataset.bulkDay;
      if (cb.checked) bulkSelection.days.add(day); else bulkSelection.days.delete(day);
      draw();
    });
  });

  const setDays = (set) => {
    bulkSelection.days = new Set(set);
    draw();
  };
  mountedContainer.querySelector('#bulk-weekdays')?.addEventListener('click', () => setDays(['monday','tuesday','wednesday','thursday','friday']));
  mountedContainer.querySelector('#bulk-weekend')?.addEventListener('click', () => setDays(['saturday','sunday']));
  mountedContainer.querySelector('#bulk-clear')?.addEventListener('click', () => setDays([]));
  mountedContainer.querySelector('#bulk-apply')?.addEventListener('click', () => {
    if (bulkSelection.days.size === 0) return;
    applyTemplateToDays(bulkSelection.template, [...bulkSelection.days]);
    showToast(`Applied ${TEMPLATE_DISPLAY[bulkSelection.template]} to ${bulkSelection.days.size} day(s) ✨`);
    bulkSelection.days = new Set();
  });

  // Template editors — add/edit/delete
  mountedContainer.querySelectorAll('.template-add').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.template, null));
  });
  mountedContainer.querySelectorAll('[data-edit-task]').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.template, btn.dataset.editTask));
  });
  mountedContainer.querySelectorAll('[data-delete-task]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = btn.dataset.template;
      const id = btn.dataset.deleteTask;
      if (confirm('Delete this task?')) deleteTask(tpl, id);
    });
  });
}

// ---------- Task modal ----------

function openTaskModal(templateName, taskId) {
  const state = get();
  const existing = taskId
    ? state.templates[templateName].find(t => t.id === taskId)
    : { id: null, name: '', emoji: '⭐', time: '', period: 'morning' };
  if (!existing) return;

  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" role="dialog" aria-label="Edit task">
        <div class="modal-header">
          <h2>${taskId ? 'Edit task' : 'New task'}</h2>
        </div>
        <div class="modal-body">
          <div class="field">
            <label class="field-label">Task name</label>
            <input id="task-name" class="field-input" type="text" maxlength="40" value="${escapeAttr(existing.name)}" placeholder="e.g. Brush teeth" />
          </div>
          <div class="field">
            <label class="field-label">Emoji</label>
            <input id="task-emoji" class="field-input emoji-input" type="text" maxlength="2" value="${escapeAttr(existing.emoji)}" />
            <div class="emoji-swatches">
              ${TASK_EMOJI_SUGGESTIONS.map(e => `<button class="emoji-swatch" data-task-emoji="${escapeAttr(e)}">${e}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label class="field-label">Time of day</label>
            <div class="period-toggle">
              <label><input type="radio" name="period" value="morning" ${existing.period === 'morning' ? 'checked' : ''} /> ☀️ Morning</label>
              <label><input type="radio" name="period" value="evening" ${existing.period === 'evening' ? 'checked' : ''} /> 🌙 Evening</label>
            </div>
          </div>
          <div class="field">
            <label class="field-label">Suggested time (optional)</label>
            <input id="task-time" class="field-input" type="time" value="${escapeAttr(existing.time)}" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="task-cancel">Cancel</button>
          <button class="btn-primary" id="task-save">Save</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { host.innerHTML = ''; };

  host.querySelector('#task-cancel').addEventListener('click', close);
  host.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target === host.querySelector('.modal-overlay')) close();
  });

  const emojiInput = host.querySelector('#task-emoji');
  host.querySelectorAll('[data-task-emoji]').forEach(b => {
    b.addEventListener('click', () => { emojiInput.value = b.dataset.taskEmoji; });
  });

  host.querySelector('#task-save').addEventListener('click', () => {
    const name = host.querySelector('#task-name').value.trim();
    const emoji = emojiInput.value || '⭐';
    const time = host.querySelector('#task-time').value || '';
    const period = host.querySelector('input[name="period"]:checked')?.value || 'morning';
    if (!name) {
      alert('Please give your task a name');
      return;
    }
    if (taskId) {
      updateTask(templateName, taskId, { name, emoji, time, period });
    } else {
      addTask(templateName, { id: newTaskId(), name, emoji, time, period });
    }
    close();
  });
}

function showToast(message) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => { t.remove(); }, 2500);
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
