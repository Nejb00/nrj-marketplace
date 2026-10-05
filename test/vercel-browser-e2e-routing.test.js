import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW = ".github/workflows/vercel-browser-e2e.yml";

test("Vercel Browser E2E runs automatically only for production deployments", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");

  assert.match(workflow, /github\.event\.deployment\.status\.state == 'success'/);
  assert.match(
    workflow,
    /github\.event\.deployment\.environment == 'Production'/
  );
  assert.match(
    workflow,
    /github\.event\.deployment\.environment == 'production'/
  );

  assert.doesNotMatch(
    workflow,
    /github\.event\.deployment\.environment == 'Preview'/
  );
  assert.doesNotMatch(
    workflow,
    /github\.event\.deployment\.environment == 'preview'/
  );

  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
});
