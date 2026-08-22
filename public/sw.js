const CACHE = 'nrj-v8';
const SHELL = ['/', '/index.html', '/admin.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/placeholder.svg'];
const IMAGE_CACHE = 'nrj-images-v2';
const ASSETS_CACHE = 'nrj-assets-v2';
const SEARCH_CACHE = 'nrj-search-v1';

// ─── Limites de cache ─────────────────────────────────────
const MAX_IMAGE_ENTRIES = 300;
const MAX_IMAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024;
const TARGET_IMAGE_CACHE_BYTES = 40 * 1024 * 1024;

// ─── Helpers ──────────────────────────────────────────────

async function getImageCacheSize() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  let total = 0;
  for (const req of keys) {
    const res = await cache.match(req);
    if (res) {
      const blob = await res.clone().blob();
      total += blob.size;
    }
  }
  return total;
}

async function cleanupImageCache() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  const now = Date.now();
  const toDelete = [];

  for (const req of keys) {
    const url = new URL(req.url);
    const ts = url.searchParams.get('_nrj_ts');
    if (ts && (now - parseInt(ts)) > MAX_IMAGE_AGE_MS) {
      toDelete.push(req);
    }
  }

  await Promise.all(toDelete.map(req => cache.delete(req)));

  let currentSize = await getImageCacheSize();
  let remaining = (await cache.keys()).filter(k => !toDelete.includes(k));

  if (currentSize > MAX_IMAGE_CACHE_BYTES) {
    remaining.sort((a, b) => {
      const tsA = new URL(a.url).searchParams.get('_nrj_ts') || '0';
      const tsB = new URL(b.url).searchParams.get('_nrj_ts') || '0';
      return parseInt(tsA) - parseInt(tsB);
    });

    for (const req of remaining) {
      if (currentSize <= TARGET_IMAGE_CACHE_BYTES) break;
      const res = await cache.match(req);
      if (res) {
        const blob = await res.clone().blob();
        currentSize -= blob.size;
      }
      toDelete.push(req);
      await cache.delete(req);
    }
  }

  remaining = (await cache.keys());
  if (remaining.length > MAX_IMAGE_ENTRIES) {
    remaining.sort((a, b) => {
      const tsA = new URL(a.url).searchParams.get('_nrj_ts') || '0';
      const tsB = new URL(b.url).searchParams.get('_nrj_ts') || '0';
      return parseInt(tsB) - parseInt(tsA);
    });
    const toRemove = remaining.slice(MAX_IMAGE_ENTRIES);
    for (const req of toRemove) {
      toDelete.push(req);
      await cache.delete(req);
    }
  }

  console.log('[SW] Cleanup images:', toDelete.length, 'supprimees. Reste:', (await cache.keys()).length, 'entrees, ~' + Math.round((await getImageCacheSize()) / 1024 / 1024) + ' MB');
}

async function cacheImage(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(IMAGE_CACHE);
  const url = new URL(request.url);
  url.searchParams.set('_nrj_ts', Date.now().toString());
  const timestampedRequest = new Request(url.toString());
  await cache.put(timestampedRequest, response.clone());
}

async function getCachedImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const baseUrl = request.url.split('?')[0];
  const keys = await cache.keys();
  for (const key of keys) {
    if (key.url.startsWith(baseUrl)) {
      return cache.match(key);
    }
  }
  return null;
}

/**
 * Pre-cache une liste d'URLs d'images.
 * Utilise par le client pour telecharger des produits specifiques.
 */
async function precacheImages(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  const cache = await caches.open(IMAGE_CACHE);
  let cached = 0;
  let failed = 0;

  await Promise.all(urls.map(async (url) => {
    if (!url || !url.trim()) return;
    try {
      const req = new Request(url);
      const existing = await getCachedImage(req);
      if (existing) { cached++; return; }

      const res = await fetch(req, { mode: 'no-cors' });
      if (res.ok || res.type === 'opaque') {
        await cacheImage(req, res);
        cached++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }));

  console.log('[SW] Precache:', cached, 'caches,', failed, 'echecs sur', urls.length, 'URLs');
  return { cached, failed, total: urls.length };
}

// ─── Install ──────────────────────────────────────────────
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

// ─── Activate ─────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE && k !== IMAGE_CACHE && k !== ASSETS_CACHE && k !== SEARCH_CACHE).map((k) => caches.delete(k))
    ))
  );
  self.clientsClaim();
});

// ─── Fetch ────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;

  // ── IMAGES ──────────────────────────────────────────────
  const isImage = url.hostname.includes('wsrv.nl') ||
                  url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i) ||
                  (url.searchParams.has('output') && url.searchParams.get('output') === 'webp');

  if (isImage) {
    e.respondWith(
      (async () => {
        const cached = await getCachedImage(e.request);
        if (cached) return cached;

        try {
          const res = await fetch(e.request);
          if (res.ok) {
            await cacheImage(e.request, res.clone());
          }
          return res;
        } catch (err) {
          const anyCached = await getCachedImage(e.request);
          if (anyCached) return anyCached;

          const placeholder = await caches.match('/placeholder.svg');
          if (placeholder) return placeholder;

          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        }
      })()
    );
    return;
  }

  // ── PAGES DE RECHERCHE (stale-while-revalidate) ─────────
  if (url.searchParams.has('search')) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(SEARCH_CACHE);
        const cached = await cache.match(e.request);

        // Mise a jour en arriere-plan
        const fetchAndCache = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);

        // Si on a du cache, on le sert immediatement
        if (cached) {
          fetchAndCache; // declenche la maj en bg
          return cached;
        }

        // Sinon on attend le reseau
        return await fetchAndCache;
      })()
    );
    return;
  }

  // ── ASSETS (CSS, JS, fonts) ─────────────────────────────
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

  // ── NAVIGATION ──────────────────────────────────────────
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // ── SAME-ORIGIN ─────────────────────────────────────────
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
  }
});

// ─── Messages ─────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  } else if (e.data === 'cleanup-images') {
    e.waitUntil(cleanupImageCache());
  } else if (e.data && e.data.type === 'precache-images') {
    e.waitUntil(
      precacheImages(e.data.urls).then((result) => {
        if (e.ports && e.ports[0]) {
          e.ports[0].postMessage(result);
        }
      })
    );
  }
});
