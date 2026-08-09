/**
 * Lazy Loading System - Charge les images à la demande
 */

/**
 * Initialise l'Intersection Observer pour le lazy loading
 */
export function initLazyLoading() {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.dataset.src;
                
                if (src) {
                    img.src = src;
                    img.removeAttribute('data-src');
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '50px' // Charger 50px avant que l'image soit visible
    });

    return imageObserver;
}

/**
 * Observe une image pour le lazy loading
 */
export function observeImage(imageElement, observer) {
    if (imageElement && observer) {
        observer.observe(imageElement);
    }
}

/**
 * Crée une image avec placeholder
 */
export function createLazyImage(src, alt, width, height, className = '') {
    const img = document.createElement('img');
    img.dataset.src = src;
    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"%3E%3Crect fill="%23f0f0f0" width="' + width + '" height="' + height + '"/%3E%3C/svg%3E';
    img.alt = alt;
    img.width = width;
    img.height = height;
    img.className = `lazy-image ${className}`;
    img.loading = 'lazy';
    
    return img;
}

/**
 * Crée un skeleton loader
 */
export function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'product-card skeleton-card';
    skeleton.innerHTML = `
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton-info">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text skeleton-short"></div>
        </div>
    `;
    return skeleton;
}

/**
 * Affiche les skeletons en attendant le chargement
 */
export function showSkeletonLoaders(gridId, count = 12) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        grid.appendChild(createSkeletonCard());
    }
}
