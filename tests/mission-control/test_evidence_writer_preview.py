from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "mission-control" / "evidence_writer_preview.py"
WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "mission-control-evidence-writer-preview.yml"
VERCEL_CONFIG = Path(__file__).resolve().parents[2] / "vercel.json"
SPEC = importlib.util.spec_from_file_location("nrj_evidence_preview", SCRIPT)
writer = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(writer)

DATA_SOURCE = writer.DEFAULT_DATA_SOURCE_ID
PAGE_ID = "11111111-1111-4111-8111-111111111111"
EDITED = "2026-10-21T16:23:15.599Z"
REPO = writer.DEFAULT_REPOSITORY
ALIAS = "NRJ-OPS-004"
HEAD_SHA = "a" * 40
MERGE_SHA = "b" * 40
PR_URL = f"https://github.com/{REPO}/pull/219"
EVIDENCE_URL = f"https://github.com/{REPO}/commit/{MERGE_SHA}"


def text_property(value: str, kind: str = "rich_text") -> dict:
    return {
        "type": kind,
        kind: [{"type": "text", "plain_text": value, "text": {"content": value}}],
    }


def url_property(value: str | None) -> dict:
    return {"type": "url", "url": value}


def make_page(
    *,
    page_id: str = PAGE_ID,
    alias: str = ALIAS,
    edited: str = EDITED,
    parent_id: str = DATA_SOURCE,
    pr_url: str | None = None,
    evidence_url: str | None = None,
    branch_url: str | None = f"https://github.com/{REPO}/tree/feature/safe",
    pr_type: str = "url",
    evidence_type: str = "url",
) -> dict:
    props = {
        "Mission Alias": text_property(alias),
        "Branch URL": url_property(branch_url),
        "PR URL": {"type": pr_type, pr_type: pr_url} if pr_type != "url" else url_property(pr_url),
        "Evidence URL": {"type": evidence_type, evidence_type: evidence_url} if evidence_type != "url" else url_property(evidence_url),
    }
    return {
        "id": page_id,
        "url": f"https://www.notion.so/{page_id.replace('-', '')}",
        "last_edited_time": edited,
        "parent": {"type": "data_source_id", "data_source_id": parent_id},
        "properties": props,
    }


def make_pr(
    *,
    number: int = 219,
    base_repo: str = REPO,
    base_ref: str = "main",
    head_repo: str = REPO,
    head_ref: str = "feature/safe",
    head_sha: str = HEAD_SHA,
    merged_at: str | None = "2026-10-21T14:00:00Z",
    merge_sha: str = MERGE_SHA,
    html_url: str = PR_URL,
) -> dict:
    return {
        "number": number,
        "html_url": html_url,
        "merged_at": merged_at,
        "merge_commit_sha": merge_sha,
        "base": {"ref": base_ref, "repo": {"full_name": base_repo}},
        "head": {"ref": head_ref, "sha": head_sha, "repo": {"full_name": head_repo}},
    }


def build(**overrides) -> dict:
    options = {
        "rows": [make_page()],
        "fresh_page": make_page(),
        "pr": make_pr(),
        "alias": ALIAS,
        "repository": REPO,
        "data_source_id": DATA_SOURCE,
        "expected_page_id": PAGE_ID,
        "expected_last_edited_time": EDITED,
        "pr_number": 219,
        "expected_head_sha": HEAD_SHA,
    }
    options.update(overrides)
    return writer.build_plan(**options)


