# NRJ-INF-003 — Smart Media Uploader Cloudinary dans l’admin

- **Mission Alias:** NRJ-INF-003
- **Notion generated ID:** NRJ-29
- **Notion record:** https://app.notion.com/p/41c0f09830e181d8b12bc086a2b78ed5
- **Status:** Blocked — code branch ready; live activation awaits verified Cloudinary preset
- **Priority:** P1
- **Track:** Infrastructure
- **Owner / session:** ChatGPT + Desktop Commander — exécution Native
- **Last verified:** 2026-11-18
- **Branch:** https://github.com/Nejb00/nrj-marketplace/tree/feat/nrj-smart-media-uploader
- **Base ref / base SHA:** main / c35e887cb878e5e55c0d46a250b4d4b801ab482b
- **Latest implementation commit:** 24091efcbc37de1e716cc26676c1bda7b69e4c9c
- **PR:** none — not created
- **External systems:** GitHub, Supabase (local function code only), Cloudinary (read-only audit), Notion

## Objective and acceptance criteria

Allow an NRJ admin to select up to six local product photos, preview/remove/reorder them by selection order, and upload them directly to Cloudinary when creating a catalogue product. Signed URLs fill the existing `image` through `image6` fields; manual URL inputs remain supported.

- JPEG, PNG and WEBP only; the admin picker rejects files above 9,500,000 bytes client-side. Cloudinary currently reports a 10 MiB account-level image upload ceiling.
- Server-issued signatures; no Cloudinary API secret or service-role key in browser code.
- Uploads start only after clicking the product-create button.
- Partial upload failure or failed product insertion triggers cleanup of the signed batch.
- A post-insert refresh/render failure must never delete files already referenced by a saved product.
- Existing URL-only creation remains supported.
- Product Import OS, variant gallery and database schema remain untouched.

## Source of truth

- **Design:** https://github.com/Nejb00/nrj-marketplace/blob/feat/nrj-smart-media-uploader/docs/superpowers/specs/2026-11-18-nrj-smart-media-uploader-design.md
- **Implementation plan:** https://github.com/Nejb00/nrj-marketplace/blob/feat/nrj-smart-media-uploader/docs/superpowers/plans/2026-11-18-nrj-smart-media-uploader.md
- **Cloudinary infrastructure companion:** LAB-CLOUDINARY-001 — https://app.notion.com/p/4130f09830e181a7a024faf7df473658
- **Project:** NRJ Marketplace International — https://app.notion.com/p/4100f09830e181c78cfec18e40583728

## Implementation completed

| Area | Implementation |
|---|---|
| Signing | `sign-product-media-uploads` issues one signed manifest for 1–6 server-generated product public IDs. Requires a non-anonymous authenticated admin JWT and the server-only `CLOUDINARY_PRODUCT_UPLOAD_PRESET`. |
| Cleanup | `cleanup-product-media-uploads` validates 1–6 unique UUID/slot IDs under `nrj-marketplace/products/` and signs server-side `image/destroy` requests. |
| Admin picker | Multi-file input, previews, individual removal, order labels, validation, progress/status messages and object URL cleanup. |
| Direct upload | Browser posts file bytes to Cloudinary Upload API using short-lived server signatures; it never proxies image bytes through Supabase. |
| Product form | First N URL slots replaced in selection order; remaining manual URLs are preserved. URL-only flow remains intact. Insert failures attempt cleanup; post-insert refresh errors do not remove linked media. |

## Verification results

| Check | Result |
|---|---|
| Focused media tests | **PASS — 31/31** across sign, cleanup, uploader UI, product-form and existing Product Import OS media contract. |
| Full repository suite | **293/296 passed.** Three known baseline failures persist: 2 `automation-dashboard-routing` assertions and 1 `drive-sync-optimization` assertion, all due to Windows CRLF-sensitive regex tests. The same 3 failures were reproduced on clean `main` before feature implementation. |
| `npm run check:syntax` | **PASS — 215 JavaScript files.** |
| `npm run build` | **PASS — Vite transformed 143 modules.** Existing warning: `modal-render.js` is both dynamically and statically imported. |
| `git diff --check` | PASS after final documentation whitespace cleanup. |
| Frontend secret scan | No `CLOUDINARY_API_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` matches in `src/js` or `admin.html`. |

## Current blocker — do not activate yet

The actual Cloudinary upload preset has **not** been verified or configured. Before enabling real uploads it must be confirmed as signed (`unsigned=false`) with `allowed_formats` restricted to JPEG/PNG/WEBP. Cloudinary does not support a per-preset file-size limit: the admin interface enforces 9,500,000 bytes client-side, while the connected account currently reports a 10 MiB (10,485,760-byte) account-level image ceiling. The four required Cloudinary secrets (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_PRODUCT_UPLOAD_PRESET`) are not present in the NRJ Supabase project. The signing Edge Function fails closed if its required secrets are absent. Configure server-only secrets only after the preset is verified.

## Safety and approval boundaries

- Work is isolated on `feat/nrj-smart-media-uploader`; `main` remains unchanged.
- The original clone's pre-existing uncommitted changes were preserved in the original worktree.
- No database migration/schema or product data changes.
- No Product Import OS implementation, variant gallery, or existing `upload-product-import-media` function changes.
- No Cloudinary account/preset changes; no Supabase production secret changes; no Edge Function deployment.
- No preview deployment, pull request, merge or production deployment was initiated.
- No preview URL exists. A preview is a separate action requiring approval.

## Final handoff

Implementation tasks 1–3 are complete. Local code verification is complete. Mission status remains **Blocked for live activation** until the existing/created Cloudinary preset is inspected and verified against the required restrictions. Full repository tests retain the three baseline CRLF failures listed above; those are outside this branch's scope.

**Next action:** inspect/create a signed Cloudinary product preset (`unsigned=false`, JPEG/PNG/WEBP only) using the Cloudinary Console or Admin API; do not set a per-preset size limit because Cloudinary does not support one. Then configure the four Cloudinary secrets in Supabase Edge Functions and separately approve deployment of the two new functions before enabling the browser uploader.

## Status history

| Date | Status | Evidence |
|---|---|---|
| 2026-11-18 | Planned → In Progress | User approved Native execution on a dedicated feature branch. |
| 2026-11-18 | In Progress → Blocked | Code and local verification complete; actual Cloudinary preset restrictions and production activation remain unverified/unapproved. |

## Additional finding — shared Cloudinary credentials (read-only, 18 November 2026)

- The production Supabase project `peojyqliwrtghomyukwn` has an active `upload-product-import-media` Edge Function, version 2, with `verify_jwt = true`.
- Its deployed source reads `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; when any is missing, its configuration guard returns HTTP 500 with `cloudinary_config_missing`.
- A read-only `supabase secrets list` for that same project showed none of those three names. Therefore, a new request reaching this guard will fail before it can upload media. This points to a shared Cloudinary configuration issue affecting the existing Product Import media endpoint as well as the prerequisites for the new uploader.
- The new uploader additionally requires `CLOUDINARY_PRODUCT_UPLOAD_PRESET`, also absent.
- No Product Import OS code or deployed function was changed. Do not add/rotate secrets or deploy functions without separate approval and trusted Cloudinary credentials.
