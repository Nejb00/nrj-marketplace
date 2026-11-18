# NRJ Smart Media Uploader — Design

**Date:** 2026-11-18
**Status:** Design and implementation plan approved by the user; Native execution in progress (2026-11-18)
**Project:** NRJ Marketplace

## Intent

Remove the manual image-hosting and URL-copying step from the classic product-creation form. An administrator should select up to six images from a phone or computer, preview them, and submit the product once. NRJ uploads the selected files to Cloudinary and stores the returned secure URLs in the existing `products.image` through `products.image6` fields.

## Goals

- Let an administrator select up to six local images in one action.
- Preview, remove, and inspect the selected images before submission.
- Validate JPEG, PNG, or WEBP files and reject files above 9,500,000 bytes in the admin picker (client-side only). The connected Cloudinary account currently reports a 10 MiB account-level image upload ceiling.
- Upload directly from the browser to Cloudinary using short-lived server-generated signatures.
- Keep the Cloudinary API secret exclusively in Supabase Edge Function secrets.
- Preserve the existing six URL fields as an advanced compatibility fallback.
- Insert the product only after all selected uploads succeed.
- Clean up uploaded Cloudinary assets when a partial upload or product insert fails, where the outcome is known.
- Keep the existing Product Import OS workflow unchanged.

## Non-goals

- Bulk migration of the existing Postimages catalogue.
- Upload support for the product-variant gallery.
- Automatic product editing/replacement after creation.
- Unsigned Cloudinary uploads.
- Publishing products through the Product Import OS pipeline.

## Approaches considered

1. **Proxy file bytes through Supabase Edge Functions.** Simple client flow, but needlessly routes large media through Supabase and adds function bandwidth and memory work.
2. **Server-signed direct browser uploads to Cloudinary (selected).** Supabase authorizes each upload and returns short-lived signatures; the browser sends file bytes directly to Cloudinary. This keeps the secret server-side and avoids proxying media bytes.
3. **Cloudinary Upload Widget.** Fast to integrate, but introduces a separate vendor-owned interface and gives NRJ less control over the exact admin experience.

## Approved decisions

- Use approach 2.
- Keep the existing Vite + vanilla JavaScript architecture and Supabase Edge Functions.
- The admin selects up to six images; selection order maps to image slots 1–6.
- Existing URL inputs remain as an advanced fallback for already-hosted images and backward compatibility.
- New file uploads take precedence in the corresponding leading slots.
- Uploads start only when the administrator clicks **Ajouter au catalogue**.
- Use generated, unique public IDs under `nrj-marketplace/products/<batch-id>/` and disable overwrite.
- Use a signed Cloudinary upload preset (`unsigned=false`) configured with allowed formats JPEG/PNG/WEBP. Its name is stored as the server-only `CLOUDINARY_PRODUCT_UPLOAD_PRESET` secret, included in the signed upload parameters, and never accepted from the browser. Cloudinary does not support a per-preset file-size cap: 9,500,000 bytes is a client-side admin validation limit; the connected account currently reports a 10 MiB (10,485,760-byte) account-level image upload ceiling. Confirm the preset's current settings before enabling uploads.
- Use a dedicated signing Edge Function and a dedicated cleanup Edge Function; do not alter the existing Product Import media function.
- Do not create the database product until all selected uploads have succeeded.
- If product insertion fails, attempt to remove the just-uploaded assets. If cleanup fails, report that explicitly without hiding the original insertion error.
- Do not change production, merge to `main`, or migrate existing catalogue images as part of this feature.

## Success criteria

- An administrator can select and preview up to six images without copying Cloudinary URLs.
- Valid images upload to Cloudinary only after submit and the resulting `secure_url` values are saved in the existing image columns.
- Invalid files, non-admin requests, expired/invalid signatures, partial upload failures, and product-insert failures are handled without publishing a broken product.
- Existing URL-only product creation remains available.
- Existing Product Import OS behavior remains unchanged.
