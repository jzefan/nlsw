const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const os = require('os');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const AttendanceRequest = require('../../models/AttendanceRequest');
const AttendanceMonthLedger = require('../../models/AttendanceMonthLedger');
const AttendanceLedgerAudit = require('../../models/AttendanceLedgerAudit');
const { hasAttendanceRole, calculateLeaveMinutes, getAttendancePolicy } = require('../../utils/attendance-permissions');
const { filterRealEmployees, isTestAccount } = require('../../utils/test-account');
const { readActualRule, validateActualRule, dailyWorkMinutes, isActualManual, computeSuggestedActualMinutes, ACTUAL_RULE_FIELDS, APPEAL_TYPES, APPEAL_TYPE_LABELS, APPEAL_OFFSET_FIELDS, DEFAULT_DAY_MINUTES } = require('../../utils/attendance-ledger-actual');

const OFFSET_MS = 8 * 60 * 60 * 1000;
const activeMutationTokens = new Set();
const LOCK_RECOVERY_MIN_AGE_MS = 10 * 60 * 1000;
const LEAVE_TYPES = ['personal', 'sick', 'annual', 'marriage', 'maternity', 'paternity', 'bereavement', 'parental', 'compensatory', 'other'];
const leaveField = type => LEAVE_TYPES.includes(type) ? type : 'other';
const err = (res, status, message, code) => res.status(status).json({ ok: false, error: message, ...(code ? { code } : {}) });

function parseMonth(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  const [year, month] = raw.split('-').map(Number);
  const start = Date.UTC(year, month - 1, 1) - OFFSET_MS;
  const end = Date.UTC(year, month, 1) - OFFSET_MS;
  return { year, month, start, end };
}

function isMonthAdmin(user) {
  return user?.role === 'owner' || hasAttendanceRole(user, 'attendance_admin');
}
function isCompanyViewer(user) {
  return isMonthAdmin(user) || hasAttendanceRole(user, 'general_manager');
}

function hasLedgerIdentity(req) {
  const userTenantId = req.user?.tenantId?._id || req.user?.tenantId;
  // 未设置 status 的历史账号视为在职，只有显式 disabled 才拦
  return req.user?.status !== 'disabled' &&
    req.tenantId && String(userTenantId) === String(req.tenantId);
}

function requireLedgerIdentity(req, res) {
  if (hasLedgerIdentity(req)) return true;
  err(res, 403, '账号需处于启用状态并匹配当前公司后才能访问月台账');
  return false;
}

