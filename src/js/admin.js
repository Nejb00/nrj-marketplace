import { state } from './state.js';
import { supabaseClient } from './config.js';
import { escapeHtml, removeEmojis, showToast } from './utils.js';
import { fetchProducts, insertProduct, deleteProductFromSupabase } from './api.js';

export async function handleAdminLogin() {
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('adminEmail').value.trim(),
            password: document.getElementById('adminPassword').value
        });
        if (error) throw error;
        state.isAdminLoggedIn = true;
        document.getElementById('adminPanel').classList.add('active');
        document.getElementById('loginPanel').style.display = 'none';
        document.getElementById('logoutBtn').classList.add('visible');
        renderAdminList();
        showToast('🔓 Connecté');
    } catch (err) {
        document.getElementById('adminError').textContent = err.message;
    }
}

export async function handleLogout() {
    await supabaseClient.auth.signOut();
    state.isAdminLoggedIn = false;
    document.getElementById('adminPanel').classList.remove('active');
    document.getElementById('loginPanel').style.display = 'block';
    document.getElementById('logoutBtn').classList.remove('visible');
    showToast('👋 Déconnecté');
}

export async function checkAdminSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        state.isAdminLoggedIn = true;
        document.getElementById('adminPanel').classList.add('active');
        document.getElementById('loginPanel').style.display = 'none';
        document.getElementById('logoutBtn').classList.add('visible');
        renderAdminList();
    }
    return state.isAdminLoggedIn;
}

export async function addProduct() {
    const name = document.getElementById('adminName').value.trim();
    const category = document.getElementById('adminCategory').value.trim();
    const price = parseInt(document.getElementById('adminPrice').value);
    if (!name || !category || isNaN(price)) return alert('Remplis nom, catégorie et prix.');
    try {
        await insertProduct({
            name, price, category: removeEmojis(category),
            image: document.getElementById('adminImage').value.trim(),
            image2: document.getElementById('adminImage2').value.trim(),
            image3: document.getElementById('adminImage3').value.trim(),
            image4: document.getElementById('adminImage4').value.trim(),
            image5: document.getElementById('adminImage5').value.trim(),
            image6: document.getElementById('adminImage6').value.trim(),
            tailles: document.getElementById('adminTailles').value.trim(),
            couleurs: document.getElementById('adminCouleurs').value.trim(),
            moq: parseInt(document.getElementById('adminMoq').value) || 1,
            description: document.getElementById('adminDesc').value.trim(),
            popularity_score: 0
        });
        showToast('✅ Produit ajouté !');
        ['adminName', 'adminCategory', 'adminPrice', 'adminImage', 'adminImage2', 'adminImage3', 'adminImage4', 'adminImage5', 'adminImage6', 'adminTailles', 'adminCouleurs', 'adminDesc'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('adminMoq').value = '1';
        await fetchProducts();
        renderAdminList();
    } catch (err) {
        alert('❌ Erreur : ' + err.message);
    }
}

export async function deleteProduct(id) {
    if (!confirm('Supprimer ?')) return;
    await deleteProductFromSupabase(id);
    await fetchProducts();
    state.cart = state.cart.filter(i => state.products.some(p => p.id === i.productId));
    renderAdminList();
}

export function renderAdminList() {
    const list = document.getElementById('adminProductsList');
    if (!list) return;
    list.innerHTML = state.products.map(p => `<li><span>${escapeHtml(p.name)} [ID: ${p.id}]</span><button class="btn-sm" data-action="admin-remove" data-id="${p.id}">🗑️</button></li>`).join('');
}
