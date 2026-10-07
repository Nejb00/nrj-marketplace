import fs from 'node:fs';
import path from 'node:path';

export const MIGRATION_VERSION_PATTERN = /^(\d{14})_.+\.sql$/;

function normalizeVersion(value) {
  const match = String(value ?? '').match(/^(\d{14})(?:_|$)/);
  return match ? match[1] : null;
}

export function extractLocalMigrationVersions(filenames) {
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const filename of filenames) {
    const match = String(filename ?? '').match(MIGRATION_VERSION_PATTERN);
    if (!match) {
      invalid.push(String(filename ?? ''));
      continue;
    }

    const version = match[1];
    if (seen.has(version)) {
      duplicates.push(version);
      continue;
    }

    seen.add(version);
    valid.push(version);
  }

  return {
    versions: valid.sort(),
    invalid: invalid.sort(),
    duplicates: [...new Set(duplicates)].sort(),
  };
}

export function extractRemoteMigrationVersions(entries) {
  const versions = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const entry of entries ?? []) {
    const raw = typeof entry === 'string' ? entry : entry?.version;
    const version = normalizeVersion(raw);

    if (!version) {
      invalid.push(raw == null ? '' : String(raw));
      continue;
    }

    if (seen.has(version)) {
      duplicates.push(version);
      continue;
    }

    seen.add(version);
    versions.push(version);
  }

  return {
    versions: versions.sort(),
    invalid: invalid.sort(),
    duplicates: [...new Set(duplicates)].sort(),
  };
}

export function compareMigrationHistory({ localMigrations = [], remoteMigrations = [] }) {
  const local = extractLocalMigrationVersions(localMigrations);
  const remote = extractRemoteMigrationVersions(remoteMigrations);

  const localSet = new Set(local.versions);
  const remoteSet = new Set(remote.versions);

  const localOnly = local.versions.filter(version => !remoteSet.has(version));
  const remoteOnly = remote.versions.filter(version => !localSet.has(version));
  const shared = local.versions.filter(version => remoteSet.has(version));

  const malformed = [
    ...local.invalid.map(value => ({ source: 'local', value })),
    ...remote.invalid.map(value => ({ source: 'remote', value })),
  ];

  const structuralIssues = [
    ...local.duplicates.map(version => ({ source: 'local', version })),
    ...remote.duplicates.map(version => ({ source: 'remote', version })),
  ];

  let direction = 'none';
  if (remoteOnly.length && !localOnly.length) direction = 'remote-ahead';
  if (localOnly.length && !remoteOnly.length) direction = 'local-ahead';
  if (localOnly.length && remoteOnly.length) direction = 'diverged';

  const drift = localOnly.length > 0
    || remoteOnly.length > 0
    || malformed.length > 0
    || structuralIssues.length > 0;

  return {
    schema_version: 1,
    status: drift ? 'drift-detected' : 'healthy',
    drift,
    direction,
    local_count: local.versions.length,
    remote_count: remote.versions.length,
    shared_count: shared.length,
    local_only: localOnly,
    remote_only: remoteOnly,
    malformed,
    structural_issues: structuralIssues,
  };
}

function readRemoteMigrations(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const migrations = Array.isArray(payload) ? payload : payload?.migrations;

  if (!Array.isArray(migrations)) {
    throw new Error('Remote migration payload must be an array or { migrations: [] }.');
  }

  return migrations;
}

function readLocalMigrations(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
}

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [key, inlineValue] = arg.split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue == null) index += 1;
    args.set(key, value);
  }

  return args;
}

const mainPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;

if (mainPath && import.meta.url === new URL(mainPath, 'file:').href) {
  const args = parseArgs(process.argv.slice(2));
  const localDir = path.resolve(args.get('--local-dir') ?? 'supabase/migrations');
  const remoteJson = args.get('--remote-json');

  if (!remoteJson) {
    console.error('Usage: node scripts/migration-drift.mjs --remote-json <file> [--local-dir <dir>]');
    process.exit(2);
  }

  try {
    const report = compareMigrationHistory({
      localMigrations: readLocalMigrations(localDir),
      remoteMigrations: readRemoteMigrations(path.resolve(remoteJson)),
    });

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.drift ? 1 : 0);
  } catch (error) {
    console.error(
      `Migration drift audit failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}
