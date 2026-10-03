const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const PayrollStatement = require('../models/PayrollStatement');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const AttendanceRequest = require('../models/AttendanceRequest');
const PayrollStandard = require('../models/PayrollStandard');
const Tenant = require('../models/Tenant');
const payroll = require('../controllers/api/payroll');
const { COMPONENT_KEYS, DEFAULT_CONTRIBUTION_SCHEME, validatePayrollComponents } = require('../utils/payroll-calculations');
const attendanceLedgerApi = require('../controllers/api/attendance-ledger');
const monthCoordination = attendanceLedgerApi._coordination;

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
    sort() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}
function emptyComponents() { return Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0])); }

function stubAttendanceDependencies(t) {
  t.mock.method(PayrollStandard, 'find', () => query([]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
}

test('withdrawing a published wage keeps all amounts available for a one-item correction and revision publish', async t => {
  const tenantId = id(), employeeId = id(), financeId = id();
  const employee = { _id: employeeId, tenantId, status: 'active', profile: { name: '员工' }, department: '物流' };
  const components = { ...emptyComponents(), basicPayCents: 600000, performancePayCents: 80000, lunchAllowanceCents: 5000, overtimeAllowanceCents: 12000, personalLeaveDeductionCents: 15000, employeeSocialInsuranceCents: 55000, employeeHousingFundCents: 30000, incomeTaxCents: 5000 };
  const published = { revision: 1, employee: { name: '员工', department: '物流' }, components: { ...components }, totals: validatePayrollComponents(components).totals, publishedAt: new Date('2026-09-25T00:00:00Z'), publishedBy: financeId };
  const statement = { _id: id(), tenantId, employeeId, month: '2026-09', employee: published.employee, currentPublishedRevision: 1, version: 2, revisions: [published], events: [], payments: [] };
  t.mock.method(PayrollStatement, 'findOne', () => query(statement));
  t.mock.method(PayrollStatement, 'find', () => query([statement]));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (filter, update) => {
    if (filter.version !== statement.version || (filter.currentPublishedRevision !== undefined && filter.currentPublishedRevision !== statement.currentPublishedRevision)) return null;
    Object.assign(statement, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete statement[key];
    for (const [key, item] of Object.entries(update.$push || {})) statement[key].push(item);
    statement.version += update.$inc.version;
    return statement;
  });
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(User, 'findOne', () => query(employee));
  stubAttendanceDependencies(t);
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query({ status: 'closed' }));
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', async () => 'month-lock');
  t.mock.method(monthCoordination, 'releaseMonthMutationLock', async () => {});
  const finance = { _id: financeId, tenantId, status: 'active', payrollRoles: ['finance'] };
  const req = { user: finance, tenantId, params: { employeeId: String(employeeId), month: statement.month }, body: { version: 2, reason: '绩效更正' }, query: { month: statement.month } };
  const withdrawn = response();
  await payroll.withdraw(req, withdrawn);
  assert.equal(withdrawn.body.ok, true);
  assert.deepEqual(withdrawn.body.data.components, components);
  assert.equal(statement.currentPublishedRevision, null);
  assert.deepEqual(published.components, components, 'old published revision remains immutable');
  const employeeView = response();
  await payroll.getMyStatements({ user: employee, tenantId, query: { year: '2026' } }, employeeView);
  assert.equal(employeeView.body.data.rows.length, 0, 'withdrawn draft is invisible to the employee');
  const table = response();
  await payroll.listStatements(req, table);
  assert.deepEqual(table.body.data.rows[0].components, components, 'editor receives the old amounts through the existing table response');
  const corrected = { ...table.body.data.rows[0].components, performancePayCents: 90000 };
  const saved = response();
  await payroll.saveDraft({ ...req, body: { version: statement.version, components: corrected } }, saved);
  assert.equal(saved.body.ok, true);
  const republished = response();
  await payroll.publish({ ...req, body: { version: statement.version } }, republished);
  assert.equal(republished.body.ok, true);
  assert.equal(republished.body.data.revision, 2);
  assert.deepEqual(republished.body.data.components, corrected);
  assert.deepEqual(statement.revisions[0].components, components);
  assert.deepEqual(statement.events.map(event => event.reason), ['绩效更正']);
});

test('withdraw preserves an existing revision draft, recomputes totals and retains payment facts', async t => {
  const tenantId = id(), financeId = id(), employeeId = id();
  const publishedComponents = { ...emptyComponents(), basicPayCents: 600000, performancePayCents: 10000 };
  const draftComponents = { ...publishedComponents, performancePayCents: 80000 };
  const draftAt = new Date('2026-09-27T00:00:00Z');
  const payment = { direction: 'payment', amountCents: 500000, paidAt: draftAt, createdBy: financeId, statementRevision: 1 };
  const statement = { _id: id(), employeeId, employee: { name: '员工' }, version: 4, currentPublishedRevision: 1, revisions: [{ revision: 1, components: publishedComponents, totals: validatePayrollComponents(publishedComponents).totals }], payments: [payment], events: [], draft: { components: draftComponents, totals: { netPayCents: 1 }, updatedBy: financeId, updatedAt: draftAt } };
  t.mock.method(PayrollStatement, 'findOne', () => query(statement));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (_filter, update) => {
    Object.assign(statement, update.$set);
    statement.events.push(update.$push.events);
    statement.version++;
    return statement;
  });
  const res = response();
  await payroll.withdraw({ user: { _id: financeId, tenantId, status: 'active', payrollRoles: ['finance'] }, tenantId, params: { employeeId: String(employeeId), month: '2026-09' }, body: { version: 4, reason: '重新核对绩效' } }, res);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.data.components, draftComponents);
  assert.deepEqual(res.body.data.totals, validatePayrollComponents(draftComponents).totals);
  assert.deepEqual(statement.revisions[0].components, publishedComponents);
  assert.deepEqual(statement.payments, [payment]);
  assert.equal(statement.draft.updatedAt, draftAt);
  assert.equal(statement.version, 5);
});

