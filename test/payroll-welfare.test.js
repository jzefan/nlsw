const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const PayrollStatement = require('../models/PayrollStatement');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const payroll = require('../controllers/api/payroll');
const { COMPONENT_KEYS, validatePayrollComponents } = require('../utils/payroll-calculations');
const { WELFARE_HOLIDAY_OPTIONS, applyWelfareEntry, sumWelfareItems } = require('../utils/payroll-welfare');
const { _coordination: monthCoordination } = require('../controllers/api/attendance-ledger');

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
function ledgerQuery(status) {
  return { select() { return this; }, lean: async () => ({ status }) };
}
function components(overrides = {}) {
  return { ...Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0])), ...overrides };
}
function finance(tenantId) {
  return { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
}
function employee(employeeId, name, employeeNo) {
  return { _id: employeeId, employeeNo, profile: { name }, department: '物流', status: 'active' };
}
function stubLock(t, events) {
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', async (_tenantId, month) => { events.push(`lock:${month}`); return { month, token: 'test-lock' }; });
  t.mock.method(monthCoordination, 'releaseMonthMutationLock', async (_tenantId, lock) => { events.push(`release:${lock.month}`); });
}

test('节日清单由后端下发：7 个法定节假日 + 「其他」，前端不另写一份', () => {
  assert.deepEqual(WELFARE_HOLIDAY_OPTIONS.map(item => item.key), [
    'new_year', 'spring_festival', 'qingming', 'labour_day', 'dragon_boat', 'mid_autumn', 'national_day', 'other',
  ]);
  assert.equal(WELFARE_HOLIDAY_OPTIONS.at(-1).label, '其他');
  // 清单里不能出现重复 key，否则下拉框会渲染出同名两项
  assert.equal(new Set(WELFARE_HOLIDAY_OPTIONS.map(item => item.key)).size, WELFARE_HOLIDAY_OPTIONS.length);
});

test('同一节日重复录入是覆盖而不是累加，「其他」按自填名称归一', () => {
  const first = applyWelfareEntry([], { holiday: 'national_day', holidayLabel: '国庆节', amountCents: 30_000 });
  assert.equal(first.replaced, false);
  assert.equal(first.items.length, 1);
  assert.equal(sumWelfareItems(first.items), 30_000);

  // 用户定的口径：中秋先发 200、改成 300 得到 300，不是 500
  const midAutumn = applyWelfareEntry(first.items, { holiday: 'mid_autumn', holidayLabel: '中秋', amountCents: 20_000 });
  const replaced = applyWelfareEntry(midAutumn.items, { holiday: 'mid_autumn', holidayLabel: '中秋', amountCents: 30_000 });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.previousAmountCents, 20_000);
  assert.equal(replaced.items.length, 2, '覆盖不新增条目');
  assert.equal(sumWelfareItems(replaced.items), 60_000, '国庆 300 + 中秋 300');

  // 「其他」：同名算同一笔，不同名各自一笔
  const other1 = applyWelfareEntry([], { holiday: 'other', holidayLabel: '开业纪念日', amountCents: 50_000 });
  const other2 = applyWelfareEntry(other1.items, { holiday: 'other', holidayLabel: '开业纪念日', amountCents: 80_000 });
  assert.equal(other2.replaced, true);
  assert.equal(sumWelfareItems(other2.items), 80_000);
  const other3 = applyWelfareEntry(other2.items, { holiday: 'other', holidayLabel: '年会', amountCents: 10_000 });
  assert.equal(other3.replaced, false);
  assert.equal(sumWelfareItems(other3.items), 90_000);
});

