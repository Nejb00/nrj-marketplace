#!/usr/bin/env python3
"""One-shot, identity-locked C-Canary for the NRJ Mission Control register.

This is intentionally not a general-purpose writer. The target alias, Notion page,
merged PR and both full SHAs are fixed in source. Activation also requires a
protected GitHub environment, a dedicated Notion token and explicit confirmation.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

_SCRIPT_DIR = str(Path(__file__).resolve().parent)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import evidence_writer_preview as preview  # noqa: E402

REPOSITORY = "Nejb00/nrj-marketplace"
DATA_SOURCE_ID = "de2fc4d0-3150-4811-acc0-80ce02e2c619"
CANARY = {
    "alias": "NRJ-OPS-005",
    "page_id": "4000f098-30e1-81d4-a71a-f31f80bf2668",
    "expected_last_edited_time": "2026-10-21T21:49:27.689Z",
    "pr_number": 224,
    "expected_head_sha": "a741ea4276894d3b66f469b42d74cf6d7ace608b",
    "expected_merge_sha": "56b9b2d4c6f85cee3d0c786fbe0c9d636890c97d",
}
TARGET_PROPERTIES = {"PR URL", "Evidence URL"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def base_report() -> dict[str, Any]:
    return {
        "report_version": 1,
        "generated_at": utc_now(),
        "mode": "single_canary",
        "write_attempted": False,
        "repository": REPOSITORY,
        "notion_data_source_id": DATA_SOURCE_ID,
        "alias": CANARY["alias"],
        "page_id": CANARY["page_id"],
        "expected_last_edited_time": CANARY["expected_last_edited_time"],
        "pr_number": CANARY["pr_number"],
        "expected_head_sha": CANARY["expected_head_sha"],
        "expected_merge_sha": CANARY["expected_merge_sha"],
        "result": "BLOCKED",
        "reason_code": "NOT_STARTED",
        "message": "No page-write request was attempted.",
        "source": {},
        "properties": {},
        "proposed_updates": [],
        "safety_note": (
            "One-shot canary locked to NRJ-OPS-005 / Notion page 4000f098… / PR #224. "
            "Only blank PR URL and Evidence URL can be filled; no status or other field is allowed."
        ),
    }


def _get_url(page: dict[str, Any], name: str) -> str:
    ok, value = preview.property_value(preview.page_properties(page).get(name), "url")
    if not ok:
        raise preview.ApiError("Read-back URL property has an invalid type")
    return value


def patch_notion_page_urls(token: str, page_id: str, updates: dict[str, str]) -> tuple[int, dict[str, Any]]:
    """Send the only allowed mutation: PATCH one fixed page with validated URL fields."""
    if preview.normalise_id(page_id) != preview.normalise_id(CANARY["page_id"]):
        raise ValueError("Notion target does not match the locked canary page")
    if not isinstance(updates, dict) or not updates or set(updates) - TARGET_PROPERTIES:
        raise ValueError("Only PR URL and Evidence URL may be included in a non-empty update")
    expected_values = {
        "PR URL": f"https://github.com/{REPOSITORY}/pull/{CANARY['pr_number']}",
        "Evidence URL": f"https://github.com/{REPOSITORY}/commit/{CANARY['expected_merge_sha']}",
    }
    if any(value != expected_values.get(name) for name, value in updates.items()):
        raise ValueError("A proposed URL does not match the locked canary evidence")
    if not token or "\n" in token or "\r" in token:
        raise ValueError("Dedicated Notion write token is missing or invalid")

    page_id_compact = preview.normalise_id(page_id)
    url = f"https://api.notion.com/v1/pages/{quote(page_id_compact, safe='')}"
    payload = {"properties": {name: {"url": value} for name, value in updates.items()}}
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Notion-Version": preview.NOTION_VERSION,
            "Content-Type": "application/json",
            "User-Agent": "nrj-mission-control-evidence-canary/0.1",
        },
        method="PATCH",
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8") or "{}"
            data = json.loads(raw)
            if response.status != 200 or not isinstance(data, dict):
                raise preview.ApiError("Notion page update returned an unexpected response")
            return response.status, data
    except HTTPError as exc:
        # The mutation outcome can be uncertain even after an HTTP error; callers must read back.
        raise preview.ApiError(f"Notion page update returned HTTP {exc.code}; outcome requires read-back") from None
    except preview.ApiError:
        raise
    except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise preview.ApiError(
            f"Notion page update response was unavailable ({type(exc).__name__}); outcome requires read-back"
        ) from None


def write_report(report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "evidence-writer-canary.json"
    md_path = output_dir / "evidence-writer-canary.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pr_link = (report.get("source", {}).get("pr_url") or f"https://github.com/{REPOSITORY}/pull/{CANARY['pr_number']}")
    lines = [
        "# NRJ Mission Control — single canary result", "",
        f"- Generated: {report.get('generated_at', '')}",
        f"- Mode: {report.get('mode', 'single_canary')}",
        f"- Result: **{report.get('result', 'ERROR')}**",
        f"- Reason: `{report.get('reason_code', '')}`",
        f"- Write attempted: `{str(bool(report.get('write_attempted'))).lower()}`",
        f"- Alias: `{report.get('alias', '')}`",
        f"- Page ID: `{report.get('page_id', '')}`",
        f"- Expected last_edited_time: `{report.get('expected_last_edited_time', '')}`",
        f"- PR: {pr_link}",
        f"- Head SHA: `{report.get('source', {}).get('head_sha', CANARY['expected_head_sha'])}`",
        f"- Merge SHA: `{report.get('source', {}).get('merge_commit_sha', CANARY['expected_merge_sha'])}`",
        "", report.get("message", ""), "",
        "## Allowlisted URL properties", "",
        "| Property | Before | Target |", "|---|---|---|",
    ]
    for name, value in (report.get("properties") or {}).items():
        before = value.get("current") or "(blank)"
        target = value.get("proposed") or "(none)"
        lines.append(f"| {name} | {before} | {target} |")
    lines.extend([
        "", "## Verification", "",
        f"- Read-back matched targets: `{str(bool(report.get('readback_matches'))).lower()}`",
        f"- Read-back last_edited_time: `{report.get('readback_last_edited_time') or 'not available'}`",
        f"- HTTP status: `{report.get('write_http_status') or 'not available'}`",
        "", "## Safety", "", report.get("safety_note", ""),
        "No credential, authorization header or unrelated Notion properties are included in this artifact.", "",
    ])
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path, json_path


def run_canary(env: dict[str, str] | None = None, output_dir: Path | None = None) -> dict[str, Any]:
    env = os.environ if env is None else env
    output_dir = Path(output_dir or env.get("NRJ_EVIDENCE_CANARY_OUTPUT_DIR", "mission-control-evidence-canary"))
    report = base_report()
    attempted = False
    write_token = env.get("NRJ_NOTION_EVIDENCE_WRITE_TOKEN", "")
    github_token = env.get("GITHUB_TOKEN", "")

    if env.get("NRJ_EVIDENCE_CANARY_CONFIRM", "") != "YES":
        report.update(result="BLOCKED", reason_code="CONFIRMATION_MISSING", message="Explicit canary confirmation was not supplied; no API request was made.")
        write_report(report, output_dir)
        return report
    if not write_token or not github_token:
        report.update(result="BLOCKED", reason_code="DEDICATED_CREDENTIAL_MISSING", message="A dedicated Notion update-capable token and GitHub read token are both required; no API request was made.")
        write_report(report, output_dir)
        return report
    if env.get("NOTION_DATA_SOURCE_ID", DATA_SOURCE_ID) != DATA_SOURCE_ID:
        report.update(result="BLOCKED", reason_code="WRONG_DATA_SOURCE_CONFIG", message="Configured data source differs from the locked Mission Register; no API request was made.")
        write_report(report, output_dir)
        return report
    if env.get("GITHUB_REPOSITORY", REPOSITORY) != REPOSITORY:
        report.update(result="BLOCKED", reason_code="WRONG_REPOSITORY_CONFIG", message="Workflow repository differs from the locked repository; no API request was made.")
        write_report(report, output_dir)
        return report

    page_api_path = f"pages/{quote(CANARY['page_id'].replace('-', ''), safe='')}"
    try:
        rows = preview.fetch_notion_rows(write_token, DATA_SOURCE_ID)
        matches = [row for row in rows if preview.alias_key(preview.page_alias(row)) == CANARY["alias"]]
        if len(matches) != 1:
            code = "ALIAS_NOT_FOUND" if not matches else "DUPLICATE_ALIAS"
            report.update(result="BLOCKED", reason_code=code, message="Locked alias must resolve exactly once in the complete data source.")
            write_report(report, output_dir)
            return report
        queried = matches[0]
        if preview.normalise_id(str(queried.get("id") or "")) != preview.normalise_id(CANARY["page_id"]):
            report.update(result="BLOCKED", reason_code="PAGE_ID_MISMATCH", message="Locked alias resolved to a different Notion page.")
            write_report(report, output_dir)
            return report

        fresh_page = preview.notion_get(write_token, page_api_path)
        pr = preview.fetch_pull_request(github_token, REPOSITORY, CANARY["pr_number"])
        actual_merge_sha = str(pr.get("merge_commit_sha") or "").lower()
        if actual_merge_sha != CANARY["expected_merge_sha"]:
            report.update(result="BLOCKED", reason_code="MERGE_SHA_MISMATCH", message="The live PR merge SHA no longer matches the locked, reviewed canary identity.")
            write_report(report, output_dir)
            return report

        plan = preview.build_plan(
            rows=rows, fresh_page=fresh_page, pr=pr, alias=CANARY["alias"],
            repository=REPOSITORY, data_source_id=DATA_SOURCE_ID,
            expected_page_id=CANARY["page_id"],
            expected_last_edited_time=CANARY["expected_last_edited_time"],
            pr_number=CANARY["pr_number"], expected_head_sha=CANARY["expected_head_sha"],
        )
        report.update(plan)
        report["mode"] = "single_canary"
        report["expected_merge_sha"] = CANARY["expected_merge_sha"]
        report["write_attempted"] = False
        report["safety_note"] = base_report()["safety_note"]
        if report.get("result") not in {"DRY_RUN_READY", "NO_CHANGE"}:
            write_report(report, output_dir)
            return report
        if report.get("source", {}).get("merge_commit_sha", "").lower() != CANARY["expected_merge_sha"]:
            report.update(result="BLOCKED", reason_code="MERGE_SHA_MISMATCH", message="Preflight merge evidence differs from the exact locked merge SHA.")
            write_report(report, output_dir)
            return report
        if report["result"] == "NO_CHANGE":
            report["message"] = "Both URLs already match verified evidence; no PATCH was sent."
            write_report(report, output_dir)
            return report

        # Optimistic stale-write guard: re-read immediately before PATCH.
        fresh_before_write = preview.notion_get(write_token, page_api_path)
        second_plan = preview.build_plan(
            rows=rows, fresh_page=fresh_before_write, pr=pr, alias=CANARY["alias"],
            repository=REPOSITORY, data_source_id=DATA_SOURCE_ID,
            expected_page_id=CANARY["page_id"],
            expected_last_edited_time=CANARY["expected_last_edited_time"],
            pr_number=CANARY["pr_number"], expected_head_sha=CANARY["expected_head_sha"],
        )
        if second_plan.get("result") == "NO_CHANGE":
            report.update(second_plan)
            report.update(mode="single_canary", result="NO_CHANGE", reason_code="ALREADY_MATCHES_ON_REREAD", write_attempted=False,
                          message="Both properties already match at the final pre-write read; no PATCH was sent.")
            write_report(report, output_dir)
            return report
        if second_plan.get("result") != "DRY_RUN_READY":
            report.update(result=second_plan.get("result", "BLOCKED"), reason_code=second_plan.get("reason_code", "FINAL_READ_BLOCKED"),
                          message="Final pre-write read no longer passes the exact preflight; no PATCH was sent.", write_attempted=False)
            report["observed_last_edited_time"] = second_plan.get("observed_last_edited_time")
            write_report(report, output_dir)
            return report

        updates = {name: second_plan["properties"][name]["proposed"] for name in second_plan["proposed_updates"]}
        # Mark the attempt immediately before the one and only PATCH. Never retry it.
        attempted = True
        report["write_attempted"] = True
        try:
            http_status, _ = patch_notion_page_urls(write_token, CANARY["page_id"], updates)
            report["write_http_status"] = http_status
        except (preview.ApiError, ValueError) as exc:
            report["write_error_class"] = type(exc).__name__
            # Even a failed HTTP exchange might have reached Notion; read back instead of retrying.

        try:
            readback = preview.notion_get(write_token, page_api_path)
            readback_values = {name: _get_url(readback, name) for name in TARGET_PROPERTIES}
            expected_values = {
                "PR URL": f"https://github.com/{REPOSITORY}/pull/{CANARY['pr_number']}",
                "Evidence URL": f"https://github.com/{REPOSITORY}/commit/{CANARY['expected_merge_sha']}",
            }
            matches_targets = all(readback_values[name] == expected_values[name] for name in TARGET_PROPERTIES)
            report["readback_matches"] = matches_targets
            report["readback_last_edited_time"] = str(readback.get("last_edited_time") or "")
            report["properties"] = {
                name: {"current": _get_url(fresh_page, name) or None, "proposed": expected_values[name], "type": "url"}
                for name in TARGET_PROPERTIES
            }
            if matches_targets:
                report.update(result="WRITE_APPLIED_VERIFIED", reason_code="READBACK_VERIFIED",
                              message="A single PATCH was followed by a fresh read confirming both exact target URLs.")
            else:
                report.update(result="WRITE_OUTCOME_UNCERTAIN", reason_code="READBACK_MISMATCH",
                              message="The post-write read did not confirm both exact target URLs. No retry was attempted.")
        except (preview.ApiError, ValueError, KeyError, TypeError) as exc:
            report.update(result="WRITE_OUTCOME_UNCERTAIN", reason_code="READBACK_UNAVAILABLE",
                          message="The PATCH may have reached Notion, but the read-back could not confirm the outcome. No retry was attempted.",
                          readback_matches=False, readback_error_class=type(exc).__name__)
        write_report(report, output_dir)
        return report
    except (preview.ApiError, ValueError) as exc:
        report.update(result="WRITE_OUTCOME_UNCERTAIN" if attempted else "ERROR",
                      reason_code="REQUEST_OR_PREFLIGHT_ERROR",
                      message=("An API operation failed after a PATCH was attempted; no retry was made." if attempted else "Canary preflight failed before any write attempt."),
                      write_attempted=attempted, error_class=type(exc).__name__)
        write_report(report, output_dir)
        return report


def main() -> int:
    report = run_canary()
    print(f"Result: {report['result']} | alias: {report['alias']} | write_attempted: {str(report['write_attempted']).lower()}")
    print("Canary details are in the redacted JSON/Markdown artifact; credential values are never printed.")
    return 0 if report["result"] in {"WRITE_APPLIED_VERIFIED", "NO_CHANGE"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
