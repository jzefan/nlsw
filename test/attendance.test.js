const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const os = require('os');
const AttendanceRequest = require('../models/AttendanceRequest');
const AttendanceMonthLedger = require('../models/AttendanceMonthLedger');
const AttendanceSubmissionLock = require('../models/AttendanceSubmissionLock');
const HolidayCalendar = require('../models/HolidayCalendar');
const Notice = require('../models/Notice');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const attendance = require('../controllers/api/attendance');
const { calculateLeaveMinutes, isWorkdayAt, requireAttendanceEnabled, requireEmployee } = require('../utils/attendance-permissions');

// 测试进程不连数据库：站内通知写入统一打桩。不打桩的话每条提交/审批用例都会白等一次
// mongoose 缓冲超时（默认 10 秒），而且断言不到通知内容。要断言就读 noticeWrites。
const noticeWrites = [];
let noticeFailure = null;
Notice.create = async document => {
  if (noticeFailure) throw noticeFailure;
  noticeWrites.push(document);
  return document;
};

function id() { return new mongoose.Types.ObjectId(); }

/** 链式查询的通用桩：既能 await，也能接 .select().lean() / .distinct()。 */
function queryResult(value) {
  const result = Array.isArray(value) ? value : [];
  return {
    select() { return { lean: async () => result }; },
    lean: async () => result,
    distinct: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
}

// 序列化申请时会查一次 User.find 补「审批人姓名」给详情时间线用；测试进程不连库，
// 统一返回空（要断言姓名的用例自行 mock.method 覆盖），否则每条提交/审批用例都要白等 mongoose 缓冲超时。
User.find = () => queryResult([]);

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function silenceExpectedErrorLog(t) {
  t.mock.method(console, 'error', () => {});
}

function employee({ tenantId, userId = id(), roles = [], managerId = id(), status = 'active' } = {}) {
  return {
    _id: userId,
    tenantId: { _id: tenantId }, // passport.deserializeUser populates tenantId
    employeeNo: 'E-001',
    mustChangePassword: false,
    managerId,
    status,
    role: 'member',
    attendanceRoles: roles,
    userid: 'employee-1',
    profile: { name: '员工甲' }
  };
}

function requestFor(user, tenantId, startAt, endAt, type = 'leave') {
  return {
    params: { id: String(id()) },
    query: {},
    body: {
      type,
      leaveType: 'personal',
      compensation: 'comp_time',
      startAt,
      endAt,
      reason: '个人申请',
      location: '现场',
      contact: '联系人',
      workContent: '工作内容'
    },
    tenantId,
    tenant: { settings: { attendanceEnabled: true, attendanceCalendarYears: [2026] } },
    user
  };
}

function mockSubmissionLock(t) {
  const locks = new Map();
  let clock = Date.now();
  t.mock.method(AttendanceSubmissionLock, 'findOneAndUpdate', async (filter, update) => {
    const key = `${filter.tenantId}:${filter.applicantId}`;
    const previous = locks.get(key);
    if (previous && (!previous.expiresAt || previous.expiresAt.getTime() > clock)) {
      const error = new Error('duplicate submission lock');
      error.code = 11000;
      throw error;
    }
    locks.set(key, { token: update.$set.token, expiresAt: update.$set.expiresAt });
    return {};
  });
  t.mock.method(AttendanceSubmissionLock, 'deleteOne', async filter => {
    const key = `${filter.tenantId}:${filter.applicantId}`;
    if (locks.get(key)?.token === filter.token) locks.delete(key);
    return { deletedCount: 1 };
  });
  return { advanceClock: milliseconds => { clock += milliseconds; } };
}

/**
 * 考勤申述的「发生日期」不能晚于今天。用例里用相对日期而不是写死某一天，
 * 否则换个月份跑就会变成「提交未来日期」而失败。
 */
function dateKeyMonthsFromNow(monthsAgo) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAgo, 5)).toISOString().slice(0, 10);
}

/** 申述表单：只有发生日期 + 类型 + 事由，没有起止时段。 */
function appealRequestFor(user, tenantId, overrides = {}) {
  const request = requestFor(user, tenantId, null, null, 'appeal');
  request.body = {
    type: 'appeal',
    occurredOn: dateKeyMonthsFromNow(-1),
    appealType: 'lateWithin10',
    reason: '当天打卡机故障，实际按时到岗',
    ...overrides
  };
  return request;
}

test('leave policy uses confirmed weekday schedule, holiday/workday overrides, and rejects unconfirmed years', () => {
  const base = { settings: { attendanceCalendarYears: [2026] } };
  const at = date => new Date(date);
  assert.equal(calculateLeaveMinutes(at('2026-09-21T08:00:00+08:00'), at('2026-09-21T18:00:00+08:00'), base).minutes, 480);
  assert.equal(calculateLeaveMinutes(at('2026-09-19T08:00:00+08:00'), at('2026-09-19T18:00:00+08:00'), base).minutes, 0);
  assert.equal(calculateLeaveMinutes(at('2026-09-19T08:00:00+08:00'), at('2026-09-19T18:00:00+08:00'), {
    settings: { attendanceCalendarYears: [2026], attendanceCalendarOverrides: { '2026-09-19': 'workday' } }
  }).minutes, 480);
  assert.equal(calculateLeaveMinutes(at('2026-09-21T08:00:00+08:00'), at('2026-09-21T18:00:00+08:00'), {
    settings: { attendanceCalendarYears: [2026], attendanceCalendarOverrides: { '2026-09-21': 'holiday' } }
  }).minutes, 0);
  // 内置全国节假日表覆盖的年份视为已确认，表外年份仍需考勤管理员确认
  assert.equal(calculateLeaveMinutes(at('2026-09-21T08:00:00+08:00'), at('2026-09-21T18:00:00+08:00'), { settings: {} }).minutes, 480);
  assert.throws(() => calculateLeaveMinutes(at('2027-09-21T08:00:00+08:00'), at('2027-09-21T18:00:00+08:00'), { settings: {} }), /确认 2027 年工作日历/);
});

