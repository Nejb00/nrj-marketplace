import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    'supabase/functions/create-order/index.ts',
    'utf8'
);

test('create-order uses a standard bearer guard and Congo phone validation', () => {
    assert.match(source, /function getBearerToken\(req: Request\)/);
    assert.match(source, /req\.headers\.get\(["']authorization["']\)/);
    assert.match(source, /const PHONE_PATTERN = \/\^242\\d\{9\}\$\//);
});

test('create-order keeps the idempotent variant separator as a real control escape', () => {
    assert.match(source, /\.join\(["']\\u001f["']\);/);
});
