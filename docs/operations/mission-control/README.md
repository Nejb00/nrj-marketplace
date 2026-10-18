# NRJ Mission Control OS

**Purpose:** preserve mission status, decisions, proof and next actions across ChatGPT conversations, parallel sessions and external tools.

- Notion hub: [NRJ Mission Control](https://app.notion.com/p/3fd0f09830e181e6880de065b7853780?pvs=204)
- Notion register: [NRJ Mission Register](https://app.notion.com/p/ccdef631312c4398aad6a059351ab02f)
- Repository: [Nejb00/nrj-marketplace](https://github.com/Nejb00/nrj-marketplace)

> This system is initially **manual**. The Notion register and GitHub notes have been created, but cross-session synchronization and automatic GitHub-to-Notion updates are not yet implemented.

## 1. Source-of-truth hierarchy

Use the right source for the question:

1. **Live system state** is authoritative for current operational status: GitHub for branches, PRs and checks; Vercel for deployment states and URLs; Figma for current design files/versions; Supabase for migration state and data health.
2. **GitHub commits, PRs, workflow runs and deployment records** are the evidence trail. A summary must link to the real evidence rather than replace it.
3. **Notion Mission Register** is the shared index for mission status, priority, owner/session, risks and next action.
4. **Mission notes in this directory** preserve the durable narrative: objective, decisions, completed steps, blockers, test evidence and resume instructions.
5. **Chat transcripts** provide additional context, but are not the only archive.

If these disagree, verify the live evidence, record the discrepancy and update the archive deliberately. Never silently overwrite a decision or infer a success that has not been verified.

## 2. Mission IDs and files

Use stable IDs in the Notion register and durable notes.

- `NRJ-DES-###` — design and experience
- `NRJ-SEC-###` — application/security controls
- `NRJ-PAY-###` — payment work
- `NRJ-INF-###` — infrastructure, performance and deployment
- `NRJ-OPS-###` — project operations, automation and memory
- `NRJ-DATA-###` — data integrity and migrations

Notion provides a generated unique row ID (for example, `NRJ-2`) and a separate **Mission Alias** property for the semantic ID (for example, `NRJ-DES-001`). Use the semantic alias in conversation, file names and handoffs; retain the generated ID as Notion’s unique row reference. Keep both identifiers distinct.

Recommended note location:
- Active missions: `active/NRJ-<ID>-short-name.md`
- Completed milestone records: `history/PR-<number>-short-name.md`
- Repeatable structure: [mission-template.md](mission-template.md)
- Session handoff format: [session-resume.md](session-resume.md)
- Repository-wide start/end instructions: [AGENTS.md](../../../AGENTS.md)

## 3. Status rules

Use the Notion status exactly; do not collapse separate milestones:

- **Planned:** scope and intended outcome exist; work has not begun.
- **In Progress:** work or review remains.
- **Blocked:** an explicit dependency prevents progress; note the blocker.
- **Tests Passed:** specified checks passed for a stated commit; this is not user approval.
- **User Validated:** the user explicitly approved the relevant result.
- **Merged:** GitHub confirms the PR was merged into the intended target.
- **Deployed:** the target environment confirms deployment of the intended commit.
- **Archived:** a historical baseline or closed record retained for reference.

Never mark a task merged from a green build, or deployed from a merge commit. Record the tested commit SHA and target environment. A mission can remain In Progress while a first implementation's tests pass, if visual QA or user review remains.

## 4. Start-of-session protocol

Before edits or external actions:

1. Open the Notion hub and find the active mission row by name or ID.
2. Read its last note in this directory and the last recorded handoff.
3. Verify current branch, HEAD SHA, working-tree status, PR/check state, and relevant tool state.
4. Check for parallel sessions touching the same files, branch or external resource. Treat `Owner / Session` as a coordination signal, **not** as an atomic distributed lock.
5. Compare archive vs. reality. If stale, update the mission with what was actually observed before proceeding.
6. State the intended scope and safety boundaries to the user for multi-step or risky work.

## 5. Parallel-session protocol

- Prefer one branch per independent code task; never assume the other session's local state is visible.
- Record branch, latest full commit SHA, files/systems touched, owner/session label and next action.
- Agree on file ownership when two sessions may edit the same file. If there is a collision or an unknown dirty working tree, stop and reconcile first.
- For Figma, record the actual file URL, page/frame name, version or timestamp, and decision made.
- For Vercel, record the actual deployment URL, environment, status and source commit. Preview availability does not imply production deployment.
- For Supabase, record migration filenames, migration status and sanitized evidence; never store tokens, credentials, private row data or secrets in the mission archive.
- A conversation cannot be assumed to know another conversation's history. Every handoff must leave enough durable information for an independent session to resume.

## 6. Checkpoints and end-of-session protocol

Update the Notion row and note at meaningful boundaries:
- scope/plan agreed;
- a milestone completed or a key discovery made;
- test run completed;
- blocker/risk discovered;
- external-system change attempted or confirmed;
- session is ending or ownership changes.

Use [session-resume.md](session-resume.md) at handoff. Include:
- last confirmed state and timestamp;
- completed work and evidence;
- unfinished work and known blockers;
- decisions that must not be reversed casually;
- next action, with a concrete file/tool/command where useful;
- links to branch, PR, test run, Figma file, deployment or migration evidence.

## 7. Safety and completion gates

- Never modify or merge `main` without explicit authorization.
- Do not enable a preview, production deploy, payment mode, real purchase or migration just to simplify testing.
- Do not run destructive, external or user-visible side effects unless the user has authorized them.
- Preserve branch protection, auth, RLS, payment invariants and test gates.
- Avoid secrets and sensitive data in notes, logs, screenshots and links.
- Use precise language: “tests passed locally”, “PR merged” and “production deployment confirmed” are different claims.

A mission is considered fully completed only when its requested acceptance criteria are satisfied, evidence is recorded, the correct status is set, and the user-approval gate has been respected.

## 8. Current bootstrap set

- [Liquid Glass accessibility first pass](active/NRJ-DES-001-liquid-glass-accessibility.md) — active; tests pass, complete visual QA still outstanding.
- [PR #200 — Design DNA & Spatial UI](history/PR-200-design-dna-spatial-ui.md) — merged milestone.
- [PR #212 — Photon/WebP image optimization](history/PR-212-photon-webp-images.md) — merged milestone.
- [PR #215 — Mon NRJ views and direct-order action](history/PR-215-mon-nrj-settings-and-cta.md) — merged milestone.
- [PR #216 — Telegram merge notifications](history/PR-216-telegram-merge-notifications.md) — merged milestone.
- [Payment OS #18–#24 baseline](history/payment-os-18-24-baseline.md) — archived snapshot of documented coverage, not blanket proof of production execution.

This is a verified bootstrap, not a claim that every historical NRJ attack or design mission has been imported yet.


## 9. Historical records added in the 2026-10-18 audit

- [PR #82 and #83 — Incident Guard and controlled branch maintenance](history/PR-82-83-incident-guard-branch-maintenance.md).
- [PR #97 and #100 — Self-Healing V2 and Dry Run](history/PR-97-100-self-healing-v2-dry-run.md).
- [PR #172 — NRJ Merge Gate trust-boundary hardening](history/PR-172-merge-gate-hardening.md).
- [PR #140 — Product Import OS integration](history/PR-140-product-import-os.md).
- [Payment OS #18–#24 — documented coverage plus historical branch pointers](history/payment-os-18-24-baseline.md).

These are historical notes based on PR descriptions, current source-file reads and local remote-tracking references. They deliberately distinguish closed PRs from verified merges, declared coverage from executed tests, and a current workflow file from the live branch-protection configuration. Continue importing other historical missions only when concrete evidence can be linked.