// ═══ Fiche produit — actions (panier, commande directe, chat, partage, favori) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { BASE_URL } from '../../core/config.js';
import { formatPrice } from '../../utils/format.js';
import { showToast } from '../../utils/dom-helpers.js';
import { trackPopularity } from '../../api/api.js';
import { toggleFavorite } from '../../services/favorites.js';
import { addToCart } from '../../services/cart-actions.js';
import { openChat } from '../chat/chat-ui.js';
import { modalCtx } from './modal-state.js';
import { closeOptionsPanel, initOptionsPanel } from './modal-options-sheet.js';
import { pauseModalVideos } from './modal-carousel.js';

export function bindHeaderActions(p, uPrice, moq) {
    // Favori ❤️
    const modalFavBtn = document.getElementById('modalFavBtn');
    if (modalFavBtn) {
        const favSvg = modalFavBtn.querySelector('.fav-icon-svg');
        if (favSvg) favSvg.classList.toggle('faved', state.favorites.includes(p.id));
        modalFavBtn.onclick = () => toggleFavorite(p.id);
    }

    // Partage 🔗
    document.getElementById('modalShareBtn').onclick = () => {
        const url = BASE_URL + '?id=' + p.id;
        const currentPrice = Number(modalCtx.uPrice) || Number(uPrice) || 0;
        const currentMoq = Number(modalCtx.moq) || Number(moq) || 1;
        const txt = `${formatPrice(currentPrice)}\nMinimum d'achat : ${currentMoq} pièce(s)\nDécouvre "${p.name}" sur NRJ Marketplace ${url}`;
        if (typeof navigator.share === 'function') {
            navigator.share({ title: p.name, text: txt, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        }
    };
}

export function bindStickyActions() {
    const p = modalCtx.p;

    // Phase 1 : le CTA principal ouvre le bottom sheet.
    initOptionsPanel();

    const chatBtn = document.getElementById('chatStickyBtn');
    if (chatBtn) {
        chatBtn.onclick = () => {
            if (!p) return;
            trackPopularity(p.id, 3);
            openChat({
                product: { id: p.id, name: p.name, price: modalCtx.uPrice, image: p.image },
                taille: modalCtx.sT,
                couleur: modalCtx.sC
            });
        };
    }
}
export function closeProductModal() {
    closeOptionsPanel();
    pauseModalVideos();
    document.getElementById('productModal').classList.remove('open');
    document.getElementById('productModal').setAttribute('aria-hidden', 'true');
    document.getElementById('stickyBottomBar').classList.remove('visible');
    state.modalOpen = false;
    history.replaceState({}, '', window.location.pathname);
}

/* ═══ iOS sheet : glisser la poignée vers le bas pour fermer ═════════════
   Amélioration progressive : sans tactile (desktop), le bouton retour reste. */
(function setupSheetDrag() {
    const modal = document.getElementById('productModal');
    const sheet = modal ? modal.querySelector('.modal-sheet') : null;
    const handle = document.getElementById('sheetHandle');
    if (!modal || !sheet || !handle) return;

    let startY = 0, dy = 0, dragging = false;
    sheet.style.transition = '';

    handle.addEventListener('touchstart', (e) => {
        dragging = true;
        startY = e.touches[0].clientY;
        sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        dy = e.touches[0].clientY - startY;
        const eased = dy <= 60 ? dy : 60 + (dy - 60) * 0.55;
        sheet.style.transform = `translateY(${eased}px)`;
    }, { passive: true });

    handle.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        sheet.style.transition = '';
        if (dy > 110) {
            sheet.style.transform = '';    // glisse vers le bas (transition CSS)
            closeProductModal();
        } else {
            sheet.style.transform = '';    // rebond retour position
        }
    }, { passive: true });

    // Sécurité : si la modale se ferme autrement, réinitialiser la feuille
    const mo = new MutationObserver(() => {
        if (!modal.classList.contains('open')) sheet.style.transform = '';
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
})();
