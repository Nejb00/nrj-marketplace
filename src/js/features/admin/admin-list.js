// ═══ Admin — liste produits + statistiques ═══
// Éclaté de admin.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { categoryLabel } from './category-dropdowns.js';

export function renderAdminList() {
  const list = document.getElementById('adminProductsList');
  if (!list) return;
  list.innerHTML = state.products.map(p =>
    `<li><span>${escapeHtml(p.name)} [ID: ${p.id}]</span><button class="btn-sm" data-action="admin-remove" data-id="${p.id}">🗑️</button></li>`
  ).join('');
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

  // Top catégories (basé sur category_id désormais, avec repli sur l'ancien texte si absent)
  const catScores = {};
  const catCounts = {};
  state.products.forEach((p) => {
    const label = p.category_id ? categoryLabel(p.category_id) : p.category;
    if (!label) return;
    catScores[label] = (catScores[label] || 0) + (p.popularity_score || 0);
    catCounts[label] = (catCounts[label] || 0) + 1;
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
