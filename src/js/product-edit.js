import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { updateProductInSupabase, fetchProducts } from './api.js';
import { refreshCatalogue } from './catalogue.js';

let categoryListenersBound = false;

function ensureCategoryDropdowns() {
  const topSelect = document.getElementById('editCategory');
  const subSelect = document.getElementById('editSubcategory');
  if (!topSelect || !subSelect) return;

  const topCategories = state.categories
    .filter(c => c.parent_id === null)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  topSelect.innerHTML =
    '<option value="">— Choisir une catégorie —</option>' +
    topCategories
      .map(
        c =>
          `<option value="${escapeHtml(c.id)}">${c.icon ? escapeHtml(c.icon) + ' ' : ''}${escapeHtml(c.name)}</option>`
      )
      .join('');

  subSelect.innerHTML = '<option value="">— Choisir d\'abord une catégorie —</option>';
  subSelect.disabled = true;

  if (!categoryListenersBound) {
    categoryListenersBound = true;
    topSelect.addEventListener('change', () => populateSubcategoryDropdown(topSelect.value));
  }
}

function populateSubcategoryDropdown(parentId, selectedSubId = null) {
  const subSelect = document.getElementById('editSubcategory');
  if (!subSelect) return;

  if (!parentId) {
    subSelect.innerHTML = '<option value="">— Choisir d\'abord une catégorie —</option>';
    subSelect.disabled = true;
    return;
  }

  const subs = state.categories
    .filter(c => c.parent_id === parentId)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  if (!subs.length) {
    // Catégorie sans enfants : elle sert de sous-catégorie elle-même
    subSelect.innerHTML = `<option value="${escapeHtml(parentId)}" selected>(catégorie directe, pas de sous-catégorie)</option>`;
    subSelect.disabled = true;
    return;
  }

  subSelect.disabled = false;
  subSelect.innerHTML =
    '<option value="">— Choisir une sous-catégorie —</option>' +
    subs.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');

  if (selectedSubId) {
    subSelect.value = selectedSubId;
  }
}

/**
 * Pré-remplit top + sous à partir de product.category_id.
 * - Si la cat a un parent → top = parent, sub = cat
 * - Sinon (top-niveau) → top = cat, sub via populate (directe ou liste vide)
 */
function prefillCategoryFromProduct(categoryId) {
  const topSelect = document.getElementById('editCategory');
  const subSelect = document.getElementById('editSubcategory');
  if (!topSelect || !subSelect) return;

  if (!categoryId) {
    topSelect.value = '';
    populateSubcategoryDropdown('');
    return;
  }

  const cat = state.categoriesById.get(categoryId);
  if (!cat) {
    topSelect.value = '';
    populateSubcategoryDropdown('');
    return;
  }

  if (cat.parent_id) {
    topSelect.value = cat.parent_id;
    populateSubcategoryDropdown(cat.parent_id, cat.id);
  } else {
    topSelect.value = cat.id;
    populateSubcategoryDropdown(cat.id, cat.id);
  }
}

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

export async function updateProduct() {
  const id = parseInt(document.getElementById('editProductId').value);
  const name = document.getElementById('editName').value.trim();
  const topCategoryId = document.getElementById('editCategory').value;
  const subSelect = document.getElementById('editSubcategory');
  const subCategoryId = subSelect ? subSelect.value : '';
  const price = parseInt(document.getElementById('editPrice').value);

  // Sous-catégorie prioritaire ; sinon top (cas catégorie sans enfants)
  const categoryId = subCategoryId || topCategoryId;

  if (!name || !categoryId || isNaN(price)) {
    document.getElementById('editError').textContent =
      'Remplis nom, catégorie (+ sous-catégorie) et prix.';
    return;
  }

  const updates = {
    name,
    price,
    category_id: categoryId,
    // Ne plus écrire l'ancien champ texte products.category
    image: document.getElementById('editImage').value.trim(),
    image2: document.getElementById('editImage2').value.trim(),
    image3: document.getElementById('editImage3').value.trim(),
    image4: document.getElementById('editImage4').value.trim(),
    image5: document.getElementById('editImage5').value.trim(),
    image6: document.getElementById('editImage6').value.trim(),
    tailles: document.getElementById('editTailles').value.trim(),
    couleurs: document.getElementById('editCouleurs').value.trim(),
    moq: parseInt(document.getElementById('editMoq').value) || 1,
    description: document.getElementById('editDesc').value.trim()
  };

  try {
    await updateProductInSupabase(id, updates);
    await fetchProducts();
    refreshCatalogue();
    document.getElementById('editProductModalOverlay').classList.remove('open');
    showToast('✅ Produit mis à jour');
  } catch (err) {
    document.getElementById('editError').textContent = 'Erreur : ' + err.message;
    showToast('❌ Erreur : ' + err.message);
  }
}