test('批量福利给当月全员写草稿，金额进收入合计与实发，且不发布', async t => {
  const tenantId = id();
  const first = id();
  const second = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ledgerQuery('closed'));
  t.mock.method(User, 'find', () => query([employee(first, '张三', 'E-1'), employee(second, '李四', 'E-2')]));
  // 张三已有草稿与中秋福利，李四本月还没有任何工资数据
  t.mock.method(PayrollStatement, 'find', () => query([
    { employeeId: first, version: 3, currentPublishedRevision: null, draft: { components: components({ basicPayCents: 800_000, welfareCents: 20_000 }), welfareItems: [{ holiday: 'mid_autumn', holidayLabel: '中秋', amountCents: 20_000 }] } },
  ]));
  const created = [];
  const updates = [];
  t.mock.method(PayrollStatement, 'create', async doc => { created.push(doc); return doc; });
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { updates.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.batchWelfare({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { holiday: 'national_day', amountCents: 30_000 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 2);
  assert.equal(res.body.data.failed, 0);
  assert.equal(res.body.data.created, 1);
  assert.equal(res.body.data.holidayLabel, '国庆节');
  // 张三：中秋 200 保留，国庆 300 覆盖进来 → 福利合计 500
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.version, 3, '覆盖草稿要带乐观锁版本条件');
  assert.equal(updates[0].update.$set.draft.components.welfareCents, 50_000);
  assert.deepEqual(updates[0].update.$set.draft.welfareItems.map(item => [item.holiday, item.amountCents]), [['mid_autumn', 20_000], ['national_day', 30_000]]);
  // 李四没有工资数据，以 0 起底新建：只有福利这一项，不去猜薪资标准
  assert.equal(created.length, 1);
  assert.equal(created[0].draft.components.welfareCents, 30_000);
  assert.equal(created[0].draft.components.basicPayCents, 0);
  assert.equal(created[0].draft.totals.incomeSubtotalCents, 30_000);
  assert.equal(created[0].draft.totals.netPayCents, 30_000);
  assert.equal(created[0].version, 1);
  assert.deepEqual(events, ['lock:2026-09', 'release:2026-09'], '抢锁与释放各一次，台账状态不逐人查');
});

test('批量福利：同一节日再录一次是覆盖，回报旧金额', async t => {
  const tenantId = id();
  const employeeId = id();
  stubLock(t, []);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ledgerQuery('closed'));
  t.mock.method(User, 'find', () => query([employee(employeeId, '张三', 'E-1')]));
  t.mock.method(PayrollStatement, 'find', () => query([
    { employeeId, version: 2, currentPublishedRevision: null, draft: { components: components({ basicPayCents: 800_000, welfareCents: 20_000 }), welfareItems: [{ holiday: 'mid_autumn', holidayLabel: '中秋', amountCents: 20_000 }] } },
  ]));
  const updates = [];
  t.mock.method(PayrollStatement, 'create', () => assert.fail('已有工资条时不应新建'));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { updates.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'mid_autumn', amountCents: 30_000 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 1);
  assert.equal(res.body.data.results[0].replaced, true);
  assert.equal(res.body.data.results[0].previousAmountCents, 20_000);
  assert.equal(res.body.data.results[0].welfareCents, 30_000, '改成 300 得 300，不是 200 + 300');
  assert.equal(updates[0].update.$set.draft.components.welfareCents, 30_000);
  assert.equal(updates[0].update.$set.draft.welfareItems.length, 1);
  // 基本工资不能被福利操作改掉
  assert.equal(updates[0].update.$set.draft.components.basicPayCents, 800_000);
});

test('批量福利：已发布且当月已结账的人被跳过，草稿状态的人照常写入', async t => {
  const tenantId = id();
  const locked = id();
  const editable = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('closed'); });
  t.mock.method(User, 'find', () => query([employee(locked, '张三', 'E-1'), employee(editable, '李四', 'E-2')]));
  t.mock.method(PayrollStatement, 'find', () => query([
    { employeeId: locked, version: 5, currentPublishedRevision: 2, revisions: [{ revision: 2, components: components({ basicPayCents: 800_000 }) }] },
    { employeeId: editable, version: 1, currentPublishedRevision: null, revisions: [], draft: { components: components({ basicPayCents: 900_000 }) } },
  ]));
  const updates = [];
  t.mock.method(PayrollStatement, 'create', () => assert.fail('两人都有工资条，不应新建'));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { updates.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'mid_autumn', amountCents: 20_000 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 1);
  assert.equal(res.body.data.failed, 1);
  assert.match(res.body.data.results[0].error, /撤回/);
  assert.equal(updates.length, 1, '只改没被结账锁住的那个人');
  assert.equal(updates[0].update.$set.draft.components.basicPayCents, 900_000, '原有工资项不能被福利操作改掉');
  assert.equal(updates[0].update.$set.draft.components.welfareCents, 20_000);
  assert.equal(res.body.data.overwrittenPublished, 0);
  assert.deepEqual(events, ['lock:2026-09', 'check-closed', 'release:2026-09'], '台账状态整批只查一次');
});

test('批量福利：未结账月份可以给已发布的人写修订草稿（沿用发布版金额作基准）', async t => {
  const tenantId = id();
  const employeeId = id();
  stubLock(t, []);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ledgerQuery('open'));
  t.mock.method(User, 'find', () => query([employee(employeeId, '张三', 'E-1')]));
  // 没有草稿、只有第 2 版发布：基准金额取发布版，不归零
  t.mock.method(PayrollStatement, 'find', () => query([
    { employeeId, version: 6, currentPublishedRevision: 2, revisions: [{ revision: 2, components: components({ basicPayCents: 800_000, performancePayCents: 100_000 }) }] },
  ]));
  const updates = [];
  t.mock.method(PayrollStatement, 'create', () => assert.fail('已有工资条时不应新建'));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { updates.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'national_day', amountCents: 30_000 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 1);
  assert.equal(res.body.data.overwrittenPublished, 1, '已发布的人被覆盖成未发布草稿，要提醒重新发布');
  assert.equal(updates[0].update.$set.draft.components.basicPayCents, 800_000);
  assert.equal(updates[0].update.$set.draft.components.performancePayCents, 100_000, '沿用发布版的其他工资项');
  assert.equal(updates[0].update.$set.draft.components.welfareCents, 30_000);
  assert.equal(updates[0].update.$set.draft.totals.netPayCents, 930_000);
});

