import fs from 'node:fs';
import { analyzePullRequest } from './git-pr-intelligence.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/pr-intelligence-report.mjs <snapshot.json>');
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
const report = analyzePullRequest(snapshot);
console.log(JSON.stringify(report, null, 2));
process.exit(0);
