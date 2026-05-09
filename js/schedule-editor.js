// schedule-editor.js — shared per-day accordion editor + quick-apply,
// used by both the kid-facing Settings view and the Parent menu.
//
// Usage:
//   container.innerHTML = `... ${renderScheduleEditorHTML()} ...`;
//   bindScheduleEditor(container);
//
// The module also owns the task-add/edit modal, which the templates editor
// in settings.js imports as well.

import { get, mutate } from './state.js';
import {
  DAYS_OF_WEEK, TEMPLATE_NAMES,
  addTask, updateTask, deleteTask,
  addTaskToDay, updateTaskInDay, deleteTaskFromDay,
  resetDayToTemplate, dayDiffersFromTemplate,
  applyTemplateToDays, newTaskId
} from './tasks.js';

const DAY_DISPLAY = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
};
const DAY_SHORT = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};
const TEMPLATE_DISPLAY = {
  normal:  '🌤 Normal day',
  weekend: '🌈 Weekend',
  holiday: '🏖 Holiday'
};
const TASK_EMOJI_SUGGESTIONS = ['🦷','🛁','👕','🥣','📚','🎒','🍎','💧','🧹','📖','💤','🧴','🌅','🚶','🎵','🏃','🎨','🎮','🐕','🌳','⚽','🎹','🖌','🧮'];

// Module-level UI state (preserved across re-renders of the host view)
let expandedDay = null;
let bulkTemplate = 'normal';
let bulkDays = new Set();

// ---------- Render ----------

export function renderScheduleEditorHTML() {
  const state = get();
  return `
    <div class="schedule-editor" data-schedule-editor>
      <p class="muted small">Tap a day to add or remove its tasks. Each day is independent — edit Wednesday without touching Tuesday.</p>
      <div class="day-accordion">
        ${DAYS_OF_WEEK.map(d => dayCellHtml(d, state)).join('')}
      </div>

      ${quickApplyHtml(state)}
    </div>
  `;
}

