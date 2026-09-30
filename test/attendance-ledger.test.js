const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const os = require('os');
const User = require('../models/User');
const AttendanceRequest = require('../models/AttendanceRequest');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const AttendanceLedgerAudit = require('../models/AttendanceLedgerAudit');
const ledgerApi = require('../controllers/api/attendance-ledger');
const attendanceApi = require('../controllers/api/attendance');
const { calculateLeaveMinutes } = require('../utils/attendance-permissions');

const id = () => new mongoose.Types.ObjectId();
const query = value => ({ select() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const response = () => ({ statusCode: 200, body: null, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
const calendarTenant = { settings: { attendanceCalendarYears: [2026], attendanceCalendarOverrides: {}, attendanceWorkPeriods: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] } };
const user = (tenantId, fields = {}) => ({ _id: id(), tenantId, employeeNo: 'E-1', userid: 'worker', profile: { name: '员工' }, department: '运营', status: 'active', ...fields });

test('ledger scope query excludes platform accounts and employees opted out of attendance', async t => {
  const tenantId = id(), viewerId = id();
  const filters = [];
  t.mock.method(User, 'find', filter => { filters.push(filter); return query([]); });
  await ledgerApi._test.getScopedUsers({ tenantId, user: { _id: viewerId, role: 'owner' } }, 'company');
  assert.equal(filters.length, 1);
  assert.deepEqual(filters[0].role, { $ne: 'platform' });
  assert.deepEqual(filters[0].attendanceTracked, { $ne: false });
  assert.equal(String(filters[0].tenantId), String(tenantId));
  // 团队范围同样带上这两个条件
  await ledgerApi._test.getScopedUsers({ tenantId, user: { _id: viewerId, role: 'member', attendanceRoles: ['manager'] } }, 'team');
  assert.deepEqual(filters[1].role, { $ne: 'platform' });
  assert.deepEqual(filters[1].attendanceTracked, { $ne: false });
  assert.equal(String(filters[1].managerId), String(viewerId));
});

test('calendar month uses Beijing-time half-open UTC boundaries', () => {
  const month = ledgerApi._test.parseMonth('2026-02');
  assert.equal(new Date(month.start).toISOString(), '2026-01-31T16:00:00.000Z');
  assert.equal(new Date(month.end).toISOString(), '2026-02-28T16:00:00.000Z');
  assert.equal(ledgerApi._test.parseMonth('2026-13'), null);
});

test('daily leave allocation splits across months and applies confirmed work calendar', () => {
  const result = calculateLeaveMinutes(new Date('2026-11-30T01:00:00Z'), new Date('2026-12-01T04:00:00Z'), calendarTenant);
  assert.deepEqual(result.allocations, [{ date: '2026-11-30', minutes: 480 }, { date: '2026-12-01', minutes: 180 }]);
  assert.equal(result.minutes, 660);
});

test('monthly expected minutes add the saturday morning half day', async () => {
  const month = ledgerApi._test.parseMonth('2026-09');
  // 2026-09：22 个完整工作日（含 9/20 调休上班、扣掉 9/25 中秋）
  assert.equal(await ledgerApi._test.expectedMinutesFor(month.start, month.end, calendarTenant), 22 * 480);
  // 开启周六上午后多出 9/5、9/12、9/19 三个上午（9/26 落在中秋假期里）
  const withSaturdayMorning = { settings: { ...calendarTenant.settings, attendanceSaturdayMorningWorkday: true } };
  assert.equal(await ledgerApi._test.expectedMinutesFor(month.start, month.end, withSaturdayMorning), 22 * 480 + 3 * 180);
});

test('annual attendance totals preserve unknown actual time instead of treating it as zero', () => {
  const complete = { expectedMinutes: 100, actualMinutes: 80, leaveMinutesByType: { personal: 20 }, overtimeApprovedMinutes: 30, confirmedCount: 1, pendingCount: 0, noBasisCount: 0 };
  const totals = ledgerApi._test.sumMonthlyStatistics([
    { month: '2026-01', totals: complete },
    { month: '2026-02', totals: { ...complete, actualMinutes: null, pendingCount: 1 } },
  ]);
  assert.equal(totals.expectedMinutes, 200);
  assert.equal(totals.actualMinutes, null);
  assert.equal(totals.leaveMinutesByType.personal, 40);
  assert.equal(totals.overtimeApprovedMinutes, 60);
  assert.equal(totals.pendingCount, 1);
});

test('ledger uses persisted leave allocation and never infers actual minutes', async t => {
  const tenantId = id(), employee = user(tenantId);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([{
    applicantId: employee._id, status: 'approved', type: 'leave', leaveType: 'sick', durationMinutes: 660, startAt: new Date('2026-09-30T01:00:00Z'), endAt: new Date('2026-10-01T04:00:00Z'),
    leaveAllocations: [{ date: '2026-09-30', minutes: 480 }, { date: '2026-10-01', minutes: 180 }]
  }]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leaveMinutesByType.sick, 180);
  assert.equal(rows[0].actualMinutes, null);
});

test('ledger shows legacy approved leave as reconciliation required rather than recalculating it', async t => {
  const tenantId = id(), employee = user(tenantId);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([{
    applicantId: employee._id, status: 'approved', type: 'leave', leaveType: 'personal', startAt: new Date('2026-10-05T01:00:00Z'), endAt: new Date('2026-10-05T09:00:00Z')
  }]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows[0].requiresLeaveReconciliation, true);
  assert.equal(rows[0].leaveMinutesByType.personal, 0);
});

test('approved overtime and fieldwork split by Beijing month but remain labeled as approved', async t => {
  const tenantId = id(), employee = user(tenantId);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employee._id, status: 'approved', type: 'overtime', compensation: 'comp_time', startAt: new Date('2026-10-31T15:30:00Z'), endAt: new Date('2026-10-31T16:30:00Z') },
    { applicantId: employee._id, status: 'approved', type: 'fieldwork', startAt: new Date('2026-10-31T15:30:00Z'), endAt: new Date('2026-10-31T16:30:00Z') }
  ]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows[0].overtimeApprovedMinutes, 30);
  assert.equal(rows[0].overtimeCompTimeMinutes, 30);
  assert.equal(rows[0].fieldworkApprovedMinutes, 30);
  assert.equal(rows[0].actualMinutes, null);
});

