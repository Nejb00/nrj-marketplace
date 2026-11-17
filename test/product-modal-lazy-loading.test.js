import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('product modal is not statically imported by the initial application modules', async () => {
  const paths = [
    'src/js/features/app/app-init.js',
    'src/js/features/app/click-delegation.js',
    'src/js/features/app/header-actions.js',
    'src/js/services/search-dropdown.js'
  ];
  const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\}\s*from\s*['"][^'"]*product\/modal-render\.js['"]/,
      'product modal should stay out of the initial static module graph'
    );
  }

  assert.match(sources[0], /import\(['"]\.\.\/product\/modal-render\.js['"]\)/);
  assert.match(sources[1], /import\(['"]\.\.\/product\/modal-render\.js['"]\)/);
  assert.match(sources[2], /import\(['"]\.\.\/product\/modal-render\.js['"]\)/);
  assert.match(sources[3], /import\(['"]\.\.\/features\/product\/modal-render\.js['"]\)/);
});
