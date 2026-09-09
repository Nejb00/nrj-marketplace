# NRJ Marketplace

Marketplace e-commerce moderne construite avec **Vite** + **Supabase**.

- Catalogue public + panneau admin
- Panier & favoris (localStorage)
- Commande via WhatsApp
- Recherche (texte + vocale + visuelle)
- Chat intégré
- Thèmes clair / sombre
- PWA (Service Worker + installation)
- Synchronisation Google Drive / Notion

**Live :** https://nrj-marketplace.vercel.app

---

## Stack

- **Frontend** : Vite 5, HTML/CSS/JS vanilla (modules ES)
- **Backend** : Supabase (Auth + Database + Edge Functions)
- **Déploiement** : Vercel
- **PWA** : Service Worker + Web Manifest

---

## Structure du projet

```
├── index.html              → Catalogue public
├── admin.html              → Panneau admin (login + gestion produits + chat)
├── vite.config.js
├── vercel.json
├── package.json
│
├── public/
│   ├── icon-*.png / icon.svg
│   ├── manifest.webmanifest
│   ├── sw.js                 → Service Worker
│   └── placeholder.svg
│
├── src/
│   ├── css/
│   │   ├── base.css
│   │   ├── main.css            → importe tous les styles du catalogue
│   │   ├── admin.css
│   │   ├── search-bar.css
│   │   ├── filters.css
│   │   ├── product-card.css
│   │   ├── product-modal.css
│   │   ├── navigation.css
│   │   ├── cart-admin.css
│   │   ├── search-view.css
│   │   ├── skeleton.css
│   │   ├── chat.css
│   │   ├── light-theme-patch.css
│   │   ├── fluo-theme.css
│   │   └── placeholder.css
│   │
│   └── js/
│       ├── config.js           → constantes + client Supabase
│       ├── state.js            → état global (produits, panier, favoris…)
│       ├── utils.js            → helpers (format, recherche floue, escape…)
│       ├── api.js              → appels Supabase
│       ├── db.js               → couche données locale
│       ├── cart.js             → panier, favoris, badges, commande WhatsApp
│       ├── catalogue.js        → grille produits, pagination, catégories
│       ├── search.js           → dropdown recherche + recherche vocale
│       ├── search-view.js      → page de recherche dédiée
│       ├── product-modal.js    → modale détail produit
│       ├── product-edit.js     → édition rapide (crayon)
│       ├── visual-search.js    → recherche par image
│       ├── reco.js             → recommandations
│       ├── lazy-loading.js
│       ├── sync.js             → synchronisation auto
│       ├── chat.js             → chat client
│       ├── admin-chat.js       → chat côté admin
│       ├── admin.js            → logique admin
│       ├── main.js             → point d’entrée catalogue
│       └── admin-main.js       → point d’entrée admin
│
├── api/
│   └── og-product.js           → Open Graph images (Vercel serverless)
│
├── scripts/
│   ├── drive-sync.mjs
│   ├── sync_to_gdrive.py
│   └── sync_to_notion.py
│
└── supabase/
    └── functions/
        └── chat-ai/            → Edge Function IA pour le chat
```

---

## Démarrage local

```bash
npm install
npm run dev          # http://localhost:5173
```

### Scripts disponibles

| Commande          | Description                              |
|-------------------|------------------------------------------|
| `npm run dev`     | Serveur de développement (hot-reload)    |
| `npm run build`   | Build de production → `dist/`            |
| `npm run preview` | Prévisualiser le build localement        |
| `npm run sync`    | Lancer la synchronisation Google Drive   |

---

## Build & Déploiement

```bash
npm run build
```

Le projet est configuré pour **Vercel** (`base: '/'`).

- Push sur `main` → déploiement automatique
- Les fichiers `index.html` et `admin.html` sont tous les deux inclus dans le build

---

## Fonctionnalités principales

- Catalogue avec filtres, catégories, sous-catégories et pagination infinie
- Recherche texte + vocale + **recherche visuelle**
- Panier + favoris persistants (localStorage)
- Commande envoyée directement sur WhatsApp
- Compte client (historique commandes, favoris…)
- Mode admin (ajout / modification / suppression produits)
- **Chat** client ↔ admin + assistance IA (Supabase Edge Function)
- Thème clair / sombre
- PWA installable + mode hors-ligne (Service Worker)
- Synchronisation produits vers Google Drive et Notion

---

## Notes techniques

- Client Supabase importé via npm (`@supabase/supabase-js`)
- Code-splitting des vendors (chunk `supabase`)
- Precache automatique des assets hashés via plugin Vite + Service Worker
- Long-press sur le logo → accès admin
