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
        if (!p) return sum;
        const unitPrice = Number(it.unitPrice) || Number(p.price) || 0;
        return sum + unitPrice * Number(it.quantity);
    }, 0);
}
