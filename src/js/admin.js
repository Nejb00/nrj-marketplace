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
        ['adminName', 'adminCategory', 'adminPrice', 'adminImage', 'adminImage2', 'adminImage3', 'adminImage4', 'adminImage5', 'adminImage6', 'adminTailles', 'adminCouleurs', 'adminDesc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
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

export function renderAdminStats() {
  const stats = document.getElementById('adminStats');
  if (!stats || !state.products.length) return;

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const isNew = (p) => p.created_at && (now - new Date(p.created_at).getTime()) <= sevenDays;

  // Compteurs
  const totalProducts = state.products.length;
  const totalPopularity = state.products.reduce((sum, p) => sum + (p.popularity_score || 0), 0);
  const bestSellers = state.products.filter((p) => (p.popularity_score || 0) >= 20).length;
  const newProducts = state.products.filter(isNew).length;

  // Top 5 produits
  const top5 = [...state.products]
    .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
    .slice(0, 5);
  const maxPop = top5[0]?.popularity_score || 1;

  // Top catégories
  const catScores = {};
  const catCounts = {};
  state.products.forEach((p) => {
    if (!p.category) return;
    catScores[p.category] = (catScores[p.category] || 0) + (p.popularity_score || 0);
    catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  });
  const topCats = Object.entries(catScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCatPop = topCats[0]?.[1] || 1;

  stats.innerHTML = `
    <div class="admin-stats-grid">
      <div class="admin-stat-card">
        <div class="admin-stat-label">Produits en ligne</div>
        <div class="admin-stat-value">${totalProducts}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">Popularité cumulée</div>
        <div class="admin-stat-value">${totalPopularity}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">Best-sellers 🔥</div>
        <div class="admin-stat-value">${bestSellers}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">Nouveautés ✨</div>
        <div class="admin-stat-value">${newProducts}</div>
      </div>
    </div>

    <div class="admin-stats-section">
      <h3 class="admin-stats-title">Top 5 produits populaires</h3>
      <div class="admin-stats-list">
        ${top5.map((p) => {
          const pct = Math.round(((p.popularity_score || 0) / maxPop) * 100);
          return `
            <div class="admin-stat-row">
              <div class="admin-stat-row-info">
                <span class="admin-stat-row-name">${escapeHtml(p.name)}</span>
                <span class="admin-stat-row-score">${p.popularity_score || 0}</span>
              </div>
              <div class="admin-stat-bar"><div class="admin-stat-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="admin-stats-section">
      <h3 class="admin-stats-title">Top catégories</h3>
      <div class="admin-stats-list">
        ${topCats.map(([cat, score]) => {
          const pct = Math.round((score / maxCatPop) * 100);
          return `
            <div class="admin-stat-row">
              <div class="admin-stat-row-info">
                <span class="admin-stat-row-name">${escapeHtml(cat)} <span class="admin-stat-row-count">(${catCounts[cat]} articles)</span></span>
                <span class="admin-stat-row-score">${score}</span>
              </div>
              <div class="admin-stat-bar"><div class="admin-stat-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function renderAdminList() {
    const list = document.getElementById('adminProductsList');
    if (!list) return;
    list.innerHTML = state.products.map(p => `<li><span>${escapeHtml(p.name)} [ID: ${p.id}]</span><button class="btn-sm" data-action="admin-remove" data-id="${p.id}">🗑️</button></li>`).join('');
}
