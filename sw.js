const CACHE_NAME = 'bs-gamerz-offline-v1';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './images/logo-192.png'
];

// Install: Cache the core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate: Delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch: Serve from cache first, then network (for offline support)
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/data/youtube.json')) {
    // Network-first for data so it stays updated
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for everything else
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});