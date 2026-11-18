# NRJ-INF-003 — Smart Media Uploader Cloudinary dans l’admin

- **Mission Alias:** NRJ-INF-003
- **Notion generated ID:** NRJ-29
- **Notion record:** https://app.notion.com/p/41c0f09830e181d8b12bc086a2b78ed5
- **Status:** In Progress
- **Priority:** P1
- **Track:** Infrastructure
- **Owner / session:** ChatGPT + Desktop Commander — exécution Native
- **Last verified:** 2026-11-18
- **Branch:** https://github.com/Nejb00/nrj-marketplace/tree/feat/nrj-smart-media-uploader
- **Base ref / base SHA:** main / c35e887cb878e5e55c0d46a250b4d4b801ab482b
- **Latest commit:** 3680ee829f62b804c92b709f446fa110c60a9c39
- **PR:** none — création non autorisée
- **External systems:** GitHub, Supabase (code only), Notion, ChatGPT

## Objective and acceptance criteria

- **Objective:** permettre à l’administrateur de choisir jusqu’à six fichiers image, de les prévisualiser et de les envoyer à Cloudinary au moment de la création du produit.
- **Acceptance criteria:** types JPEG/PNG/WEBP, limite 9 500 000 octets par fichier ; previews et retrait individuel ; ordre de sélection préservé ; upload uniquement au submit ; signature serveur ; clés secrètes jamais exposées côté navigateur ; cleanup sur upload partiel ou échec d’insertion ; compatibilité URL-only conservée ; aucune modification du Product Import OS ni du schéma DB.

## Context / source of truth

- **Source docs:** [Design](https://github.com/Nejb00/nrj-marketplace/blob/feat/nrj-smart-media-uploader/docs/superpowers/specs/2026-11-18-nrj-smart-media-uploader-design.md) · [Implementation plan](https://github.com/Nejb00/nrj-marketplace/blob/feat/nrj-smart-media-uploader/docs/superpowers/plans/2026-11-18-nrj-smart-media-uploader.md)
- **Related Notion records:** LAB-CLOUDINARY-001 (Cloudinary infrastructure), NRJ Marketplace project.
- **Base observed:** origin/main c35e887; isolated feature branch starts at 3680ee8 after adding only the local-worktree ignore rule.
- **Parallel work:** original clone had pre-existing uncommitted changes on fix/image-lazy-fallback-2026-11-09; preserved untouched in the original worktree. The feature work happens in a separate Git worktree.

## Completed steps and evidence

| Step | Result | Evidence | Commit / version | Verified at |
|---|---|---|---|---|
| Mission setup | Notion record created; feature branch and isolated worktree created | Notion record and GitHub branch above | 3680ee829f62b804c92b709f446fa110c60a9c39 | 2026-11-18 |
| Plan/spec attached | Pending commit to feature branch | docs/superpowers/ | working tree | 2026-11-18 |

## Not completed

- [ ] Task 1 — signed endpoints and cleanup tests
- [ ] Task 2 — admin picker and direct Cloudinary uploader
- [ ] Task 3 — product-form integration and rollback
- [ ] Task 4 — complete tests, build, security review and handoff

## Decisions to preserve

- No direct change to main, PR, merge, production deploy or production secret/config changes without separate approval.
- Cloudinary API secret remains exclusively in Supabase Edge Function secrets.
- The signed upload preset name is server-only (CLOUDINARY_PRODUCT_UPLOAD_PRESET) and must be confirmed to restrict formats and file size before enabling live uploads.
- Existing Product Import OS function and pipeline remain unchanged. No database migration or bulk catalogue migration.
- Uploaded files map in selection order to image through image6; existing URL inputs remain a fallback.

## Tests and verification

| Command / action | Result | Environment | Exact commit / version |
|---|---|---|---|
| Git isolation check | Pass; dedicated worktree clean | DESKTOP-02S75FV | 3680ee829f62b804c92b709f446fa110c60a9c39 |
| npm ci / baseline tests | Pending | Isolated feature worktree | pending |

## Risks, blockers and safety boundaries

- Live Cloudinary preset inspection/configuration and Supabase secret setup are prerequisites for enabling uploads, not for local code tests.
- Production functions, production secrets, Cloudinary settings, database data/schema and catalogue images are out of scope.
- No PR, preview deployment, merge or production deployment will be initiated in this mission.

## Session handoff

**Last confirmed state:** feature branch and isolated Git worktree exist, based on main c35e887. Plan/spec files are present in the worktree.
**Next action:** install locked dependencies in the isolated worktree, run the baseline checks, then begin Task 1 tests-first.
**Do not forget:** preserve the original clone’s dirty branch and do not touch main or production.
**Open questions:** actual upload preset name/settings must be verified before activating the live integration.

## Status-change history

| Timestamp | Previous status | New status | Evidence / decision |
|---|---|---|---|
| 2026-11-18 | Planned | In Progress | User approved Native execution and implementation on a dedicated branch. |
