import fs from 'node:fs';
import { auditRlsSecuritySnapshot } from './rls-security-audit.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-rls-audit.mjs <snapshot.json>');
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const report = auditRlsSecuritySnapshot(snapshot);

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'healthy' ? 0 : 1);
