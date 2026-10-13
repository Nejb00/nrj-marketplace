# AGENTS.md — NRJ Marketplace

## What this is
Vite + vanilla JS (ES modules) frontend for an e-commerce marketplace. No backend
in this repo — it talks to a **hosted Supabase** instance (Auth + DB + Edge
Functions). The Supabase URL and anon key are hardcoded in
`src/js/core/config.js`, so **no external credentials are needed to boot**.

## Running it
- `docker compose -f docker-compose.base44.yml up -d` — starts Vite dev server
  (node:22-slim, source bind-mounted) on host port 3000.
- Dependencies install automatically on container startup (`npm install`).
- Vite 8 with live reload; edits hot-apply without a rebuild.

## Two entry points
- `index.html` → public catalogue (entry: `src/js/main.js`)
- `admin.html` → admin panel (entry: `src/js/admin-main.js`)

## External integrations (not needed for local dev)
- Supabase (hardcoded URL/key in config.js)
- WhatsApp ordering (hardcoded number in config.js)
- Google Drive / Notion sync (scripts/, needs separate credentials)
- OpenPay payments (Supabase Edge Functions, disabled by default)
- Chat AI (Supabase Edge Function)

## Tests
`npm test` runs the Node test runner against `test/*.test.js`. Many tests are
audit/governance scripts that don't need a running app.
