import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Playwright uses the deployment URL and skips a local server for remote E2E", () => {
  const config = fs.readFileSync("playwright.config.mjs", "utf8");
  assert.match(config, /process\.env\.E2E_BASE_URL/);
  assert.match(config, /baseURL:\s*remoteBaseURL \|\| localBaseURL/);
  assert.match(config, /remoteBaseURL\s*\?\s*\{\}\s*:\s*\{/);
  assert.match(config, /webServer:/);
  assert.match(config, /localBaseURL\s*=\s*"http:\/\/127\.0\.0\.1:4173"/);
});
