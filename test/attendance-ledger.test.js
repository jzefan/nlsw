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
    applicantId: employee._id, type: 'leave', leaveType: 'sick', durationMinutes: 660, startAt: new Date('2026-09-30T01:00:00Z'), endAt: new Date('2026-10-01T04:00:00Z'),
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
    applicantId: employee._id, type: 'leave', leaveType: 'personal', startAt: new Date('2026-10-05T01:00:00Z'), endAt: new Date('2026-10-05T09:00:00Z')
  }]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows[0].requiresLeaveReconciliation, true);
  assert.equal(rows[0].leaveMinutesByType.personal, 0);
});

test('approved overtime and fieldwork split by Beijing month but remain labeled as approved', async t => {
  const tenantId = id(), employee = user(tenantId);
  t.mock.method(User, 'find', () => query([employee]));
  t.mock.method(AttendanceRequest, 'find', () => query([
    { applicantId: employee._id, type: 'overtime', compensation: 'comp_time', startAt: new Date('2026-10-31T15:30:00Z'), endAt: new Date('2026-10-31T16:30:00Z') },
    { applicantId: employee._id, type: 'fieldwork', startAt: new Date('2026-10-31T15:30:00Z'), endAt: new Date('2026-10-31T16:30:00Z') }
  ]));
  const rows = await ledgerApi._test.buildRows({ tenantId, user: { _id: employee._id, role: 'owner' }, tenant: calendarTenant }, ledgerApi._test.parseMonth('2026-10'), 'company', { rows: [] });
  assert.equal(rows[0].overtimeApprovedMinutes, 30);
  assert.equal(rows[0].overtimeCompTimeMinutes, 30);
  assert.equal(rows[0].fieldworkApprovedMinutes, 30);
  assert.equal(rows[0].actualMinutes, null);
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
