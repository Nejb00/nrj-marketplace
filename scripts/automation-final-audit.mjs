import fs from 'node:fs';

const REQUIRED_FILES = [
  'scripts/business-invariants.mjs',
  'scripts/incident-intelligence.mjs',
  'scripts/migration-drift.mjs',
  'scripts/data-integrity.mjs',
  'scripts/cross-system-integrity.mjs',
  'scripts/security-audit.mjs',
  'scripts/rls-security-audit.mjs',
  'scripts/test-intelligence.mjs',
  'scripts/test-health.mjs',
  'scripts/self-healing-guard.mjs',
  'scripts/recovery-guard.mjs',
  'scripts/observability-model.mjs',
  'scripts/git-pr-intelligence.mjs',
  'scripts/production-guard.mjs',
  'scripts/incident-history.mjs',
  'scripts/cross-system-correlation.mjs',
  'scripts/payment-audit.mjs',
  'scripts/payment-attack-matrix.mjs',
  'scripts/automation-governance.mjs',
];

const REQUIRED_WORKFLOWS = [
  '.github/workflows/nrj-governance-audit.yml',
  '.github/workflows/nrj-resilience-audit.yml',
  '.github/workflows/supabase-migration-drift.yml',
  '.github/workflows/data-integrity.yml',
  '.github/workflows/security-audit.yml',
  '.github/workflows/supabase-rls-audit.yml',
  '.github/workflows/test-impact.yml',
  '.github/workflows/global-observability.yml',
  '.github/workflows/pr-intelligence.yml',
  '.github/workflows/production-readiness.yml',
  '.github/workflows/incident-memory.yml',
  '.github/workflows/cross-system-correlation.yml',
];

function exists(path) {
  return fs.existsSync(path);
}

export function auditAutomationSurface() {
  const files = REQUIRED_FILES.map(path => ({ path, present: exists(path) }));
  const workflows = REQUIRED_WORKFLOWS.map(path => ({ path, present: exists(path) }));
  const missingFiles = files.filter(item => !item.present).map(item => item.path);
  const missingWorkflows = workflows.filter(item => !item.present).map(item => item.path);

  return {
    schema_version: 1,
    status: missingFiles.length || missingWorkflows.length ? 'incomplete' : 'complete',
    required_files: files.length,
    present_files: files.filter(item => item.present).length,
    required_workflows: workflows.length,
    present_workflows: workflows.filter(item => item.present).length,
    missing_files: missingFiles,
    missing_workflows: missingWorkflows,
    notes: [
      'Remote Supabase audits remain conditional on configured secrets.',
      'No automatic merge is part of this audit.',
      'Historical dashboard main-only filtering remains a separate legacy gap.',
    ],
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const report = auditAutomationSurface();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'complete' ? 0 : 1);
}
