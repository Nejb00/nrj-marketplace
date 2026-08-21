const CACHE = 'nrj-shell-v4'; // Version incrémentée pour forcer la mise à jour
const SHELL = ['/', '/index.html', '/admin.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// À l'installation : pré-cache le shell + tous les assets hashés listés dans
// precache-manifest.json → le site est 100% disponible hors ligne dès la 1re visite.
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
  self.skipWaiting(); // Force la nouvelle version à prendre le contrôle
});

// À l'activation : nettoie les anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clientsClaim(); // Met à jour tous les onglets ouverts
});

// Gestion des requêtes
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Requêtes de navigation (pages)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        return cached || fetch(e.request).catch(() => caches.match('/index.html')); // Fallback sur index.html
      })
    );
    return;
  }

  // Requêtes statiques (CSS, JS, images, etc.)
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        return cached || fetch(e.request).catch(() => caches.match('/index.html'));
      })
    );
  }
});

// Mise à jour automatique
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});