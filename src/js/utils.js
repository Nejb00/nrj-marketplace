import { NEW_PRODUCT_DAYS, POPULAR_THRESHOLD, MAX_SEARCH_RESULTS } from './config.js';
import { state } from './state.js';

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
export function formatPrice(a) { return 'XAF ' + a.toLocaleString('fr-FR'); }
export function removeEmojis(s) { return s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FB}\u{25FC}\u{25B6}\u{25C0}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}\u{200D}]/gu, '').trim(); }

export function isNewProduct(p) {
    if (!p.created_at) return false;
    return (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24) <= NEW_PRODUCT_DAYS;
}

// ✅ PACK POLISH (4) : badge NOUVEAU rare — moins de 7 jours ET parmi les 30 plus récents.
const MAX_FRESH_BADGES = 30;
let _freshCache = null;
let _freshRef = null;
export function isFresh(p) {
    if (!p || !p.created_at) return false;
    if (_freshRef !== state.products) {
        _freshRef = state.products;
        const cutoff = Date.now() - NEW_PRODUCT_DAYS * 86400000;
        _freshCache = new Set(
            [...state.products]
                .filter(x => x.created_at && new Date(x.created_at).getTime() >= cutoff)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, MAX_FRESH_BADGES)
                .map(x => x.id)
        );
    }
    return _freshCache.has(p.id);
}

export function isBestSeller(p) { return (Number(p.popularity_score) || 0) >= POPULAR_THRESHOLD; }

export function generateBadgesHTML(p, isModal = false) {
    const isNew = isFresh(p);
    const isBest = isBestSeller(p);
    if (!isModal) {
        if (isBest) return '<div class="badge-container"><span class="badge badge-best-seller">🔥 Populaire</span></div>';
        if (isNew) return '<div class="badge-container"><span class="badge badge-new">✨ Nouveau</span></div>';
        return '';
    }
    let html = '<div class="badge-container">';
    if (isNew) html += '<span class="badge badge-new">✨ Nouveau</span>';
    if (isBest) html += '<span class="badge badge-best-seller">🔥 Populaire</span>';
    html += '</div>';
    return (isNew || isBest) ? html : '';
}

export function showToast(m) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

export function getCategoryIcon(category) {
    if (!category) return '📦';
    const cat = category.toLowerCase();
    if (cat.includes('chaussure') || cat.includes('basket') || cat.includes('sneaker') || cat.includes('sport')) return '👟';
    if (cat.includes('électronique') || cat.includes('electronique') || cat.includes('tech') || cat.includes('phone') || cat.includes('mobile')) return '📱';
    if (cat.includes('mode') || cat.includes('vêtement') || cat.includes('vetement') || cat.includes('fashion')) return '👕';
    if (cat.includes('bijou') || cat.includes('accessoire')) return '💍';
    if (cat.includes('maison') || cat.includes('déco') || cat.includes('deco')) return '🏠';
    if (cat.includes('beauté') || cat.includes('beaute') || cat.includes('cosmétique')) return '💄';
    if (cat.includes('enfant') || cat.includes('jouet')) return '🧸';
    if (cat.includes('livre') || cat.includes('book')) return '📚';
    return '📦';
}

export function normalizeString(str) {
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function calculateSearchScore(query, product) {
    const normalizedQuery = normalizeString(query);
    const queryWords = normalizedQuery.split(' ').filter(w => w.length > 0);

    const name = normalizeString(product.name || '');
    const category = normalizeString(product.category || '');
    const description = normalizeString(product.description || '');
    const tailles = normalizeString(product.tailles || '');
    const couleurs = normalizeString(product.couleurs || '');
    const id = String(product.id);

    let score = 0;

    if (id === query.trim()) score += 2000;

    if (name === normalizedQuery) score += 1000;
    else if (name.startsWith(normalizedQuery)) score += 500;
    else if (name.includes(normalizedQuery)) score += 200;

    queryWords.forEach(word => {
        if (word.length < 2) return;
        if (name.includes(word)) score += 100;
        if (category.includes(word)) score += 50;
        if (description.includes(word)) score += 20;
        if (tailles.includes(word)) score += 30;
        if (couleurs.includes(word)) score += 30;
        const wordRegex = new RegExp(`\\b${word}`, 'i');
        if (wordRegex.test(name)) score += 30;
    });

    if (score === 0 && queryWords.length === 1) {
        const queryWord = queryWords[0];
        const nameWords = name.split(' ');
        for (const nameWord of nameWords) {
            if (nameWord.length < 3) continue;
            const distance = levenshteinDistance(queryWord, nameWord);
            const maxLen = Math.max(queryWord.length, nameWord.length);
            const similarity = 1 - (distance / maxLen);
            if (similarity > 0.7) {
                score += Math.round(similarity * 80);
                break;
            }
        }
    }

    if (isBestSeller(product)) score += 15;
    if (isFresh(product)) score += 10;

    return score;
}

export function fuzzySearch(query, products) {
    if (!query || query.trim().length === 0) return [];

    const scored = products.map(p => ({
        product: p,
        score: calculateSearchScore(query, p)
    })).filter(item => item.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_SEARCH_RESULTS).map(item => item.product);
}

export function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    const escapedText = escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<span class="highlight">$1</span>');
}

// ─── Optimisation images : vignettes légères pour économiser les forfaits ───
export function thumb(url, w = 300, h = 400) {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  const params = new URLSearchParams({ url, w: String(w), h: String(h), fit: 'cover', output: 'webp', q: '80' });
  return `https://wsrv.nl/?${params.toString()}`;
}

export function thumbImg(url, alt = '', w = 300, h = 400, cls = '') {
  if (!url) return '';
  const onerr = `this.onerror=function(){this.style.display='none'};if(this.dataset.full){this.src=this.dataset.full;this.removeAttribute('data-full');}`;
  const clsAttr = cls ? ` class="${escapeHtml(cls)}"` : '';
  return `<img${clsAttr} src="${escapeHtml(thumb(url, w, h))}" data-full="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" onload="this.classList.add('loaded')" onerror="${onerr}">`;
                }