test('overtime is split by compensation method including "no compensation"', async t => {
  const tenantId = id(), employee = user(tenantId);
  const at = (day, from, to) => ({ startAt: new Date(`2026-10-${day}T${from}:00Z`), endAt: new Date(`2026-10-${day}T${to}:00Z`) });
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employee._id, status: 'approved', type: 'overtime', compensation: 'comp_time', ...at('05', '01', '03') },
    { applicantId: employee._id, status: 'approved', type: 'overtime', compensation: 'overtime_pay', ...at('06', '01', '02') },
    { applicantId: employee._id, status: 'approved', type: 'overtime', compensation: 'none', ...at('07', '01', '02') },
  ]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  const row = rows[0];
  assert.equal(row.overtimeApprovedMinutes, 240, '加班总时长与补偿方式无关');
  assert.equal(row.overtimeCompTimeMinutes, 120);
  assert.equal(row.overtimePayMinutes, 60);
  assert.equal(row.overtimeUncompensatedMinutes, 60, '无补偿也要单独计时长');
});

/** mongoose 的 findOne(...).select(...) 链：测试桩要能接住 select。 */
const findOne = value => ({ select() { return Promise.resolve(value) } });

/** 测试用的台账文档：只带导入要用的字段与一个可计数的 save。 */
function ledgerDoc(overrides = {}) {
  const doc = { tenantId: id(), month: '2026-09', status: 'open', version: 0, rows: [], ...overrides };
  doc.save = async () => { doc.saved = (doc.saved ?? 0) + 1; return doc };
  return doc;
}
function importRequest(tenantId, userFields, body) {
  return { tenantId, tenant: calendarTenant, user: { _id: id(), tenantId, status: 'active', ...userFields }, body };
}
function mockLedgerStorage(t, ledger) {
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'updateOne', async () => ({ modifiedCount: 1 }));
}