function isMonthLockOwnerAlive(lock) {
  if (!lock.mutationOwnerHost || lock.mutationOwnerHost !== os.hostname()) return null;
  if (!Number.isInteger(lock.mutationOwnerPid) || lock.mutationOwnerPid <= 0) return null;
  if (lock.mutationOwnerPid === process.pid) return false;
  try {
    process.kill(lock.mutationOwnerPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'ESRCH' ? false : true;
  }
}

function monthLockRecoveryState(lock, now = Date.now()) {
  const acquired = lock.mutationAcquiredAt ? new Date(lock.mutationAcquiredAt).getTime() : NaN;
  const ageMs = Number.isFinite(acquired) ? Math.max(0, now - acquired) : null;
  const token = lock.mutationToken;
  const activeHere = Boolean(token && activeMutationTokens.has(token));
  const ownerAlive = isMonthLockOwnerAlive(lock);
  const oldEnough = ageMs !== null && ageMs >= LOCK_RECOVERY_MIN_AGE_MS;
  return { ageMs, activeHere, ownerAlive, oldEnough, recoverable: oldEnough && !activeHere && ownerAlive === false };
}

function requireOwner(req, res) {
  if (req.user?.role === 'owner' && req.tenantId && String(req.user.tenantId?._id || req.user.tenantId) === String(req.tenantId) && req.user.status !== 'disabled') return true;
  err(res, 403, '仅本公司主账号可恢复月台账锁');
  return false;
}

const USER_FIELDS = 'employeeNo phone profile.phone profile.name userid role department title status';

/**
 * 某个范围内「真正计入考勤」的人。
 * 三个条件层层收窄：不是平台账号 → 打开了纳入考勤开关 → 不是测试账号。
 * 测试账号（test / zefan 之类）不进应出勤与实到统计，用户 2026-10-06 明确要求。
 */
async function scopedUsers(req, query) {
  const users = await User.find(query).select(USER_FIELDS).lean();
  return filterRealEmployees(users);
}

async function getScopedUsers(req, scope) {
  // 平台账号不是公司员工，从不进入台账与统计；其余账号按各人的「纳入考勤统计」开关过滤（未设置视为纳入）。
  const base = { tenantId: req.tenantId, role: { $ne: 'platform' }, attendanceTracked: { $ne: false } };
  // mine 视角是「看自己」，即使自己是测试账号也不返回空 —— 否则本人连自己的台账都打不开。
  if (scope === 'mine') return scopedUsers(req, { ...base, _id: req.user._id });
  if (isCompanyViewer(req.user)) return scopedUsers(req, base);
  if (hasAttendanceRole(req.user, 'manager')) {
    if (scope !== 'team') throw Object.assign(new Error('经理仅可查看本人或直属团队'), { status: 403 });
    return scopedUsers(req, { ...base, managerId: req.user._id });
  }
  if (scope === 'team') throw Object.assign(new Error('无权查看团队台账'), { status: 403 });
  return scopedUsers(req, { ...base, _id: req.user._id });
}

/** 平台账号、关闭考勤统计的账号、测试账号都不允许写入台账。 */
function isAttendanceTracked(user) {
  return user?.role !== 'platform' && user?.attendanceTracked !== false && !isTestAccount(user);
}

function defaultLedgerRow(user, expectedMinutes) {
  return {
    employeeId: user._id,
    employeeNo: user.employeeNo || '',
    phone: user.phone || user.profile?.phone || '',
    userid: user.userid || '',
    name: user.profile?.name || user.userid || '',
    department: user.department || '',
    expectedMinutes,
    actualMinutes: null,
    confirmationState: 'pending',
    note: '',
    version: 0
  };
}

async function ensureLedger(tenantId, month) {
  try {
    return await AttendanceMonthLedger.findOneAndUpdate({ tenantId, month }, { $setOnInsert: { tenantId, month } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (e) {
    if (e?.code === 11000) return AttendanceMonthLedger.findOne({ tenantId, month });
    throw e;
  }
}

async function acquireMonthMutationLock(tenantId, month) {
  await ensureLedger(tenantId, month);
  const token = randomUUID();
  activeMutationTokens.add(token);
  try {
    const result = await AttendanceMonthLedger.updateOne({ tenantId, month, mutationToken: { $exists: false } }, {
      $set: { mutationToken: token, mutationAcquiredAt: new Date(), mutationOwnerPid: process.pid, mutationOwnerHost: os.hostname() }
    });
    if ((result.modifiedCount ?? result.nModified) !== 1) {
      const conflict = new Error('这个月的考勤正在更新，请稍后再试');
      conflict.status = 409;
      throw conflict;
    }
    return { month, token };
  } catch (error) {
    activeMutationTokens.delete(token);
    throw error;
  }
}

async function releaseMonthMutationLock(tenantId, lock) {
  if (!lock?.token) return;
  try {
    await AttendanceMonthLedger.updateOne({ tenantId, month: lock.month, mutationToken: lock.token }, {
      $unset: { mutationToken: 1, mutationAcquiredAt: 1, mutationOwnerPid: 1, mutationOwnerHost: 1 }
    });
  } finally {
    activeMutationTokens.delete(lock.token);
  }
}

/** 当月应出勤分钟数（与人员无关，只取决于工作日历与工作时段）。 */
async function expectedMinutesFor(monthStart, monthEnd, tenant) {
  const year = new Date(monthStart + OFFSET_MS).getUTCFullYear();
  if (!getAttendancePolicy(tenant).configuredYears.has(year)) {
    throw Object.assign(new Error(`请先由考勤管理员确认 ${year} 年工作日历`), {
      status: 409,
      code: 'ATTENDANCE_CALENDAR_UNCONFIRMED'
    });
  }
  let total = 0;
  for (let day = monthStart; day < monthEnd; day += 86400000) {
    const date = new Date(day + OFFSET_MS);
    const localDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    const start = new Date(`${localDate}T00:00:00.000+08:00`);
    const end = new Date(start.getTime() + 86400000);
    total += calculateLeaveMinutes(start, end, tenant).minutes;
  }
  return total;
}

function emptyAttendanceAggregate() {
  return {
    leaveMinutesByType: Object.fromEntries(LEAVE_TYPES.map(type => [type, 0])),
    overtimeApprovedMinutes: 0, overtimeCompTimeMinutes: 0, overtimePayMinutes: 0, overtimeUncompensatedMinutes: 0,
    fieldworkApprovedMinutes: 0, requiresLeaveReconciliation: false
  };
}

/** 'YYYY-MM'：parseMonth 的返回值本身没有 value（工资摘要那边是另外拼的），统一从这里取。 */
function monthKeyOf(month) {
  if (typeof month?.value === 'string') return month.value;
  return `${month.year}-${String(month.month).padStart(2, '0')}`;
}

/** 申述按「发生日期」归属月份：返回该月的字符串边界，用字符串比较即可（ISO 日期按字典序=按时间序）。 */
function appealMonthRange(month) {
  const value = monthKeyOf(month);
  const [year, index] = value.split('-').map(Number);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return { from: `${value}-01`, to: `${next}-01` };
}

function emptyAppealCounts() {
  return Object.fromEntries(APPEAL_TYPES.map(type => [type, 0]));
}

/**
 * 把申述折算成「员工 ID → { approved, pending } 各类型次数」。
 * 已批的用于核减台账违纪次数，待审批的只作提示（和加班/出差一样，没批完的数不进「已批」口径）。
 */
function collectAppealCounts(records) {
  const stats = new Map();
  for (const record of records) {
    if (record?.type !== 'appeal' || !APPEAL_TYPES.includes(record?.appealType)) continue;
    const id = String(record.applicantId);
    if (!stats.has(id)) stats.set(id, { approved: emptyAppealCounts(), pending: emptyAppealCounts() });
    stats.get(id)[record.status === 'approved' ? 'approved' : 'pending'][record.appealType] += 1;
  }
  return stats;
}

/** 已批申述核减后的违纪次数（旷工在台账里没有对应的计数列，不参与核减；下限 0）。 */
function withAppealOffset(row, approved) {
  const effective = { ...row };
  for (const field of APPEAL_OFFSET_FIELDS) {
    const raw = Number.isFinite(row?.[field]) ? row[field] : 0;
    effective[field] = Math.max(0, raw - (approved?.[field] || 0));
  }
  return effective;
}

/** 核减说明（台账备注与「系统建议」提示里展示，不进库）。 */
function appealOffsetLabel(approved) {
  const parts = [];
  for (const field of APPEAL_OFFSET_FIELDS) {
    const count = approved?.[field] || 0;
    if (count > 0) parts.push(`${APPEAL_TYPE_LABELS[field]} ×${count}`);
  }
  return parts.length ? `已批申述核减：${parts.join('、')}` : '';
}

function appealCountTotal(counts) {
  return Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/** 把已审批的申请单折算成「员工 ID → 当月时长」：请假按天分摊到月内，加班/出差按与月份的交集计。 */
function aggregateApprovedRequests(requests, month) {
  const stats = new Map();
  const forEmployee = id => {
    if (!stats.has(id)) stats.set(id, emptyAttendanceAggregate());
    return stats.get(id);
  };
  for (const request of requests) {
    // 申述没有时长，不进任何时长口径；它按发生日期核减违纪次数，另行统计（collectAppealCounts）
    if (request.type === 'appeal') continue;
    const aggregate = forEmployee(String(request.applicantId));
    if (request.type === 'leave') {
      const allocations = request.leaveAllocations;
      const validAllocation = Array.isArray(allocations) && allocations.length > 0 &&
        allocations.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && Number.isInteger(item.minutes) && item.minutes >= 0) &&
        allocations.reduce((total, item) => total + item.minutes, 0) === request.durationMinutes;
      if (!validAllocation) {
        aggregate.requiresLeaveReconciliation = true;
        continue;
      }
      for (const allocation of allocations) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(allocation.date || '')) continue;
        const at = new Date(`${allocation.date}T00:00:00.000+08:00`).getTime();
        if (at >= month.start && at < month.end) aggregate.leaveMinutesByType[leaveField(request.leaveType)] += Number(allocation.minutes) || 0;
      }
    } else {
      const minutes = Math.max(0, Math.round((Math.min(request.endAt.getTime(), month.end) - Math.max(request.startAt.getTime(), month.start)) / 60000));
      if (request.type === 'overtime') {
        aggregate.overtimeApprovedMinutes += minutes;
        if (request.compensation === 'comp_time') aggregate.overtimeCompTimeMinutes += minutes;
        if (request.compensation === 'overtime_pay') aggregate.overtimePayMinutes += minutes;
        if (request.compensation === 'none') aggregate.overtimeUncompensatedMinutes += minutes;
      } else if (request.type === 'fieldwork') aggregate.fieldworkApprovedMinutes += minutes;
    }
  }
  return stats;
}

/**
 * 工资条明细用：当月每名员工的考勤时长（请假按类型、加班含调休/加班费、出差）。
 * 只看已审批的申请单，不要求工作日历已确认，所以不会因为日历未确认而阻塞工资表；
 * 已结月使用冻结快照；开放月已确认的自动实到按当前规则计算。
 * 没登记或无法计算时为 null，不阻塞工资录入。
 */
async function getMonthlyAttendanceSummary(tenantId, month) {
  const requests = await AttendanceRequest.find({ tenantId, status: 'approved', startAt: { $lt: month.end }, endAt: { $gt: month.start } }).lean();
  const stats = aggregateApprovedRequests(requests, month);
  const ledger = await AttendanceMonthLedger.findOne({ tenantId, month: month.value }).select('rows status closedSnapshot').lean();
  const closedRows = ledger?.status === 'closed' ? ledger.closedSnapshot?.rows : null;
  const rows = (closedRows || ledger?.rows || []).map(row => ({ ...row }));
  if (!closedRows && rows.some(row => row.confirmationState === 'confirmed' && row.actualMinutesSource === 'auto')) {
    const tenant = await Tenant.findById(tenantId).select('settings').lean();
    const policy = getAttendancePolicy(tenant);
    const expected = policy.configuredYears.has(month.year)
      ? await expectedMinutesFor(month.start, month.end, tenant)
      : null;
    for (const row of rows) {
      row.expectedMinutes = expected;
      Object.assign(row, stats.get(String(row.employeeId)) || emptyAttendanceAggregate());
    }
    attachActualSuggestions(rows, tenant);
  }
  const stored = new Map(rows.map(row => [String(row.employeeId), row]));
  const summary = {};
  const actualFor = row => ['pending', 'no_basis'].includes(row?.confirmationState) ? null : row?.actualMinutes ?? null;
  const frozenAggregate = row => Object.fromEntries(Object.entries(emptyAttendanceAggregate()).map(([key, fallback]) => [key, row[key] ?? fallback]));
  for (const [employeeId, aggregate] of stats) {
    const row = stored.get(employeeId);
    summary[employeeId] = { ...(closedRows && row ? frozenAggregate(row) : aggregate), expectedMinutes: row?.expectedMinutes ?? null, actualMinutes: actualFor(row) };
  }
  for (const [employeeId, row] of stored) {
    if (summary[employeeId]) continue;
    summary[employeeId] = { ...(closedRows ? frozenAggregate(row) : emptyAttendanceAggregate()), expectedMinutes: row.expectedMinutes ?? null, actualMinutes: actualFor(row) };
  }
  return summary;
}

/** 自然日序号（按北京时间切天），用来数出差跨了几个自然日。 */
function dayIndex(timestamp) {
  return Math.floor((timestamp + OFFSET_MS) / 86400000);
}

/** 出差口径 = 日历天数（含首尾），只数落在当月内的自然日（与申请列表的展示口径一致）。 */
function fieldworkDaysInMonth(request, month) {
  const start = Math.max(request.startAt.getTime(), month.start);
  const end = Math.min(request.endAt.getTime(), month.end);
  if (!(end > start)) return 0;
  return dayIndex(end - 1) - dayIndex(start) + 1;
}

/** 台账里的次数：非法值与空值都按 0 计（0 是有效值）。 */
function violationCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function blankPayrollAttendance() {
  return {
    leaveMinutes: 0,
    overtimeMinutes: 0,
    fieldworkMinutes: 0,
    fieldworkDays: 0,
    absenceMinutes: 0,
    absenceSkippedCount: 0,
    leaveUnreconciled: false,
  };
}

/**
 * 薪资统计用：按月的考勤口径合计（请假 / 加班 / 出差 + 旷工）。
 *
 * 与「考勤统计」同源（已批申请单 + 月台账），时长走同一个 `aggregateApprovedRequests`，
 * 但**不因工作日历未确认而失败**：日历算不出来时只跳过「旷工」推导，其余时长照常统计。
 *
 * 旷工没有独立登记（台账只登记迟到/早退/无打卡的次数），只能按台账缺口推导：
 *   旷工 = 应出勤 − 实到 − 请假 − 迟到/早退/无打卡扣减（下限 0）
 * 只对**已确认实到**的行计算，其余（待确认 / 无依据 / 日历未确认）用 absenceSkippedCount
 * 回报跳过的人数——宁可不显示，也不能把「还没确认」当成旷工。
 *
 * @param {string} tenantId
 * @param {string[]} months 'YYYY-MM'
 * @param {string|null} employeeId 传值时只统计该员工（本人视角）
 */
/**
 * 某个租户下所有测试账号的 id 集合。
 *
 * 薪资统计的时长/缺勤是从**申请单与台账行**聚合来的，那些表里没有 userid、没法就地按前缀过滤，
 * 只能先问出「哪些 id 是测试账号」再排除。
 *
 * `candidateIds` 是这次统计实际会用到的申请人/台账行 id 集合：**只查这些人**，
 * 而不是全租户扫一遍 —— 顺带让那些不涉及真实账号的调用（测试夹具、只查本人的路径）完全不必碰数据库。
 */
async function testAccountIdsAmong(tenantId, candidateIds) {
  const ids = [...new Set((candidateIds || []).map(String).filter(id => mongoose.Types.ObjectId.isValid(id)))];
  if (!ids.length) return new Set();
  const users = await User.find({ tenantId, _id: { $in: ids } }).select('userid profile.name role').lean().catch(() => []);
  return new Set(users.filter(isTestAccount).map(user => String(user._id)));
}

async function getPayrollAttendanceSummary(tenantId, months, employeeId = null) {
  const tenant = await Tenant.findById(tenantId).select('settings').lean().catch(error => {
    console.warn('payroll attendance tenant read failed:', error.message);
    return null;
  });
  let dayMinutes = DEFAULT_DAY_MINUTES;
  try {
    dayMinutes = dailyWorkMinutes(getAttendancePolicy(tenant));
  } catch (error) {
    // 工作时段配置异常时退回默认日时长：宁可折算口径粗一点，也别让薪资统计整体失败
    console.warn('payroll attendance policy read failed:', error.message);
  }
  const rule = readActualRule(tenant);
  const byMonth = [];
  for (const value of months) {
    const month = parseMonth(value);
    const bucket = blankPayrollAttendance();
    try {
      const range = appealMonthRange(month);
      const requests = await AttendanceRequest.find({
        tenantId,
        status: 'approved',
        // 申述没有起止时段，按发生日期捞进来做违纪核减（它自己的时长口径为空，不会进上面几个数）
        $or: [
          { startAt: { $lt: month.end }, endAt: { $gt: month.start } },
          { type: 'appeal', occurredOn: { $gte: range.from, $lt: range.to } }
        ]
      }).lean();
      const scopedRequests = employeeId ? requests.filter(item => String(item.applicantId) === String(employeeId)) : requests;
      const ledger = await AttendanceMonthLedger.findOne({ tenantId, month: value }).select('rows status closedSnapshot').lean();
      const closedRows = ledger?.status === 'closed' ? ledger?.closedSnapshot?.rows : null;
      const savedRows = closedRows || ledger?.rows || [];
      const scopedRows = employeeId ? savedRows.filter(row => String(row.employeeId) === String(employeeId)) : savedRows;
      // 测试账号提过的申请单、台账行都不计入薪资统计（用户 2026-10-06 要求：不纳入考勤与工资）。
      // 只查这次实际用到的那些 id；「只看本人」时本来就在白名单内，不必多查。
      const excluded = employeeId ? new Set() : await testAccountIdsAmong(tenantId, [
        ...scopedRequests.map(item => item.applicantId),
        ...scopedRows.map(row => row.employeeId),
      ]);
      const relevant = scopedRequests.filter(item => !excluded.has(String(item.applicantId)));
      const stats = aggregateApprovedRequests(relevant, month);
      for (const aggregate of stats.values()) {
        bucket.leaveMinutes += Object.values(aggregate.leaveMinutesByType).reduce((sum, minutes) => sum + violationCount(minutes), 0);
        bucket.overtimeMinutes += aggregate.overtimeApprovedMinutes;
        bucket.fieldworkMinutes += aggregate.fieldworkApprovedMinutes;
        if (aggregate.requiresLeaveReconciliation) bucket.leaveUnreconciled = true;
      }
      // 出差天数按日历天数单独数：分钟口径是起止时刻之差，日历天数才是申请列表里展示的那个数
      for (const request of relevant) {
        if (request.type === 'fieldwork') bucket.fieldworkDays += fieldworkDaysInMonth(request, month);
      }

      const ledgerRows = scopedRows.filter(row => !excluded.has(String(row.employeeId)));
      // 已结账月份用快照里冻结的应出勤；未结账月份按当前日历重算（工作日历一改就能反映）
      let openExpected = null;
      if (!closedRows && ledgerRows.length) {
        try { openExpected = await expectedMinutesFor(month.start, month.end, tenant); }
        catch { openExpected = null; }
      }
      const appeals = collectAppealCounts(relevant);
      for (const row of ledgerRows) {
        const employeeStats = stats.get(String(row.employeeId));
        const expected = closedRows ? Number(row.expectedMinutes) : openExpected;
        // 请假没法按天分摊时，请假时长根本没进上面的口径，缺口会被虚算成旷工 —— 这种人不算
        if (employeeStats?.requiresLeaveReconciliation) {
          bucket.absenceSkippedCount++;
          continue;
        }
        if (!Number.isInteger(expected) || expected <= 0 || row.confirmationState !== 'confirmed' || !Number.isInteger(row.actualMinutes)) {
          bucket.absenceSkippedCount++;
          continue;
        }
        const effective = withAppealOffset(row, appeals.get(String(row.employeeId))?.approved);
        const leaveMinutes = Object.values(employeeStats?.leaveMinutesByType || {}).reduce((sum, minutes) => sum + violationCount(minutes), 0);
        const deducted = Math.round(
          violationCount(effective.lateWithin10) * rule.lateWithin10Hours * 60
          + violationCount(effective.lateOver10) * rule.lateOver10Hours * 60
          + violationCount(effective.earlyLeave) * rule.earlyLeaveHours * 60
          + violationCount(effective.noClockRecord) * rule.noClockFullDays * dayMinutes
        );
        bucket.absenceMinutes += Math.max(0, expected - row.actualMinutes - leaveMinutes - deducted);
      }
    } catch (error) {
      console.error(`payroll attendance summary failed for ${value}:`, error);
    }
    byMonth.push({ month: value, ...bucket });
  }
  return { dayMinutes, byMonth };
}

async function buildRows(req, month, scope, ledger) {
  const users = await getScopedUsers(req, scope);
  const storedById = new Map((ledger.rows || []).map(row => [String(row.employeeId), row.toObject ? row.toObject() : row]));
  // 一次取回已批与待审批：已批进「已批」口径，待审批只作提示（还没批完，这个月的数可能还会变）
  const appealRange = appealMonthRange(month);
  const requests = await AttendanceRequest.find({
    tenantId: req.tenantId,
    status: { $in: ['approved', 'pending'] },
    // 申述没有起止时间，按「发生日期」归属月份，单独列一条分支把它捞进来
    $or: [
      { startAt: { $lt: month.end }, endAt: { $gt: month.start } },
      { type: 'appeal', occurredOn: { $gte: appealRange.from, $lt: appealRange.to } }
    ]
  }).lean();
  // Include inactive accounts: current status does not erase historical month records.
  const allUsers = users;
  const userById = new Map(allUsers.map(user => [String(user._id), user]));
  const visibleIds = new Set(allUsers.map(user => String(user._id)));
  const relevant = requests.filter(item => visibleIds.has(String(item.applicantId)));
  const stats = aggregateApprovedRequests(relevant.filter(item => item.status === 'approved'), month);
  const pendingStats = aggregateApprovedRequests(relevant.filter(item => item.status === 'pending'), month);
  const appealStats = collectAppealCounts(relevant);
  for (const user of allUsers) if (!stats.has(String(user._id))) stats.set(String(user._id), emptyAttendanceAggregate());
  const rows = [];
  // 应出勤只取决于当月工作日历与工作时段、与人员无关：整月算一次。
  // 未结账月份一律按当前日历重算，不沿用库里可能过期的快照值——工作日历（含周六上午）一改就能立刻反映。
  const monthExpectedMinutes = await expectedMinutesFor(month.start, month.end, req.tenant);
  for (const user of allUsers) {
    const id = String(user._id);
    const saved = storedById.get(id);
    const expectedMinutes = monthExpectedMinutes;
    const row = saved ? {
      ...saved,
      phone: saved.phone || user.phone || user.profile?.phone || '',
      userid: saved.userid || user.userid || '',
      expectedMinutes
    } : defaultLedgerRow(user, expectedMinutes);
    const source = stats.get(id);
    const pending = pendingStats.get(id) ?? emptyAttendanceAggregate();
    const appeals = appealStats.get(id) ?? { approved: emptyAppealCounts(), pending: emptyAppealCounts() };
    const { _id, __v, ...safe } = row;
    rows.push({
      ...safe,
      employeeId: user._id,
      ...source,
      actualMinutes: row.actualMinutes ?? null,
      // 已批申述按类型核减违纪次数（旷工在台账里没有计数列，只留痕）；核减说明会出现在备注与「系统建议」提示里
      appealApprovedCounts: appeals.approved,
      appealOffsetLabel: appealOffsetLabel(appeals.approved),
      appealPendingCount: appealCountTotal(appeals.pending),
      // 待审批（未批完）的申请：只做提示，不并入上面任何「已批」口径，也不参与实到
      pendingOvertimeMinutes: pending.overtimeApprovedMinutes,
      pendingFieldworkMinutes: pending.fieldworkApprovedMinutes,
      pendingLeaveMinutes: Object.values(pending.leaveMinutesByType).reduce((sum, minutes) => sum + minutes, 0),
      pendingLeaveUnreconciled: pending.requiresLeaveReconciliation === true
    });
  }
  return attachActualSuggestions(rows, req.tenant);
}

/** 台账的姓名列不再拼接工号/手机号（下一行已经展示这些信息），同时清掉历史快照里存过的 displayName。 */
function stripPersonLabels(rows) {
  return rows.map(({ displayName: _displayName, ...row }) => row);
}

function sumRows(rows) {
  const totals = { expectedMinutes: 0, leaveMinutesByType: Object.fromEntries(LEAVE_TYPES.map(type => [type, 0])), overtimeApprovedMinutes: 0, overtimeCompTimeMinutes: 0, overtimePayMinutes: 0, overtimeUncompensatedMinutes: 0, fieldworkApprovedMinutes: 0, actualMinutes: null, confirmedCount: 0, pendingCount: 0, noBasisCount: 0, requiresLeaveReconciliationCount: 0 };
  let actualTotal = 0, actualCount = 0;
  for (const row of rows) {
    totals.expectedMinutes += row.expectedMinutes || 0;
    for (const type of LEAVE_TYPES) totals.leaveMinutesByType[type] += row.leaveMinutesByType?.[type] || 0;
    for (const key of ['overtimeApprovedMinutes', 'overtimeCompTimeMinutes', 'overtimePayMinutes', 'overtimeUncompensatedMinutes', 'fieldworkApprovedMinutes']) totals[key] += row[key] || 0;
    if (row.actualMinutes !== null && row.actualMinutes !== undefined) { actualTotal += row.actualMinutes; actualCount++; }
    if (row.confirmationState === 'confirmed') totals.confirmedCount++;
    else if (row.confirmationState === 'no_basis') totals.noBasisCount++;
    else totals.pendingCount++;
    if (row.requiresLeaveReconciliation) totals.requiresLeaveReconciliationCount++;
  }
  totals.actualMinutes = actualCount === rows.length && rows.length > 0 ? actualTotal : null;
  return totals;
}

/**
 * 给每一行附建议值，并解析已确认自动行的当前生效实到。
 * 只修改返回行，不写库；人工值与未知状态保持原有语义。
 */
function attachActualSuggestions(rows, tenant) {
  const rule = readActualRule(tenant);
  const dayMinutes = dailyWorkMinutes(getAttendancePolicy(tenant));
  for (const row of rows) {
    // 已批申述先按类型核减违纪次数，再走同一套规则算建议值；只影响建议值，不写库
    const offsetLabel = row.appealOffsetLabel || appealOffsetLabel(row.appealApprovedCounts);
    const suggestion = computeSuggestedActualMinutes(withAppealOffset(row, row.appealApprovedCounts), rule, dayMinutes);
    row.suggestedActualMinutes = suggestion.minutes;
    row.suggestedActualNote = offsetLabel ? `${suggestion.note}；${offsetLabel}` : suggestion.note;
    row.actualMinutesIsManual = isActualManual(row);
    // 建议只对已确认的自动行生效；待确认与无依据仍然表示未知。
    if (row.confirmationState === 'pending' || row.confirmationState === 'no_basis') row.actualMinutes = null;
    else if (row.confirmationState === 'confirmed' && row.actualMinutesSource === 'auto') row.actualMinutes = suggestion.minutes;
  }
  return rows;
}

exports.getLedger = async (req, res) => {
  try {
    if (!requireLedgerIdentity(req, res)) return;
    const month = parseMonth(req.query.month);
    if (!month) return err(res, 400, '月份格式应为 YYYY-MM');
    const scope = req.query.scope || 'mine';
    if (!['mine', 'team', 'company'].includes(scope)) return err(res, 400, 'scope 仅支持 mine、team 或 company');
    const ledger = await ensureLedger(req.tenantId, req.query.month);
    let rows;
    if (ledger.status === 'closed' && ledger.closedSnapshot?.rows) {
      // 已结账月份用快照，但仍要按当前范围过滤：平台账号与关闭考勤统计的账号不再显示
      const allowed = await getScopedUsers(req, scope);
      const allowedIds = new Set(allowed.map(user => String(user._id)));
      rows = ledger.closedSnapshot.rows.filter(row => allowedIds.has(String(row.employeeId)));
    } else rows = await buildRows(req, month, scope, ledger);
    // dayMinutes：1 个工作日 = 多少分钟。前端把实到拆成「天 + 小时」两个输入框要用它换算，
    // 读不到时前端回落 480。台账本身的存储与计算口径仍是分钟。
    const dayMinutes = (() => {
      try { return dailyWorkMinutes(getAttendancePolicy(req.tenant)); }
      catch { return DEFAULT_DAY_MINUTES; }
    })();
    return res.json({ ok: true, data: { month: req.query.month, status: ledger.status, version: ledger.version, dayMinutes, rows: stripPersonLabels(rows), totals: sumRows(rows) } });
  } catch (e) {
    if (e.status) return err(res, e.status, e.message, e.code);
    console.error('attendance ledger read failed:', e);
    return err(res, 500, '读取月度考勤台账失败');
  }
};

/**
 * 单独算某一行此刻的建议值：保存时用来核对「这个值确实等于规则输出」，对得上才记成 auto。
 * 只查这名员工当月的已批申请，避免把整月台账都重算一遍。
 */
async function actualSuggestionFor(row, month, tenantId, tenant) {
  const range = appealMonthRange(month);
  const [requests, appeals] = await Promise.all([
    AttendanceRequest.find({ tenantId, applicantId: row.employeeId, status: 'approved', startAt: { $lt: month.end }, endAt: { $gt: month.start } }).lean(),
    // 核减口径必须与台账读接口完全一致，否则「采用系统建议值」对不上、会被记成人工值
    AttendanceRequest.find({ tenantId, applicantId: row.employeeId, type: 'appeal', status: 'approved', occurredOn: { $gte: range.from, $lt: range.to } }).lean()
  ]);
  const stats = aggregateApprovedRequests(requests, month);
  const source = stats.get(String(row.employeeId)) ?? emptyAttendanceAggregate();
  const approved = collectAppealCounts(appeals).get(String(row.employeeId))?.approved;
  const merged = withAppealOffset({ ...(row.toObject ? row.toObject() : row), ...source }, approved);
  return computeSuggestedActualMinutes(merged, readActualRule(tenant), dailyWorkMinutes(getAttendancePolicy(tenant)));
}

exports.saveRow = async (req, res) => {
  let mutationLock;
  try {
    if (!requireLedgerIdentity(req, res)) return;
    if (!isMonthAdmin(req.user)) return err(res, 403, '仅公司主账号或考勤管理员可确认月度台账');
    const monthValue = req.body?.month, month = parseMonth(monthValue), employeeId = req.params.employeeId;
    if (!month || !mongoose.Types.ObjectId.isValid(employeeId)) return err(res, 400, '月份或员工编号无效');
    const { actualMinutes, confirmationState, note = '', version, actualMinutesSource } = req.body || {};
    if (!Number.isInteger(version) || !['confirmed', 'no_basis'].includes(confirmationState) || typeof note !== 'string' || note.length > 2000) return err(res, 400, '台账确认内容无效');
    if (actualMinutesSource !== undefined && !['auto', 'manual'].includes(actualMinutesSource)) return err(res, 400, '实到来源无效');
    if (confirmationState === 'confirmed' && (!Number.isInteger(actualMinutes) || actualMinutes < 0)) return err(res, 400, '确认实到时必须填写非负整数分钟数');
    if (confirmationState === 'no_basis' && actualMinutes !== null) return err(res, 400, '无实到依据时实际分钟数必须为空');
    if (confirmationState === 'no_basis' && !note.trim()) return err(res, 400, '无实到依据时必须填写原因');
    mutationLock = await acquireMonthMutationLock(req.tenantId, monthValue);
    const [ledger, user] = await Promise.all([
      AttendanceMonthLedger.findOne({ tenantId: req.tenantId, month: monthValue }),
      User.findOne({ _id: employeeId, tenantId: req.tenantId }).select('employeeNo phone profile.phone profile.name userid department status role attendanceTracked')
    ]);
    if (!ledger || !user) return err(res, 404, '月度台账或员工不存在');
    if (!isAttendanceTracked(user)) return err(res, 409, '该员工未纳入考勤统计，无法保存台账');
    if (ledger.status === 'closed') return err(res, 409, '已结账月份不可修改');
    if (ledger.version !== version) return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    let row = ledger.rows.find(item => String(item.employeeId) === String(user._id));
    if (!row) { ledger.rows.push(defaultLedgerRow(user, await expectedMinutesFor(month.start, month.end, req.tenant))); row = ledger.rows[ledger.rows.length - 1]; }
    if (confirmationState === 'confirmed' && actualMinutesSource === 'auto') {
      row.expectedMinutes = await expectedMinutesFor(month.start, month.end, req.tenant);
    }
    row.actualMinutes = actualMinutes;
    /**
     * 「采用系统建议值」必须与规则此刻的输出对得上，才记成 auto（以后跟着重算）。
     * 对不上就记人工——哪怕前端传了 auto，也不会把人工改过的值悄悄变成可覆盖。
     */
    const suggestion = confirmationState === 'confirmed' && actualMinutesSource === 'auto'
      ? await actualSuggestionFor(row, month, req.tenantId, req.tenant)
      : null;
    row.actualMinutesSource = suggestion && suggestion.minutes !== null && suggestion.minutes === actualMinutes ? 'auto' : 'manual';
    row.confirmationState = confirmationState;
    row.note = note.trim();
    row.version = (row.version || 0) + 1;
    ledger.version++;
    ledger.updatedAt = new Date();
    await ledger.save();
    return res.json({ ok: true, data: { month: monthValue, version: ledger.version, row } });
  } catch (e) {
    if (e.status === 409) return err(res, 409, e.message);
    if (e.name === 'VersionError') return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    return err(res, 500, '保存月度台账失败');
  } finally {
    if (mutationLock) await releaseMonthMutationLock(req.tenantId, mutationLock).catch(() => {});
  }
};

/** 导入的考勤记录字段：单位都是**次数**；未提供的字段不动，避免把已确认的内容清空。 */
const IMPORT_COUNT_FIELDS = ['lateWithin10', 'lateOver10', 'lateTotal', 'earlyLeave', 'noClockRecord'];
/** 报错会直接显示在导入预览里，所以要用中文列名，不要漏出字段 key。 */
const IMPORT_FIELD_LABELS = {
  lateWithin10: '迟到（10分钟以内）',
  lateOver10: '迟到（10分钟以上）',
  lateTotal: '迟到合计',
  earlyLeave: '早退',
  noClockRecord: '无打卡记录',
};
const IMPORT_MAX_COUNT = 9999;

/**
 * 把一行导入内容归一化成要写入的字段。
 * 返回 { ok: true, patch } 或 { ok: false, error } —— 单行出错只作废这一行，不影响其他行。
 */
function normalizeImportEntry(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: '导入行格式无效' };
  const patch = {};
  for (const key of IMPORT_COUNT_FIELDS) {
    const raw = input[key];
    // 空白单元格 = 不动（保持原值）；0 是有意义的值（确认没有这类违纪）
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > IMPORT_MAX_COUNT) {
      return { ok: false, error: `${IMPORT_FIELD_LABELS[key]} 必须是 0 至 ${IMPORT_MAX_COUNT} 之间的整数（次数）` };
    }
    patch[key] = value;
  }
  if (typeof input.importNote === 'string') {
    if (input.importNote.length > 2000) return { ok: false, error: '备注不能超过 2000 字' };
    // 备注留空同样不动，避免覆盖管理员已经写好的说明
    if (input.importNote.trim()) patch.importNote = input.importNote.trim();
  }
  if (!Object.keys(patch).length) return { ok: false, error: '这一行没有可导入的内容' };
  return { ok: true, patch };
}

