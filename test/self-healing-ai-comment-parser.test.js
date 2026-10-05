import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('self-healing workflow: reads AI diagnosis from the bot comment dossier', () => {
  const workflow = fs.readFileSync('.github/workflows/self-healing.yml', 'utf8');

  assert.match(workflow, /const aiDiagnosisComment = \[\.\.\.comments\]/);
  assert.match(workflow, /comment\.user\?\.type === 'Bot'/);
  assert.match(workflow, /NRJ_AI_DIAGNOSIS_START/);
  assert.match(workflow, /NRJ_AI_DIAGNOSIS_END/);
  assert.doesNotMatch(
    workflow,
    /const aiDiagnosisMatch = issue\.body\?\.match\([\s\S]*nrj-ai-diagnosis/
  );
});