test('import stores clock-in records but never touches actual minutes or confirmation', async t => {
  const tenantId = id(), employee = user(tenantId);
  const ledger = ledgerDoc({ tenantId, rows: [] });
  mockLedgerStorage(t, ledger);
  t.mock.method(User, 'findOne', condition => findOne(String(condition._id) === String(employee._id) ? employee : null));
  const res = response();
  await ledgerApi.importLedgerRecords(importRequest(tenantId, { role: 'owner' }, {
    month: '2026-09',
    rows: [{ employeeId: String(employee._id), lateWithin10: 1, lateOver10: 3, lateTotal: 4, noClockRecord: 2, importNote: '10-11号出差' }],
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.results[0].status, 'created');
  const row = ledger.rows[0];
  assert.equal(row.lateTotal, 4);
  assert.equal(row.noClockRecord, 2);
  assert.equal(row.importNote, '10-11号出差');
  assert.ok(row.importedAt);
  // 导入只登记次数：实到与确认状态必须原样，等管理员按建议值确认
  assert.equal(row.actualMinutes, null);
  assert.equal(row.confirmationState, 'pending');
  assert.equal(ledger.saved, 1);
});

test('import only overwrites the columns present in the file', async t => {
  const tenantId = id(), employee = user(tenantId);
  const ledger = ledgerDoc({ tenantId, rows: [{
    employeeId: employee._id, name: '员工', expectedMinutes: 0, actualMinutes: 480,
    confirmationState: 'confirmed', note: '已核对', lateTotal: 9, noClockRecord: 5, importNote: '旧备注', version: 1,
  }] });
  mockLedgerStorage(t, ledger);
  t.mock.method(User, 'findOne', condition => findOne(String(condition._id) === String(employee._id) ? employee : null));
  const res = response();
  await ledgerApi.importLedgerRecords(importRequest(tenantId, { role: 'owner' }, {
    month: '2026-09',
    rows: [{ employeeId: String(employee._id), lateTotal: 2 }], // 只导了迟到合计
  }), res);
  assert.equal(res.statusCode, 200);
  const row = ledger.rows[0];
  assert.equal(row.lateTotal, 2);
  assert.equal(row.noClockRecord, 5, '文件里没填的列不动');
  assert.equal(row.importNote, '旧备注', '备注留空也不覆盖');
  assert.equal(row.actualMinutes, 480, '已确认的实到不受导入影响');
  assert.equal(row.confirmationState, 'confirmed');
});

test('import rejects non-admins, closed months and malformed rows', async t => {
  const tenantId = id(), employee = user(tenantId);
  const openLedger = ledgerDoc({ tenantId, rows: [] });
  mockLedgerStorage(t, openLedger);
  t.mock.method(User, 'findOne', condition => findOne(String(condition._id) === String(employee._id) ? employee : null));

  const forbidden = response();
  await ledgerApi.importLedgerRecords(importRequest(tenantId, { role: 'member', attendanceRoles: [] }, { month: '2026-09', rows: [{ employeeId: String(employee._id), lateTotal: 1 }] }), forbidden);
  assert.equal(forbidden.statusCode, 403);

  const closedLedger = ledgerDoc({ tenantId, status: 'closed', rows: [] });
  mockLedgerStorage(t, closedLedger);
  const closed = response();
  await ledgerApi.importLedgerRecords(importRequest(tenantId, { role: 'owner' }, { month: '2026-09', rows: [{ employeeId: String(employee._id), lateTotal: 1 }] }), closed);
  assert.equal(closed.statusCode, 409);
  assert.match(closed.body.error, /已结账/);
  assert.equal(closedLedger.rows.length, 0);

  // 一行数据非法只作废这一行，其他行照常写入
  const mixed = ledgerDoc({ tenantId, rows: [] });
  mockLedgerStorage(t, mixed);
  const mixedRes = response();
  await ledgerApi.importLedgerRecords(importRequest(tenantId, { role: 'owner' }, { month: '2026-09', rows: [
    { employeeId: String(employee._id), lateTotal: -1 },          // 负数 → 失败
    { employeeId: String(employee._id), noClockRecord: 3 },        // 合法 → 成功
    { employeeId: String(id()), lateTotal: 1 },                    // 员工不存在 → 失败
    { employeeId: String(employee._id) },                          // 什么都没填 → 失败
  ] }), mixedRes);
  assert.equal(mixedRes.statusCode, 200);
  const results = mixedRes.body.data.results;
  assert.deepEqual(results.map(item => item.status), ['failed', 'created', 'failed', 'failed']);
  assert.match(results[0].error, /迟到合计.*整数/);
  assert.equal(results[2].error, '员工不存在或不属于本公司');
  assert.equal(mixed.rows.length, 1);
  assert.equal(mixed.rows[0].noClockRecord, 3);
});

test('manager team queries are restricted to direct reports', async t => {
  const tenantId = id(), managerId = id();
  let seen;
  t.mock.method(User, 'find', condition => { seen = condition; return query([]); });
  await ledgerApi._test.getScopedUsers({ tenantId, user: { _id: managerId, attendanceRoles: ['manager'] } }, 'team');
  assert.equal(String(seen.tenantId), String(tenantId));
  assert.equal(String(seen.managerId), String(managerId));
});

test('ledger and statistics require a confirmed calendar without returning an opaque 500', async t => {
  const tenantId = id(), employee = user(tenantId);
  // 2026 由内置全国节假日表兜底视为已确认，未确认分支要用表外年份才有意义
  const ledger = { tenantId, month: '2027-09', status: 'open', version: 0, rows: [] };
  const tenant = { settings: { ...calendarTenant.settings, attendanceCalendarYears: [] } };
  const req = { tenantId, tenant, user: { _id: id(), tenantId, role: 'owner', status: 'active' }, query: { month: '2027-09', scope: 'company' } };
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));

  const ledgerResponse = response();
  await ledgerApi.getLedger(req, ledgerResponse);
  assert.equal(ledgerResponse.statusCode, 409);
  assert.equal(ledgerResponse.body.code, 'ATTENDANCE_CALENDAR_UNCONFIRMED');
  assert.match(ledgerResponse.body.error, /2027.*工作日历/);

  const statisticsResponse = response();
  await ledgerApi.getStatistics({ ...req, query: { period: 'month', value: '2027-09', scope: 'company' } }, statisticsResponse);
  assert.equal(statisticsResponse.statusCode, 409);
  assert.equal(statisticsResponse.body.code, 'ATTENDANCE_CALENDAR_UNCONFIRMED');

  tenant.settings.attendanceCalendarYears = [2027];
  const readyLedgerResponse = response();
  await ledgerApi.getLedger(req, readyLedgerResponse);
  assert.equal(readyLedgerResponse.statusCode, 200);
  assert.equal(readyLedgerResponse.body.data.rows.length, 1);
  const readyStatisticsResponse = response();
  await ledgerApi.getStatistics({ ...req, query: { period: 'month', value: '2027-09', scope: 'company' } }, readyStatisticsResponse);
  assert.equal(readyStatisticsResponse.statusCode, 200);
});

