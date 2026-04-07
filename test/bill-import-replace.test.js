const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../controllers/api/bill');

test('resolveBillImportAction creates a new bill when no existing bill matches', () => {
  const result = __testables.resolveBillImportAction(null);

  assert.equal(result.action, 'create');
});

test('resolveBillImportAction replaces an existing bill when status is 新建', () => {
  const result = __testables.resolveBillImportAction({ status: '新建' });

  assert.equal(result.action, 'replace');
});

test('resolveBillImportAction skips import when existing bill status is not 新建', () => {
  const result = __testables.resolveBillImportAction({ status: '已配发' });

  assert.equal(result.action, 'skip');
});

test('getBillImportIdentity uses order_no, bill_no, and order_item_no as composite identity', () => {
  const result = __testables.getBillImportIdentity({
    orderNo: '12345678901',
    orderItemNo: '7',
    billNo: 'BILL-001',
  });

  assert.deepEqual(result, {
    order: '12345678901-007',
    order_no: '12345678901',
    order_item_no: 7,
    bill_no: 'BILL-001',
  });
});

test('buildBillListBaseQuery maps list filters for export consistently', () => {
  const result = __testables.buildBillListBaseQuery({
    billNo: 'BILL',
    orderNo: '12345678901',
    billingName: '客户A',
    brandNo: 'Q235',
    contractNo: 'HT-1',
    status: '新建',
    leftNumOnly: true,
    creater: 'tester',
  });

  assert.deepEqual(result, {
    bill_no: { $regex: 'BILL', $options: 'i' },
    order_no: '12345678901',
    billing_name: '客户A',
    brand_no: { $regex: 'Q235', $options: 'i' },
    contract_no: { $regex: 'HT-1', $options: 'i' },
    status: '新建',
    left_num: { $gt: 0 },
    creater: 'tester',
  });
});

test('applyBillImportData clears weight and block count for 单定 bills', () => {
  const bill = {};

  __testables.applyBillImportData({
    bill,
    row_data: {
      orderNo: '12345678901',
      orderItemNo: '10',
      billNo: 'BILL-001',
      billingName: '客户A',
      sizeType: '单定',
      thickness: 10,
      width: 1000,
      len: 6000,
      weight: 1.5,
      blockNum: 2,
      totalWeight: 3,
    },
    req: { user: { userid: 'tester' } },
    allBrandNo: [],
  });

  assert.equal(bill.size_type, '单定');
  assert.equal(bill.weight, 0);
  assert.equal(bill.block_num, 0);
  assert.equal(bill.left_num, 3);
});