test('saturday morning option only adds the morning half day on ordinary saturdays', () => {
  const at = date => new Date(date);
  const withSaturdayMorning = { settings: { attendanceCalendarYears: [2026], attendanceSaturdayMorningWorkday: true } };
  // 普通周六（2026-09-19）：只计入上午 08:00–12:00 这段（默认工作时段的第一段），共 240 分钟
  assert.deepEqual(
    calculateLeaveMinutes(at('2026-09-19T08:00:00+08:00'), at('2026-09-19T18:00:00+08:00'), withSaturdayMorning).allocations,
    [{ date: '2026-09-19', minutes: 240 }]
  );
  assert.equal(isWorkdayAt(at('2026-09-19T08:00:00+08:00').getTime(), withSaturdayMorning), true);
  // 周日仍然是休息日
  assert.equal(isWorkdayAt(at('2026-09-13T08:00:00+08:00').getTime(), withSaturdayMorning), false);
  // 落在周六的法定节假日照休（2026-10-03 在国庆假期内）
  assert.equal(calculateLeaveMinutes(at('2026-10-03T08:00:00+08:00'), at('2026-10-03T18:00:00+08:00'), withSaturdayMorning).minutes, 0);
  // 国务院调休上班日按完整工作日计：2026-02-28 是周六，2026-09-20 是周日
  assert.equal(calculateLeaveMinutes(at('2026-02-28T08:00:00+08:00'), at('2026-02-28T18:00:00+08:00'), withSaturdayMorning).minutes, 480);
  assert.equal(calculateLeaveMinutes(at('2026-09-20T08:00:00+08:00'), at('2026-09-20T18:00:00+08:00'), withSaturdayMorning).minutes, 480);
  // 管理员单日覆盖优先于开关
  assert.equal(calculateLeaveMinutes(at('2026-09-19T08:00:00+08:00'), at('2026-09-19T18:00:00+08:00'), {
    settings: { attendanceCalendarYears: [2026], attendanceSaturdayMorningWorkday: true, attendanceCalendarOverrides: { '2026-09-19': 'holiday' } }
  }).minutes, 0);
  assert.equal(calculateLeaveMinutes(at('2026-09-13T08:00:00+08:00'), at('2026-09-13T18:00:00+08:00'), {
    settings: { attendanceCalendarYears: [2026], attendanceSaturdayMorningWorkday: true, attendanceCalendarOverrides: { '2026-09-13': 'workday' } }
  }).minutes, 480);
  // 开关关着时与原来一致
  assert.equal(calculateLeaveMinutes(at('2026-09-19T08:00:00+08:00'), at('2026-09-19T18:00:00+08:00'), { settings: { attendanceCalendarYears: [2026] } }).minutes, 0);
});

test('leave endpoints must be workdays but an interval may cross weekends', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const tenant = { settings: {
    attendanceCalendarYears: [2026],
    attendanceCalendarOverrides: { '2026-09-22': 'holiday' }
  } };
  assert.equal(isWorkdayAt(new Date('2026-09-22T09:00:00+08:00').getTime(), tenant), false);
  assert.equal(isWorkdayAt(new Date('2026-09-19T09:00:00+08:00').getTime(), tenant), false);
  assert.equal(isWorkdayAt(new Date('2026-09-19T09:00:00+08:00').getTime(), {
    settings: { attendanceCalendarYears: [2026], attendanceCalendarOverrides: { '2026-09-19': 'workday' } }
  }), true);
  t.mock.method(User, 'findOne', async () => manager);
  const holidayRequest = requestFor(user, tenantId, '2026-09-22T09:00:00+08:00', '2026-09-23T10:00:00+08:00');
  holidayRequest.tenant = tenant;
  const holidayResponse = response();
  await attendance.createRequest(holidayRequest, holidayResponse);
  assert.equal(holidayResponse.statusCode, 400);
  assert.match(holidayResponse.body.error, /开始和结束日期必须为工作日/);

  mockSubmissionLock(t);
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));
  // 11/06 周五下班后 → 11/09 周一上午：跨周末只算两端落在工作时段内的部分
  const spanningRequest = requestFor(user, tenantId, '2026-11-06T17:00:00+08:00', '2026-11-09T09:00:00+08:00');
  const spanningResponse = response();
  await attendance.createRequest(spanningRequest, spanningResponse);
  assert.equal(spanningResponse.statusCode, 201);
  assert.equal(spanningResponse.body.data.durationMinutes, 120);
});

test('request list filters by type for the per-type sidebar entries', async t => {
  const tenantId = id(), applicantId = id();
  const user = employee({ tenantId, userId: applicantId });
  const filters = [];
  t.mock.method(AttendanceRequest, 'find', filter => {
    filters.push(filter);
    return { sort() { return this }, skip() { return this }, limit: async () => [] };
  });
  t.mock.method(AttendanceRequest, 'countDocuments', async () => 0);

  const list = response();
  await attendance.listRequests({ tenantId, user, query: { view: 'mine', type: 'overtime' } }, list);
  assert.equal(list.statusCode, 200);
  assert.equal(filters[0].type, 'overtime');
  assert.equal(String(filters[0].applicantId), String(applicantId));

  // 未传 type 时返回全部类型；非法 type 忽略而不是报错
  await attendance.listRequests({ tenantId, user, query: { view: 'mine' } }, response());
  assert.equal(filters[1].type, undefined);
  await attendance.listRequests({ tenantId, user, query: { view: 'mine', type: 'unknown' } }, response());
  assert.equal(filters[2].type, undefined);
});

test('roleless delegate can approve assigned requests and view only their own review history', async t => {
  const tenantId = id(), delegate = employee({ tenantId }), another = employee({ tenantId });
  const record = { _id: id(), tenantId, applicantId: id(), applicant: { name: '申请人' }, type: 'overtime', startAt: new Date('2026-09-30T18:00:00+08:00'), endAt: new Date('2026-09-30T19:00:00+08:00'), durationMinutes: 60, status: 'pending', currentApproverId: delegate._id, approvals: [{ approverId: delegate._id, role: 'general_manager_delegate', status: 'pending' }] };
  t.mock.method(AttendanceRequest, 'findOne', async () => record);
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(String(filter.currentApproverId), String(delegate._id));
    record.approvals[0].status = update.$set['approvals.0.status'];
    record.status = update.$set.status;
    record.currentApproverId = update.$set.currentApproverId;
    return record;
  });
  const filters = [];
  const matches = filter => record.approvals.some(step => String(step.approverId) === String(filter.approvals?.$elemMatch?.approverId) && filter.approvals.$elemMatch.status.$in.includes(step.status));
  t.mock.method(AttendanceRequest, 'find', filter => {
    filters.push(filter);
    return { sort() { return this }, skip() { return this }, limit: async () => matches(filter) ? [record] : [] };
  });
  t.mock.method(AttendanceRequest, 'countDocuments', async filter => matches(filter) ? 1 : 0);
  t.mock.method(AttendanceRequest, 'exists', async filter => String(filter['approvals.approverId']) === String(delegate._id));
  t.mock.method(User, 'exists', async () => false);
  t.mock.method(AttendanceMonthLedger, 'findOneAndUpdate', async () => ({}));
  t.mock.method(AttendanceMonthLedger, 'updateOne', async () => ({ modifiedCount: 1 }));
  t.mock.method(AttendanceMonthLedger, 'exists', async () => false);
  const req = { tenantId, tenant: { settings: {} }, user: delegate, params: { id: String(record._id) }, body: { decision: 'approve' } };
  const reviewed = response();
  await attendance.reviewRequest(req, reviewed);
  assert.equal(reviewed.statusCode, 200);
  const history = response();
  await attendance.listRequests({ ...req, query: { view: 'history' } }, history);
  assert.equal(history.statusCode, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(String(filters[0].tenantId), String(tenantId));
  assert.equal(String(filters[0].approvals.$elemMatch.approverId), String(delegate._id));
  const otherHistory = response();
  await attendance.listRequests({ ...req, user: another, query: { view: 'history' } }, otherHistory);
  assert.equal(otherHistory.statusCode, 200);
  assert.equal(otherHistory.body.data.length, 0);
  assert.equal(await attendance.getApprovalAccess(req), true);
  assert.equal(await attendance.getApprovalAccess({ ...req, user: another }), false);
  assert.equal(await attendance.getApprovalAccess({ ...req, user: { ...delegate, status: 'disabled' } }), false);
  const secrets = require('../config/secrets');
  const originalAttendanceEnabled = secrets.enableAttendance;
  secrets.enableAttendance = true;
  t.after(() => { secrets.enableAttendance = originalAttendanceEnabled; });
  const me = response();
  await require('../controllers/api/user').getMe({ ...req, tenant: { _id: tenantId, settings: { attendanceEnabled: true } } }, me);
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.user.canReviewAttendance, true, '常规登录信息携带本人审批入口能力');
  const team = response();
  await attendance.listRequests({ ...req, query: { view: 'team' } }, team);
  assert.equal(team.statusCode, 403, '本人审批能力不附带团队查看权');
});

