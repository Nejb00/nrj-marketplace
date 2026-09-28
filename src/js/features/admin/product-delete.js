// ═══ Admin — suppression produit ═══
// Éclaté de admin.js (refacto-archi) — logique strictement identique.
import { showToast } from '../../utils/dom-helpers.js';
import { deleteProductFromSupabase, fetchProducts } from '../../api/api.js';
import { renderAdminList, renderAdminStats } from './admin-list.js';

export async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  try {
    await deleteProductFromSupabase(id);
    await fetchProducts();
    renderAdminList();
    renderAdminStats();
    showToast('🗑️ Produit supprimé');
  } catch (err) {
    showToast('❌ Erreur: ' + err.message);
  }
}