test('withdraw refuses stale versions, inactive revisions and a concurrent CAS without creating drafts', async t => {
  const tenantId = id(), financeId = id(), employeeId = id();
  for (const scenario of ['stale-version', 'already-withdrawn', 'concurrent-update']) {
    const statement = { _id: id(), employeeId, employee: { name: '员工' }, version: 4, currentPublishedRevision: scenario === 'already-withdrawn' ? null : 1, revisions: [{ revision: 1, components: { ...emptyComponents(), basicPayCents: 600000 }, totals: {} }], payments: [], events: [] };
    t.mock.method(PayrollStatement, 'findOne', () => query(statement));
    t.mock.method(PayrollStatement, 'findOneAndUpdate', async filter => {
      assert.equal(scenario, 'concurrent-update');
      assert.equal(filter.version, 4);
      assert.equal(filter.currentPublishedRevision, 1);
      assert.equal(String(filter.tenantId), String(tenantId));
      return null;
    });
    const res = response();
    await payroll.withdraw({ user: { _id: financeId, tenantId, status: 'active', payrollRoles: ['finance'] }, tenantId, params: { employeeId: String(employeeId), month: '2026-09' }, body: { version: scenario === 'stale-version' ? 3 : 4, reason: '更正' } }, res);
    assert.equal(res.statusCode, 409, scenario);
    assert.equal(statement.draft, undefined);
    assert.equal(statement.version, 4);
    assert.deepEqual(statement.events, []);
  }
});


test('system admin cannot read the company payroll list without an explicit payroll role', async t => {
  t.mock.method(PayrollStatement, 'find', () => assert.fail('unauthorized payroll reads must stop before querying statements'));
  t.mock.method(User, 'find', () => assert.fail('unauthorized payroll reads must stop before querying employees'));
  const res = response();
  await payroll.listStatements({
    user: { _id: id(), tenantId: id(), role: 'member', status: 'active', mustChangePassword: false, privilege: ['admin'], payrollRoles: [] },
    tenantId: id(), query: { month: '2026-09' },
  }, res);
  assert.equal(res.statusCode, 403);
});

