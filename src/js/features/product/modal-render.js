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
import { updateTotal } from './modal-total.js';
import { initOptionsPanel } from './modal-options-sheet.js';
import { bindHeaderActions, bindStickyActions } from './modal-actions.js';
import { renderRecommendations } from './modal-recommendations.js';
import {
    getProductGalleryForSelection,
    getVariantCommercials,
    getVariantOptionValues,
    getActiveProductVariants,
    resolveProductVariant,
} from '../../services/product-variants-media.js';

export { closeProductModal } from './modal-actions.js';

export async function openProductModal(pid, initialSelection = null) {
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
    const optionValues = getVariantOptionValues(p);
    modalCtx.variants = getActiveProductVariants(p);
    modalCtx.tailles = optionValues.sizes;
    modalCtx.couleurs = optionValues.colors;
    // Chaque fiche repart sans ancienne sélection. La Phase 4 peut ensuite
    // pré-sélectionner une variante uniquement si son score est explicitement disponible.
    const activeVariants = getActiveProductVariants(p);
    const requestedVariant = initialSelection?.variantId
        ? activeVariants.find((variant) => String(variant.id) === String(initialSelection.variantId))
        : null;
    const initialColor = String(
        initialSelection?.couleur || initialSelection?.color || requestedVariant?.color || ''
    ).trim();
    const initialSize = String(
        initialSelection?.taille || initialSelection?.size || requestedVariant?.size || ''
    ).trim();

    modalCtx.sT = initialSize;
    modalCtx.sC = initialColor;
    const initialVariant = requestedVariant || resolveProductVariant(p, initialColor, initialSize);
    modalCtx.sVariantId = initialVariant?.id || null;
    const commercial = getVariantCommercials(p, initialColor, initialSize);
    modalCtx.moq = commercial.moq;
    modalCtx.uPrice = commercial.price;
    modalCtx.colorQtys = {};
    modalCtx.currentQty = 1;
    modalCtx.stickyAddedQty = 0;
    modalCtx.stickyAddedVariant = null;
    modalCtx.imageSlideOffset = 0;
    modalCtx.videoUrl = (p.video_url || '').trim();
    modalCtx.imgs = getProductGalleryForSelection(p, modalCtx.sC, modalCtx.sT).map(media => media.url);
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

    updateTotal();

    initOptionsPanel();
    bindStickyActions();

    await renderRecommendations(p);

    document.getElementById('productModal').classList.add('open');
    document.getElementById('productModal').setAttribute('aria-hidden', 'false');
    document.getElementById('stickyBottomBar').classList.add('visible');
    if (!state.modalOpen) {
        history.replaceState({ modalOpen: true }, '', `?id=${p.id}`);
        state.modalOpen = true;
    }
}