test('批量福利只对财务开放，节日清单薪资读者可读', async t => {
  const tenantId = id();
  const reader = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['general_manager'] };
  t.mock.method(User, 'find', () => assert.fail('没有财务角色不应进入写库流程'));

  const writeRes = response();
  await payroll.batchWelfare({ user: reader, tenantId, params: { month: '2026-09' }, body: { holiday: 'national_day', amountCents: 30_000 } }, writeRes);
  assert.equal(writeRes.statusCode, 403);

  const readRes = response();
  await payroll.listWelfareHolidays({ user: reader, tenantId }, readRes);
  assert.equal(readRes.statusCode, 200);
  assert.equal(readRes.body.data.holidays.length, WELFARE_HOLIDAY_OPTIONS.length);
});

test('批量福利的入参校验：金额非法、未知节日、「其他」缺名称都在写库前被拒', async t => {
  const tenantId = id();
  t.mock.method(PayrollStatement, 'create', () => assert.fail('入参不合法不应写库'));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', () => assert.fail('入参不合法不应写库'));

  const badMonth = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-13' }, body: { holiday: 'national_day', amountCents: 30_000 } }, badMonth);
  assert.equal(badMonth.statusCode, 400);

  const badAmount = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'national_day', amountCents: -1 } }, badAmount);
  assert.equal(badAmount.statusCode, 400);
  assert.match(badAmount.body.error, /金额/);

  const badHoliday = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'halloween', amountCents: 1 } }, badHoliday);
  assert.equal(badHoliday.statusCode, 400);
  assert.match(badHoliday.body.error, /节假日/);

  const missingLabel = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'other', amountCents: 1 } }, missingLabel);
  assert.equal(missingLabel.statusCode, 400);
  assert.match(missingLabel.body.error, /节日名称/);

  const longLabel = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'other', holidayLabel: 'x'.repeat(21), amountCents: 1 } }, longLabel);
  assert.equal(longLabel.statusCode, 400);
  assert.match(longLabel.body.error, /20/);
});

test('批量福利：入参不合法时连月份锁都不抢', async t => {
  const tenantId = id();
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', () => assert.fail('入参不合法不应抢锁'));
  t.mock.method(User, 'find', () => assert.fail('入参不合法不应查员工'));

  const res = response();
  await payroll.batchWelfare({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { holiday: 'halloween', amountCents: 1 } }, res);
  assert.equal(res.statusCode, 400);
});

test('旧工资条没有福利明细时按合计兜底，不显示成 0；明细与合计对不上时补差', () => {
  const { normalizeWelfareItems } = payroll._test;
  // 功能上线前录的工资条：只有 welfareCents 合计，没有明细
  const legacy = normalizeWelfareItems(undefined, components({ basicPayCents: 800_000, welfareCents: 30_000 }));
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].amountCents, 30_000);
  assert.equal(sumWelfareItems(legacy), 30_000, '兜底明细的合计必须与工资条一致');

  // 手工改过福利金额、明细没跟上：以合计为准补一笔差额
  const drifted = normalizeWelfareItems([{ holiday: 'mid_autumn', holidayLabel: '中秋', amountCents: 20_000 }], components({ welfareCents: 50_000 }));
  assert.equal(sumWelfareItems(drifted), 50_000);
  assert.equal(drifted.length, 2);

  // 没有福利时不该凭空造一条
  assert.deepEqual(normalizeWelfareItems([], components()), []);
});

test('福利进收入合计与实发金额：与后端合计口径一致', () => {
  const base = components({ basicPayCents: 800_000, employeeSocialInsuranceCents: 50_000 });
  const before = validatePayrollComponents(base);
  const after = validatePayrollComponents({ ...base, welfareCents: 30_000 });
  assert.equal(before.ok && after.ok, true);
  assert.equal(after.totals.incomeSubtotalCents - before.totals.incomeSubtotalCents, 30_000, '福利计入收入合计');
  assert.equal(after.totals.payableBeforePersonalDeductionsCents - before.totals.payableBeforePersonalDeductionsCents, 30_000);
  assert.equal(after.totals.netPayCents - before.totals.netPayCents, 30_000, '福利计入实发金额');
  // 福利不计公司承担，也不进考勤扣款
  assert.equal(after.totals.totalCompensationCents - before.totals.totalCompensationCents, 30_000);
  assert.equal(after.totals.attendanceDeductionCents, before.totals.attendanceDeductionCents);
});
