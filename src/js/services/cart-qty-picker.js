// ═══ Panier — bottom sheet de choix de quantité ═══
import { state } from '../core/state.js';
import { setCartQty } from './cart-actions.js';

let qtyPickerIndex = null;
let qtySheetPreviousFocus = null;

export function openQtyPicker(idx) {
    const it = state.cart[idx];
    if (!it) return;
    qtyPickerIndex = idx;
    qtySheetPreviousFocus = document.activeElement;
    const moq = Number(it.moq) || 1;
    const current = Number(it.quantity);

    const overlay = document.getElementById('qtySheetOverlay');
    const list = document.getElementById('qtySheetList');
    const input = document.getElementById('qtySheetInput');
    if (!overlay || !list || !input) return;

    input.min = String(moq);
    input.value = String(current);
    input.placeholder = `Min. ${moq}`;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('role', 'dialog');

    const maxOpt = Math.max(current + 15, moq + 24);
    let html = `<button type="button" class="qty-option qty-option-remove" data-qty="0">0 (Supprimer)</button>`;
    for (let q = moq; q <= maxOpt; q++) {
        const active = q === current ? ' is-active' : '';
        html += `<button type="button" class="qty-option${active}" data-qty="${q}">${q}${active ? ' <span class="qty-check">✓</span>' : ''}</button>`;
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-qty]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const q = parseInt(btn.dataset.qty, 10);
            closeQtyPicker();
            await setCartQty(idx, q);
        });
    });

    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    setTimeout(() => input.focus(), 180);
}

export function closeQtyPicker() {
    const overlay = document.getElementById('qtySheetOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    setTimeout(() => { overlay.hidden = true; }, 220);
    qtyPickerIndex = null;
    const restore = qtySheetPreviousFocus;
    qtySheetPreviousFocus = null;
    if (restore && document.contains(restore) && typeof restore.focus === 'function') {
        requestAnimationFrame(() => restore.focus({ preventScroll: true }));
    }
}

let qtySheetInited = false;
export function initQtySheet() {
    if (qtySheetInited) return;
    const overlay = document.getElementById('qtySheetOverlay');
    const closeBtn = document.getElementById('qtySheetClose');
    const applyBtn = document.getElementById('qtySheetApply');
    const input = document.getElementById('qtySheetInput');
    if (!overlay) return;
    qtySheetInited = true;

    closeBtn?.addEventListener('click', closeQtyPicker);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeQtyPicker();
    });
    applyBtn?.addEventListener('click', async () => {
        if (qtyPickerIndex == null) return;
        const idx = qtyPickerIndex;
        const val = parseInt(input?.value, 10);
        closeQtyPicker();
        await setCartQty(idx, val);
    });
    input?.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || qtyPickerIndex == null) return;
        const idx = qtyPickerIndex;
        const val = parseInt(input.value, 10);
        closeQtyPicker();
        await setCartQty(idx, val);
    });

    document.addEventListener('keydown', (e) => {
        if (overlay.hidden) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeQtyPicker();
            return;
        }
        if (e.key !== 'Tab') return;

        const focusables = [
            ...overlay.querySelectorAll('button:not([disabled]), input:not([disabled])')
        ];
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}
