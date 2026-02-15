// Projet A15 — Service Worker
// Cache-first for shell, network-first for API

const CACHE_NAME = 'a15-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/styles/main.css',
  '/styles/chat.css',
  '/styles/sidebar.css',
  '/styles/dice.css',
  '/styles/splash.css',
  '/styles/hub.css',
  '/styles/generator.css',
  '/scripts/app.js',
  '/manifest.json',
];

// Install: pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always go to network (game data must be fresh)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // SSE streams: skip cache
  if (event.request.headers.get('accept')?.includes('text/event-stream')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Shell assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for future visits
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback: return cached index page
      return caches.match('/');
    })
  );
});