test('configured roleless manager and general-manager delegate have approval entry access', async t => {
  const tenantId = id(), approver = employee({ tenantId });
  t.mock.method(User, 'exists', async filter => {
    assert.equal(String(filter.tenantId), String(tenantId));
    assert.equal(String(filter.managerId), String(approver._id));
    return true;
  });
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  assert.equal(await attendance.getApprovalAccess({ tenantId, user: approver, tenant: { settings: {} } }), true);
  t.mock.method(User, 'exists', async () => false);
  assert.equal(await attendance.getApprovalAccess({ tenantId, user: approver, tenant: { settings: { attendanceGeneralManagerDelegateId: approver._id } } }), true);
  assert.equal(await attendance.getApprovalAccess({ tenantId: id(), user: approver }), false, '跨租户上下文不能获得审批能力');
});

test('employee guard accepts populated tenant and all attendance guards reject disabled accounts', async () => {
  const tenantId = id();
  const populatedTenant = new Tenant({ _id: tenantId, code: 'TEST', name: 'Test tenant' });
  const req = { tenantId, user: { ...employee({ tenantId }), tenantId: populatedTenant } };
  let nextCalls = 0;
  assert.equal(requireEmployee(req, response(), () => nextCalls++), 0);
  assert.equal(nextCalls, 1);

  const legacyUser = { ...employee({ tenantId }) };
  delete legacyUser.mustChangePassword;
  let legacyNextCalls = 0;
  requireEmployee({ tenantId, user: legacyUser }, response(), () => legacyNextCalls++);
  assert.equal(legacyNextCalls, 1, 'legacy accounts without the reset flag can use their existing password');

  const disabledResponse = response();
  const disabled = { ...employee({ tenantId, status: 'disabled' }) };
  requireEmployee({ tenantId, user: disabled }, disabledResponse, () => nextCalls++);
  assert.equal(disabledResponse.statusCode, 403);
  assert.equal(nextCalls, 1);

  const disabledFeatureResponse = response();
  await requireAttendanceEnabled({ tenantId, tenant: { settings: { attendanceEnabled: true } }, user: disabled }, disabledFeatureResponse, () => nextCalls++);
  assert.equal(disabledFeatureResponse.statusCode, 403);
  assert.equal(nextCalls, 1);

  const initialPasswordResponse = response();
  const initialPasswordUser = { ...employee({ tenantId }), mustChangePassword: true };
  requireEmployee({ tenantId, user: initialPasswordUser }, initialPasswordResponse, () => nextCalls++);
  assert.equal(initialPasswordResponse.statusCode, 200);
  assert.equal(nextCalls, 2, 'an active employee can use attendance before changing the initial password');

  // 历史账号没有 status 字段，视为在职而不是已停用
  const unsetStatusResponse = response();
  const unsetStatusUser = { ...employee({ tenantId }) };
  delete unsetStatusUser.status;
  requireEmployee({ tenantId, user: unsetStatusUser }, unsetStatusResponse, () => nextCalls++);
  assert.equal(unsetStatusResponse.statusCode, 200);
  assert.equal(nextCalls, 3, 'a legacy account without a status field is in post');
});

test('employee guard permits company-linked staff without an employee number', () => {
  const tenantId = id();
  const missingEmployeeNo = { ...employee({ tenantId }), employeeNo: '' };
  const missingResponse = response();
  let nextCalls = 0;
  requireEmployee({ tenantId, user: missingEmployeeNo }, missingResponse, () => nextCalls++);
  assert.equal(missingResponse.statusCode, 200);
  assert.equal(nextCalls, 1);

  const blankEmployeeNo = { ...employee({ tenantId }), employeeNo: '   ' };
  const blankResponse = response();
  requireEmployee({ tenantId, user: blankEmployeeNo }, blankResponse, () => nextCalls++);
  assert.equal(blankResponse.statusCode, 200);
  assert.equal(nextCalls, 2);
});

test('simultaneous overlapping leave submissions serialize and only one request is created', async t => {
  silenceExpectedErrorLog(t);
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const created = [];
  mockSubmissionLock(t);
  t.mock.method(User, 'findOne', async () => manager);
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => {
    await new Promise(resolve => setTimeout(resolve, 5));
    created.push(document);
    return { _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } };
  });

  const makeRequest = () => requestFor(user, tenantId, '2026-09-21T09:00:00+08:00', '2026-09-21T10:00:00+08:00');
  const responses = [response(), response()];
  await Promise.all(responses.map((res, index) => attendance.createRequest(makeRequest(), res)));
  assert.equal(created.length, 1);
  assert.deepEqual(responses.map(res => res.statusCode).sort(), [201, 409]);
  assert.ok(AttendanceSubmissionLock.schema.indexes().some(([keys, options]) => keys.tenantId && keys.applicantId && options.unique));
  assert.ok(!AttendanceSubmissionLock.schema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined));
});

test('submission ownership survives delays longer than the former lease duration', async t => {
  silenceExpectedErrorLog(t);
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const created = [];
  const lock = mockSubmissionLock(t);
  let signalFirstOverlapCheck;
  const firstOverlapCheck = new Promise(resolve => { signalFirstOverlapCheck = resolve; });
  let resumeFirstRequest;
  const firstRequestBarrier = new Promise(resolve => { resumeFirstRequest = resolve; });
  let overlapChecks = 0;
  t.mock.method(User, 'findOne', async () => manager);
  t.mock.method(AttendanceRequest, 'exists', async () => {
    overlapChecks++;
    if (overlapChecks === 1) {
      signalFirstOverlapCheck();
      await firstRequestBarrier;
    }
    return false;
  });
  t.mock.method(AttendanceRequest, 'create', async document => {
    created.push(document);
    return { _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } };
  });

  const makeRequest = () => requestFor(user, tenantId, '2026-09-21T09:00:00+08:00', '2026-09-21T10:00:00+08:00');
  const firstResponse = response();
  const firstRun = attendance.createRequest(makeRequest(), firstResponse);
  await firstOverlapCheck;
  lock.advanceClock(31000);

  const secondResponse = response();
  await attendance.createRequest(makeRequest(), secondResponse);
  resumeFirstRequest();
  await firstRun;

  assert.deepEqual([firstResponse.statusCode, secondResponse.statusCode].sort(), [201, 409]);
  assert.equal(created.length, 1);
});