class EvidenceWriterPreviewTests(unittest.TestCase):
    def test_blank_urls_create_preview_only_proposal_for_two_allowlisted_fields(self) -> None:
        report = build()
        self.assertEqual(report["result"], "DRY_RUN_READY")
        self.assertEqual(report["proposed_updates"], ["PR URL", "Evidence URL"])
        self.assertEqual(set(report["properties"]), {"PR URL", "Evidence URL"})
        self.assertEqual(report["properties"]["PR URL"]["proposed"], PR_URL)
        self.assertEqual(report["properties"]["Evidence URL"]["proposed"], EVIDENCE_URL)
        self.assertFalse(report["write_attempted"])
        self.assertEqual(report["mode"], "preview_only")
        self.assertIn("no Notion page-write endpoint", report["safety_note"])

    def test_existing_matching_urls_are_idempotent_no_change(self) -> None:
        page = make_page(pr_url=PR_URL, evidence_url=EVIDENCE_URL)
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["result"], "NO_CHANGE")
        self.assertEqual(report["proposed_updates"], [])
        self.assertEqual(report["reason_code"], "ALREADY_MATCHES")

    def test_partial_matching_value_only_proposes_blank_field(self) -> None:
        page = make_page(pr_url=PR_URL, evidence_url=None)
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["result"], "DRY_RUN_READY")
        self.assertEqual(report["proposed_updates"], ["Evidence URL"])

    def test_conflicting_pr_url_blocks_both_fields(self) -> None:
        page = make_page(pr_url=f"https://github.com/{REPO}/pull/3", evidence_url=None)
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["result"], "CONFLICT")
        self.assertEqual(report["reason_code"], "PROPERTY_CONFLICT")
        self.assertEqual(report["proposed_updates"], [])
        self.assertEqual(report["conflict_properties"], ["PR URL"])

    def test_conflicting_evidence_url_blocks_both_fields(self) -> None:
        page = make_page(pr_url=None, evidence_url=f"https://github.com/{REPO}/commit/{'c' * 40}")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["result"], "CONFLICT")
        self.assertEqual(report["proposed_updates"], [])
        self.assertEqual(report["conflict_properties"], ["Evidence URL"])

    def test_duplicate_alias_fails_closed(self) -> None:
        rows = [make_page(), make_page(page_id="22222222-2222-4222-8222-222222222222", alias=" nrj-ops-004 ")]
        report = build(rows=rows)
        self.assertEqual(report["result"], "BLOCKED")
        self.assertEqual(report["reason_code"], "DUPLICATE_ALIAS")
        self.assertEqual(report["proposed_updates"], [])

    def test_missing_alias_fails_closed(self) -> None:
        report = build(rows=[make_page(alias="NRJ-OPS-005")])
        self.assertEqual(report["result"], "BLOCKED")
        self.assertEqual(report["reason_code"], "ALIAS_NOT_FOUND")

    def test_alias_must_have_exact_semantic_shape(self) -> None:
        report = build(alias="all")
        self.assertEqual(report["reason_code"], "INVALID_ALIAS")

    def test_wrong_page_id_fails_closed(self) -> None:
        report = build(expected_page_id="22222222-2222-4222-8222-222222222222")
        self.assertEqual(report["result"], "BLOCKED")
        self.assertEqual(report["reason_code"], "PAGE_ID_MISMATCH")

    def test_fresh_page_must_belong_to_exact_data_source(self) -> None:
        page = make_page(parent_id="33333333-3333-4333-8333-333333333333")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["reason_code"], "WRONG_DATA_SOURCE")

    def test_stale_last_edited_time_blocks_plan(self) -> None:
        page = make_page(edited="2026-10-21T16:23:16Z")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["reason_code"], "STALE_NOTION_PAGE")
        self.assertEqual(report["observed_last_edited_time"], "2026-10-21T16:23:16Z")
        self.assertEqual(report["proposed_updates"], [])

    def test_fresh_alias_change_blocks_plan(self) -> None:
        fresh = make_page(alias="NRJ-OPS-006")
        report = build(rows=[make_page()], fresh_page=fresh)
        self.assertEqual(report["reason_code"], "ALIAS_CHANGED")

    def test_page_read_failure_blocks_plan(self) -> None:
        report = build(fresh_page=None)
        self.assertEqual(report["reason_code"], "PAGE_READ_FAILED")

    def test_destination_properties_must_be_url_types(self) -> None:
        page = make_page(pr_type="rich_text")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["reason_code"], "INVALID_DESTINATION_PROPERTY_TYPE")

    def test_wrong_branch_link_blocks_plan(self) -> None:
        page = make_page(branch_url=f"https://github.com/{REPO}/tree/feature/other")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["reason_code"], "SOURCE_CONFLICT")

    def test_invalid_branch_link_blocks_plan(self) -> None:
        page = make_page(branch_url="https://example.org/not-a-branch")
        report = build(rows=[page], fresh_page=page)
        self.assertEqual(report["reason_code"], "INVALID_BRANCH_URL")

    def test_non_main_base_is_rejected(self) -> None:
        report = build(pr=make_pr(base_ref="develop"))
        self.assertEqual(report["reason_code"], "WRONG_PR_BASE")

    def test_wrong_base_or_head_repository_is_rejected(self) -> None:
        self.assertEqual(build(pr=make_pr(base_repo="someone/else"))["reason_code"], "WRONG_PR_BASE")
        self.assertEqual(build(pr=make_pr(head_repo="someone/else"))["reason_code"], "WRONG_PR_HEAD_REPOSITORY")

    def test_head_sha_mismatch_is_rejected(self) -> None:
        report = build(pr=make_pr(head_sha="c" * 40))
        self.assertEqual(report["reason_code"], "HEAD_SHA_MISMATCH")

    def test_pr_must_be_confirmed_merged_with_full_merge_sha(self) -> None:
        self.assertEqual(build(pr=make_pr(merged_at=None))["reason_code"], "PR_NOT_CONFIRMED_MERGED")
        self.assertEqual(build(pr=make_pr(merge_sha="not-a-sha"))["reason_code"], "PR_NOT_CONFIRMED_MERGED")

    def test_pr_identity_and_canonical_url_are_verified(self) -> None:
        self.assertEqual(build(pr=make_pr(number=220))["reason_code"], "PR_NUMBER_MISMATCH")
        self.assertEqual(build(pr=make_pr(html_url="https://example.org/pull/219"))["reason_code"], "NONCANONICAL_PR_URL")

    def test_report_contains_no_credentials_or_unrelated_properties(self) -> None:
        report = build()
        serialized = json_dumps(report)
        self.assertNotIn("NRJ_NOTION_EVIDENCE_WRITE_TOKEN", serialized)
        self.assertNotIn("Authorization", serialized)
        self.assertEqual(set(report["properties"]), {"PR URL", "Evidence URL"})

    def test_preview_report_files_are_machine_and_human_readable(self) -> None:
        import json
        report = build()
        with tempfile.TemporaryDirectory() as temp:
            md_path, json_path = writer.write_reports(report, Path(temp))
            self.assertIn("Preview only", md_path.read_text(encoding="utf-8"))
            saved = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertFalse(saved["write_attempted"])
            self.assertEqual(saved["result"], "DRY_RUN_READY")

    def test_cli_produces_preview_using_mocked_reads_only(self) -> None:
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            env = {
                "NRJ_NOTION_READ_TOKEN": "dummy-notion-read-token",
                "GITHUB_TOKEN": "dummy-github-token",
                "NOTION_DATA_SOURCE_ID": DATA_SOURCE,
                "GITHUB_REPOSITORY": REPO,
            }
            args = [
                "--alias", ALIAS, "--pr-number", "219",
                "--expected-head-sha", HEAD_SHA,
                "--expected-page-id", PAGE_ID,
                "--expected-notion-last-edited-time", EDITED,
                "--output-dir", temp,
            ]
            with patch.dict("os.environ", env):
                with (
                    patch.object(writer, "fetch_notion_rows", return_value=[make_page()]),
                    patch.object(writer, "notion_get", return_value=make_page()),
                    patch.object(writer, "fetch_pull_request", return_value=make_pr()),
                ):
                    result = writer.main(args)
            report_path = Path(temp) / "evidence-writer-preview.json"
            self.assertEqual(result, 0)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertFalse(report["write_attempted"])
            self.assertEqual(report["result"], "DRY_RUN_READY")

    def test_http_client_rejects_every_mutating_or_non_query_request(self) -> None:
        with self.assertRaises(ValueError):
            writer.api_request("https://api.notion.com/v1/pages/" + PAGE_ID, service="notion", token="dummy", method="PATCH", body={})
        with self.assertRaises(ValueError):
            writer.api_request("https://api.notion.com/v1/pages/" + PAGE_ID, service="notion", token="dummy", method="DELETE")
        with self.assertRaises(ValueError):
            writer.api_request("https://api.notion.com/v1/pages", service="notion", token="dummy", method="POST", body={})
        with self.assertRaises(ValueError):
            writer.api_request("https://api.github.com/repos/" + REPO + "/pulls", service="github", token="dummy", method="POST", body={})
        with self.assertRaises(ValueError):
            writer.api_request("https://evil.example/v1/pages", service="notion", token="dummy", method="GET")

    def test_only_the_notion_data_source_query_post_is_allowed(self) -> None:
        class FakeResponse:
            status = 200
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return b'{"results":[],"has_more":false}'

        with patch.object(writer, "urlopen", return_value=FakeResponse()) as open_mock:
            code, data = writer.api_request(
                f"https://api.notion.com/v1/data_sources/{DATA_SOURCE}/query",
                service="notion", token="dummy", method="POST", body={"page_size": 100},
            )
        self.assertEqual(code, 200)
        self.assertEqual(data["results"], [])
        self.assertEqual(open_mock.call_args.args[0].get_method(), "POST")

    def test_api_errors_never_echo_tokens(self) -> None:
        from urllib.error import HTTPError
        self.assertEqual(writer.normalise_id(PAGE_ID), PAGE_ID.replace("-", ""))
        self.assertIsNone(writer.parse_branch_url("https://evil.example/repo/tree/main", REPO))
        self.assertIsNotNone(writer.parse_branch_url(f"https://github.com/{REPO}/tree/feature/a", REPO))
        with patch.object(writer, "urlopen", side_effect=HTTPError("https://api.github.com/test", 403, "Forbidden", {}, None)):
            with self.assertRaises(writer.ApiError) as caught:
                writer.api_request("https://api.github.com/test", service="github", token="test-secret-token")
        self.assertNotIn("test-secret-token", str(caught.exception))
        self.assertNotIn("Authorization", str(caught.exception))

    def test_workflow_is_manual_main_only_and_read_only(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("github.ref != 'refs/heads/main'", text)
        self.assertIn("persist-credentials: false", text)
        self.assertNotIn("NRJ_NOTION_EVIDENCE_WRITE_TOKEN", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("pull-requests: write", text)
        self.assertNotIn("\n  push:", text)
        self.assertNotIn("\n  pull_request:", text)
        self.assertNotIn("\n  schedule:", text)
        for sha in (
            "11bd71901bbe5b1630ceea73d27597364c9af683",
            "a26af69be951a213d495a4c3e4e4022e16d87065",
            "ea165f8d65b6e75b540449e92b4886f43607fa02",
        ):
            self.assertIn(sha, text)

    def test_automation_only_branches_are_disabled_without_changing_rewrites(self) -> None:
        import json
        config = json.loads(VERCEL_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["rewrites"], [{
            "source": "/p/:id",
            "destination": "/api/og-product?id=:id",
        }])
        deployment_enabled = config["git"]["deploymentEnabled"]
        self.assertEqual(set(deployment_enabled), {
            "docs/phase-c-github-notion-writer-2026-10-21",
            "feat/mission-control-evidence-writer-2026-10-21",
        })
        self.assertTrue(all(value is False for value in deployment_enabled.values()))
        self.assertNotIn("main", deployment_enabled)

def json_dumps(value: object) -> str:
    import json
    return json.dumps(value, sort_keys=True)


if __name__ == "__main__":
    unittest.main()
