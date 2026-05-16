// ⚠️ When releasing, bump APP_VERSION below AND in js/version.js (the kid sees that one).
// The strings MUST match. Both are needed because the browser only detects an SW update
// when the BYTES of this file change — embedding the version here ensures that happens.
const APP_VERSION = '1.0.3';

const CACHE = 'kt-v' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/themes.css',
  './js/app.js',
  './js/version.js',
  './js/state.js',
  './js/schedule-editor.js',
  './js/tasks.js',
  './js/audio.js',
  './js/vouchers.js',
  './js/reminders.js',
  './js/updater.js',
  './js/views/main.js',
  './js/views/summary.js',
  './js/views/settings.js',
  './js/views/parent.js',
  './icon-192.png',
  './icon-512.png',
  './audio/bgm.mp3',
  './audio/bgm.m4a',
  './audio/bgm.wav'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(a => c.add(a).catch(err => console.warn('[sw] skip', a, err))))
    )
  );
  // skipWaiting() intentionally removed — we want the new SW to wait until
  // the user accepts the in-app update prompt (handled by js/updater.js).
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Client asks us to activate immediately (via the in-app "Update now" banner).
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
