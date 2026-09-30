const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const PayrollStatement = require('../models/PayrollStatement');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const AttendanceRequest = require('../models/AttendanceRequest');
const PayrollStandard = require('../models/PayrollStandard');
const payroll = require('../controllers/api/payroll');
const { COMPONENT_KEYS } = require('../utils/payroll-calculations');
const monthCoordination = require('../controllers/api/attendance-ledger')._coordination;

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
