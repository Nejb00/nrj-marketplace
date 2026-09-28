// ═══ Fiche produit — carrousel (images + vidéo + points) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { escapeHtml } from '../../utils/escape-html.js';
import { modalImg } from '../../utils/images.js';
import { modalCtx } from './modal-state.js';

export function updateCarouselDots(sc, dc, index) {
    dc.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

export function pauseModalVideos() {
    document.querySelectorAll('#modalCarouselScroll video').forEach(v => {
        try { v.pause(); } catch {}
    });
}

export function buildModalVideoSlide(videoUrl, posterUrl, alt) {
    const src = escapeHtml(videoUrl.trim());
    const poster = posterUrl ? escapeHtml(posterUrl.trim()) : '';
    const posterAttr = poster ? ` poster="${poster}"` : '';
    const label = escapeHtml(alt || 'Vidéo produit');
    return `<div class="carousel-item carousel-item--video">` +
        `<video class="modal-product-video" controls playsinline preload="metadata"${posterAttr} src="${src}" title="${label}" aria-label="${label}"></video>` +
        `</div>`;
}

export function goToImageForColor(colorIdx) {
    const { sc, dc, imageSlideOffset, imgs } = modalCtx;
    const slideIdx = imageSlideOffset + Math.min(colorIdx, Math.max(0, imgs.length - 1));
    sc.scrollTo({ left: sc.offsetWidth * slideIdx, behavior: 'smooth' });
    updateCarouselDots(sc, dc, slideIdx);
}

// Construit le carrousel complet (vidéo + images + points + bindings)
export function buildCarousel() {
    const p = modalCtx.p;
    const sc = modalCtx.sc;
    const dc = modalCtx.dc;
    const videoUrl = modalCtx.videoUrl;
    const imgs = modalCtx.imgs;

    sc.innerHTML = '';
    dc.innerHTML = '';

    let slideIndex = 0;
    modalCtx.imageSlideOffset = videoUrl ? 1 : 0;

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
            dc.innerHTML += `<span class="carousel-dot" data-index="${slideIndex}"></span>`;
            slideIndex++;
        });
        dc.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
    }

    sc.scrollLeft = 0;

    if (!sc.dataset.bound) {
        sc.addEventListener('scroll', () => {
            const idx = Math.round(sc.scrollLeft / Math.max(sc.offsetWidth, 1));
            updateCarouselDots(sc, dc, idx);
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
}
