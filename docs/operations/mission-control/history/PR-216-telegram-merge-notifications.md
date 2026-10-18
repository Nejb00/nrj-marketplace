# History — PR #216: Telegram notification after a merged PR

- **Status:** Merged
- **PR:** https://github.com/Nejb00/nrj-marketplace/pull/216
- **Branch:** `tools/telegram-notify`
- **Merge commit:** `41fac71621cc1238d07819e8e061a7d0d137667e`
- **Last checked:** 2026-10-18
- **Notion record:** https://app.notion.com/p/3fd0f09830e18121bad5f078e5e42dca?pvs=204

## Summary

A GitHub Actions workflow sends a message through the Cloudflare/Telegram relay when a PR is closed and merged. It supports a manual dispatch for a test message as well.

## Safety note

Do not trigger a manual notification test unless explicitly authorized. The archive records the PR as merged; it does not independently certify every external relay delivery or production operational status.

## Evidence

- PR: https://github.com/Nejb00/nrj-marketplace/pull/216
- Merge commit: https://github.com/Nejb00/nrj-marketplace/commit/41fac71621cc1238d07819e8e061a7d0d137667e
