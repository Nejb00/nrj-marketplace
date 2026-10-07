import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSecurityFiles, securityRiskScore } from '../scripts/security-audit.mjs';

test('security audit accepts a clean file', () => {
  const result = auditSecurityFiles([
    { path: 'src/app.js', content: 'const key = import.meta.env.VITE_PUBLIC_KEY;' },
  ]);
  assert.equal(result.status, 'healthy');
  assert.equal(securityRiskScore(result), 0);
});

test('security audit blocks privileged or browser-exposed secret patterns', () => {
  const result = auditSecurityFiles([
    { path: 'src/config.js', content: 'const x = import.meta.env.NEXT_PUBLIC_SECRET_TOKEN;' },
    { path: 'supabase/functions/a.sql', content: 'security definer' },
  ]);
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some(f => f.rule_id === 'SEC-003'));
  assert.ok(result.findings.some(f => f.rule_id === 'SEC-002'));
  assert.ok(securityRiskScore(result) >= 16);
});

test('security audit flags deprecated auth.role usage', () => {
  const result = auditSecurityFiles([
    { path: 'migration.sql', content: "using (auth.role() = 'authenticated')" },
  ]);
  assert.deepEqual(result.findings.map(f => f.rule_id), ['SEC-001']);
});
