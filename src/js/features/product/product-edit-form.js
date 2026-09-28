// ═══ Édition produit — ouverture du formulaire pré-rempli ═══
// Éclaté de product-edit.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { ensureCategoryDropdowns, prefillCategoryFromProduct } from './product-edit-dropdowns.js';

export function openEditModal(productId) {
  const product = findProductById(productId);
  if (!product) return;

  ensureCategoryDropdowns();

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editName').value = product.name || '';
  document.getElementById('editPrice').value = product.price || '';
  document.getElementById('editImage').value = product.image || '';
  document.getElementById('editImage2').value = product.image2 || '';
  document.getElementById('editImage3').value = product.image3 || '';
  document.getElementById('editImage4').value = product.image4 || '';
  document.getElementById('editImage5').value = product.image5 || '';
  document.getElementById('editImage6').value = product.image6 || '';
  document.getElementById('editTailles').value = product.tailles || '';
  document.getElementById('editCouleurs').value = product.couleurs || '';
  document.getElementById('editMoq').value = product.moq || 1;
  document.getElementById('editDesc').value = product.description || '';
  document.getElementById('editError').textContent = '';

  prefillCategoryFromProduct(product.category_id || null);

  document.getElementById('editProductModalOverlay').classList.add('open');
}

function findProductById(id) {
  return state.products.find(p => p.id === id);
}
