export function auditRlsSecuritySnapshot(snapshot = {}) {
  const findings = [];

  for (const table of snapshot.tables || []) {
    if (table.schema_name !== 'public' || table.table_type !== 'BASE TABLE') continue;
    if (table.rls_enabled !== true) {
      findings.push({
        rule_id: 'SEC-RLS-001',
        target: table.table_name,
        detail: 'Public table has Row Level Security disabled.',
      });
    }
  }

  for (const table of snapshot.tables || []) {
    if (table.schema_name !== 'public' || table.table_type !== 'BASE TABLE') continue;
    if (table.privileged_only === true && Number(table.policy_count || 0) === 0) continue;
    if (table.policy_count == null) {
      findings.push({
        rule_id: 'SEC-RLS-002',
        target: table.table_name,
        detail: 'RLS policy inventory is missing.',
      });
    }
  }

  for (const fn of snapshot.functions || []) {
    if (fn.security_definer === true && (fn.anon_execute === true || fn.public_execute === true)) {
      findings.push({
        rule_id: 'SEC-RLS-003',
        target: fn.function_name,
        detail: 'Privileged function is executable by a public role.',
      });
    }
  }

  for (const grant of snapshot.grants || []) {
    if (grant.role_name === 'anon' &&
        ['INSERT', 'UPDATE', 'DELETE'].includes(String(grant.privilege_type).toUpperCase())) {
      findings.push({
        rule_id: 'SEC-RLS-004',
        target: grant.table_name,
        detail: 'Anonymous role has a write grant that requires explicit review.',
      });
    }
  }

  return {
    schema_version: 1,
    status: findings.length ? 'security-findings' : 'healthy',
    finding_count: findings.length,
    findings,
  };
}
