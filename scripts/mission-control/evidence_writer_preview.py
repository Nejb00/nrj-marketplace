#!/usr/bin/env python3
"""Prepare a verified GitHub-to-Notion evidence patch preview; never writes remotely.

This C-Implementation build is intentionally preview-only. The HTTP client allows
GET plus the Notion data-source query POST endpoint, but has no page-write path.
Live writes require a separately approved C-Canary implementation.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen

DEFAULT_REPOSITORY = "Nejb00/nrj-marketplace"
DEFAULT_DATA_SOURCE_ID = "de2fc4d0-3150-4811-acc0-80ce02e2c619"
NOTION_VERSION = "2025-09-03"
SHA40 = re.compile(r"^[0-9a-fA-F]{40}$")
ALIAS = re.compile(r"^NRJ-[A-Z]{3,4}-[0-9]{3}$")


class ApiError(RuntimeError):
    """Sanitized API error without credentials or request headers."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalise_id(value: str) -> str:
    compact = (value or "").replace("-", "").lower()
    return compact if re.fullmatch(r"[0-9a-f]{32}", compact) else ""


def alias_key(value: str) -> str:
    return " ".join((value or "").strip().upper().split())


def property_value(prop: dict[str, Any] | None, expected_type: str) -> tuple[bool, str]:
    """Return (correct_property_type, scalar value); preserve blank URL values."""
    if not isinstance(prop, dict) or prop.get("type") != expected_type:
        return False, ""
    value = prop.get(expected_type)
    if expected_type == "url":
        return True, str(value or "").strip()
    if expected_type == "title":
        return True, "".join(
            str(part.get("plain_text") or part.get("text", {}).get("content") or "")
            for part in (value or [])
        ).strip()
    if expected_type == "rich_text":
        return True, "".join(
            str(part.get("plain_text") or part.get("text", {}).get("content") or "")
            for part in (value or [])
        ).strip()
    return False, ""


def page_properties(page: dict[str, Any]) -> dict[str, Any]:
    return page.get("properties") if isinstance(page.get("properties"), dict) else {}


def page_alias(page: dict[str, Any]) -> str:
    props = page_properties(page)
    ok, value = property_value(props.get("Mission Alias"), "rich_text")
    if not ok:
        ok, value = property_value(props.get("Mission Alias"), "title")
    return value if ok else ""


def notion_parent_data_source(page: dict[str, Any]) -> str:
    parent = page.get("parent") or {}
    return str(parent.get("data_source_id") or "")


def parse_branch_url(value: str, repository: str) -> str | None:
    parsed = urlsplit(value or "")
    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        return None
    if len(parts) < 4 or parts[2] != "tree":
        return None
    if f"{parts[0]}/{parts[1]}".lower() != repository.lower():
        return None
    branch = "/".join(parts[3:]).strip()
    return branch or None


def api_request(
    url: str,
    *,
    service: str,
    token: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    """GET only, except Notion's read-only data-source query endpoint (POST)."""
    if service not in {"notion", "github"}:
        raise ValueError("Unknown API service")
    if not token or "\n" in token or "\r" in token:
        raise ValueError("API token is missing or invalid")
    parsed = urlsplit(url)
    expected_host = "api.notion.com" if service == "notion" else "api.github.com"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise ValueError("API URL host is not allowlisted")
    read_query_post = (
        service == "notion"
        and method == "POST"
        and parsed.path.startswith("/v1/data_sources/")
        and parsed.path.endswith("/query")
        and body is not None
    )
    if method != "GET" and not read_query_post:
        raise ValueError("Only GET and the Notion data-source query POST are allowed")
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nrj-mission-control-evidence-preview/0.1",
    }
    if service == "notion":
        headers["Notion-Version"] = NOTION_VERSION
    else:
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
            if not isinstance(payload, dict):
                raise ApiError(f"{service} API returned a non-object response")
            return response.status, payload
    except HTTPError as exc:
        if exc.code == 404:
            try:
                payload = json.loads(exc.read().decode("utf-8") or "{}")
                if isinstance(payload, dict):
                    return 404, payload
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass
            return 404, {"message": "Not found"}
        raise ApiError(f"{service} API returned HTTP {exc.code}") from None
    except ApiError:
        raise
    except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ApiError(f"{service} API request failed ({type(exc).__name__})") from None


