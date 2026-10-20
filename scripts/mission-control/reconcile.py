#!/usr/bin/env python3
"""Read-only Notion/GitHub reconciliation for NRJ Mission Control.

This program intentionally contains no Notion write endpoint and never mutates
GitHub. It reads mission rows, branches, commit metadata, pull requests and
check-run summaries, then writes a Markdown/JSON report to a local folder.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen

NOTION_VERSION = "2025-09-03"
DEFAULT_DATA_SOURCE_ID = "de2fc4d0-3150-4811-acc0-80ce02e2c619"
DEFAULT_REPOSITORY = "Nejb00/nrj-marketplace"
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
SHA_PATTERN = re.compile(r"^(?:[0-9a-fA-F]{7,40})$")
ALLOWED_STATUSES = {
    "Planned", "In Progress", "Blocked", "Tests Passed",
    "User Validated", "Merged", "Deployed", "Archived",
}


class ApiError(RuntimeError):
    """Safe API error that never includes request headers or credential values."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def request_json(url: str, *, service: str, token: str, method: str = "GET",
                 body: dict | None = None) -> tuple[int, dict]:
    if service not in {"notion", "github"}:
        raise ValueError("Unknown API service")
    if method not in {"GET", "POST"}:
        raise ValueError("Read-only client only permits GET and query POST")
    if method == "POST" and not (
        service == "notion"
        and url.startswith("https://api.notion.com/v1/data_sources/")
        and url.endswith("/query")
    ):
        raise ValueError("POST is allowed only for the Notion data-source query endpoint")
    headers = {
        "Accept": "application/json",
        "User-Agent": "nrj-mission-control-reconciler/0.1",
        "Authorization": f"Bearer {token}",
    }
    if service == "notion":
        headers["Notion-Version"] = NOTION_VERSION
    else:
        headers["X-GitHub-Api-Version"] = "2022-11-28"
        headers["Accept"] = "application/vnd.github+json"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=25) as response:
            raw = response.read()
            return response.status, json.loads(raw.decode("utf-8") or "{}")
    except HTTPError as exc:
        if exc.code == 404:
            try:
                return 404, json.loads(exc.read().decode("utf-8") or "{}")
            except (UnicodeDecodeError, json.JSONDecodeError):
                return 404, {"message": "Not found"}
        raise ApiError(f"{service} API returned HTTP {exc.code}") from None
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ApiError(f"{service} API request failed ({type(exc).__name__})") from None


def property_text(prop: dict | None) -> str:
    """Flatten only text-like/select/status/url properties from Notion."""
    if not prop:
        return ""
    kind = prop.get("type")
    value = prop.get(kind, {}) if kind else {}
    if kind in {"title", "rich_text"}:
        return "".join(
            part.get("plain_text") or part.get("text", {}).get("content", "")
            for part in (value or [])
        ).strip()
    if kind in {"status", "select"}:
        return str((value or {}).get("name") or "").strip()
    if kind == "url":
        return str(value or "").strip()
    if kind == "number":
        return "" if value is None else str(value)
    if kind == "unique_id":
        if not value:
            return ""
        prefix = value.get("prefix") or ""
        number = value.get("number")
        return f"{prefix}-{number}" if prefix else str(number or "")
    return ""


def normalise_page(page: dict) -> dict:
    props = page.get("properties") or {}
    return {
        "page_id": page.get("id", ""),
        "notion_url": page.get("url", ""),
        "notion_last_edited_time": page.get("last_edited_time", ""),
        "alias": property_text(props.get("Mission Alias")),
        "title": property_text(props.get("Mission")),
        "status": property_text(props.get("Status")),
        "priority": property_text(props.get("Priority")),
        "branch_url": property_text(props.get("Branch URL")),
        "stored_ref": property_text(props.get("Commit / Ref")),
        "pr_url": property_text(props.get("PR URL")),
        "evidence_url": property_text(props.get("Evidence URL")),
        "next_action": property_text(props.get("Next Action")),
        "risks": property_text(props.get("Risks / Blockers")),
    }


def alias_key(alias: str) -> str:
    return " ".join((alias or "").strip().upper().split())


def duplicate_aliases(rows: list[dict]) -> set[str]:
    counts = Counter(alias_key(row.get("alias", "")) for row in rows if alias_key(row.get("alias", "")))
    return {alias for alias, count in counts.items() if count > 1}


