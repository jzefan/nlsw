const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const PayrollStatement = require('../models/PayrollStatement');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const payroll = require('../controllers/api/payroll');
const { COMPONENT_KEYS } = require('../utils/payroll-calculations');
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
function totals(overrides = {}) {
  return {
    incomeSubtotalCents: 0,
    employerContributionCents: 0,
    totalCompensationCents: 0,
    attendanceDeductionCents: 0,
    payableBeforePersonalDeductionsCents: 0,
    netPayCents: 0,
    ...overrides,
  };
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

test('导入按月份写草稿：新建、覆盖已有草稿并标记已发布过的人', async t => {
  const tenantId = id();
  const first = id();
  const second = id();
  const created = [];
  const updates = [];
  t.mock.method(User, 'find', () => query([employee(first, '张三', 'E-1'), employee(second, '李四', 'E-2')]));
  t.mock.method(PayrollStatement, 'create', async doc => { created.push(doc); return doc; });
  let lookups = 0;
  t.mock.method(PayrollStatement, 'findOne', () => {
    lookups += 1;
    // 第一行：当月还没有工资条；第二行：已有工资条，且当前有效版本是已发布版本（第 2 版）
    return lookups === 1 ? query(null) : query({ _id: id(), version: 3, currentPublishedRevision: 2 });
  });
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { updates.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.importDrafts({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { rows: [
      { employeeId: String(first), components: components({ basicPayCents: 800_000 }) },
      { employeeId: String(second), components: components({ basicPayCents: 900_000 }) },
    ] },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 2);
  assert.equal(res.body.data.failed, 0);
  assert.equal(res.body.data.overwrittenPublished, 1);
  assert.deepEqual(res.body.data.results.map(item => [item.name, item.status, item.hadPublished]), [['张三', 'created', false], ['李四', 'updated', true]]);
  assert.equal(created.length, 1);
  assert.equal(created[0].month, '2026-09');
  assert.equal(created[0].version, 1);
  assert.equal(created[0].draft.components.basicPayCents, 800_000);
  assert.equal(created[0].draft.totals.incomeSubtotalCents, 800_000);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.version, 3, '覆盖草稿要带乐观锁版本条件');
  assert.equal(updates[0].update.$set.draft.components.basicPayCents, 900_000);
  assert.equal(updates[0].update.$inc.version, 1);
});

test('导入逐行回报问题：员工不存在、金额非法都不影响其他行', async t => {
  const tenantId = id();
  const known = id();
  const other = id();
  const missing = id();
  t.mock.method(User, 'find', () => query([employee(known, '张三', 'E-1'), employee(other, '王五', 'E-3')]));
  t.mock.method(PayrollStatement, 'findOne', () => query(null));
  const created = [];
  t.mock.method(PayrollStatement, 'create', async doc => { created.push(doc); return doc; });

  const res = response();
  await payroll.importDrafts({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { rows: [
      { employeeId: String(missing), components: components() },
      { employeeId: String(known), components: components({ basicPayCents: -1 }) },
      { employeeId: String(other), components: components({ basicPayCents: 100_000 }) },
    ] },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 1);
  assert.equal(res.body.data.failed, 2);
  assert.deepEqual(res.body.data.results.map(item => item.status), ['failed', 'failed', 'created']);
  assert.match(res.body.data.results[0].error, /员工不存在/);
  assert.match(res.body.data.results[1].error, /basicPayCents/);
  assert.equal(created.length, 1, '有问题的行不应写库');
});

test('导入拒绝同一员工出现两行', async t => {
  const tenantId = id();
  const employeeId = id();
  t.mock.method(User, 'find', () => query([employee(employeeId, '张三', 'E-1')]));
  t.mock.method(PayrollStatement, 'findOne', () => assert.fail('重复员工应在写库前被拒绝'));

  const res = response();
  await payroll.importDrafts({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { rows: [
      { employeeId: String(employeeId), components: components() },
      { employeeId: String(employeeId), components: components() },
    ] },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /重复员工/);
});

test('导入与批量发布都只对财务开放', async t => {
  const tenantId = id();
  const reader = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['general_manager'] };
  t.mock.method(User, 'find', () => assert.fail('没有财务角色不应进入写库流程'));

  const importRes = response();
  await payroll.importDrafts({ user: reader, tenantId, params: { month: '2026-09' }, body: { rows: [{ employeeId: String(id()), components: components() }] } }, importRes);
  assert.equal(importRes.statusCode, 403);

  const publishRes = response();
  await payroll.publishBatch({ user: reader, tenantId, params: { month: '2026-09' }, body: { employeeIds: [String(id())] } }, publishRes);
  assert.equal(publishRes.statusCode, 403);
});

test('批量发布在抢锁后统一校验当月考勤结账，未结账整批拒绝', async t => {
  const tenantId = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('open'); });
  t.mock.method(PayrollStatement, 'findOneAndUpdate', () => assert.fail('台账未结账不应写入'));

  const res = response();
  await payroll.publishBatch({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { employeeIds: [String(id())] },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /考勤结账/);
  assert.deepEqual(events, ['lock:2026-09', 'check-closed', 'release:2026-09']);
});

test('批量发布逐人独立：有草稿的发布成功，没草稿的单独失败并回报原因', async t => {
  const tenantId = id();
  const withDraft = id();
  const noDraft = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('closed'); });
  t.mock.method(User, 'find', () => query([employee(withDraft, '张三', 'E-1'), employee(noDraft, '李四', 'E-2')]));
  let lookups = 0;
  t.mock.method(PayrollStatement, 'findOne', () => {
    lookups += 1;
    return lookups === 1
      ? query({ _id: id(), tenantId, month: '2026-09', version: 2, revisions: [], employee: { name: '张三' }, draft: { components: components({ basicPayCents: 700_000 }), totals: totals({ incomeSubtotalCents: 700_000 }) } })
      : query({ _id: id(), tenantId, month: '2026-09', version: 1, revisions: [] });
  });
  const writes = [];
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { writes.push({ filter, update }); return { _id: filter._id }; });

  const res = response();
  await payroll.publishBatch({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { employeeIds: [String(withDraft), String(noDraft)] },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.published, 1);
  assert.equal(res.body.data.failed, 1);
  assert.deepEqual(res.body.data.results.map(item => [item.name, item.status]), [['张三', 'published'], ['李四', 'failed']]);
  assert.equal(res.body.data.results[0].revision, 1);
  assert.match(res.body.data.results[1].error, /草稿/);
  assert.equal(writes.length, 1, '只有有草稿的人会被写入');
  assert.equal(writes[0].update.$set.currentPublishedRevision, 1);
  assert.deepEqual(events, ['lock:2026-09', 'check-closed', 'release:2026-09'], '台账只校验一次，不逐人查');
});

