import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW = ".github/workflows/vercel-browser-e2e.yml";

test("Vercel Browser E2E runs automatically only for production deployments", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");

  assert.equal(
    workflow.includes("github.event.deployment_status.state == 'success'"),
    true
  );
  assert.equal(
    workflow.includes("github.event.deployment.environment == 'Production'"),
    true
  );
  assert.equal(
    workflow.includes("github.event.deployment.environment == 'production'"),
    true
  );

  assert.equal(
    workflow.includes("github.event.deployment.environment == 'Preview'"),
    false
  );
  assert.equal(
    workflow.includes("github.event.deployment.environment == 'preview'"),
    false
  );

  assert.equal(
    workflow.includes("github.event_name == 'workflow_dispatch'"),
    true
  );
});
