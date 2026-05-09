// views/main.js — greeting, Morning/Evening tabs (default at 13:00),
// task cards with bounce, progress bar, confetti, stamp, holiday button.

import { get, subscribe } from '../state.js';
import {
  getTodayKey, getCurrentPeriod, getTodayTasks, isTaskCompleteToday,
  toggleTaskComplete, setHolidayToday, clearHolidayToday, totalStars,
  getTemplateNameForDate, getDayHistory, markStampedToday, isStarRemoved,
  setTodayOverride
} from '../tasks.js';
import { playSfx } from '../audio.js';

const TEMPLATE_DISPLAY = {
  normal:  '🌤 Normal day',
  weekend: '🌈 Weekend',
  holiday: '🏖 Holiday'
};

const ENCOURAGEMENTS = [
  'You did it! 🎉',
  'Amazing work! 💪',
  'Superstar! ⭐',
  "You're crushing it! 🚀",
  'High five! ✋',
  'Brilliant! ✨',
  "You're on fire! 🔥",
  'Way to go! 🌈',
  'Pure magic! 🪄',
  'Unstoppable! 🏆'
];

const CONFETTI_COLORS = ['#FF6B9D', '#FFD166', '#06D6A0', '#118AB2', '#A78BFA', '#FF9770'];

let mountedContainer = null;
let unsubscribe = null;
let activePeriod = null;
let lastDayKey = null;
let pendingBounceId = null;

export function render(container) {
  mountedContainer = container;
  if (!unsubscribe) {
    unsubscribe = subscribe(() => { if (mountedContainer) draw(); });
  }
  const today = getTodayKey();
  if (lastDayKey !== today) {
    activePeriod = getCurrentPeriod();
    lastDayKey = today;
  }
  if (activePeriod === null) activePeriod = getCurrentPeriod();
  draw();
}

function draw() {
  if (!mountedContainer) return;
  const state = get();
  const allTasks = getTodayTasks();
  const periodTasks = allTasks.filter(t => t.period === activePeriod);
  const completedCount = periodTasks.filter(t => isTaskCompleteToday(t.id)).length;
  const total = periodTasks.length;
  const allDone = total > 0 && completedCount === total;
  const todayKey = getTodayKey();
  const isHoliday = state.dayOverrides[todayKey] === 'holiday';
  const tplName = getTemplateNameForDate();
  const stamped = getDayHistory().stamped[activePeriod];

  mountedContainer.innerHTML = `
    <header class="main-header">
      <div class="greeting">${greetingFor(new Date())}, <strong>${escapeHtml(state.child.name) || 'friend'}</strong> ${escapeHtml(state.child.emoji || '⭐')}</div>
      <div class="date-line">${formatDate(new Date())} <span class="time-line">· ${formatTime(new Date())}</span></div>
    </header>

    <div class="tabs" role="tablist">
      <button class="tab ${activePeriod === 'morning' ? 'active' : ''}" data-period="morning" role="tab">☀️ Morning</button>
      <button class="tab ${activePeriod === 'evening' ? 'active' : ''}" data-period="evening" role="tab">🌙 Evening</button>
    </div>

    ${stamped ? `<div class="stamp-badge" aria-label="All done today">🌟 All done today!</div>` : ''}

    <div class="task-list">
      ${total === 0
        ? renderEmptyState(state, activePeriod, tplName)
        : periodTasks.map(t => taskCardHtml(t, state.settings.showSuggestedTimes)).join('')
      }
    </div>

    ${allDone ? renderAllDoneBanner() : ''}

    <div class="progress-card card">
      <div class="progress-row">
        <div class="progress-label">${completedCount} of ${total} done</div>
        <div class="stars-line">⭐ <strong>${totalStars()}</strong> stars</div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${total ? Math.round(100 * completedCount / total) : 0}%"></div>
      </div>
    </div>

    <button class="holiday-btn ${isHoliday ? 'active' : ''}" id="holiday-btn">
      ${isHoliday ? '✓ Holiday mode on — tap to switch back' : '🏖 Today is a holiday!'}
    </button>

    <div class="template-tag">Today's template: <strong>${escapeHtml(tplName)}</strong></div>
  `;

  bindEvents();

  if (pendingBounceId) {
    const card = mountedContainer.querySelector(`[data-task-id="${cssEscape(pendingBounceId)}"]`);
    if (card) {
      card.classList.add('bouncing');
      setTimeout(() => card.classList.remove('bouncing'), 420);
    }
    pendingBounceId = null;
  }

  if (allDone && !stamped) {
    burstConfetti();
    playSfx('confetti');
    markStampedToday(activePeriod);
  }
}