test('close rejects incomplete staff, freezes a complete snapshot, and reopen requires audited reason', async t => {
  const tenantId = id(), employee = user(tenantId);
  const ledger = { _id: id(), tenantId, month: '2026-10', status: 'open', version: 3, rows: [{ employeeId: employee._id, employeeNo: employee.employeeNo, name: '员工', department: '运营', expectedMinutes: 0, actualMinutes: null, confirmationState: 'pending', note: '', version: 0 }], closeAudit: [], async save() {} };
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'updateOne', async () => ({ modifiedCount: 1 }));
  let auditSnapshots = [];
  t.mock.method(AttendanceLedgerAudit, 'create', async data => { auditSnapshots.push(data); return { _id: id(), at: data.at }; });
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));

  const req = { tenantId, user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, role: 'owner' }, body: { month: '2026-10', version: 3 }, tenant: calendarTenant };
  const incomplete = response();
  await ledgerApi.closeMonth(req, incomplete);
  assert.equal(incomplete.statusCode, 409);

  ledger.rows[0].confirmationState = 'no_basis';
  ledger.rows[0].note = '没有考勤依据';
  const complete = response();
  await ledgerApi.closeMonth(req, complete);
  assert.equal(complete.statusCode, 200);
  assert.equal(ledger.status, 'closed');
  assert.ok(ledger.closedSnapshot.rows[0]);
  assert.equal(ledger.closedSnapshot.rows[0].actualMinutes, null);
  assert.equal(auditSnapshots[0].action, 'closed');
  assert.ok(auditSnapshots[0].snapshot.rows.length);

  const noReason = response();
  await ledgerApi.reopenMonth({ ...req, body: { month: '2026-10', version: ledger.version, reason: '  ' } }, noReason);
  assert.equal(noReason.statusCode, 400);
  const reopened = response();
  await ledgerApi.reopenMonth({ ...req, body: { month: '2026-10', version: ledger.version, reason: '更正数据' } }, reopened);
  assert.equal(reopened.statusCode, 200);
  assert.equal(ledger.status, 'open');
  assert.equal(ledger.closeAudit.at(-1).action, 'reopened');
  assert.equal(ledger.closeAudit.at(-1).reason, '更正数据');
  assert.equal(auditSnapshots[1].action, 'reopened');
});