def parse_branch_url(url: str, repository: str) -> str | None:
    parsed = urlsplit(url or "")
    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        return None
    if len(parts) < 4 or parts[2] != "tree":
        return None
    if f"{parts[0]}/{parts[1]}".lower() != repository.lower():
        return None
    branch = "/".join(parts[3:]).strip()
    return branch or None


def parse_pr_number(url: str, repository: str) -> int | None:
    parsed = urlsplit(url or "")
    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        return None
    if len(parts) != 4 or parts[2] != "pull":
        return None
    if f"{parts[0]}/{parts[1]}".lower() != repository.lower() or not parts[3].isdigit():
        return None
    return int(parts[3])


def finding(severity: str, code: str, message: str, proof_url: str = "") -> dict:
    return {"severity": severity, "code": code, "message": message, "proof_url": proof_url or None}


def github_url(repository: str, suffix: str) -> str:
    owner, name = repository.split("/", 1)
    return f"https://api.github.com/repos/{quote(owner)}/{quote(name)}/{suffix.lstrip('/')}"


def get_github(url: str, token: str) -> tuple[int, dict]:
    return request_json(url, service="github", token=token)


def fetch_notion_rows(token: str, data_source_id: str) -> list[dict]:
    """Query every page of the Notion source; POST is used only for /query."""
    rows: list[dict] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()
    url = f"https://api.notion.com/v1/data_sources/{quote(data_source_id, safe='')}/query"
    for _ in range(50):
        payload: dict = {"page_size": 100}
        if cursor:
            if cursor in seen_cursors:
                raise ApiError("Notion pagination cursor repeated; stopping safely")
            seen_cursors.add(cursor)
            payload["start_cursor"] = cursor
        code, result = request_json(url, service="notion", token=token, method="POST", body=payload)
        if code != 200:
            raise ApiError(f"Notion query returned HTTP {code}")
        rows.extend(result.get("results") or [])
        if not result.get("has_more"):
            return rows
        cursor = result.get("next_cursor")
        if not cursor:
            raise ApiError("Notion reported more rows without a pagination cursor")
    raise ApiError("Notion pagination exceeded 50 pages; stopping safely")


