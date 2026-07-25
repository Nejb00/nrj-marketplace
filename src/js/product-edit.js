import { state } from './state.js';
import { removeEmojis, showToast } from './utils.js';
import { fetchProducts, updateProductInSupabase } from './api.js';
import { refreshCatalogue } from './catalogue.js';

export function openEditModal(productId) {
    const p = state.products.find(pr => pr.id === productId);
    if (!p) return;
    document.getElementById('editProductId').value = p.id;
    document.getElementById('editName').value = p.name || '';
    document.getElementById('editCategory').value = p.category || '';
    document.getElementById('editPrice').value = p.price || '';
    document.getElementById('editImage').value = p.image || '';
    document.getElementById('editImage2').value = p.image2 || '';
    document.getElementById('editImage3').value = p.image3 || '';
    document.getElementById('editImage4').value = p.image4 || '';
    document.getElementById('editImage5').value = p.image5 || '';
    document.getElementById('editImage6').value = p.image6 || '';
    document.getElementById('editTailles').value = p.tailles || '';
    document.getElementById('editCouleurs').value = p.couleurs || '';
    document.getElementById('editMoq').value = p.moq || 1;
    document.getElementById('editDesc').value = p.description || '';
    document.getElementById('editError').textContent = '';
    document.getElementById('editProductModalOverlay').classList.add('open');
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
        showToast('✅ Produit mis à jour');
        document.getElementById('editProductModalOverlay').classList.remove('open');
        await fetchProducts();
        refreshCatalogue();
    } catch (err) {
        document.getElementById('editError').textContent = 'Erreur : ' + err.message;
    }
}
