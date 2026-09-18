const test = require('node:test');
const assert = require('node:assert/strict');

// The date helpers must not depend on whichever timezone happens to launch a
// controller in a test, worker, or standalone script.
process.env.TZ = 'UTC';
const utils = require('../controllers/utils');

test('parses a China-local date range independently of process timezone', () => {
  assert.equal(
    utils.parseLocalDate('2026-07-26 00:00:00').toISOString(),
    '2026-07-25T16:00:00.000Z',
  );
  assert.equal(
    utils.parseLocalDateEnd('2026-08-25 23:59:59.999').toISOString(),
    '2026-08-25T15:59:59.999Z',
  );
});

test('date-only end values include the entire China-local end day', () => {
  assert.equal(
    utils.parseLocalDateEnd('2026-08-25').toISOString(),
    '2026-08-25T15:59:59.999Z',
  );
});
