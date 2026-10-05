import fs from 'node:fs';
import { summarizeAutomationHealth } from './observability-model.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/observability-report.mjs <snapshot.json>');
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
const report = summarizeAutomationHealth(snapshot);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'degraded' ? 1 : 0);
