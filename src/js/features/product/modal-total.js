// ═══ Fiche produit — total dynamique (quantités × prix unitaire) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { formatPrice } from '../../utils/format.js';
import { modalCtx } from './modal-state.js';

export function getTotalColorQty() {
    return Object.values(modalCtx.colorQtys).reduce((s, q) => s + (Number(q) || 0), 0);
}

export function updateTotal() {
    let totalQty = 0;
    if (modalCtx.couleurs.length) {
        totalQty = getTotalColorQty();
    } else {
        totalQty = modalCtx.currentQty;
    }
    const totalEl = document.getElementById('modalTotal');
    if (totalEl) {
        if (totalQty > 0) {
            totalEl.textContent = `Total : ${formatPrice(modalCtx.uPrice * totalQty)} (${totalQty} pc${totalQty > 1 ? 's' : ''})`;
        } else {
            totalEl.textContent = `Total minimum : ${formatPrice(modalCtx.uPrice * modalCtx.moq)}`;
        }
    }
}
