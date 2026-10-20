# Repository Agent Protocol — NRJ Mission Control

Before substantial work on this repository, read [Mission Control OS](docs/operations/mission-control/README.md) and the active mission note in `docs/operations/mission-control/active/` when one applies.

## Start every substantial session

1. Find the relevant mission in the [Notion hub](https://app.notion.com/p/3fd0f09830e181e6880de065b7853780?pvs=204) and [mission register](https://app.notion.com/p/ccdef631312c4398aad6a059351ab02f), if the Notion connector is available.
2. Read its matching GitHub mission note and most recent handoff.
3. Verify the real working-tree state, branch, full HEAD SHA, PR/check status and relevant external-system state before editing.
4. Check for parallel sessions. One session per branch by default; coordinate before touching the same files or resource.
5. If Notion is unavailable, do not pretend it was updated. Record a durable handoff in the mission note and report the Notion update as pending.

## While working

- Use a branch dedicated to the mission; avoid unrelated files and never silently overwrite another session's work.
- Record meaningful checkpoints, test results, exact commit refs, risks and next actions.
- Keep mission aliases consistent between the Notion `Mission Alias` property and GitHub note titles.
- Treat `Owner / Session` as a coordination signal, not a distributed lock.
- Never include secrets, credentials, tokens, private customer/order data or unredacted sensitive logs in mission notes.
- Keep local test results, user approval, GitHub merge state and deployed environment state distinct.

## End every substantial session

Update the Notion mission row and the relevant GitHub note with:
- last confirmed status and timestamp;
- work completed and evidence;
- work remaining and blockers;
- decisions to preserve;
- branch and full commit SHA;
- next concrete action;
- checks run and their actual results.

Use [session-resume.md](docs/operations/mission-control/session-resume.md) for the handoff format.

## Approval boundaries

- Do not modify or merge `main` without explicit user authorization.
- Do not open a PR, enable a preview, trigger a production deploy, make a purchase, enable live payment, or apply a migration unless it is in scope and authorized.
- Never infer `User Validated`, `Merged` or `Deployed` from a passing test alone.
- When archive and live system disagree, verify the live source, document the discrepancy, then update the archive deliberately.

This protocol does not grant additional permissions. If a required tool or source is unavailable, stop at the safe boundary and say what remains unverified.