test('closed month snapshot also drops platform accounts and opted-out employees', async t => {
  const tenantId = id(), employee = user(tenantId);
  const platformRow = { employeeId: id(), employeeNo: '012', name: '平台管理员', department: '平台', expectedMinutes: 0, actualMinutes: null, confirmationState: 'pending', note: '', version: 0 };
  const ledger = {
    _id: id(), tenantId, month: '2026-10', status: 'closed', version: 5,
    rows: [], closeAudit: [], async save() {},
    closedSnapshot: { rows: [{ employeeId: employee._id, employeeNo: employee.employeeNo, name: '员工', department: '运营', expectedMinutes: 480, actualMinutes: 480, confirmationState: 'confirmed', note: '', version: 1, displayName: '员工（E-1）' }, platformRow] }
  };
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  // getScopedUsers 只返回纳入统计的员工；平台账号已被查询条件排除
  t.mock.method(User, 'find', () => query([employee]));

  const res = response();
  await ledgerApi.getLedger({ tenantId, tenant: calendarTenant, user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, role: 'owner' }, query: { month: '2026-10', scope: 'company' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.rows.map(row => String(row.employeeId)), [String(employee._id)]);
  assert.equal(res.body.data.totals.expectedMinutes, 480);
  // 姓名列只给姓名，历史快照里存过的「姓名（工号）」要清掉
  assert.equal(res.body.data.rows[0].name, '员工');
  assert.equal(res.body.data.rows[0].displayName, undefined);
});

test('month close lock prevents an approval from succeeding after its snapshot starts', async t => {
  const tenantId = id(), employee = user(tenantId), manager = user(tenantId, { attendanceRoles: ['manager'] });
  const ledger = { _id: id(), tenantId, month: '2026-10', status: 'open', version: 4,
    rows: [{ employeeId: employee._id, employeeNo: employee.employeeNo, name: '员工', department: '运营', expectedMinutes: 100, actualMinutes: 100, confirmationState: 'confirmed', note: '', version: 1 }],
    closeAudit: [], async save() {} };
  let locked = false, token;
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'updateOne', async (filter, update) => {
    if (update.$set?.mutationToken) {
      if (locked) return { modifiedCount: 0 };
      locked = true; token = update.$set.mutationToken; return { modifiedCount: 1 };
    }
    if (update.$unset?.mutationToken && locked && filter.mutationToken === token) { locked = false; return { modifiedCount: 1 }; }
    return { modifiedCount: 0 };
  });
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  const pendingRequest = {
    _id: id(), tenantId, applicantId: employee._id, type: 'leave', durationMinutes: 60,
    startAt: new Date('2026-10-05T01:00:00Z'), endAt: new Date('2026-10-05T02:00:00Z'),
    leaveAllocations: [{ date: '2026-10-05', minutes: 60 }], status: 'pending', currentApproverId: manager._id,
    approvals: [{ approverId: manager._id, role: 'manager', status: 'pending' }]
  };
  t.mock.method(AttendanceRequest, 'findOne', () => query(pendingRequest));
  let approvalWrites = 0;
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async () => { approvalWrites++; return pendingRequest; });
  let continueAudit;
  let auditStartedResolve;
  const auditStarted = new Promise(resolve => { auditStartedResolve = resolve; });
  t.mock.method(AttendanceLedgerAudit, 'create', async data => {
    auditStartedResolve();
    await new Promise(resolve => { continueAudit = resolve; });
    return { _id: id(), at: data.at };
  });

  const closeResponse = response();
  const closePromise = ledgerApi.closeMonth({ tenantId, user: { _id: id(), tenantId, status: 'active', mustChangePassword: false, role: 'owner' }, body: { month: '2026-10', version: 4 }, tenant: calendarTenant }, closeResponse);
  await auditStarted;
  const reviewResponse = response();
  await attendanceApi.reviewRequest({ tenantId, user: manager, params: { id: pendingRequest._id }, body: { decision: 'approve' } }, reviewResponse);
  assert.equal(reviewResponse.statusCode, 409);
  assert.equal(approvalWrites, 0);
  continueAudit();
  await closePromise;
  assert.equal(closeResponse.statusCode, 200);
  assert.equal(locked, false);
});

test('owner month-lock recovery rejects a fresh lock and atomically releases a stale dead-process lock', async t => {
  const tenantId = id();
  const owner = { _id: id(), tenantId, role: 'owner', status: 'active', mustChangePassword: false };
  let lock = { month: '2026-10', mutationToken: 'fresh-token', mutationAcquiredAt: new Date(), mutationOwnerPid: 99999999, mutationOwnerHost: os.hostname() };
  t.mock.method(AttendanceMonthLedger, 'find', () => query([lock]));
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(lock));
  let updateFilter;
  t.mock.method(AttendanceMonthLedger, 'updateOne', async (filter, update) => {
    updateFilter = filter;
    for (const key of Object.keys(update.$unset || {})) delete lock[key === 'mutationToken' ? 'mutationToken' : key];
    return { modifiedCount: 1 };
  });
  const fresh = response();
  await ledgerApi.releaseStaleMonthLock({ tenantId, user: owner, params: { month: '2026-10' }, body: { confirmNoLiveMutation: true } }, fresh);
  assert.equal(fresh.statusCode, 409);

  lock.mutationAcquiredAt = new Date(Date.now() - 11 * 60 * 1000);
  const listed = response();
  await ledgerApi.listMonthLocks({ tenantId, user: owner }, listed);
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.data[0].recoverable, true);
  const expectedAcquiredAt = lock.mutationAcquiredAt;
  const recovered = response();
  await ledgerApi.releaseStaleMonthLock({ tenantId, user: owner, params: { month: '2026-10' }, body: { confirmNoLiveMutation: true } }, recovered);
  assert.equal(recovered.statusCode, 200);
  assert.equal(updateFilter.mutationToken, 'fresh-token');
  assert.equal(updateFilter.mutationAcquiredAt, expectedAcquiredAt);
});

