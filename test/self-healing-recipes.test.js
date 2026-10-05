import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const recipePath = path.join(repoRoot, '.github', 'self-healing-recipes.json');

function loadCatalog() {
  return JSON.parse(fs.readFileSync(recipePath, 'utf8'));
}

function countOccurrences(source, needle) {
  return needle === '' ? 0 : source.split(needle).length - 1;
}

function isForbiddenRecipePath(value) {
  const normalized = value.replaceAll('\\\\', '/').toLowerCase();
  const segments = normalized.split('/');
  const basename = segments.at(-1) || '';
  const forbiddenSegments = new Set(['.env', 'secrets', 'credentials', 'id_rsa']);
  const forbiddenExtensions = ['.pem', '.key', '.p12', '.pfx'];

  return segments.some(
    (segment) => forbiddenSegments.has(segment) || segment.startsWith('.env.')
  ) || forbiddenExtensions.some((extension) => basename.endsWith(extension));
}

test('catalogue self-healing: structure minimale valide', () => {
  const catalog = loadCatalog();

  assert.equal(catalog.version, 1);
  assert.ok(Array.isArray(catalog.recipes));
  assert.ok(catalog.recipes.length >= 1);

  for (const recipe of catalog.recipes) {
    assert.match(recipe.id, /^[a-z0-9-]+$/);
    assert.equal(typeof recipe.workflow, 'string');
    assert.ok(Array.isArray(recipe.signatures) && recipe.signatures.length >= 1);
    assert.equal(typeof recipe.path, 'string');
    assert.equal(typeof recipe.find, 'string');
    assert.equal(typeof recipe.replace, 'string');
    assert.equal(typeof recipe.title, 'string');
    assert.equal(typeof recipe.commit_message, 'string');
    assert.ok(Number.isFinite(Number(recipe.max_age_hours)));
    assert.ok(Number(recipe.max_age_hours) > 0);

    assert.notEqual(recipe.find, recipe.replace);
    assert.equal(isForbiddenRecipePath(recipe.path), false);
    assert.notEqual(recipe.path, '.github/workflows/self-healing.yml');
    assert.notEqual(recipe.path, '.github/self-healing-recipes.json');
  }
});

test('recette refreshCartDisplay: remplacement déterministe exact', () => {
  const recipe = loadCatalog().recipes.find(
    ({ id }) => id === 'e2e-missing-refresh-cart-display-import'
  );

  assert.ok(recipe, 'recette refreshCartDisplay absente du catalogue');

  const brokenSource =
    recipe.find +
    '\n' +
    'export function demo() {}\n';

  assert.equal(countOccurrences(brokenSource, recipe.find), 1);

  const repairedSource = brokenSource.replace(recipe.find, recipe.replace);

  assert.equal(
    countOccurrences(repairedSource, recipe.replace),
    1
  );
  assert.match(
    repairedSource,
    /import \{ refreshCartDisplay \} from ['"]..\/..\/services\/cart-panel\.js['"];/
  );
});

test('garde-fou: une recette ne doit jamais remplacer plusieurs occurrences', () => {
  const recipe = loadCatalog().recipes[0];
  const duplicated = recipe.find + recipe.find;

  assert.equal(countOccurrences(duplicated, recipe.find), 2);
  assert.notEqual(countOccurrences(duplicated, recipe.find), 1);
});

test('catalogue self-healing: gouvernance de bibliothèque', () => {
  const catalog = loadCatalog();
  const allowedWorkflows = new Set([
    'CI',
    'CodeQL',
    'Dependency Review',
    'Deployment Safety Net',
    'Vercel Browser E2E',
  ]);

  assert.equal(Number.isInteger(catalog.max_recipes), true);
  assert.ok(catalog.max_recipes > 0);
  assert.ok(catalog.max_recipes <= 32);
  assert.ok(catalog.recipes.length <= catalog.max_recipes);

  const ids = new Set();
  const recipeKeys = new Set();
  for (const recipe of catalog.recipes) {
    assert.equal(typeof recipe.enabled, 'boolean');
    assert.equal(allowedWorkflows.has(recipe.workflow), true);
    assert.equal(ids.has(recipe.id), false);
    ids.add(recipe.id);

    const key = [
      recipe.workflow,
      ...(recipe.signatures || []),
      recipe.path,
      recipe.find,
    ].join('\0');
    assert.equal(recipeKeys.has(key), false);
    recipeKeys.add(key);

    assert.ok(recipe.max_age_hours >= 1);
    assert.ok(recipe.max_age_hours <= 24);
    assert.ok(recipe.find.length <= 20000);
    assert.ok(recipe.replace.length <= 20000);
    assert.equal(recipe.path.startsWith('/'), false);
    assert.equal(recipe.path.includes('\\\\'), false);
    assert.equal(recipe.path.split('/').includes('..'), false);

    for (const signature of recipe.signatures) {
      assert.ok(signature.length > 0);
      assert.ok(signature.length <= 2000);
    }
  }
});
