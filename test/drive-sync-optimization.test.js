const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflowPath = ".github/workflows/drive-sync.yml";
const scriptPath = "scripts/drive-sync.mjs";

test("Drive sync uses push + hourly schedule with concurrency", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /cron:\s*"17 \* \* \* \*"/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: false/);

  assert.equal(
    fs.existsSync(".github/workflows/gdrive-sync.yml"),
    false,
    "the legacy duplicate Drive workflow must stay removed"
  );
});

test("Drive sync avoids no-op state commits and protects deletion semantics", () => {
  const script = fs.readFileSync(scriptPath, "utf8");

  assert.match(script, /const stateChanged\s*=\n/);
  assert.match(
    script,
    /if \(stateChanged\) \{\s*const stateBuffer/s
  );
  assert.match(
    script,
    /Suppression côté GitHub : ne pas ressusciter silencieusement/
  );
  assert.match(
    script,
    /Suppression côté Drive : ne pas recréer silencieusement/
  );
  assert.match(
    script,
    /tree_sha: committed\.tree\.sha/
  );
  assert.equal(
    fs.existsSync("scripts/sync_to_gdrive.py"),
    false,
    "the legacy duplicate sync script must stay removed"
  );
});
