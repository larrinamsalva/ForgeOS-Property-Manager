// Only these public, account-independent assets may enter Cache Storage.
const CACHE = 'forgeos-reader-shell-v0.3.0-c0fa1652de85';
const ASSETS = [
  '/tablet/index.html',
  '/tablet/reader.css',
  '/tablet/reader.mjs',
  '/tablet/vault.mjs',
  '/icon.svg',
  '/manifest.webmanifest',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('forgeos-reader-shell-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname))
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.pathname, response.clone());
      return response;
    })
  );
});
