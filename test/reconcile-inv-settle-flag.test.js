const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../scripts/reconcile-inv-settle-flag');

test('settleTypeToBit maps the three settle types to their bit', () => {
  assert.equal(__testables.settleTypeToBit('客户结算'), 1);
  assert.equal(__testables.settleTypeToBit('代收代付结算'), 2);
  assert.equal(__testables.settleTypeToBit('车船结算'), 4);
  assert.equal(__testables.settleTypeToBit('未知类型'), 0);
  assert.equal(__testables.settleTypeToBit(undefined), 0);
});

test('collectRequirements groups bills and ORs the bits of every settle that references them', () => {
  const settles = [
    {
      serial_number: 'JS202605130027008',
      settle_type: '客户结算',
      bills: [
        { bill_id: 'b1', inv_no: 'inv-a' },
        { bill_id: 'b1', inv_no: 'inv-b' },
        { bill_id: 'b2', inv_no: 'inv-c' },
      ],
    },
    {
      serial_number: 'JS202605140027009',
      settle_type: '代收代付结算',
      bills: [{ bill_id: 'b1', inv_no: 'inv-a' }],
    },
    {
      serial_number: 'JS202605150027010',
      settle_type: '未知类型',
      bills: [{ bill_id: 'b3', inv_no: 'inv-d' }],
    },
  ];

  const requirements = __testables.collectRequirements(settles);

  assert.equal(requirements.has('b3'), false);
  assert.equal(requirements.get('b1').bitsByInvNo.get('inv-a'), 1 | 2);
  assert.equal(requirements.get('b1').bitsByInvNo.get('inv-b'), 1);
  assert.equal(requirements.get('b2').bitsByInvNo.get('inv-c'), 1);
  assert.deepEqual(requirements.get('b2').sources, ['JS202605130027008(客户结算)']);
});

test('planBillRepair restores the missing customer bit and upgrades the bill status', () => {
  const bill = {
    _id: 'b1',
    bill_no: 'LQ202605012-1',
    billing_name: '江阴市新区金属物资有限公司',
    status: '已配发',
    status_flag: 2,
    settle_flag: 0,
    invoices: [{ inv_no: '01202605120030001', inv_settle_flag: 0 }],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['01202605120030001', 1]]),
    sources: ['JS202605130027008(客户结算)'],
  });

  assert.notEqual(plan, null);
  assert.deepEqual(plan.set, {
    'invoices.0.inv_settle_flag': 1,
    settle_flag: 1,
    status: '已结算',
    status_flag: 3,
  });
  assert.equal(plan.before.settle_flag, 0);
  assert.equal(plan.before.status, '已配发');
  assert.equal(plan.summary.status, '已配发 -> 已结算');
});

test('planBillRepair keeps the other settle bits of a partially settled bill', () => {
  const bill = {
    _id: 'b2',
    status: '已结算',
    status_flag: 3,
    settle_flag: 2,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 2 }],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: ['JS(客户结算)'],
  });

  assert.deepEqual(plan.set, {
    'invoices.0.inv_settle_flag': 3,
    settle_flag: 3,
  });
  assert.equal(plan.set.status, undefined);
});

test('planBillRepair returns null when nothing is missing', () => {
  const bill = {
    _id: 'b3',
    status: '已结算',
    status_flag: 3,
    settle_flag: 1,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 1 }],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: ['JS(客户结算)'],
  });

  assert.equal(plan, null);
});

test('planBillRepair only touches the invoices named by the settle', () => {
  const bill = {
    _id: 'b4',
    status: '已配发',
    status_flag: 2,
    settle_flag: 0,
    invoices: [
      { inv_no: 'inv-a', inv_settle_flag: 0 },
      { inv_no: 'inv-b', inv_settle_flag: 0 },
    ],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: ['JS(客户结算)'],
  });

  assert.deepEqual(Object.keys(plan.set), [
    'invoices.0.inv_settle_flag',
    'settle_flag',
    'status',
    'status_flag',
  ]);
  assert.equal(plan.set['invoices.1.inv_settle_flag'], undefined);
});

test('planBillRepair does not downgrade an already invoiced bill status', () => {
  const bill = {
    _id: 'b5',
    status: '已开票',
    status_flag: 4,
    settle_flag: 1,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 0 }],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: ['JS(客户结算)'],
  });

  assert.deepEqual(plan.set, { 'invoices.0.inv_settle_flag': 1 });
  assert.equal(plan.summary.status, '已开票 (不变)');
});

test('planBillRepair ignores bills without invoices', () => {
  assert.equal(__testables.planBillRepair({ _id: 'x', invoices: [] }, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: [],
  }), null);
  assert.equal(__testables.planBillRepair(null, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: [],
  }), null);
});

test('planBillRepair ignores invoice numbers the settle does not mention', () => {
  const bill = {
    _id: 'b6',
    status: '已配发',
    settle_flag: 0,
    invoices: [{ inv_no: 'inv-x', inv_settle_flag: 0 }],
  };

  const plan = __testables.planBillRepair(bill, {
    bitsByInvNo: new Map([['inv-a', 1]]),
    sources: ['JS(客户结算)'],
  });

  assert.equal(plan, null);
});