test('employee statement query is hard-scoped to the current user and published revisions', async t => {
  const tenantId = id();
  const employeeId = id();
  let queried;
  t.mock.method(PayrollStatement, 'find', criteria => {
    queried = criteria;
    return query([{
      employeeId,
      month: '2026-02',
      currentPublishedRevision: 1,
      revisions: [{ revision: 1, employee: { employeeNo: 'E-1', name: '员工', department: '物流' }, components: emptyComponents(), totals: { incomeSubtotalCents: 10000, employerContributionCents: 0, totalCompensationCents: 10000, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 10000, netPayCents: 10000 }, publishedAt: new Date('2026-03-01T00:00:00Z') }],
      payments: [],
    }]);
  });
  const res = response();
  await payroll.getMyStatements({
    user: { _id: employeeId, tenantId, employeeNo: 'E-1', status: 'active', mustChangePassword: false },
    tenantId,
    query: { year: '2026' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(queried, { tenantId, employeeId, month: { $gte: '2026-01', $lte: '2026-12' } });
  assert.equal(res.body.data.rows.length, 1);
  assert.equal(res.body.data.rows[0].month, '2026-02');
});

test('a draft correction retains latest published totals in company aggregates', async t => {
  const tenantId = id(), employeeId = id();
  const publishedTotals = { incomeSubtotalCents: 10000, employerContributionCents: 2000, totalCompensationCents: 12000, attendanceDeductionCents: 500, payableBeforePersonalDeductionsCents: 11500, netPayCents: 11000 };
  const statement = {
    employeeId, month: '2026-02', currentPublishedRevision: 1, version: 3,
    revisions: [{ revision: 1, employee: { employeeNo: 'E-1', name: '员工', department: '物流' }, components: emptyComponents(), totals: publishedTotals, publishedAt: new Date('2026-03-01T00:00:00Z') }],
    draft: { components: emptyComponents(), totals: { ...publishedTotals, netPayCents: 90000 } }, payments: []
  };
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStatement, 'find', () => query([statement]));
  stubAttendanceDependencies(t);
  const res = response();
  await payroll.listStatements({ user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] }, tenantId, query: { month: '2026-02' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.rows[0].statementStatus, 'draft');
  assert.equal(res.body.data.totals.netPayCents, 11000);
  assert.equal(res.body.data.totals.publishedCount, 1);
  assert.equal(res.body.data.totals.draftCount, 1);
});

test('employee statement response includes own payment history', async t => {
  const tenantId = id(), employeeId = id(), financeId = id();
  const payment = { direction: 'payment', amountCents: 5000, paidAt: new Date('2026-03-05T00:00:00Z'), statementRevision: 1, createdBy: financeId, createdAt: new Date('2026-03-05T00:00:00Z') };
  t.mock.method(PayrollStatement, 'find', () => query([{
    employeeId, month: '2026-02', currentPublishedRevision: 1,
    revisions: [{ revision: 1, employee: { employeeNo: 'E-1', name: '员工', department: '物流' }, components: emptyComponents(), totals: { incomeSubtotalCents: 10000, employerContributionCents: 0, totalCompensationCents: 10000, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 10000, netPayCents: 10000 }, publishedAt: new Date('2026-03-01T00:00:00Z') }],
    payments: [payment]
  }]));
  t.mock.method(User, 'find', filter => query(filter._id?.$in ? [{ _id: financeId, profile: { name: '财务甲' } }] : []));
  const res = response();
  await payroll.getMyStatements({ user: { _id: employeeId, tenantId, status: 'active', mustChangePassword: true }, tenantId, query: { year: '2026' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.rows[0].paymentHistory.length, 1);
  assert.equal(res.body.data.rows[0].paymentHistory[0].amountCents, 5000);
  assert.equal(res.body.data.rows[0].paymentHistory[0].createdBy.name, '财务甲');
});

test('payroll publish shares the attendance month lock with ledger close and reopen', async t => {
  const tenantId = id(), employeeId = id(), financeId = id();
  const events = [];
  const statement = {
    _id: id(), tenantId, employeeId, month: '2026-02', version: 4, currentPublishedRevision: null,
    employee: { employeeNo: 'E-1', name: '员工', department: '物流' }, revisions: [], payments: [], draft: { components: emptyComponents(), totals: { incomeSubtotalCents: 0, employerContributionCents: 0, totalCompensationCents: 0, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 0, netPayCents: 0 } }
  };
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', async (_tenantId, month) => { events.push(`lock:${month}`); return { month, token: 'test-lock' }; });
  t.mock.method(monthCoordination, 'releaseMonthMutationLock', async (_tenantId, lock) => { events.push(`release:${lock.month}`); });
  t.mock.method(PayrollStatement, 'findOne', () => query(statement));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ({ select() { return this; }, lean: async () => { events.push('check-closed'); return { status: 'closed' }; } }));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (_filter, update) => {
    events.push('publish-write');
    statement.revisions.push(update.$push.revisions);
    statement.currentPublishedRevision = update.$set.currentPublishedRevision;
    statement.version++;
    delete statement.draft;
    return statement;
  });
  const res = response();
  await payroll.publish({
    user: { _id: financeId, tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] }, tenantId,
    params: { employeeId, month: '2026-02' }, body: { version: 4 }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(events, ['lock:2026-02', 'check-closed', 'publish-write', 'release:2026-02']);
});

test('stale draft version cannot overwrite a newer payroll statement', async t => {
  const tenantId = id();
  const employeeId = id();
  const financeId = id();
  t.mock.method(User, 'findOne', () => query({ _id: employeeId, tenantId, employeeNo: 'E-1', profile: { name: '员工' }, status: 'active', mustChangePassword: false }));
  t.mock.method(PayrollStatement, 'findOne', () => query({ _id: id(), version: 4 }));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', () => assert.fail('stale version must not attempt a write'));
  const res = response();
  await payroll.saveDraft({
    user: { _id: financeId, tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] },
    tenantId,
    params: { employeeId, month: '2026-09' },
    body: { components: emptyComponents(), version: 3 },
  }, res);
  assert.equal(res.statusCode, 409);
});

test('month parsing uses strict Beijing natural-month boundaries', () => {
  const parsed = payroll._test.parseMonth('2026-02');
  assert.equal(parsed.start, Date.UTC(2026, 1, 1) - 8 * 3600000);
  assert.equal(parsed.end, Date.UTC(2026, 2, 1) - 8 * 3600000);
  assert.equal(payroll._test.parseMonth('2026-13'), null);
  assert.equal(payroll._test.parsePeriod('year', '2026').end, Date.UTC(2027, 0, 1) - 8 * 3600000);
});

test('chairman can read the company payroll list but never write statements', async t => {
  const tenantId = id(), employeeId = id();
  const chairman = { _id: id(), tenantId, status: 'active', title: 'ceo', mustChangePassword: false, payrollRoles: [] };
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStatement, 'find', () => query([]));
  stubAttendanceDependencies(t);
  const listRes = response();
  await payroll.listStatements({ user: chairman, tenantId, query: { month: '2026-09' } }, listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.data.rows.length, 1);

  t.mock.method(PayrollStatement, 'findOne', () => assert.fail('chairman writes must stop before loading a statement'));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', () => assert.fail('chairman writes must stop before updating a statement'));
  const draftRes = response();
  await payroll.saveDraft({
    user: chairman, tenantId, params: { employeeId, month: '2026-09' },
    body: { components: emptyComponents(), version: 0 },
  }, draftRes);
  assert.equal(draftRes.statusCode, 403);
  const publishRes = response();
  await payroll.publish({ user: chairman, tenantId, params: { employeeId, month: '2026-09' }, body: { version: 1 } }, publishRes);
  assert.equal(publishRes.statusCode, 403);
});

test('legacy Chinese job titles keep the same payroll read access as their codes', async t => {
  const tenantId = id(), employeeId = id();
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStatement, 'find', () => query([]));
  stubAttendanceDependencies(t);
  for (const title of ['gm', '总经理', 'ceo', '董事长']) {
    const res = response();
    await payroll.listStatements({
      user: { _id: id(), tenantId, status: 'active', title, mustChangePassword: false, payrollRoles: [] },
      tenantId, query: { month: '2026-09' },
    }, res);
    assert.equal(res.statusCode, 200, `${title} should read the company payroll list`);
  }
  const denied = response();
  await payroll.listStatements({
    user: { _id: id(), tenantId, status: 'active', title: '经理', mustChangePassword: false, payrollRoles: [] },
    tenantId, query: { month: '2026-09' },
  }, denied);
  assert.equal(denied.statusCode, 403, '经理 must not read the company payroll list');
});

test('disabled chairman loses company payroll read access', async t => {
  t.mock.method(PayrollStatement, 'find', () => assert.fail('disabled accounts must stop before querying statements'));
  t.mock.method(User, 'find', () => assert.fail('disabled accounts must stop before querying employees'));
  const res = response();
  await payroll.listStatements({
    user: { _id: id(), tenantId: id(), status: 'disabled', title: 'ceo', mustChangePassword: false, payrollRoles: [] },
    tenantId: id(), query: { month: '2026-09' },
  }, res);
  assert.equal(res.statusCode, 403);
});

