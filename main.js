/**
 * NRJ Marketplace - Point d'entrée principal
 * Initialise l'application et la synchronisation hors ligne
 */

import '../css/main.css';
import { state } from './state.js';
import { supabaseClient, WHATSAPP_NUMBER } from './config.js';
import { escapeHtml, removeEmojis, formatPrice, showToast } from './utils.js';
import { fetchProducts } from './api.js';
import { refreshCatalogue, applyFilter, switchView, renderCategories } from './catalogue.js';
import { setupAutoSync, syncAllOfflineData } from './sync.js';
import { placeOrder, renderCart, renderFavoritesBadge } from './cart.js';

// 👇 Enregistrer le Service Worker pour la PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('✅ ServiceWorker enregistré:', registration.scope);

        registration.addEventListener('updatefound', () => {
          console.log('🔄 Nouvelle version du Service Worker détectée');
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              console.log('📦 Nouvelle version disponible !');
              showToast('📦 Nouvelle version disponible. Fermez et rouvrez la PWA pour mettre à jour.');
            }
          });
        });
      })
      .catch(err => {
        console.error('❌ Échec enregistrement ServiceWorker:', err);
      });
  });
}

// 👇 Initialiser la synchronisation automatique hors ligne
setupAutoSync('default');

// Charger les produits au démarrage
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await fetchProducts();
    refreshCatalogue();
    renderCategories();

    // ✅ NOUVEAU : afficher l'état du panier/favoris chargé depuis IndexedDB
    renderCart();
    renderFavoritesBadge();

    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }

    console.log('✅ Application initialisée avec succès !');
  } catch (err) {
    console.error('❌ Erreur initialisation:', err);
    showToast('⚠️ Erreur de chargement. Vérifiez votre connexion.');
  }
});

// Gestion des filtres et de la vue (ancien code, conservé)
document.getElementById('filterInput')?.addEventListener('input', applyFilter);
document.getElementById('viewToggle')?.addEventListener('click', switchView);

// ─── ✅ NOUVEAU : navigation du bas (Accueil / Catégories / Panier / Favoris / Mon NRJ) ───
document.querySelectorAll('.nav-item[data-nav]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const nav = item.dataset.nav;

    document.querySelectorAll('.nav-item[data-nav]').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    if (nav === 'cart') {
      document.getElementById('cartPanel')?.classList.add('open');
      document.getElementById('cartOverlay')?.classList.add('open');
      return;
    }

    // Toute autre destination se joue dans catalogueWrapper, sauf "profile"
    const accountView = document.getElementById('accountView');
    const catalogueWrapper = document.getElementById('catalogueWrapper');

    if (nav === 'profile') {
      if (catalogueWrapper) catalogueWrapper.style.display = 'none';
      if (accountView) accountView.style.display = 'block';
      // ℹ️ Le contenu de "Mon NRJ" (historique de commandes, etc.) n'est pas
      // encore généré dynamiquement — accountContent reste vide pour l'instant.
      return;
    }

    if (catalogueWrapper) catalogueWrapper.style.display = 'block';
    if (accountView) accountView.style.display = 'none';

    if (nav === 'categories') {
      switchView('categories');
    } else if (nav === 'favorites') {
      switchView('home');
      applyFilter('favorites');
    } else {
      switchView('home');
      applyFilter('all');
    }
  });
});

// ─── ✅ NOUVEAU : ouverture / fermeture du panier ───
document.getElementById('cartCloseBtn')?.addEventListener('click', () => {
  document.getElementById('cartPanel')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
});
document.getElementById('cartOverlay')?.addEventListener('click', () => {
  document.getElementById('cartPanel')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
});

// ─── ✅ NOUVEAU : checkout — ouvrir la modale de confirmation ───
document.getElementById('checkoutBtn')?.addEventListener('click', () => {
  if (!state.cart.length) return;
  const summaryEl = document.getElementById('orderSummary');
  if (summaryEl) {
    summaryEl.innerHTML = state.cart
      .map(i => `${i.quantity}x ${escapeHtml(i.name)} — ${formatPrice(i.price * i.quantity)}`)
      .join('<br>');
  }
  document.getElementById('orderModalOverlay')?.classList.add('open');
});

document.getElementById('cancelOrderBtn')?.addEventListener('click', () => {
  document.getElementById('orderModalOverlay')?.classList.remove('open');
});

// ─── ✅ NOUVEAU : envoyer la commande (Supabase + WhatsApp) ───
document.getElementById('sendWhatsAppBtn')?.addEventListener('click', async () => {
  const nameInput = document.getElementById('customerName');
  const name = nameInput?.value.trim();
  if (!name) {
    showToast('⚠️ Indique ton nom');
    return;
  }
  if (!state.cart.length) return;

  const itemsSnapshot = [...state.cart];
  const total = itemsSnapshot.reduce((s, i) => s + i.price * i.quantity, 0);

  try {
    await placeOrder({
      items: itemsSnapshot,
      total,
      paymentMethod: 'whatsapp',
      customerName: name
    });

    const summary = itemsSnapshot.map(i => `${i.quantity}x ${i.name}`).join(', ');
    const msg = `Bonjour NRJ Marketplace, je m'appelle ${name}.\nMa commande : ${summary}\nTotal : ${formatPrice(total)}`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');

    if (nameInput) nameInput.value = '';
    document.getElementById('orderModalOverlay')?.classList.remove('open');
    document.getElementById('cartPanel')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
  } catch (err) {
    showToast('⚠️ Erreur lors de la commande');
  }
});

// Exporter pour les tests
export { state, supabaseClient };