test('attendance requests require whole-hour endpoints for every request type', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  t.mock.method(User, 'findOne', async () => manager);
  const leaveRequest = requestFor(user, tenantId, '2026-09-21T09:30:00+08:00', '2026-09-21T10:30:00+08:00');
  const leaveResponse = response();
  await attendance.createRequest(leaveRequest, leaveResponse);
  assert.equal(leaveResponse.statusCode, 400);
  assert.match(leaveResponse.body.error, /整点/);

  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));
  const overtimeRequest = requestFor(user, tenantId, '2026-09-21T09:30:00+08:00', '2026-09-21T10:45:00+08:00', 'overtime');
  const overtimeResponse = response();
  await attendance.createRequest(overtimeRequest, overtimeResponse);
  assert.equal(overtimeResponse.statusCode, 400);
  assert.match(overtimeResponse.body.error, /整点/);

  const wholeHourOvertime = requestFor(user, tenantId, '2026-09-21T18:00:00+08:00', '2026-09-21T20:00:00+08:00', 'overtime');
  const wholeHourResponse = response();
  await attendance.createRequest(wholeHourOvertime, wholeHourResponse);
  assert.equal(wholeHourResponse.statusCode, 201);
  assert.equal(wholeHourResponse.body.data.durationMinutes, 120);
});

test('overtime compensation accepts leave-in-lieu, overtime pay and no compensation, and rejects anything else', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  t.mock.method(User, 'findOne', async () => ({ _id: managerId, employeeNo: 'M-1', status: 'active' }));
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));
  for (const compensation of ['comp_time', 'overtime_pay', 'none']) {
    const request = requestFor(user, tenantId, '2026-09-21T18:00:00+08:00', '2026-09-21T20:00:00+08:00', 'overtime');
    request.body.compensation = compensation;
    const res = response();
    await attendance.createRequest(request, res);
    assert.equal(res.statusCode, 201, `${compensation} 应该可以提交`);
  }
  const invalid = requestFor(user, tenantId, '2026-09-21T18:00:00+08:00', '2026-09-21T20:00:00+08:00', 'overtime');
  invalid.body.compensation = 'bonus';
  const invalidResponse = response();
  await attendance.createRequest(invalid, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.match(invalidResponse.body.error, /补偿方式/);
});

test('appeal requests carry no time range and follow the ordinary approval chain', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const created = [];
  noticeWrites.length = 0;
  t.mock.method(User, 'findOne', async () => ({ _id: managerId, employeeNo: 'M-1', name: '张经理', status: 'active' }));
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => {
    created.push(document);
    return { _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } };
  });

  const occurredOn = dateKeyMonthsFromNow(-1);
  const res = response();
  await attendance.createRequest(appealRequestFor(user, tenantId, { occurredOn }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(created[0].occurredOn, occurredOn);
  assert.equal(created[0].appealType, 'lateWithin10');
  assert.equal(created[0].startAt, undefined, '申述没有起止时段，不该造出一对整点时间');
  assert.equal(created[0].endAt, undefined);
  assert.equal(created[0].durationMinutes, undefined, '申述没有时长，台账里也不按时长统计');
  assert.deepEqual(created[0].approvals.map(step => step.role), ['manager'], '申述沿用请假/加班/出差那一条审批链');
  assert.equal(res.body.data.occurredOn, occurredOn);
  assert.equal(res.body.data.appealType, 'lateWithin10');
  assert.equal(res.body.data.durationHours, null, '时长缺席要给 null，不能是 NaN');
  assert.equal(noticeWrites.length, 1);
  assert.equal(noticeWrites[0].kind, 'attendance_pending');
  assert.equal(String(noticeWrites[0].userId), String(managerId));
  assert.match(noticeWrites[0].title, /提交了考勤申述申请/);
  assert.equal(noticeWrites[0].link, '/attendance/approvals?type=appeal');
  assert.match(noticeWrites[0].body, new RegExp(occurredOn));
  assert.match(noticeWrites[0].body, /迟到（10分钟以内）/);
});

test('appeal requests reject a malformed or future date, an unknown type and a duplicate', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  let duplicated = false;
  t.mock.method(User, 'findOne', async () => ({ _id: managerId, employeeNo: 'M-1', status: 'active' }));
  t.mock.method(AttendanceRequest, 'exists', async () => duplicated);
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));

  const malformed = response();
  await attendance.createRequest(appealRequestFor(user, tenantId, { occurredOn: '2026/09/30' }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.match(malformed.body.error, /发生日期/);

  const future = response();
  await attendance.createRequest(appealRequestFor(user, tenantId, { occurredOn: dateKeyMonthsFromNow(1) }), future);
  assert.equal(future.statusCode, 400);
  assert.match(future.body.error, /不能晚于今天/);

  const unknownType = response();
  await attendance.createRequest(appealRequestFor(user, tenantId, { appealType: 'sleeping' }), unknownType);
  assert.equal(unknownType.statusCode, 400);
  assert.match(unknownType.body.error, /申述类型/);

  const noReason = response();
  await attendance.createRequest(appealRequestFor(user, tenantId, { reason: '   ' }), noReason);
  assert.equal(noReason.statusCode, 400);
  assert.match(noReason.body.error, /事由/);

  // 同一天同一类型的重复提交会重复核减台账次数，必须拦住
  duplicated = true;
  const duplicate = response();
  await attendance.createRequest(appealRequestFor(user, tenantId), duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.match(duplicate.body.error, /重复提交/);
});

test('approving an appeal locks the occurrence month and refuses a closed month', async t => {
  const tenantId = id(), applicantId = id(), managerId = id(), requestId = id();
  const { _coordination } = require('../controllers/api/attendance-ledger');
  const lockedMonths = [];
  noticeWrites.length = 0;
  t.mock.method(_coordination, 'acquireMonthMutationLock', async (tenant, month) => { lockedMonths.push(month); return { month }; });
  t.mock.method(_coordination, 'releaseMonthMutationLock', async () => {});

  const occurredOn = dateKeyMonthsFromNow(-1);
  const pending = {
    _id: requestId, tenantId, applicantId, type: 'appeal', occurredOn, appealType: 'lateWithin10',
    reason: '打卡机故障', applicant: { name: '员工甲' },
    approvals: [{ approverId: managerId, role: 'manager', status: 'pending' }],
    currentApproverId: managerId
  };
  let closedLedger = { _id: id() };
  t.mock.method(AttendanceRequest, 'findOne', async () => pending);
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async () => ({ ...pending, status: 'approved', currentApproverId: null }));
  t.mock.method(AttendanceMonthLedger, 'exists', async () => closedLedger);
  const approveRequest = () => ({
    params: { id: String(requestId) }, tenantId, user: employee({ tenantId, userId: managerId }),
    tenant: { settings: { attendanceCalendarYears: [2026] } }, body: { decision: 'approve' }
  });

  const closed = response();
  await attendance.reviewRequest(approveRequest(), closed);
  assert.equal(closed.statusCode, 409);
  assert.match(closed.body.error, /已结账月份/);
  assert.deepEqual(lockedMonths, [occurredOn.slice(0, 7)], '按发生日期所在月份加锁，而不是按提交时间');

  closedLedger = null;
  lockedMonths.length = 0;
  const approved = response();
  await attendance.reviewRequest(approveRequest(), approved);
  assert.equal(approved.statusCode, 200);
  assert.deepEqual(lockedMonths, [occurredOn.slice(0, 7)]);
  assert.equal(noticeWrites.length, 1);
  assert.equal(noticeWrites[0].kind, 'attendance_approved');
  assert.equal(String(noticeWrites[0].userId), String(applicantId));
  assert.equal(noticeWrites[0].link, '/attendance/requests?type=appeal');
  assert.match(noticeWrites[0].body, /迟到（10分钟以内）/);
});

