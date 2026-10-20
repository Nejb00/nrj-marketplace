# History — PR #215: Mon NRJ views and direct-order action

- **Status:** Merged
- **PR:** https://github.com/Nejb00/nrj-marketplace/pull/215
- **Branch:** `fix/ui-settings-and-product-cta-2026-10-18`
- **Merge commit:** `29401c0667814800af4d803f9305ec68824841f0`
- **Last checked:** 2026-10-18
- **Notion record:** https://app.notion.com/p/3fd0f09830e181a09987def1beb0773c?pvs=204

## Summary

The profile and settings pages were made mutually exclusive by honoring the native hidden state despite the flex display rule. The sticky “Commander directement” action gained deliberate styling, a 48 px minimum height, focus-visible behavior and reduced-motion support. Regression tests protect the view contract and Buy Now wiring.

## Verification declared by the PR

Build passed, 266/266 tests passed, 209 JavaScript files passed syntax checks, smoke test passed and Chromium mobile audit passed. No purchase action was submitted, no production deployment was requested, and Main2 was not touched.

## Evidence

- PR: https://github.com/Nejb00/nrj-marketplace/pull/215
- Merge commit: https://github.com/Nejb00/nrj-marketplace/commit/29401c0667814800af4d803f9305ec68824841f0

## Follow-up

Preserve the “profile and settings are separate views” regression contract during future Mon NRJ changes.