test('stale month lock cannot be recovered while its token is active in this process', async t => {
  const tenantId = id();
  const token = 'active-test-token';
  const owner = { _id: id(), tenantId, role: 'owner', status: 'active', mustChangePassword: false };
  const lock = { month: '2026-10', mutationToken: token, mutationAcquiredAt: new Date(Date.now() - 11 * 60 * 1000), mutationOwnerPid: 99999999, mutationOwnerHost: os.hostname() };
  t.mock.method(AttendanceMonthLedger, 'findOne', () => query(lock));
  const active = ledgerApi._coordination.activeMutationTokens;
  active.add(token);
  t.after(() => active.delete(token));
  t.mock.method(AttendanceMonthLedger, 'updateOne', async () => { assert.fail('active lock must not be released'); });
  const res = response();
  await ledgerApi.releaseStaleMonthLock({ tenantId, user: owner, params: { month: '2026-10' }, body: { confirmNoLiveMutation: true } }, res);
  assert.equal(res.statusCode, 409);
});

test('stale row version and closed-month edits return conflicts', async t => {
  const tenantId = id(), employee = user(tenantId);
  const ledger = { tenantId, month: '2026-10', status: 'open', version: 6, rows: [], async save() {} };
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ledger);
  t.mock.method(AttendanceMonthLedger, 'updateOne', async () => ({ modifiedCount: 1 }));
  t.mock.method(User, 'findOne', () => query(employee));
  const stale = response();
  const owner = { _id: id(), tenantId, status: 'active', mustChangePassword: false, role: 'owner' };
  await ledgerApi.saveRow({ tenantId, user: owner, params: { employeeId: employee._id }, body: { month: '2026-10', version: 5, actualMinutes: 420, confirmationState: 'confirmed' }, tenant: calendarTenant }, stale);
  assert.equal(stale.statusCode, 409);
  const invalidConfirmed = response();
  await ledgerApi.saveRow({ tenantId, user: owner, params: { employeeId: employee._id }, body: { month: '2026-10', version: 6, actualMinutes: null, confirmationState: 'confirmed' }, tenant: calendarTenant }, invalidConfirmed);
  assert.equal(invalidConfirmed.statusCode, 400);
  const invalidNoBasis = response();
  await ledgerApi.saveRow({ tenantId, user: owner, params: { employeeId: employee._id }, body: { month: '2026-10', version: 6, actualMinutes: 100, confirmationState: 'no_basis', note: '缺记录' }, tenant: calendarTenant }, invalidNoBasis);
  assert.equal(invalidNoBasis.statusCode, 400);
  ledger.status = 'closed';
  const closed = response();
  await ledgerApi.saveRow({ tenantId, user: owner, params: { employeeId: employee._id }, body: { month: '2026-10', version: 6, actualMinutes: 420, confirmationState: 'confirmed' }, tenant: calendarTenant }, closed);
  assert.equal(closed.statusCode, 409);
});

test('suggested actual minutes deduct leave and imported records from expected minutes', () => {
  const rows = [{
    employeeId: id(), expectedMinutes: 22 * 480, leaveMinutesByType: { personal: 480 },
    lateWithin10: 2, lateOver10: 1, earlyLeave: 1, noClockRecord: 1, lateTotal: 3,
  }];
  ledgerApi._test.attachActualSuggestions(rows, calendarTenant);
  // 迟到≤10 2×0.5h + 迟到>10 1×1h + 早退 1×1h + 无打卡 1×8h = 11 小时
  assert.equal(rows[0].suggestedActualMinutes, 22 * 480 - 480 - 11 * 60);
  assert.equal(rows[0].actualMinutesIsManual, false);
  assert.match(rows[0].suggestedActualNote, /应出勤 176 小时/);
  assert.match(rows[0].suggestedActualNote, /请假 8 小时/);
  assert.match(rows[0].suggestedActualNote, /= 157 小时/);
  // 建议值只算不写库：actualMinutes 仍为空，等管理员确认
  assert.equal(rows[0].actualMinutes, undefined);
});