test('serialized requests carry approver names so the timeline can show who is reviewing', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  t.mock.method(User, 'findOne', async () => ({ _id: managerId, employeeNo: 'M-1', status: 'active' }));
  t.mock.method(User, 'find', () => queryResult([{ _id: managerId, profile: { name: '韩经理' }, userid: 'han' }]));
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));
  const res = response();
  await attendance.createRequest(requestFor(user, tenantId, '2026-09-21T18:00:00+08:00', '2026-09-21T20:00:00+08:00', 'overtime'), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.approvals[0].approverName, '韩经理', '详情时间线要能显示「等待 谁 审批」');
});

test('three working days needs only manager approval; more than three adds general manager', async t => {
  const tenantId = id(), applicantId = id(), managerId = id(), gmId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const generalManager = { _id: gmId, employeeNo: 'GM-1', status: 'active' };
  const created = [];
  mockSubmissionLock(t);
  t.mock.method(User, 'findOne', async () => manager);
  t.mock.method(User, 'find', () => ({
    select() { return this; },
    limit() { return Promise.resolve([generalManager]); },
    lean() { return Promise.resolve([generalManager]); }
  }));
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => {
    created.push(document);
    return { _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } };
  });

  const exactlyThreeDays = requestFor(user, tenantId, '2026-11-02T08:00:00+08:00', '2026-11-04T18:00:00+08:00');
  const exactlyThreeDaysResponse = response();
  await attendance.createRequest(exactlyThreeDays, exactlyThreeDaysResponse);
  assert.equal(exactlyThreeDaysResponse.statusCode, 201);
  assert.equal(exactlyThreeDaysResponse.body.data.durationMinutes, 24 * 60);
  assert.deepEqual(created[0].approvals.map(step => step.role), ['manager']);

  const moreThanThreeDays = requestFor(user, tenantId, '2026-11-02T08:00:00+08:00', '2026-11-05T09:00:00+08:00');
  const moreThanThreeDaysResponse = response();
  await attendance.createRequest(moreThanThreeDays, moreThanThreeDaysResponse);
  assert.equal(moreThanThreeDaysResponse.statusCode, 201);
  assert.equal(moreThanThreeDaysResponse.body.data.durationMinutes, 25 * 60);
  assert.deepEqual(created[1].approvals.map(step => [step.role, String(step.approverId)]), [
    ['manager', String(managerId)], ['general_manager', String(gmId)]
  ]);
});

test('a missing or duplicated general manager blocks a long leave with an actionable message', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  let generalManagers = [];
  mockSubmissionLock(t);
  t.mock.method(User, 'findOne', async () => manager);
  t.mock.method(User, 'find', () => ({
    select() { return this },
    limit() { return Promise.resolve(generalManagers) },
    lean() { return Promise.resolve(generalManagers) }
  }));
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document } } }));
  const longLeave = () => requestFor(user, tenantId, '2026-11-02T08:00:00+08:00', '2026-11-06T18:00:00+08:00');

  const missingResponse = response();
  await attendance.createRequest(longLeave(), missingResponse);
  assert.equal(missingResponse.statusCode, 409);
  assert.match(missingResponse.body.error, /请假超过 3 个工作日需要总经理终审/);
  assert.match(missingResponse.body.error, /公司当前没有在职总经理/);
  assert.match(missingResponse.body.error, /考勤设置 → 员工资料/);

  generalManagers = [{ _id: id(), employeeNo: 'GM-1' }, { _id: id(), employeeNo: 'GM-2' }];
  const duplicatedResponse = response();
  await attendance.createRequest(longLeave(), duplicatedResponse);
  assert.equal(duplicatedResponse.statusCode, 409);
  assert.match(duplicatedResponse.body.error, /公司当前有多名总经理/);

  // 正好 3 个工作日只走直属经理，不受总经理配置影响
  generalManagers = [];
  const exactlyThreeDaysResponse = response();
  await attendance.createRequest(requestFor(user, tenantId, '2026-11-02T08:00:00+08:00', '2026-11-04T18:00:00+08:00'), exactlyThreeDaysResponse);
  assert.equal(exactlyThreeDaysResponse.statusCode, 201);
  assert.equal(exactlyThreeDaysResponse.body.data.durationMinutes, 24 * 60);
});

test('general manager leave routes directly to the configured delegate', async t => {
  const tenantId = id(), gmId = id(), managerId = id(), delegateId = id();
  const user = employee({ tenantId, userId: gmId, managerId, roles: ['general_manager'] });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const gm = { _id: gmId, employeeNo: 'GM-1' };
  const delegate = { _id: delegateId, employeeNo: 'D-1', status: 'active' };
  const created = [];
  mockSubmissionLock(t);
  t.mock.method(User, 'findOne', async query => String(query._id) === String(managerId) ? manager : delegate);
  t.mock.method(User, 'find', () => ({
    select() { return this; },
    limit() { return Promise.resolve([gm]); },
    lean() { return Promise.resolve([gm]); }
  }));
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => {
    created.push(document);
    return { _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } };
  });
  const req = requestFor(user, tenantId, '2026-09-21T08:00:00+08:00', '2026-09-24T18:00:00+08:00');
  req.tenant.settings.attendanceGeneralManagerDelegateId = delegateId;
  const res = response();
  await attendance.createRequest(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].durationMinutes, 32 * 60);
  assert.deepEqual(created[0].approvals.map(step => [String(step.approverId), step.role]), [
    [String(delegateId), 'general_manager_delegate']
  ]);
});

test('database duplicate-key failure on general-manager assignment maps to conflict', async t => {
  silenceExpectedErrorLog(t);
  const tenantId = id(), userId = id();
  const user = {
    _id: userId, tenantId, userid: 'member-1', employeeNo: '', department: '', managerId: null,
    status: 'active', attendanceRoles: [], profile: { name: '员工' }
  };
  const query = Promise.resolve(user);
  query.select = projection => { assert.match(projection, /\+attendanceGeneralManagerTenantId/); return query; };
  t.mock.method(User, 'findOne', () => query);
  t.mock.method(User, 'exists', async () => null);
  t.mock.method(User, 'updateOne', async () => { const error = new Error('duplicate key'); error.code = 11000; throw error; });
  const res = response();
  await attendance.updateEmployeeProfile({
    user: { role: 'owner' }, tenantId, body: { userId, employeeNo: 'GM-1', department: '管理部', attendanceRoles: ['general_manager'] }
  }, res);
  assert.equal(res.statusCode, 409);
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.attendanceGeneralManagerTenantId && options.unique && options.sparse));
});

