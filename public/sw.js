let cacheName;
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await (
        await fetch('/offline-assets.json', { cache: 'no-store' })
      ).json();
      cacheName = `wine-${manifest.version}`;
      const cache = await caches.open(cacheName);
      await cache.addAll(manifest.assets);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      if (!cacheName)
        cacheName = names
          .filter((n) => n.startsWith('wine-'))
          .sort()
          .at(-1);
      await Promise.all(
        names
          .filter((n) => n.startsWith('wine-') && n !== cacheName)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    event.request.method !== 'GET'
  )
    return;
  event.respondWith(
    (async () => {
      const response = await caches.match(event.request, {
        ignoreSearch: true,
      });
      if (response) return response;
      if (event.request.mode === 'navigate')
        return await caches.match('/index.html');
      return fetch(event.request);
    })(),
  );
});
