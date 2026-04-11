const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../controllers/api/report');

test('buildIntegratedQueryEmptyResponse returns ok=true for empty results', () => {
  assert.deepEqual(__testables.buildIntegratedQueryEmptyResponse(), {
    ok: true,
    bills: [],
    total: 0,
    message: '暂无符合条件的数据',
  });
});

test('normalizeIntegratedQueryTextFields trims order and bill numbers', () => {
  assert.deepEqual(__testables.normalizeIntegratedQueryTextFields({
    fOrder: '  OS126020032  ',
    fBno: '\tTB123456 \n',
    fCustomerName: '  保留原样  ',
  }), {
    fOrder: 'OS126020032',
    fBno: 'TB123456',
    fCustomerName: '  保留原样  ',
  });
});
