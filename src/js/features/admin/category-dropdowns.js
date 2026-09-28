// ═══ Admin — dropdowns catégories + libellés ═══
// Éclaté de admin.js (refacto-archi) — logique strictement identique.
// categoriesTree/categoriesById restent encapsulés ici (état partagé du module).
import { escapeHtml } from '../../utils/escape-html.js';
import { fetchCategories } from '../../api/api.js';

// Arbre des catégories chargé une fois, réutilisé pour les menus + les stats
let categoriesTree = [];
let categoriesById = new Map();

export function getCategoriesTree() { return categoriesTree; }
export function getCategoriesById() { return categoriesById; }

/**
 * Charge les catégories depuis Supabase et remplit le menu top-niveau.
 * À appeler une fois à la connexion (login ou session déjà active).
 */
export async function loadCategoryDropdowns() {
  categoriesTree = await fetchCategories();
  categoriesById = new Map(categoriesTree.map(c => [c.id, c]));

  const topSelect = document.getElementById('adminCategory');
  const subSelect = document.getElementById('adminSubcategory');
  if (!topSelect || !subSelect) return;

  const topCategories = categoriesTree
    .filter(c => c.parent_id === null)
    .sort((a, b) => a.display_order - b.display_order);

  topSelect.innerHTML = '<option value="">— Choisir une catégorie —</option>' +
    topCategories.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`).join('');

  subSelect.innerHTML = '<option value="">— Choisir d\'abord une catégorie —</option>';
  subSelect.disabled = true;

  topSelect.addEventListener('change', () => populateSubcategoryDropdown(topSelect.value));
}

export function populateSubcategoryDropdown(parentId) {
  const subSelect = document.getElementById('adminSubcategory');
  if (!subSelect) return;

  if (!parentId) {
    subSelect.innerHTML = '<option value="">— Choisir d\'abord une catégorie —</option>';
    subSelect.disabled = true;
    return;
  }

  const subs = categoriesTree
    .filter(c => c.parent_id === parentId)
    .sort((a, b) => a.display_order - b.display_order);

  if (!subs.length) {
    // Catégorie sans enfants : elle sert de sous-catégorie elle-même
    subSelect.innerHTML = `<option value="${parentId}" selected>(catégorie directe, pas de sous-catégorie)</option>`;
    subSelect.disabled = true;
    return;
  }

  subSelect.disabled = false;
  subSelect.innerHTML = '<option value="">— Choisir une sous-catégorie —</option>' +
    subs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

// Résout un category_id vers un libellé lisible "Parent > Sous-catégorie"
export function categoryLabel(categoryId) {
  const cat = categoriesById.get(categoryId);
  if (!cat) return null;
  if (cat.parent_id) {
    const parent = categoriesById.get(cat.parent_id);
    return parent ? `${parent.name} > ${cat.name}` : cat.name;
  }
  return cat.name;
}
