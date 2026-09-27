const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PayrollStatement = require('../models/PayrollStatement');
const payroll = require('../controllers/api/payroll');
const { COMPONENT_KEYS } = require('../utils/payroll-calculations');

function id() { return new mongoose.Types.ObjectId(); }
function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function query(value) {
  return {
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}
function components(overrides = {}) {
  return { ...Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0])), ...overrides };
}
function reader(tenantId, payrollRoles = ['finance'], extra = {}) {
  return { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles, ...extra };
}
function request(tenantId, user, { employeeId, month }) {
  return { user, tenantId, params: { employeeId: String(employeeId), month } };
}

test('计税基数累计往月有效版本，本月只用来判断任职月数', async t => {
  const tenantId = id();
  const employeeId = id();
  let queried;
  t.mock.method(PayrollStatement, 'find', criteria => {
    queried = criteria;
    return query([
      // 2 月：已发布版本
      {
        employeeId,
        month: '2026-02',
        currentPublishedRevision: 1,
        revisions: [{ revision: 1, components: components({ basicPayCents: 800_000, employeeSocialInsuranceCents: 42_500, employeeHousingFundCents: 48_000, incomeTaxCents: 5_000 }) }],
      },
      // 3 月：有未发布的修订草稿 → 草稿优先（含 200 元事假扣款）
      {
        employeeId,
        month: '2026-03',
        currentPublishedRevision: null,
        revisions: [],
        draft: { components: components({ basicPayCents: 800_000, personalLeaveDeductionCents: 20_000, employeeSocialInsuranceCents: 42_500, employeeHousingFundCents: 48_000, incomeTaxCents: 4_800 }) },
      },
      // 5 月：已撤回且没有草稿 → 没有有效金额，不计入
      { employeeId, month: '2026-05', currentPublishedRevision: null, revisions: [], events: [{ action: 'withdrawn' }] },
      // 9 月（本月）：草稿，只参与月数判断，不进累计
      { employeeId, month: '2026-09', currentPublishedRevision: null, revisions: [], draft: { components: components({ basicPayCents: 800_000, incomeTaxCents: 123 }) } },
    ]);
  });
  const res = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId), { employeeId, month: '2026-09' }), res);
  assert.equal(res.statusCode, 200);
  // 只取本年度 1 月至本月，靠数据库过滤掉去年与未来月份
  assert.deepEqual(queried, { tenantId, employeeId, month: { $gte: '2026-01', $lte: '2026-09' } });
  const data = res.body.data;
  // 2 月首个有效月份 → 到 9 月共 8 个月，5 月空档不影响任职月数
  assert.equal(data.serviceMonths, 8);
  // 累计收入按「合计应发（不含社保公积金）」口径：8000 + (8000 − 200)
  assert.equal(data.cumulativeIncomeCents, 1_580_000);
  assert.equal(data.cumulativeSpecialDeductionCents, 181_000);
  assert.equal(data.cumulativeWithheldTaxCents, 9_800);
  assert.deepEqual(data.months, [
    { month: '2026-02', source: 'published', incomeCents: 800_000, specialDeductionCents: 90_500, incomeTaxCents: 5_000 },
    { month: '2026-03', source: 'draft', incomeCents: 780_000, specialDeductionCents: 90_500, incomeTaxCents: 4_800 },
  ]);
});

test('本年度没有往月工资条时按 1 个月计，累计全为 0', async t => {
  const tenantId = id();
  const employeeId = id();
  t.mock.method(PayrollStatement, 'find', () => query([]));
  const res = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId), { employeeId, month: '2026-03' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, {
    month: '2026-03',
    serviceMonths: 1,
    cumulativeIncomeCents: 0,
    cumulativeSpecialDeductionCents: 0,
    cumulativeWithheldTaxCents: 0,
    months: [],
  });
});

test('首个有效月份落在本月之前时按连续月数计', async t => {
  const tenantId = id();
  const employeeId = id();
  t.mock.method(PayrollStatement, 'find', () => query([
    { employeeId, month: '2026-07', currentPublishedRevision: 1, revisions: [{ revision: 1, components: components({ basicPayCents: 500_000 }) }] },
  ]));
  const res = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId), { employeeId, month: '2026-09' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.serviceMonths, 3);
  assert.equal(res.body.data.cumulativeIncomeCents, 500_000);
});

test('总经理与董事长可读，普通管理员不可读', async t => {
  const tenantId = id();
  const employeeId = id();
  t.mock.method(PayrollStatement, 'find', criteria => criteria && query([]));

  for (const payrollRoles of [['general_manager']]) {
    const res = response();
    await payroll.getTaxBasis(request(tenantId, reader(tenantId, payrollRoles), { employeeId, month: '2026-09' }), res);
    assert.equal(res.statusCode, 200);
  }
  const chairman = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId, [], { title: '董事长' }), { employeeId, month: '2026-09' }), chairman);
  assert.equal(chairman.statusCode, 200);

  t.mock.method(PayrollStatement, 'find', () => assert.fail('无薪资角色不得读取计税基数'));
  const denied = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId, [], { privilege: ['admin'] }), { employeeId, month: '2026-09' }), denied);
  assert.equal(denied.statusCode, 403);
});

test('月份或员工不合法直接返回 400', async t => {
  const tenantId = id();
  t.mock.method(PayrollStatement, 'find', () => assert.fail('入参不合法时不应查询工资条'));
  const badMonth = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId), { employeeId: id(), month: '2026-9' }), badMonth);
  assert.equal(badMonth.statusCode, 400);
  const badEmployee = response();
  await payroll.getTaxBasis(request(tenantId, reader(tenantId), { employeeId: 'not-an-id', month: '2026-09' }), badEmployee);
  assert.equal(badEmployee.statusCode, 400);
});