test('suggested actual minutes are withheld until leave is allocated per day', () => {
  const rows = [{ employeeId: id(), expectedMinutes: 480, leaveMinutesByType: {}, requiresLeaveReconciliation: true }];
  ledgerApi._test.attachActualSuggestions(rows, calendarTenant);
  assert.equal(rows[0].suggestedActualMinutes, null);
  assert.match(rows[0].suggestedActualNote, /请假未按天分摊/);
  // 没有本月员工行（应出勤算不出来）时同样不给建议值
  const noExpected = [{ employeeId: id(), expectedMinutes: 0, leaveMinutesByType: {} }];
  ledgerApi._test.attachActualSuggestions(noExpected, calendarTenant);
  assert.equal(noExpected[0].suggestedActualMinutes, null);
  assert.match(noExpected[0].suggestedActualNote, /本月无应出勤/);
});

test('suggested actual minutes never go below zero and report the shortfall', () => {
  const rows = [{ employeeId: id(), expectedMinutes: 480, leaveMinutesByType: { personal: 480 }, noClockRecord: 3 }];
  ledgerApi._test.attachActualSuggestions(rows, calendarTenant);
  assert.equal(rows[0].suggestedActualMinutes, 0);
  assert.match(rows[0].suggestedActualNote, /按 0 计/);
});

test('suggested actual minutes never replace a value a human already set', () => {
  const base = { expectedMinutes: 480, leaveMinutesByType: {}, noClockRecord: 1 };
  const rows = [
    { ...base, employeeId: id(), actualMinutes: 400, actualMinutesSource: 'manual' },
    { ...base, employeeId: id(), actualMinutes: 0, actualMinutesSource: 'auto' },
    { ...base, employeeId: id(), actualMinutes: 400 },
    { ...base, employeeId: id(), actualMinutes: null },
  ];
  ledgerApi._test.attachActualSuggestions(rows, calendarTenant);
  assert.equal(rows[0].actualMinutesIsManual, true);
  assert.equal(rows[1].actualMinutesIsManual, false, 'auto 的行跟着导入/日历重算');
  assert.equal(rows[2].actualMinutesIsManual, true, '旧行没有来源标记，有值即视为人工，免迁移也不能被覆盖');
  assert.equal(rows[3].actualMinutesIsManual, false, '没值的行可以自动填');
  // 建议值照算（人工只是不被覆盖，不影响建议值本身）
  assert.equal(rows[0].suggestedActualMinutes, 0);
});

test('saving a row records whether the actual value came from the suggestion', async t => {
  const tenantId = id(), employee = user(tenantId);
  const owner = { _id: id(), tenantId, status: 'active', role: 'owner' };
  const ledger = ledgerDoc({ tenantId, month: '2026-10', rows: [{ employeeId: employee._id, name: '员工', expectedMinutes: 10560, actualMinutes: null, confirmationState: 'pending', note: '', version: 0 }] });
  mockLedgerStorage(t, ledger);
  t.mock.method(AttendanceMonthLedger, 'findOne', async () => ledger);
  t.mock.method(User, 'findOne', () => query(employee));
  // 保存时后端会重算一次建议值来核对 auto 是否成立，必须打桩，否则白等 mongoose 缓冲超时
  t.mock.method(AttendanceRequest, 'find', () => query([]));
  const request = body => ({ tenantId, user: owner, params: { employeeId: employee._id }, body: { month: '2026-10', ...body }, tenant: calendarTenant });

  const kept = response();
  await ledgerApi.saveRow(request({ version: 0, actualMinutes: 10560, confirmationState: 'confirmed', actualMinutesSource: 'auto' }), kept);
  assert.equal(kept.statusCode, 200);
  assert.equal(ledger.rows[0].actualMinutesSource, 'auto');

  ledger.version = 1;
  const edited = response();
  await ledgerApi.saveRow(request({ version: 1, actualMinutes: 9000, confirmationState: 'confirmed', actualMinutesSource: 'auto' }), edited);
  assert.equal(edited.statusCode, 200);
  assert.equal(ledger.rows[0].actualMinutesSource, 'manual');

  ledger.version = 2;
  const noBasis = response();
  await ledgerApi.saveRow(request({ version: 2, actualMinutes: null, confirmationState: 'no_basis', note: '缺记录', actualMinutesSource: 'auto' }), noBasis);
  assert.equal(noBasis.statusCode, 200);
  assert.equal(ledger.rows[0].actualMinutesSource, 'manual', '无依据的行不会被建议值覆盖');

  ledger.version = 3;
  const omitted = response();
  await ledgerApi.saveRow(request({ version: 3, actualMinutes: 9000, confirmationState: 'confirmed' }), omitted);
  assert.equal(omitted.statusCode, 200);
  assert.equal(ledger.rows[0].actualMinutesSource, 'manual', '没传来源时按人工兜底');

  ledger.version = 4;
  const bad = response();
  await ledgerApi.saveRow(request({ version: 4, actualMinutes: 9000, confirmationState: 'confirmed', actualMinutesSource: 'robot' }), bad);
  assert.equal(bad.statusCode, 400);
});

