// ═══ NRJ Marketplace — point d'entrée public (index.html) ═══
// Refacto-archi : main.js n'est plus un fourre-tout, il orchestre.
// L'ORDRE des imports side-effects reproduit l'ordre historique
// d'exécution de l'ancien main.js (chips → barre recherche → délégation
// → init), et app-init.js porte le boot final (initCartMenu/initQtySheet/init).
import '../css/main.css';

// Modules à side-effects (dans l'ordre historique de l'ancien main.js) :
import './features/app/quick-filters.js';        // chips filtres rapides
import './features/app/search-bar-bindings.js';  // barre de recherche + clic extérieur
import './features/app/click-delegation.js';     // délégation clics + nav + boutons
import './features/app/app-init.js';             // init() + boot panier
