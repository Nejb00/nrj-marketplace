import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/sync_to_notion.py', 'utf8');

test('Notion sync has rate-limit pacing and bounded 429 retries', () => {
  assert.match(source, /import time/);
  assert.match(source, /NOTION_MIN_REQUEST_INTERVAL\s*=\s*0\.4/);
  assert.match(source, /NOTION_RETRY_ATTEMPTS\s*=\s*6/);
  assert.match(source, /e\.code\s*!==?\s*429/);
  assert.match(source, /Retry-After/);
  assert.match(source, /NOTION_MAX_RETRY_DELAY/);
  assert.match(source, /time\.monotonic\(\)/);
  assert.match(source, /time\.sleep\(/);
});

test('Notion sync only retries rate limiting, not arbitrary HTTP failures', () => {
  const marker = 'if e.code != 429 or attempt == NOTION_RETRY_ATTEMPTS - 1:';
  assert.ok(source.includes(marker));
});
