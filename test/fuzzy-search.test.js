import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeString,
  levenshteinDistance,
  calculateSearchScore,
  fuzzySearch,
} from '../src/js/utils/fuzzy-search.js';

test('normalizeString normalise les accents et espaces', () => {
  assert.equal(normalizeString('  Téléphone   ÉLÉGANT  '), 'telephone elegant');
});

test('levenshteinDistance calcule correctement la distance', () => {
  assert.equal(levenshteinDistance('chat', 'chat'), 0);
  assert.equal(levenshteinDistance('chat', 'chats'), 1);
  assert.equal(levenshteinDistance('chat', 'chien'), 3);
});

test('calculateSearchScore favorise une correspondance exacte du nom', () => {
  const exact = calculateSearchScore('Téléphone', {
    id: 1,
    name: 'Téléphone',
  });
  const partial = calculateSearchScore('phone', {
    id: 2,
    name: 'Téléphone',
  });

  assert.ok(exact > partial);
  assert.ok(exact > 0);
});

test('fuzzySearch trie les résultats et exclut les scores nuls', () => {
  const products = [
    { id: 1, name: 'Chaussures de sport' },
    { id: 2, name: 'Téléphone Android' },
    { id: 3, name: 'Sac à dos' },
  ];

  const results = fuzzySearch('chaussure', products);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 1);
});

test('fuzzySearch retourne une liste vide pour une requête vide', () => {
  assert.deepEqual(fuzzySearch('   ', [{ id: 1, name: 'Produit' }]), []);
});
