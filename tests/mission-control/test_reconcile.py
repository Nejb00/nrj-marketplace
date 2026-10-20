from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "mission-control" / "reconcile.py"
SPEC = importlib.util.spec_from_file_location("nrj_reconcile", SCRIPT)
reconcile = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(reconcile)


def notion_text(value: str, kind: str = "rich_text") -> dict:
    return {
        "type": kind,
        kind: [{"type": "text", "plain_text": value, "text": {"content": value}}],
    }


class MissionControlReconcilerTests(unittest.TestCase):
    def test_text_mapping_and_page_normalisation(self) -> None:
        page = {
            "id": "page-1",
            "url": "https://www.notion.so/page-1",
            "last_edited_time": "2026-10-20T07:00:00.000Z",
            "properties": {
                "Mission": notion_text("Mission title", "title"),
                "Mission Alias": notion_text("NRJ-OPS-004"),
                "Status": {"type": "status", "status": {"name": "In Progress"}},
                "Branch URL": {"type": "url", "url": "https://github.com/Nejb00/nrj-marketplace/tree/main"},
                "Commit / Ref": notion_text("a" * 40),
            },
        }
        row = reconcile.normalise_page(page)
        self.assertEqual(row["title"], "Mission title")
        self.assertEqual(row["alias"], "NRJ-OPS-004")
        self.assertEqual(row["status"], "In Progress")
        self.assertEqual(row["stored_ref"], "a" * 40)

    def test_alias_duplicates_are_case_and_space_insensitive(self) -> None:
        rows = [{"alias": "NRJ-OPS-004"}, {"alias": " nrj-ops-004 "}, {"alias": "NRJ-DES-001"}, {"alias": ""}]
        self.assertEqual(reconcile.duplicate_aliases(rows), {"NRJ-OPS-004"})

    def test_branch_parser_preserves_slashes_and_rejects_other_repos(self) -> None:
        url = "https://github.com/Nejb00/nrj-marketplace/tree/fix/liquid-glass-a11y-polish-2026-10-18"
        self.assertEqual(reconcile.parse_branch_url(url, "Nejb00/nrj-marketplace"), "fix/liquid-glass-a11y-polish-2026-10-18")
        self.assertIsNone(reconcile.parse_branch_url("https://example.com/Nejb00/nrj-marketplace/tree/main", "Nejb00/nrj-marketplace"))
        self.assertIsNone(reconcile.parse_branch_url("https://github.com/someone/other/tree/main", "Nejb00/nrj-marketplace"))

    def test_pull_request_parser_requires_exact_repo_and_number(self) -> None:
        self.assertEqual(reconcile.parse_pr_number("https://github.com/Nejb00/nrj-marketplace/pull/216", "Nejb00/nrj-marketplace"), 216)
        self.assertIsNone(reconcile.parse_pr_number("https://github.com/Nejb00/nrj-marketplace/pull/nope", "Nejb00/nrj-marketplace"))
        self.assertIsNone(reconcile.parse_pr_number("https://github.com/other/repo/pull/216", "Nejb00/nrj-marketplace"))

    def test_duplicate_alias_fails_closed_without_github_calls(self) -> None:
        rows = [
            {"alias": "NRJ-OPS-004", "title": "A", "status": "In Progress"},
            {"alias": " nrj-ops-004 ", "title": "B", "status": "In Progress"},
        ]
        with patch.object(reconcile, "inspect_mission") as inspect:
            report = reconcile.make_report(rows, "Nejb00/nrj-marketplace", "dummy", "all")
        inspect.assert_not_called()
        self.assertEqual(report["overall_result"], "BLOCKED")
        self.assertTrue(all(item["result"] == "BLOCKED" for item in report["missions"]))
        self.assertEqual(report["alias_duplicates"], ["NRJ-OPS-004"])

    def test_missing_requested_alias_blocks_report(self) -> None:
        report = reconcile.make_report([], "Nejb00/nrj-marketplace", "dummy", "NRJ-OPS-404")
        self.assertEqual(report["overall_result"], "BLOCKED")
        self.assertEqual(report["missions"][0]["findings"][0]["code"], "ALIAS_NOT_FOUND")

    def test_merged_status_requires_live_merge_evidence(self) -> None:
        sha = "a" * 40
        row = {
            "alias": "NRJ-OPS-004", "title": "Test", "status": "Merged",
            "branch_url": "", "stored_ref": "", "pr_url": "https://github.com/Nejb00/nrj-marketplace/pull/7",
            "evidence_url": "", "notion_url": "https://www.notion.so/page",
        }

        def fake_get(url: str, token: str):
            if url.endswith("/pulls/7"):
                return 200, {"state": "closed", "merged_at": None, "head": {"sha": sha}, "base": {"ref": "main"}, "html_url": row["pr_url"]}
            if url.endswith(f"/commits/{sha}/check-runs?per_page=100"):
                return 200, {"check_runs": []}
            raise AssertionError(f"Unexpected URL: {url}")

        with patch.object(reconcile, "get_github", side_effect=fake_get):
            observed = reconcile.inspect_mission(row, "Nejb00/nrj-marketplace", "dummy")
        self.assertEqual(observed["result"], "DRIFT_FOUND")
        self.assertIn("MERGED_STATUS_WITHOUT_MERGE_EVIDENCE", {item["code"] for item in observed["findings"]})

    def test_client_rejects_mutating_http_methods(self) -> None:
        with self.assertRaises(ValueError):
            reconcile.request_json("https://api.github.com", service="github", token="dummy", method="PATCH")
        with self.assertRaises(ValueError):
            reconcile.request_json("https://api.github.com/repos/Nejb00/nrj-marketplace/pulls", service="github", token="dummy", method="POST", body={})
        with self.assertRaises(ValueError):
            reconcile.request_json("https://api.notion.com/v1/pages", service="notion", token="dummy", method="POST", body={})

    def test_reports_are_machine_and_human_readable(self) -> None:
        report = {
            "generated_at": "2026-10-20T00:00:00Z", "read_only": True, "repository": "Nejb00/nrj-marketplace",
            "requested_alias": "all", "notion_rows_loaded": 0, "overall_result": "NO_CHANGE",
            "result_counts": {"NO_CHANGE": 0}, "missions": [], "safety_note": "Read-only.",
        }
        with tempfile.TemporaryDirectory() as temp:
            md_path, json_path = reconcile.write_reports(report, Path(temp))
            self.assertIn("read-only reconciliation", md_path.read_text(encoding="utf-8"))
            self.assertTrue(__import__("json").loads(json_path.read_text(encoding="utf-8"))["read_only"])


if __name__ == "__main__":
    unittest.main()