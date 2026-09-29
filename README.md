# NRJ Marketplace

Marketplace e-commerce moderne construite avec **Vite** + **Supabase**.

- Catalogue public + panneau admin
- Panier & favoris (localStorage)
- Commande via WhatsApp
- Recherche (texte + vocale + visuelle)
- Chat intégré (client ↔ vendeur + IA de secours)
- Thèmes clair / sombre
- **UI Liquid Glass** (iOS 26 : aurora, nav verre, bottom sheets)
- **PWA installable iOS/Android** (mode hors-ligne)
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

> 📐 Architecture en **modules fins** (refacto 2026-09) : une responsabilité
> = un fichier. `main.js` est un point d'entrée minimal — l'ordre de ses
> imports reproduit l'ordre historique d'exécution (side-effects).

```
├── index.html              → Catalogue public
├── admin.html              → Panneau admin (login + gestion produits + chat)
├── vite.config.js
├── vercel.json
├── package.json
│
├── public/
│   ├── icon-*.png / icon.svg / apple-touch-icon*.png
│   ├── screenshot-narrow.png / screenshot-wide.png   → visuels d'install
│   ├── manifest.webmanifest
│   ├── sw.js                 → Service Worker (SHELL + runtime + precache)
│   └── placeholder.svg
│
├── src/
│   ├── css/
│   │   ├── main.css            → importe tout (l'ordre = la cascade)
│   │   ├── base/base.css
│   │   ├── layout/navigation.css
│   │   ├── components/         → glass, search-bar, search-view, filters,
│   │   │                         product-card, product-modal, cart-admin,
│   │   │                         chat, placeholder, skeleton, admin
│   │   └── themes/             → light-theme-patch (TOUJOURS en dernier)
│   │
│   └── js/
│       ├── core/               → config.js (constantes + client Supabase),
│       │                         state.js (état global)
│       ├── api/api.js          → appels REST Supabase + caches
│       │
│       ├── services/           → db.js, sync.js, lazy-loading.js,
│       │                         reco.js, visual-search.js (TF.js lazy),
│       │                         cart×8 (storage / actions / qty-picker /
│       │                         menu / panel / badge / checkout / favorites),
│       │                         search×4 (history / rotation / voice /
│       │                         dropdown)
│       │
│       ├── utils/              → escape-html, format, dom-helpers,
│       │                         badges, category-icon, fuzzy-search,
│       │                         images (proxy wsrv.nl + watchdog)
│       │
│       ├── features/
│       │   ├── catalogue/      → ×8 : tri/filtres, carte, grille,
│       │   │                     pagination, bulles sous-cats, vue
│       │   │                     catégories, produits populaires, init
│       │   ├── chat/           → ×10 : state (chatCtx partagé), session
│       │   │                     anonyme, temps réel, typing, IA, bulles,
│       │   │                     affichage, historique, envoi, UI
│       │   │                     + admin-chat.js
│       │   ├── product/        → ×10 : fiche (state modalCtx, carrousel,
│       │   │                     options, total, actions, recommandations,
│       │   │                     render) + édition (dropdowns, form, save)
│       │   ├── admin/          → ×5 : auth, form ajout, delete,
│       │   │                     category-dropdowns, liste + stats
│       │   ├── search/         → search-view.js (page résultats)
│       │   └── app/            → ×13 : thème, smart-header, header-actions,
│       │                         offline, logo-press, account-view,
│       │                         swipe-nav, quick-filters, search-bar,
│       │                         click-delegation, filter-bar, app-init
│       │
│       ├── main.js             → entry public (25 lignes, orchestration)
│       └── admin-main.js       → entry admin (séparé du bundle public)
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
- `admin-main.js` est un **entry séparé** : aucune trace admin dans le bundle public

---

## Fonctionnalités principales

- Catalogue avec filtres, catégories, sous-catégories et pagination infinie
- Recherche texte + vocale + **recherche visuelle** (TensorFlow.js chargé à la demande)
- Panier + favoris persistants (localStorage)
- Commande envoyée directement sur WhatsApp
- Compte client (historique commandes, favoris…)
- Mode admin (ajout / modification / suppression produits + stats)
- **Chat** client ↔ admin + assistance IA (Supabase Edge Function)
- Thème clair / sombre
- **UI Liquid Glass** : fond aurora, nav flottante en verre, bottom sheets iOS
- **PWA installable** (iOS via Safari « Sur l'écran d'accueil », Android via Chrome)
  + mode hors-ligne (Service Worker + precache images)
- Synchronisation produits vers Google Drive et Notion

---

## Notes techniques

- Client Supabase importé via npm (`@supabase/supabase-js`), appels REST en `fetch` natif (zéro dépendance)
- Code-splitting des vendors (chunk `supabase`)
- Precache automatique des assets hashés via plugin Vite + Service Worker
- Long-press sur le logo → accès admin
- Images servies via proxy `wsrv.nl` (WebP, tiers de taille) avec watchdog
  de secours — postimg.cc exclu du proxy (bloqué par politique)
- **Règles d'architecture** (issues de la refacto) :
  - jamais d'appel de fonction au niveau module dans un graphe cyclique
    (risque TDZ) — les auto-inits vivent dans les entry points
  - les imports CSS résolvent **relativement au fichier** qui les contient
  - état partagé inter-modules via ctx explicites (`chatCtx`, `modalCtx`)