function cssEscape(s) {
  if (window.CSS?.escape) return window.CSS.escape(s);
  return String(s).replace(/(["\\])/g, '\\$1');
}

function taskCardHtml(task, showTimes) {
  const done = isTaskCompleteToday(task.id);
  const punished = done && isStarRemoved(getTodayKey(), task.id);
  return `
    <button class="task-card ${done ? 'done' : ''} ${punished ? 'punished' : ''}" data-task-id="${escapeAttr(task.id)}">
      <span class="task-emoji">${escapeHtml(task.emoji || '⭐')}</span>
      <span class="task-name">${escapeHtml(task.name || 'Task')}</span>
      ${(showTimes && task.time) ? `<span class="task-time">${escapeHtml(task.time)}</span>` : ''}
      <span class="task-check">${done ? (punished ? '❌' : '✅') : '○'}</span>
    </button>
  `;
}

function renderAllDoneBanner() {
  const message = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
  return `
    <div class="all-done-banner">
      <div class="all-done-emoji">🎉</div>
      <div class="all-done-title">${escapeHtml(message)}</div>
      <div class="all-done-sub">All ${activePeriod} tasks complete!</div>
    </div>
  `;
}

function renderEmptyState(state, period, currentTplName) {
  const dayName = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  const otherTpls = ['normal', 'weekend', 'holiday'].filter(t => t !== currentTplName);
  const switchableTpls = otherTpls.filter(t =>
    (state.templates[t] || []).some(task => task.period === period)
  );

  return `
    <div class="empty-card card">
      <div class="empty-emoji">📋</div>
      <div class="empty-title">No ${period} tasks yet</div>
      <div class="empty-body">
        Today is <strong>${escapeHtml(dayName)}</strong> — using your
        <strong>${TEMPLATE_DISPLAY[currentTplName] || currentTplName}</strong> template (empty for ${period}).
      </div>
      <div class="empty-actions">
        ${switchableTpls.map(t => `
          <button class="btn-primary" data-use-today="${escapeAttr(t)}">
            Use ${TEMPLATE_DISPLAY[t]} today
          </button>
        `).join('')}
        <button class="btn-secondary" data-nav="settings">
          ✏️ Edit ${TEMPLATE_DISPLAY[currentTplName] || currentTplName} template
        </button>
      </div>
    </div>
  `;
}

function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function bindEvents() {
  mountedContainer.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activePeriod = btn.dataset.period;
      draw();
    });
  });
  mountedContainer.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const wasDone = card.classList.contains('done');
      pendingBounceId = card.dataset.taskId;
      toggleTaskComplete(card.dataset.taskId);
      if (!wasDone) playSfx('tick');
    });
  });
  const holidayBtn = mountedContainer.querySelector('#holiday-btn');
  if (holidayBtn) {
    holidayBtn.addEventListener('click', () => {
      const todayKey = getTodayKey();
      if (get().dayOverrides[todayKey] === 'holiday') clearHolidayToday();
      else setHolidayToday();
    });
  }

  mountedContainer.querySelectorAll('[data-use-today]').forEach(btn => {
    btn.addEventListener('click', () => setTodayOverride(btn.dataset.useToday));
  });
}

function burstConfetti() {
  const host = document.getElementById('confetti-host');
  if (!host) return;
  host.innerHTML = '';
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    p.style.animationDuration = (2 + Math.random() * 2) + 's';
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    host.appendChild(p);
  }
  setTimeout(() => { host.innerHTML = ''; }, 5000);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// Periodic refresh: keeps the date/time line live and triggers next-day reset
// (lastDayKey check at top of render() handles day rollover).
setInterval(() => {
  if (mountedContainer && document.getElementById('view-main')?.hidden === false) {
    const today = getTodayKey();
    if (lastDayKey !== today) {
      activePeriod = getCurrentPeriod();
      lastDayKey = today;
    }
    draw();
  }
}, 30000);
