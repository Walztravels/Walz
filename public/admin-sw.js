const CACHE = 'walz-staff-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept Aircall requests — let the iframe handle its own network
  if (request.url.includes('aircall.io')) return;
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.destination === 'script' || request.destination === 'style') {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(request).then((cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) c.put(request, res.clone());
            return res;
          })
        )
      )
    );
  }
});
