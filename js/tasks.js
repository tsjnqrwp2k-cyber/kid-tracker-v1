// tasks.js — task domain logic, day/period maths, completion + stars,
// + template/day CRUD helpers.

import { get, mutate } from './state.js';

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export const DAYS_OF_WEEK = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export const TEMPLATE_NAMES = ['normal','weekend','holiday'];

export function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentPeriod(date = new Date()) {
  return date.getHours() < 13 ? 'morning' : 'evening';
}

export function getDayName(date = new Date()) {
  return DAY_NAMES[date.getDay()];
}

export function getTemplateNameForDate(date = new Date()) {
  const key = getTodayKey(date);
  const state = get();
  if (state.dayOverrides[key]) return state.dayOverrides[key];
  const dayName = getDayName(date);
  return state.dayTemplateMap[dayName] || 'normal';
}

export function getTodayTasks() {
  const date = new Date();
  const key = getTodayKey(date);
  const state = get();
  // One-off date override: use the named preset directly (not customisable per date)
  if (state.dayOverrides[key]) {
    return state.templates[state.dayOverrides[key]] || [];
  }
  // Normal weekly use: per-day-of-week task list
  const dayName = getDayName(date);
  return state.weekSchedule[dayName] || [];
}

// ---------- Template CRUD ----------

export function addTask(templateName, task) {
  mutate(s => {
    if (!s.templates[templateName]) s.templates[templateName] = [];
    s.templates[templateName].push({
      id: task.id || newTaskId(),
      name: task.name || 'New task',
      emoji: task.emoji || '⭐',
      time: task.time || '',
      period: task.period || 'morning'
    });
  });
}

export function updateTask(templateName, taskId, patch) {
  mutate(s => {
    const list = s.templates[templateName];
    if (!list) return;
    const t = list.find(x => x.id === taskId);
    if (t) Object.assign(t, patch);
  });
}

export function deleteTask(templateName, taskId) {
  mutate(s => {
    const list = s.templates[templateName];
    if (!list) return;
    const idx = list.findIndex(x => x.id === taskId);
    if (idx >= 0) list.splice(idx, 1);
  });
}

export function setDayTemplate(dayName, templateName) {
  mutate(s => { s.dayTemplateMap[dayName] = templateName; });
}

export function applyTemplateToDays(templateName, dayNames) {
  mutate(s => {
    const src = s.templates[templateName] || [];
    for (const day of dayNames) {
      s.weekSchedule[day] = src.map(t => ({ ...t }));
      s.dayTemplateMap[day] = templateName;
    }
  });
}

// ---------- Per-day CRUD ----------

export function getDayTasks(dayName) {
  return get().weekSchedule[dayName] || [];
}

export function addTaskToDay(dayName, task) {
  mutate(s => {
    if (!s.weekSchedule[dayName]) s.weekSchedule[dayName] = [];
    s.weekSchedule[dayName].push({
      id:     task.id     || newTaskId(),
      name:   task.name   || 'New task',
      emoji:  task.emoji  || '⭐',
      time:   task.time   || '',
      period: task.period || 'morning'
    });
  });
}

export function updateTaskInDay(dayName, taskId, patch) {
  mutate(s => {
    const list = s.weekSchedule[dayName];
    if (!list) return;
    const t = list.find(x => x.id === taskId);
    if (t) Object.assign(t, patch);
  });
}

export function deleteTaskFromDay(dayName, taskId) {
  mutate(s => {
    const list = s.weekSchedule[dayName];
    if (!list) return;
    const idx = list.findIndex(x => x.id === taskId);
    if (idx >= 0) list.splice(idx, 1);
  });
}

export function resetDayToTemplate(dayName) {
  mutate(s => {
    const tplName = s.dayTemplateMap[dayName] || 'normal';
    s.weekSchedule[dayName] = (s.templates[tplName] || []).map(t => ({ ...t }));
  });
}