test('批量发布名单里的员工 id 必须先校验，重复或非法直接拒绝', async t => {
  const tenantId = id();
  const employeeId = id();
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', () => assert.fail('非法名单不应抢锁'));

  const duplicate = response();
  await payroll.publishBatch({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { employeeIds: [String(employeeId), String(employeeId)] } }, duplicate);
  assert.equal(duplicate.statusCode, 400);

  const invalid = response();
  await payroll.publishBatch({ user: finance(tenantId), tenantId, params: { month: '2026-09' }, body: { employeeIds: ['not-an-object-id'] } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const empty = response();
  await payroll.publishBatch({ user: finance(tenantId), tenantId, params: { month: '2026-13' }, body: { employeeIds: [String(employeeId)] } }, empty);
  assert.equal(empty.statusCode, 400);
});

test('发布草稿的核心动作对没有草稿的工资条拒绝写入', async t => {
  const tenantId = id();
  t.mock.method(PayrollStatement, 'findOne', () => query({ _id: id(), version: 1, revisions: [], currentPublishedRevision: 1 }));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', () => assert.fail('没有草稿不应发布'));

  const result = await payroll._test.publishDraftStatement({
    tenantId,
    employeeId: String(id()),
    month: '2026-09',
    userId: id(),
    requireClosedLedger: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /草稿/);
});

test('单条发布：台账未结账默认拦住，只有强制发布才放行并在工资条上留痕', async t => {
  const tenantId = id();
  const employeeId = id();
  const events = [];
  const statement = {
    _id: id(), tenantId, employeeId, month: '2026-09', version: 1, currentPublishedRevision: null,
    employee: { employeeNo: 'E-1', name: '张三', department: '物流' }, revisions: [], events: [], payments: [],
    draft: { components: components({ basicPayCents: 700_000 }), totals: totals({ incomeSubtotalCents: 700_000, netPayCents: 700_000 }) },
  };
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('open'); });
  t.mock.method(PayrollStatement, 'findOne', () => query(statement));
  const writes = [];
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (_filter, update) => {
    writes.push(update);
    statement.revisions.push(update.$push.revisions);
    if (update.$push.events) statement.events.push(update.$push.events);
    statement.currentPublishedRevision = update.$set.currentPublishedRevision;
    delete statement.draft;
    return statement;
  });

  const blocked = response();
  await payroll.publish({ user: finance(tenantId), tenantId, params: { employeeId: String(employeeId), month: '2026-09' }, body: { version: 1 } }, blocked);
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.body.error, /考勤结账/);
  assert.equal(writes.length, 0, '未结账且没开强制发布时不应写库');

  const forced = response();
  await payroll.publish({ user: finance(tenantId), tenantId, params: { employeeId: String(employeeId), month: '2026-09' }, body: { version: 1, force: true } }, forced);
  assert.equal(forced.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].$push.events.action, 'forced_publish', '强制发布必须留痕');
  assert.equal(writes[0].$push.events.ledgerStatus, 'open');
  assert.equal(forced.body.data.forcedPublish.revision, 1);
  assert.equal(forced.body.data.forcedPublish.ledgerStatus, 'open');
  // 两次调用：被拦一次 + 强发一次，每次都是一抢锁、一校验、一释放
  assert.deepEqual(events, ['lock:2026-09', 'check-closed', 'release:2026-09', 'lock:2026-09', 'check-closed', 'release:2026-09']);
});