test('employee profile cannot add or remove the general manager attendance role', async t => {
  const tenantId = id(), gmId = id(), memberId = id();
  // 现任总经理：提交里去掉 general_manager 也会被保留，唯一标记不动
  const gm = {
    _id: gmId, tenantId, userid: 'gm-1', employeeNo: 'GM-1', department: '管理部', managerId: null,
    status: 'active', attendanceRoles: ['general_manager'], attendanceGeneralManagerTenantId: tenantId,
    attendanceTracked: true, profile: { name: '总经理' }
  };
  const gmQuery = Promise.resolve(gm);
  gmQuery.select = () => gmQuery;
  let gmUpdate;
  t.mock.method(User, 'findOne', () => gmQuery);
  t.mock.method(User, 'exists', async () => null);
  t.mock.method(User, 'updateOne', async (filter, value) => { gmUpdate = value; return { modifiedCount: 1 }; });
  const gmRes = response();
  await attendance.updateEmployeeProfile({
    user: { role: 'owner' }, tenantId,
    body: { userId: gmId, employeeNo: 'GM-1', department: '管理部', managerId: null, attendanceRoles: [] }
  }, gmRes);
  assert.equal(gmRes.statusCode, 200);
  assert.deepEqual(gmUpdate.$set.attendanceRoles, ['general_manager']);
  assert.equal(gmUpdate.$set.attendanceGeneralManagerTenantId, tenantId);

  // 普通员工提交 general_manager 不会生效（该角色由用户管理的职位决定）
  const member = {
    _id: memberId, tenantId, userid: 'member-1', employeeNo: 'E-1', department: '运营', managerId: null,
    status: 'active', attendanceRoles: [], attendanceTracked: true, profile: { name: '员工' }
  };
  const memberQuery = Promise.resolve(member);
  memberQuery.select = () => memberQuery;
  let memberUpdate;
  t.mock.method(User, 'findOne', () => memberQuery);
  t.mock.method(User, 'updateOne', async (filter, value) => { memberUpdate = value; return { modifiedCount: 1 }; });
  const memberRes = response();
  await attendance.updateEmployeeProfile({
    user: { role: 'owner' }, tenantId,
    body: { userId: memberId, employeeNo: 'E-1', department: '运营', managerId: null, attendanceRoles: ['general_manager'] }
  }, memberRes);
  assert.equal(memberRes.statusCode, 200);
  assert.deepEqual(memberUpdate.$set.attendanceRoles, []);
  assert.equal(memberUpdate.$set.attendanceGeneralManagerTenantId, undefined);
});

test('「经理」角色已停用：不能新增，但存量勾选可原样保留（编辑其他字段不该被 400 打断）', async t => {
  const tenantId = id(), memberId = id(), legacyId = id();
  const memberQuery = Promise.resolve({
    _id: memberId, tenantId, userid: 'member-1', employeeNo: 'E-1', department: '运营', managerId: null,
    status: 'active', attendanceRoles: [], attendanceTracked: true, profile: { name: '员工' }
  });
  memberQuery.select = () => memberQuery;
  t.mock.method(User, 'exists', async () => null);
  t.mock.method(User, 'findOne', () => memberQuery);
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));

  // 新增：没有该角色的人传 manager → 400（防自审改用「直属经理」指向总经理实现）
  const rejected = response();
  await attendance.updateEmployeeProfile({
    user: { role: 'owner' }, tenantId,
    body: { userId: memberId, employeeNo: 'E-1', department: '运营', managerId: null, attendanceRoles: ['manager'] }
  }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.body.error, /经理/);

  // 保留：已经勾过的人，编辑其他字段时原样带回 manager → 200 且不清掉
  const legacyQuery = Promise.resolve({
    _id: legacyId, tenantId, userid: 'legacy-1', employeeNo: 'E-9', department: '运营', managerId: null,
    status: 'active', attendanceRoles: ['manager'], attendanceTracked: true, profile: { name: '老经理' }
  });
  legacyQuery.select = () => legacyQuery;
  let legacyUpdate;
  t.mock.method(User, 'findOne', () => legacyQuery);
  t.mock.method(User, 'updateOne', async (filter, value) => { legacyUpdate = value; return { modifiedCount: 1 }; });

  const kept = response();
  await attendance.updateEmployeeProfile({
    user: { role: 'owner' }, tenantId,
    body: { userId: legacyId, employeeNo: 'E-9', department: '运营分部', managerId: null, attendanceRoles: ['manager'] }
  }, kept);
  assert.equal(kept.statusCode, 200, '存量勾选必须能保存，不能打断编辑');
  assert.deepEqual(legacyUpdate.$set.attendanceRoles, ['manager'], '存量角色不该被静默清掉');
  assert.equal(legacyUpdate.$set.department, '运营分部', '其他字段要正常保存');
});

test('employee people list hides platform accounts', async t => {
  const tenantId = id();
  const filters = [];
  t.mock.method(User, 'find', filter => {
    filters.push(filter);
    return { select() { return this }, sort() { return this }, lean: async () => [] };
  });
  const res = response();
  await attendance.listPeople({ tenantId, user: { role: 'owner' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(filters.length, 1);
  assert.deepEqual(filters[0], { tenantId, role: { $ne: 'platform' } });
});

test('app admin can manage employee profiles while ordinary members cannot', async t => {
  const tenantId = id(), userId = id();
  t.mock.method(User, 'find', () => ({ select() { return this; }, sort() { return this; }, lean: async () => [] }));
  const admin = { role: 'member', privilege: ['admin'] };
  const listRes = response();
  await attendance.listPeople({ tenantId, user: admin }, listRes);
  assert.equal(listRes.statusCode, 200);

  const employeeUser = {
    _id: userId, tenantId, userid: 'employee-1', role: 'member', status: 'active',
    employeeNo: '', department: '', attendanceRoles: [], profile: { name: '员工' }
  };
  const profileQuery = Promise.resolve(employeeUser);
  profileQuery.select = () => profileQuery;
  t.mock.method(User, 'findOne', () => profileQuery);
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));
  const updateRes = response();
  await attendance.updateEmployeeProfile({ tenantId, user: admin, body: { userId, attendanceTracked: false } }, updateRes);
  assert.equal(updateRes.statusCode, 200);

  for (const user of [{ role: 'member', privilege: [] }, { role: 'platform', privilege: ['admin'] }]) {
    const deniedList = response(), deniedUpdate = response();
    await attendance.listPeople({ tenantId, user }, deniedList);
    await attendance.updateEmployeeProfile({ tenantId, user, body: { userId } }, deniedUpdate);
    assert.equal(deniedList.statusCode, 403);
    assert.equal(deniedUpdate.statusCode, 403);
  }

  const delegateRes = response();
  await attendance.getGeneralManagerDelegate({ tenantId, user: admin }, delegateRes);
  assert.equal(delegateRes.statusCode, 403);
});

test('employee profile stores the attendance tracking switch and rejects platform accounts', async t => {
  const tenantId = id(), userId = id();
  const employeeUser = {
    _id: userId, tenantId, userid: 'member-1', employeeNo: 'E-1', department: '运营', managerId: null,
    status: 'active', role: 'member', attendanceRoles: [], profile: { name: '员工' }
  };
  const profileQuery = Promise.resolve(employeeUser);
  profileQuery.select = () => profileQuery;
  let update;
  t.mock.method(User, 'findOne', () => profileQuery);
  t.mock.method(User, 'exists', async () => null);
  t.mock.method(User, 'updateOne', async (filter, value) => { update = value; return { modifiedCount: 1 }; });

  const offRes = response();
  await attendance.updateEmployeeProfile({ user: { role: 'owner' }, tenantId, body: { userId, attendanceTracked: false } }, offRes);
  assert.equal(offRes.statusCode, 200);
  assert.equal(update.$set.attendanceTracked, false);

  const onRes = response();
  await attendance.updateEmployeeProfile({ user: { role: 'owner' }, tenantId, body: { userId, attendanceTracked: true } }, onRes);
  assert.equal(onRes.statusCode, 200);
  assert.equal(update.$set.attendanceTracked, true);

  const invalidRes = response();
  await attendance.updateEmployeeProfile({ user: { role: 'owner' }, tenantId, body: { userId, attendanceTracked: 'no' } }, invalidRes);
  assert.equal(invalidRes.statusCode, 400);

  // 平台账号不是公司员工，不能通过员工资料接口维护
  const platformQuery = Promise.resolve({ ...employeeUser, role: 'platform' });
  platformQuery.select = () => platformQuery;
  t.mock.method(User, 'findOne', () => platformQuery);
  const platformRes = response();
  await attendance.updateEmployeeProfile({ user: { role: 'owner' }, tenantId, body: { userId, attendanceTracked: false } }, platformRes);
  assert.equal(platformRes.statusCode, 400);
  assert.match(platformRes.body.error, /平台账号/);
});

test('cross-person withdrawal is scoped to applicant and duplicate review returns conflict', async t => {
  const tenantId = id(), applicantId = id(), approverId = id(), requestId = id();
  const user = employee({ tenantId, userId: approverId });
  let withdrawalQuery;
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async query => { withdrawalQuery = query; return null; });
  const withdrawRes = response();
  await attendance.withdrawRequest({ params: { id: String(requestId) }, tenantId, user }, withdrawRes);
  assert.equal(withdrawRes.statusCode, 404);
  assert.equal(String(withdrawalQuery.applicantId), String(approverId));
  assert.equal(String(withdrawalQuery.tenantId), String(tenantId));

  t.mock.method(AttendanceRequest, 'findOne', async () => null);
  let reviewedRecordExists = true;
  t.mock.method(AttendanceRequest, 'exists', async query => {
    assert.equal(String(query.tenantId), String(tenantId));
    assert.equal(String(query['approvals.approverId']), String(approverId));
    return reviewedRecordExists;
  });
  const reviewRes = response();
  await attendance.reviewRequest({ params: { id: String(requestId) }, tenantId, user, body: { decision: 'approve' } }, reviewRes);
  assert.equal(reviewRes.statusCode, 409);

  reviewedRecordExists = false; // A foreign tenant or another person's task remains indistinguishable from missing.
  const foreignRes = response();
  await attendance.reviewRequest({ params: { id: String(requestId) }, tenantId, user, body: { decision: 'approve' } }, foreignRes);
  assert.equal(foreignRes.statusCode, 404);
});