/**
 * 批量导入考勤记录（迟到 / 早退 / 无打卡记录 / 备注）。
 * 只登记次数，不直接等于实到、也不参与金额计算——实到按规则算成建议值后由考勤管理员确认或修改。
 */
exports.importLedgerRecords = async (req, res) => {
  let mutationLock;
  try {
    if (!requireLedgerIdentity(req, res)) return;
    if (!isMonthAdmin(req.user)) return err(res, 403, '仅公司主账号或考勤管理员可导入考勤记录');
    const monthValue = req.body?.month;
    const month = parseMonth(monthValue);
    const list = req.body?.rows;
    if (!month || !Array.isArray(list) || !list.length) return err(res, 400, '请提供月份与要导入的行');
    if (list.length > 500) return err(res, 400, '一次最多导入 500 行');

    mutationLock = await acquireMonthMutationLock(req.tenantId, monthValue);
    const ledger = await ensureLedger(req.tenantId, monthValue);
    if (ledger.status === 'closed') return err(res, 409, '已结账月份不可导入考勤记录');

    const results = [];
    for (const item of list) {
      const employeeId = item?.employeeId;
      if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
        results.push({ employeeId: String(employeeId ?? ''), name: item?.name ?? '', status: 'failed', error: '员工编号无效' });
        continue;
      }
      const normalized = normalizeImportEntry(item);
      if (!normalized.ok) {
        results.push({ employeeId: String(employeeId), name: item?.name ?? '', status: 'failed', error: normalized.error });
        continue;
      }
      const user = await User.findOne({ _id: employeeId, tenantId: req.tenantId })
        .select('employeeNo phone profile.phone profile.name userid department status role attendanceTracked');
      if (!user) {
        results.push({ employeeId: String(employeeId), name: item?.name ?? '', status: 'failed', error: '员工不存在或不属于本公司' });
        continue;
      }
      if (!isAttendanceTracked(user)) {
        results.push({ employeeId: String(employeeId), name: user.profile?.name || user.userid || '', status: 'failed', error: '该员工未纳入考勤统计' });
        continue;
      }
      let row = ledger.rows.find(entry => String(entry.employeeId) === String(user._id));
      let status = 'updated';
      if (!row) {
        ledger.rows.push(defaultLedgerRow(user, await expectedMinutesFor(month.start, month.end, req.tenant)));
        row = ledger.rows[ledger.rows.length - 1];
        status = 'created';
      }
      for (const [key, value] of Object.entries(normalized.patch)) row[key] = value;
      row.importedAt = new Date();
      row.version = (row.version || 0) + 1;
      results.push({ employeeId: String(employeeId), name: user.profile?.name || user.userid || '', status, fields: Object.keys(normalized.patch) });
    }

    if (results.some(item => item.status !== 'failed')) {
      ledger.version++;
      ledger.updatedAt = new Date();
      await ledger.save();
    }
    return res.json({ ok: true, data: { month: monthValue, results } });
  } catch (e) {
    if (e.status === 409) return err(res, 409, e.message);
    if (e.name === 'VersionError') return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    console.error('attendance ledger import failed:', e);
    return err(res, 500, '导入考勤记录失败');
  } finally {
    if (mutationLock) await releaseMonthMutationLock(req.tenantId, mutationLock).catch(() => {});
  }
};

