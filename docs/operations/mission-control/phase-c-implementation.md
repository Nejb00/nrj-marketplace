# NRJ Mission Control — Phase C Implementation (preview only)

- **Mission alias:** NRJ-OPS-004
- **State:** C-Design user validated; implementation remains preview-only; PR #225 is open and Ready for review; follow-up review fixes are being validated
- **Branch:** `feat/mission-control-evidence-writer-2026-10-21`
- **Synced main baseline:** `56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d` (PR #224 merged)
- **Branch synchronization commit:** `8596a894e7808205467377ae61f5abb9abcfdb65` (two parents: the preview-only branch tip and the merged `main` tip)
- **Earlier CI evidence:** [run #39680146635](https://github.com/Nejb00/nrj-marketplace/actions/runs/39680146635) passed on `541434563fa92b2547c3108f8216a4dac680af38`. Before the current review fixes, [PR #225 checks](https://github.com/Nejb00/nrj-marketplace/pull/225/checks) completed on `f4a16a80d4ae23730a012d8a73f48eebce2553ca` with 26 success, 3 neutral, 1 skipped, and 0 failures. Those results do not validate the new corrective commits; fresh CI must pass on the updated head.
- **Design reference:** [Phase C GitHub → Notion evidence writer](phase-c-github-to-notion.md)
- **Approval boundary:** preview-only implementation on an isolated branch; no live Notion page write, write credential, or automatic sync is authorized. PR #225 may be reviewed, but merge and live-writer activation remain separate explicit decisions.

## Implemented in this branch

- `scripts/mission-control/evidence_writer_preview.py` performs fail-closed checks for one exact Mission Alias, the entire data-source result set, uniqueness, expected page ID, expected `last_edited_time`, parent data-source ID, allowed repository, PR base `main`, same-repository head, expected full head SHA, merged state and full merge SHA.
- It inspects only the existing `PR URL`, `Evidence URL`, and `Branch URL` URL properties. It proposes only blank `PR URL` and/or `Evidence URL` fields.
- A conflicting non-empty destination aborts the entire proposed update. Matching values yield `NO_CHANGE`. Stale page state, invalid source identity, duplicate aliases or mismatched branches fail closed.
- The HTTP client has a method allowlist for GET plus Notion data-source query POST only. There is **no page-write endpoint or live PATCH path** in this implementation.
- `.github/workflows/mission-control-evidence-writer-preview.yml` is manual-dispatch only, checks that the workflow runs from `main`, checks out `main` with credentials persistence disabled, uses read-only GitHub permissions, exposes API credentials only to the Python API-call step, and publishes a redacted preview artifact. It does not request or reference a Notion write credential.
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

The tests cover blank fields, one-field idempotency, both conflict types, duplicate/missing aliases, page/data-source mismatches, stale timestamps, invalid destination types, branch conflicts, unmerged PRs, wrong base/head identity, SHA mismatch, canonical PR URL checks, HTTP method restrictions, workflow policy, and credential scoping to the Python step.

## Explicit non-goals

- No remote page write, Notion schema change, write token creation/use or environment secret configuration.
- No status or human-maintained field update.
- No batch operation, schedule, webhook, automatic retry, PR creation, merge, production deployment or automatic sync.
- This branch sync does not write to `main`; the historical RDC worktree remains untouched and must be considered preserved even though RDC is currently not responding.
- No live canary. C-Canary requires another explicit approval for one exact alias/page/PR/head SHA/merge SHA/timestamp.

## Review findings and corrective work

The review found that API credentials had been declared for the whole workflow job, rather than only the step that uses them. The follow-up commit moves those values to the Python API-call step and adds a regression test to enforce that boundary. The standalone credential-check step was removed; the script already stops before making requests when credentials are absent.

The review also identified this stale handoff. It now records the existing PR and the previous CI result separately from the new corrective commits.

## Next gate

Run and inspect the full CI on the updated PR head, review the new diff and this handoff, then decide separately whether the PR can be merged. Do not merge automatically. The first live Notion write remains disabled; C-Canary still needs a separate explicit approval for one exact alias, page, PR, head SHA, merge SHA and timestamp.
