// ═══ Panier — stockage & sélection (accès purs à l'état) ═══
import { state } from '../core/state.js';

export function loadOrders() {
    if (!Array.isArray(state.orders)) state.orders = [];
}

export function getSelectedItems() {
    return state.cart.filter(i => i.selected !== false);
}

export function getSelectedTotal() {
    return getSelectedItems().reduce((sum, it) => {
        const p = state.products.find(pr => pr.id === it.productId);
        return p ? sum + p.price * Number(it.quantity) : sum;
    }, 0);
}
