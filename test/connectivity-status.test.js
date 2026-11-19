import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isNetworkReachable } from '../src/js/utils/connectivity.js';

test('confirmed API success overrides a false navigator.onLine signal', () => {
  assert.equal(isNetworkReachable('online', false), true);
});

test('confirmed API failure overrides a stale browser online signal', () => {
  assert.equal(isNetworkReachable('offline', true), false);
});

test('unknown connection state falls back to the browser signal', () => {
  assert.equal(isNetworkReachable('unknown', true), true);
  assert.equal(isNetworkReachable('unknown', false), false);
});

test('offline indicator follows the app-level reachability state', () => {
  const source = fs.readFileSync('src/js/features/app/offline.js', 'utf8');
  assert.match(source, /isNetworkReachable\(state\.networkStatus, navigator\.onLine\)/);
  assert.match(source, /nrj:network-status/);
});

test('Supabase response and timeout update the app-level reachability state', () => {
  const source = fs.readFileSync('src/js/api/api.js', 'utf8');
  assert.match(source, /reportNetworkStatus\('online'\)/);
  assert.match(source, /reportNetworkStatus\('offline'\)/);
});
