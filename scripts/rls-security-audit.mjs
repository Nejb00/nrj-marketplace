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

  const effectivePrivileges = snapshot.effective_table_privileges;
  if (Array.isArray(effectivePrivileges)) {
    const privilegeNames = [
      'select', 'insert', 'update', 'delete',
      'truncate', 'references', 'trigger', 'maintain',
    ];

    for (const access of effectivePrivileges) {
      const roleName = String(access.role_name || '').toLowerCase();
      const granted = privilegeNames.filter((privilege) => access[privilege] === true);
      let reviewedPrivileges = [];
      let ruleId = null;
      let detail = '';

      if (roleName === 'anon') {
        reviewedPrivileges = granted.filter((privilege) => privilege !== 'select');
        ruleId = 'SEC-RLS-004';
        detail = 'Anonymous role has a non-read table privilege; public visitors should receive only explicitly required SELECT access.';
      } else if (roleName === 'authenticated') {
        reviewedPrivileges = granted.filter((privilege) =>
          ['truncate', 'references', 'trigger', 'maintain'].includes(privilege)
        );
        ruleId = 'SEC-RLS-005';
        detail = 'Authenticated role has a structural or maintenance privilege that bypasses row-level write policies or exceeds normal application CRUD needs.';
      }

      if (ruleId && reviewedPrivileges.length) {
        findings.push({
          rule_id: ruleId,
          target: access.table_name,
          detail: detail + ' Privileges: ' + reviewedPrivileges.join(', ').toUpperCase() + '.',
        });
      }
    }
  } else {
    // Backward compatibility for snapshots created before effective privileges
    // were included. The new SQL snapshot also records PostgreSQL 17 MAINTAIN.
    for (const grant of snapshot.grants || []) {
      const roleName = String(grant.role_name || '').toLowerCase();
      const privilege = String(grant.privilege_type || '').toUpperCase();

      if (roleName === 'anon' && privilege !== 'SELECT') {
        findings.push({
          rule_id: 'SEC-RLS-004',
          target: grant.table_name,
          detail: 'Anonymous role has a non-read table privilege that requires explicit review: ' + privilege + '.',
        });
      } else if (roleName === 'authenticated' &&
          ['TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(privilege)) {
        findings.push({
          rule_id: 'SEC-RLS-005',
          target: grant.table_name,
          detail: 'Authenticated role has a structural table privilege that requires explicit review: ' + privilege + '.',
        });
      }
    }
  }

  return {
    schema_version: 1,
    status: findings.length ? 'security-findings' : 'healthy',
    finding_count: findings.length,
    findings,
  };
}