test('proof URLs accept only HTTP(S) without credentials or same-origin absolute paths', async t => {
  const { isSafeProofUrl } = payroll._test;
  for (const value of ['', '  ', '/uploads/payroll/receipt.pdf', 'https://files.example/receipt.pdf', 'http://files.example/receipt.pdf']) {
    assert.equal(isSafeProofUrl(value), true, `${value} should be accepted`);
  }
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', '//attacker.example/proof', 'https://user:pass@files.example/proof', '\\\\attacker.example\\proof', '/\\\\attacker.example/path', 'https://example.test/\nfoo']) {
    assert.equal(isSafeProofUrl(value), false, `${JSON.stringify(value)} should be rejected`);
  }

  t.mock.method(PayrollStatement, 'findOne', () => assert.fail('unsafe proof URL must be rejected before loading a statement'));
  const tenantId = id();
  const res = response();
  await payroll.addPayment({
    user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] },
    tenantId, params: { employeeId: id(), month: '2026-02' },
    body: { version: 1, direction: 'payment', amountCents: 100, paidAt: '2026-02-28T00:00:00Z', proofUrl: 'javascript:alert(1)', statementRevision: 1 }
  }, res);
  assert.equal(res.statusCode, 400);
});

const standardInput = () => ({
  basicPayCents: 500_000,
  positionPayCents: 30_000,
  seniorityPayCents: 20_000,
  attendanceBonusCents: 10_000,
  companySocialInsuranceBaseCents: 500_000,
  companySocialInsuranceRatePercent: 12,
  personalSocialInsuranceBaseCents: 500_000,
  personalSocialInsuranceRatePercent: 8.5,
  companyHousingFundBaseCents: 400_000,
  companyHousingFundRatePercent: 12,
  personalHousingFundBaseCents: 400_000,
  personalHousingFundRatePercent: 12,
});

test('statement rows carry the salary standard and the month attendance hours', async t => {
  const tenantId = id(), employeeId = id();
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStatement, 'find', () => query([]));
  t.mock.method(PayrollStandard, 'find', () => query([{ employeeId, version: 2, ...standardInput() }]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employeeId, type: 'leave', status: 'approved', leaveType: 'sick', durationMinutes: 480, leaveAllocations: [{ date: '2026-09-07', minutes: 480 }], startAt: new Date('2026-09-07T01:00:00Z'), endAt: new Date('2026-09-07T09:00:00Z') },
    { applicantId: employeeId, type: 'overtime', status: 'approved', compensation: 'overtime_pay', startAt: new Date('2026-09-08T10:00:00Z'), endAt: new Date('2026-09-08T12:00:00Z') },
    { applicantId: employeeId, type: 'fieldwork', status: 'approved', startAt: new Date('2026-09-09T01:00:00Z'), endAt: new Date('2026-09-09T05:00:00Z') },
  ]));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ({ select: () => ({ lean: async () => ({ rows: [{ employeeId, expectedMinutes: 12_000, actualMinutes: 11_520 }] }) }) }));
  const res = response();
  await payroll.listStatements({
    user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] },
    tenantId, query: { month: '2026-09' },
  }, res);
  assert.equal(res.statusCode, 200);
  const row = res.body.data.rows[0];
  assert.equal(row.standard.basicPayCents, 500_000);
  assert.equal(row.standard.version, 2);
  // 传了租户方案就按方案合计算，这里没传 tenant，落到默认五险口径：单位 33.5% / 个人 11% + 3 元
  assert.equal(row.standard.contributions.employerSocialInsuranceCents, 167_500);
  assert.equal(row.standard.contributions.employeeHousingFundCents, 48_000);
  assert.equal(row.attendance.leaveMinutesByType.sick, 480);
  assert.equal(row.attendance.overtimePayMinutes, 120);
  assert.equal(row.attendance.fieldworkApprovedMinutes, 240);
  assert.equal(row.attendance.expectedMinutes, 12_000);
  assert.equal(row.attendance.actualMinutes, 11_520);
  // 没录入工资条的月份：按薪资标准给出底稿金额（固定项 + 基数×比例算出的社保公积金，其余为 0）
  assert.equal(row.standardDraft.components.basicPayCents, 500_000);
  assert.equal(row.standardDraft.components.attendanceBonusCents, 10_000);
  assert.equal(row.standardDraft.components.employerSocialInsuranceCents, 167_500);
  assert.equal(row.standardDraft.components.employeeSocialInsuranceCents, 55_300);
  assert.equal(row.standardDraft.components.employeeHousingFundCents, 48_000);
  assert.equal(row.standardDraft.components.performancePayCents, 0);
  assert.equal(row.standardDraft.components.personalLeaveDeductionCents, 0);
  assert.equal(row.standardDraft.components.incomeTaxCents, 0);
  assert.equal(row.standardDraft.totals.incomeSubtotalCents, 560_000);
  // 公司承担 = 单位社保 167500 + 单位公积金 48000；实发 = 560000 −（个人社保 55300 + 个人公积金 48000）
  assert.equal(row.standardDraft.totals.totalCompensationCents, 775_500);
  assert.equal(row.standardDraft.totals.netPayCents, 456_700);
});

