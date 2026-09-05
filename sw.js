const CACHE_NAME = 'bs-gamerz-v3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

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

self.addEventListener('fetch', event => {
  // If it's a video or the JSON data, don't cache, just fetch fresh!
  if (event.request.url.includes('youtube.json') || event.request.url.includes('.jpg')) {
    event.respondWith(fetch(event.request));
  } else {
    // If it's the main page or CSS, try network first, then cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});