test('批量发布：未结账开了强制发布就照常发布，每人各写一条 forced_publish 事件', async t => {
  const tenantId = id();
  const employeeId = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('open'); });
  t.mock.method(User, 'find', () => query([employee(employeeId, '张三', 'E-1')]));
  t.mock.method(PayrollStatement, 'findOne', () => query({
    _id: id(), tenantId, month: '2026-09', version: 2, revisions: [], employee: { name: '张三' },
    draft: { components: components({ basicPayCents: 700_000 }), totals: totals({ incomeSubtotalCents: 700_000 }) },
  }));
  const writes = [];
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { writes.push(update); return { _id: filter._id }; });

  const res = response();
  await payroll.publishBatch({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { employeeIds: [String(employeeId)], force: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.published, 1);
  assert.equal(res.body.data.ledgerStatus, 'open');
  assert.equal(res.body.data.forced, true);
  assert.equal(writes[0].$push.events.action, 'forced_publish');
  assert.equal(writes[0].$push.events.ledgerStatus, 'open');
  assert.deepEqual(events, ['lock:2026-09', 'check-closed', 'release:2026-09'], '台账只校验一次，不逐人查');
});

test('台账已结账时不写 forced_publish 事件（强制开关是兜底，不是常态留痕）', async t => {
  const tenantId = id();
  const employeeId = id();
  const events = [];
  stubLock(t, events);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => { events.push('check-closed'); return ledgerQuery('closed'); });
  t.mock.method(User, 'find', () => query([employee(employeeId, '张三', 'E-1')]));
  t.mock.method(PayrollStatement, 'findOne', () => query({
    _id: id(), tenantId, month: '2026-09', version: 1, revisions: [], employee: { name: '张三' },
    draft: { components: components({ basicPayCents: 700_000 }), totals: totals({ incomeSubtotalCents: 700_000 }) },
  }));
  const writes = [];
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => { writes.push(update); return { _id: filter._id }; });

  const res = response();
  await payroll.publishBatch({
    user: finance(tenantId),
    tenantId,
    params: { month: '2026-09' },
    body: { employeeIds: [String(employeeId)], force: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.forced, false);
  assert.equal(writes[0].$push.events, undefined);
});
