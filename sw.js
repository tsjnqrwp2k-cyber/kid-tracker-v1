const CACHE = 'kt-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/themes.css',
  './js/app.js',
  './js/state.js',
  './js/tasks.js',
  './js/audio.js',
  './js/vouchers.js',
  './js/reminders.js',
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
  self.skipWaiting();
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
