// ═══ App — offline (bandeau, SW updates, precache images) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { PRELOAD_IMAGE_COUNT } from '../../core/config.js';
import { showToast } from '../../utils/dom-helpers.js';
import { thumb } from '../../utils/images.js';

export function initServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration) return;
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast("📦 Mise à jour disponible — relancez l'application.");
        }
      });
    });
  });
}

export function initOfflineIndicator() {
  let banner = document.getElementById('offlineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7f1d1d;color:#fff;text-align:center;padding:0.4rem;font-size:0.78rem;font-weight:600;transform:translateY(-100%);transition:transform 0.3s ease;';
    banner.textContent = '📡 Hors ligne — catalogue mémorisé';
    document.body.prepend(banner);
  }
  const update = () => {
    banner.style.transform = navigator.onLine ? 'translateY(-100%)' : 'translateY(0)';
  };
  update();
  addEventListener('online', update);
  addEventListener('offline', update);
}

export async function precacheCatalogueImages() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const list = (state.currentFilteredProducts?.length ? state.currentFilteredProducts : state.products) || [];
  if (list.length === 0) return;

  const imageUrls = list
    .slice(0, PRELOAD_IMAGE_COUNT)
    .map((p) => (p.image && String(p.image).trim() ? thumb(p.image.trim(), 300, 400) : ''))
    .filter(Boolean);
  if (imageUrls.length === 0) return;

  try {
    const channel = new MessageChannel();
    navigator.serviceWorker.controller.postMessage({ type: 'precache-images', urls: imageUrls }, [channel.port2]);
    channel.port1.onmessage = (event) => {
      const { cached, total } = event.data || {};
      console.log(`[Main] Precache: ${cached}/${total} images`);
    };
  } catch (e) {
    console.warn('[Main] Precache images échoué:', e);
  }
}
