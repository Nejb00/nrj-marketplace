# NRJ Mission Control — Phase C Implementation (preview only)

- **Mission alias:** NRJ-OPS-004
- **State:** C-Design user validated; C-Implementation in progress; C-Tests passed on the pre-sync revision
- **Branch:** `feat/mission-control-evidence-writer-2026-10-21`
- **Synced main baseline:** `56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d` (PR #224 merged)
- **Pre-sync CI:** [run #39680146635](https://github.com/Nejb00/nrj-marketplace/actions/runs/39680146635) passed on `541434563fa92b2547c3108f8216a4dac680af38`; the post-sync branch revision must pass again before PR review.
- **Design reference:** [Phase C GitHub → Notion evidence writer](phase-c-github-to-notion.md)
- **Approval boundary:** preview-only implementation on an isolated branch; no live Notion property write, write token, writer PR/merge, or deployment is authorized by this checkpoint.

## Implemented in this branch

- `scripts/mission-control/evidence_writer_preview.py` performs fail-closed checks for one exact Mission Alias, the entire data-source result set, uniqueness, expected page ID, expected `last_edited_time`, parent data-source ID, allowed repository, PR base `main`, same-repository head, expected full head SHA, merged state and full merge SHA.
- It inspects only the existing `PR URL`, `Evidence URL`, and `Branch URL` URL properties. It proposes only blank `PR URL` and/or `Evidence URL` fields.
- A conflicting non-empty destination aborts the entire proposed update. Matching values yield `NO_CHANGE`. Stale page state, invalid source identity, duplicate aliases or mismatched branches fail closed.
- The HTTP client has a method allowlist for GET plus Notion data-source query POST only. There is **no page-write endpoint or live PATCH path** in this implementation.
- `.github/workflows/mission-control-evidence-writer-preview.yml` is manual-dispatch only, checks that the workflow runs from `main`, checks out `main` with credentials persistence disabled, uses read-only GitHub permissions, reads the existing Notion read token, and publishes a redacted preview artifact. It does not request or reference a Notion write token.
- `vercel.json` preserves the existing product rewrite and sets `git.deploymentEnabled=false` for only the exact documentation and implementation branches, so they should not trigger deployments; the Vercel Ignored Build Step command is also a fallback. `main` and other feature branches remain enabled. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
- Deterministic tests use mocked objects/HTTP; no live Notion or GitHub API test has been run by the unit suite.

## Tests and checks

Run from repository root:

```bash
python3 -m py_compile \
  scripts/mission-control/evidence_writer_preview.py \
  tests/mission-control/test_evidence_writer_preview.py
python3 -m unittest discover -s tests/mission-control -v
git diff --check
```

The tests cover blank fields, one-field idempotency, both conflict types, duplicate/missing aliases, page/data-source mismatches, stale timestamps, invalid destination types, branch conflicts, unmerged PRs, wrong base/head identity, SHA mismatch, canonical PR URL checks, HTTP method restrictions, and workflow policy.

## Explicit non-goals

- No remote page write, Notion schema change, write token creation/use or environment secret configuration.
- No status or human-maintained field update.
- No batch operation, schedule, webhook, automatic retry, PR creation, merge, production deployment or automatic sync.
- This branch sync does not write to `main`; the historical RDC worktree remains untouched and must be considered preserved even though RDC is currently not responding.
- No live canary. C-Canary requires another explicit approval for one exact alias/page/PR/head SHA/merge SHA/timestamp.

## Next gate

The branch has now been synchronized with the post-PR-#224 `main` baseline. Re-run CI on this exact revision, verify the merged README evidence and all four documentation updates, then present the final diff for review before creating a PR. The first live Notion write remains disabled and outside this implementation gate.
