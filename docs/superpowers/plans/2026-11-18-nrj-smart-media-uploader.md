# NRJ Smart Media Uploader Implementation Plan

> **Execution method:** Native / inline execution approved by the user on 2026-11-18. Use superpowers:executing-plans and test-driven-development task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let NRJ administrators select up to six product images and have NRJ upload them to Cloudinary and save the returned URLs automatically when the product is created.

**Architecture:** Supabase Edge Functions validate the admin and generate short-lived Cloudinary signatures; the browser uploads file bytes directly to Cloudinary and passes the returned secure URLs into the existing product insert flow. A separate admin-only cleanup function removes newly uploaded assets if a partial upload or product insert fails.

**Tech Stack:** Vite, vanilla JavaScript ES modules, Supabase JS v2, Supabase Edge Functions (Deno/TypeScript), Cloudinary Upload API, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-nrj-smart-media-uploader-design.md`

## Global Constraints

- Do not modify or merge into `main`; work only on a dedicated feature branch.
- Do not change production Supabase functions or Cloudinary settings until the implementation is reviewed and separately approved.
- Keep `CLOUDINARY_API_SECRET` only in Supabase Edge Function secrets; never return it to the browser.
- Keep `verify_jwt = true` for both new Edge Functions and require the existing admin role claim.
- Maximum six images per product; accepted MIME types are `image/jpeg`, `image/png`, and `image/webp`.
- Maximum file size is 9,500,000 bytes per image.
- Uploads start on product submit, not on file selection.
- New files map in selection order to `image`, `image2`, … `image6`; existing URL inputs remain available as a fallback.
- Do not modify the existing `upload-product-import-media` function or Product Import OS.
- No new npm dependency is required.
- Use unique Cloudinary public IDs below `nrj-marketplace/products/<batch-id>/` and set `overwrite=false`.
- A signed Cloudinary preset named by the server-only `CLOUDINARY_PRODUCT_UPLOAD_PRESET` must restrict formats to JPEG/PNG/WEBP and `max_file_size` to 9,500,000 bytes. Verify its actual settings before enabling uploads.

## Review Focus

- A non-admin or expired-session request must not receive a usable signature; cover in Task 1.
- A malicious client must not choose an arbitrary folder/public ID or request more than six signatures; cover in Task 1.
- Invalid MIME types, oversized files, and more than six selected images must be rejected before any upload; cover in Task 2.
- A failure after one or more successful uploads must trigger cleanup and must not insert a product; cover in Tasks 2–3.
- If the product insert fails after successful uploads, uploaded assets must be cleaned up; if cleanup itself fails, preserve and report the original error plus cleanup warning; cover in Task 3.

---

### Task 1: Secure Cloudinary signing and cleanup endpoints

**Files:**
- Create: `supabase/functions/sign-product-media-uploads/index.ts`
- Create: `supabase/functions/cleanup-product-media-uploads/index.ts`
- Modify: `supabase/config.toml`
- Test: `test/product-media-signature.test.js`
- Test: `test/product-media-cleanup.test.js`

**Interfaces:**
- Sign request: `POST { count: number }`, where `count` is an integer from 1 to 6.
- Sign response: `{ ok: true, cloud_name: string, api_key: string, batch_id: string, upload_preset: string, uploads: Array<{ slot: number, timestamp: number, public_id: string, overwrite: "false", signature: string }> }`.
- Cleanup request: `POST { public_ids: string[] }`, with 1–6 unique IDs whose prefix is exactly `nrj-marketplace/products/`.
- Both functions require a valid Supabase user JWT and an admin role in verified user metadata. They read Cloudinary credentials from function environment variables.
- Signature parameters are exactly `overwrite`, `public_id`, `timestamp`, and `upload_preset`; serialize names alphabetically and append the API secret before SHA-1 hashing, following Cloudinary's signature rules.
- Cleanup signs Cloudinary `image/destroy` requests on the server and returns per-public-ID cleanup outcomes without returning credentials.

- [x] **Step 1: Write failing signing contract tests**
  - Assert the endpoint requires POST and rejects absent/malformed/non-admin authorization.
  - Assert `count` values 0, 7, non-integers, and missing values are rejected.
  - Assert public IDs are server-generated under the fixed product prefix and cannot be supplied by the caller.
  - Assert the response contains the public API key, configured upload-preset name, and signatures but never the API secret.
  - Assert signed parameters are sorted and include the exact timestamp, public ID, `overwrite=false`, and the configured upload-preset name.

- [x] **Step 2: Run the signing tests and verify they fail**
  - Run: `node --test test/product-media-signature.test.js`
  - Expected: FAIL because the function and tests' expected contract do not exist yet.

- [x] **Step 3: Implement `sign-product-media-uploads`**
  - Reuse the verified-JWT/admin-claim guard pattern established by the existing `upload-product-import-media` function.
  - Read `CLOUDINARY_PRODUCT_UPLOAD_PRESET` from Edge Function secrets and fail closed if it is absent.
  - Generate a UUID batch ID and one unique public ID plus fresh timestamp/signature per slot.
  - Include the configured `upload_preset` in the signed parameter set and response; return only the cloud name, public API key, preset name, batch ID, and signed upload parameters.

- [x] **Step 4: Write failing cleanup contract tests**
  - Assert admin-only POST behavior.
  - Assert empty, oversized, duplicate, malformed, or out-of-prefix public ID lists are rejected.
  - Assert Cloudinary destroy signatures are generated server-side and the API secret is never returned.

- [x] **Step 5: Implement `cleanup-product-media-uploads`**
  - Validate every public ID against the fixed NRJ product media prefix before calling Cloudinary.
  - Destroy only the submitted IDs, return per-item results, and never accept a Cloudinary URL or arbitrary resource identifier.

- [x] **Step 6: Configure both functions with JWT verification**
  - Add `[functions.sign-product-media-uploads]` and `[functions.cleanup-product-media-uploads]` blocks to `supabase/config.toml`, each with `verify_jwt = true`.

- [x] **Step 7: Run both endpoint contract tests**
  - Run: `node --test test/product-media-signature.test.js test/product-media-cleanup.test.js`
  - Expected: PASS.

### Task 2: Build the admin image picker and direct uploader

**Files:**
- Create: `src/js/features/admin/product-media-upload.js`
- Modify: `admin.html`
- Modify: `src/css/components/admin.css`
- Modify: `src/js/admin-main.js`
- Test: `test/product-media-uploader.test.js`

**Interfaces:**
- Export `initProductMediaUploader(): void`.
- Export `getSelectedProductMediaFiles(): File[]`.
- Export `uploadSelectedProductMedia(): Promise<{ urls: string[], publicIds: string[] }>`.
- Export `cleanupProductMediaUploads(publicIds: string[]): Promise<void>`.
- Export `resetProductMediaUploader(): void`.
- UI contract: one accessible multi-file input accepting JPEG/PNG/WEBP, maximum six files; one preview container with per-image remove controls; a live status element. Existing `adminImage` through `adminImage6` URL inputs remain available as the compatibility fallback.

- [x] **Step 1: Write failing uploader contract tests**
  - Assert the admin page includes the file input, preview container, and live status element.
  - Assert the file input restricts accepted types and supports multiple selection.
  - Assert the uploader calls `sign-product-media-uploads`, posts files directly to the Cloudinary Upload API, and calls `cleanup-product-media-uploads` when a partial batch fails.
  - Assert `admin-main.js` initializes the uploader only after the admin session is confirmed.

- [x] **Step 2: Run the uploader tests and verify they fail**
  - Run: `node --test test/product-media-uploader.test.js`
  - Expected: FAIL because the new uploader contract does not exist yet.

- [x] **Step 3: Implement file validation and preview state**
  - Reject more than six files, unsupported MIME types, and files larger than 9,500,000 bytes before requesting signatures.
  - Create local object URLs for previews, revoke them on removal and reset, and preserve selection order.
  - Show a live upload state without blocking the rest of the page; disable duplicate submissions while uploading.

- [x] **Step 4: Implement signed direct uploads**
  - Request a fresh batch of signatures when upload begins.
  - For each file, create `FormData` with `file`, `api_key`, `timestamp`, `public_id`, `overwrite=false`, `upload_preset`, and `signature`.
  - POST directly to `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`.
  - Accept only a successful Cloudinary response containing a valid `secure_url` and matching expected `public_id`.
  - Return URLs and public IDs in the same order as the selected files.
  - If any upload fails, clean up the known batch public IDs (including possible timeout outcomes), then surface the upload error.

- [x] **Step 5: Add the admin uploader UI and responsive styling**
  - Keep the existing URL fields as an advanced fallback to avoid breaking current workflows.
  - Show selected images in order with previews and remove controls.
  - Add clear French status messages for selection errors, upload progress, success, and failures.

- [x] **Step 6: Initialize the uploader after admin authentication**
  - Call `initProductMediaUploader()` from the authenticated admin initialization path in `src/js/admin-main.js`.

- [x] **Step 7: Run the uploader contract tests**
  - Run: `node --test test/product-media-uploader.test.js`
  - Expected: PASS.

### Task 3: Integrate uploads into product creation with rollback

**Files:**
- Modify: `src/js/features/admin/product-form.js`
- Test: `test/product-form-media.test.js`

**Interfaces:**
- `addProduct()` remains the existing button handler.
- Before calling `insertProduct(product)`, it calls `uploadSelectedProductMedia()` when local files are selected.
- Uploaded URLs fill the first N image slots in selection order; untouched slots retain their existing URL-field values.
- If the database insert fails after upload success, call `cleanupProductMediaUploads(publicIds)`.
- On successful insertion, reset file selections/previews and clear the existing URL fields.
- A failed catalogue refresh after a successful insert must not trigger deletion of media already referenced by the saved product.

- [x] **Step 1: Write failing product-form integration tests**
  - Assert uploads happen before `insertProduct`.
  - Assert URL-only product creation continues to work without requesting a signature.
  - Assert uploaded URLs are assigned in selection order to `image` through `image6`.
  - Assert an upload failure prevents product insertion.
  - Assert an insert failure invokes cleanup with the uploaded public IDs.
  - Assert a post-insert refresh/render failure does not delete assets belonging to the inserted product.

- [x] **Step 2: Run the integration tests and verify they fail**
  - Run: `node --test test/product-form-media.test.js`
  - Expected: FAIL because product creation does not yet call the uploader.

- [x] **Step 3: Integrate uploads into `addProduct()`**
  - Validate the existing required product fields first.
  - Upload selected files before building and inserting the product.
  - Preserve the existing URL-only path and its existing six image fields.
  - Keep insert failure handling separate from post-insert catalogue refresh/render handling.

- [x] **Step 4: Add rollback and retry-safe UI behavior**
  - If insert fails, attempt cleanup and keep the selected local files available for retry.
  - If cleanup fails, retain the original product-insert error and display a separate warning that orphaned Cloudinary assets may need cleanup.
  - Only clear the uploader after successful product insertion and UI refresh attempt.

- [x] **Step 5: Run the integration tests**
  - Run: `node --test test/product-form-media.test.js`
  - Expected: PASS.

### Task 4: Full verification and handoff

**Files:**
- No additional production files expected.
- Update tests only if verification exposes a regression.

- [ ] **Step 1: Run focused media tests**
  - Run: `node --test test/product-media-signature.test.js test/product-media-cleanup.test.js test/product-media-uploader.test.js test/product-form-media.test.js test/product-import-media.test.js`
  - Expected: PASS.

- [ ] **Step 2: Run the full repository test suite**
  - Run: `npm test`
  - Expected: all tests pass.

- [ ] **Step 3: Run syntax and production build checks**
  - Run: `npm run check:syntax`
  - Run: `npm run build`
  - Expected: both commands exit successfully.

- [ ] **Step 4: Review the diff and security boundaries**
  - Confirm no API secret or service-role key is exposed in browser code.
  - Confirm both new functions require JWT verification and admin authorization, and that the signed preset is restricted to JPEG/PNG/WEBP and 9,500,000 bytes.
  - Confirm no Product Import OS behavior, variant gallery behavior, database schema, existing products, or production service was changed.

- [ ] **Step 5: Prepare a preview handoff**
  - Summarize modified files, focused/full test results, Cloudinary preset prerequisites, cleanup limitations, and preview URL if a preview deployment is separately approved.
  - Do not merge to `main` or deploy Supabase functions to production without explicit approval.
