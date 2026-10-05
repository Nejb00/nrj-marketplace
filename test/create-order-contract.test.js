import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    'supabase/functions/create-order/index.ts',
    'utf8'
);

test('create-order uses standard bearer and Congo phone regexes', () => {
    assert.match(source, /value\.match\(\/\^Bearer\\s\+ \(\.\+\)\$\/i\)/);
    assert.match(source, /const PHONE_PATTERN = \/\^242\\d\{9\}\$\//);
});

test('create-order keeps the idempotent variant separator as a real control escape', () => {
    assert.match(source, /\.join\("\\u001f"\);/);
});
