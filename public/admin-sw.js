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

  // Never intercept navigation requests (page loads, iframe src navigations).
  // On Chrome Android, returning without respondWith() on a navigate fetch
  // can cause the browser to show "This content is blocked" for cross-origin
  // iframes instead of falling through to the network correctly.
  if (request.mode === 'navigate') return;

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

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Walz Staff', {
      body:                data.body || 'New notification',
      icon:                '/icons/walz-staff-192.png',
      badge:               '/icons/walz-staff-192.png',
      tag:                 data.tag || 'walz-notification',
      data:                { url: data.url || '/admin' },
      requireInteraction:  data.requireInteraction || false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const target = event.notification.data?.url || '/admin';
      const existing = windowClients.find((c) => c.url.includes('/admin') && 'focus' in c);
      if (existing) return existing.focus().then((c) => c.navigate(target));
      return clients.openWindow(target);
    })
  );
});