test('attendance submissions and reviews notify the right person in app', async t => {
  const tenantId = id(), applicantId = id(), managerId = id(), gmId = id(), requestId = id();
  const tenant = { settings: { attendanceCalendarYears: [2026] } };
  noticeWrites.length = 0;

  // ① 提交请假 → 通知第一审批人（直属经理）
  const applicant = employee({ tenantId, userId: applicantId, managerId });
  t.mock.method(User, 'findOne', async () => ({ _id: managerId, employeeNo: 'M-1', name: '张经理', status: 'active' }));
  mockSubmissionLock(t);
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: requestId, ...document, toObject() { return { _id: this._id, ...document }; } }));
  const submitted = requestFor(applicant, tenantId, '2026-11-06T08:00:00+08:00', '2026-11-06T18:00:00+08:00');
  submitted.tenant = tenant;
  const submitRes = response();
  await attendance.createRequest(submitted, submitRes);
  assert.equal(submitRes.statusCode, 201);
  assert.equal(noticeWrites.length, 1);
  assert.equal(noticeWrites[0].kind, 'attendance_pending');
  assert.equal(String(noticeWrites[0].userId), String(managerId));
  assert.equal(noticeWrites[0].link, '/attendance/approvals?type=leave');
  assert.match(noticeWrites[0].title, /提交了请假申请/);
  assert.match(noticeWrites[0].body, /2026-11-06 08:00 ~ 2026-11-06 18:00/);
  assert.match(noticeWrites[0].body, /共 8 小时/);

  // ② 驳回（末级）→ 通知申请人
  const pending = {
    _id: requestId, tenantId, applicantId, type: 'leave', leaveType: 'personal',
    startAt: new Date('2026-11-06T01:00:00Z'), endAt: new Date('2026-11-06T10:00:00Z'),
    durationMinutes: 480, reason: '家中有事', applicant: { name: '员工甲' },
    approvals: [
      { approverId: managerId, role: 'manager', status: 'pending' },
      { approverId: gmId, role: 'general_manager', status: 'pending' }
    ],
    currentApproverId: managerId
  };
  t.mock.method(AttendanceRequest, 'findOne', async () => pending);
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async () => ({ ...pending, status: 'rejected', currentApproverId: null }));
  const rejectRes = response();
  await attendance.reviewRequest({
    params: { id: String(requestId) }, tenantId, tenant, user: employee({ tenantId, userId: managerId }),
    body: { decision: 'reject', comment: '材料不全' }
  }, rejectRes);
  assert.equal(rejectRes.statusCode, 200);
  assert.equal(noticeWrites.length, 2);
  assert.equal(noticeWrites[1].kind, 'attendance_rejected');
  assert.equal(String(noticeWrites[1].userId), String(applicantId));
  assert.equal(noticeWrites[1].link, '/attendance/requests?type=leave');
  assert.match(noticeWrites[1].body, /材料不全/);

  // ③ 通过但不是末级 → 顺延通知下一位审批人，而不是申请人
  const { _coordination: ledgerCoordination } = require('../controllers/api/attendance-ledger');
  t.mock.method(ledgerCoordination, 'acquireMonthMutationLock', async (id, month) => ({ month, token: `t-${month}` }));
  t.mock.method(ledgerCoordination, 'releaseMonthMutationLock', async () => {});
  t.mock.method(AttendanceMonthLedger, 'exists', async () => null);
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async () => ({ ...pending, currentApproverId: gmId }));
  const forwardRes = response();
  await attendance.reviewRequest({
    params: { id: String(requestId) }, tenantId, tenant, user: employee({ tenantId, userId: managerId }),
    body: { decision: 'approve' }
  }, forwardRes);
  assert.equal(forwardRes.statusCode, 200);
  assert.equal(noticeWrites.length, 3);
  assert.equal(noticeWrites[2].kind, 'attendance_pending');
  assert.equal(String(noticeWrites[2].userId), String(gmId));
  assert.equal(noticeWrites[2].link, '/attendance/approvals?type=leave');
  assert.match(noticeWrites[2].title, /待你审批/);

  // ④ 通知写失败不能把审批带崩
  noticeFailure = new Error('notice store down');
  t.mock.method(console, 'warn', () => {});
  t.mock.method(AttendanceRequest, 'findOneAndUpdate', async () => ({ ...pending, status: 'approved', currentApproverId: null }));
  const failingRes = response();
  await attendance.reviewRequest({
    params: { id: String(requestId) }, tenantId, tenant, user: employee({ tenantId, userId: gmId }),
    body: { decision: 'approve' }
  }, failingRes);
  assert.equal(failingRes.statusCode, 200);
  noticeFailure = null;
});

