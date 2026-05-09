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
  const tplName = getTemplateNameForDate();
  return get().templates[tplName] || [];
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
    for (const day of dayNames) s.dayTemplateMap[day] = templateName;
  });
}

export function getDayHistory(dateKey = getTodayKey()) {
  const raw = get().history[dateKey];
  return {
    completed: raw?.completed || [],
    stamped: !!raw?.stamped,
    removedStars: raw?.removedStars || []
  };
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

export function markStampedToday() {
  const dateKey = getTodayKey();
  mutate(s => {
    if (!s.history[dateKey]) s.history[dateKey] = { completed: [], stamped: false };
    s.history[dateKey].stamped = true;
  });
}

export function totalStars() {
  const { earned, removed } = get().stars;
  return Math.max(0, earned - removed);
}

export function newTaskId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
