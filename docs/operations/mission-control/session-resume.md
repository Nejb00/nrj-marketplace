# NRJ Mission Control — Session Handoff

Use this at the start and end of a substantial session or when handing work to a parallel session.

## Start of session

- [ ] Find the mission in the [Notion register](https://app.notion.com/p/ccdef631312c4398aad6a059351ab02f).
- [ ] Read its matching note in `docs/operations/mission-control/`.
- [ ] Verify the real GitHub branch, HEAD SHA, dirty/clean status, PR, checks and deployment state as relevant.
- [ ] Check for other sessions touching the same branch/files/system.
- [ ] Confirm the archived next action is still correct; record any discrepancy before acting.

## End of session — copy this handoff block

```text
MISSION ID / TITLE:
STATUS (exact): Planned | In Progress | Blocked | Tests Passed | User Validated | Merged | Deployed | Archived
LAST VERIFIED (timestamp + timezone):
OWNER / SESSION:
BRANCH:
LATEST FULL COMMIT SHA:
PR / CHECK RUN / DEPLOYMENT / FIGMA / SUPABASE REFERENCES:

OBJECTIVE:
COMPLETED (with proof):
NOT COMPLETED:
DECISIONS TO PRESERVE:
RISKS / BLOCKERS:
TESTS RUN (command, result, commit):
SIDE EFFECTS / EXTERNAL CHANGES CONFIRMED:
NEXT ACTION (one concrete step):
FILES OR SYSTEMS TOUCHED:
PARALLEL SESSION CONFLICTS / HANDOFF NOTES:
```

## Handoff rules

- Write the same essential status and next action to Notion; keep the detailed record in this repo.
- Put full SHAs where available, not only abbreviations. Abbreviations may be included as quick hints.
- Link the exact PR, run, Figma file/version, or deployment record. Do not rely on a screenshot or chat claim alone when a system record is available.
- If no proof is available, explicitly say **unverified**.
- Do not set `User Validated` without the user's explicit approval.
- Do not set `Merged` without GitHub merge evidence.
- Do not set `Deployed` without checking the target environment and commit.
- Never put access tokens, credentials, environment files, private user/order data, or unredacted secrets in the handoff.
