import { state } from '../core/state.js';

let snapshot = null;

function cloneCart(cart) {
    try {
        return structuredClone(cart);
    } catch {
        return JSON.parse(JSON.stringify(cart));
    }
}

export function beginDirectPurchase(item) {
    if (!item || item.productId == null) {
        throw new Error('direct_purchase_item_invalid');
    }

    snapshot = cloneCart(state.cart);

    state.cart.forEach((entry) => {
        entry.selected = false;
    });

    state.cart.push({
        productId: item.productId,
        quantity: Number(item.quantity) || 1,
        taille: item.taille || '',
        couleur: item.couleur || '',
        moq: Number(item.moq) || 1,
        selected: true,
        ...(item.variantId ? { variantId: String(item.variantId) } : {}),
        ...(Number(item.unitPrice) > 0 ? { unitPrice: Number(item.unitPrice) } : {})
    });

    return true;
}

export function cancelDirectPurchase() {
    if (!snapshot) return false;
    state.cart = snapshot;
    snapshot = null;
    return true;
}

export function finishDirectPurchase() {
    snapshot = null;
}

export function isDirectPurchaseActive() {
    return Boolean(snapshot);
}
