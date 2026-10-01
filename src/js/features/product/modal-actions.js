// ═══ Fiche produit — actions (panier, commande directe, chat, partage, favori) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { WHATSAPP_NUMBER, BASE_URL } from '../../core/config.js';
import { formatPrice } from '../../utils/format.js';
import { showToast } from '../../utils/dom-helpers.js';
import { trackPopularity } from '../../api/api.js';
import { toggleFavorite } from '../../services/favorites.js';
import { addToCart } from '../../services/cart-actions.js';
import { openChat } from '../chat/chat-ui.js';
import { modalCtx } from './modal-state.js';
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
        const txt = `${formatPrice(uPrice)}\nMinimum d'achat : ${moq} pièce(s)\nDécouvre "${p.name}" sur NRJ Marketplace ${url}`;
        if (typeof navigator.share === 'function') {
            navigator.share({ title: p.name, text: txt, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        }
    };
}

function getPurchaseDockState() {
    const { tailles, couleurs, moq } = modalCtx;
    if (tailles.length && !modalCtx.sT) return { state: 'size', label: 'Choisir une taille' };
    if (couleurs.length) {
        const totalQ = Object.values(modalCtx.colorQtys).reduce((sum, q) => sum + (Number(q) || 0), 0);
        if (totalQ === 0) return { state: 'quantity', label: 'Choisir les quantités' };
        if (totalQ < moq) {
            const remaining = moq - totalQ;
            return { state: 'pending', label: `Ajouter encore ${remaining} pièce${remaining > 1 ? 's' : ''}` };
        }
    }
    return { state: 'ready', label: 'Ajouter au panier' };
}

export function updatePurchaseDock() {
    const btn = document.getElementById('addToCartStickyBtn');
    const label = document.getElementById('stickyPurchaseLabel');
    if (!btn) return;
    const purchase = getPurchaseDockState();
    btn.dataset.purchaseState = purchase.state;
    btn.setAttribute('aria-label', purchase.label);
    if (label) label.textContent = purchase.label;
}

function focusPurchaseSection(kind) {
    const id = kind === 'size' ? 'modalTailleGroup' : 'modalCouleurGroup';
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('purchase-focus');
    void target.offsetWidth;
    target.classList.add('purchase-focus');
}

function addCurrentSelectionToCart(button) {
    const p = modalCtx.p;
    const { tailles, couleurs, moq } = modalCtx;
    if (tailles.length && !modalCtx.sT) {
        focusPurchaseSection('size');
        showToast('⚠️ Sélectionnez une taille');
        return false;
    }
    if (couleurs.length) {
        const selected = Object.entries(modalCtx.colorQtys).filter(([, q]) => q > 0);
        const totalQ = selected.reduce((s, [, q]) => s + q, 0);
        if (selected.length === 0) {
            focusPurchaseSection('quantity');
            showToast('⚠️ Choisis les quantités');
            return false;
        }
        if (totalQ < moq) {
            focusPurchaseSection('quantity');
            showToast(`⚠️ Encore ${moq - totalQ} pièce${moq - totalQ > 1 ? 's' : ''} pour atteindre le minimum`);
            return false;
        }
        selected.forEach(([color, qty], i) => {
            addToCart(p.id, modalCtx.sT, color, i === 0 ? button : null, qty);
        });
    } else {
        addToCart(p.id, modalCtx.sT, '', button, modalCtx.currentQty);
    }
    return true;
}

export function bindStickyActions() {
    const { moq } = modalCtx;

    document.getElementById('addToCartStickyBtn').onclick = (e) => {
        const purchase = getPurchaseDockState();
        if (purchase.state !== 'ready') {
            const totalQ = Object.values(modalCtx.colorQtys).reduce((s, q) => s + (Number(q) || 0), 0);
            if (purchase.state === 'size') {
                focusPurchaseSection('size');
                showToast('⚠️ Sélectionnez une taille');
            } else if (purchase.state === 'quantity') {
                focusPurchaseSection('quantity');
                showToast('⚠️ Choisis les quantités');
            } else {
                focusPurchaseSection('quantity');
                const remaining = moq - totalQ;
                showToast(`⚠️ Encore ${remaining} pièce${remaining > 1 ? 's' : ''} pour atteindre le minimum`);
            }
            return;
        }
        addCurrentSelectionToCart(e.currentTarget);
    };

    updatePurchaseDock();

    document.getElementById('chatStickyBtn').onclick = () => {
        trackPopularity(p.id, 3);
        openChat({
            product: { id: p.id, name: p.name, price: p.price, image: p.image },
            taille: modalCtx.sT,
            couleur: modalCtx.sC
        });
    };
}

export function closeProductModal() {
    pauseModalVideos();
    document.getElementById('productModal').classList.remove('open');
    document.body.classList.remove('modal-open');
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
        dy = 0;
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


// Fermeture intuitive : clic sur le scrim + touche Échap.
(function setupModalDismiss() {
    const modal = document.getElementById('productModal');
    const sheet = modal?.querySelector('.modal-sheet');
    if (!modal || !sheet) return;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProductModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeProductModal();
    });
})();
