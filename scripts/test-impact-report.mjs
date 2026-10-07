import fs from 'node:fs';
import { summarizeTestImpact } from './test-intelligence.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/test-impact-report.mjs <changed-files.json>');
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const files = Array.isArray(payload) ? payload : payload.files;

if (!Array.isArray(files)) {
  throw new Error('Changed-files payload must be an array or { files: [] }.');
}

console.log(JSON.stringify(
  summarizeTestImpact(files.map(String)),
  null,
  2
));
