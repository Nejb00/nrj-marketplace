// ─── CERVEAU NRJ 🧠 — personnalisation locale (niveau 1) ──────────────────
import { isFresh } from './utils.js';
import './visual-search.js'; // 📷 Phase 3 : le module visuel s'auto-démarre

const KEY = 'nrj_affinity';
const MIN_SIGNALS = 4;

let profile = load();

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (raw && typeof raw === 'object' && raw.categories) return raw;
    } catch {}
    return { categories: {}, priceSum: 0, priceCount: 0, total: 0 };
}

function save() {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
}

function bump(category, weight, price) {
    if (category) profile.categories[category] = (profile.categories[category] || 0) + weight;
    const pr = Number(price) || 0;
    if (pr > 0) { profile.priceSum += pr; profile.priceCount += 1; }
    profile.total = (profile.total || 0) + 1;
    save();
}

// ✅ Signaux — appelés par product-modal.js et cart.js
export function signalView(p)     { if (p) bump(p.category, 1, p.price); }
export function signalFavorite(p) { if (p) bump(p.category, 3, p.price); }
export function signalCart(p)     { if (p) bump(p.category, 5, p.price); }
export function signalOrder(p)    { if (p) bump(p.category, 8, p.price); }

export function hasProfile() { return (profile.total || 0) >= MIN_SIGNALS; }

// ✅ Score d'affinité d'un produit avec le profil
export function affinityScore(p) {
    let score = 0;
    score += (profile.categories[p.category] || 0) * 3;           // catégories aimées
    if (profile.priceCount > 0) {                                 // budget habituel
        const avg = profile.priceSum / profile.priceCount;
        const dist = Math.abs((Number(p.price) || 0) - avg) / Math.max(avg, 1);
        score += Math.max(0, 8 - dist * 8);
    }
    score += Math.min(8, (Number(p.popularity_score) || 0) / 4);  // boost communautaire
    if (isFresh(p)) score += 2;                                   // pointe de nouveauté
    return score;
}

// ✅ Classement « Pour toi »
export function forYou(list) {
    return [...list].sort((a, b) => affinityScore(b) - affinityScore(a));
}

// ✅ Injecte la puce « ✨ Pour toi » (avant que main.js attache ses listeners)
const qf = document.querySelector('.quick-filters');
if (qf && !qf.querySelector('[data-filter="foryou"]')) {
    const b = document.createElement('button');
    b.className = 'filter-chip';
    b.dataset.filter = 'foryou';
    b.textContent = '✨ Pour toi';
    qf.appendChild(b);
        }
