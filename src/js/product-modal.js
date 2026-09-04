import { state, trackViewedItem } from './state.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, showToast, thumbImg, modalImg } from './utils.js';
import { addToCart, toggleFavorite } from './cart.js';
import { trackPopularity, trackView, getRelatedProducts, fetchTopPopularSubcategories, fetchProductDetails } from './api.js';
import { signalView } from './reco.js';

let currentProduct = null;
let sT = '';
let sC = '';
let currentQty = 1;
let colorQtys = {};
let imageSlideOffset = 0;
let recCache = { recommended: [], byCat: {} };
let activeRecTab = 'recommended';

const productDetailsCache = new Map();

async function buildRecommendations(current) {
    const TARGET = 12;
    const relatedIds = await getRelatedProducts(current.id, TARGET);
    const related = relatedIds
        .map(id => state.products.find(p => p.id === id))
        .filter(p => p && p.id !== current.id);

    const needed = TARGET - related.length;
    if (needed > 0) {
        const sameCat = state.products.filter(
            pr => pr.category_id && pr.category_id === current.category_id && pr.id !== current.id
        );
        const others = state.products
            .filter(pr => pr.category_id !== current.category_id && pr.id !== current.id && !relatedIds.includes(pr.id))
            .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
        const fallback = [...sameCat, ...others];
        for (const f of fallback) {
            if (related.length >= TARGET) break;
            if (!relatedIds.includes(f.id)) related.push(f);
        }
    }

    let rec = related.slice(0, TARGET);
    if (rec.length % 2 !== 0) rec.pop();
    return rec;
}

function productsForSubcategory(subId, limit = 12) {
    const list = state.products
        .filter(p => p.category_id === subId && (!currentProduct || p.id !== currentProduct.id))
        .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0))
        .slice(0, limit);
    if (list.length % 2 !== 0) list.pop();
    return list;
}

function renderRecCards(products) {
    const el = document.getElementById('modalRecCarousel');
    if (!el) return;
    if (!products.length) {
        el.innerHTML = '<div class="rec-empty">Aucun produit pour le moment</div>';
        return;
    }
    el.innerHTML = products.map(r => `
        <div class="rec-card" data-product-id="${r.id}">
            <div class="rec-card-img">${r.image ? thumbImg(r.image, r.name, 300, 300) : '<span class="rec-fallback">📦</span>'}</div>
            <div class="rec-card-overlay">
                <div class="rec-card-name">${escapeHtml(r.name)}</div>
                <div class="rec-card-bottom">
                    <div class="rec-card-price">${formatPrice(r.price)}</div>
                    <div class="rec-card-moq">Min. ${Number(r.moq) || 1}</div>
                </div>
            </div>
        </div>
    `).join('');
}

async function buildRecTabs(current) {
    const tabsEl = document.getElementById('modalRecTabs');
    if (!tabsEl) return;

    let subs = [];
    try {
        subs = await fetchTopPopularSubcategories(12);
    } catch (_) {
        subs = [];
    }
    const currentCat = current.category_id ? state.categoriesById.get(current.category_id) : null;
    const parentId = currentCat ? (currentCat.parent_id || currentCat.id) : null;

    subs = (subs || []).filter(s => s && s.id && s.name);
    if (parentId) {
        subs.sort((a, b) => {
            const aSame = a.parent_id === parentId || a.id === parentId ? 0 : 1;
            const bSame = b.parent_id === parentId || b.id === parentId ? 0 : 1;
            return aSame - bSame;
        });
    }
    subs = subs.slice(0, 7);

    let html = `<button type="button" class="rec-tab active" data-tab="recommended" role="tab" aria-selected="true">Recommandé</button>`;
    subs.forEach(s => {
        html += `<button type="button" class="rec-tab" data-tab="cat:${escapeHtml(s.id)}" data-cat-id="${escapeHtml(s.id)}" role="tab" aria-selected="false">${escapeHtml(s.name)}</button>`;
    });
    tabsEl.innerHTML = html;

    tabsEl.querySelectorAll('.rec-tab').forEach(btn => {
        btn.onclick = () => {
            tabsEl.querySelectorAll('.rec-tab').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            activeRecTab = btn.dataset.tab;

            if (activeRecTab === 'recommended') {
                renderRecCards(recCache.recommended);
            } else {
                const catId = btn.dataset.catId;
                if (!recCache.byCat[catId]) {
                    recCache.byCat[catId] = productsForSubcategory(catId);
                }
                renderRecCards(recCache.byCat[catId]);
            }
        };
    });
}

