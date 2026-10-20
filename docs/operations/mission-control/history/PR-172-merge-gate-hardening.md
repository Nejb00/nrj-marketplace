# History — PR #172: NRJ Merge Gate trust-boundary hardening

- **Archive status:** historical hardening reference; live branch-protection state not certified here.
- **Last checked:** 2026-10-18
- **PR:** https://github.com/Nejb00/nrj-marketplace/pull/172
- **Current workflow inspected:** https://github.com/Nejb00/nrj-marketplace/blob/main/.github/workflows/nrj-merge-gate.yml
- **Notion record:** https://app.notion.com/p/3fd0f09830e181bea6fbe5b916fb07e5?pvs=204

## PR #172 — Stated hardening

The PR description says the gate runs through `workflow_run` using the version from `main`, does not execute pull-request code, validates source workflows by exact path, rejects PRs that modify protected validation workflows, and pins `actions/github-script` to the `v9.0.0` commit.

## Current workflow on main

A read of `.github/workflows/nrj-merge-gate.yml` on `main` confirms that the file currently defines a job named **NRJ Merge Gate**. Its workflow source lists the required checks as Build, PR Quality Gate, CodeQL JavaScript/TypeScript, CodeQL Actions, and Dependency Review. It also lists Payment E2E as a conditional check.

This verifies the current file contents only. It does not prove the active GitHub ruleset/branch-protection configuration, which check is required in the live settings, or the outcome of a specific historical PR.

## Evidence boundary

The PR snapshot retrieved in this audit is closed but does not expose the merge flag. The presence of a current workflow on `main` is independent evidence of that file's current contents; this note does not infer the full live security configuration from either fact.

## Safe resume

Before a future change to merge protection, inspect the actual repository rulesets and branch-protection settings, required status checks and workflow permissions. Keep any proposed change on an isolated branch. Do not modify or merge `main` without explicit user approval.
