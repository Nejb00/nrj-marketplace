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

test('RLS audit allows public SELECT and authenticated CRUD without structural grants', () => {
  const result = auditRlsSecuritySnapshot({
    effective_table_privileges: [
      {
        role_name: 'anon',
        table_name: 'products',
        select: true,
        insert: false,
        update: false,
        delete: false,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      },
      {
        role_name: 'authenticated',
        table_name: 'products',
        select: true,
        insert: true,
        update: true,
        delete: true,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      },
    ],
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.finding_count, 0);
});

test('RLS audit flags anon writes and structural privileges plus authenticated structural privileges', () => {
  const result = auditRlsSecuritySnapshot({
    effective_table_privileges: [
      {
        role_name: 'anon',
        table_name: 'products',
        select: true,
        insert: true,
        update: true,
        delete: true,
        truncate: true,
        references: true,
        trigger: true,
        maintain: true,
      },
      {
        role_name: 'authenticated',
        table_name: 'products',
        select: true,
        insert: true,
        update: true,
        delete: true,
        truncate: true,
        references: true,
        trigger: true,
        maintain: true,
      },
    ],
  });

  assert.equal(result.status, 'security-findings');
  assert.equal(result.finding_count, 2);
  assert.deepEqual(result.findings.map(f => f.rule_id).sort(), [
    'SEC-RLS-004',
    'SEC-RLS-005',
  ]);
  assert.match(result.findings.find(f => f.rule_id === 'SEC-RLS-004').detail, /MAINTAIN/);
  assert.match(result.findings.find(f => f.rule_id === 'SEC-RLS-005').detail, /TRUNCATE/);
});
