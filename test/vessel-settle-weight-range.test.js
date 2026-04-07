const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyApproximateTotalWeightFilter,
} = require('../controllers/api/vessel_settle');

test('applyApproximateTotalWeightFilter uses +/- 0.5 range', () => {
  const matchStage = {};
  applyApproximateTotalWeightFilter(matchStage, '20.1');

  assert.deepEqual(matchStage.total_weight, {
    $gte: 19.6,
    $lte: 20.6,
  });
});

test('applyApproximateTotalWeightFilter ignores empty values', () => {
  const matchStage = {};
  applyApproximateTotalWeightFilter(matchStage, '');

  assert.equal(matchStage.total_weight, undefined);
});
