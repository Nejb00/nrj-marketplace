# NRJ Mission Control — C-Canary implementation handoff

- **Date:** 2026-10-22 (Africa/Brazzaville)
- **Status:** isolated, deterministic implementation and tests pass; **live automated writer not activated**
- **Branch:** `feat/mission-control-evidence-writer-canary-2026-10-22`
- **Target repository:** `Nejb00/nrj-marketplace`
- **Main baseline at branch creation:** `56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d` (PR #224 merge)
- **Working-tree safety:** implementation is on a new clean worktree/branch. Historical RDC worktree `/home/z/my-project/repos/nrj-marketplace` was not edited; its pre-existing files are preserved.

## Locked canary identity

The writer is compiled with one non-configurable target. The workflow has no free-form page, alias, branch, SHA or PR inputs.

| Item | Locked value |
|---|---|
| Mission Alias | `NRJ-OPS-005` |
| Notion page ID | `4000f098-30e1-81d4-a71a-f31f80bf2668` |
| Notion data source | `de2fc4d0-3150-4811-acc0-80ce02e2c619` |
| PR | [#224](https://github.com/Nejb00/nrj-marketplace/pull/224) |
| Head branch | `docs/phase-4a-readme-fix-2026-10-21` |
| Full head SHA | `a741ea4276894d3b66f469b42d74cf6d7ace608b` |
| Full merge SHA | `56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d` |
| Connector-observed `Updated` timestamp | `2026-10-21T21:49:27.689Z` |

The script compares the live API `last_edited_time` against the fixed timestamp. If those values differ, it stops safely. The Notion connector's `Updated` property has been observed at the timestamp above, but the dedicated API's native field has **not yet been confirmed using the new integration**; do not loosen or override the check if it blocks.

## Exact mutation contract

- Manual dispatch only; job must run from `main` and check out `main` with persisted Git credentials disabled.
- Dedicated environment: `mission-control-notion-evidence-write`.
- Dedicated secret: `NRJ_NOTION_EVIDENCE_WRITE_TOKEN`; the existing read-only credential is never used for writes.
- Built-in GitHub token remains read-only (`contents: read`, `pull-requests: read`).
- The only proposed properties are `PR URL` and `Evidence URL`; only blank properties may be filled. Any conflicting non-empty URL blocks the whole write. Matching values yield `NO_CHANGE` without a PATCH.
- Script performs a second fresh page read immediately before the one permitted PATCH and a read-back after it. A potentially sent PATCH is never blindly retried; uncertain results are reported as `WRITE_OUTCOME_UNCERTAIN`.
- No status, title, branch URL, commit/ref, date, mission body, schema, or unrelated property can be sent in the patch payload.

## Validation completed on the isolated branch

- Python compilation passed for the preview and canary scripts and both test modules.
- `python3 -m unittest discover -s tests/mission-control -v`: **51 tests passed**, including prior reconciler and preview tests and new mocked canary tests for missing confirmation/credential, merge-SHA mismatch, page conflict, stale final read, payload allowlist, successful read-back, uncertain request outcome and no retry.
- No live Notion PATCH or live workflow run occurred during those tests.

## Blocking configuration facts

1. The connected RDC host `bj-qingyan-claw-v7` is online. Its GitHub CLI identity is `Nejb00`, but its GitHub credential advertises `secrets=read`; it cannot create repository/environment secrets through that credential.
2. The repository environment list currently contains `github-pages`, `Preview`, and `Production`; `mission-control-notion-evidence-write` does not exist yet. **Do not create/use a write-enabled secret until required human-review protection is configured on that exact environment.**
3. The Notion browser session still shows “Sign in to see this page”. Integration-management permissions and an update-capable Notion integration therefore remain unverified. No integration has been created and no token has been generated or saved.
4. This branch must not be merged or activated until an authorized Notion admin creates an integration with the needed read/update capability, shares it only with the intended Mission Register page/data source, the repository environment is configured with required reviewers, and the dedicated secret is added without exposing its value.
5. The manual connector update already filled both canary URL fields and was read back successfully. As currently recorded, a writer run should return `NO_CHANGE` if both values remain equal; it will not exercise a PATCH. Do not clear/reset those fields just to force a write until the environment, token, expected native timestamp, and exact write execution are ready to be reviewed together.

## Next action

After Notion sign-in/integration admin is available and the GitHub environment review gate is configured, verify the integration's sharing/capabilities and add the token directly as the environment secret. Then refresh the preflight's native `last_edited_time` (do not display or copy the token), re-run tests/CI, review whether the locked page is `NO_CHANGE` or needs a separately approved test reset, and only then activate the one-shot workflow. Automatic sync remains disabled.
