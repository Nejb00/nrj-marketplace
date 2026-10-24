import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auto-sync only writes to Supabase after a local cart or favorites change', async () => {
  const [state, sync] = await Promise.all([
    readFile('src/js/core/state.js', 'utf8'),
    readFile('src/js/services/sync.js', 'utf8')
  ]);

  assert.match(state, /SYNC_PENDING_KEY = 'nrj_sync_pending_v1'/);
  assert.match(state, /markSyncPending\(\);[\s\S]*notifyLocalStateChanged\(\);/);
  assert.match(sync, /if \(isSyncing \|\| !navigator\.onLine \|\| !hasPendingSync\(\)\) return;/);
  assert.match(sync, /addEventListener\(SYNC_PENDING_EVENT/);
  assert.match(sync, /if \(hasPendingSync\(\)\) void syncAllOfflineData\(\);/);
  assert.doesNotMatch(sync, /setTimeout\(\(\) => syncAllOfflineData\(\), 2500\)/);
});

test('sync keeps a pending marker when either remote upsert fails', async () => {
  const sync = await readFile('src/js/services/sync.js', 'utf8');

  assert.match(sync, /if \(error\) \{[\s\S]*?return false;[\s\S]*?\}/);
  assert.match(sync, /if \(cartSynced && favoritesSynced && pendingRevision === revisionAtStart\) \{\s*clearPendingSync\(\);/);
  assert.match(sync, /pendingRevision !== revisionAtStart/);
});
