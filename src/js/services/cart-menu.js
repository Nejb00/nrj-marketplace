// ═══ Panier — menu contextuel (partager / vider / supprimer sélection) ═══
import { clearCart, removeSelectedItems } from './cart-actions.js';
import { getSelectedItems } from './cart-storage.js';
import { shareCart } from './checkout.js';

function closeCartMenu() {
    const menu = document.getElementById('cartMenu');
    const btn = document.getElementById('cartMenuBtn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function openCartMenu() {
    const menu = document.getElementById('cartMenu');
    const btn = document.getElementById('cartMenuBtn');
    if (!menu || !btn) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');

    const removeBtn = document.getElementById('cartMenuRemoveSelected');
    if (removeBtn) {
        const hasSelected = getSelectedItems().length > 0;
        removeBtn.disabled = !hasSelected;
        removeBtn.classList.toggle('disabled', !hasSelected);
    }
}

let cartMenuInited = false;
export function initCartMenu() {
    if (cartMenuInited) return;
    const btn = document.getElementById('cartMenuBtn');
    const menu = document.getElementById('cartMenu');
    if (!btn || !menu) return;
    cartMenuInited = true;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.hidden) openCartMenu();
        else closeCartMenu();
    });

    menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-cart-action]');
        if (!item || item.disabled) return;
        const action = item.dataset.cartAction;
        if (action === 'clear') clearCart();
        else if (action === 'remove-selected') removeSelectedItems();
        else if (action === 'share') shareCart();
    });

    document.addEventListener('click', (e) => {
        if (!menu.hidden && !e.target.closest('.cart-menu-wrap')) {
            closeCartMenu();
        }
    });
}

export { closeCartMenu };
