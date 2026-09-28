// ═══ Fiche produit — état partagé de la modale ═══
// Éclaté de product-modal.js (refacto-archi). Les anciennes variables de
// closure d'openProductModal vivent dans modalCtx, importé par tous les
// modules de la fiche. Side-effects DOM historiques conservés ici
// (aucun import → évalué en premier dans le graphe, zéro risque de TDZ).
export const productDetailsCache = new Map();

export const modalCtx = {
    p: null,
    tailles: [],
    couleurs: [],
    sT: '',
    sC: '',
    moq: 1,
    uPrice: 0,
    colorQtys: {},
    currentQty: 1,
    imageSlideOffset: 0,
    imgs: [],
    videoUrl: '',
    sc: null, // #modalCarouselScroll
    dc: null, // #modalCarouselDots
};

// Sourcing placé avant les recommandations (structure historique)
const _modal = document.getElementById('productModal');
const _rec = _modal ? _modal.querySelector('.recommendations') : null;
const _src = _modal ? _modal.querySelector('.sourcing-section') : null;
if (_modal && _rec && _src) _rec.parentNode.insertBefore(_src, _rec);

// Icônes SVG des boutons retour / partage
const _backBtn = document.getElementById('modalCloseBtn');
if (_backBtn) _backBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const _shareBtn = document.getElementById('modalShareBtn');
if (_shareBtn) _shareBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
