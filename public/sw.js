const CACHE = 'nrj-v5';
const SHELL = ['/', '/index.html', '/admin.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// Cache pour les images et assets dynamiques
const IMAGE_CACHE = 'nrj-images-v1';
const ASSETS_CACHE = 'nrj-assets-v1';

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
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMAGE_CACHE && k !== ASSETS_CACHE).map((k) => caches.delete(k))))
  );
  self.clientsClaim(); // Met à jour tous les onglets ouverts
});

// Gestion des requêtes
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 👇 NOUVEAU: Cache spécial pour les images (local et CDN)
  if (url.pathname.includes('/img/') || url.hostname.includes('wsrv.nl') || url.pathname.match(/.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const resClone = res.clone();
            cache.put(e.request, resClone);
          }
          return res;
        }).catch(() => {
          // Fallback: retourne une image par défaut ou rien
          return caches.match('/icon.svg');
        });
      })
    );
    return;
  }

  // 👇 NOUVEAU: Cache pour les assets statiques (CSS, JS)
  if (url.pathname.match(/.(css|js|woff2?|ttf|eot)$/i)) {
    e.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const resClone = res.clone();
            cache.put(e.request, resClone);
          }
          return res;
        });
      })
    );
    return;
  }

  // Requêtes de navigation (pages)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        return cached || fetch(e.request).catch(() => caches.match('/index.html'));
      })
    );
    return;
  }

  // Requêtes statiques (HTML, JSON, etc.)
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