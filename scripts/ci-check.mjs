#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const IGNORED = new Set(['.git', 'node_modules', 'dist']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (['.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkSyntax(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, error: stderr.trim() });
    });
  });
}

const files = (await walk(ROOT))
  .filter((file) => !relative(ROOT, file).startsWith('.github/'))
  .sort();

let failures = 0;

for (const file of files) {
  const result = await checkSyntax(file);
  if (!result.ok) {
    failures += 1;
    console.error(`\n❌ Syntaxe invalide : ${relative(ROOT, file)}`);
    if (result.error) console.error(result.error);
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} fichier(s) JavaScript ont échoué au contrôle syntaxique.`);
  process.exit(1);
}

console.log(`✅ Contrôle syntaxique OK — ${files.length} fichier(s) JavaScript vérifié(s).`);
