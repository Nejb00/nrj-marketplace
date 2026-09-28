// ═══ Utils — recherche floue (score + Levenshtein + surlignage) ═══
// Éclaté de utils.js (refacto-archi).
import { MAX_SEARCH_RESULTS } from '../core/config.js';
import { escapeHtml } from './escape-html.js';
import { isBestSeller, isFresh } from './badges.js';

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
    // Nom de catégorie via jointure client (category_name) — plus de products.category texte
    const category = normalizeString(product.category_name || '');
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
