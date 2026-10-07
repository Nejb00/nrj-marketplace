import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeIntegritySnapshot,
  extractIntegrityMatches,
} from '../scripts/data-integrity.mjs';

test('integrity analyzer accepts a clean relational snapshot', () => {
  const report = analyzeIntegritySnapshot({
    duplicates: [],
    orphans: [],
  });

  assert.deepEqual(report, {
    schema_version: 1,
    status: 'healthy',
    duplicate_count: 0,
    orphan_count: 0,
    duplicate_matches: [],
    orphan_matches: [],
    malformed_snapshot: false,
  });
});

test('integrity analyzer detects duplicate groups without exposing row contents', () => {
  const report = analyzeIntegritySnapshot({
    duplicates: [
      { check_name: 'payment_order_live_duplicates', row_count: 2 },
    ],
    orphans: [],
  });

  assert.equal(report.status, 'issues-detected');
  assert.equal(report.duplicate_count, 2);
  assert.deepEqual(report.duplicate_matches, [{
    rule_id: 'DUP-001',
    check_name: 'payment_order_live_duplicates',
    count: 2,
    description: 'A configured duplicate check found multiple rows for the same integrity key.',
  }]);
  assert.equal(JSON.stringify(report).includes('row_contents'), false);
});

test('integrity analyzer detects orphan references', () => {
  const report = analyzeIntegritySnapshot({
    duplicates: [],
    orphans: [
      { check_name: 'product_views.product_id -> products.id', orphan_count: 2 },
    ],
  });

  assert.equal(report.status, 'issues-detected');
  assert.equal(report.orphan_count, 2);
  assert.deepEqual(report.orphan_matches, [{
    rule_id: 'ORPHAN-001',
    check_name: 'product_views.product_id -> products.id',
    count: 2,
    description: 'A child/reference row points to a missing parent row.',
  }]);
});

test('integrity analyzer refuses malformed snapshots instead of reporting healthy', () => {
  const report = analyzeIntegritySnapshot({
    duplicates: [],
  });

  assert.equal(report.status, 'issues-detected');
  assert.equal(report.malformed_snapshot, true);
});

test('integrity log extraction is deterministic and limited to rule IDs', () => {
  const first = extractIntegrityMatches([
    'DUP-001 duplicate',
    'ORPHAN-001 missing parent',
    'DUP-001 duplicate again',
  ]);
  const second = extractIntegrityMatches([
    'ORPHAN-001 missing parent',
    'DUP-001 duplicate',
  ]);

  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    {
      rule_id: 'DUP-001',
      description: 'A configured duplicate check found multiple rows for the same integrity key.',
    },
    {
      rule_id: 'ORPHAN-001',
      description: 'A child/reference row points to a missing parent row.',
    },
  ]);
});