test('tenant social insurance scheme drives the amounts instead of per-employee rates', async t => {
  const tenantId = id(), employeeId = id();
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStandard, 'find', () => query([{ employeeId, version: 1, ...standardInput() }]));
  // 标准里仍写着 12% / 8.5%，但方案生效后这两个数字不参与计算
  const res = response();
  await payroll.listStandards({
    user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] },
    tenantId,
    tenant: { settings: { payrollContributionScheme: {
      pensionEmployerPercent: 16, pensionEmployeePercent: 8,
      medicalEmployerPercent: 8, medicalEmployeePercent: 2, medicalEmployeeFlatCents: 0,
      unemploymentEmployerPercent: 0.5, unemploymentEmployeePercent: 0.5,
      injuryEmployerPercent: 0.2, maternityEmployerPercent: 0,
      housingFundEmployerPercent: 8, housingFundEmployeePercent: 8,
    } } },
  }, res);
  assert.equal(res.statusCode, 200);
  const standard = res.body.data.rows[0].standard;
  // 单位 16+8+0.5+0.2 = 24.7%；个人 8+2+0.5 = 10.5%，固定额 0
  assert.equal(standard.contributions.employerSocialInsuranceCents, 123_500);
  assert.equal(standard.contributions.employeeSocialInsuranceCents, 52_500);
  // 回给前端的比例也换成方案值，界面上不会出现「基数 × 12%」这种旧口径
  assert.equal(standard.companySocialInsuranceRatePercent, 24.7);
  assert.equal(standard.personalSocialInsuranceRatePercent, 10.5);
  // 公积金同理：标准里写的 12%（公积金基数 400000）不再作数，按方案的 8% 算
  assert.equal(standard.contributions.employerHousingFundCents, 32_000);
  assert.equal(standard.contributions.employeeHousingFundCents, 32_000);
  assert.equal(standard.companyHousingFundRatePercent, 8);
  assert.equal(standard.personalHousingFundRatePercent, 8);
});