test('calendar stale document version is returned as a retryable conflict', async t => {
  silenceExpectedErrorLog(t);
  const error = new Error('version mismatch');
  error.name = 'VersionError';
  const tenant = { settings: {}, markModified() {}, async save() { throw error; } };
  const tenantId = id();
  const user = employee({ tenantId, roles: ['attendance_admin'] });
  const res = response();
  await attendance.updateCalendar({ user, tenantId, tenant, body: { year: 2026, confirmed: true, days: [] } }, res);
  assert.equal(res.statusCode, 409);
});

test('getCalendar returns the year official schedule and how it was obtained', async t => {
  // 2026 在内存内置表里，既不读库也不联网；未收录的年度才走「读库 → 抓线上」
  t.mock.method(HolidayCalendar, 'findOne', () => { throw new Error('内置年度不应读库'); });
  const tenantId = id();
  const user = employee({ tenantId, roles: ['attendance_admin'] });
  const tenant = { settings: { attendanceCalendarYears: [2026] } };
  const res = response();
  await attendance.getCalendar({ user, tenantId, tenant, query: { year: '2026' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.year, 2026);
  assert.equal(res.body.data.confirmed, true);
  assert.equal(res.body.data.defaultDays.length, 39);
  assert.equal(res.body.data.official.status, 'cached');
  assert.equal(res.body.data.official.from, 'builtin');
});

test('owner stale-lock recovery rejects a fresh lock even with confirmation', async t => {
  const tenantId = id(), applicantId = id();
  const lock = {
    tenantId, applicantId, token: 'lock-token', acquiredAt: new Date(Date.now() - 9 * 60 * 1000),
    ownerPid: process.pid, ownerHost: os.hostname()
  };
  t.mock.method(AttendanceSubmissionLock, 'findOne', () => ({ lean: async () => lock }));
  const res = response();
  await attendance.releaseStaleSubmissionLock({
    user: { role: 'owner' }, tenantId, params: { applicantId: String(applicantId) }, body: { confirmNoLiveSubmission: true }
  }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /至少保留 10 分钟/);
});

test('owner can release an old lock only after confirming and detecting its process is gone', async t => {
  const tenantId = id(), applicantId = id();
  const lock = {
    tenantId, applicantId, token: 'stale-token', acquiredAt: new Date(Date.now() - 11 * 60 * 1000),
    ownerPid: process.pid + 100000, ownerHost: os.hostname()
  };
  t.mock.method(process, 'kill', () => { const error = new Error('process is gone'); error.code = 'ESRCH'; throw error; });
  t.mock.method(AttendanceSubmissionLock, 'findOne', () => ({ lean: async () => lock }));
  let deleteFilter;
  t.mock.method(AttendanceSubmissionLock, 'deleteOne', async filter => { deleteFilter = filter; return { deletedCount: 1 }; });
  const res = response();
  await attendance.releaseStaleSubmissionLock({
    user: { role: 'owner' }, tenantId, params: { applicantId: String(applicantId) }, body: { confirmNoLiveSubmission: true }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.released, true);
  assert.equal(deleteFilter.token, lock.token);
  assert.equal(String(deleteFilter.tenantId), String(tenantId));
});

test('owner cannot recover an old lock while its owning process is still alive', async t => {
  const tenantId = id(), applicantId = id();
  const lock = {
    tenantId, applicantId, token: 'live-token', acquiredAt: new Date(Date.now() - 11 * 60 * 1000),
    ownerPid: process.pid + 100000, ownerHost: os.hostname()
  };
  t.mock.method(process, 'kill', () => true);
  t.mock.method(AttendanceSubmissionLock, 'findOne', () => ({ lean: async () => lock }));
  const res = response();
  await attendance.releaseStaleSubmissionLock({
    user: { role: 'owner' }, tenantId, params: { applicantId: String(applicantId) }, body: { confirmNoLiveSubmission: true }
  }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /原申请进程已停止/);
});

test('stale recovery cannot release a persisted lock while its acquisition response is still pending', async t => {
  const tenantId = id(), applicantId = id(), managerId = id();
  const user = employee({ tenantId, userId: applicantId, managerId });
  const manager = { _id: managerId, employeeNo: 'M-1', status: 'active' };
  const writtenAt = new Date();
  let persistedLock;
  let notifyPersisted;
  const lockPersisted = new Promise(resolve => { notifyPersisted = resolve; });
  let acknowledgeWrite;
  const delayedWriteResponse = new Promise(resolve => { acknowledgeWrite = resolve; });
  t.mock.method(AttendanceSubmissionLock, 'findOneAndUpdate', async (filter, update) => {
    persistedLock = {
      tenantId: filter.tenantId,
      applicantId: filter.applicantId,
      ...update.$set,
      acquiredAt: writtenAt
    };
    notifyPersisted(); // Mongo has committed the document; driver response remains delayed.
    await delayedWriteResponse;
    return persistedLock;
  });
  t.mock.method(AttendanceSubmissionLock, 'findOne', () => ({ lean: async () => persistedLock }));
  t.mock.method(AttendanceSubmissionLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'findOne', async () => manager);
  t.mock.method(AttendanceRequest, 'exists', async () => false);
  t.mock.method(AttendanceRequest, 'create', async document => ({ _id: id(), ...document, toObject() { return { _id: this._id, ...document }; } }));

  const req = requestFor(user, tenantId, '2026-09-21T09:00:00+08:00', '2026-09-21T10:00:00+08:00');
  const submitResponse = response();
  const submission = attendance.createRequest(req, submitResponse);
  await lockPersisted;
  t.mock.method(Date, 'now', () => writtenAt.getTime() + 11 * 60 * 1000);

  const recoveryResponse = response();
  await attendance.releaseStaleSubmissionLock({
    user: { role: 'owner' }, tenantId, params: { applicantId: String(applicantId) }, body: { confirmNoLiveSubmission: true }
  }, recoveryResponse);
  assert.equal(recoveryResponse.statusCode, 409);
  assert.match(recoveryResponse.body.error, /原申请进程已停止/);

  acknowledgeWrite();
  await submission;
  assert.equal(submitResponse.statusCode, 201);
});

test('approval counts group by type and only count steps waiting on me', async t => {
  const tenantId = id(), approverId = id();
  const user = employee({ tenantId, userId: approverId });
  const filters = [];
  t.mock.method(AttendanceRequest, 'countDocuments', async filter => {
    filters.push(filter);
    return { leave: 1, overtime: 2, fieldwork: 3, appeal: 4 }[filter.type] ?? 0;
  });

  const res = response();
  await attendance.getApprovalCounts({ tenantId, user }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { leave: 1, overtime: 2, fieldwork: 3, appeal: 4, total: 10 });
  assert.equal(filters.length, 4, '四种类型各查一次');
  assert.deepEqual(filters.map(filter => filter.type).sort(), ['appeal', 'fieldwork', 'leave', 'overtime']);
  // 口径必须与列表收件箱一致，否则角标数字会和点进去看到的条数对不上
  assert.ok(filters.every(filter => String(filter.currentApproverId) === String(user._id) && filter.status === 'pending' && String(filter.tenantId) === String(tenantId)));
});

