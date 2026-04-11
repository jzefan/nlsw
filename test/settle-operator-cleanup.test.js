const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../scripts/cleanup-settle-operator-placeholders');

test('isPlaceholderOperator only matches current_user placeholder', () => {
  assert.equal(__testables.isPlaceholderOperator('current_user'), true);
  assert.equal(__testables.isPlaceholderOperator(' current_user '), true);
  assert.equal(__testables.isPlaceholderOperator('CURRENT_USER'), true);
  assert.equal(__testables.isPlaceholderOperator('张三'), false);
  assert.equal(__testables.isPlaceholderOperator(''), false);
  assert.equal(__testables.isPlaceholderOperator(null), false);
});

test('buildSettleQuery limits placeholder cleanup by tenant and selected fields', () => {
  const tenantId = 'tenant-1';

  assert.deepEqual(__testables.buildSettleQuery({ tenantId, field: 'ticket' }), {
    tenantId,
    ticket_person: { $regex: /^current_user$/i },
  });

  assert.deepEqual(__testables.buildSettleQuery({ tenantId, field: 'return' }), {
    tenantId,
    return_person: { $regex: /^current_user$/i },
  });

  assert.deepEqual(__testables.buildSettleQuery({ tenantId, field: 'both' }), {
    tenantId,
    $or: [
      { ticket_person: { $regex: /^current_user$/i } },
      { return_person: { $regex: /^current_user$/i } },
    ],
  });
});

test('buildSettleUpdate sets selected placeholder fields to replacement value', () => {
  assert.deepEqual(__testables.buildSettleUpdate({ field: 'ticket', replacement: '张三' }), {
    $set: { ticket_person: '张三' },
  });

  assert.deepEqual(__testables.buildSettleUpdate({ field: 'return', replacement: '李四' }), {
    $set: { return_person: '李四' },
  });

  assert.deepEqual(__testables.buildSettleUpdate({ field: 'both', replacement: '' }), {
    $set: {
      ticket_person: '',
      return_person: '',
    },
  });
});
