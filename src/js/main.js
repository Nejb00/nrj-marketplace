/**
 * NRJ Marketplace - Point d'entrée principal
 * Initialise l'application et la synchronisation hors ligne
 */

import '../css/main.css';
import { state } from './state.js';
import { supabaseClient } from './config.js';
import { escapeHtml, removeEmojis, formatPrice, showToast } from './utils.js';
import { fetchProducts } from './api.js';
import { refreshCatalogue, applyFilter, switchView, renderCategories } from './catalogue.js';
import { setupAutoSync, syncAllOfflineData } from './sync.js';

// 👇 NOUVEAU: Enregistrer le Service Worker pour la PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('✅ ServiceWorker enregistré:', registration.scope);
        
        // Écouter les mises à jour du SW
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

// 👇 NOUVEAU: Initialiser la synchronisation automatique hors ligne
setupAutoSync('default');

// Charger les produits au démarrage
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await fetchProducts();
    refreshCatalogue();
    renderCategories();
    
    // Synchroniser les données hors ligne au démarrage
    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }
    
    console.log('✅ Application initialisée avec succès !');
  } catch (err) {
    console.error('❌ Erreur initialisation:', err);
    showToast('⚠️ Erreur de chargement. Vérifiez votre connexion.');
  }
});

// Gestion des filtres et de la vue
document.getElementById('filterInput')?.addEventListener('input', applyFilter);
document.getElementById('viewToggle')?.addEventListener('click', switchView);

// Exporter pour les tests
export { state, supabaseClient };