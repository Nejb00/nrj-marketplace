const DUPLICATE_SIGNAL_PATTERN = /\bDUP-\d{3}\b/g;
const ORPHAN_SIGNAL_PATTERN = /\bORPHAN-\d{3}\b/g;

const INTEGRITY_RULES = {
  'DUP-001': 'A configured duplicate check found multiple rows for the same integrity key.',
  'ORPHAN-001': 'A child/reference row points to a missing parent row.',
};

function asPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizeFinding(finding, kind) {
  const checkName = typeof finding?.check_name === 'string'
    ? finding.check_name.trim()
    : '';
  const countField = kind === 'duplicate' ? 'row_count' : 'orphan_count';
  const count = asPositiveInteger(finding?.[countField]);

  return checkName && count > 0
    ? { check_name: checkName, count }
    : null;
}

function collectMatches(findings, kind, rule_id) {
  return findings
    .map((finding) => normalizeFinding(finding, kind))
    .filter(Boolean)
    .map(({ check_name, count }) => ({
      rule_id,
      check_name,
      count,
      description: INTEGRITY_RULES[rule_id],
    }));
}

export function analyzeIntegritySnapshot(snapshot = {}) {
  const duplicateMatches = collectMatches(
    Array.isArray(snapshot?.duplicates) ? snapshot.duplicates : [],
    'duplicate',
    'DUP-001'
  );
  const orphanMatches = collectMatches(
    Array.isArray(snapshot?.orphans) ? snapshot.orphans : [],
    'orphan',
    'ORPHAN-001'
  );

  const malformed =
    !Array.isArray(snapshot?.duplicates) ||
    !Array.isArray(snapshot?.orphans);

  const status =
    malformed || duplicateMatches.length > 0 || orphanMatches.length > 0
      ? 'issues-detected'
      : 'healthy';

  return {
    schema_version: 1,
    status,
    duplicate_count: duplicateMatches.reduce((sum, item) => sum + item.count, 0),
    orphan_count: orphanMatches.reduce((sum, item) => sum + item.count, 0),
    duplicate_matches: duplicateMatches,
    orphan_matches: orphanMatches,
    malformed_snapshot: malformed,
  };
}

export function extractIntegrityMatches(logTexts = []) {
  const found = new Set();

  for (const log of logTexts) {
    if (typeof log !== 'string') continue;

    for (const match of log.matchAll(DUPLICATE_SIGNAL_PATTERN)) found.add(match[0]);
    for (const match of log.matchAll(ORPHAN_SIGNAL_PATTERN)) found.add(match[0]);
  }

  return [...found].sort().map((rule_id) => ({
    rule_id,
    description: INTEGRITY_RULES[rule_id] || 'Unknown integrity rule.',
  }));
}

function readJson(filePath) {
  const fs = require('node:fs');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const isMain = process.argv[1]
  ? import.meta.url === new URL(process.argv[1], 'file:').href
  : false;

if (isMain) {
  const fileFlag = process.argv.indexOf('--snapshot');
  const snapshotPath = fileFlag >= 0 ? process.argv[fileFlag + 1] : null;

  if (!snapshotPath) {
    console.error('Usage: node scripts/data-integrity.mjs --snapshot <file>');
    process.exit(2);
  }

  try {
    const snapshot = readJson(snapshotPath);
    const report = analyzeIntegritySnapshot(snapshot);

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === 'healthy' ? 0 : 1);
  } catch (error) {
    console.error(
      `Data integrity audit failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}
