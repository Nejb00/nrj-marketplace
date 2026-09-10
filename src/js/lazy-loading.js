/**
 * Préchargement agressif des images produits.
 * Visibles d'abord (LCP + fetchpriority=high), puis jusqu'à PRELOAD_IMAGE_COUNT
 * via une file limitée pour ne pas saturer le réseau mobile.
 */
import { thumb } from './utils.js';
import {
    EAGER_IMAGE_COUNT,
    PRELOAD_IMAGE_COUNT,
    PRELOAD_CONCURRENCY,
    LCP_PRELOAD_COUNT
} from './config.js';

const warmed = new Set();
/** @type {{ url: string, priority: number }[]} */
const queue = [];
let inflight = 0;
/** @type {HTMLLinkElement[]} */
let lcpLinks = [];

function preloadBudget() {
    try {
        const c = navigator.connection;
        if (c?.saveData) return EAGER_IMAGE_COUNT;
        if (c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g') return EAGER_IMAGE_COUNT;
    } catch {}
    return PRELOAD_IMAGE_COUNT;
}

export function imageLoadOpts(index) {
    if (index < EAGER_IMAGE_COUNT) return { loading: 'eager', fetchpriority: 'high' };
    return { loading: 'lazy' };
}

export function preloadUrl(url, priority = 1) {
    if (!url || warmed.has(url)) return;
    warmed.add(url);
    queue.push({ url, priority });
    queue.sort((a, b) => a.priority - b.priority);
    pump();
}

function pump() {
    while (inflight < PRELOAD_CONCURRENCY && queue.length) {
        const item = queue.shift();
        if (!item) break;
        inflight++;
        const img = new Image();
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        const done = () => {
            inflight--;
            pump();
        };
        img.onload = done;
        img.onerror = done;
        img.src = item.url;
    }
}

export function preloadProductThumbs(products, { start = 0, count = PRELOAD_IMAGE_COUNT, w = 300, h = 400 } = {}) {
    const budget = preloadBudget();
    const slice = (products || []).slice(start, start + count);
    slice.forEach((p, i) => {
        if (!p?.image) return;
        const absIndex = start + i;
        if (absIndex >= budget && absIndex >= EAGER_IMAGE_COUNT) return;
        const url = thumb(p.image, w, h);
        const priority = absIndex < EAGER_IMAGE_COUNT ? 0 : 1;
        preloadUrl(url, priority);
    });
}

export function injectLcpPreloads(products, count = LCP_PRELOAD_COUNT) {
    lcpLinks.forEach((el) => el.remove());
    lcpLinks = [];
    (products || []).slice(0, count).forEach((p) => {
        if (!p?.image) return;
        const href = thumb(p.image, 300, 400);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = href;
        link.setAttribute('fetchpriority', 'high');
        document.head.appendChild(link);
        lcpLinks.push(link);
        warmed.add(href);
    });
}

export function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'product-card skeleton-card';
    skeleton.innerHTML = `
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton-info">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text skeleton-short"></div>
        </div>
    `;
    return skeleton;
}

export function showSkeletonLoaders(gridId, count = 12) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        grid.appendChild(createSkeletonCard());
    }
}
