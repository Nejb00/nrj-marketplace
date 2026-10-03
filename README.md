# NRJ Marketplace

**🇬🇧 English** | [🇫🇷 Français](README.fr.md)

Modern e-commerce marketplace built with **Vite** + **Supabase**.

- Public catalogue + admin panel
- Cart & favorites (localStorage)
- Order via WhatsApp
- Search (text + voice + visual)
- Built-in chat (customer ↔ seller + AI fallback)
- Light / dark themes
- **Liquid Glass UI** (iOS 26: aurora, glass nav, bottom sheets)
- **Installable PWA** iOS/Android (offline mode)
- Google Drive / Notion synchronization

**Live:** https://nrj-marketplace.vercel.app

---

## Stack

- **Frontend:** Vite 5, vanilla HTML/CSS/JS (ES modules)
- **Backend:** Supabase (Auth + Database + Edge Functions)
- **Deployment:** Vercel
- **PWA:** Service Worker + Web Manifest

---

## Project structure

> 📐 **Thin modules** architecture (2026-09 refactor): one responsibility =
> one file. `main.js` is a minimal entry point — its import order reproduces
> the historical execution order (side-effects).

```
├── index.html              → Public catalogue
├── admin.html              → Admin panel (login + product management + chat)
├── vite.config.js
├── vercel.json
├── package.json
│
├── public/
│   ├── icon-*.png / icon.svg / apple-touch-icon*.png
│   ├── screenshot-narrow.png / screenshot-wide.png   → install visuals
│   ├── manifest.webmanifest
│   ├── sw.js                 → Service Worker (SHELL + runtime + precache)
│   └── placeholder.svg
│
├── src/
│   ├── css/
│   │   ├── main.css            → imports everything (order = cascade)
│   │   ├── base/base.css
│   │   ├── layout/navigation.css
│   │   ├── components/         → glass, search-bar, search-view, filters,
│   │   │                         product-card, product-modal, cart-admin,
│   │   │                         chat, placeholder, skeleton, admin
│   │   └── themes/             → light-theme-patch (ALWAYS last)
│   │
│   └── js/
│       ├── core/               → config.js (constants + Supabase client),
│       │                         state.js (global state)
│       ├── api/api.js          → Supabase REST calls + caches
│       │
│       ├── services/           → db.js, sync.js, lazy-loading.js,
│       │                         reco.js, visual-search.js (lazy TF.js),
│       │                         cart×8 (storage / actions / qty-picker /
│       │                         menu / panel / badge / checkout / favorites),
│       │                         search×4 (history / rotation / voice /
│       │                         dropdown)
│       │
│       ├── utils/              → escape-html, format, dom-helpers,
│       │                         badges, category-icon, fuzzy-search,
│       │                         images (wsrv.nl proxy + watchdog)
│       │
│       ├── features/
│       │   ├── catalogue/      → ×8: sort/filters, card, grid,
│       │   │                     pagination, subcategory bubbles,
│       │   │                     category view, popular products, init
│       │   ├── chat/           → ×10: state (shared chatCtx), anonymous
│       │   │                     session, realtime, typing, AI, bubbles,
│       │   │                     display, history, send, UI
│       │   │                     + admin-chat.js
│       │   ├── product/        → ×10: detail page (modalCtx state,
│       │   │                     carousel, options, total, actions,
│       │   │                     recommendations, render) + editing
│       │   │                     (dropdowns, form, save)
│       │   ├── admin/          → ×5: auth, add form, delete,
│       │   │                     category-dropdowns, list + stats
│       │   ├── search/         → search-view.js (results page)
│       │   └── app/            → ×13: theme, smart-header, header-actions,
│       │                         offline, logo-press, account-view,
│       │                         swipe-nav, quick-filters, search-bar,
│       │                         click-delegation, filter-bar, app-init
│       │
│       ├── main.js             → public entry (25 lines, orchestration)
│       └── admin-main.js       → admin entry (separate from public bundle)
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
        └── chat-ai/            → AI Edge Function for the chat
```

---

## Local setup

```bash
npm install
npm run dev          # http://localhost:5173
```

### Available scripts

| Command           | Description                              |
|-------------------|------------------------------------------|
| `npm run dev`     | Development server (hot-reload)          |
| `npm run build`   | Production build → `dist/`               |
| `npm run preview` | Preview the build locally                |
| `npm run sync`    | Run the Google Drive synchronization     |

---

## Build & deployment

```bash
npm run build
```

The project is configured for **Vercel** (`base: '/'`).

- Push to `main` → automatic deployment
- Both `index.html` and `admin.html` are included in the build
- `admin-main.js` is a **separate entry**: no admin code leaks into the public bundle

---

## Key features

- Catalogue with filters, categories, subcategories and infinite pagination
- Text search + voice search + **visual search** (TensorFlow.js loaded on demand)
- Persistent cart + favorites (localStorage)
- Orders sent directly to WhatsApp
- Customer account (order history, favorites…)
- Admin mode (add / edit / delete products + stats)
- **Chat** customer ↔ admin + AI assistance (Supabase Edge Function)
- Light / dark theme
- **Liquid Glass UI**: aurora background, floating glass nav bar, iOS bottom sheets
- **Installable PWA** (iOS via Safari "Add to Home Screen", Android via Chrome)
  + offline mode (Service Worker + image precache)
- Product synchronization to Google Drive and Notion

---

## Technical notes

- Supabase client imported via npm (`@supabase/supabase-js`), REST calls with
  native `fetch` (zero extra dependencies)
- Vendor code-splitting (`supabase` chunk)
- Automatic precache of hashed assets via a Vite plugin + Service Worker
- Long-press on the logo → admin access
- Images served through the `wsrv.nl` proxy (WebP, a third of the size) with a
  fallback watchdog — postimg.cc excluded from the proxy (blocked by policy)
- **Architecture rules** (from the refactor):
  - never call a function at module level inside a cyclic graph
    (TDZ risk) — auto-inits live in the entry points
  - CSS imports resolve **relative to the file** that contains them
  - shared state across modules goes through explicit ctx objects
    (`chatCtx`, `modalCtx`)
