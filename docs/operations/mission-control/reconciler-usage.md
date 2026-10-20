# NRJ Mission Control read-only reconciler

## What it does

The manual GitHub Actions workflow compares the Notion Mission Register with live GitHub metadata and produces a Markdown report plus machine-readable JSON. It can inspect every mission or one exact Mission Alias. It checks alias uniqueness, branch existence/current HEAD, stored commit availability, pull-request merge evidence, and check-run summaries on the PR head SHA.

The first version is strictly read-only. It has no Notion page-update endpoint, no GitHub write permission, no schedule, no PR creation, no merge, and no deployment action. A branch HEAD differing from a stored SHA is informational because historical records can intentionally point to an earlier commit.

It does not yet verify deployments from Vercel or treat technical checks as user approval.

## Prerequisites before the first live run

1. Create a dedicated Notion integration with read-content access only.
2. Share only the NRJ Mission Register (or the narrowest parent/page access that allows reading the data source) with this integration.
3. Add its token in the GitHub repository settings as the Actions secret named NRJ_NOTION_READ_TOKEN. Never place the token in source code, issues, Notion notes, artifacts, terminal output, or chat.
4. Do not create write permissions or change the Notion schema for this phase.

The data source ID is configured as de2fc4d0-3150-4811-acc0-80ce02e2c619. It can be overridden through the NOTION_DATA_SOURCE_ID environment variable for testing.

## Run manually

After this workflow has been reviewed and merged through the normal repository approval path:

1. Open GitHub Actions and select **NRJ Mission Control Reconciliation (Read Only)**.
2. Choose **Run workflow**.
3. Use **all** to inspect the register, or provide one exact alias such as **NRJ-OPS-004**.
4. Download the run's artifact named **nrj-mission-control-reconciliation-<run id>**. It contains reconciliation.md and reconciliation.json and expires after 14 days.

The workflow is intentionally not scheduled. Do not add a schedule or any write path without a separate user approval.

## Local tests

Run the deterministic tests without any credentials or network calls:

~~~bash
python -m unittest discover -s tests/mission-control -v
~~~

Run the script manually with these environment variables only after a read-only Notion credential has been configured:

- NRJ_NOTION_READ_TOKEN
- GITHUB_TOKEN
- optional NOTION_DATA_SOURCE_ID
- optional GITHUB_REPOSITORY

## Report meanings

- **NO_CHANGE**: no mismatch requiring attention was detected by this first version.
- **DRIFT_FOUND**: one or more warnings need a human review; nothing was changed.
- **BLOCKED**: alias matching is missing or ambiguous; do not auto-match.
- **ERROR**: a required source could not be checked reliably.

Info-level findings (such as an archived record's stored SHA differing from today's branch HEAD) are not treated as drift by themselves. Any proposed correction must be reviewed and applied manually. The report does not claim that Vercel deployment is confirmed, and it never infers **User Validated**.