def inspect_mission(row: dict, repository: str, github_token: str) -> dict:
    result = dict(row)
    result["findings"] = []
    result["github"] = {"branch": None, "commit": None, "pull_request": None}
    alias = row.get("alias", "").strip()
    status = row.get("status", "").strip()
    if not alias:
        result["findings"].append(finding("error", "MISSING_ALIAS", "Mission Alias is empty; no automatic match is safe."))
    if status and status not in ALLOWED_STATUSES:
        result["findings"].append(finding("warning", "UNKNOWN_STATUS", f"Status '{status}' is not in the Mission Control status list.", row.get("notion_url", "")))
    elif not status:
        result["findings"].append(finding("warning", "MISSING_STATUS", "Notion status is empty.", row.get("notion_url", "")))

    branch = parse_branch_url(row.get("branch_url", ""), repository)
    if row.get("branch_url") and not branch:
        result["findings"].append(finding("warning", "INVALID_BRANCH_URL", "Branch URL is not a valid branch link for the configured repository.", row.get("branch_url", "")))
    elif branch:
        try:
            code, data = get_github(github_url(repository, f"branches/{quote(branch, safe='')}"), github_token)
            if code == 404:
                result["github"]["branch"] = {"name": branch, "exists": False}
                result["findings"].append(finding("warning", "BRANCH_NOT_FOUND", f"Referenced branch '{branch}' does not currently exist.", row.get("branch_url", "")))
            else:
                head_sha = (data.get("commit") or {}).get("sha", "")
                result["github"]["branch"] = {"name": branch, "exists": True, "head_sha": head_sha, "url": data.get("html_url", row.get("branch_url", ""))}
                stored = row.get("stored_ref", "").strip()
                if stored and SHA_PATTERN.fullmatch(stored) and head_sha and stored.lower() != head_sha.lower():
                    result["findings"].append(finding("info", "BRANCH_HEAD_DIFFERS", "The stored reference is not the branch's current HEAD; this can be intentional for historical records and is not automatically corrected.", row.get("branch_url", "")))
        except ApiError as exc:
            result["findings"].append(finding("error", "BRANCH_API_ERROR", str(exc), row.get("branch_url", "")))

    stored_ref = row.get("stored_ref", "").strip()
    if stored_ref:
        if not SHA_PATTERN.fullmatch(stored_ref):
            result["findings"].append(finding("warning", "INVALID_COMMIT_REF", "Commit / Ref is not a hexadecimal commit SHA; it was not requested from the API.", row.get("evidence_url", "")))
        else:
            try:
                code, commit = get_github(github_url(repository, f"commits/{quote(stored_ref, safe='')}"), github_token)
                if code == 404:
                    result["github"]["commit"] = {"exists": False, "ref": stored_ref}
                    result["findings"].append(finding("warning", "COMMIT_NOT_FOUND", "The stored commit/ref could not be found in this repository.", row.get("evidence_url", "")))
                else:
                    commit_data = commit.get("commit") or {}
                    result["github"]["commit"] = {
                        "exists": True,
                        "sha": commit.get("sha", ""),
                        "message": ((commit_data.get("message") or "").splitlines() or [""])[0],
                        "url": commit.get("html_url", ""),
                    }
            except ApiError as exc:
                result["findings"].append(finding("error", "COMMIT_API_ERROR", str(exc), row.get("evidence_url", "")))

    pr_number = parse_pr_number(row.get("pr_url", ""), repository)
    if row.get("pr_url") and pr_number is None:
        result["findings"].append(finding("warning", "INVALID_PR_URL", "PR URL is not a valid pull request link for the configured repository.", row.get("pr_url", "")))
    elif pr_number is not None:
        try:
            code, pr = get_github(github_url(repository, f"pulls/{pr_number}"), github_token)
            if code == 404:
                result["github"]["pull_request"] = {"number": pr_number, "exists": False}
                result["findings"].append(finding("warning", "PR_NOT_FOUND", f"Pull request #{pr_number} could not be found.", row.get("pr_url", "")))
            else:
                merged = bool(pr.get("merged_at"))
                head_sha = ((pr.get("head") or {}).get("sha") or "")
                result["github"]["pull_request"] = {
                    "number": pr_number, "exists": True, "state": pr.get("state"),
                    "merged": merged, "merged_at": pr.get("merged_at"),
                    "head_sha": head_sha, "head_branch": (pr.get("head") or {}).get("ref"),
                    "base_branch": (pr.get("base") or {}).get("ref"),
                    "merge_commit_sha": pr.get("merge_commit_sha"),
                    "url": pr.get("html_url", row.get("pr_url", "")),
                }
                if status == "Merged" and not merged:
                    result["findings"].append(finding("warning", "MERGED_STATUS_WITHOUT_MERGE_EVIDENCE", "Notion says Merged, but GitHub does not confirm a merge for the linked PR.", row.get("pr_url", "")))
                elif status not in {"Merged", "Deployed", "User Validated", "Archived"} and merged:
                    result["findings"].append(finding("warning", "MERGE_NOT_REFLECTED_IN_STATUS", f"GitHub confirms PR #{pr_number} is merged, while Notion status is '{status or 'empty'}'. No status was changed.", row.get("pr_url", "")))
                if head_sha:
                    try:
                        c_code, check_data = get_github(github_url(repository, f"commits/{quote(head_sha, safe='')}/check-runs?per_page=100"), github_token)
                        if c_code == 200:
                            checks = check_data.get("check_runs") or []
                            counts = Counter((check.get("conclusion") or check.get("status") or "unknown") for check in checks)
                            result["github"]["pull_request"]["checks"] = {
                                "head_sha": head_sha, "total": len(checks),
                                "conclusions": dict(sorted(counts.items())),
                                "all_completed_success": bool(checks) and all(check.get("status") == "completed" and check.get("conclusion") == "success" for check in checks),
                            }
                    except ApiError as exc:
                        result["findings"].append(finding("error", "CHECKS_API_ERROR", str(exc), row.get("pr_url", "")))
        except ApiError as exc:
            result["findings"].append(finding("error", "PR_API_ERROR", str(exc), row.get("pr_url", "")))
    elif status == "Merged":
        result["findings"].append(finding("warning", "MERGED_WITHOUT_PR_LINK", "Notion status is Merged but there is no PR URL to verify.", row.get("notion_url", "")))

    # A branch deleted after its linked PR was merged is normal housekeeping,
    # not reconciliation drift. Downgrade only when the PR head branch exactly
    # matches the missing branch URL; never infer deletion is harmless otherwise.
    live_branch = result["github"].get("branch") or {}
    live_pr = result["github"].get("pull_request") or {}
    if (
        live_branch.get("exists") is False
        and live_pr.get("exists")
        and live_pr.get("merged")
        and live_branch.get("name") == live_pr.get("head_branch")
    ):
        for item in result["findings"]:
            if item["code"] == "BRANCH_NOT_FOUND":
                item["severity"] = "info"
                item["code"] = "BRANCH_DELETED_AFTER_MERGE"
                item["message"] = "GitHub confirms the linked PR was merged and its matching source branch no longer exists; this is normal post-merge cleanup, not drift."

    if status == "Deployed":
        result["findings"].append(finding("info", "DEPLOYMENT_NOT_VERIFIED", "This first version does not query the deployment platform; Deployed cannot be independently confirmed here.", row.get("evidence_url", "")))
    if status == "User Validated":
        result["findings"].append(finding("info", "USER_VALIDATION_REMAINS_HUMAN", "User Validated is a human approval state and is never inferred from technical evidence.", row.get("notion_url", "")))

    severities = {item["severity"] for item in result["findings"]}
    if "error" in severities:
        result["result"] = "ERROR"
    elif "warning" in severities:
        result["result"] = "DRIFT_FOUND"
    else:
        result["result"] = "NO_CHANGE"
    return result


