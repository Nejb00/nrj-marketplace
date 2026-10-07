import fs from 'node:fs';
import { evaluateProductionGate } from './production-guard.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/production-readiness-report.mjs <snapshot.json>');
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
const report = evaluateProductionGate(snapshot);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'ready' ? 0 : 1);
