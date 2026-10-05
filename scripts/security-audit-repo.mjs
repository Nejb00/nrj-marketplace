import fs from 'node:fs';
import path from 'node:path';
import { auditSecurityFiles, securityRiskScore } from './security-audit.mjs';

const ROOT = process.cwd();
const IGNORED = new Set(['.git', 'node_modules', 'dist', '.vercel']);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.yml', '.yaml', '.sql', '.json']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map(full => ({
  path: path.relative(ROOT, full).replaceAll(path.sep, '/'),
  content: fs.readFileSync(full, 'utf8'),
}));

const report = auditSecurityFiles(files);
const blockingFindings = report.findings.filter(finding =>
  finding.rule_id !== 'SEC-002' && ['critical', 'high'].includes(finding.severity)
);
const effectiveStatus = blockingFindings.length
  ? 'blocked'
  : report.finding_count
    ? 'review-required'
    : 'healthy';

console.log(JSON.stringify({
  ...report,
  status: effectiveStatus,
  blocking_findings: blockingFindings,
  risk_score: securityRiskScore(report),
}, null, 2));

process.exit(blockingFindings.length ? 1 : 0);