def make_report(rows: list[dict], repository: str, github_token: str, requested_alias: str = "all") -> dict:
    checked_at = utc_now()
    duplicates = duplicate_aliases(rows)
    selected = rows
    if requested_alias.strip().lower() != "all":
        wanted = alias_key(requested_alias)
        selected = [row for row in rows if alias_key(row.get("alias", "")) == wanted]
        if not selected:
            selected = [{
                "page_id": "", "notion_url": "", "notion_last_edited_time": "",
                "alias": requested_alias.strip(), "title": "", "status": "",
                "priority": "", "branch_url": "", "stored_ref": "", "pr_url": "",
                "evidence_url": "", "next_action": "", "risks": "",
                "findings": [finding("error", "ALIAS_NOT_FOUND", "No exact Mission Alias matched this request.")],
                "github": {}, "result": "BLOCKED",
            }]

    missions = []
    for row in selected:
        key = alias_key(row.get("alias", ""))
        if key and key in duplicates:
            record = dict(row)
            record["findings"] = [finding("error", "DUPLICATE_ALIAS", "More than one Notion row uses this Mission Alias; automated matching is blocked.", record.get("notion_url", ""))]
            record["github"] = {}
            record["result"] = "BLOCKED"
        elif row.get("findings") and row.get("result") == "BLOCKED":
            record = dict(row)
        else:
            record = inspect_mission(dict(row), repository, github_token)
        record["checked_at"] = checked_at
        missions.append(record)

    tally = Counter(item.get("result", "ERROR") for item in missions)
    overall = "ERROR" if tally["ERROR"] else ("BLOCKED" if tally["BLOCKED"] else ("DRIFT_FOUND" if tally["DRIFT_FOUND"] else "NO_CHANGE"))
    return {
        "report_version": 1, "read_only": True, "generated_at": checked_at,
        "repository": repository, "requested_alias": requested_alias,
        "notion_data_source_id": os.getenv("NOTION_DATA_SOURCE_ID", DEFAULT_DATA_SOURCE_ID),
        "notion_rows_loaded": len(rows), "alias_duplicates": sorted(duplicates),
        "overall_result": overall, "result_counts": dict(sorted(tally.items())),
        "missions": missions,
        "safety_note": "No Notion writes, GitHub writes, branch creation, PR creation, merges or deployments were performed.",
    }


