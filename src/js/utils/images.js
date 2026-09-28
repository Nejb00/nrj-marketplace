// ═══ Utils — images (proxy wsrv.nl, variantes, watchdog) ═══
// Éclaté de utils.js (refacto-archi). Le watchdog démarre au chargement
// du module (side-effect historique de utils.js ligne 284).
import { escapeHtml } from './escape-html.js';

const SIZE_TIERS = [100, 150, 200, 300, 400, 500, 600, 800, 1200];

function normalizeSize(size) {
    for (const tier of SIZE_TIERS) {
        if (size <= tier) return tier;
    }
    return SIZE_TIERS[SIZE_TIERS.length - 1];
}

export function thumb(url, w = 300, h = 400, fit = 'cover') {
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) return url;

    // wsrv.nl (images.weserv.nl) bloque postimg.* : "Domain or TLD blocked by policy"
    // → 400 JSON, images invisibles (opacity:0 tant que .loaded n'est pas posé).
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host === 'postimg.cc' || host.endsWith('.postimg.cc') ||
            host === 'postimg.org' || host.endsWith('.postimg.org') ||
            host === 'postimages.org' || host.endsWith('.postimages.org')) {
            return url;
        }
    } catch {
        return url;
    }

    const nw = normalizeSize(w);
    const nh = normalizeSize(h);

    const params = new URLSearchParams({
        url,
        w: String(nw),
        h: String(nh),
        fit,
        output: 'webp',
        q: '80'
    });
    return `https://wsrv.nl/?${params.toString()}`;
}

function imgErrorHandler(usingProxy) {
    if (usingProxy) {
        return `this.onerror=function(){this.onerror=null;this.classList.add('loaded');};this.src=this.dataset.full||this.src;this.removeAttribute('data-full');this.removeAttribute('data-ts');`;
    }
    return `this.onerror=null;this.classList.add('loaded');`;
}

export function thumbImg(url, alt = '', w = 300, h = 400, cls = '', opts = {}) {
    if (!url) return '';

    const thumbUrl = thumb(url, w, h);
    const onerr = imgErrorHandler(thumbUrl !== url);
    const clsAttr = cls ? ` class="${escapeHtml(cls)}"` : '';
    const loading = opts.loading || 'lazy';
    const pri = opts.fetchpriority ? ` fetchpriority="${escapeHtml(opts.fetchpriority)}"` : '';

    return `<img${clsAttr} src="${escapeHtml(thumbUrl)}" data-full="${escapeHtml(url)}" data-ts="${Date.now()}" alt="${escapeHtml(alt)}" loading="${loading}"${pri} referrerpolicy="no-referrer" decoding="async" onload="this.classList.add('loaded')" onerror="${onerr}" width="${w}" height="${h}">`;
}

export function modalImg(url, alt = '') {
    if (!url) return '';

    const thumbUrl = thumb(url, 800, 1200, 'contain');
    const onerr = imgErrorHandler(thumbUrl !== url);

    return `<img src="${escapeHtml(thumbUrl)}" data-full="${escapeHtml(url)}" data-ts="${Date.now()}" alt="${escapeHtml(alt)}" loading="eager" decoding="async" onload="this.classList.add('loaded')" onerror="${onerr}" style="width:100%;height:100%;object-fit:contain;">`;
}

export function searchThumbImg(url, alt = '') {
    if (!url) return '';

    const thumbUrl = thumb(url, 100, 100, 'cover');
    const onerr = imgErrorHandler(thumbUrl !== url);

    return `<img src="${escapeHtml(thumbUrl)}" data-full="${escapeHtml(url)}" data-ts="${Date.now()}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="${onerr}" style="width:100%;height:100%;object-fit:cover;">`;
}

let _watchdogStarted = false;
function startImgWatchdog() {
    if (_watchdogStarted) return;
    _watchdogStarted = true;
    setInterval(() => {
        const now = Date.now();
        document.querySelectorAll('img[data-full][data-ts]:not(.loaded)').forEach((img) => {
            if (now - Number(img.dataset.ts) > 2500) {
                const full = img.dataset.full;
                img.removeAttribute('data-ts');
                img.removeAttribute('data-full');
                if (full && img.src !== full) {
                    img.src = full;
                } else {
                    img.classList.add('loaded');
                }
            }
        });
    }, 1000);
}
startImgWatchdog();