function dayCellHtml(day, state) {
  const tasks = state.weekSchedule[day] || [];
  const tplName = state.dayTemplateMap[day] || 'normal';
  const isExpanded = expandedDay === day;
  const customised = dayDiffersFromTemplate(day);

  return `
    <div class="day-row ${isExpanded ? 'open' : ''}">
      <button class="day-row-header" data-day-toggle="${day}" aria-expanded="${isExpanded}">
        <span class="day-row-name">${DAY_DISPLAY[day]}</span>
        <span class="day-row-meta">
          <span class="day-row-template">${TEMPLATE_DISPLAY[tplName] || tplName}</span>
          ${customised ? '<span class="day-row-flag" title="Customised">✏️</span>' : ''}
          <span class="day-row-count">${tasks.length} task${tasks.length === 1 ? '' : 's'}</span>
        </span>
        <span class="day-row-chevron">${isExpanded ? '▾' : '▸'}</span>
      </button>
      ${isExpanded ? `
        <div class="day-row-body">
          ${tasks.length === 0
            ? '<p class="muted">No tasks yet. Tap "+ Add task" to create one.</p>'
            : tasks.map(t => taskRowHtml(day, t)).join('')
          }
          <div class="day-row-actions">
            <button class="btn-primary" data-day-add="${day}">+ Add task</button>
            ${customised
              ? `<button class="btn-secondary" data-day-reset="${day}">🔄 Reset to ${TEMPLATE_DISPLAY[tplName]}</button>`
              : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function taskRowHtml(day, task) {
  return `
    <div class="task-row">
      <span class="task-row-emoji">${escapeHtml(task.emoji || '⭐')}</span>
      <span class="task-row-name">${escapeHtml(task.name || '')}</span>
      <span class="task-row-period">${task.period === 'evening' ? '🌙' : '☀️'}</span>
      ${task.time ? `<span class="task-row-time">${escapeHtml(task.time)}</span>` : ''}
      <button class="task-row-edit"   data-day-edit="${day}"   data-task-id="${escapeAttr(task.id)}" aria-label="Edit">✏️</button>
      <button class="task-row-delete" data-day-delete="${day}" data-task-id="${escapeAttr(task.id)}" aria-label="Delete">🗑</button>
    </div>
  `;
}

function quickApplyHtml(state) {
  return `
    <div class="bulk-apply">
      <h3 class="subsection-title">Quick apply a template to days</h3>
      <p class="muted small">This <strong>overwrites</strong> the selected days' tasks with a fresh copy of the chosen template.</p>
      <div class="bulk-row">
        <label class="field-label">Apply</label>
        <select class="field-select" data-bulk-template>
          ${TEMPLATE_NAMES.map(t => `<option value="${t}" ${bulkTemplate === t ? 'selected' : ''}>${TEMPLATE_DISPLAY[t]}</option>`).join('')}
        </select>
      </div>
      <div class="bulk-row">
        <label class="field-label">to days</label>
        <div class="bulk-days">
          ${DAYS_OF_WEEK.map(d => `
            <label class="bulk-day-chip ${bulkDays.has(d) ? 'selected' : ''}">
              <input type="checkbox" data-bulk-day="${d}" ${bulkDays.has(d) ? 'checked' : ''} />
              <span>${DAY_SHORT[d]}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="bulk-actions">
        <button class="btn-secondary" data-bulk-shortcut="weekdays">Mon–Fri</button>
        <button class="btn-secondary" data-bulk-shortcut="weekend">Sat+Sun</button>
        <button class="btn-secondary" data-bulk-shortcut="clear">Clear</button>
        <button class="btn-primary" data-bulk-apply ${bulkDays.size === 0 ? 'disabled' : ''}>Apply</button>
      </div>
    </div>
  `;
}

// ---------- Bind ----------

export function bindScheduleEditor(container) {
  const root = container.querySelector('[data-schedule-editor]');
  if (!root) return;

  // Accordion toggle
  root.querySelectorAll('[data-day-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.dayToggle;
      expandedDay = (expandedDay === day) ? null : day;
      requestRedraw(container);
    });
  });

  // Per-day add/edit/delete
  root.querySelectorAll('[data-day-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      openTaskModal({ target: 'day', key: btn.dataset.dayAdd, taskId: null });
    });
  });
  root.querySelectorAll('[data-day-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      openTaskModal({ target: 'day', key: btn.dataset.dayEdit, taskId: btn.dataset.taskId });
    });
  });
  root.querySelectorAll('[data-day-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this task from the day?')) return;
      deleteTaskFromDay(btn.dataset.dayDelete, btn.dataset.taskId);
    });
  });

  // Reset day to template
  root.querySelectorAll('[data-day-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.dayReset;
      const tplName = get().dayTemplateMap[day] || 'normal';
      if (!confirm(`Replace ${DAY_DISPLAY[day]} with the ${TEMPLATE_DISPLAY[tplName]} template? This loses your custom changes for that day.`)) return;
      resetDayToTemplate(day);
    });
  });

  // Quick apply
  const tplSel = root.querySelector('[data-bulk-template]');
  if (tplSel) tplSel.addEventListener('change', () => { bulkTemplate = tplSel.value; });

  root.querySelectorAll('[data-bulk-day]').forEach(cb => {
    cb.addEventListener('change', () => {
      const d = cb.dataset.bulkDay;
      if (cb.checked) bulkDays.add(d); else bulkDays.delete(d);
      requestRedraw(container);
    });
  });

  root.querySelectorAll('[data-bulk-shortcut]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.bulkShortcut;
      if      (which === 'weekdays') bulkDays = new Set(['monday','tuesday','wednesday','thursday','friday']);
      else if (which === 'weekend')  bulkDays = new Set(['saturday','sunday']);
      else                            bulkDays = new Set();
      requestRedraw(container);
    });
  });

  const applyBtn = root.querySelector('[data-bulk-apply]');
  if (applyBtn) applyBtn.addEventListener('click', () => {
    if (bulkDays.size === 0) return;
    const targets = [...bulkDays];
    const customised = targets.filter(d => dayDiffersFromTemplate(d));
    if (customised.length) {
      const list = customised.map(d => DAY_DISPLAY[d]).join(', ');
      if (!confirm(`${list} ${customised.length === 1 ? 'has' : 'have'} custom tasks. Replace with ${TEMPLATE_DISPLAY[bulkTemplate]}?`)) return;
    }
    applyTemplateToDays(bulkTemplate, targets);
    bulkDays = new Set();
    showToast(`Applied ${TEMPLATE_DISPLAY[bulkTemplate]} to ${targets.length} day${targets.length === 1 ? '' : 's'} ✨`);
  });
}

// ---------- Task modal (shared with templates editor in settings.js) ----------

export function openTaskModal({ target, key, taskId }) {
  const state = get();
  const list = target === 'day'
    ? (state.weekSchedule[key] || [])
    : (state.templates[key] || []);
  const existing = taskId
    ? list.find(t => t.id === taskId)
    : { id: null, name: '', emoji: '⭐', time: '', period: 'morning' };
  if (!existing) return;

  const titleSuffix = target === 'day' ? DAY_DISPLAY[key] : TEMPLATE_DISPLAY[key] || key;

  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" role="dialog" aria-label="Edit task">
        <div class="modal-header">
          <h2>${taskId ? 'Edit' : 'New'} task — ${escapeHtml(titleSuffix)}</h2>
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
    const name   = host.querySelector('#task-name').value.trim();
    const emoji  = emojiInput.value || '⭐';
    const time   = host.querySelector('#task-time').value || '';
    const period = host.querySelector('input[name="period"]:checked')?.value || 'morning';
    if (!name) { alert('Please give your task a name'); return; }

    if (target === 'day') {
      if (taskId) updateTaskInDay(key, taskId, { name, emoji, time, period });
      else        addTaskToDay(key, { id: newTaskId(), name, emoji, time, period });
    } else {
      if (taskId) updateTask(key, taskId, { name, emoji, time, period });
      else        addTask(key, { id: newTaskId(), name, emoji, time, period });
    }
    close();
  });
}

// ---------- Helpers ----------

function requestRedraw(container) {
  // Trigger a state change on no-op so subscribers redraw the host view.
  // We use a touched-at sentinel inside settings/notifications, but simpler:
  // dispatch a custom event the host view listens for.
  container.dispatchEvent(new CustomEvent('schedule-editor:redraw', { bubbles: true }));
}

function showToast(message) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
