const CACHE = 'nrj-v6';
const SHELL = ['/', '/index.html', '/admin.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
const IMAGE_CACHE = 'nrj-images-v1';
const ASSETS_CACHE = 'nrj-assets-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      c.addAll(SHELL).catch(() => {});
      try {
        const res = await fetch('/precache-manifest.json', { cache: 'no-store' });
        const assets = await res.json();
        await Promise.all(assets.map((url) => fetch(url).then((r) => r.ok && c.put(url, r.clone())).catch(() => {})));
      } catch {}
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE && k !== IMAGE_CACHE && k !== ASSETS_CACHE).map((k) => caches.delete(k))
    ))
  );
  self.clientsClaim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;

  if (url.pathname.includes('/img/') || url.hostname.includes('wsrv.nl') || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => caches.match('/icon.svg'));
      })
    );
    return;
  }

  if (url.pathname.match(/\.(css|js|woff2?|ttf|eot)$/i)) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(ASSETS_CACHE).then((cache) => cache.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
