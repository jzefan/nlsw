const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Bill = require('../models/Bill');
const Invoice = require('../models/Invoice');
const Settle = require('../models/Settle');
const settleController = require('../controllers/api/settle');
const ticketController = require('../controllers/api/ticket');

const TENANT_ID = new mongoose.Types.ObjectId();
const BILL_ID = new mongoose.Types.ObjectId();

function makeReq(body) {
  return {
    tenantId: TENANT_ID,
    user: { userid: 'tester', no: 1 },
    body,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function chainable(value) {
  return {
    select: () => chainable(value),
    lean: () => chainable(value),
    sort: () => chainable(value),
    limit: () => chainable(value),
    exec: async () => value,
  };
}

function restoreStatics() {
  delete Bill.findOne;
  delete Bill.find;
  delete Bill.updateOne;
  delete Invoice.find;
  delete Settle.findOne;
  delete Settle.deleteOne;
}

test('markNotRequireSettle 只清代收代付位，不清掉客户结算位（前端回传的是旧整值）', async (t) => {
  t.after(restoreStatics);

  const bill = {
    _id: BILL_ID,
    tenantId: TENANT_ID,
    settle_flag: 1, // 客户结算已完成
    status: '已结算',
    status_flag: 3,
    left_num: 0,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 1 }],
    saved: false,
    async save() {
      this.saved = true;
    },
  };

  Bill.findOne = () => chainable(bill);
  Invoice.find = () => chainable([]);

  const res = makeRes();
  await settleController.markNotRequireSettle(
    makeReq({
      // 前端页面缓存里的旧值：settle_flag 传的是它本地算出来的 0
      nonSettleObj: [{ bid: String(BILL_ID), inv_no: 'inv-a', settle_flag: 0 }],
      settle_type: 'COLLECTION',
    }),
    res,
  );

  assert.equal(res.body.ok, true);
  assert.equal(bill.saved, true);
  // 客户结算位必须保留
  assert.equal(bill.invoices[0].inv_settle_flag, 1);
  assert.equal(bill.settle_flag, 1);
});

test('cancelNotRequireSettle 不回写前端传来的旧整值', async (t) => {
  t.after(restoreStatics);

  const bill = {
    _id: BILL_ID,
    tenantId: TENANT_ID,
    settle_flag: 1,
    status: '已结算',
    status_flag: 3,
    left_num: 0,
    collection_price: -1,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 1 }],
    async save() {},
  };

  Bill.findOne = () => chainable(bill);
  Invoice.find = () => chainable([]);

  const res = makeRes();
  await settleController.cancelNotRequireSettle(
    makeReq({
      nonSettleObj: [{ bid: String(BILL_ID), inv_no: 'inv-a', settle_flag: 0 }],
      settle_type: 'COLLECTION',
    }),
    res,
  );

  assert.equal(res.body.ok, true);
  assert.equal(bill.collection_price, 0);
  assert.equal(bill.invoices[0].inv_settle_flag, 1);
  assert.equal(bill.settle_flag, 1);
});

function makeDeleteSettleStubs(options = {}) {
  const events = [];
  const updates = [];
  const settle = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    serial_number: 'JS202605130027008',
    settle_type: '客户结算',
    status: options.settleStatus || '已结算',
    bills: [{ bill_id: BILL_ID, inv_no: 'inv-a', settle_flag: 1 }],
  };

  const bill = {
    _id: BILL_ID,
    tenantId: TENANT_ID,
    settle_flag: 1,
    status: '已结算',
    status_flag: 3,
    left_num: 0,
    invoices: [{ inv_no: 'inv-a', inv_settle_flag: 1 }],
    // 故意不给 save()：改动后必须走字段级 updateOne，不能整文档 save
  };

  Settle.findOne = () => chainable(settle);
  Bill.find = () => chainable([bill]);
  Invoice.find = () => chainable([]);
  Bill.updateOne = async (filter, update) => {
    events.push('bill.update');
    updates.push({ filter, update });
    if (options.failUpdateOnCall === updates.length) {
      throw new Error('模拟数据库错误');
    }
    return { modifiedCount: 1 };
  };
  Settle.deleteOne = async () => {
    events.push('settle.delete');
    return { deletedCount: 1 };
  };

  return { events, updates, settle, bill };
}

test('deleteSettle 用字段级 $set 回退提单，回退成功后才删结算单', async (t) => {
  t.after(restoreStatics);

  const { events, updates } = makeDeleteSettleStubs();
  const res = makeRes();

  await ticketController.deleteSettle(
    makeReq({ settle_ids: [String(new mongoose.Types.ObjectId())] }),
    res,
  );

  assert.equal(res.body.ok, true);
  assert.equal(updates.length, 1);
  // left_num 本来就是 0，不需要写；这里断言的是「回退提单 + 同步状态」的完整字段集合
  assert.deepEqual(updates[0].update.$set, {
    'invoices.0.inv_settle_flag': 0,
    settle_flag: 0,
    status: '已配发',
    status_flag: 2,
  });
  assert.equal(String(updates[0].filter.tenantId), String(TENANT_ID));
  assert.deepEqual(events, ['bill.update', 'settle.delete']);
});

test('deleteSettle 回退失败时不删结算单，也不静默成功', async (t) => {
  t.after(restoreStatics);

  const { events } = makeDeleteSettleStubs({ failUpdateOnCall: 1 });
  const res = makeRes();

  await ticketController.deleteSettle(
    makeReq({ settle_ids: [String(new mongoose.Types.ObjectId())] }),
    res,
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.failed.length, 1);
  // 关键：结算单没被删，凭提单上的回退结果重试即可
  assert.deepEqual(events, ['bill.update']);
});

test('deleteSettle 对非「已结算」状态仍按业务拒绝返回 ok:false', async (t) => {
  t.after(restoreStatics);

  const { events } = makeDeleteSettleStubs({ settleStatus: '已回款' });
  const res = makeRes();

  await ticketController.deleteSettle(
    makeReq({ settle_ids: [String(new mongoose.Types.ObjectId())] }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /不能删除/);
  assert.deepEqual(events, []);
});
