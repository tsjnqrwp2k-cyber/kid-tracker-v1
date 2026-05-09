// reminders.js — fires an in-app toast + chime when a task with a set time
// becomes due AND is still incomplete. Each minute fires at most once.

import { getTodayTasks, isTaskCompleteToday } from './tasks.js';
import { playSfx } from './audio.js';

let lastMinute = '';
let started = false;

export function initReminders() {
  if (started) return;
  started = true;
  tick();
  setInterval(tick, 30000);
}

function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const cur = `${hh}:${mm}`;
  if (cur === lastMinute) return;
  lastMinute = cur;

  const tasks = getTodayTasks();
  for (const t of tasks) {
    if (t.time === cur && !isTaskCompleteToday(t.id)) {
      showReminder(t);
    }
  }
}

function showReminder(task) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'toast reminder-toast';
  toast.innerHTML = `
    <span class="reminder-emoji">${task.emoji || '⏰'}</span>
    <div class="reminder-body">
      <div class="reminder-title">Don't forget! ⏰</div>
      <div class="reminder-task">${escapeHtml(task.name)}</div>
    </div>
    <button class="reminder-close" aria-label="Dismiss">✕</button>
  `;
  host.appendChild(toast);
  const dismiss = () => toast.remove();
  toast.querySelector('.reminder-close').addEventListener('click', dismiss);
  setTimeout(dismiss, 12000);
  playSfx('chime');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
