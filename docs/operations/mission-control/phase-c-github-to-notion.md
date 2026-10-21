# NRJ Mission Control — Phase C: GitHub → Notion evidence writer

- **Mission alias:** NRJ-OPS-004
- **Document status:** C-Design explicitly user-validated on 2026-10-21; C-Implementation is underway on an isolated branch.
- **Prepared:** 2026-10-21
- **Design branch:** `docs/phase-c-github-notion-writer-2026-10-21`
- **Implementation branch:** `feat/mission-control-evidence-writer-2026-10-21`
- **Original design base commit:** `02fe7c333260d828756034a1cc8ab15d73114551`
- **Current implementation sync baseline:** `56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d` (current `main` after PR #224)
- **Current implementation status:** preview-only preflight and report code exists on the implementation branch; there is no page-write endpoint, write token, or live Notion property write.
- **Approval rule:** C-Design approved; implementation only is authorized. Any live write and broader expansion still require separate explicit approval.

## 1. Executive decision

Build the smallest useful writer as a **manual, single-mission, evidence-only operation**. It must never be a general two-way sync, must not run on a schedule or in response to `workflow_run`, and must not change the mission lifecycle status.

The proposed first write scope is intentionally limited to these existing URL properties:

- `PR URL`: fill only when blank, with the canonical URL of the exact pull request supplied for the approved run and validated against live GitHub evidence.
- `Evidence URL`: fill only when blank, with the canonical merge-commit URL for that same PR after GitHub confirms it was merged.

If either property already contains a different non-empty value, the entire operation stops as a conflict. It does not overwrite it. If both values already equal the proposed values, return `NO_CHANGE` and make no PATCH request.

The first release does **not** set `Status`, `Commit / Ref`, `Branch URL`, `Last Verified`, `Next Action`, `Risks / Blockers`, `Owner / Session`, `Priority`, `Track`, `Systems`, the mission title, or any page content. It cannot create or delete pages, add blocks, change database schema, merge PRs, modify repository contents, deploy, or activate payments.

## 2. Phase B evidence already available

The current read-only reconciler is in `main` and has been exercised manually after the status-semantics fix:

| Evidence | Result |
|---|---|
| Run [39563775278](https://github.com/Nejb00/nrj-marketplace/actions/runs/39563775278) | `NO_CHANGE`, 12 missions, 12 unique aliases |
| Run [39567369170](https://github.com/Nejb00/nrj-marketplace/actions/runs/39567369170) | `NO_CHANGE`, 12 missions, 12 unique aliases |
| Run [39567511552](https://github.com/Nejb00/nrj-marketplace/actions/runs/39567511552) | `NO_CHANGE`, 12 missions, 12 unique aliases |
| Local unit tests | 11 passed in an isolated clean worktree |
| Read-only safety statement | No Notion/GitHub writes, branch/PR creation, merges, or deployments in those reconciliation runs |

The separate global observability report [39565885144](https://github.com/Nejb00/nrj-marketplace/actions/runs/39565885144) returned `healthy` with 35 relevant runs, 0 failed, 0 pending, and 0 open incidents. This aggregate result does not mean every historical workflow run succeeded: two Merge Gate controller executions failed and remain a separate diagnostic item.

## 3. Current Notion schema and constraints

The live data source was inspected on 2026-10-21:

- Data source: `de2fc4d0-3150-4811-acc0-80ce02e2c619` (`NRJ Mission Register`)
- Observed row count from the successful read-only runs: 12
- The current schema already contains `Mission Alias`, `PR URL` (URL), `Evidence URL` (URL), `Branch URL` (URL), `Commit / Ref` (text), `Status` (status), and other human-maintained fields.
- It does **not** currently contain dedicated `Last Sync …` metadata properties.

No schema change is required for the first narrow writer: idempotency can be achieved by comparing the proposed URLs with the existing URL values and returning without a write when they already match. The workflow artifact records the run ID, target page ID, alias, source PR/head/merge SHA, proposed property names, old/new values (URLs only), result, and verification outcome. Do not add sync metadata properties without a separate schema-change proposal and approval.

## 4. Invocation and trust boundary

The eventual writer must satisfy every requirement below before it can be considered for activation:

1. **Manual dispatch only.** No `push`, `pull_request`, `workflow_run`, webhook, schedule, or automatic retry trigger may invoke the writer.
2. **Default branch only.** The job must reject any run for which `github.ref != refs/heads/main`. Its trusted implementation must be loaded from the reviewed default-branch revision, with checkout credentials persistence disabled. A caller-selected branch or PR revision must never supply executable writer code.
3. **One alias per run.** Reject `all`, blank values, malformed aliases, and aliases that do not match exactly one row after normalization. Re-query the data source to verify uniqueness; never rely on search ranking or a partial result.
4. **Explicit source identity.** Require a positive integer PR number and a full 40-character expected PR head SHA from a reviewed dry-run report. Require the expected Notion `last_edited_time` and expected page ID from that same report. Never accept a branch name, URL, or free-form shell command as executable input.
5. **Independent activation gate.** Store the write credential only as an environment secret in a dedicated environment such as `mission-control-notion-evidence-write`. That environment must have required human review configured before activation. If the repository cannot enforce that review gate, do not activate the writer.
6. **No privilege expansion.** The workflow's GitHub token remains read-only (`contents: read`, `pull-requests: read`, `checks: read`, `actions: read` as needed). It does not need `contents: write`, `checks: write`, `pull-requests: write`, deployment permissions, or an OIDC cloud token.
7. **Pinned dependencies.** Pin third-party actions used by the writer to reviewed full commit SHAs; do not copy mutable action versions into a new privileged workflow without review.

The existing `NRJ_NOTION_READ_TOKEN` must remain read-only and must never be reused for writes. If a writer is separately approved, it requires a distinct `NRJ_NOTION_EVIDENCE_WRITE_TOKEN` held only by the protected environment, with the minimum Notion capabilities necessary to read the register and update existing page properties. It must not have insert-content capability.

**Important permission limitation:** Notion's connection capability and page-sharing settings do not enforce this application's two-property allowlist at the property level. A connection that can update pages in the shared register may have broader edit capability than the writer code intends. The property allowlist, trusted workflow revision, protected environment, and tests are compensating controls—not a claim that the Notion token itself can update only two named properties. If that remaining blast radius is unacceptable, keep Mission Control read-only.

## 5. Preflight validation — fail closed

Before any write request, the writer must complete all checks:

1. Confirm this is the intended repository, `Nejb00/nrj-marketplace`, and the data source ID is the configured Mission Register ID.
2. Read the full relevant data-source result set and verify the alias resolves to exactly one existing page. Confirm the page's parent is the configured data source and its page ID equals the operator-supplied expected page ID.
3. Re-read that page and require `last_edited_time` to equal the expected timestamp from the reviewed report. If it differs, abort with `STALE_NOTION_PAGE`; ask for a fresh dry run and human review.
4. Fetch the exact supplied PR from `Nejb00/nrj-marketplace`. Require its base repository to be this repository, its base branch to be `main`, and `head.sha` to equal the supplied full expected head SHA.
5. Require GitHub to confirm `merged_at` is non-null and `merge_commit_sha` is a valid full SHA. An open PR, a closed-but-unmerged PR, a missing merge SHA, an inaccessible API, or ambiguous source is not eligible for this first writer.
6. If the Notion row has a `Branch URL`, parse and validate it as a GitHub branch URL for this repository. If its branch name does not match the PR's head branch, abort as `SOURCE_CONFLICT`; do not infer that an unrelated PR belongs to the mission.
7. Construct canonical output URLs from validated API objects, not from arbitrary input strings:
   - `PR URL` → the exact PR's canonical `html_url`.
   - `Evidence URL` → `https://github.com/Nejb00/nrj-marketplace/commit/<merge_commit_sha>`.
8. Inspect both destination fields before writing. If either is populated with a value different from the target, abort the **whole** operation with `PROPERTY_CONFLICT`. Do not partially update the other field. If both already equal the target, return `NO_CHANGE` with no PATCH.
9. Generate and persist a redacted preview report listing the exact page, PR, head SHA, merge SHA, current values, proposed values, and proof URLs. Do not log credentials or full API request headers.

## 6. The only permitted mutation

After separate implementation and activation approval, and after the protected-environment approval for that exact run:

- Send one `PATCH /v1/pages/{page_id}` request containing only the allowlisted `PR URL` and/or `Evidence URL` properties that are currently blank and have validated targets.
- Do not send page content, title, icon, cover, archive/trash flags, database schema, or any other property.
- Do not write `Status`, even when the PR is merged. A merged PR is evidence about one code change, not proof that the broader mission is `Merged`, `User Validated`, or `Deployed`.
- Do not write `Commit / Ref` in this release. Existing rows use it for historical as well as live references, so the writer must not silently redefine its meaning.
- Do not update `Last Verified`; that date is part of the human review/handoff process in the first version.

A manual `workflow_dispatch` input such as `confirm_write=YES` is not, by itself, adequate authorization. The actual approval must be given outside the workflow for the described scope and enforced by repository/environment controls as far as the platform allows.

## 7. Stale-write and failure handling

Notion's page-update API is a PATCH operation. Its documented interface does not provide a compare-and-swap precondition in the request contract. Therefore, comparing `last_edited_time` is a useful optimistic guard but **cannot eliminate the race** where a human edits a destination field between the final read and the PATCH.

Mitigations for the first release:

- Only fill blank evidence-link properties; never replace a non-empty value.
- Use one run per alias and a per-alias concurrency group with cancellation disabled for an in-flight write.
- Re-read immediately before PATCH; if the timestamp or target values changed, abort.
- Tell the operator not to edit the target row during the approved write window.
- Read the page back immediately after PATCH and verify the exact values and property types.
- If a post-write read cannot confirm the result, return `WRITE_OUTCOME_UNCERTAIN`; do not blindly retry PATCH and do not claim success.
- On `429`/transient read failures, use bounded retry with `Retry-After` where provided. Never blindly retry a PATCH with an uncertain outcome; read the page first and reconcile it.
- Do not automatically roll back. Provide the exact before/after URLs and run ID for human recovery. Any compensating edit must first verify the current value still equals the value written by that run; otherwise stop.

If eliminating the remaining last-moment race is a hard requirement, this API design is insufficient: remain read-only or introduce a separately reviewed coordination mechanism before activation.

## 8. Result states and artifact

Each run must end with one explicit result:

- `NO_CHANGE` — target properties already equal the verified values; no write request made.
- `BLOCKED` — no unique alias/page, missing permission, unavailable source, stale page, unmerged PR, or insufficient proof.
- `CONFLICT` — one or more destination properties contain different non-empty values; nothing is written.
- `WRITE_APPLIED_VERIFIED` — one PATCH succeeded and a fresh read confirms the exact values.
- `WRITE_OUTCOME_UNCERTAIN` — request outcome or read-back cannot be established; no blind retry.
- `ERROR` — unexpected failure; the report must say whether a write was definitely not attempted, definitely verified, or uncertain.

The artifact must be redacted and include timestamp, workflow run ID, exact main SHA, alias, page ID and last-edited timestamps, PR/head/merge SHAs, old/new values for the allowlisted URL fields, read-back result, and the safety decision. Do not include secrets, full request headers, unrelated mission details, customer/order data, or page-body dumps. Retain it according to repository policy; artifact evidence does not replace the Notion record.

## 9. Test plan before any live write

### Deterministic unit tests (mocked APIs only)

- alias missing, duplicate alias, wrong page ID, and wrong parent data source all fail closed;
- invalid repo, PR number, base branch, expected head SHA, merge state, or merge SHA blocks the write;
- existing matching values return `NO_CHANGE` without calling PATCH;
- a conflict in either URL field prevents *both* field updates;
- only `PR URL` and `Evidence URL` can appear in the PATCH payload;
- status, `Commit / Ref`, `Branch URL`, `Last Verified`, and human-authored fields are never emitted in a write payload;
- a changed `last_edited_time` blocks the write;
- 403/404/429/5xx, timeout-before-write, timeout-after-possible-write, and failed read-back produce safe, distinct results without leaking tokens or blindly replaying PATCH;
- repeated invocation after a successful write is idempotent and performs no second PATCH;
- an open PR or a merged PR with a different head SHA cannot write anything.

### Staged integration plan (after separate approval)

1. Run the existing read-only dry run on exactly one proposed alias and export the before-state.
2. Review the report and the proposed two-field patch manually.
3. Confirm a dedicated writer integration has access only to the necessary Mission Register content; confirm its capabilities and sharing scope in Notion's UI. Do not reuse the read-only token.
4. Run mocked tests plus workflow/YAML/security checks on an isolated branch. No live PATCH during this stage.
5. For the first live canary, require a separate, explicit user approval identifying the exact alias, Notion page ID, PR number, expected head SHA, merge SHA, expected `last_edited_time`, and target URL fields. If no safe blank-field candidate exists, do not create a test mission or overwrite a populated field; stop and request an explicit decision.
6. Complete the write under the protected environment, read the page back, compare before/after snapshots, and verify no other property changed.
7. Stop after that single canary and report the result. Do not batch the remaining register, schedule runs, enable webhooks, or widen the allowlist without another review.

## 10. Approval gates and rollback plan

| Gate | Required decision | Mutation allowed? |
|---|---|---|
| C-Design | User reviews this specification | No |
| C-Implementation | Separate approval to write the implementation on an isolated branch | No live Notion write |
| C-Tests | All unit, workflow and security tests pass; human review of the dry-run payload | No live Notion write |
| C-Canary | Separate explicit approval for one exact alias/page/PR/SHA plus protected-environment approval | Only the two allowlisted URL fields on that one page |
| C-Expansion | Review canary evidence and decide separately on any broader scope | No expansion by default |

If the canary is wrong, do not run an automatic restore. Re-read the target page, confirm whether the changed values are still exactly those written by the run, record the evidence, and ask for a separately approved manual correction. Do not alter the mission status as part of recovery.

## 11. Current status and next action

- Phase B read-only proof: three successful live `NO_CHANGE` reports with 12 unique mission aliases each; the original 11 reconciler unit tests passed.
- **C-Design approved by the user on 2026-10-21.** C-Implementation is authorized on an isolated branch only.
- The current implementation adds `scripts/mission-control/evidence_writer_preview.py`, a manual preview workflow, deterministic mocked tests, and the branch-specific Vercel deployment guard. It validates one exact mission/PR pairing and computes a two-property preview; it does not contain a page-write endpoint. Pre-sync CI [run #39680146635](https://github.com/Nejb00/nrj-marketplace/actions/runs/39680146635) passed 40 tests and workflow safety checks on commit `541434563fa92b2547c3108f8216a4dac680af38`; CI must be rerun on the synchronized branch head before PR review.
- The read-only Notion token remains the only Notion credential referenced. No write token or new Notion capability has been created or used; no live Notion API mutation has been performed.
- No mission property or Notion schema has been changed by the writer code. Mission Control bookkeeping is maintained separately in the relevant Notion row.
- The historical RDC clone remains preserved. All implementation changes are isolated from `main`.
- The two Merge Gate controller failures found in the earlier audit remain a separate diagnostic item and must not be hidden by the healthy aggregate report.

**Next action:** confirm post-sync CI on the implementation branch, review the full preview-only diff, then present it before creating a PR. C-Canary must be separately approved before adding or enabling any live page-write path; automatic sync remains disabled.

## 12. Official references checked during design

- [Notion — Update page API](https://developers.notion.com/reference/patch-page)
- [Notion — Connection capabilities and integrations](https://www.notion.com/help/create-integrations-with-the-notion-api)
- [Notion — Sharing and permissions](https://www.notion.com/help/sharing-and-permissions)
- [GitHub — Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
