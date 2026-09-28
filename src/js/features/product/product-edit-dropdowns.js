// ═══ Édition produit — dropdowns catégorie/sous-catégorie ═══
// Éclaté de product-edit.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';

let categoryListenersBound = false;

export function ensureCategoryDropdowns() {
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

export function populateSubcategoryDropdown(parentId, selectedSubId = null) {
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
export function prefillCategoryFromProduct(categoryId) {
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
