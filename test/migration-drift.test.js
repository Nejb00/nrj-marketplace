import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareMigrationHistory,
  extractLocalMigrationVersions,
  extractRemoteMigrationVersions,
} from '../scripts/migration-drift.mjs';

test('migration parser accepts Supabase timestamped SQL filenames', () => {
  const result = extractLocalMigrationVersions([
    '20261002192115_harden_rls.sql',
    '20261003091500_harden_chat.sql',
  ]);

  assert.deepEqual(result, {
    versions: ['20261002192115', '20261003091500'],
    invalid: [],
    duplicates: [],
  });
});

test('migration parser reports malformed and duplicate local entries', () => {
  const result = extractLocalMigrationVersions([
    '20261002192115_one.sql',
    '20261002192115_two.sql',
    'not-a-migration.sql',
  ]);

  assert.deepEqual(result, {
    versions: ['20261002192115'],
    invalid: ['not-a-migration.sql'],
    duplicates: ['20261002192115'],
  });
});

test('remote history accepts Management API migration entries', () => {
  const result = extractRemoteMigrationVersions([
    { version: '20261002192115', name: 'harden_rls' },
    { version: '20261003091500', name: 'harden_chat' },
  ]);

  assert.deepEqual(result, {
    versions: ['20261002192115', '20261003091500'],
    invalid: [],
    duplicates: [],
  });
});

test('migration drift detects a remote-only migration and classifies remote ahead', () => {
  const result = compareMigrationHistory({
    localMigrations: [
      '20261002192115_harden_rls.sql',
      '20261003091500_harden_chat.sql',
    ],
    remoteMigrations: [
      { version: '20261002192115', name: 'harden_rls' },
      { version: '20261003091500', name: 'harden_chat' },
      { version: '20261005100127', name: 'create_payment_persistence' },
    ],
  });

  assert.equal(result.status, 'drift-detected');
  assert.equal(result.direction, 'remote-ahead');
  assert.deepEqual(result.remote_only, ['20261005100127']);
  assert.deepEqual(result.local_only, []);
});

test('migration drift detects divergence in both directions', () => {
  const result = compareMigrationHistory({
    localMigrations: ['20261002192115_local.sql', '20261004000000_local_only.sql'],
    remoteMigrations: [
      { version: '20261002192115' },
      { version: '20261005000000', name: 'remote_only' },
    ],
  });

  assert.equal(result.status, 'drift-detected');
  assert.equal(result.direction, 'diverged');
  assert.deepEqual(result.local_only, ['20261004000000']);
  assert.deepEqual(result.remote_only, ['20261005000000']);
});

test('migration drift stays healthy when histories match by timestamp', () => {
  const result = compareMigrationHistory({
    localMigrations: [
      '20261002192115_any_name.sql',
      '20261003091500_any_name.sql',
    ],
    remoteMigrations: [
      { version: '20261002192115', name: 'different_remote_name' },
      { version: '20261003091500', name: 'another_name' },
    ],
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.direction, 'none');
  assert.equal(result.shared_count, 2);
});

test('migration drift reports malformed remote versions without guessing', () => {
  const result = compareMigrationHistory({
    localMigrations: ['20261002192115_harden_rls.sql'],
    remoteMigrations: [
      { version: 'bad-version' },
      { version: '20261002192115' },
    ],
  });

  assert.equal(result.status, 'drift-detected');
  assert.equal(result.direction, 'none');
  assert.deepEqual(result.malformed, [
    { source: 'remote', value: 'bad-version' },
  ]);
});