/**
 * 实到计算规则（实到 = 应出勤 − 请假 − 迟到/早退/无打卡扣减）。
 * 读：能看到台账的人；写：仅公司主账号或考勤管理员（与结账同口径）。
 * 规则只影响「建议值」，改完不用重算已结账月份：已结账读的是快照。
 */
exports.getActualRule = async (req, res) => {
  try {
    if (!requireLedgerIdentity(req, res)) return;
    return res.json({ ok: true, data: { rule: readActualRule(req.tenant), dayMinutes: dailyWorkMinutes(getAttendancePolicy(req.tenant)), fields: ACTUAL_RULE_FIELDS } });
  } catch (e) {
    console.error('attendance ledger getActualRule failed:', e);
    return err(res, 500, '读取实到计算规则失败');
  }
};

exports.saveActualRule = async (req, res) => {
  try {
    if (!requireLedgerIdentity(req, res)) return;
    if (!isMonthAdmin(req.user)) return err(res, 403, '仅公司主账号或考勤管理员可修改实到计算规则');
    const validated = validateActualRule(req.body?.rule);
    if (!validated.ok) return err(res, 400, validated.error);
    if (!req.tenant?.settings) return err(res, 403, '缺少租户配置');
    req.tenant.settings.attendanceLedgerActualRule = validated.rule;
    req.tenant.markModified('settings.attendanceLedgerActualRule');
    await req.tenant.save();
    return res.json({ ok: true, data: { rule: validated.rule, dayMinutes: dailyWorkMinutes(getAttendancePolicy(req.tenant)), fields: ACTUAL_RULE_FIELDS } });
  } catch (e) {
    if (e?.name === 'VersionError') return err(res, 409, '实到计算规则已被其他人更新，请刷新后重试');
    console.error('attendance ledger saveActualRule failed:', e);
    return err(res, 500, '保存实到计算规则失败');
  }
};

