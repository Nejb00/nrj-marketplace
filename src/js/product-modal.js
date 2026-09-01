import { state } from './state.js';
import { trackViewedItem } from './state.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, showToast, thumbImg, modalImg, thumb } from './utils.js';
import { trackPopularity, fetchProductDetails, trackView, getRelatedProducts } from './api.js';
import { toggleFavorite, addToCart } from './cart.js';
import { signalView } from './reco.js';

const productDetailsCache = new Map();

const _modal = document.getElementById('productModal');
const _rec = _modal ? _modal.querySelector('.recommendations') : null;
const _src = _modal ? _modal.querySelector('.sourcing-section') : null;
if (_modal && _rec && _src) _modal.insertBefore(_src, _rec);

const _backBtn = document.getElementById('modalCloseBtn');
if (_backBtn) _backBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const _shareBtn = document.getElementById('modalShareBtn');
if (_shareBtn) _shareBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

function updateCarouselDots(sc, dc, index) {
    dc.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

function pauseModalVideos() {
    document.querySelectorAll('#modalCarouselScroll video').forEach(v => {
        try { v.pause(); } catch {}
    });
}

function buildModalVideoSlide(videoUrl, posterUrl, alt) {
    const src = escapeHtml(videoUrl.trim());
    const poster = posterUrl ? escapeHtml(posterUrl.trim()) : '';
    const posterAttr = poster ? ` poster="${poster}"` : '';
    const label = escapeHtml(alt || 'Vidéo produit');
    return `<div class="carousel-item carousel-item--video">` +
        `<video class="modal-product-video" controls playsinline preload="metadata"${posterAttr} src="${src}" title="${label}" aria-label="${label}"></video>` +
        `</div>`;
}

async function buildRecommendations(currentProduct) {
    const TARGET = 12;
    const relatedIds = await getRelatedProducts(currentProduct.id, TARGET);
    const related = relatedIds
        .map(id => state.products.find(p => p.id === id))
        .filter(p => p && p.id !== currentProduct.id);
    
    const needed = TARGET - related.length;
    if (needed > 0) {
        const sameCat = state.products.filter(
            pr => pr.category_id && pr.category_id === currentProduct.category_id && pr.id !== currentProduct.id
        );
        const others = state.products
            .filter(pr => pr.category_id !== currentProduct.category_id && pr.id !== currentProduct.id && !relatedIds.includes(pr.id))
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

export async function openProductModal(pid) {
    let p = state.products.find(pr => pr.id === pid);
    if (!p) return;
    
    state.currentProductId = pid;
    trackPopularity(pid, 1);
    trackViewedItem(p.name);
    signalView(p);
    trackView(pid);
    
    let fullProduct = productDetailsCache.get(pid);
    if (!fullProduct) {
        fullProduct = await fetchProductDetails(pid);
        if (fullProduct) productDetailsCache.set(pid, fullProduct);
    }
    if (fullProduct) p = fullProduct;
    
    const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
    const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
    let sT = tailles.length ? tailles[0] : '', sC = couleurs.length ? couleurs[0] : '';
    const moq = Number(p.moq) || 1, uPrice = Number(p.price);

    document.getElementById('modalPrice').textContent = formatPrice(uPrice);
    document.getElementById('modalMoq').textContent = `Minimum d'achat : ${moq} pièce(s)`;
    document.getElementById('modalTotal').textContent = `Total minimum : ${formatPrice(uPrice * moq)}`;
    document.getElementById('modalDesc').textContent = p.description || '';
    document.getElementById('modalProductIdBadge').textContent = `[ID: ${p.id}]`;
    document.getElementById('modalBadges').innerHTML = generateBadgesHTML(p, true);
    
    const modalFavBtn = document.getElementById('modalFavBtn');
    if (modalFavBtn) {
        const favSvg = modalFavBtn.querySelector('.fav-icon-svg');
        if (favSvg) favSvg.classList.toggle('faved', state.favorites.includes(p.id));
        modalFavBtn.onclick = () => toggleFavorite(p.id);
    }
    
    document.getElementById('modalShareBtn').onclick = () => {
        const url = BASE_URL + '?id=' + p.id;
        const txt = `${formatPrice(uPrice)}\nMinimum d'achat : ${moq} pièce(s)\nDécouvre "${p.name}" sur FLUO ${url}`;
        if (typeof navigator.share === 'function') {
            navigator.share({ title: p.name, text: txt, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        }
    };

    const videoUrl = (p.video_url || '').trim();
    const imgs = [p.image, p.image2, p.image3, p.image4, p.image5, p.image6].filter(u => u && u.trim());
    const sc = document.getElementById('modalCarouselScroll'), dc = document.getElementById('modalCarouselDots');
    sc.innerHTML = '';
    dc.innerHTML = '';

    let slideIndex = 0;
    if (videoUrl) {
        const poster = imgs[0] || p.image || '';
        sc.innerHTML += buildModalVideoSlide(videoUrl, poster, p.name);
        dc.innerHTML += `<span class="carousel-dot active" data-index="${slideIndex}"></span>`;
        slideIndex++;
    }

    if (!imgs.length && !videoUrl) {
        sc.innerHTML = '<div class="modal-placeholder">📦</div>';
        dc.innerHTML = '';
    } else {
        imgs.forEach((u) => {
            sc.innerHTML += `<div class="carousel-item">${modalImg(u, p.name)}</div>`;
            dc.innerHTML += `<span class="carousel-dot ${slideIndex === 0 && !videoUrl ? 'active' : (slideIndex === 0 ? 'active' : '')}" data-index="${slideIndex}"></span>`;
            // Fix active class: only first overall slide is active
            slideIndex++;
        });
        // Ensure only first dot is active
        dc.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
    }

    sc.scrollLeft = 0;

    if (!sc.dataset.bound) {
        sc.addEventListener('scroll', () => {
            const idx = Math.round(sc.scrollLeft / Math.max(sc.offsetWidth, 1));
            updateCarouselDots(sc, dc, idx);
            // Pause video when user leaves the video slide
            const videos = sc.querySelectorAll('video');
            videos.forEach((v, vi) => {
                if (vi !== idx) {
                    try { v.pause(); } catch {}
                }
            });
        });
        sc.dataset.bound = '1';
    }
    if (!dc.dataset.bound) {
        dc.addEventListener('click', e => {
            if (e.target.classList.contains('carousel-dot')) {
                sc.scrollTo({ left: sc.offsetWidth * parseInt(e.target.dataset.index, 10), behavior: 'smooth' });
            }
        });
        dc.dataset.bound = '1';
    }

    function renderOptions(ct, opts, sel, ty) {
        ct.innerHTML = '';
        opts.forEach(o => {
            const b = document.createElement('button');
            b.className = 'option-btn' + (o === sel ? ' selected' : '');
            b.textContent = o;
            b.onclick = () => {
                ct.querySelectorAll('.option-btn').forEach(x => x.classList.remove('selected'));
                b.classList.add('selected');
                if (ty === 'taille') sT = o; else sC = o;
            };
            ct.appendChild(b);
        });
    }

    document.getElementById('modalTailleGroup').style.display = tailles.length ? 'block' : 'none';
    if (tailles.length) renderOptions(document.getElementById('modalTailleOptions'), tailles, sT, 'taille');
    document.getElementById('modalCouleurGroup').style.display = couleurs.length ? 'block' : 'none';
    if (couleurs.length) renderOptions(document.getElementById('modalCouleurOptions'), couleurs, sC, 'couleur');

    document.getElementById('addToCartStickyBtn').onclick = (e) => addToCart(p.id, sT, sC, e.currentTarget);
    document.getElementById('directOrderStickyBtn').onclick = () => {
        if (tailles.length && !sT) return showToast('⚠️ Sélectionnez une taille');
        trackPopularity(p.id, 10);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Bonjour FLUO, je souhaite commander : ${p.name} (ID: ${p.id}), Taille: ${sT || 'N/A'}, Quantité: ${moq}`)}`, '_blank');
    };

    document.getElementById('modalRecCarousel').innerHTML = Array(6).fill(
        '<div class="rec-card"><div class="rec-card-img" style="background:var(--surface-light);"></div></div>'
    ).join('');
    
    const rec = await buildRecommendations(p);
    
    document.getElementById('modalRecCarousel').innerHTML = rec.map(r => `
        <div class="rec-card" data-product-id="${r.id}">
            <div class="rec-card-img">${r.image ? thumbImg(r.image, r.name, 300, 400) : '📦'}</div>
            <div class="rec-card-overlay">
                <div class="rec-card-name">${escapeHtml(r.name)}</div>
                <div class="rec-card-bottom">
                    <div class="rec-card-price">${formatPrice(r.price)}</div>
                    <div class="rec-card-moq">Min. ${Number(r.moq) || 1} pcs</div>
                </div>
            </div>
        </div>
    `).join('');

    document.getElementById('productModal').classList.add('open');
    document.getElementById('stickyBottomBar').classList.add('visible');
    if (!state.modalOpen) {
        history.replaceState({ modalOpen: true }, '', `?id=${p.id}`);
        state.modalOpen = true;
    }
}

export function closeProductModal() {
    pauseModalVideos();
    document.getElementById('productModal').classList.remove('open');
    document.getElementById('stickyBottomBar').classList.remove('visible');
    state.modalOpen = false;
    history.replaceState({}, '', window.location.pathname);
}
