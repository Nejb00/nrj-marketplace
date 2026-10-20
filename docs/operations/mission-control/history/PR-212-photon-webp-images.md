# History — PR #212: Photon resizing and WebP for Postimg images

- **Status:** Merged
- **PR:** https://github.com/Nejb00/nrj-marketplace/pull/212
- **Branch:** `perf/images-postimg-photon-2026-10-17`
- **Merge commit:** `e9635e7d97bc3dcad0e0de5eb2464c33f18617eb`
- **Last checked:** 2026-10-18
- **Notion record:** https://app.notion.com/p/3fd0f09830e181eba17adcbceae60fb4?pvs=204

## Problem and fix

Postimg-hosted images were served at original size because the prior thumbnail proxy rejected those domains. The fix routes eligible URLs through Photon for resizing/cropping, metadata stripping and browser-negotiated WebP, while preserving the original URL as a fallback.

## Measured test result recorded by the PR

A local catalogue test with 23 images reported total image transfer weight decreasing from 2,457 KB to 373 KB (about 85% lower). The PR also recorded a safe local payment E2E simulation and 23 successful Photon network requests without fallback activation.

## Caveat

The PR anticipated an LCP improvement, but the expected LCP change was not itself a production measurement. A future performance audit should measure real deployed metrics rather than assume the expected change occurred.

## Evidence

- PR: https://github.com/Nejb00/nrj-marketplace/pull/212
- Merge commit: https://github.com/Nejb00/nrj-marketplace/commit/e9635e7d97bc3dcad0e0de5eb2464c33f18617eb
