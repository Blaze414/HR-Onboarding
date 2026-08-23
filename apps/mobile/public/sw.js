/*
 * Service worker for the installed app.
 *
 * Deliberately small. The app shell is cached so a cold start does not wait on
 * the network, and static bundles are served cache-first because their URLs are
 * content-hashed. Everything else — every Supabase call — goes straight to the
 * network: workplace data is shared, changes constantly, and stale reads here
 * would show one person another person's out-of-date view of a task.
 */
const VERSION = 'snoopy-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only this origin: API traffic and anything cross-origin is left alone.
  if (url.origin !== self.location.origin) return;

  // Content-hashed bundles and icons never change under the same URL.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  // Navigations: fresh when online, the cached shell when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    );
  }
});