exports.closeMonth = async (req, res) => {
  let auditRecord;
  let mutationLock;
  try {
    if (!requireLedgerIdentity(req, res)) return;
    if (!isMonthAdmin(req.user)) return err(res, 403, '仅公司主账号或考勤管理员可月结');
    const month = req.body?.month;
    if (!parseMonth(month) || !Number.isInteger(req.body.version)) return err(res, 400, '月份或版本无效');
    mutationLock = await acquireMonthMutationLock(req.tenantId, month);
    const parsedMonth = parseMonth(month);
    const ledger = await AttendanceMonthLedger.findOne({ tenantId: req.tenantId, month });
    if (!ledger) return err(res, 404, '月度台账不存在');
    if (ledger.status === 'closed') return err(res, 409, '该月份已结账');
    if (ledger.version !== req.body.version) return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    const ledgerRows = await buildRows(req, parsedMonth, 'company', ledger);
    const incomplete = ledgerRows.filter(row => row.confirmationState === 'pending' ||
      (row.confirmationState === 'confirmed' && (!Number.isInteger(row.actualMinutes) || row.actualMinutes < 0)) ||
      (row.confirmationState === 'no_basis' && (!row.note.trim() || row.actualMinutes !== null)) ||
      row.requiresLeaveReconciliation);
    if (incomplete.length) return err(res, 409, `尚有 ${incomplete.length} 条台账待确认或请假需对账，不能结账`);
    const snapshot = { rows: ledgerRows, totals: sumRows(ledgerRows), version: ledger.version };
    ledger.closedSnapshot = snapshot;
    ledger.status = 'closed';
    ledger.closedAt = new Date(); ledger.closedBy = req.user._id; ledger.version++;
    auditRecord = await AttendanceLedgerAudit.create({ tenantId: req.tenantId, ledgerId: ledger._id, month, action: 'closed', actorId: req.user._id, snapshot, at: new Date() });
    ledger.closeAudit.push({ auditId: auditRecord._id, action: 'closed', actorId: req.user._id, reason: '', at: auditRecord.at });
    ledger.updatedAt = new Date();
    await ledger.save();
    return res.json({ ok: true, data: { month, status: ledger.status, version: ledger.version, closedAt: ledger.closedAt } });
  } catch (e) {
    if (auditRecord?._id) await AttendanceLedgerAudit.deleteOne({ _id: auditRecord._id, tenantId: req.tenantId }).catch(() => {});
    if (e.status === 409) return err(res, 409, e.message);
    if (e.name === 'VersionError') return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    return err(res, 500, '月结失败');
  } finally {
    if (mutationLock) await releaseMonthMutationLock(req.tenantId, mutationLock).catch(() => {});
  }
};