def notion_get(token: str, path: str) -> dict[str, Any]:
    code, data = api_request(f"https://api.notion.com/v1/{path.lstrip('/')}", service="notion", token=token)
    if code != 200:
        raise ApiError(f"Notion API returned HTTP {code}")
    return data


def fetch_notion_rows(token: str, data_source_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    seen: set[str] = set()
    url = f"https://api.notion.com/v1/data_sources/{quote(data_source_id, safe='')}/query"
    for _ in range(50):
        body: dict[str, Any] = {"page_size": 100}
        if cursor:
            if cursor in seen:
                raise ApiError("Notion pagination cursor repeated; stopped safely")
            seen.add(cursor)
            body["start_cursor"] = cursor
        code, data = api_request(url, service="notion", token=token, method="POST", body=body)
        if code != 200:
            raise ApiError(f"Notion data-source query returned HTTP {code}")
        page_rows = data.get("results")
        if not isinstance(page_rows, list):
            raise ApiError("Notion data-source query returned an invalid result list")
        rows.extend(row for row in page_rows if isinstance(row, dict))
        if not data.get("has_more"):
            return rows
        cursor = data.get("next_cursor")
        if not isinstance(cursor, str) or not cursor:
            raise ApiError("Notion reported more rows without a valid cursor")
    raise ApiError("Notion pagination exceeded 50 pages; stopped safely")


def fetch_pull_request(token: str, repository: str, number: int) -> dict[str, Any]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Repository must be an owner/repository pair")
    if number < 1:
        raise ValueError("Pull request number must be positive")
    owner, name = repository.split("/", 1)
    url = f"https://api.github.com/repos/{quote(owner)}/{quote(name)}/pulls/{number}"
    code, data = api_request(url, service="github", token=token)
    if code != 200:
        raise ApiError(f"GitHub pull-request lookup returned HTTP {code}")
    return data


def blocked_report(
    *,
    alias: str,
    repo: str,
    data_source_id: str,
    page_id: str,
    expected_last_edited_time: str,
    result: str,
    reason_code: str,
    message: str,
    pr_number: int,
    expected_head_sha: str,
) -> dict[str, Any]:
    return {
        "report_version": 1,
        "generated_at": utc_now(),
        "mode": "preview_only",
        "write_attempted": False,
        "repository": repo,
        "notion_data_source_id": data_source_id,
        "alias": alias,
        "page_id": page_id or None,
        "expected_last_edited_time": expected_last_edited_time,
        "pr_number": pr_number,
        "expected_head_sha": expected_head_sha.lower(),
        "result": result,
        "reason_code": reason_code,
        "message": message,
        "source": {},
        "properties": {},
        "proposed_updates": [],
        "safety_note": "Preview only: no Notion page-write endpoint exists in this implementation.",
    }


def build_plan(
    *,
    rows: list[dict[str, Any]],
    fresh_page: dict[str, Any] | None,
    pr: dict[str, Any] | None,
    alias: str,
    repository: str,
    data_source_id: str,
    expected_page_id: str,
    expected_last_edited_time: str,
    pr_number: int,
    expected_head_sha: str,
) -> dict[str, Any]:
    """Pure preflight decision: computes a two-URL patch preview and never sends it."""
    def stop(result: str, code: str, message: str) -> dict[str, Any]:
        return blocked_report(
            alias=alias, repo=repository, data_source_id=data_source_id,
            page_id=expected_page_id, expected_last_edited_time=expected_last_edited_time,
            result=result, reason_code=code, message=message, pr_number=pr_number,
            expected_head_sha=expected_head_sha,
        )

    key = alias_key(alias)
    if not ALIAS.fullmatch(key):
        return stop("BLOCKED", "INVALID_ALIAS", "Supply one exact semantic Mission Alias.")
    if not SHA40.fullmatch(expected_head_sha):
        return stop("BLOCKED", "INVALID_EXPECTED_HEAD_SHA", "Expected head SHA must contain 40 hexadecimal characters.")
    if pr_number < 1:
        return stop("BLOCKED", "INVALID_PR_NUMBER", "Pull request number must be a positive integer.")
    if not normalise_id(expected_page_id):
        return stop("BLOCKED", "INVALID_EXPECTED_PAGE_ID", "Expected Notion page ID is missing or malformed.")
    if not expected_last_edited_time:
        return stop("BLOCKED", "MISSING_EXPECTED_TIMESTAMP", "A reviewed Notion last_edited_time is required.")

    matches = [row for row in rows if alias_key(page_alias(row)) == key]
    if len(matches) != 1:
        code = "ALIAS_NOT_FOUND" if not matches else "DUPLICATE_ALIAS"
        return stop("BLOCKED", code, "Alias must resolve to exactly one row in the complete data-source result.")
    queried = matches[0]
    if normalise_id(str(queried.get("id") or "")) != normalise_id(expected_page_id):
        return stop("BLOCKED", "PAGE_ID_MISMATCH", "The alias row does not match the reviewed expected page ID.")
    if notion_parent_data_source(queried) != data_source_id:
        return stop("BLOCKED", "WRONG_DATA_SOURCE", "The queried row does not belong to the configured Notion data source.")
    if not isinstance(fresh_page, dict):
        return stop("BLOCKED", "PAGE_READ_FAILED", "A fresh direct read of the exact Notion page is required.")
    if normalise_id(str(fresh_page.get("id") or "")) != normalise_id(expected_page_id):
        return stop("BLOCKED", "PAGE_ID_MISMATCH", "The fresh Notion page ID differs from the reviewed expected page ID.")
    if notion_parent_data_source(fresh_page) != data_source_id:
        return stop("BLOCKED", "WRONG_DATA_SOURCE", "The fresh Notion page parent differs from the configured data source.")
    if alias_key(page_alias(fresh_page)) != key:
        return stop("BLOCKED", "ALIAS_CHANGED", "The fresh page no longer has the reviewed mission alias.")
    observed_time = str(fresh_page.get("last_edited_time") or "")
    if observed_time != expected_last_edited_time:
        report = stop("BLOCKED", "STALE_NOTION_PAGE", "Page last_edited_time changed; run a new dry run and review again.")
        report["observed_last_edited_time"] = observed_time
        return report

    props = page_properties(fresh_page)
    pr_type_ok, current_pr_url = property_value(props.get("PR URL"), "url")
    evidence_type_ok, current_evidence_url = property_value(props.get("Evidence URL"), "url")
    if not pr_type_ok or not evidence_type_ok:
        return stop("BLOCKED", "INVALID_DESTINATION_PROPERTY_TYPE", "Both destination properties must exist as URL properties.")

    if not isinstance(pr, dict):
        return stop("BLOCKED", "PR_READ_FAILED", "A fresh GitHub pull-request read is required.")
    if pr.get("number") != pr_number:
        return stop("BLOCKED", "PR_NUMBER_MISMATCH", "GitHub returned a different pull-request number.")
    base = pr.get("base") or {}
    head = pr.get("head") or {}
    base_repo = (base.get("repo") or {}).get("full_name", "")
    head_repo = (head.get("repo") or {}).get("full_name", "")
    head_sha = str(head.get("sha") or "")
    head_ref = str(head.get("ref") or "")
    merge_sha = str(pr.get("merge_commit_sha") or "")
    canonical_pr_url = f"https://github.com/{repository}/pull/{pr_number}"
    if base_repo.lower() != repository.lower() or str(base.get("ref") or "") != "main":
        return stop("BLOCKED", "WRONG_PR_BASE", "PR must target main in the configured repository.")
    if head_repo.lower() != repository.lower():
        return stop("BLOCKED", "WRONG_PR_HEAD_REPOSITORY", "PR head must belong to the configured repository.")
    if not SHA40.fullmatch(head_sha) or head_sha.lower() != expected_head_sha.lower():
        return stop("BLOCKED", "HEAD_SHA_MISMATCH", "Live PR head SHA does not equal the reviewed full expected SHA.")
    if not pr.get("merged_at") or not SHA40.fullmatch(merge_sha):
        return stop("BLOCKED", "PR_NOT_CONFIRMED_MERGED", "GitHub must confirm merge time and a full merge commit SHA.")
    if (pr.get("html_url") or "") != canonical_pr_url:
        return stop("BLOCKED", "NONCANONICAL_PR_URL", "GitHub PR URL did not match the canonical repository URL.")
    branch_url = ""
    branch_type_ok, branch_url = property_value(props.get("Branch URL"), "url")
    if props.get("Branch URL") and not branch_type_ok:
        return stop("BLOCKED", "INVALID_BRANCH_PROPERTY_TYPE", "Branch URL must be a URL property when present.")
    if branch_type_ok and branch_url:
        branch = parse_branch_url(branch_url, repository)
        if not branch:
            return stop("BLOCKED", "INVALID_BRANCH_URL", "Branch URL is not a valid link to a branch in this repository.")
        if branch != head_ref:
            return stop("BLOCKED", "SOURCE_CONFLICT", "Mission Branch URL does not match the exact PR head branch.")

    canonical_evidence_url = f"https://github.com/{repository}/commit/{merge_sha.lower()}"
    targets = {"PR URL": canonical_pr_url, "Evidence URL": canonical_evidence_url}
    current = {"PR URL": current_pr_url, "Evidence URL": current_evidence_url}
    conflicts = [name for name in targets if current[name] and current[name] != targets[name]]
    report = {
        "report_version": 1,
        "generated_at": utc_now(),
        "mode": "preview_only",
        "write_attempted": False,
        "repository": repository,
        "notion_data_source_id": data_source_id,
        "alias": key,
        "page_id": expected_page_id,
        "expected_last_edited_time": expected_last_edited_time,
        "observed_last_edited_time": observed_time,
        "pr_number": pr_number,
        "expected_head_sha": expected_head_sha.lower(),
        "result": "CONFLICT" if conflicts else "NO_CHANGE",
        "reason_code": "PROPERTY_CONFLICT" if conflicts else "ALREADY_MATCHES",
        "message": "At least one non-empty destination differs; entire proposed update is blocked." if conflicts else "Both destination URLs already match; no update would be needed.",
        "source": {
            "pr_url": canonical_pr_url,
            "head_branch": head_ref,
            "head_sha": head_sha.lower(),
            "merged_at": str(pr.get("merged_at")),
            "merge_commit_sha": merge_sha.lower(),
            "evidence_url": canonical_evidence_url,
        },
        "properties": {
            name: {"current": current[name] or None, "proposed": targets[name], "type": "url"}
            for name in targets
        },
        "proposed_updates": [],
        "safety_note": "Preview only: no Notion page-write endpoint exists in this implementation.",
    }
    if conflicts:
        report["conflict_properties"] = conflicts
        return report
    updates = [name for name in targets if not current[name]]
    report["proposed_updates"] = updates
    if updates:
        report["result"] = "DRY_RUN_READY"
        report["reason_code"] = "PREVIEW_READY"
        report["message"] = "Preflight passed. The listed blank URL properties are proposed only; no write was sent."
    return report


def write_reports(report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "evidence-writer-preview.json"
    md_path = output_dir / "evidence-writer-preview.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# NRJ Mission Control — evidence writer preview", "",
        f"- **Generated:** {report.get('generated_at', '')}",
        f"- **Mode:** preview only",
        f"- **Alias:** {report.get('alias', '')}",
        f"- **Result:** {report.get('result', '')}",
        f"- **Reason:** {report.get('reason_code', '')}",
        f"- **Page ID:** {report.get('page_id') or 'n/a'}",
        f"- **PR:** {report.get('pr_number') or 'n/a'}",
        f"- **Expected head SHA:** {report.get('expected_head_sha') or 'n/a'}",
        "", report.get("message", ""), "",
        "## Allowlisted URL fields", "",
        "| Property | Current value | Proposed value |",
        "|---|---|---|",
    ]
    for name, value in (report.get("properties") or {}).items():
        current = value.get("current") or "(blank)"
        proposed = value.get("proposed") or "(none)"
        lines.append(f"| {name} | {current} | {proposed} |")
    lines.extend(["", "## Proposed update set", ""])
    lines.extend(f"- {name}" for name in report.get("proposed_updates") or [])
    if not report.get("proposed_updates"):
        lines.append("- (none)")
    source = report.get("source") or {}
    if source:
        lines.extend([
            "", "## Verified source evidence", "",
            f"- PR: {source.get('pr_url', '')}",
            f"- Head branch: {source.get('head_branch', '')}",
            f"- Head SHA: {source.get('head_sha', '')}",
            f"- Merged at: {source.get('merged_at', '')}",
            f"- Merge commit: {source.get('merge_commit_sha', '')}",
            f"- Evidence URL: {source.get('evidence_url', '')}",
        ])
    lines.extend(["", "## Safety", "", report.get("safety_note", ""),
                  "No live Notion page mutation is available in this implementation.", ""])
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path, json_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alias", required=True, help="One exact semantic Mission Alias; 'all' is not accepted.")
    parser.add_argument("--pr-number", required=True, type=int, help="Positive pull-request number.")
    parser.add_argument("--expected-head-sha", required=True, help="Reviewed full 40-character PR head SHA.")
    parser.add_argument("--expected-page-id", required=True, help="Reviewed Notion page ID.")
    parser.add_argument("--expected-notion-last-edited-time", required=True, help="Exact last_edited_time from reviewed dry-run.")
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", DEFAULT_REPOSITORY))
    parser.add_argument("--output-dir", default="mission-control-evidence-preview")
    args = parser.parse_args(argv)

    alias = alias_key(args.alias)
    if not ALIAS.fullmatch(alias):
        parser.error("--alias must be one exact alias like NRJ-OPS-004; 'all' is not accepted.")
    if args.pr_number < 1:
        parser.error("--pr-number must be positive.")
    if not SHA40.fullmatch(args.expected_head_sha):
        parser.error("--expected-head-sha must be exactly 40 hexadecimal characters.")
    if not normalise_id(args.expected_page_id):
        parser.error("--expected-page-id must be a Notion UUID.")
    if not args.expected_notion_last_edited_time:
        parser.error("--expected-notion-last-edited-time is required.")
    if args.repo != DEFAULT_REPOSITORY:
        parser.error(f"This writer is scoped to {DEFAULT_REPOSITORY} only.")

    notion_token = os.getenv("NRJ_NOTION_READ_TOKEN", "")
    github_token = os.getenv("GITHUB_TOKEN", "")
    if not notion_token or not github_token:
        print("BLOCKED: required read-only API token is missing; no API request was made.", file=sys.stderr)
        return 2

    data_source_id = os.getenv("NOTION_DATA_SOURCE_ID", DEFAULT_DATA_SOURCE_ID)
    try:
        if normalise_id(data_source_id) != normalise_id(DEFAULT_DATA_SOURCE_ID):
            raise ApiError("Configured Notion data source does not match the approved Mission Register")
        rows = fetch_notion_rows(notion_token, data_source_id)
        matches = [row for row in rows if alias_key(page_alias(row)) == alias]
        if len(matches) != 1:
            report = blocked_report(
                alias=alias, repo=args.repo, data_source_id=data_source_id,
                page_id=args.expected_page_id, expected_last_edited_time=args.expected_notion_last_edited_time,
                result="BLOCKED", reason_code="ALIAS_NOT_FOUND" if not matches else "DUPLICATE_ALIAS",
                message="Alias must resolve to exactly one row in the complete data-source result.",
                pr_number=args.pr_number, expected_head_sha=args.expected_head_sha,
            )
        else:
            fresh_page = notion_get(notion_token, f"pages/{quote(args.expected_page_id.replace('-', ''), safe='')}")
            pr = fetch_pull_request(github_token, args.repo, args.pr_number)
            report = build_plan(
                rows=rows, fresh_page=fresh_page, pr=pr, alias=alias,
                repository=args.repo, data_source_id=data_source_id,
                expected_page_id=args.expected_page_id,
                expected_last_edited_time=args.expected_notion_last_edited_time,
                pr_number=args.pr_number, expected_head_sha=args.expected_head_sha,
            )
    except (ApiError, ValueError) as exc:
        print(f"ERROR: preview stopped safely: {exc}", file=sys.stderr)
        return 2

    md_path, json_path = write_reports(report, Path(args.output_dir))
    print(f"Result: {report['result']} | alias: {alias} | proposed URL fields: {len(report.get('proposed_updates') or [])}")
    print(f"Markdown preview: {md_path}")
    print(f"JSON preview: {json_path}")
    print("Preview-only run complete; no Notion page mutation was attempted.")
    return 0 if report["result"] in {"DRY_RUN_READY", "NO_CHANGE"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
