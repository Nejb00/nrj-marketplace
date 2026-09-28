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
    document.getElementById('modalMoq').textContent = `Minimum d'achat : ${modalCtx.moq} pièce(s)`;
    document.getElementById('modalTotal').textContent = `Total minimum : ${formatPrice(modalCtx.uPrice * modalCtx.moq)}`;
    document.getElementById('modalDesc').textContent = p.description || '';
    document.getElementById('modalProductIdBadge').textContent = `[ID: ${p.id}]`;
    document.getElementById('modalBadges').innerHTML = generateBadgesHTML(p, true);

    bindHeaderActions(p, modalCtx.uPrice, modalCtx.moq);

    buildCarousel();

    renderTailleOptions();
    renderCouleurOptions();

    updateTotal();

    bindStickyActions();

    await renderRecommendations(p);

    document.getElementById('productModal').classList.add('open');
    document.getElementById('stickyBottomBar').classList.add('visible');
    if (!state.modalOpen) {
        history.replaceState({ modalOpen: true }, '', `?id=${p.id}`);
        state.modalOpen = true;
    }
}