export async function openProductModal(pidOrProduct) {
    let p = null;
    if (pidOrProduct && typeof pidOrProduct === 'object' && pidOrProduct.id != null) {
        p = pidOrProduct;
    } else {
        const pid = pidOrProduct;
        if (pid == null || pid === '') return;
        p = state.products.find(pr => pr.id == pid || String(pr.id) === String(pid));
        if (!p) return;
    }

    currentProduct = p;
    state.currentProductId = p.id;
    trackViewedItem(p);
    trackPopularity(p.id, 1);
    try { signalView(p); } catch (_) {}
    try { trackView(p.id); } catch (_) {}

    let full = productDetailsCache.get(p.id);
    if (!full) {
        try {
            full = await fetchProductDetails(p.id);
            if (full) productDetailsCache.set(p.id, full);
        } catch (_) {}
    }
    if (full) p = { ...p, ...full };
    currentProduct = p;

    const modal = document.getElementById('productModal');
    if (!modal) return;

    const nameEl = document.getElementById('modalProductName');
    const priceEl = document.getElementById('modalPrice');
    const moqEl = document.getElementById('modalMoq');
    const descEl = document.getElementById('modalDesc');
    const badgesEl = document.getElementById('modalBadges');
    const totalEl = document.getElementById('modalTotal');

    if (nameEl) nameEl.textContent = p.name || '';
    if (priceEl) priceEl.textContent = formatPrice(p.price);
    const moq = Number(p.moq) || 1;
    if (moqEl) moqEl.textContent = moq > 1 ? `MOQ : ${moq}` : '';
    if (descEl) descEl.textContent = p.description || '';
    if (badgesEl) badgesEl.innerHTML = generateBadgesHTML(p);

    const allImgs = [];
    if (p.image) allImgs.push(p.image);
    if (p.image2) allImgs.push(p.image2);
    if (p.image3) allImgs.push(p.image3);
    if (p.image4) allImgs.push(p.image4);
    if (p.image5) allImgs.push(p.image5);
    if (p.image6) allImgs.push(p.image6);
    if (!allImgs.length && p.images) {
        const arr = Array.isArray(p.images) ? p.images : String(p.images).split(',').map(s => s.trim()).filter(Boolean);
        allImgs.push(...arr);
    }

    imageSlideOffset = p.video ? 1 : 0;

    const track = document.getElementById('modalCarouselTrack');
    const dots = document.getElementById('modalCarouselDots');
    if (track) {
        let slides = '';
        if (p.video) {
            slides += `<div class="carousel-slide"><video src="${escapeHtml(p.video)}" controls playsinline muted loop style="width:100%;height:100%;object-fit:cover;"></video></div>`;
        }
        allImgs.forEach((src, i) => {
            slides += `<div class="carousel-slide">${modalImg(src, p.name, i === 0)}</div>`;
        });
        if (!slides) slides = `<div class="carousel-slide"><div class="no-img">📦</div></div>`;
        track.innerHTML = slides;
        track.style.transform = 'translateX(0)';
    }
    if (dots) {
        const totalSlides = (p.video ? 1 : 0) + allImgs.length;
        dots.innerHTML = Array.from({ length: Math.max(1, totalSlides) }, (_, i) =>
            `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`
        ).join('');
        dots.querySelectorAll('.carousel-dot').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.dataset.idx);
                if (track) track.style.transform = `translateX(-${idx * 100}%)`;
                dots.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
            };
        });
    }

    const tailles = (p.tailles || p.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
    const tailleGroup = document.getElementById('modalTailleGroup');
    const tailleOpts = document.getElementById('modalTailleOptions');
    const tailleLabel = document.getElementById('modalTailleLabel');
    sT = '';
    if (tailles.length && tailleGroup && tailleOpts) {
        tailleGroup.style.display = '';
        if (tailleLabel) tailleLabel.textContent = `Taille (${tailles.length})`;
        tailleOpts.innerHTML = tailles.map(t =>
            `<button type="button" class="option-btn" data-val="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        ).join('');
        tailleOpts.querySelectorAll('.option-btn').forEach(btn => {
            btn.onclick = () => {
                tailleOpts.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                sT = btn.dataset.val;
            };
        });
        const first = tailleOpts.querySelector('.option-btn');
        if (first) { first.classList.add('selected'); sT = first.dataset.val; }
    } else if (tailleGroup) {
        tailleGroup.style.display = 'none';
    }

    const couleurs = (p.couleurs || p.colors || '').split(',').map(s => s.trim()).filter(Boolean);
    const couleurGroup = document.getElementById('modalCouleurGroup');
    const couleurOpts = document.getElementById('modalCouleurOptions');
    const couleurLabel = document.getElementById('modalCouleurLabel');
    const qtyGroup = document.getElementById('modalQtyGroup');
    sC = '';
    colorQtys = {};

    function goToImageForColor(idx) {
        const slideIdx = imageSlideOffset + Math.min(idx, Math.max(0, allImgs.length - 1));
        if (track) track.style.transform = `translateX(-${slideIdx * 100}%)`;
        if (dots) {
            dots.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === slideIdx));
        }
    }

    function getTotalColorQty() {
        return Object.values(colorQtys).reduce((s, q) => s + (Number(q) || 0), 0);
    }

    function updateTotal() {
        const uPrice = Number(p.price) || 0;
        const totalQty = couleurs.length ? getTotalColorQty() : currentQty;
        if (totalEl) {
            totalEl.textContent = totalQty > 0
                ? `Total : ${formatPrice(uPrice * totalQty)} (${totalQty} pc${totalQty > 1 ? 's' : ''})`
                : `Total : ${formatPrice(0)}`;
        }
        const minus = document.getElementById('modalQtyMinus');
        if (minus) minus.disabled = currentQty <= moq;
    }

    function updateColorLabel() {
        if (!couleurLabel) return;
        const total = getTotalColorQty();
        if (total > 0) {
            const parts = Object.entries(colorQtys).filter(([, q]) => q > 0).map(([c, q]) => `${c} ×${q}`);
            couleurLabel.textContent = `Couleurs (${total} pcs) : ${parts.join(', ')}`;
        } else {
            couleurLabel.textContent = `Couleur (${couleurs.length}) — choisis les quantités`;
        }
    }

    function renderColorVariants(ct) {
        if (!ct) return;
        ct.className = 'option-buttons color-variant-list';
        ct.innerHTML = couleurs.map((c, i) => {
            const imgSrc = allImgs[i] || allImgs[0] || '';
            const thumb = imgSrc ? thumbImg(imgSrc, c, 52, 52) : '';
            colorQtys[c] = 0;
            return `
            <div class="color-variant-row" data-val="${escapeHtml(c)}" data-idx="${i}">
                <button type="button" class="color-variant-thumb" title="${escapeHtml(c)}" aria-label="Voir ${escapeHtml(c)}">
                    ${thumb ? `<span class="swatch-img">${thumb}</span>` : `<span class="swatch-fallback">${escapeHtml(c.charAt(0).toUpperCase())}</span>`}
                </button>
                <div class="color-variant-info">
                    <span class="color-variant-name">${escapeHtml(c)}</span>
                </div>
                <div class="mini-qty-stepper">
                    <button type="button" class="mini-qty-btn" data-action="minus" data-color="${escapeHtml(c)}" aria-label="Diminuer">−</button>
                    <span class="mini-qty-value" data-color="${escapeHtml(c)}">0</span>
                    <button type="button" class="mini-qty-btn" data-action="plus" data-color="${escapeHtml(c)}" aria-label="Augmenter">+</button>
                </div>
            </div>`;
        }).join('');

        ct.querySelectorAll('.color-variant-thumb').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const row = btn.closest('.color-variant-row');
                const idx = Number(row.dataset.idx);
                goToImageForColor(idx);
                ct.querySelectorAll('.color-variant-row').forEach(r => r.classList.remove('active-preview'));
                row.classList.add('active-preview');
            };
        });

        ct.querySelectorAll('.mini-qty-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const color = btn.dataset.color;
                const action = btn.dataset.action;
                let q = Number(colorQtys[color]) || 0;
                if (action === 'plus') q += 1;
                else q = Math.max(0, q - 1);
                colorQtys[color] = q;
                const valEl = ct.querySelector(`.mini-qty-value[data-color="${CSS.escape(color)}"]`);
                if (valEl) valEl.textContent = String(q);
                const row = btn.closest('.color-variant-row');
                if (row) row.classList.toggle('has-qty', q > 0);
                updateColorLabel();
                updateTotal();
            };
        });

        const firstRow = ct.querySelector('.color-variant-row');
        if (firstRow) {
            firstRow.classList.add('active-preview');
            goToImageForColor(0);
        }
        updateColorLabel();
    }

    if (couleurs.length && couleurGroup && couleurOpts) {
        couleurGroup.style.display = '';
        renderColorVariants(couleurOpts);
        if (qtyGroup) qtyGroup.style.display = 'none';
    } else {
        if (couleurGroup) couleurGroup.style.display = 'none';
        if (qtyGroup) qtyGroup.style.display = '';
    }

    currentQty = moq;
    const qtyValueEl = document.getElementById('modalQtyValue');
    const qtyMinus = document.getElementById('modalQtyMinus');
    const qtyPlus = document.getElementById('modalQtyPlus');
    if (qtyValueEl) qtyValueEl.textContent = String(currentQty);
    if (qtyMinus) {
        qtyMinus.onclick = () => {
            if (currentQty <= moq) return;
            currentQty = Math.max(moq, currentQty - 1);
            updateTotal();
            if (qtyValueEl) qtyValueEl.textContent = String(currentQty);
        };
    }
    if (qtyPlus) {
        qtyPlus.onclick = () => {
            currentQty += 1;
            updateTotal();
            if (qtyValueEl) qtyValueEl.textContent = String(currentQty);
        };
    }
    updateTotal();

    const favBtn = document.getElementById('modalFavBtn');
    if (favBtn) {
        favBtn.classList.toggle('active', state.favorites.includes(p.id));
        favBtn.onclick = () => toggleFavorite(p.id, favBtn);
    }

    const shareBtn = document.getElementById('modalShareBtn');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            const url = `${BASE_URL}?id=${p.id}`;
            if (navigator.share) {
                try { await navigator.share({ title: p.name, url }); } catch (_) {}
            } else {
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('Lien copié');
                } catch (_) {}
            }
        };
    }

    const addBtn = document.getElementById('addToCartStickyBtn');
    if (addBtn) {
        addBtn.onclick = (e) => {
            if (couleurs.length) {
                const selected = Object.entries(colorQtys).filter(([, q]) => q > 0);
                const totalQ = selected.reduce((s, [, q]) => s + q, 0);
                if (selected.length === 0) {
                    showToast('⚠️ Choisis au moins une quantité');
                    return;
                }
                if (totalQ < moq) {
                    showToast(`⚠️ Minimum d'achat : ${moq} pièce(s)`);
                    return;
                }
                selected.forEach(([color, qty], i) => {
                    addToCart(p.id, sT, color, i === 0 ? e.currentTarget : null, qty);
                });
            } else {
                addToCart(p.id, sT, '', e.currentTarget, currentQty);
            }
        };
    }

    const orderBtn = document.getElementById('directOrderBtn');
    if (orderBtn) {
        orderBtn.onclick = () => {
            let msg = `Bonjour FLUO, je souhaite commander :\n${p.name} (ID: ${p.id})`;
            if (sT) msg += `\nTaille: ${sT}`;
            if (couleurs.length) {
                const selected = Object.entries(colorQtys).filter(([, q]) => q > 0);
                if (selected.length === 0) {
                    showToast('⚠️ Choisis au moins une quantité');
                    return;
                }
                const totalQ = selected.reduce((s, [, q]) => s + q, 0);
                if (totalQ < moq) {
                    showToast(`⚠️ Minimum d'achat : ${moq} pièce(s)`);
                    return;
                }
                msg += '\nCouleurs:';
                selected.forEach(([c, q]) => { msg += `\n  • ${c} × ${q}`; });
                msg += `\nQuantité totale: ${totalQ}`;
            } else {
                msg += `\nQuantité: ${currentQty}`;
            }
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
        };
    }

    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.onclick = closeProductModal;

    recCache = { recommended: [], byCat: {} };
    activeRecTab = 'recommended';
    const recCarousel = document.getElementById('modalRecCarousel');
    if (recCarousel) {
        recCarousel.innerHTML = Array(4).fill('<div class="rec-card rec-skeleton"><div class="rec-card-img"></div></div>').join('');
    }
    buildRecommendations(p).then(rec => {
        recCache.recommended = rec;
        if (activeRecTab === 'recommended') renderRecCards(rec);
    }).catch(() => {
        if (activeRecTab === 'recommended') renderRecCards([]);
    });
    buildRecTabs(p).catch(() => {});

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    state.modalOpen = true;
}

export function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    currentProduct = null;
    colorQtys = {};
    state.modalOpen = false;
    state.currentProductId = null;
}
