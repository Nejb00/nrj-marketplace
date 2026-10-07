// ═══ Utils — helpers DOM (debounce, toast) ═══
// Éclaté de utils.js (refacto-archi).
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function showToast(m) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1200);
}


let cartToastTimer = null;

export function hideCartAddedToast() {
    const toast = document.getElementById('cartAddedToast');
    if (!toast) return;
    window.clearTimeout(cartToastTimer);
    toast.classList.remove('show');
    window.setTimeout(() => { toast.hidden = true; }, 220);
}

export function showCartAddedToast() {
    const toast = document.getElementById('cartAddedToast');
    if (!toast) return;

    window.clearTimeout(cartToastTimer);
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));

    cartToastTimer = window.setTimeout(() => hideCartAddedToast(), 3000);
}

function bindCartAddedToast() {
    const toast = document.getElementById('cartAddedToast');
    if (!toast || toast.dataset.bound === 'true') return;
    toast.dataset.bound = 'true';

    document.getElementById('cartAddedToastClose')?.addEventListener('click', hideCartAddedToast);
    document.getElementById('cartAddedToastCart')?.addEventListener('click', () => {
        hideCartAddedToast();
        document.getElementById('modalCloseBtn')?.click();
        window.setTimeout(() => {
            document.querySelector('a[data-nav="cart"]')?.click();
        }, 0);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCartAddedToast, { once: true });
} else {
    bindCartAddedToast();
}