export function dayDiffersFromTemplate(dayName) {
  const s = get();
  const tplName = s.dayTemplateMap[dayName];
  const dayTasks = s.weekSchedule[dayName] || [];
  const tplTasks = s.templates[tplName] || [];
  if (dayTasks.length !== tplTasks.length) return true;
  const sig = (t) => `${t.id}|${t.name}|${t.emoji}|${t.time}|${t.period}`;
  const a = dayTasks.map(sig).slice().sort().join('\n');
  const b = tplTasks.map(sig).slice().sort().join('\n');
  return a !== b;
}

export function getDayHistory(dateKey = getTodayKey()) {
  const raw = get().history[dateKey];
  return {
    completed: raw?.completed || [],
    stamped: normalizeStamped(raw?.stamped),
    removedStars: raw?.removedStars || []
  };
}

function normalizeStamped(s) {
  // Legacy boolean: assume the stamp was for morning (older versions only marked once per day).
  if (typeof s === 'boolean') return { morning: s, evening: false };
  return { morning: !!s?.morning, evening: !!s?.evening };
}

export function isTaskCompleteToday(taskId) {
  return getDayHistory().completed.includes(taskId);
}

export function isStarRemoved(dateKey, taskId) {
  return getDayHistory(dateKey).removedStars.includes(taskId);
}

export function removeStar(dateKey, taskId) {
  mutate(s => {
    if (!s.history[dateKey]) s.history[dateKey] = { completed: [], stamped: false, removedStars: [] };
    if (!s.history[dateKey].removedStars) s.history[dateKey].removedStars = [];
    if (!s.history[dateKey].removedStars.includes(taskId)) {
      s.history[dateKey].removedStars.push(taskId);
      s.stars.removed += 1;
    }
  });
}

export function restoreStar(dateKey, taskId) {
  mutate(s => {
    const day = s.history[dateKey];
    if (!day?.removedStars) return;
    const idx = day.removedStars.indexOf(taskId);
    if (idx >= 0) {
      day.removedStars.splice(idx, 1);
      s.stars.removed = Math.max(0, s.stars.removed - 1);
    }
  });
}

export function toggleTaskComplete(taskId) {
  const dateKey = getTodayKey();
  mutate(s => {
    if (!s.history[dateKey]) s.history[dateKey] = { completed: [], stamped: false };
    const day = s.history[dateKey];
    const idx = day.completed.indexOf(taskId);
    if (idx >= 0) {
      day.completed.splice(idx, 1);
      s.stars.earned = Math.max(0, s.stars.earned - 1);
    } else {
      day.completed.push(taskId);
      s.stars.earned += 1;
    }
  });
}

export function setHolidayToday() {
  const dateKey = getTodayKey();
  mutate(s => { s.dayOverrides[dateKey] = 'holiday'; });
}

export function clearHolidayToday() {
  const dateKey = getTodayKey();
  mutate(s => { delete s.dayOverrides[dateKey]; });
}

export function setTodayOverride(templateName) {
  const dateKey = getTodayKey();
  mutate(s => { s.dayOverrides[dateKey] = templateName; });
}

export function clearTodayOverride() {
  const dateKey = getTodayKey();
  mutate(s => { delete s.dayOverrides[dateKey]; });
}

export function markStampedToday(period) {
  const dateKey = getTodayKey();
  mutate(s => {
    let day = s.history[dateKey];
    if (!day) {
      day = { completed: [], stamped: { morning: false, evening: false }, removedStars: [] };
      s.history[dateKey] = day;
    }
    // Migrate legacy boolean stamped → object
    if (typeof day.stamped === 'boolean') {
      day.stamped = { morning: day.stamped, evening: false };
    }
    if (!day.stamped) day.stamped = { morning: false, evening: false };
    if (period === 'morning' || period === 'evening') {
      day.stamped[period] = true;
    }
  });
}

export function totalStars() {
  const { earned, removed } = get().stars;
  return Math.max(0, earned - removed);
}

export function newTaskId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
