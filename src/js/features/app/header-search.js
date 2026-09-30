// ═══ Header Temu — couche 1 : barre de recherche pleine largeur ═══
// Le tap sur la façade « tap-to-search » ouvre la page de recherche dédiée
// (comportement historique du bouton compact). Tous les getElementById sont
// optionnels (?.) : le module est safe même si le DOM change.
import { switchToSearchView } from '../search/search-view.js';

export function initHeaderSearchBar() {
  // Façade : tap → page de recherche dédiée (#searchView)
  document.getElementById('tapToSearch')?.addEventListener('click', () => {
    switchToSearchView('');
  });

  // Bouton loupe rond noir : lance la recherche (vide ou avec saisie en cours)
  document.getElementById('searchGo')?.addEventListener('click', () => {
    const input = document.getElementById('searchInput');
    switchToSearchView((input && input.value.trim()) || '');
  });

  // Caméra : recherche par photo via WhatsApp (même cible que le bouton sourcing)
  document.getElementById('searchCamera')?.addEventListener('click', () => {
    window.open(`https://wa.me/242066271882?text=${encodeURIComponent(
      "Bonjour NRJ Marketplace, je souhaite rechercher un produit par photo. Voici ma photo :"
    )}`);
  });
}
