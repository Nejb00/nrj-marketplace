// ═══ Panier — badges de compteur (nav + header) ═══
import { state } from '../core/state.js';

export function updateNavCartBadge() {
    const cnt = state.cart.reduce((s, i) => s + Number(i.quantity), 0);
    const b = document.getElementById('navCartBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
    const hb = document.getElementById('headerCartBadge');
    if (hb) { hb.textContent = cnt > 99 ? '99+' : cnt; hb.style.display = cnt > 0 ? 'flex' : 'none'; }
}
