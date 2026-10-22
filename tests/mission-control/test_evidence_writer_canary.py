from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts" / "mission-control"
import sys
sys.path.insert(0, str(SCRIPTS))
import evidence_writer_canary as canary
import evidence_writer_preview as preview

CFG = canary.CANARY
REPO = canary.REPOSITORY
DS = canary.DATA_SOURCE_ID
PAGE_ID = CFG["page_id"]
EDITED = CFG["expected_last_edited_time"]
ALIAS = CFG["alias"]
HEAD = CFG["expected_head_sha"]
MERGE = CFG["expected_merge_sha"]
PR_NUMBER = CFG["pr_number"]
BRANCH = "docs/phase-4a-readme-fix-2026-10-21"
PR_URL = f"https://github.com/{REPO}/pull/{PR_NUMBER}"
EVIDENCE_URL = f"https://github.com/{REPO}/commit/{MERGE}"


def txt(value: str, kind: str = "rich_text") -> dict:
    return {"type": kind, kind: [{"type": "text", "plain_text": value, "text": {"content": value}}]}


def url(value: str | None) -> dict:
    return {"type": "url", "url": value}


def page(*, edited: str = EDITED, pr_url: str | None = None, evidence_url: str | None = None,
         branch_url: str | None = f"https://github.com/{REPO}/tree/{BRANCH}", alias: str = ALIAS,
         page_id: str = PAGE_ID, parent_id: str = DS) -> dict:
    return {
        "id": page_id,
        "url": f"https://www.notion.so/{page_id.replace('-', '')}",
        "last_edited_time": edited,
        "parent": {"type": "data_source_id", "data_source_id": parent_id},
        "properties": {
            "Mission Alias": txt(alias),
            "Branch URL": url(branch_url),
            "PR URL": url(pr_url),
            "Evidence URL": url(evidence_url),
        },
    }


def pr(*, merge_sha: str = MERGE, head_sha: str = HEAD, merged_at: str | None = "2026-10-21T21:35:24Z") -> dict:
    return {
        "number": PR_NUMBER,
        "html_url": PR_URL,
        "merged_at": merged_at,
        "merge_commit_sha": merge_sha,
        "base": {"ref": "main", "repo": {"full_name": REPO}},
        "head": {"ref": BRANCH, "sha": head_sha, "repo": {"full_name": REPO}},
    }


