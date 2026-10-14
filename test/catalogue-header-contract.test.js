import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalogue mode keeps the fixed search/category header visible', async () => {
  const [baseCss, clickDelegation, smartHeader] = await Promise.all([
    readFile('src/css/base/base.css', 'utf8'),
    readFile('src/js/features/app/click-delegation.js', 'utf8'),
    readFile('src/js/features/app/smart-header.js', 'utf8')
  ]);

  assert.match(clickDelegation, /syncCatalogueContentMode\('home'\)/);
  assert.doesNotMatch(baseCss, /body\.catalogue-content-only\s+#headerFixed\s*,\s*body\.catalogue-content-only\s+#headerSpacer/);
  assert.match(baseCss, /#headerSpacer\s*\{[^}]*height:\s*var\(--header-height,\s*132px\)/);
  assert.match(smartHeader, /spacer\.style\.height\s*=\s*total\s*\+\s*'px'/);
});
