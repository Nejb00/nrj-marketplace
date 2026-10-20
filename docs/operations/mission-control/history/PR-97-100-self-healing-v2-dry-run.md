# History — PR #97 and #100: Self-Healing V2 and Dry Run

- **Archive status:** historical summary; current activation and merge state are not asserted.
- **Last checked:** 2026-10-18
- **PR #97:** https://github.com/Nejb00/nrj-marketplace/pull/97
- **PR #100:** https://github.com/Nejb00/nrj-marketplace/pull/100
- **Notion record:** https://app.notion.com/p/3fd0f09830e18174a02ce052a6c32d21?pvs=204

## PR #97 — Known repair recipes

The PR description documents versioned, allowlisted repair recipes for known incident signatures. The described flow checks the source run, reads failed-job logs, validates the target file and requires one exact text occurrence, then proposes a deterministic change on an isolated branch as a Draft PR. It explicitly states that the flow must not write directly to `main`.

The first documented recipe targeted the known `refreshCartDisplay is not defined` E2E failure by restoring an import in `src/js/features/app/click-delegation.js`. The PR description said the file was already correct at that time, so the recipe should activate only if that exact broken state returns.

## PR #100 — Dry Run

The PR description documents a manual simulation path that reuses incident intelligence, the recipe library, the source run, the target file at the failing SHA and the exact-occurrence guard. It reports what a real repair would do without creating a branch, commit or Draft PR, and says raw logs are not copied into the report.

## Safety contract to preserve

- No arbitrary AI-generated patch or shell execution from a recipe.
- Explicit recipe/signature allowlist and a unique, exact target match.
- Sensitive targets remain out of scope.
- Real repair remains isolated and proposed for review; Dry Run remains non-mutating.
- Neither path grants permission to merge automatically.

## Evidence boundary

The issue snapshots retrieved during this audit show the PR records as closed, but do not themselves expose the merge flag. This note records the declared design, not a fresh test run, active recipe trigger, or proof that every scenario currently passes.

## Safe resume

Inspect `.github/self-healing-recipes.json`, the current workflows and relevant tests on the live target branch before any reactivation. Do not dispatch a repair or create an external side effect as part of historical archiving.
