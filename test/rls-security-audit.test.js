import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRlsSecuritySnapshot } from '../scripts/rls-security-audit.mjs';

test('RLS audit accepts fully protected public tables', () => {
  const result = auditRlsSecuritySnapshot({
    tables: [
      { schema_name: 'public', table_type: 'BASE TABLE', table_name: 'orders', rls_enabled: true, policy_count: 4 },
    ],
    functions: [],
    grants: [],
  });
  assert.equal(result.status, 'healthy');
});

test('RLS audit detects an unprotected public table', () => {
  const result = auditRlsSecuritySnapshot({
    tables: [
      { schema_name: 'public', table_type: 'BASE TABLE', table_name: 'orders', rls_enabled: false, policy_count: 0 },
    ],
  });
  assert.equal(result.status, 'security-findings');
  assert.equal(result.findings[0].rule_id, 'SEC-RLS-001');
});

test('RLS audit blocks public execution of privileged function', () => {
  const result = auditRlsSecuritySnapshot({
    tables: [],
    functions: [
      { function_name: 'internal_task', security_definer: true, anon_execute: true },
    ],
  });
  assert.equal(result.status, 'security-findings');
  assert.equal(result.findings[0].rule_id, 'SEC-RLS-003');
});
