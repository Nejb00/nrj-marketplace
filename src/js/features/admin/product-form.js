// ═══ Admin — formulaire d'ajout produit ═══
// Éclaté de admin.js (refacto-archi) — logique strictement identique.
import { showToast } from '../../utils/dom-helpers.js';
import { insertProduct, fetchProducts } from '../../api/api.js';
import { categoryLabel, populateSubcategoryDropdown } from './category-dropdowns.js';
import { renderAdminList, renderAdminStats } from './admin-list.js';

export async function addProduct() {
  const name = document.getElementById('adminName').value.trim();
  const topCategoryId = document.getElementById('adminCategory').value;
  const subSelect = document.getElementById('adminSubcategory');
  const subCategoryId = subSelect.value;
  const price = parseInt(document.getElementById('adminPrice').value);

  // La sous-catégorie fait foi si elle est renseignée, sinon on retombe sur la catégorie top
  // (cas des catégories sans enfants, gérées par populateSubcategoryDropdown)
  const categoryId = subCategoryId || topCategoryId;

  if (!name || !categoryId || isNaN(price)) {
    showToast('❌ Remplis nom, catégorie (+ sous-catégorie) et prix');
    return;
  }

  const product = {
    name,
    category_id: categoryId,
    category: categoryLabel(categoryId)?.split(' > ').pop() || null, // pont temporaire pour l'affichage actuel du site
    price,
    image: document.getElementById('adminImage').value.trim(),
    image2: document.getElementById('adminImage2').value.trim(),
    image3: document.getElementById('adminImage3').value.trim(),
    image4: document.getElementById('adminImage4').value.trim(),
    image5: document.getElementById('adminImage5').value.trim(),
    image6: document.getElementById('adminImage6').value.trim(),
    tailles: document.getElementById('adminTailles').value.trim(),
    couleurs: document.getElementById('adminCouleurs').value.trim(),
    moq: parseInt(document.getElementById('adminMoq').value) || 1,
    description: document.getElementById('adminDesc').value.trim()
  };

  try {
    await insertProduct(product);
    await fetchProducts();
    renderAdminList();
    renderAdminStats();
    
    // Reset du formulaire
    document.getElementById('adminName').value = '';
    document.getElementById('adminCategory').value = '';
    populateSubcategoryDropdown('');
    document.getElementById('adminPrice').value = '';
    document.getElementById('adminImage').value = '';
    document.getElementById('adminImage2').value = '';
    document.getElementById('adminImage3').value = '';
    document.getElementById('adminImage4').value = '';
    document.getElementById('adminImage5').value = '';
    document.getElementById('adminImage6').value = '';
    document.getElementById('adminTailles').value = '';
    document.getElementById('adminCouleurs').value = '';
    document.getElementById('adminMoq').value = '1';
    document.getElementById('adminDesc').value = '';
    
    showToast('✅ Produit ajouté');
  } catch (err) {
    showToast('❌ Erreur: ' + err.message);
  }
}