test('custom tenant scheme is consistent from salary settings through the monthly draft save', async t => {
  const tenantId = id(), employeeId = id();
  const employee = { _id: employeeId, tenantId, profile: { name: '员工' }, status: 'active' };
  const standard = {
    employeeId, version: 1, ...standardInput(),
    companyHousingFundBaseCents: 500_000, personalHousingFundBaseCents: 500_000,
  };
  const req = {
    user: { _id: id(), tenantId, status: 'active', payrollRoles: ['finance'] }, tenantId,
    tenant: { settings: { payrollContributionScheme: {
      ...DEFAULT_CONTRIBUTION_SCHEME,
      pensionEmployerPercent: 16,
      housingFundEmployerPercent: 5, housingFundEmployeePercent: 5,
    } } },
    query: { month: '2026-09' },
  };
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(PayrollStandard, 'find', () => query([standard]));
  t.mock.method(PayrollStatement, 'find', () => query([]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(null));
  const settings = response(), monthly = response();
  await payroll.listStandards(req, settings);
  await payroll.listStatements(req, monthly);
  assert.equal(settings.statusCode, 200);
  assert.equal(monthly.statusCode, 200);
  const settingsStandard = settings.body.data.rows[0].standard;
  const row = monthly.body.data.rows[0];
  assert.deepEqual(row.standard.contributions, settingsStandard.contributions);
  assert.equal(row.standard.companySocialInsuranceRatePercent, 28.5);
  assert.equal(row.standard.personalHousingFundRatePercent, 5);
  assert.equal(row.standardDraft.components.employerSocialInsuranceCents, 142_500);
  assert.equal(row.standardDraft.components.employeeHousingFundCents, 25_000);
  assert.equal(row.standardDraft.totals.netPayCents, 479_700);

  let saved;
  t.mock.method(User, 'findOne', () => query(employee));
  t.mock.method(PayrollStatement, 'findOne', () => query(null));
  t.mock.method(PayrollStatement, 'create', async data => { saved = data; return data; });
  const result = response();
  await payroll.saveDraft({ ...req, params: { employeeId: String(employeeId), month: '2026-09' }, body: { version: 0, components: row.standardDraft.components } }, result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(saved.draft.components.employeeHousingFundCents, 25_000);
  assert.equal(saved.draft.totals.netPayCents, 479_700);
});

test('recorded months ignore the salary standard and rows without a standard have no draft', async t => {
  const tenantId = id(), employeeId = id(), otherId = id();
  const totals = { incomeSubtotalCents: 700_000, employerContributionCents: 0, totalCompensationCents: 700_000, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 700_000, netPayCents: 700_000 };
  t.mock.method(User, 'find', () => query([
    { _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' },
    { _id: otherId, employeeNo: 'E-2', profile: { name: '同事' }, department: '物流', status: 'active' },
  ]));
  t.mock.method(PayrollStatement, 'find', () => query([{
    employeeId, month: '2026-02', version: 1,
    draft: { components: emptyComponents(), totals }, payments: [],
  }]));
  t.mock.method(PayrollStandard, 'find', () => query([{ employeeId, version: 2, ...standardInput() }]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  const res = response();
  await payroll.listStatements({ user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] }, tenantId, query: { month: '2026-02' } }, res);
  assert.equal(res.statusCode, 200);
  const rows = new Map(res.body.data.rows.map(row => [String(row.employeeId), row]));
  // 已录入（草稿/已发布）的月份以工资条为准，不再按标准给底稿
  assert.equal(rows.get(String(employeeId)).standardDraft, null);
  assert.equal(rows.get(String(employeeId)).totals.netPayCents, 700_000);
  // 没有薪资标准的人即使没录入也没有底稿
  assert.equal(rows.get(String(otherId)).statementStatus, 'missing');
  assert.equal(rows.get(String(otherId)).standardDraft, null);
});

test('salary standards are readable by payroll readers and writable by finance only', async t => {
  const tenantId = id(), employeeId = id();
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStandard, 'find', () => query([]));
  const chairman = { _id: id(), tenantId, status: 'active', title: 'ceo', mustChangePassword: false, payrollRoles: [] };
  const member = { _id: id(), tenantId, status: 'active', title: '业务员', mustChangePassword: false, payrollRoles: [] };
  const finance = { _id: id(), tenantId, status: 'active', title: '会计', mustChangePassword: false, payrollRoles: ['finance'] };

  const readAllowed = response();
  await payroll.listStandards({ user: chairman, tenantId }, readAllowed);
  assert.equal(readAllowed.statusCode, 200);
  assert.equal(readAllowed.body.data.rows[0].standard, null);

  const readDenied = response();
  await payroll.listStandards({ user: member, tenantId }, readDenied);
  assert.equal(readDenied.statusCode, 403);

  t.mock.method(User, 'findOne', () => query({ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }));
  t.mock.method(PayrollStandard, 'findOne', () => query(null));
  t.mock.method(PayrollStandard, 'create', async values => ({ ...values, updatedAt: new Date() }));

  const writeDenied = response();
  await payroll.saveStandard({ user: chairman, tenantId, params: { employeeId }, body: { standard: standardInput(), version: 0 } }, writeDenied);
  assert.equal(writeDenied.statusCode, 403);

  const saved = response();
  await payroll.saveStandard({ user: finance, tenantId, params: { employeeId }, body: { standard: standardInput(), version: 0 } }, saved);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.version, 1);
  // 个人社保 = 500000 × 11% + 300（大额医疗固定额）
  assert.equal(saved.body.data.contributions.employeeSocialInsuranceCents, 55_300);
  // 标准里带进来的社保比例会被对齐成租户方案合计，不再按员工各自填的数字算
  assert.equal(saved.body.data.companySocialInsuranceRatePercent, 33.5);
  assert.equal(saved.body.data.personalSocialInsuranceRatePercent, 11);

  const invalid = response();
  await payroll.saveStandard({ user: finance, tenantId, params: { employeeId }, body: { standard: { ...standardInput(), companyHousingFundRatePercent: 12.345 }, version: 0 } }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test('工资表下发当月考勤结账状态，并保留未结账强制发布的留痕', async t => {
  const tenantId = id(), employeeId = id();
  const published = {
    revision: 1,
    employee: { employeeNo: 'E-1', name: '员工', department: '物流' },
    components: emptyComponents(),
    totals: { incomeSubtotalCents: 0, employerContributionCents: 0, totalCompensationCents: 0, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 0, netPayCents: 0 },
    publishedAt: new Date('2026-10-01T02:00:00Z'),
    publishedBy: id(),
  };
  const financeUser = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
  t.mock.method(User, 'find', () => query([{ _id: employeeId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active' }]));
  t.mock.method(PayrollStatement, 'find', () => query([{
    employeeId, month: '2026-09', employee: published.employee, currentPublishedRevision: 1, revisions: [published], payments: [], version: 2,
    events: [{ action: 'forced_publish', revision: 1, actorId: id(), ledgerStatus: 'missing', at: new Date('2026-10-01T02:00:00Z') }],
  }]));
  t.mock.method(PayrollStandard, 'find', () => query([]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  let ledger = null;
  t.mock.method(AttendanceMonthLedger, 'findOne', () => ({ select() { return this; }, lean: async () => ledger }));

  const missing = response();
  await payroll.listStatements({ user: financeUser, tenantId, query: { month: '2026-09' } }, missing);
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.body.data.ledgerStatus, 'missing', '还没建台账也算未结账');
  assert.equal(missing.body.data.rows[0].forcedPublish.ledgerStatus, 'missing');
  assert.equal(missing.body.data.rows[0].forcedPublish.revision, 1);

  ledger = { status: 'open', rows: [] };
  const open = response();
  await payroll.listStatements({ user: financeUser, tenantId, query: { month: '2026-09' } }, open);
  assert.equal(open.body.data.ledgerStatus, 'open');

  ledger = { status: 'closed', rows: [] };
  const closed = response();
  await payroll.listStatements({ user: financeUser, tenantId, query: { month: '2026-09' } }, closed);
  assert.equal(closed.body.data.ledgerStatus, 'closed');
  assert.equal(closed.body.data.rows[0].forcedPublish.revision, 1, '事后结账不会抹掉当时的强制发布留痕');
});

test('未结账月份允许直接改已发布的工资条再发布，结账后必须先撤回', async t => {
  const tenantId = id(), employeeId = id(), financeId = id();
  const components = { ...emptyComponents(), basicPayCents: 600000 };
  const published = { revision: 1, employee: { name: '员工', department: '物流' }, components: { ...components }, totals: validatePayrollComponents(components).totals, publishedAt: new Date('2026-09-25T00:00:00Z'), publishedBy: financeId };
  const statement = { _id: id(), tenantId, employeeId, month: '2026-09', employee: published.employee, currentPublishedRevision: 1, version: 2, revisions: [published], events: [], payments: [] };
  t.mock.method(User, 'findOne', () => query({ _id: employeeId, tenantId, employeeNo: 'E-1', profile: { name: '员工' }, department: '物流', status: 'active', mustChangePassword: false }));
  t.mock.method(User, 'find', () => query([]));
  t.mock.method(PayrollStatement, 'findOne', () => query(statement));
  t.mock.method(PayrollStatement, 'findOneAndUpdate', async (_filter, update) => {
    if (update.$set) Object.assign(statement, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete statement[key];
    for (const [key, item] of Object.entries(update.$push || {})) statement[key].push(item);
    statement.version += update.$inc.version;
    return statement;
  });
  let ledgerStatus = 'open';
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query({ status: ledgerStatus }));
  t.mock.method(monthCoordination, 'acquireMonthMutationLock', async () => 'month-lock');
  t.mock.method(monthCoordination, 'releaseMonthMutationLock', async () => {});
  const req = { user: { _id: financeId, tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] }, tenantId, params: { employeeId: String(employeeId), month: '2026-09' } };

  // 未结账：已发布的行可以直接改，存出来的是「修订草稿」，旧版仍在
  const saved = response();
  await payroll.saveDraft({ ...req, body: { version: 2, components: { ...components, performancePayCents: 90000 } } }, saved);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.statementStatus, 'draft');
  assert.equal(saved.body.data.revision, 1, '旧版仍有效，员工看到的还是第 1 版');
  assert.equal(saved.body.data.publishedTotals.netPayCents, published.totals.netPayCents);

  // 不用撤回就能接着发第 2 版，强发标记跟着新版走
  const republished = response();
  await payroll.publish({ ...req, body: { version: statement.version, force: true } }, republished);
  assert.equal(republished.statusCode, 200);
  assert.equal(republished.body.data.revision, 2);
  assert.equal(republished.body.data.statementStatus, 'published');
  assert.equal(republished.body.data.forcedPublish.revision, 2);
  assert.deepEqual(statement.revisions.map(item => item.revision), [1, 2]);

  // 结账后同一动作被拦住：必须先撤回，旧版才留得住
  ledgerStatus = 'closed';
  const versionBeforeBlock = statement.version;
  const blocked = response();
  await payroll.saveDraft({ ...req, body: { version: versionBeforeBlock, components: { ...components, performancePayCents: 100000 } } }, blocked);
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.body.error, /先撤回/);
  assert.equal(statement.version, versionBeforeBlock, '被拦住时不能写库');
  assert.equal(statement.draft, undefined, '被拦住时不能落草稿');
});

/** 薪资统计的考勤块夹具：一份已发布工资条 + 台账 + 考勤申请单。 */
function attendanceStatisticsFixture({ tenantId, employeeId, otherId, ledger, month = '2026-09' }) {
  const components = {
    ...emptyComponents(),
    basicPayCents: 700_000,
    overtimeAllowanceCents: 120_000,
    sickLeaveDeductionCents: 30_000,
    personalLeaveDeductionCents: 20_000,
    absenceDeductionCents: 10_000,
  };
  const published = {
    revision: 1,
    employee: { employeeNo: 'E-1', name: '张三', department: '物流' },
    components,
    totals: validatePayrollComponents(components).totals,
    publishedAt: new Date('2026-10-01T02:00:00Z'),
    publishedBy: id(),
  };
  const statements = [{
    employeeId, month, employee: published.employee, currentPublishedRevision: 1,
    revisions: [published], payments: [], version: 2,
  }];
  const requests = [
    {
      applicantId: employeeId, type: 'leave', leaveType: 'personal', status: 'approved',
      durationMinutes: 480, leaveAllocations: [{ date: '2026-09-08', minutes: 480 }],
      startAt: new Date('2026-09-08T01:00:00Z'), endAt: new Date('2026-09-08T10:00:00Z'),
    },
    {
      applicantId: employeeId, type: 'overtime', status: 'approved', compensation: 'overtime_pay',
      startAt: new Date('2026-09-10T10:00:00Z'), endAt: new Date('2026-09-10T13:00:00Z'),
    },
    {
      applicantId: employeeId, type: 'fieldwork', status: 'approved',
      startAt: new Date('2026-09-01T01:00:00Z'), endAt: new Date('2026-09-03T10:00:00Z'),
    },
  ];
  return { statements, requests, ledger: ledger(employeeId, otherId) };
}

test('薪资统计的考勤块：出差按日历天数、加班按小时，请假与旷工按每日工作分钟折成天', async t => {
  const tenantId = id(), employeeId = id(), otherId = id();
  const fixture = attendanceStatisticsFixture({
    tenantId, employeeId, otherId,
    ledger: (target, other) => {
      // 应出勤 12000 − 实到 11000 − 请假 480 − 迟到一次（0.5 小时 = 30 分钟）= 490 分钟旷工
      const rows = [
        { employeeId: target, expectedMinutes: 12_000, actualMinutes: 11_000, confirmationState: 'confirmed', lateWithin10: 1, lateOver10: 0, earlyLeave: 0, noClockRecord: 0 },
        { employeeId: other, expectedMinutes: 12_000, actualMinutes: null, confirmationState: 'pending' },
      ];
      // 已结账月份读快照里冻结的应出勤，不再按当前日历重算
      return { status: 'closed', rows, closedSnapshot: { rows } };
    },
  });
  const financeUser = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
  t.mock.method(PayrollStatement, 'find', filter => query(filter['payments.paidAt'] ? [] : fixture.statements));
  t.mock.method(PayrollStatement, 'findOne', () => query(null));
  t.mock.method(AttendanceRequest, 'find', () => query(fixture.requests));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(fixture.ledger));
  t.mock.method(Tenant, 'findById', () => query({ settings: {} }));

  const res = response();
  await payroll.getStatistics({ user: financeUser, tenantId, query: { period: 'month', value: '2026-09' } }, res);

  assert.equal(res.statusCode, 200);
  const attendance = res.body.data.attendance;
  assert.equal(attendance.dayMinutes, 480, '一个工作日按 8 小时折');
  assert.equal(attendance.totals.leaveMinutes, 480);
  assert.equal(attendance.totals.overtimeMinutes, 180);
  assert.equal(attendance.totals.fieldworkMinutes, 3420);
  assert.equal(attendance.totals.fieldworkDays, 3, '出差按日历天数（含首尾）');
  assert.equal(attendance.totals.absenceMinutes, 490, '旷工 = 应出勤 − 实到 − 请假 − 违纪扣减');
  assert.equal(attendance.totals.absenceSkippedCount, 1, '实到待确认的人不参与旷工推导');
  // 金额取自已发布工资条：请假 = 病假 + 事假，旷工与加班补贴各自单独取
  assert.equal(attendance.totals.leaveDeductionCents, 50_000);
  assert.equal(attendance.totals.absenceDeductionCents, 10_000);
  assert.equal(attendance.totals.overtimeAllowanceCents, 120_000);
  assert.equal(attendance.byMonth.length, 1);
  assert.equal(attendance.byMonth[0].month, '2026-09');
  assert.equal(attendance.byMonth[0].fieldworkDays, 3);
});

test('薪资统计的考勤块：未结账月份按当前日历重算应出勤，不做工时长的旧值不算数', async t => {
  const tenantId = id(), employeeId = id(), otherId = id();
  const tenant = { settings: {} };
  // 用与接口同一条口径先算出真实的当月应出勤，再据此反推期望的旷工
  const month = { start: Date.UTC(2026, 8, 1) - 8 * 3_600_000, end: Date.UTC(2026, 9, 1) - 8 * 3_600_000 };
  const expected = await attendanceLedgerApi._test.expectedMinutesFor(month.start, month.end, tenant);
  const fixture = attendanceStatisticsFixture({
    tenantId, employeeId, otherId,
    ledger: (target, other) => ({
      status: 'open',
      rows: [
        // 库里存的 expectedMinutes 故意写成过期的旧值：未结账要以当前日历算出的为准
        { employeeId: target, expectedMinutes: 9_999, actualMinutes: expected - 1_000, confirmationState: 'confirmed', lateWithin10: 1, lateOver10: 0, earlyLeave: 0, noClockRecord: 0 },
        { employeeId: other, expectedMinutes: 9_999, actualMinutes: null, confirmationState: 'pending' },
      ],
    }),
  });
  const financeUser = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
  t.mock.method(PayrollStatement, 'find', filter => query(filter['payments.paidAt'] ? [] : fixture.statements));
  t.mock.method(AttendanceRequest, 'find', () => query(fixture.requests));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(fixture.ledger));
  t.mock.method(Tenant, 'findById', () => query(tenant));

  const res = response();
  await payroll.getStatistics({ user: financeUser, tenantId, query: { period: 'month', value: '2026-09' } }, res);

  assert.equal(res.statusCode, 200);
  const attendance = res.body.data.attendance;
  assert.equal(attendance.totals.absenceMinutes, 490, '应出勤按当前日历重算：expected − 实到 − 请假 480 − 迟到 30');
  assert.equal(attendance.totals.absenceSkippedCount, 1, '实到待确认的人不参与旷工推导');
  assert.equal(attendance.totals.leaveMinutes, 480);
});

test('薪资统计的考勤块：应出勤算不出来时不报错，时长照常、旷工留空', async t => {
  const tenantId = id(), employeeId = id(), otherId = id();
  const fixture = attendanceStatisticsFixture({
    tenantId, employeeId, otherId,
    ledger: (target, other) => ({
      status: 'open',
      rows: [
        { employeeId: target, expectedMinutes: 12_000, actualMinutes: 11_000, confirmationState: 'confirmed' },
        { employeeId: other, expectedMinutes: 12_000, actualMinutes: 12_000, confirmationState: 'confirmed' },
      ],
    }),
  });
  const financeUser = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
  t.mock.method(PayrollStatement, 'find', filter => query(filter['payments.paidAt'] ? [] : fixture.statements));
  t.mock.method(AttendanceRequest, 'find', () => query(fixture.requests));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(fixture.ledger));
  // 工作时段配置非法 → 应出勤算不出来（等同于工作日历未确认的路径）
  t.mock.method(Tenant, 'findById', () => query({ settings: { attendanceWorkPeriods: [{ start: '18:00', end: '09:00' }] } }));

  const res = response();
  await payroll.getStatistics({ user: financeUser, tenantId, query: { period: 'month', value: '2026-09' } }, res);

  assert.equal(res.statusCode, 200, '考勤口径的问题不能把整页薪资统计打挂');
  const attendance = res.body.data.attendance;
  assert.equal(attendance.totals.absenceMinutes, 0, '算不出应出勤就不给旷工数，不能拿 0 冒充');
  assert.equal(attendance.totals.absenceSkippedCount, 2);
  assert.equal(attendance.totals.fieldworkDays, 3, '时长不受应出勤是否算得出影响');
  assert.equal(attendance.totals.overtimeMinutes, 180);
  assert.equal(res.body.data.accrual.netPayCents, fixture.statements[0].revisions[0].totals.netPayCents, '工资计提照常');
});

test('薪资统计的考勤块：请假没按天分摊的人不算旷工（缺口里混着没算进来的请假）', async t => {
  const tenantId = id(), employeeId = id(), otherId = id();
  const fixture = attendanceStatisticsFixture({
    tenantId, employeeId, otherId,
    ledger: (target) => {
      const rows = [{ employeeId: target, expectedMinutes: 12_000, actualMinutes: 11_000, confirmationState: 'confirmed' }];
      return { status: 'closed', rows, closedSnapshot: { rows } };
    },
  });
  // 请假单没有按天分摊 → 请假时长进不了口径，这时算缺口会把它当成旷工
  fixture.requests[0].leaveAllocations = [];
  const financeUser = { _id: id(), tenantId, status: 'active', mustChangePassword: false, payrollRoles: ['finance'] };
  t.mock.method(PayrollStatement, 'find', filter => query(filter['payments.paidAt'] ? [] : fixture.statements));
  t.mock.method(AttendanceRequest, 'find', () => query(fixture.requests));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(fixture.ledger));
  t.mock.method(Tenant, 'findById', () => query({ settings: {} }));

  const res = response();
  await payroll.getStatistics({ user: financeUser, tenantId, query: { period: 'month', value: '2026-09' } }, res);

  const attendance = res.body.data.attendance;
  assert.equal(attendance.totals.absenceMinutes, 0, '口径不完整宁可不给旷工数');
  assert.equal(attendance.totals.absenceSkippedCount, 1);
  assert.equal(attendance.totals.leaveUnreconciled, true, '界面要能提示有请假单的分摊明细待复核');
});
