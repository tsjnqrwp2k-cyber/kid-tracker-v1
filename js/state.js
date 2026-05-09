// state.js — versioned localStorage persistence with debounced autosave.

const STORAGE_KEY = 'kt-state-v1';
const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 250;

const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  child: { name: '', emoji: '⭐' },
  templates: {
    normal:  [],   // [{id, name, emoji, time, period}]
    weekend: [],
    holiday: []
  },
  dayTemplateMap: {  // which template each day-of-week uses by default
    monday:    'normal',
    tuesday:   'normal',
    wednesday: 'normal',
    thursday:  'normal',
    friday:    'normal',
    saturday:  'weekend',
    sunday:    'weekend'
  },
  history: {},        // 'YYYY-MM-DD' → { completed: [taskId,...], stamped: bool }
  dayOverrides: {},   // 'YYYY-MM-DD' → 'holiday' (one-off override; "Today is a holiday" button)
  stars: { earned: 0, removed: 0 },
  vouchers: {
    earned: [],       // [{id, tier, earnedDate}]
    claimed: [],      // [{id, tier, earnedDate, claimedDate, label}]
    rewardLabels: { bronze: '', silver: '', gold: '', platinum: '' }
  },
  settings: {
    theme: 'pastel',
    showSuggestedTimes: true,
    muted: false,
    pin: '1234',
    pinChanged: false
  }
};

let state = null;
const listeners = new Set();
let saveTimer = null;

const clone = (obj) => JSON.parse(JSON.stringify(obj));

function migrate(loaded) {
  if (loaded?.schemaVersion === SCHEMA_VERSION) return loaded;
  return null;
}

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migrate(JSON.parse(raw));
      if (migrated) state = mergeDefaults(migrated);
    }
  } catch (err) {
    console.error('[state] load failed:', err);
  }
  if (!state) state = clone(DEFAULT_STATE);
  return state;
}

function mergeDefaults(loaded) {
  const d = clone(DEFAULT_STATE);
  return {
    ...d,
    ...loaded,
    child:          { ...d.child,          ...(loaded.child          || {}) },
    templates:      { ...d.templates,      ...(loaded.templates      || {}) },
    dayTemplateMap: { ...d.dayTemplateMap, ...(loaded.dayTemplateMap || {}) },
    stars:          { ...d.stars,          ...(loaded.stars          || {}) },
    vouchers: {
      ...d.vouchers,
      ...(loaded.vouchers || {}),
      rewardLabels: { ...d.vouchers.rewardLabels, ...((loaded.vouchers && loaded.vouchers.rewardLabels) || {}) }
    },
    settings:       { ...d.settings,       ...(loaded.settings       || {}) },
    history:        loaded.history      || {},
    dayOverrides:   loaded.dayOverrides || {}
  };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[state] save failed:', err);
  }
}

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

export function get() {
  return state || load();
}

export function mutate(fn) {
  if (!state) load();
  fn(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, SAVE_DEBOUNCE_MS);
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reset() {
  state = clone(DEFAULT_STATE);
  persist();
  notify();
}

export function exportJson() {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: state
  }, null, 2);
}

export function importJson(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Not a valid JSON file');
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Backup is from version ${parsed.schemaVersion}; this app is version ${SCHEMA_VERSION}`);
  }
  if (!parsed.data) throw new Error('Backup file is missing data');
  state = mergeDefaults(parsed.data);
  persist();
  notify();
}