exports.reopenMonth = async (req, res) => {
  let auditRecord;
  let mutationLock;
  try {
    if (!requireLedgerIdentity(req, res)) return;
    if (!isMonthAdmin(req.user)) return err(res, 403, '仅公司主账号或考勤管理员可重新开启月结');
    const { month, version, reason } = req.body || {};
    if (!parseMonth(month) || !Number.isInteger(version) || typeof reason !== 'string' || !reason.trim() || reason.length > 2000) return err(res, 400, '重新开启必须填写月份、版本及原因');
    mutationLock = await acquireMonthMutationLock(req.tenantId, month);
    const ledger = await AttendanceMonthLedger.findOne({ tenantId: req.tenantId, month });
    if (!ledger) return err(res, 404, '月度台账不存在');
    if (ledger.status !== 'closed') return err(res, 409, '该月份尚未结账');
    if (ledger.version !== version) return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    const snapshot = ledger.closedSnapshot || { rows: ledger.rows.map(row => row.toObject()), version: ledger.version };
    ledger.status = 'open'; ledger.closedAt = undefined; ledger.closedBy = undefined; ledger.version++;
    auditRecord = await AttendanceLedgerAudit.create({ tenantId: req.tenantId, ledgerId: ledger._id, month, action: 'reopened', actorId: req.user._id, reason: reason.trim(), snapshot, at: new Date() });
    ledger.closeAudit.push({ auditId: auditRecord._id, action: 'reopened', actorId: req.user._id, reason: reason.trim(), at: auditRecord.at });
    ledger.updatedAt = new Date();
    await ledger.save();
    return res.json({ ok: true, data: { month, status: ledger.status, version: ledger.version } });
  } catch (e) {
    if (auditRecord?._id) await AttendanceLedgerAudit.deleteOne({ _id: auditRecord._id, tenantId: req.tenantId }).catch(() => {});
    if (e.status === 409) return err(res, 409, e.message);
    if (e.name === 'VersionError') return err(res, 409, '台账已被其他管理员修改，请刷新重试');
    return err(res, 500, '重新开启月结失败');
  } finally {
    if (mutationLock) await releaseMonthMutationLock(req.tenantId, mutationLock).catch(() => {});
  }
};

