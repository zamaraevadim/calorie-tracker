const CACHE_NAME = 'kbju-tracker-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/js/storage.js',
  '/js/calculator.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/app.js',
  '/style.css',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
