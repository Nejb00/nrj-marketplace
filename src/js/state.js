// Source de vérité unique du site. Les modules importent cet objet
// et mutent ses propriétés directement (pas de réassignation de `state` lui-même).

export const state = {
    products: [],
    cart: JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]'),
    favorites: JSON.parse(localStorage.getItem('nrj_favorites') || '[]'),
    currentFilter: 'all',
    currentQuickFilter: 'all',
    searchQuery: '',
    currentProductId: null,
    modalOpen: false,
    displayedCount: 0,
    currentFilteredProducts: [],
    observer: null,
    scrollObserver: null,
    isAdminLoggedIn: false,
    rotationList: ["Rechercher un produit...", "Tendances de Chine 🇨🇳", "Arrivages de Turquie 🇹🇷", "Sélection France 🇫🇷", "Grossiste direct..."],
    currentPlaceholderIndex: 0,
    isVoiceListening: false,
    searchViewState: {
        query: '',
        filters: {
            priceMin: null,
            priceMax: null,
            categories: [],
            sizes: [],
            colors: []
        },
        sortBy: 'relevance',
        viewMode: 'grid'
    }
};

export function saveCart() {
    localStorage.setItem('nrj_cart_v32', JSON.stringify(state.cart));
}

export function saveFavorites() {
    localStorage.setItem('nrj_favorites', JSON.stringify(state.favorites));
}

export function trackViewedItem(name) {
    if (!name) return;
    const formattedName = name.length > 22 ? name.substring(0, 22) + "..." : name;
    state.rotationList = state.rotationList.filter(item => item !== formattedName);
    state.rotationList.unshift(formattedName);
    if (state.rotationList.length > 8) state.rotationList.pop();
}