def md_escape(value: object) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def write_reports(report: dict, output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "reconciliation.json"
    md_path = output_dir / "reconciliation.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# NRJ Mission Control — read-only reconciliation", "",
        f"- **Generated:** {report['generated_at']}",
        f"- **Repository:** [{report['repository']}](https://github.com/{report['repository']})",
        f"- **Scope:** {md_escape(report['requested_alias'])}",
        f"- **Notion rows loaded:** {report['notion_rows_loaded']}",
        f"- **Overall result:** {report['overall_result']}",
        f"- **Counts:** {json.dumps(report['result_counts'], sort_keys=True)}",
        "- **Mode:** read-only; no external mutations were performed.", "",
        "## Mission findings", "",
        "| Alias | Mission | Notion status | Reconciliation | Findings |",
        "|---|---|---|---|---|",
    ]
    for mission in report["missions"]:
        codes = ", ".join(item["code"] for item in mission.get("findings", [])) or "—"
        lines.append(f"| {md_escape(mission.get('alias'))} | {md_escape(mission.get('title'))} | {md_escape(mission.get('status'))} | {md_escape(mission.get('result'))} | {md_escape(codes)} |")
    for mission in report["missions"]:
        findings = mission.get("findings", [])
        if not findings:
            continue
        lines.extend(["", f"### {md_escape(mission.get('alias') or 'UNASSIGNED')} — {md_escape(mission.get('title'))}", ""])
        for item in findings:
            proof = f" ([evidence]({item['proof_url']}))" if item.get("proof_url") else ""
            lines.append(f"- **{item['severity'].upper()} · {item['code']}** — {md_escape(item['message'])}{proof}")
        gh = mission.get("github") or {}
        branch = gh.get("branch") or {}
        if branch.get("head_sha"):
            lines.append(f"- Observed branch HEAD: {branch['head_sha']} ([branch]({branch.get('url') or mission.get('branch_url')}))")
        commit = gh.get("commit") or {}
        if commit.get("sha"):
            lines.append(f"- Observed commit: {commit['sha']} ([commit]({commit.get('url')})) — {md_escape(commit.get('message'))}")
        pr = gh.get("pull_request") or {}
        if pr.get("exists"):
            lines.append(f"- Observed PR state: {'merged' if pr.get('merged') else pr.get('state')}; head {pr.get('head_sha') or 'n/a'} ([PR]({pr.get('url')}))")
            checks = pr.get("checks")
            if checks:
                lines.append(f"- Check runs on PR head: {checks['total']}; conclusions {json.dumps(checks['conclusions'], sort_keys=True)}; all-success {checks['all_completed_success']}")
    lines.extend(["", "## Safety and interpretation", "", report["safety_note"],
                  "A branch HEAD differing from a stored SHA is informational: historical records can deliberately refer to an earlier commit. This tool does not auto-correct fields or infer deployment/user approval.", ""])
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path, json_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alias", default="all", help="Exact Mission Alias to inspect, or 'all' (default).")
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", DEFAULT_REPOSITORY), help="GitHub owner/repo.")
    parser.add_argument("--output-dir", default="mission-control-report", help="Folder for Markdown and JSON reports.")
    args = parser.parse_args(argv)
    if not REPO_PATTERN.fullmatch(args.repo):
        parser.error("--repo must be an owner/repo pair.")
    notion_token = os.getenv("NRJ_NOTION_READ_TOKEN", "")
    github_token = os.getenv("GITHUB_TOKEN", "")
    if not notion_token:
        print("ERROR: NRJ_NOTION_READ_TOKEN is missing; no API request was made.", file=sys.stderr)
        return 2
    if not github_token:
        print("ERROR: GITHUB_TOKEN is missing; no API request was made.", file=sys.stderr)
        return 2
    try:
        source_id = os.getenv("NOTION_DATA_SOURCE_ID", DEFAULT_DATA_SOURCE_ID)
        pages = fetch_notion_rows(notion_token, source_id)
        rows = [normalise_page(page) for page in pages]
        report = make_report(rows, args.repo, github_token, args.alias)
    except ApiError as exc:
        print(f"ERROR: reconciliation stopped safely: {exc}", file=sys.stderr)
        return 2
    md_path, json_path = write_reports(report, Path(args.output_dir))
    print(f"Result: {report['overall_result']} | missions: {len(report['missions'])} | rows: {report['notion_rows_loaded']}")
    print(f"Markdown report: {md_path}")
    print(f"JSON report: {json_path}")
    print("Read-only run complete; no remote state was changed.")
    return 0 if report["overall_result"] in {"NO_CHANGE", "DRIFT_FOUND"} else 1


if __name__ == "__main__":
    raise SystemExit(main())