test('actual rule falls back to defaults, rejects non-admins and bad numbers', async t => {
  const tenantId = id();
  const owner = { _id: id(), tenantId, status: 'active', role: 'owner' };
  const member = { _id: id(), tenantId, status: 'active', role: 'member' };
  const rule = { lateWithin10Hours: 1, lateOver10Hours: 1, earlyLeaveHours: 1, noClockFullDays: 1 };

  const read = response();
  await ledgerApi.getActualRule({ tenantId, user: owner, tenant: calendarTenant }, read);
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.data.rule, { lateWithin10Hours: 0.5, lateOver10Hours: 1, earlyLeaveHours: 1, noClockFullDays: 1 });
  assert.equal(read.body.data.dayMinutes, 480);
  assert.equal(read.body.data.fields.length, 4);

  const denied = response();
  await ledgerApi.saveActualRule({ tenantId, user: member, tenant: { settings: {} }, body: { rule } }, denied);
  assert.equal(denied.statusCode, 403);

  const tenant = { settings: {}, markModified() {}, async save() {} };
  const invalid = response();
  await ledgerApi.saveActualRule({ tenantId, user: owner, tenant, body: { rule: { ...rule, lateWithin10Hours: -1 } } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body.error, /迟到（10分钟以内）/);
  assert.ok(!invalid.body.error.includes('lateWithin10Hours'), '报错文案不能漏出字段 key');
  assert.equal(tenant.settings.attendanceLedgerActualRule, undefined, '校验失败不应写入');

  const saved = response();
  await ledgerApi.saveActualRule({ tenantId, user: owner, tenant, body: { rule: { ...rule, noClockFullDays: 0.5 } } }, saved);
  assert.equal(saved.statusCode, 200);
  assert.equal(tenant.settings.attendanceLedgerActualRule.noClockFullDays, 0.5);
});

test('pending requests are surfaced separately and never counted as approved', async t => {
  const tenantId = id(), employee = user(tenantId);
  const at = (day, from, to) => ({ startAt: new Date(`2026-10-${day}T${from}:00Z`), endAt: new Date(`2026-10-${day}T${to}:00Z`) });
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employee._id, status: 'approved', type: 'overtime', ...at('05', '01', '02') },
    { applicantId: employee._id, status: 'pending', type: 'overtime', ...at('06', '01', '03') },
    { applicantId: employee._id, status: 'pending', type: 'fieldwork', ...at('07', '01', '02') },
    { applicantId: employee._id, status: 'pending', type: 'leave', leaveType: 'personal', durationMinutes: 480, ...at('08', '01', '09'), leaveAllocations: [{ date: '2026-10-08', minutes: 480 }] },
    { applicantId: employee._id, status: 'rejected', type: 'overtime', ...at('09', '01', '05') },
  ]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  const row = rows[0];
  assert.equal(row.overtimeApprovedMinutes, 60, '已批加班只算 approved');
  assert.equal(row.pendingOvertimeMinutes, 120, '待审批加班单独给');
  assert.equal(row.pendingFieldworkMinutes, 60);
  assert.equal(row.pendingLeaveMinutes, 480);
  assert.equal(row.pendingLeaveUnreconciled, false);
  assert.equal(row.leaveMinutesByType.personal, 0, '待审批的请假不算已批请假');
  assert.equal(row.fieldworkApprovedMinutes, 0, '待审批的出差不算已批出差（上面那条 rejected 也不该出现）');
});

test('pending leave without per-day allocation is only flagged, not given hours', async t => {
  const tenantId = id(), employee = user(tenantId);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employee._id, status: 'pending', type: 'leave', leaveType: 'personal', startAt: new Date('2026-10-05T01:00:00Z'), endAt: new Date('2026-10-05T09:00:00Z') },
  ]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows[0].pendingLeaveMinutes, 0);
  assert.equal(rows[0].pendingLeaveUnreconciled, true, '算不出时长也要让界面能提示「有待审批请假」');
});
