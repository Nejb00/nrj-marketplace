import { state } from './state.js';
import { removeEmojis, showToast } from './utils.js';
import { updateProductInSupabase, fetchProducts } from './api.js';
import { refreshCatalogue } from './catalogue.js';

export function openEditModal(productId) {
    const product = findProductById(productId);
    if (!product) return;

    document.getElementById('editProductId').value = product.id;
    document.getElementById('editName').value = product.name || '';
    document.getElementById('editCategory').value = product.category || '';
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
    document.getElementById('editProductModalOverlay').classList.add('open');
}

function findProductById(id) {
    return state.products.find(p => p.id === id);
}

export async function updateProduct() {
    const id = parseInt(document.getElementById('editProductId').value);
    const name = document.getElementById('editName').value.trim();
    const category = document.getElementById('editCategory').value.trim();
    const price = parseInt(document.getElementById('editPrice').value);

    if (!name || !category || isNaN(price)) {
        document.getElementById('editError').textContent = 'Remplis nom, catégorie et prix.';
        return;
    }

    const updates = {
        name, price, category: removeEmojis(category),
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
        // ✅ Fermeture de la modale SEULEMENT après rechargement complet
        document.getElementById('editProductModalOverlay').classList.remove('open');
        showToast('✅ Produit mis à jour');
    } catch (err) {
        // ✅ Erreur visible dans la modale (qui reste ouverte) ET en toast
        document.getElementById('editError').textContent = 'Erreur : ' + err.message;
        showToast('❌ Erreur : ' + err.message);
    }
}
