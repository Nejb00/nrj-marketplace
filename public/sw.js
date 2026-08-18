const CACHE = 'nrj-shell-v3';
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
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Navigations : réseau d'abord, repli sur le shell en cache (offline)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets du site (js/css hashés) : cache d'abord, mise à jour en arrière-plan
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const network = fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Images produits + polices : cache d'abord (rechargement ultra-rapide)
  if (e.request.destination === 'image' || url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Données produits Supabase (REST) : stale-while-revalidate.
  if (url.hostname.endsWith('.supabase.co')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((cached) => {
          const network = fetch(e.request)
            .then((res) => {
              if (res.ok) c.put(e.request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Tout le reste : réseau uniquement → données toujours fraîches
});
