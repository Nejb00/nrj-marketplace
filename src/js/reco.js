// ─── CERVEAU NRJ 🧠 — personnalisation locale (niveau 1) ──────────
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

function bump(categoryKey, weight, price) {
    if (categoryKey) profile.categories[categoryKey] = (profile.categories[categoryKey] || 0) + weight;
    const pr = Number(price) || 0;
    if (pr > 0) { profile.priceSum += pr; profile.priceCount += 1; }
    profile.total = (profile.total || 0) + 1;
    save();
}

/** Clé d'affinité : category_id si dispo, sinon category_name. */
function categoryKey(p) {
    if (!p) return null;
    return p.category_id || p.category_name || null;
}

// ✅ Signaux — appelés par product-modal.js et cart.js
export function signalView(p)     { if (p) bump(categoryKey(p), 1, p.price); }
export function signalFavorite(p) { if (p) bump(categoryKey(p), 3, p.price); }
export function signalCart(p)     { if (p) bump(categoryKey(p), 5, p.price); }
export function signalOrder(p)    { if (p) bump(categoryKey(p), 8, p.price); }

export function hasProfile() { return (profile.total || 0) >= MIN_SIGNALS; }

export function affinityScore(p) {
    let score = 0;
    const key = categoryKey(p);
    score += (profile.categories[key] || 0) * 3;
    if (profile.priceCount > 0) {
        const avg = profile.priceSum / profile.priceCount;
        const dist = Math.abs((Number(p.price) || 0) - avg) / Math.max(avg, 1);
        score += Math.max(0, 8 - dist * 8);
    }
    score += Math.min(8, (Number(p.popularity_score) || 0) / 4);
    if (isFresh(p)) score += 2;
    return score;
}

export function forYou(list) {
    return [...list].sort((a, b) => affinityScore(b) - affinityScore(a));
}

const qf = document.querySelector('.quick-filters');
if (qf && !qf.querySelector('[data-filter="foryou"]')) {
    const b = document.createElement('button');
    b.className = 'filter-chip';
    b.dataset.filter = 'foryou';
    b.textContent = '✨ Pour toi';
    qf.appendChild(b);
}
