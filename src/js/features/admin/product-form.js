// ═══ Admin — formulaire d'ajout produit ═══
// Les fichiers locaux sont envoyés à Cloudinary uniquement lors de la création du produit.
import { showToast } from '../../utils/dom-helpers.js';
import { insertProduct, fetchProducts } from '../../api/api.js';
import { categoryLabel, populateSubcategoryDropdown } from './category-dropdowns.js';
import { renderAdminList, renderAdminStats } from './admin-list.js';
import { initMultiSelect, getMultiSelect } from './multi-select.js';
import {
  getSelectedProductMediaFiles,
  uploadSelectedProductMedia,
  cleanupProductMediaUploads,
  resetProductMediaUploader
} from './product-media-upload.js';

const PRODUCT_IMAGE_FIELDS = ['image', 'image2', 'image3', 'image4', 'image5', 'image6'];

// ═══ Sélecteurs multi-choix Tailles / Couleurs (initialisation unique) ═══
let multiSelectsReady = false;
let isAddingProduct = false;

function ensureMultiSelects() {
  if (multiSelectsReady) return;
  initMultiSelect('adminTailles', 'tailles');
  initMultiSelect('adminCouleurs', 'couleurs');
  multiSelectsReady = true;
}

ensureMultiSelects();

function resetProductFormFields() {
  document.getElementById('adminName').value = '';
  document.getElementById('adminCategory').value = '';
  populateSubcategoryDropdown('');
  document.getElementById('adminPrice').value = '';
  PRODUCT_IMAGE_FIELDS.forEach((field, index) => {
    const input = document.getElementById(index === 0 ? 'adminImage' : 'adminImage' + (index + 1));
    if (input) input.value = '';
  });
  getMultiSelect('adminTailles')?.reset();
  getMultiSelect('adminCouleurs')?.reset();
  document.getElementById('adminMoq').value = '1';
  document.getElementById('adminDesc').value = '';
}

export async function addProduct() {
  if (isAddingProduct) return;

  const name = document.getElementById('adminName').value.trim();
  const topCategoryId = document.getElementById('adminCategory').value;
  const subSelect = document.getElementById('adminSubcategory');
  const subCategoryId = subSelect.value;
  const price = parseInt(document.getElementById('adminPrice').value, 10);
  const categoryId = subCategoryId || topCategoryId;

  if (!name || !categoryId || Number.isNaN(price)) {
    showToast('❌ Remplis nom, catégorie (+ sous-catégorie) et prix');
    return;
  }

  const submitButton = document.getElementById('addProductBtn');
  const wasDisabled = submitButton?.disabled ?? false;
  isAddingProduct = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
  }

  let uploadedPublicIds = [];
  let productInserted = false;

  try {
    const selectedMediaFiles = getSelectedProductMediaFiles();
    let uploadedMedia = { urls: [], publicIds: [] };

    // URL-only creation remains unchanged when no local image is selected.
    if (selectedMediaFiles.length) {
      uploadedMedia = await uploadSelectedProductMedia();
      const urls = Array.isArray(uploadedMedia?.urls) ? uploadedMedia.urls : [];
      uploadedPublicIds = Array.isArray(uploadedMedia?.publicIds) ? uploadedMedia.publicIds.slice() : [];

      if (urls.length !== selectedMediaFiles.length || uploadedPublicIds.length !== urls.length) {
        throw new Error('Les images envoyées à Cloudinary ne correspondent pas à la sélection.');
      }
      uploadedMedia.urls = urls;
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
      tailles: getMultiSelect('adminTailles')?.getValue() || '',
      couleurs: getMultiSelect('adminCouleurs')?.getValue() || '',
      moq: parseInt(document.getElementById('adminMoq').value, 10) || 1,
      description: document.getElementById('adminDesc').value.trim()
    };

    // Replace only the first N slots; the remaining manual URL fields stay intact.
    uploadedMedia.urls.forEach((url, index) => {
      product[PRODUCT_IMAGE_FIELDS[index]] = url;
    });

    await insertProduct(product);
    productInserted = true;

    // From this point on the assets belong to a saved catalogue product: never roll them back.
    resetProductMediaUploader();
    resetProductFormFields();

    try {
      await fetchProducts();
      renderAdminList();
      renderAdminStats();
      showToast('✅ Produit ajouté');
    } catch (refreshError) {
      showToast('✅ Produit enregistré. Actualisation du catalogue impossible : ' + (refreshError?.message || 'réessaie de recharger la page.'));
    }
  } catch (err) {
    const originalError = err?.message || 'Erreur lors de la création du produit.';
    let errorMessage = originalError;

    if (!productInserted && uploadedPublicIds.length) {
      try {
        await cleanupProductMediaUploads(uploadedPublicIds);
      } catch (cleanupError) {
        const cleanupMessage = cleanupError?.message || 'nettoyage incomplet.';
        errorMessage += ' — Le nettoyage Cloudinary a échoué : ' + cleanupMessage + ' Des fichiers orphelins peuvent nécessiter une suppression manuelle.';
      }
    }

    showToast('❌ Erreur: ' + errorMessage);
  } finally {
    isAddingProduct = false;
    if (submitButton) {
      submitButton.disabled = wasDisabled;
      submitButton.removeAttribute('aria-busy');
    }
  }
}
