const RULES = [
  {
    id: 'SEC-001',
    pattern: /\bauth\.role\s*\(/,
    severity: 'high',
    description: 'Deprecated authorization pattern detected.',
  },
  {
    id: 'SEC-002',
    pattern: /security\s+definer/i,
    severity: 'high',
    description: 'SECURITY DEFINER requires privileged review.',
  },
  {
    id: 'SEC-003',
    pattern: /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE)/i,
    severity: 'critical',
    description: 'Likely secret exposed to browser environment.',
  },
  {
    id: 'SEC-004',
    pattern: /permissions:\s*\n(?:\s+\w+:\s*(?:write|read-write)\s*\n){2,}/i,
    severity: 'medium',
    description: 'Workflow permissions may be broader than necessary.',
  },
];

export function auditSecurityFiles(files = []) {
  const findings = [];

  for (const file of files) {
    const path = typeof file === 'string' ? '' : String(file?.path ?? '');
    const content = typeof file === 'string' ? file : String(file?.content ?? '');
    if (!path || !content) continue;

    for (const rule of RULES) {
      if (rule.pattern.test(content)) {
        findings.push({
          rule_id: rule.id,
          path,
          severity: rule.severity,
          description: rule.description,
        });
      }
      rule.pattern.lastIndex = 0;
    }
  }

  return {
    schema_version: 1,
    status: findings.some(f => ['critical', 'high'].includes(f.severity))
      ? 'blocked'
      : findings.length ? 'review-required' : 'healthy',
    finding_count: findings.length,
    findings,
  };
}

export function securityRiskScore(report) {
  const weights = { critical: 10, high: 6, medium: 3, low: 1 };
  return report.findings.reduce((sum, finding) => sum + (weights[finding.severity] || 0), 0);
}
