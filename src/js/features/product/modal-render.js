// ═══ Fiche produit — orchestrateur d'ouverture ═══
// Éclaté de product-modal.js (refacto-archi). openProductModal remplit
// modalCtx puis délègue aux modules carousel/options/actions/recommendations.
// Les importateurs historiques importent openProductModal/closeProductModal ici.
import { state, trackViewedItem } from '../../core/state.js';
import { formatPrice } from '../../utils/format.js';
import { generateBadgesHTML } from '../../utils/badges.js';
import { trackPopularity, fetchProductDetails, trackView } from '../../api/api.js';
import { signalView } from '../../services/reco.js';
import { productDetailsCache, modalCtx } from './modal-state.js';
import { buildCarousel } from './modal-carousel.js';
import { renderTailleOptions, renderCouleurOptions } from './modal-options.js';
import { updateTotal } from './modal-total.js';
import { bindHeaderActions, bindStickyActions } from './modal-actions.js';
import { renderRecommendations } from './modal-recommendations.js';

export { closeProductModal } from './modal-actions.js';

export async function openProductModal(pid) {
    const openToken = ++modalCtx.openToken;
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
    if (openToken !== modalCtx.openToken) return;

    // ── Remplissage du contexte partagé (anciennes closures) ──
    modalCtx.p = p;
    modalCtx.tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
    modalCtx.couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
    modalCtx.sT = modalCtx.tailles.length ? modalCtx.tailles[0] : '';
    modalCtx.sC = modalCtx.couleurs.length ? modalCtx.couleurs[0] : '';
    modalCtx.moq = Number(p.moq) || 1;
    modalCtx.uPrice = Number(p.price) || 0;
    modalCtx.colorQtys = {};
    modalCtx.currentQty = modalCtx.moq;
    modalCtx.imageSlideOffset = 0;
    modalCtx.videoUrl = (p.video_url || '').trim();
    modalCtx.imgs = [p.image, p.image2, p.image3, p.image4, p.image5, p.image6].filter(u => u && u.trim());
    modalCtx.sc = document.getElementById('modalCarouselScroll');
    modalCtx.dc = document.getElementById('modalCarouselDots');

    // ── En-tête (prix, MOQ, description, badges) ──
    document.getElementById('modalPrice').textContent = formatPrice(modalCtx.uPrice);
    const nameEl = document.getElementById('modalProductName');
    if (nameEl) nameEl.textContent = p.name || 'Produit NRJ';
    const descToggle = document.getElementById('modalDescToggle');
    const descWrap = descToggle ? descToggle.closest('.product-detail-desc-wrap') : null;
    if (descToggle && descWrap) {
        descToggle.setAttribute('aria-expanded', 'false');
        descWrap.classList.remove('expanded');
        descToggle.onclick = () => {
            const expanded = descToggle.getAttribute('aria-expanded') === 'true';
            descToggle.setAttribute('aria-expanded', String(!expanded));
            descWrap.classList.toggle('expanded', !expanded);
        };
    }
    document.getElementById('modalMoq').textContent = `Minimum d'achat : ${modalCtx.moq} pièce(s)`;
    document.getElementById('modalTotal').textContent = `Total minimum : ${formatPrice(modalCtx.uPrice * modalCtx.moq)}`;
    document.getElementById('modalDesc').textContent = p.description || '';
    document.getElementById('modalProductIdBadge').textContent = `[ID: ${p.id}]`;
    document.getElementById('modalBadges').innerHTML = generateBadgesHTML(p, true);

    bindHeaderActions(p, modalCtx.uPrice, modalCtx.moq);

    buildCarousel();

    renderTailleOptions();
    renderCouleurOptions();

    const qtyGroup = document.getElementById('modalQuantityGroup');
    const qtyValue = document.getElementById('modalQtyValue');
    const qtyHint = document.getElementById('modalQtyHint');
    const qtyMinus = document.getElementById('modalQtyMinus');
    const qtyPlus = document.getElementById('modalQtyPlus');
    const syncQty = () => {
        if (qtyValue) qtyValue.textContent = String(modalCtx.currentQty);
        if (qtyHint) qtyHint.textContent = `Minimum ${modalCtx.moq} pièce${modalCtx.moq > 1 ? 's' : ''}`;
        if (qtyMinus) qtyMinus.disabled = modalCtx.currentQty <= modalCtx.moq;
        updateTotal();
    };
    if (qtyGroup) qtyGroup.style.display = modalCtx.couleurs.length ? 'none' : 'flex';
    if (qtyMinus) qtyMinus.onclick = () => {
        modalCtx.currentQty = Math.max(modalCtx.moq, modalCtx.currentQty - 1);
        syncQty();
    };
    if (qtyPlus) qtyPlus.onclick = () => {
        modalCtx.currentQty += 1;
        syncQty();
    };
    syncQty();

    updateTotal();

    bindStickyActions();

    await renderRecommendations(p);

    document.getElementById('productModal').classList.add('open');
    document.body.classList.add('modal-open');
    document.getElementById('stickyBottomBar').classList.add('visible');
    if (!state.modalOpen) {
        history.replaceState({ modalOpen: true }, '', `?id=${p.id}`);
        state.modalOpen = true;
    }
}