function sumMonthlyStatistics(byMonth) {
  const totals = {
    expectedMinutes: 0,
    leaveMinutesByType: Object.fromEntries(LEAVE_TYPES.map(type => [type, 0])),
    overtimeApprovedMinutes: 0,
    overtimeCompTimeMinutes: 0,
    overtimePayMinutes: 0,
    overtimeUncompensatedMinutes: 0,
    fieldworkApprovedMinutes: 0,
    actualMinutes: null,
    confirmedCount: 0,
    pendingCount: 0,
    noBasisCount: 0,
    requiresLeaveReconciliationCount: 0,
  };
  let actualMinutes = 0;
  let hasUnknownActual = false;
  for (const item of byMonth) {
    const monthly = item.totals;
    totals.expectedMinutes += monthly.expectedMinutes || 0;
    for (const type of LEAVE_TYPES) totals.leaveMinutesByType[type] += monthly.leaveMinutesByType?.[type] || 0;
    for (const key of ['overtimeApprovedMinutes', 'overtimeCompTimeMinutes', 'overtimePayMinutes', 'overtimeUncompensatedMinutes', 'fieldworkApprovedMinutes', 'confirmedCount', 'pendingCount', 'noBasisCount', 'requiresLeaveReconciliationCount']) totals[key] += monthly[key] || 0;
    if (monthly.actualMinutes === null || monthly.actualMinutes === undefined) hasUnknownActual = true;
    else actualMinutes += monthly.actualMinutes;
  }
  totals.actualMinutes = hasUnknownActual ? null : actualMinutes;
  return totals;
}

