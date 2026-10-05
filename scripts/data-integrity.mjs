import fs from 'node:fs';

const DUPLICATE_SIGNAL_PATTERN = /\bDUP-\d{3}\b/g;
const ORPHAN_SIGNAL_PATTERN = /\bORPHAN-\d{3}\b/g;

const INTEGRITY_RULES = {
  'DUP-001': 'A configured duplicate check found multiple rows for the same integrity key.',
  'ORPHAN-001': 'A child/reference row points to a missing parent row.',
  'CROSS-001': 'A paid payment conflicts with the linked order state.',
  'CROSS-002': 'A paid payment amount conflicts with the linked order total.',
  'CROSS-003': 'A paid payment uses an unexpected application currency.',
  'CROSS-004': 'A processed payment event has no payment reference.',
  'CROSS-005': 'A payment event points outside the payment snapshot.',
  'CROSS-006': 'A published product import points outside the product snapshot.',
  'CROSS-007': 'A product import points outside the category snapshot.',
  'CROSS-008': 'A product points outside the category snapshot.',
  'IMPOSSIBLE-001': 'A product price is invalid.',
  'IMPOSSIBLE-002': 'A product order counter is invalid.',
  'IMPOSSIBLE-003': 'An order total is invalid.',
  'IMPOSSIBLE-004': 'An order timestamp moved backwards.',
  'IMPOSSIBLE-005': 'A payment amount is invalid.',
  'IMPOSSIBLE-006': 'A payment timestamp moved backwards.',
  'IMPOSSIBLE-007': 'A category points to itself as parent.',
  'IMPOSSIBLE-008': 'A chat unread counter is invalid.',
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
  const crossSystemMatches = Array.isArray(snapshot?.cross_system)
    ? snapshot.cross_system
      .filter(item => item?.rule_id && Number(item.count) > 0)
      .map(item => ({
        rule_id: String(item.rule_id),
        check_name: String(item.check_name || item.rule_id),
        count: Number(item.count),
        description: INTEGRITY_RULES[item.rule_id] || 'Unknown cross-system integrity rule.',
      }))
    : [];
  const impossibleMatches = Array.isArray(snapshot?.impossible_values)
    ? snapshot.impossible_values
      .filter(item => item?.rule_id && Number(item.count) > 0)
      .map(item => ({
        rule_id: String(item.rule_id),
        check_name: String(item.check_name || item.rule_id),
        count: Number(item.count),
        description: INTEGRITY_RULES[item.rule_id] || 'Unknown impossible-value rule.',
      }))
    : [];

  const malformed =
    !Array.isArray(snapshot?.duplicates) ||
    !Array.isArray(snapshot?.orphans) ||
    (snapshot?.cross_system != null && !Array.isArray(snapshot.cross_system)) ||
    (snapshot?.impossible_values != null && !Array.isArray(snapshot.impossible_values));

  const totalIssues = [
    ...duplicateMatches,
    ...orphanMatches,
    ...crossSystemMatches,
    ...impossibleMatches,
  ];

  return {
    schema_version: 1,
    status: malformed || totalIssues.length > 0 ? 'issues-detected' : 'healthy',
    duplicate_count: duplicateMatches.reduce((sum, item) => sum + item.count, 0),
    orphan_count: orphanMatches.reduce((sum, item) => sum + item.count, 0),
    cross_system_count: crossSystemMatches.reduce((sum, item) => sum + item.count, 0),
    impossible_value_count: impossibleMatches.reduce((sum, item) => sum + item.count, 0),
    duplicate_matches: duplicateMatches,
    orphan_matches: orphanMatches,
    cross_system_matches: crossSystemMatches,
    impossible_value_matches: impossibleMatches,
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
