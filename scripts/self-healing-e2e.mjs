import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeIncident } from './incident-intelligence.mjs';
import {
  buildDiagnosisPrompt,
  validateDiagnosis,
} from './ai-assisted-diagnosis.mjs';
import { simulateRepair } from './self-healing-simulation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadRecipes() {
  const recipePath = path.join(repoRoot, '.github', 'self-healing-recipes.json');
  return JSON.parse(fs.readFileSync(recipePath, 'utf8')).recipes || [];
}

function createControlledIncident() {
  const recipes = loadRecipes();
  const recipe = recipes.find(({ id, enabled }) =>
    enabled !== false && id === 'e2e-missing-refresh-cart-display-import'
  );
  if (!recipe) throw new Error('Recette E2E contrôlée introuvable.');

  const run = {
    id: 900001,
    run_number: 9001,
    name: recipe.workflow,
    head_branch: 'main',
    head_sha: 'controlled-e2e-sha',
    conclusion: 'failure',
    updated_at: new Date().toISOString(),
  };

  const failedJobs = [{
    id: 900002,
    name: 'Controlled Self-Healing E2E',
    conclusion: 'failure',
  }];

  const logTexts = [
    'ReferenceError: refreshCartDisplay is not defined',
    'Controlled fixture: this failure is intentionally synthetic.',
  ];

  return { recipes, recipe, run, failedJobs, logTexts };
}

export function runSelfHealingE2E() {
  const { recipes, recipe, run, failedJobs, logTexts } = createControlledIncident();

  const intelligence = analyzeIncident({
    run,
    failedJobs,
    logTexts,
    recipes,
  });

  if (intelligence.classification !== 'known-repair-candidate') {
    throw new Error('E2E: Incident Intelligence n\'a pas reconnu la signature contrôlée.');
  }
  if (intelligence.recipe_id !== recipe.id) {
    throw new Error('E2E: mauvaise recette candidate.');
  }

  const prompt = buildDiagnosisPrompt({
    run,
    intelligence,
    failedJobs,
    logTexts,
    recipes,
  });

  if (prompt.includes(recipe.find) || prompt.includes(recipe.replace)) {
    throw new Error('E2E: le prompt IA contient un patch interdit.');
  }

  const aiFixture = JSON.stringify({
    schema_version: 1,
    classification: intelligence.classification,
    confidence: 0.99,
    likely_root_cause: 'Controlled fixture reproducing a known browser error signature.',
    recommended_recipe_id: intelligence.recipe_id,
    recommendation: 'self-healing',
    evidence: ['Controlled ReferenceError matches the recipe signature.'],
    uncertainties: ['Fixture is synthetic; no production impact.'],
    run_id: run.id,
    commit: run.head_sha,
  });

  const diagnosis = validateDiagnosis({
    responseText: aiFixture,
    intelligence,
    run,
    recipeIds: recipes.map(({ id }) => id),
  });

  if (diagnosis.status !== 'validated' || !diagnosis.deterministic_agreement) {
    throw new Error('E2E: diagnostic IA non validé.');
  }

  const current = recipe.find + '\n// controlled fixture body\n';
  const simulation = simulateRepair({
    recipe,
    run,
    path: recipe.path,
    current,
    findText: recipe.find,
    replaceText: recipe.replace,
  });

  if (!simulation.eligible || simulation.would_write || simulation.safety_result !== 'passed') {
    throw new Error('E2E: Dry Run a refusé une réparation contrôlée valide.');
  }

  const repaired = current.replace(recipe.find, recipe.replace);
  if (repaired === current || !repaired.includes(recipe.replace)) {
    throw new Error('E2E: transformation de réparation non reproduite.');
  }

  return {
    schema_version: 1,
    scenario: 'controlled-known-incident',
    stages: [
      'incident',
      'incident-intelligence',
      'ai-diagnosis',
      'deterministic-validation',
      'recipe-selection',
      'dry-run',
      'repair-plan',
    ],
    incident: {
      workflow: run.name,
      run_id: run.id,
      signature: intelligence.signature_matches[0]?.signature || null,
    },
    diagnosis: {
      status: diagnosis.status,
      confidence: diagnosis.confidence,
      recipe_id: diagnosis.recommended_recipe_id,
      deterministic_agreement: diagnosis.deterministic_agreement,
    },
    dry_run: {
      eligible: simulation.eligible,
      would_write: simulation.would_write,
      would_create_branch: simulation.would_create_branch,
      would_create_draft_pr: simulation.would_create_draft_pr,
      safety_result: simulation.safety_result,
    },
    repository_effect: 'fixture-only; no GitHub writes',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runSelfHealingE2E();
  console.log(JSON.stringify(result, null, 2));
}
