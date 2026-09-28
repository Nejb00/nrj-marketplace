// ═══ Édition produit — sauvegarde (Supabase + refresh catalogue) ═══
// Éclaté de product-edit.js (refacto-archi) — logique strictement identique.
import { showToast } from '../../utils/dom-helpers.js';
import { updateProductInSupabase, fetchProducts } from '../../api/api.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';

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
