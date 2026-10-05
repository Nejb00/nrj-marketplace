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
    countOccurrences(repairedSource, recipe.find),
    0
  );
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
