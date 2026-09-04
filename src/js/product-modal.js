import { state } from './state.js';
import { trackViewedItem } from './state.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, showToast, thumbImg, modalImg } from './utils.js';
import { addToCart, toggleFavorite } from './cart.js';
import { trackPopularity } from './api.js';

let currentProduct = null;
let sT = '';
let sC = '';
let currentQty = 1;
let imageSlideOffset = 0;

export function openProductModal(p) {
    if (!p) return;
    currentProduct = p;
    trackViewedItem(p);
    trackPopularity(p.id, 1);

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

    // Images
    const allImgs = [];
    if (p.image) allImgs.push(p.image);
    if (p.image2) allImgs.push(p.image2);
    if (p.image3) allImgs.push(p.image3);
    if (p.image4) allImgs.push(p.image4);
    if (p.image5) allImgs.push(p.image5);
    if (!allImgs.length && p.images) {
        const arr = Array.isArray(p.images) ? p.images : String(p.images).split(',').map(s => s.trim()).filter(Boolean);
        allImgs.push(...arr);
    }

    // Video offset for carousel
    imageSlideOffset = p.video ? 1 : 0;

    // Carousel
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

    // Sizes
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
        // auto-select first
        const first = tailleOpts.querySelector('.option-btn');
        if (first) { first.classList.add('selected'); sT = first.dataset.val; }
    } else if (tailleGroup) {
        tailleGroup.style.display = 'none';
    }

    // Colors + swatches linked to images
    const couleurs = (p.couleurs || p.colors || '').split(',').map(s => s.trim()).filter(Boolean);
    const couleurGroup = document.getElementById('modalCouleurGroup');
    const couleurOpts = document.getElementById('modalCouleurOptions');
    const couleurLabel = document.getElementById('modalCouleurLabel');
    sC = '';

    function goToImageForColor(idx) {
        const slideIdx = imageSlideOffset + Math.min(idx, Math.max(0, allImgs.length - 1));
        if (track) track.style.transform = `translateX(-${slideIdx * 100}%)`;
        if (dots) {
            dots.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === slideIdx));
        }
    }

    function renderColorSwatches(ct) {
        if (!ct) return;
        ct.innerHTML = couleurs.map((c, i) => {
            const imgSrc = allImgs[i] || allImgs[0] || '';
            const thumb = imgSrc ? thumbImg(imgSrc, c, 48, 48) : '';
            return `<button type="button" class="color-swatch" data-val="${escapeHtml(c)}" data-idx="${i}" title="${escapeHtml(c)}">
                ${thumb ? `<span class="swatch-img">${thumb}</span>` : `<span class="swatch-fallback">${escapeHtml(c.charAt(0).toUpperCase())}</span>`}
                <span class="swatch-name">${escapeHtml(c)}</span>
            </button>`;
        }).join('');

        ct.querySelectorAll('.color-swatch').forEach(btn => {
            btn.onclick = () => {
                ct.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                sC = btn.dataset.val;
                const idx = Number(btn.dataset.idx);
                goToImageForColor(idx);
                if (couleurLabel) couleurLabel.textContent = `Couleur (${couleurs.length}) : ${sC}`;
            };
        });

        // auto-select first
        const first = ct.querySelector('.color-swatch');
        if (first) {
            first.classList.add('selected');
            sC = first.dataset.val;
            goToImageForColor(0);
            if (couleurLabel) couleurLabel.textContent = `Couleur (${couleurs.length}) : ${sC}`;
        }
    }

    if (couleurs.length && couleurGroup && couleurOpts) {
        couleurGroup.style.display = '';
        if (couleurLabel) couleurLabel.textContent = `Couleur (${couleurs.length})`;
        renderColorSwatches(couleurOpts);
    } else if (couleurGroup) {
        couleurGroup.style.display = 'none';
    }

    // Qty stepper
    currentQty = moq;
    const qtyValueEl = document.getElementById('modalQtyValue');
    const qtyMinus = document.getElementById('modalQtyMinus');
    const qtyPlus = document.getElementById('modalQtyPlus');

    function updateTotal() {
        const uPrice = Number(p.price) || 0;
        if (totalEl) totalEl.textContent = `Total : ${formatPrice(uPrice * currentQty)}`;
        if (qtyMinus) qtyMinus.disabled = currentQty <= moq;
        if (qtyValueEl) qtyValueEl.textContent = String(currentQty);
    }

    if (qtyValueEl) qtyValueEl.textContent = String(currentQty);
    if (qtyMinus) {
        qtyMinus.onclick = () => {
            if (currentQty <= moq) return;
            currentQty = Math.max(moq, currentQty - 1);
            updateTotal();
        };
    }
    if (qtyPlus) {
        qtyPlus.onclick = () => {
            currentQty += 1;
            updateTotal();
        };
    }
    updateTotal();

    // Fav
    const favBtn = document.getElementById('modalFavBtn');
    if (favBtn) {
        favBtn.classList.toggle('active', state.favorites.includes(p.id));
        favBtn.onclick = () => toggleFavorite(p.id, favBtn);
    }

    // Share
    const shareBtn = document.getElementById('modalShareBtn');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            const url = `${BASE_URL}?id=${p.id}`;
            if (navigator.share) {
                try { await navigator.share({ title: p.name, url }); } catch (_) {}
            } else {
                await navigator.clipboard.writeText(url);
                showToast('Lien copié');
            }
        };
    }

    // Add to cart
    const addBtn = document.getElementById('addToCartStickyBtn');
    if (addBtn) {
        addBtn.onclick = (e) => addToCart(p.id, sT, sC, e.currentTarget, currentQty);
    }

    // Direct WhatsApp
    const orderBtn = document.getElementById('directOrderBtn');
    if (orderBtn) {
        orderBtn.onclick = () => {
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Bonjour FLUO, je souhaite commander : ${p.name} (ID: ${p.id}), Taille: ${sT || 'N/A'}, Couleur: ${sC || 'N/A'}, Quantité: ${currentQty}`)}`, '_blank');
        };
    }

    // Close
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.onclick = closeProductModal;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    currentProduct = null;
}