class EvidenceWriterCanaryTests(unittest.TestCase):
    def test_source_locks_exact_alias_page_pr_and_full_shas(self) -> None:
        self.assertEqual(ALIAS, "NRJ-OPS-005")
        self.assertEqual(PAGE_ID, "4000f098-30e1-81d4-a71a-f31f80bf2668")
        self.assertEqual(PR_NUMBER, 224)
        self.assertEqual(len(HEAD), 40)
        self.assertEqual(len(MERGE), 40)

    def test_missing_explicit_confirmation_makes_no_api_calls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = {"NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "must-not-print", "GITHUB_TOKEN": "read-token"}
            with patch.object(canary.preview, "fetch_notion_rows") as read_mock:
                report = canary.run_canary(env=env, output_dir=Path(tmp))
            self.assertEqual(report["reason_code"], "CONFIRMATION_MISSING")
            self.assertFalse(report["write_attempted"])
            read_mock.assert_not_called()
            rendered = (Path(tmp) / "evidence-writer-canary.json").read_text()
            self.assertNotIn("must-not-print", rendered)
            self.assertNotIn("read-token", rendered)

    def test_missing_dedicated_token_makes_no_api_calls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "GITHUB_TOKEN": "read-token"}
            with patch.object(canary.preview, "fetch_notion_rows") as read_mock:
                report = canary.run_canary(env=env, output_dir=Path(tmp))
            self.assertEqual(report["reason_code"], "DEDICATED_CREDENTIAL_MISSING")
            self.assertFalse(report["write_attempted"])
            read_mock.assert_not_called()

    def test_preflight_merge_sha_mismatch_never_patches(self) -> None:
        env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "w", "GITHUB_TOKEN": "g"}
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(canary.preview, "fetch_notion_rows", return_value=[page()]), \
             patch.object(canary.preview, "notion_get", return_value=page()), \
             patch.object(canary.preview, "fetch_pull_request", return_value=pr(merge_sha="c" * 40)), \
             patch.object(canary, "patch_notion_page_urls") as patch_mock:
            report = canary.run_canary(env=env, output_dir=Path(tmp))
        self.assertEqual(report["reason_code"], "MERGE_SHA_MISMATCH")
        self.assertFalse(report["write_attempted"])
        patch_mock.assert_not_called()

    def test_stale_final_reread_aborts_before_patch(self) -> None:
        env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "w", "GITHUB_TOKEN": "g"}
        changed = page(edited="2026-10-22T03:00:00.000Z")
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(canary.preview, "fetch_notion_rows", return_value=[page()]), \
             patch.object(canary.preview, "notion_get", side_effect=[page(), changed]), \
             patch.object(canary.preview, "fetch_pull_request", return_value=pr()), \
             patch.object(canary, "patch_notion_page_urls") as patch_mock:
            report = canary.run_canary(env=env, output_dir=Path(tmp))
        self.assertEqual(report["reason_code"], "STALE_NOTION_PAGE")
        self.assertFalse(report["write_attempted"])
        patch_mock.assert_not_called()

    def test_conflicting_nonempty_property_blocks_both_updates(self) -> None:
        env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "w", "GITHUB_TOKEN": "g"}
        bad = page(pr_url=f"https://github.com/{REPO}/pull/3")
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(canary.preview, "fetch_notion_rows", return_value=[bad]), \
             patch.object(canary.preview, "notion_get", return_value=bad), \
             patch.object(canary.preview, "fetch_pull_request", return_value=pr()), \
             patch.object(canary, "patch_notion_page_urls") as patch_mock:
            report = canary.run_canary(env=env, output_dir=Path(tmp))
        self.assertEqual(report["result"], "CONFLICT")
        self.assertFalse(report["write_attempted"])
        self.assertEqual(report["proposed_updates"], [])
        patch_mock.assert_not_called()

    def test_only_two_allowlisted_url_properties_can_be_patched(self) -> None:
        with self.assertRaises(ValueError):
            canary.patch_notion_page_urls("token", PAGE_ID, {"Status": "Merged"})
        with self.assertRaises(ValueError):
            canary.patch_notion_page_urls("token", "22222222-2222-4222-8222-222222222222", {"PR URL": PR_URL})
        with self.assertRaises(ValueError):
            canary.patch_notion_page_urls("token", PAGE_ID, {"PR URL": "https://example.org/evil"})

    def test_patch_request_contains_only_allowlisted_fields_and_correct_target(self) -> None:
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b'{"id":"4000f098-30e1-81d4-a71a-f31f80bf2668"}'
        with patch.object(canary, "urlopen", return_value=Response()) as open_mock:
            status, _ = canary.patch_notion_page_urls("not-real-token", PAGE_ID, {"PR URL": PR_URL, "Evidence URL": EVIDENCE_URL})
        request = open_mock.call_args.args[0]
        body = json.loads(request.data.decode())
        self.assertEqual(status, 200)
        self.assertEqual(request.get_method(), "PATCH")
        self.assertTrue(request.full_url.endswith("/v1/pages/4000f09830e181d4a71af31f80bf2668"))
        self.assertEqual(set(body), {"properties"})
        self.assertEqual(set(body["properties"]), {"PR URL", "Evidence URL"})
        self.assertTrue(all(set(v) == {"url"} for v in body["properties"].values()))

    def test_successful_canary_readback_verifies_both_urls_without_retries(self) -> None:
        env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "w-secret-not-for-output", "GITHUB_TOKEN": "g-secret-not-for-output"}
        readback = page(edited="2026-10-22T04:15:00.000Z", pr_url=PR_URL, evidence_url=EVIDENCE_URL)
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(canary.preview, "fetch_notion_rows", return_value=[page()]), \
             patch.object(canary.preview, "notion_get", side_effect=[page(), page(), readback]), \
             patch.object(canary.preview, "fetch_pull_request", return_value=pr()), \
             patch.object(canary, "patch_notion_page_urls", return_value=(200, {})) as patch_mock:
            report = canary.run_canary(env=env, output_dir=Path(tmp))
            md = (Path(tmp) / "evidence-writer-canary.md").read_text()
            saved = json.loads((Path(tmp) / "evidence-writer-canary.json").read_text())
        self.assertEqual(report["result"], "WRITE_APPLIED_VERIFIED")
        self.assertTrue(report["write_attempted"])
        self.assertTrue(report["readback_matches"])
        self.assertEqual(patch_mock.call_count, 1)
        self.assertEqual(set(patch_mock.call_args.args[2]), {"PR URL", "Evidence URL"})
        self.assertNotIn("w-secret-not-for-output", md + json.dumps(saved))
        self.assertNotIn("g-secret-not-for-output", md + json.dumps(saved))

    def test_transport_error_is_read_back_and_never_retried(self) -> None:
        env = {"NRJ_EVIDENCE_CANARY_CONFIRM": "YES", "NRJ_NOTION_EVIDENCE_WRITE_TOKEN": "w", "GITHUB_TOKEN": "g"}
        readback = page(edited="2026-10-22T04:15:00.000Z", pr_url=PR_URL, evidence_url=EVIDENCE_URL)
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(canary.preview, "fetch_notion_rows", return_value=[page()]), \
             patch.object(canary.preview, "notion_get", side_effect=[page(), page(), readback]), \
             patch.object(canary.preview, "fetch_pull_request", return_value=pr()), \
             patch.object(canary, "patch_notion_page_urls", side_effect=preview.ApiError("sanitized update error")) as patch_mock:
            report = canary.run_canary(env=env, output_dir=Path(tmp))
        self.assertEqual(report["result"], "WRITE_APPLIED_VERIFIED")
        self.assertTrue(report["write_attempted"])
        self.assertEqual(patch_mock.call_count, 1)

    def test_workflow_is_locked_manual_and_uses_protected_environment(self) -> None:
        text = (ROOT / ".github" / "workflows" / "mission-control-evidence-writer-canary.yml").read_text()
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("if: github.ref == 'refs/heads/main'", text)
        self.assertIn("environment:\n      name: mission-control-notion-evidence-write", text)
        self.assertIn("NRJ_NOTION_EVIDENCE_WRITE_TOKEN: ${{ secrets.NRJ_NOTION_EVIDENCE_WRITE_TOKEN }}", text)
        self.assertIn("name: Run the identity-locked canary once", text)
        self.assertIn("contents: read", text)
        self.assertIn("pull-requests: read", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("pull-requests: write", text)
        self.assertNotIn("\n  push:", text)
        self.assertNotIn("\n  schedule:", text)


if __name__ == "__main__":
    unittest.main()
