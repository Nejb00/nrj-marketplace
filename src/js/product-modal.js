import { state } from './state.js';
import { trackViewedItem } from './state.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, showToast, thumbImg, modalImg, thumb } from './utils.js';
import { trackPopularity, fetchProductDetails, trackView, getRelatedProducts } from './api.js';
import { toggleFavorite, addToCart } from './cart.js';
import { signalView } from './reco.js';
import { openChat } from './chat.js';

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
    const label =
 escapeHtml(alt || 'Vidéo produit');
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

    const tailles = (p.tailles || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
    const imgs = [p.image, p.image2, p.image3, p.image4, p.image5, p.image6].filter(u => u && u.trim());
    const moq = Number(p.moq) || 1;
    const uPrice = Number(p.price) || 0;

    let selectedColor = couleurs[0] || '';
    let selectedSize = tailles[0] || '';
    let currentQty = moq;

    const sc = document.getElementById('modalCarouselScroll');
    const dc = document.getElementById('modalCarouselDots');
    if (sc && dc) {
        sc.innerHTML = '';
        dc.innerHTML = '';
        imgs.forEach((u, i) => {
            sc.innerHTML += `<div class="carousel-item">${modalImg(u, p.name)}</div>`;
            dc.innerHTML += `<span class="carousel-dot" data-index="${i}"></span>`;
        });
        sc.scrollLeft = 0;
        updateCarouselDots(sc, dc, 0);
    }

    document.getElementById('modalPrice').textContent = formatPrice(uPrice);
    document.getElementById('modalMoq').textContent = `Minimum d'achat : ${moq} pièce(s)`;
    document.getElementById('modalTotal').textContent = `Total : ${formatPrice(uPrice * currentQty)} (${currentQty} pc${currentQty > 1 ? 's' : ''})`;
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
        const txt = `${formatPrice(uPrice)}
Minimum d'achat : ${moq} pièce(s)
Découvre "${p.name}" sur FLUO ${url}`;
        if (typeof navigator.share === 'function') {
            navigator.share({ title: p.name, text: txt, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        }
    };

    const videoUrl = (p.video_url || '').trim();
    if (videoUrl) {
        const poster = imgs[0] || p.image || '';
        sc.innerHTML += buildModalVideoSlide(videoUrl, poster, p.name);
        dc.innerHTML += '<span class="carousel-dot active" data-index="0"></span>';
    }

    function goToImageForColor(colorIdx) {
        const slideIdx = Math.min(colorIdx, Math.max(0, imgs.length - 1));
        sc.scrollTo({ left: sc.offsetWidth * slideIdx, behavior: 'smooth' });
        updateCarouselDots(sc, dc, slideIdx);
    }

    function updateTotal() {
        const totalEl = document.getElementById('modalTotal');
        if (totalEl) {
            const totalPrice = uPrice * currentQty;
            totalEl.textContent = `Total : ${formatPrice(totalPrice)} (${currentQty} pc${currentQty > 1 ? 's' : ''})`;
        }
    }

    // NOUVELLE SECTION : Options Temu
    const productOptionsTemu = document.getElementById('productOptionsTemu');
    const colorGroupTemu = document.getElementById('colorGroupTemu');
    const sizeGroupTemu = document.getElementById('sizeGroupTemu');
    const colorThumbnailsTemu = document.getElementById('colorThumbnailsTemu');
    const sizeButtonsTemu = document.getElementById('sizeButtonsTemu');
    const selectedColorNameTemu = document.getElementById('selectedColorNameTemu');
    const sizeErrorTemu = document.getElementById('sizeErrorTemu');
    const qtyValueTemu = document.getElementById('qtyValueTemu');
    const qtyMinusTemu = document.getElementById('qtyMinusTemu');
    const qtyPlusTemu = document.getElementById('qtyPlusTemu');
    const selectOptionBtnTemu = document.getElementById('selectOptionBtnTemu');

    if ((couleurs.length || tailles.length) && productOptionsTemu) {
        productOptionsTemu.style.display = 'flex';
    }

    if (couleurs.length && colorGroupTemu) {
        colorGroupTemu.style.display = 'flex';
        if (selectedColorNameTemu) selectedColorNameTemu.textContent = selectedColor;
        if (colorThumbnailsTemu) {
            colorThumbnailsTemu.innerHTML = couleurs.map((c, i) => {
                const imgSrc = imgs[i] || imgs[0] || '';
                const thumbHtml = imgSrc ? thumbImg(imgSrc, c, 44, 44) : '';
                return `<div class="option-thumbnail-temu ${c === selectedColor ? 'selected' : ''}" data-color="${escapeHtml(c)}" data-idx="${i}"><div class="color-thumbnail-img-temu">${thumbHtml ? thumbHtml : '<span class="swatch-fallback">' + escapeHtml(c.charAt(0).toUpperCase()) + '</span>'}</div></div>`;
            }).join('');

            colorThumbnailsTemu.querySelectorAll('.option-thumbnail-temu').forEach(thumb => {
                thumb.onclick = () => {
                    colorThumbnailsTemu.querySelectorAll('.option-thumbnail-temu').forEach(el => el.classList.remove('selected'));
                    thumb.classList.add('selected');
                    selectedColor = thumb.dataset.color;
                    const idx = Number(thumb.dataset.idx);
                    goToImageForColor(idx);
                    if (selectedColorNameTemu) selectedColorNameTemu.textContent = selectedColor;
                    checkSelectionComplete();
                };
            });
        }
    }

    if (tailles.length && sizeGroupTemu) {
        sizeGroupTemu.style.display = 'flex';
        if (sizeButtonsTemu) {
            sizeButtonsTemu.innerHTML = tailles.map(t => `<button class="option-btn-temu ${t === selectedSize ? 'selected' : ''}" data-size="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
            sizeButtonsTemu.querySelectorAll('.option-btn-temu').forEach(btn => {
                btn.onclick = () => {
                    sizeButtonsTemu.querySelectorAll('.option-btn-temu').forEach(el => el.classList.remove('selected'));
                    btn.classList.add('selected');
                    selectedSize = btn.dataset.size;
                    if (sizeErrorTemu) sizeErrorTemu.style.display = 'none';
                    checkSelectionComplete();
                };
            });
        }
    }

    if (qtyValueTemu && qtyMinusTemu && qtyPlusTemu) {
        qtyValueTemu.textContent = String(currentQty);
        qtyMinusTemu.onclick = () => {
            currentQty = Math.max(moq, currentQty - 1);
            qtyValueTemu.textContent = String(currentQty);
            updateTotal();
        };
        qtyPlusTemu.onclick = () => {
            currentQty += 1;
            qtyValueTemu.textContent = String(currentQty);
            updateTotal();
        };
    }

    function checkSelectionComplete() {
        if (!selectOptionBtnTemu) return;
        const hasColor = couleurs.length ? selectedColor : true;
        const hasSize = tailles.length ? selectedSize : true;
        selectOptionBtnTemu.disabled = !(hasColor && hasSize);
        if (!hasSize && sizeErrorTemu) sizeErrorTemu.style.display = 'block';
        else if (sizeErrorTemu) sizeErrorTemu.style.display = 'none';
    }

    if (selectOptionBtnTemu) {
        selectOptionBtnTemu.onclick = () => {
            if (tailles.length && !selectedSize) return showToast('⚠️ Veuillez sélectionner une taille');
            if (couleurs.length && !selectedColor) return showToast('⚠️ Veuillez sélectionner une couleur');
            addToCart(p.id, selectedSize, selectedColor, selectOptionBtnTemu, currentQty);
            showToast('✅ Ajouté au panier !');
        };
    }

    document.getElementById('directOrderStickyBtn').onclick = () => {
        if (tailles.length && !selectedSize) return showToast('⚠️ Veuillez sélectionner une taille');
        if (couleurs.length && !selectedColor) return showToast('⚠️ Veuillez sélectionner une couleur');
        let msg = `Bonjour FLUO, je souhaite commander :
${p.name} (ID: ${p.id})`;
        if (selectedSize) msg += `
Taille: ${selectedSize}`;
        if (selectedColor) msg += `
Couleur: ${selectedColor}`;
        msg += `
Quantité: ${currentQty}`;
        trackPopularity(p.id, 10);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    checkSelectionComplete();
    updateTotal();

    document.getElementById('productModal').classList.add('open');
    document.getElementById('stickyBottomBar').classList.add('visible');
    if (!state.modalOpen) {
        history.replaceState({ modalOpen: true }, '', `?id=${p.id}`);
        state.modalOpen = true;
    }
}

// POPUP FUNCTIONS
function closeOptionsPopup() {
    const overlay = document.getElementById('optionsPopupOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function openOptionsPopup() {
    const overlay = document.getElementById('optionsPopupOverlay');
    const preview = document.getElementById('popupColorPreview');
    const colorThumbnails = document.getElementById('popupColorThumbnails');
    const sizeButtons = document.getElementById('popupSizeButtons');
    const popupQtyValue = document.getElementById('popupQtyValue');

    if (!overlay) return;

    if (preview && imgs.length) {
        preview.innerHTML = imgs.slice(0, 4).map((img, i) => `<img src="${escapeHtml(img)}" alt="Couleur ${i+1}" onerror="this.style.display='none'">`).join('');
    }

    if (colorThumbnails && couleurs.length) {
        colorThumbnails.innerHTML = couleurs.map((c, i) => {
            const imgSrc = imgs[i] || imgs[0] || '';
            const thumbHtml = imgSrc ? thumbImg(imgSrc, c, 50, 50) : '';
            return `<div class="popup-thumbnail ${c === selectedColor ? 'selected' : ''}" data-color="${escapeHtml(c)}" data-idx="${i}">${thumbHtml ? thumbHtml : '<span class="swatch-fallback">' + escapeHtml(c.charAt(0).toUpperCase()) + '</span>'}</div>`;
        }).join('');
        colorThumbnails.querySelectorAll('.popup-thumbnail').forEach(thumb => {
            thumb.onclick = () => {
                colorThumbnails.querySelectorAll('.popup-thumbnail').forEach(el => el.classList.remove('selected'));
                thumb.classList.add('selected');
                selectedColor = thumb.dataset.color;
                const idx = Number(thumb.dataset.idx);
                goToImageForColor(idx);
            };
        });
    }

    if (sizeButtons && tailles.length) {
        document.getElementById('popupSizeSection').style.display = 'block';
        sizeButtons.innerHTML = tailles.map(t => `<button class="popup-size-btn ${t === selectedSize ? 'selected' : ''}" data-size="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
        sizeButtons.querySelectorAll('.popup-size-btn').forEach(btn => {
            btn.onclick = () => {
                sizeButtons.querySelectorAll('.popup-size-btn').forEach(el => el.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSize = btn.dataset.size;
            };
        });
    }

    if (popupQtyValue) {
        popupQtyValue.textContent = String(currentQty);
    }

    document.getElementById('popupQtyMinus').onclick = () => {
        currentQty = Math.max(moq, currentQty - 1);
        if (popupQtyValue) popupQtyValue.textContent = String(currentQty);
    };
    document.getElementById('popupQtyPlus').onclick = () => {
        currentQty += 1;
        if (popupQtyValue) popupQtyValue.textContent = String(currentQty);
    };

    document.getElementById('confirmPopupBtn').onclick = closeOptionsPopup;
    document.getElementById('popupCloseBtn').onclick = closeOptionsPopup;

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    overlay.onclick = (e) => {
        if (e.target === overlay) closeOptionsPopup();
    };
}

// Bind popup to button
const selectOptionBtn = document.getElementById('selectOptionBtnTemu');
if (selectOptionBtn) {
    selectOptionBtn.onclick = openOptionsPopup;
}
export function closeProductModal() {
    pauseModalVideos();
    document.getElementById('productModal').classList.remove('open');
    document.getElementById('stickyBottomBar').classList.remove('visible');
    state.modalOpen = false;
    history.replaceState({}, '', window.location.pathname);
}
