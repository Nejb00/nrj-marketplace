# NRJ Marketplace — projet Vite

## Structure

```
index.html          → catalogue (public)
admin.html           → panneau admin (login + gestion produits)
src/css/
  base.css            → variables, reset, header, toast, footer
  search-bar.css        → barre de recherche + dropdown
  filters.css          → filtres rapides + barre catégories
  product-card.css       → grille et cartes produit
  product-modal.css       → modale produit détaillée + carousel
  navigation.css         → nav du bas + vue catégories
  cart-admin.css         → panier, modales génériques, panneau admin
  search-view.css        → page de recherche dédiée avec filtres
  main.css            → importe tout ce qui précède (utilisé par index.html)
  admin.css            → base.css + cart-admin.css (utilisé par admin.html)
src/js/
  config.js            → constantes + client Supabase
  state.js             → state partagé (produits, panier, favoris...)
  utils.js             → fonctions pures (format, recherche floue, escape...)
  api.js              → tous les appels Supabase
  cart.js             → panier, favoris, badges nav, commande WhatsApp
  catalogue.js          → grille produits, pagination infinie, catégories
  search.js            → dropdown recherche header, vocal, historique
  search-view.js         → page de recherche dédiée (filtres, tri)
  product-modal.js        → modale produit (vue détail)
  product-edit.js         → modale modif rapide (crayon sur la carte)
  admin.js             → login, ajout/suppression produit (admin.html)
  main.js             → point d'entrée index.html
  admin-main.js          → point d'entrée admin.html
```

## Démarrage

```bash
npm install
npm run dev       # serveur local avec hot-reload
```

## Build pour production

```bash
npm run build      # génère dist/ avec index.html + admin.html + assets optimisés
npm run preview     # pour vérifier le build localement avant de déployer
```

## Déploiement sur GitHub Pages

Le `base: '/nrj-marketplace/'` dans `vite.config.js` suppose que le repo s'appelle
`nrj-marketplace` et est servi via `https://<user>.github.io/nrj-marketplace/`.
Si jamais ça change, adapte cette ligne.

Deux options :
1. **Manuel** : `npm run build` puis push le contenu de `dist/` sur la branche `gh-pages`.
2. **Automatique** : ajoute un workflow GitHub Actions qui build et déploie `dist/`
   à chaque push sur `main` (dis-moi si tu veux que je le monte, je peux le générer).

## Ce qui a changé par rapport à l'ancienne version monofichier

- Le doublon "modal admin" / "page admin dédiée" a été supprimé : il n'y a plus
  qu'un seul formulaire d'ajout produit, dans `admin.html`.
- La modale de modification rapide (crayon sur la carte produit) reste dans
  `index.html` puisqu'elle est déclenchée depuis le catalogue.
- Le client Supabase est maintenant importé via npm (`@supabase/supabase-js`)
  au lieu du `<script>` CDN — plus besoin de `window.supabase`.
- Toute la logique JS qui touchait au `localStorage` (panier, favoris,
  historique de recherche) est inchangée dans son comportement.