exports.getStatistics = async (req, res) => {
  try {
    if (!requireLedgerIdentity(req, res)) return;
    const period = req.query.period || 'month';
    const value = req.query.value;
    const scope = req.query.scope || 'mine';
    if (!['mine', 'team', 'company'].includes(scope)) return err(res, 400, 'scope 仅支持 mine、team 或 company');
    let months;
    if (period === 'month') {
      if (!parseMonth(value)) return err(res, 400, '月份格式应为 YYYY-MM');
      months = [value];
    } else if (period === 'year' && typeof value === 'string' && /^\d{4}$/.test(value) && Number(value) >= 2000 && Number(value) <= 2200) {
      months = Array.from({ length: 12 }, (_, index) => `${value}-${String(index + 1).padStart(2, '0')}`);
    } else return err(res, 400, '统计周期或值无效');

    const byMonth = [];
    const shiftedNow = new Date(Date.now() + OFFSET_MS);
    const currentMonth = `${shiftedNow.getUTCFullYear()}-${String(shiftedNow.getUTCMonth() + 1).padStart(2, '0')}`;
    // 一年要算 12 个月，纳入考勤统计的员工范围只查一次
    let allowedIdsPromise = null;
    const getAllowedIds = () => {
      if (!allowedIdsPromise) {
        allowedIdsPromise = getScopedUsers(req, scope).then(users => new Set(users.map(user => String(user._id))));
      }
      return allowedIdsPromise;
    };
    for (const monthValue of months) {
      const month = parseMonth(monthValue);
      const savedLedger = await AttendanceMonthLedger.findOne({ tenantId: req.tenantId, month: monthValue });
      if (!savedLedger && monthValue > currentMonth) {
        byMonth.push({ month: monthValue, status: 'not_started', totals: sumRows([]) });
        continue;
      }
      const ledger = savedLedger || { status: 'open', version: 0, rows: [], closedSnapshot: null };
      let rows;
      if (ledger.status === 'closed' && ledger.closedSnapshot?.rows) {
        // 与台账一致：已结账月份的快照也要按当前范围过滤
        const allowedIds = await getAllowedIds();
        rows = ledger.closedSnapshot.rows.filter(row => allowedIds.has(String(row.employeeId)));
      } else rows = await buildRows(req, month, scope, ledger);
      byMonth.push({ month: monthValue, status: ledger.status, totals: sumRows(rows) });
    }
    const totals = sumMonthlyStatistics(byMonth);
    return res.json({ ok: true, data: { period, value, scope, byMonth, totals } });
  } catch (error) {
    if (error.status) return err(res, error.status, error.message, error.code);
    console.error('attendance statistics read failed:', error);
    return err(res, 500, '读取考勤统计失败');
  }
};

exports.listMonthLocks = async (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const locks = await AttendanceMonthLedger.find({ tenantId: req.tenantId, mutationToken: { $exists: true } })
      .select('month mutationAcquiredAt mutationOwnerPid mutationOwnerHost +mutationToken').lean();
    const now = Date.now();
    return res.json({ ok: true, data: locks.map(lock => {
      const state = monthLockRecoveryState(lock, now);
      return { month: lock.month, acquiredAt: lock.mutationAcquiredAt, ageMinutes: state.ageMs === null ? null : Math.floor(state.ageMs / 60000), minimumRecoveryAgeMinutes: LOCK_RECOVERY_MIN_AGE_MS / 60000, mutationActive: state.activeHere || state.ownerAlive !== false, recoverable: state.recoverable };
    }) });
  } catch (error) {
    return err(res, 500, '读取月台账锁状态失败');
  }
};

exports.releaseStaleMonthLock = async (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const month = parseMonth(req.params.month);
    if (!month) return err(res, 400, '月份必须为 YYYY-MM');
    if (req.body?.confirmNoLiveMutation !== true) return err(res, 400, '请明确确认该月没有进行中的台账操作');
    const lock = await AttendanceMonthLedger.findOne({ tenantId: req.tenantId, month: req.params.month })
      .select('month mutationAcquiredAt mutationOwnerPid mutationOwnerHost +mutationToken').lean();
    if (!lock?.mutationToken) return err(res, 404, '月台账锁不存在');
    const state = monthLockRecoveryState(lock);
    if (!state.oldEnough) return err(res, 409, `月台账锁需至少保留 ${LOCK_RECOVERY_MIN_AGE_MS / 60000} 分钟后才能恢复`);
    if (state.activeHere || state.ownerAlive !== false) return err(res, 409, '无法确认原进程已停止，未解除月台账锁');
    const result = await AttendanceMonthLedger.updateOne({ tenantId: req.tenantId, month: req.params.month, mutationToken: lock.mutationToken, mutationAcquiredAt: lock.mutationAcquiredAt }, {
      $unset: { mutationToken: 1, mutationAcquiredAt: 1, mutationOwnerPid: 1, mutationOwnerHost: 1 }
    });
    if ((result.modifiedCount ?? result.nModified) !== 1) return err(res, 409, '月台账锁状态已变化，请刷新后重试');
    return res.json({ ok: true, data: { month: req.params.month, released: true } });
  } catch (error) {
    return err(res, 500, '恢复月台账锁失败');
  }
};

exports._test = { parseMonth, sumRows, sumMonthlyStatistics, getScopedUsers, expectedMinutesFor, buildRows, monthLockRecoveryState, aggregateApprovedRequests, attachActualSuggestions, normalizeImportEntry };
exports._coordination = { acquireMonthMutationLock, releaseMonthMutationLock, activeMutationTokens };
exports.getMonthlyAttendanceSummary = getMonthlyAttendanceSummary;
exports.getPayrollAttendanceSummary = getPayrollAttendanceSummary;
