const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeStringArrayParam } = require('../utils/query-params');

test('normalizeStringArrayParam keeps array values', () => {
  assert.deepEqual(
    normalizeStringArrayParam(['2026-02', '2026-03']),
    ['2026-02', '2026-03'],
  );
});

test('normalizeStringArrayParam converts single string to array', () => {
  assert.deepEqual(
    normalizeStringArrayParam('2026-03'),
    ['2026-03'],
  );
});

test('normalizeStringArrayParam returns empty array for empty values', () => {
  assert.deepEqual(normalizeStringArrayParam(''), []);
  assert.deepEqual(normalizeStringArrayParam(undefined), []);
  assert.deepEqual(normalizeStringArrayParam(null), []);
});
