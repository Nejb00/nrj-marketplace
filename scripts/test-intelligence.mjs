const RISK_RULES = [
  { pattern: /(?:payment|order|cart|product-import)/i, scope: 'business', risk: 'critical' },
  { pattern: /^(?:src\/js\/(?:api|services|features)\/.*\.(?:js|mjs)|supabase\/)/, scope: 'integration', risk: 'high' },
  { pattern: /^test\//, scope: 'unit', risk: 'low' },
  { pattern: /^\.github\/workflows\//, scope: 'workflow', risk: 'high' },
  { pattern: /^(?:package\.json|package-lock\.json)$/, scope: 'dependency', risk: 'high' },
  { pattern: /^vite\.config\./, scope: 'build', risk: 'high' },
];

export function classifyChangedFiles(files = []) {
  return files.map(path => {
    const match = RISK_RULES.find(rule => rule.pattern.test(path));
    return { path, scope: match?.scope || 'general', risk: match?.risk || 'medium' };
  });
}

export function selectTestScopes(files = []) {
  const classified = classifyChangedFiles(files);
  const scopes = new Set(['unit']);

  for (const file of classified) {
    scopes.add(file.scope);
    if (file.risk === 'critical') {
      scopes.add('e2e');
      scopes.add('integration');
    }
    if (file.scope === 'dependency') scopes.add('security');
    if (file.scope === 'workflow') scopes.add('workflow');
    if (file.scope === 'build') scopes.add('build');
    if (file.scope === 'integration') scopes.add('integration');
  }

  return [...scopes].sort();
}

export function summarizeTestImpact(files = []) {
  const classified = classifyChangedFiles(files);
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const maxRiskValue = classified.reduce(
    (max, item) => Math.max(max, rank[item.risk] || 0),
    0
  );

  return {
    schema_version: 1,
    files: classified,
    max_risk: Object.entries(rank).find(([, value]) => value === maxRiskValue)?.[0] || 'low',
    required_scopes: selectTestScopes(files),
  };
}
