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
    const stickyEl = document.getElementById('stickyTotalValue');
    const amount = modalCtx.uPrice * (totalQty > 0 ? totalQty : modalCtx.moq);
    if (totalEl) {
        if (modalCtx.couleurs.length && totalQty > 0 && totalQty < modalCtx.moq) {
            const remaining = modalCtx.moq - totalQty;
            totalEl.textContent = `Encore ${remaining} pièce${remaining > 1 ? 's' : ''} · ${formatPrice(amount)}`;
        } else if (totalQty > 0) {
            totalEl.textContent = `Total : ${formatPrice(amount)} (${totalQty} pc${totalQty > 1 ? 's' : ''})`;
        } else {
            totalEl.textContent = `Total minimum : ${formatPrice(amount)}`;
        }
    }
    if (stickyEl) {
        stickyEl.textContent = formatPrice(amount);
        const stickyWrap = stickyEl.closest('.sticky-total');
        if (stickyWrap) {
            stickyWrap.classList.remove('bump');
            void stickyWrap.offsetWidth;
            stickyWrap.classList.add('bump');
        }
    }
    if (totalEl) {
        totalEl.classList.toggle('purchase-ready', totalQty >= modalCtx.moq && totalQty > 0);
        totalEl.classList.toggle('purchase-pending', modalCtx.couleurs.length > 0 && totalQty > 0 && totalQty < modalCtx.moq);
    }
}
