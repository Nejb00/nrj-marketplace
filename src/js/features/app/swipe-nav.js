// 🌟 App — navigation par swipe entre les catégories
// Éclaté de main.js (refacto-archi) — logique strictement identique.
export function initSwipeCategories() {
    let touchStartX = 0;
    let touchStartY = 0;
    let skipSwipe = false;
    const minSwipeDistance = 60;
    const blockedSelector = [
        '.filter-bar',
        '.quick-filters',
        '.subcategory-bubbles',
        '.carousel-scroll',
        '.rec-carousel',
        '.modal-overlay',
        '.search-bar',
        '.search-dropdown',
        '.main-nav',
        'input',
        'textarea',
        'select',
        '[data-no-catalog-swipe]'
    ].join(',');

    function isHorizontallyScrollable(el) {
        let node = el instanceof Element ? el : el?.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node instanceof HTMLElement) {
                const style = window.getComputedStyle(node);
                const overflowX = style.overflowX;
                if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 2) {
                    return true;
                }
            }
            node = node.parentElement;
        }
        return false;
    }

    document.addEventListener('touchstart', e => {
        const target = e.target;
        skipSwipe = !!(target.closest && (target.closest(blockedSelector) || isHorizontallyScrollable(target)));
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (skipSwipe) {
            skipSwipe = false;
            return;
        }
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        handleSwipe(touchEndX, touchEndY);
    }, { passive: true });

    function handleSwipe(touchEndX, touchEndY) {
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        if (Math.abs(diffX) < minSwipeDistance) return;
        if (Math.abs(diffY) > Math.abs(diffX)) return;

        const buttons = Array.from(document.querySelectorAll('.filter-btn'));
        if (buttons.length === 0) return;

        const activeIndex = buttons.findIndex(btn => btn.classList.contains('active'));
        if (activeIndex === -1) return;

        let nextIndex = activeIndex;

        if (diffX > 0) {
            nextIndex = (activeIndex + 1) % buttons.length;
        } else {
            nextIndex = (activeIndex - 1 + buttons.length) % buttons.length;
        }

        buttons[nextIndex].click();
        buttons[nextIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}
