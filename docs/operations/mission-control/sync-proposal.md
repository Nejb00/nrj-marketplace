# NRJ Mission Control — Controlled Notion ↔ GitHub Sync Proposal

- **Mission alias:** NRJ-OPS-004
- **Status:** Proposed / design only
- **Date:** 2026-10-20
- **Implementation status:** NOT IMPLEMENTED; no integration token provisioned, no workflow enabled, no automated write executed.
- **Branch:** `docs/nrj-mission-control-os-2026-10-18`
- **Authority:** user approval required before implementation or activation.
- **Related records:** [Notion Mission Control](https://app.notion.com/p/3fd0f09830e181e6880de065b7853780?pvs=204), [Mission Register](https://app.notion.com/p/ccdef631312c4398aad6a059351ab02f), [repository agent instructions](../../../AGENTS.md).

## 1. Decision summary

Build an **asymmetric, evidence-first synchronizer**, not a free-form two-way mirror.

- Notion is the human-facing mission cockpit: title/alias, objective, priority, owner/session, next action, risks, and approval notes.
- GitHub is the durable technical record: mission Markdown, branches, commits, pull requests, workflow runs, checks and release/deployment evidence.
- The relevant live system remains authoritative for its own current state (GitHub for Git state, Vercel for Vercel deployments, Supabase for migration/data state, Figma for design-file state).
- Chat conversations are useful context, but are not a system-of-record and must never be the only source of mission state.

**No direct bidirectional overwrite.** Reconcile both sides, classify differences, and apply only field-specific changes through an explicitly approved path.

## 2. Goals

1. Reduce the steps needed to resume a mission from another conversation.
2. Keep status claims tied to evidence and exact commit/version identifiers.
3. Detect drift between Notion rows and GitHub mission notes.
4. Prevent duplicate mission creation, stale writes, sync loops, and accidental permission escalation.
5. Preserve the existing approval boundaries: no unapproved changes to `main`, no auto-merge, no live payment action, and no production deploy initiated by Mission Control sync.

### Non-goals for the first release

- Replacing GitHub, Notion, or the operational state of Vercel/Figma/Supabase.
- Synchronizing full chat transcripts, customer/order data, environment variables, secrets, or logs containing sensitive data.
- Automatically declaring a user-approved mission complete.
- Auto-merging a generated documentation PR.
- Automatically deleting or archiving missions.
- Any payment/provider activation, database mutation, product publication, or deployment.

## 3. Proposed architecture

### Component A — Reconciler (read-only first)

A GitHub Actions workflow, invoked manually at first, reads:
- Notion Mission Register by exact semantic Mission Alias;
- GitHub branch/commit/PR/check metadata;
- the relevant mission Markdown file;
- deployment evidence only when that mission explicitly includes a deployment.

It creates a timestamped reconciliation report (Markdown + machine-readable JSON) as a workflow artifact. It performs **no Notion writes and no repository writes**. Unknown, duplicated, or missing aliases fail closed and are listed as findings instead of creating rows.

Do not enable a scheduled trigger in the first release. Add scheduling only after manual runs are stable and the user explicitly approves that change.

### Component B — GitHub evidence → Notion (later, allowlisted writes)

Only after the read-only report has been validated, consider narrow event-driven property updates for an exact, existing Mission Alias. Examples:
- store an exact PR URL and merge commit only when GitHub confirms the PR is merged;
- record test status only for named required checks and their exact head SHA;
- record a deployment only when the target environment reports a deployment tied to the expected source SHA.

Do not update human-authored fields such as objective, priority, owner, next action, risks, or approval notes automatically. Never infer `User Validated` from tests or merge state. Never infer `Deployed` from a merge alone.

A status transition is allowed only if the live evidence satisfies the status rule in the Mission Control OS. Otherwise append a reconciliation finding for human review.

### Component C — Notion intent → GitHub (explicit publish only)

Notion-to-GitHub edits are higher risk because they can change a repository artifact. They must **not** run on every Notion edit.

A later, separate manual `workflow_dispatch` may accept:
- one exact Mission Alias;
- an expected Notion page/row ID;
- the current target branch SHA;
- a requested action such as `draft-mission-note`.

The workflow re-reads the row, validates all identifiers and produces a branch with a Draft PR for review. No direct push to `main`, no auto-merge, and no deployment. If the row was edited after the approval point or the base SHA changed, abort and require a fresh review.

## 4. Field ownership matrix

| Field / data | Authoritative owner | Initial automation behavior |
|---|---|---|
| Mission Alias and Notion page ID | Notion identity + explicit mapping | Read only; aliases must be unique |
| Mission title, objective, priority, track, owner/session | Human-maintained Notion record | Read only; propose drift, never overwrite |
| Next action, risks, decisions, approval notes | Human-maintained mission record | Read only; suggest differences, never decide on the user's behalf |
| Detailed mission narrative / history | Versioned Markdown in GitHub | Read only in first release; sync into repository only through explicit Draft PR workflow |
| Branch URL and exact commit SHA | GitHub | Populate/update only after the referenced branch/SHA is verified |
| PR URL, merged flag, merge SHA | GitHub | Update only from GitHub API/event evidence |
| Check result, workflow run URL, tested SHA | GitHub Actions / Checks API | Update only for named checks on the exact SHA |
| Deployment URL/environment/source SHA/status | Deployment platform (e.g. Vercel) | Do not infer from GitHub merge; later integration must verify platform evidence |
| User Validated status | Explicit user action | Never automated |
| Payment/security approval or live activation | Explicit authorized operator + live evidence | Out of scope for sync |
| Last reconciled / sync fingerprint | Integration metadata | Managed by the synchronizer; not hand-edited |

Before implementation, verify the current Notion data-source schema and add only the minimum metadata properties needed for idempotency, e.g. `Last Sync Source SHA`, `Last Sync Event ID`, `Last Sync Result`, and `Last Sync At`. These schema changes are **not** part of this proposal's implementation.

## 5. Identity, idempotency, and conflict handling

1. `Mission Alias` is the stable business key (e.g. `NRJ-DES-001`). Notion page ID and generated Notion row ID are recorded separately; do not confuse identifiers.
2. A write requires exactly one matching alias and a known Notion page ID. Zero or multiple matches = fail closed.
3. Every event/run is idempotent using source system + event/run ID + source SHA + mission alias. Reprocessing the same event must not duplicate rows or append duplicate history.
4. Before update, re-read the Notion row and compare the last-edited timestamp and the expected source SHA. If newer content appears or the target/base SHA changed, stop and emit a conflict.
5. Never perform delete operations. Never auto-create unknown missions in the first release.
6. Use a single-flight/concurrency group per mission alias. Preserve event order or reject stale/out-of-order events.
7. Retries must be bounded and safe for HTTP 429/5xx. After retries, emit a clear failed reconciliation report; do not mark the mission synced.
8. Prevent loops by separating user-authored fields from machine-owned evidence fields and by recording the originating event/sync fingerprint.

## 6. Permissions and secret handling

- Use a dedicated Notion integration shared only with the Mission Register data source and the minimum required pages. Do not use an owner-wide credential if a narrower integration suffices.
- Store the integration secret only in GitHub Actions Secrets or a protected environment; never in the repository, artifacts, Notion, command output or logs.
- First workflow: minimum read-only GitHub permissions and read-only Notion integration.
- Later evidence writer: only the Notion write scope required for properties of the approved data source; GitHub repository contents stay read-only.
- Notion-to-GitHub publisher: separately gated job with narrowly scoped contents/PR permissions, protected environment/approval if available, and only trusted workflow code from the protected base branch. Never expose secrets to PR code.
- Do not use `pull_request_target` to execute untrusted PR code. Do not run arbitrary shell commands derived from Notion text.
- Redact tokens and customer-related information from logs/artifacts. Rotate any credential suspected of exposure.

## 7. Workflow and approval model

### Proposed lifecycle

1. **Manual dry run:** operator chooses an alias or `all`; the workflow reads sources and emits a report only.
2. **Review findings:** an operator compares field-by-field proposed changes against the live evidence.
3. **Enable one narrow GitHub → Notion write path:** only verified evidence fields; explicit user approval to implement.
4. **Add explicit Notion → GitHub Draft PR path:** manual dispatch for one mission at a time; explicit user approval to implement.
5. **Consider scheduled reconciliation:** only after successful manual use and separate explicit approval.

### Hard stops

- Missing/duplicate alias, inaccessible source, ambiguous target, stale source SHA, dirty/unexpected branch state, unclear user approval, or inconsistent status evidence.
- Any request to alter `main`, merge a PR, activate payments, modify live data or deploy must remain outside the synchronizer's permissions.
- A sync failure must leave the prior mission state intact and mark the report as failed/partial—not overwrite the status with an optimistic value.

## 8. Reconciliation report format

For each mission:
- semantic alias + Notion page ID;
- checked timestamp;
- Notion `last_edited_time`;
- GitHub branch URL + full HEAD SHA;
- PR/check/run/deployment references and exact source SHA where applicable;
- field-by-field values from each source;
- proposed changes, reason and proof URL;
- conflicts and stale-data findings;
- result: `NO_CHANGE`, `DRIFT_FOUND`, `BLOCKED`, or `ERROR`;
- no secret values or sensitive payloads.

The report must distinguish observed facts from proposals. A dry run must be provably read-only (no Notion property change, no repo commit, no branch/PR creation).

## 9. Test plan and acceptance criteria

### Unit tests (mocked APIs)

- correct field mapping and status evidence rules;
- one exact alias, missing alias, duplicate alias;
- idempotent duplicate event;
- stale event or changed base SHA;
- conflict in human-authored field;
- `User Validated` never set by automation;
- merged PR does not imply deployed;
- rate limit/transient failure with bounded retries;
- secret redaction and error handling.

### Read-only integration tests

- run against an allowlisted test mission and the real read APIs;
- capture before/after hashes or property snapshots to demonstrate no mutation;
- compare Notion and GitHub values;
- assert zero commits, branches, PRs, Notion writes and deployment changes.

### Write-path tests (only after explicit approval)

- use a dedicated test mission/page or sandbox;
- verify exactly one approved property update;
- verify duplicate event performs no second mutation;
- make Notion-to-GitHub produce a branch/Draft PR only;
- assert `main` SHA unchanged and no deployment trigger;
- confirm integration scopes are insufficient to modify unrelated pages or data.

### Acceptance gates

1. Dry-run report links every proposed status/evidence change to a live source.
2. Missing/duplicate aliases and stale refs fail closed.
3. No human decision field is overwritten by event processing.
4. `User Validated`, merged and deployed statuses require their distinct evidence.
5. No write occurs during dry-run; this is verified independently.
6. Auth is limited to the smallest practical scope, with no secrets in logs or artifacts.
7. All tests pass on an isolated branch; user reviews the report and design.
8. Implementation and activation remain a separate approval after this proposal.

## 10. Rollout recommendation

| Stage | Outcome | Mutation allowed? | Gate |
|---|---|---|---|
| A — Design | This proposal | No | User reviews architecture |
| B — Read-only proof | Manual reconciliation report | No | Three successful test runs, zero-mutation evidence |
| C — Evidence writer | GitHub evidence fields updated in Notion | Limited allowlist only | Explicit approval + tests |
| D — Draft publisher | Selected Notion metadata exported via isolated branch/Draft PR | Branch and Draft PR only | Explicit approval + review |
| E — Scheduling | Periodic drift report | Initially no writes | Separate explicit approval |

## 11. Current state and next decision

- The cold-start documentation test succeeded in reconstructing the project and mission state from persistent Notion/GitHub references.
- This does not prove that sessions will automatically load or synchronize those sources.
- Mission Control remains manually coordinated today.
- This document is a **proposal only**. No integration secret has been created, no workflow has been added or enabled, no Notion schema change has been made, and no sync execution has occurred.

**Decision requested before implementation:** review this proposal and authorize any desired changes. Until explicit approval, keep all automation inactive.
