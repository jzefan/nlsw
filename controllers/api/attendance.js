const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const User = require('../../models/User');
const AttendanceRequest = require('../../models/AttendanceRequest');
const AttendanceSubmissionLock = require('../../models/AttendanceSubmissionLock');
const AttendanceMonthLedger = require('../../models/AttendanceMonthLedger');
const Notice = require('../../models/Notice');
const { identityVersionFilter } = require('../../utils/user-security');
const { isAdmin } = require('../../utils/permissions');
const { migrateBinaryToArray } = require('../../utils/privilege-migration');
const { buildPersonLabels } = require('../../utils/person-label');
const { chinaAttendanceCalendarMeta, ensureChinaAttendanceCalendar, getChinaAttendanceCalendar, hasChinaAttendanceCalendar } = require('../../utils/china-attendance-calendar');
const { filterRealEmployees, isTestAccount } = require('../../utils/test-account');
const { APPEAL_TYPES, APPEAL_TYPE_LABELS } = require('../../utils/attendance-ledger-actual');
const { _coordination: ledgerCoordination } = require('./attendance-ledger');
const {
  hasAttendanceRole,
  hasLinkedEmployee,
  canViewTeam,
  getAttendancePolicy,
  validateWorkPeriods,
  DEFAULT_WORK_PERIODS,
  calculateLeaveMinutes,
  isWorkdayAt,
  sanitizeUser
} = require('../../utils/attendance-permissions');

const ALLOWED_TYPES = ['leave', 'overtime', 'fieldwork', 'appeal'];
const ALLOWED_LEAVE_TYPES = ['personal', 'sick', 'annual', 'marriage', 'maternity', 'paternity', 'bereavement', 'parental', 'compensatory', 'other'];
const ALLOWED_COMPENSATION = ['comp_time', 'overtime_pay', 'none'];
/** 申述类型（= 考勤异常类型）白名单与中文名：与台账违纪扣减口径同一份定义。 */
const ALLOWED_APPEAL_TYPES = APPEAL_TYPES;
const SUBMISSION_LOCK_RECOVERY_MIN_AGE_MS = 10 * 60 * 1000;
const ATTENDANCE_UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/attendance');
const ATTACHMENT_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const activeLeaveSubmissionTokens = new Set();

const ATTENDANCE_TYPE_LABELS = { leave: '请假', overtime: '加班', fieldwork: '出差', appeal: '考勤申述' };

/** 取租户配置的时区偏移，配置坏了也不能影响通知本身。 */
function tenantOffsetMinutes(tenant) {
  try {
    return getAttendancePolicy(tenant).offsetMinutes;
  } catch {
    return 480;
  }
}

/** 北京时间的「2026-09-30 09:00」。 */
function beijingTimestamp(value, offsetMinutes) {
  const date = new Date(new Date(value).getTime() + offsetMinutes * 60000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDurationText(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

/** 申请单的一句话摘要，站内通知正文用。 */
function requestSummary(record, offsetMinutes) {
  const reason = String(record.reason || '').trim();
  const reasonText = reason ? `｜${reason.slice(0, 60)}` : '';
  // 申述没有起止时段，摘要写「发生日期 + 申述类型」
  if (record.type === 'appeal') {
    return `${record.occurredOn || ''} ${APPEAL_TYPE_LABELS[record.appealType] || '考勤异常'}${reasonText}`;
  }
  const range = `${beijingTimestamp(record.startAt, offsetMinutes)} ~ ${beijingTimestamp(record.endAt, offsetMinutes)}`;
  const duration = record.durationMinutes ? `，共 ${formatDurationText(record.durationMinutes)}` : '';
  return `${range}${duration}${reasonText}`;
}

/** 写站内通知：通知是附属动作，失败只记日志，绝不把提交/审批主流程带崩。 */
async function notifyAttendance(tenantId, userId, kind, title, body, link) {
  if (!tenantId || !userId) return;
  try {
    await Notice.create({ tenantId, userId, kind, title, body, link });
  } catch (error) {
    console.warn('attendance notice failed:', error?.message || error);
  }
}

/** 审批后的通知：顺延就提醒下一位审批人，走到末级才把结果告诉申请人。 */
async function notifyReviewOutcome(record, { tenantId, tenant, decision, comment, nextApproverId }) {
  const typeLabel = ATTENDANCE_TYPE_LABELS[record.type] || '考勤';
  const summary = requestSummary(record, tenantOffsetMinutes(tenant));
  if (nextApproverId) {
    await notifyAttendance(tenantId, nextApproverId, 'attendance_pending',
      `${record.applicant?.name || '同事'}的${typeLabel}申请待你审批`, summary,
      `/attendance/approvals?type=${record.type}`);
    return;
  }
  if (decision === 'reject') {
    await notifyAttendance(tenantId, record.applicantId, 'attendance_rejected',
      `${typeLabel}申请被驳回`, `${summary}｜驳回意见：${comment || '未填写'}`,
      `/attendance/requests?type=${record.type}`);
    return;
  }
  await notifyAttendance(tenantId, record.applicantId, 'attendance_approved',
    `${typeLabel}申请已通过`, summary, `/attendance/requests?type=${record.type}`);
}

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parseDate(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function cleanText(value, max, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const text = value.trim();
  if ((required && !text) || text.length > max) return null;
  return text;
}

function cleanAttachments(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) return null;
  if (value.some(item => typeof item !== 'string' || item.length > 1000 || !/^(https?:\/\/|\/)[^\s]+$/i.test(item.trim()))) return null;
  return value.map(item => item.trim());
}

async function getEmployeeUser(id, tenantId) {
  if (!validObjectId(id)) return null;
  return User.findOne({ _id: id, tenantId, status: { $ne: 'disabled' } });
}

async function acquireLeaveSubmissionLock(tenantId, applicantId) {
  const token = randomUUID();
  // Mark the token active before yielding to MongoDB so stale-lock recovery cannot
  // release a lock whose acquisition response is still in flight.
  activeLeaveSubmissionTokens.add(token);
  try {
    await AttendanceSubmissionLock.findOneAndUpdate({
      tenantId,
      applicantId,
      token: { $exists: false }
    }, {
      $set: { token, acquiredAt: new Date(), ownerPid: process.pid, ownerHost: os.hostname() },
      $setOnInsert: { tenantId, applicantId }
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    return token;
  } catch (error) {
    activeLeaveSubmissionTokens.delete(token);
    if (error?.code === 11000) {
      const conflict = new Error('刚才的提交还在处理，请稍后再试');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function releaseLeaveSubmissionLock(tenantId, applicantId, token) {
  if (!token) return;
  activeLeaveSubmissionTokens.delete(token);
  await AttendanceSubmissionLock.deleteOne({ tenantId, applicantId, token });
}

function isLockOwnerProcessAlive(lock) {
  if (!lock.ownerHost || lock.ownerHost !== os.hostname()) return null;
  if (!Number.isInteger(lock.ownerPid) || lock.ownerPid <= 0) return null;
  if (lock.ownerPid === process.pid) return false;
  try {
    process.kill(lock.ownerPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'ESRCH' ? false : true;
  }
}

function getLockRecoveryState(lock, now = Date.now()) {
  const acquiredAt = lock.acquiredAt ? new Date(lock.acquiredAt).getTime() : NaN;
  const ageMs = Number.isFinite(acquiredAt) ? Math.max(0, now - acquiredAt) : null;
  const ownerProcessAlive = isLockOwnerProcessAlive(lock);
  const liveInThisProcess = activeLeaveSubmissionTokens.has(lock.token);
  const oldEnough = ageMs !== null && ageMs >= SUBMISSION_LOCK_RECOVERY_MIN_AGE_MS;
  const recoverable = oldEnough && !liveInThisProcess && ownerProcessAlive === false;
  return { ageMs, oldEnough, ownerProcessAlive, liveInThisProcess, recoverable };
}

/**
 * @param request 申请单
 * @param approverNames 审批人 id → 姓名；审批链只存 approverId，姓名在序列化时注入
 *   （approvals 是 mongoose 子文档，schema 里没有 name 字段，直接赋值会被 strict 模式静默丢掉）
 */
function serializeRequest(request, approverNames) {
  const data = request.toObject ? request.toObject() : request;
  return {
    id: data._id,
    type: data.type,
    leaveType: data.leaveType,
    compensation: data.compensation,
    occurredOn: data.occurredOn,
    appealType: data.appealType,
    applicant: data.applicant,
    startAt: data.startAt,
    endAt: data.endAt,
    durationMinutes: data.durationMinutes,
    // 申述没有时长，这里给 null 而不是 NaN
    durationHours: Number.isFinite(data.durationMinutes) ? Math.round((data.durationMinutes / 60) * 100) / 100 : null,
    reason: data.reason,
    location: data.location,
    contact: data.contact,
    workContent: data.workContent,
    attachments: data.attachments || [],
    attachmentUrls: data.attachmentUrls,
    status: data.status,
    withdrawnAt: data.withdrawnAt,
    approvals: (data.approvals || []).map(approval => ({
      ...approval,
      approverName: approverNames?.get(String(approval.approverId)) || ''
    })),
    currentApproverId: data.currentApproverId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function requireExactOwner(req, res) {
  if (req.user?.role !== 'owner') {
    fail(res, 403, '仅公司主账号可操作此项');
    return false;
  }
  return true;
}

function requirePeopleManager(req, res) {
  const privilege = req.user?.privilege;
  const admin = isAdmin(Array.isArray(privilege) ? privilege : migrateBinaryToArray(privilege));
  if (req.user?.role !== 'owner' && (req.user?.role === 'platform' || !admin)) {
    fail(res, 403, '仅公司主账号或管理员可维护员工资料');
    return false;
  }
  return true;
}

function calendarSettings(tenant) {
  return tenant?.settings || {};
}

function hasEmployeeTenantContext(req) {
  const userTenantId = req.user?.tenantId?._id || req.user?.tenantId;
  return hasLinkedEmployee(req.user) && String(userTenantId) === String(req.tenantId);
}

/** 把用户文档投影成前端消费的人员行（手机号优先取登录手机号，回退 profile 里的历史字段）。 */
function toPersonRow(user) {
  return {
    userId: user._id,
    userid: user.userid || '',
    name: user.profile?.name || user.userid || '',
    employeeNo: user.employeeNo || '',
    phone: user.phone || user.profile?.phone || '',
    department: user.department || '',
    title: user.title || '',
    // 未设置 status 的历史账号视为在职，只有显式 disabled 才算停用
    status: user.status === 'disabled' ? 'disabled' : 'active',
    managerId: user.managerId || null,
    attendanceRoles: user.attendanceRoles || [],
    attendanceTracked: user.attendanceTracked !== false,
    payrollRoles: user.payrollRoles || [],
    mustChangePassword: user.mustChangePassword === true
  };
}

exports.listPeople = async (req, res) => {
  try {
    if (!requirePeopleManager(req, res)) return;
    // 平台账号不是公司员工，不出现在考勤员工资料里
    const found = await User.find({ tenantId: req.tenantId, role: { $ne: 'platform' } })
      .select('employeeNo phone profile.name profile.phone userid role department title managerId attendanceRoles attendanceTracked payrollRoles mustChangePassword status')
      .sort({ department: 1, employeeNo: 1, userid: 1 }).lean();
    // 测试账号同样不出现在员工资料里
    const people = filterRealEmployees(found);
    const rows = people.map(toPersonRow);
    const labels = buildPersonLabels(rows);
    // 直属经理必须是本租户在职员工，正常情况下已在 rows 内；若该经理账号已不存在则单独回查兜底。
    const managerIds = [...new Set(people.map(user => String(user.managerId || '')).filter(Boolean))];
    const missingManagerIds = managerIds.filter(id => !labels.has(id));
    if (missingManagerIds.length) {
      const fallbackManagers = await User.find({ _id: { $in: missingManagerIds }, tenantId: req.tenantId })
        .select('employeeNo phone profile.name profile.phone userid department').lean();
      for (const [id, label] of buildPersonLabels(fallbackManagers.map(toPersonRow))) labels.set(id, label);
    }
    return res.json({
      ok: true,
      data: rows.map(row => ({
        ...row,
        displayName: labels.get(String(row.userId)) || row.name,
        managerName: row.managerId ? (labels.get(String(row.managerId)) || '') : ''
      }))
    });
  } catch (error) {
    console.error('attendance listPeople failed:', error);
    return fail(res, 500, '读取员工考勤资料失败');
  }
};

exports.updateEmployeeProfile = async (req, res) => {
  try {
    if (!requirePeopleManager(req, res)) return;
    const { userId } = req.body || {};
    if (!validObjectId(userId)) return fail(res, 400, '员工编号无效');
    const userQuery = User.findOne({ _id: userId, tenantId: req.tenantId });
    if (typeof userQuery?.select === 'function') userQuery.select('+attendanceGeneralManagerTenantId');
    const user = await userQuery;
    if (!user) return fail(res, 404, '找不到本租户员工');
    // 平台账号不是公司员工，不在考勤员工资料里维护
    if (user.role === 'platform') return fail(res, 400, '平台账号不是公司员工，无需维护考勤资料');
    const isActive = user.status !== 'disabled';

    if (req.body.employeeNo !== undefined && typeof req.body.employeeNo !== 'string') return fail(res, 400, '工号格式无效');
    if (req.body.department !== undefined && typeof req.body.department !== 'string') return fail(res, 400, '部门格式无效');
    const employeeNo = cleanText(req.body.employeeNo || '', 50, false);
    const department = cleanText(req.body.department || '', 120, false);
    if (employeeNo === null || department === null) return fail(res, 400, '工号最多50字，部门最多120字');
    const duplicate = employeeNo && await User.exists({ tenantId: req.tenantId, employeeNo, _id: { $ne: user._id } });
    if (duplicate) return fail(res, 409, '工号已被本租户其他员工使用');

    // 手机号：可留空（清空），非空时必须是 11 位中国大陆号码。
    // 顶层 phone 是登录标识，索引为跨租户唯一，所以查重不能限定租户。
    const phoneProvided = Object.prototype.hasOwnProperty.call(req.body, 'phone');
    let phone = '';
    if (phoneProvided) {
      if (typeof req.body.phone !== 'string') return fail(res, 400, '手机号格式无效');
      phone = cleanText(req.body.phone, 20, false);
      if (phone === null) return fail(res, 400, '手机号格式无效');
      if (phone && !/^1[3-9]\d{9}$/.test(phone)) return fail(res, 400, '手机号应为 11 位中国大陆号码');
      if (phone && await User.exists({ phone, _id: { $ne: user._id } })) return fail(res, 409, '该手机号已被其他账号使用');
    }

    let managerId = isActive ? (user.managerId || null) : null;
    if (isActive && Object.prototype.hasOwnProperty.call(req.body, 'managerId')) {
      if (req.body.managerId === null || req.body.managerId === '') managerId = null;
      else {
        const manager = await getEmployeeUser(req.body.managerId, req.tenantId);
        if (!manager || String(manager._id) === String(user._id)) return fail(res, 400, '直属经理必须是本租户其他在职员工');
        managerId = manager._id;
      }
    }

    let attendanceRoles = user.attendanceRoles || [];
    // 「总经理」由用户管理的职位决定，这里不允许增删，只能原样保留。
    const storedGeneralManager = attendanceRoles.includes('general_manager');
    if (Object.prototype.hasOwnProperty.call(req.body, 'attendanceRoles')) {
      // 「经理」已停止开放（2026-10-07 用户决定）：它的唯一作用是防自审，而那用「直属经理」指向总经理就能达成。
      // **存量勾选允许原样保留**（编辑其他字段时前端会把它带回来，不能报 400 打断保存），只是不接受**新增**。
      const requested = Array.isArray(req.body.attendanceRoles) ? req.body.attendanceRoles : [];
      // 新增 manager 一律拒（存量勾选可原样带回，见 keptManager）
      if (requested.includes('manager') && !(user.attendanceRoles || []).includes('manager')) {
        return fail(res, 400, '「经理」角色已停用，请把该员工的「直属经理」设为总经理，即可让本人的申请由总经理审批');
      }
      const allowed = ['attendance_admin', 'general_manager'];
      const keptManager = requested.includes('manager');
      const effective = allowed.concat(keptManager ? ['manager'] : []);
      if (requested.length > effective.length || requested.some(role => !effective.includes(role)) || new Set(requested).size !== requested.length) {
        return fail(res, 400, '考勤角色无效');
      }
      attendanceRoles = requested.filter(role => role !== 'general_manager');
      if (storedGeneralManager) attendanceRoles = [...attendanceRoles, 'general_manager'];
      if (!isActive && attendanceRoles.length > 0) return fail(res, 400, '停用员工不能分配考勤角色');
    }
    if (!isActive) attendanceRoles = [];

    let attendanceTracked = user.attendanceTracked !== false;
    if (Object.prototype.hasOwnProperty.call(req.body, 'attendanceTracked')) {
      if (typeof req.body.attendanceTracked !== 'boolean') return fail(res, 400, '是否纳入考勤统计取值无效');
      attendanceTracked = req.body.attendanceTracked;
    }

    const update = {
      $set: { employeeNo, department, managerId, attendanceRoles, attendanceTracked },
      $unset: { attendanceGeneralManagerTenantId: 1 },
      $inc: { securityIdentityVersion: 1 }
    };
    if (phoneProvided) {
      if (phone) {
        update.$set.phone = phone;
        update.$set['profile.phone'] = phone;
      }
      else {
        // phone 上是 unique sparse 索引：写成空串会让多个空串互相冲突，清空必须把字段整个移除。
        update.$unset.phone = 1;
        update.$set['profile.phone'] = '';
      }
    }
    // 是否改过本人密码与考勤资料维护无关，这里不再联动 mustChangePassword/sessionVersion。
    if (attendanceRoles.includes('general_manager')) {
      update.$set.attendanceGeneralManagerTenantId = req.tenantId;
      delete update.$unset.attendanceGeneralManagerTenantId;
    }
    const write = await User.updateOne(identityVersionFilter(user, { tenantId: req.tenantId }), update, { runValidators: true });
    if ((write.modifiedCount ?? write.nModified) !== 1) return fail(res, 409, '员工身份已被并发修改，请刷新后重试');
    return res.json({ ok: true, data: { userId: user._id, employeeNo, name: user.profile?.name || user.userid, phone: phoneProvided ? phone : (user.phone || user.profile?.phone || ''), department, managerId, attendanceRoles, status: user.status || 'active' } });
  } catch (error) {
    console.error('attendance updateEmployeeProfile failed:', error);
    if (error?.code === 11000) return fail(res, 409, '工号已被本租户其他员工使用');
    return fail(res, 500, '更新员工考勤资料失败');
  }
};

exports.getCalendar = async (req, res) => {
  try {
    if (req.user?.role !== 'owner' && !hasEmployeeTenantContext(req)) return fail(res, 403, '仅本租户员工可读取工作日历');
    const settings = calendarSettings(req.tenant);
    const attendancePolicy = getAttendancePolicy(req.tenant);
    const overrides = settings.attendanceCalendarOverrides || {};
    const selectedYear = Number.parseInt(req.query.year, 10);
    const year = Number.isInteger(selectedYear) && selectedYear >= 2000 && selectedYear <= 2100 ? selectedYear : new Date().getFullYear();
    const entries = Array.isArray(overrides)
      ? overrides.filter(item => item.date?.startsWith(`${year}-`))
      : Object.entries(overrides).filter(([date]) => date.startsWith(`${year}-`)).map(([date, type]) => ({ date, type }));
    const configuredYears = new Set(Array.isArray(settings.attendanceCalendarYears) ? settings.attendanceCalendarYears : []);
    // 该年度的国务院安排：内存或库里已有就直接用，第一次需要时从线上抓一次并落库。
    // 抓取失败不影响其余日历数据，只用 official.status 如实告诉界面是「尚未公布」还是「没连上」。
    let official = { status: 'unavailable' };
    try {
      const ensured = await ensureChinaAttendanceCalendar(year);
      official = { status: ensured.status, ...(chinaAttendanceCalendarMeta(year) || {}) };
    } catch (error) {
      console.error('attendance getCalendar official calendar failed:', error);
    }
    if (hasChinaAttendanceCalendar(year)) configuredYears.add(year);
    return res.json({
      ok: true,
      data: {
        year,
        confirmed: configuredYears.has(year),
        configuredYears: [...configuredYears].sort((a, b) => a - b),
        defaultWorkPeriods: DEFAULT_WORK_PERIODS,
        workPeriods: attendancePolicy.intervals,
        defaultDays: getChinaAttendanceCalendar(year),
        days: entries,
        // 周六上午上班：enabled 关着时 periods 为空数组，界面据此决定要不要标「上午」
        saturdayMorning: { enabled: attendancePolicy.saturdayMorning, periods: attendancePolicy.morningIntervals },
        official
      }
    });
  } catch (error) {
    console.error('attendance getCalendar failed:', error);
    return fail(res, 500, '读取工作日历失败');
  }
};

exports.updateCalendar = async (req, res) => {
  try {
    const isOwner = req.user?.role === 'owner';
    if (!isOwner && (!hasAttendanceRole(req.user, 'attendance_admin') || !hasEmployeeTenantContext(req))) return fail(res, 403, '仅公司主账号或考勤管理员可维护工作日历');
    const year = req.body?.year;
    const days = req.body?.days;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Array.isArray(days) || days.length > 400) {
      return fail(res, 400, '年份或假期列表无效');
    }
    if (req.body.confirmed !== true) return fail(res, 400, '确认年度日历前不能提交该年度请假');
    const byDate = new Map();
    for (const item of days) {
      if (!item || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number(item.date.slice(0, 4)) !== year || !['holiday', 'workday'].includes(item.type)) {
        return fail(res, 400, '节假日列表仅允许本年度的 holiday 或 workday 日期');
      }
      const check = new Date(`${item.date}T00:00:00.000Z`);
      if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== item.date || byDate.has(item.date)) return fail(res, 400, '日期无效或重复');
      byDate.set(item.date, item.type);
    }

    const tenant = req.tenant;
    if (!tenant) return fail(res, 403, '缺少租户配置');
    const existing = tenant.settings?.attendanceCalendarOverrides || {};
    const merged = Array.isArray(existing) ? Object.fromEntries(existing.map(item => [item.date, item.type])) : { ...existing };
    for (const date of Object.keys(merged)) if (date.startsWith(`${year}-`)) delete merged[date];
    for (const [date, type] of byDate) merged[date] = type;
    tenant.settings.attendanceCalendarOverrides = merged;
    const years = new Set(Array.isArray(tenant.settings.attendanceCalendarYears) ? tenant.settings.attendanceCalendarYears : []);
    years.add(year);
    tenant.settings.attendanceCalendarYears = [...years].sort((a, b) => a - b);
    tenant.markModified('settings.attendanceCalendarOverrides');
    await tenant.save();
    return res.json({ ok: true, data: { year, confirmed: true, days: [...byDate].map(([date, type]) => ({ date, type })) } });
  } catch (error) {
    console.error('attendance updateCalendar failed:', error);
    if (error?.name === 'VersionError') return fail(res, 409, '工作日历已被其他管理员更新，请刷新后重试');
    return fail(res, 500, '更新工作日历失败');
  }
};

exports.updateCalendarDay = async (req, res) => {
  try {
    const isOwner = req.user?.role === 'owner';
    if (!isOwner && (!hasAttendanceRole(req.user, 'attendance_admin') || !hasEmployeeTenantContext(req))) return fail(res, 403, '仅公司主账号或考勤管理员可维护工作日历');
    const { year, date, type } = req.body || {};
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year || !['holiday', 'workday'].includes(type)) {
      return fail(res, 400, '日期或工作日类型无效');
    }
    const check = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== date) return fail(res, 400, '日期无效');
    const tenant = req.tenant;
    if (!tenant) return fail(res, 403, '缺少租户配置');

    const existing = tenant.settings?.attendanceCalendarOverrides || {};
    const merged = Array.isArray(existing) ? Object.fromEntries(existing.map(item => [item.date, item.type])) : { ...existing };
    merged[date] = type;
    tenant.settings.attendanceCalendarOverrides = merged;
    const years = new Set(Array.isArray(tenant.settings.attendanceCalendarYears) ? tenant.settings.attendanceCalendarYears : []);
    years.add(year);
    tenant.settings.attendanceCalendarYears = [...years].sort((a, b) => a - b);
    tenant.markModified('settings.attendanceCalendarOverrides');
    await tenant.save();
    return res.json({ ok: true, data: { year, date, type, confirmed: true } });
  } catch (error) {
    console.error('attendance updateCalendarDay failed:', error);
    if (error?.name === 'VersionError') return fail(res, 409, '工作日历已被其他管理员更新，请刷新后重试');
    return fail(res, 500, '更新工作日失败');
  }
};

/** 特殊情况：每周六上午算工作日（法定节假日与调休上班日除外），是租户级开关、不按年度区分。 */
exports.updateCalendarSaturdayMorning = async (req, res) => {
  try {
    const isOwner = req.user?.role === 'owner';
    if (!isOwner && (!hasAttendanceRole(req.user, 'attendance_admin') || !hasEmployeeTenantContext(req))) return fail(res, 403, '仅公司主账号或考勤管理员可维护工作日历');
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') return fail(res, 400, '周六上午上班取值无效');
    const tenant = req.tenant;
    if (!tenant) return fail(res, 403, '缺少租户配置');
    tenant.settings.attendanceSaturdayMorningWorkday = enabled;
    tenant.markModified('settings.attendanceSaturdayMorningWorkday');
    await tenant.save();
    const policy = getAttendancePolicy(tenant);
    return res.json({ ok: true, data: { enabled: policy.saturdayMorning, periods: policy.morningIntervals } });
  } catch (error) {
    console.error('attendance updateCalendarSaturdayMorning failed:', error);
    if (error?.name === 'VersionError') return fail(res, 409, '工作日历已被其他管理员更新，请刷新后重试');
    return fail(res, 500, '更新周六上午上班设置失败');
  }
};

/**
 * 每天的工作时段（上午 + 下午的起止时间），租户级设置，影响所有年度与所有考勤口径：
 * 请假折算、应出勤计算、实到扣减都读这一份。
 *
 * 改它**不改已结账月份**：台账一旦结账就冻结了 `expectedMinutes` 快照，
 * 历史月份仍按当时的配置算，重开那个月才会用新配置。
 */
exports.updateWorkPeriods = async (req, res) => {
  try {
    const isOwner = req.user?.role === 'owner';
    if (!isOwner && (!hasAttendanceRole(req.user, 'attendance_admin') || !hasEmployeeTenantContext(req))) return fail(res, 403, '仅公司主账号或考勤管理员可维护工作日历');
    const validated = validateWorkPeriods(req.body?.periods);
    if (!validated.ok) return fail(res, 400, validated.error);
    const tenant = req.tenant;
    if (!tenant) return fail(res, 403, '缺少租户配置');
    tenant.settings.attendanceWorkPeriods = validated.periods;
    tenant.markModified('settings.attendanceWorkPeriods');
    await tenant.save();
    const policy = getAttendancePolicy(tenant);
    return res.json({ ok: true, data: {
      periods: policy.intervals,
      // 每天总时长跟着变：台账「实到自动计算」按小时口径扣减，口径必须同步。
      hoursPerDay: policy.hoursPerDay,
      saturdayMorning: { enabled: policy.saturdayMorning, periods: policy.morningIntervals },
    } });
  } catch (error) {
    console.error('attendance updateWorkPeriods failed:', error);
    if (error?.name === 'VersionError') return fail(res, 409, '工作日历已被其他管理员更新，请刷新后重试');
    return fail(res, 500, '更新工作时段失败');
  }
};

exports.getGeneralManagerDelegate = async (req, res) => {
  try {
    if (!requireExactOwner(req, res)) return;
    const delegateId = req.tenant?.settings?.attendanceGeneralManagerDelegateId;
    if (!delegateId) return res.json({ ok: true, data: { generalManagerDelegateId: null, generalManagerDelegateName: '' } });
    const delegate = await User.findOne({ _id: delegateId, tenantId: req.tenantId, status: { $ne: 'disabled' } })
      .select('profile.name userid');
    return res.json({ ok: true, data: {
      generalManagerDelegateId: delegate?._id || null,
      generalManagerDelegateName: delegate?.profile?.name || delegate?.userid || ''
    } });
  } catch (error) {
    console.error('attendance getGeneralManagerDelegate failed:', error);
    return fail(res, 500, '读取总经理代理审批人失败');
  }
};

exports.setGeneralManagerDelegate = async (req, res) => {
  try {
    if (!requireExactOwner(req, res)) return;
    const rawDelegateId = req.body?.generalManagerDelegateId;
    let delegate = null;
    if (rawDelegateId !== null && rawDelegateId !== '') {
      delegate = await getEmployeeUser(rawDelegateId, req.tenantId);
      if (!delegate) return fail(res, 400, '代理审批人必须是本租户已关联工号的在职员工');
      if (hasAttendanceRole(delegate, 'general_manager')) return fail(res, 400, '代理审批人不能是总经理本人');
    }
    if (!req.tenant) return fail(res, 403, '缺少租户配置');
    req.tenant.settings.attendanceGeneralManagerDelegateId = delegate?._id || null;
    await req.tenant.save();
    return res.json({ ok: true, data: {
      generalManagerDelegateId: delegate?._id || null,
      generalManagerDelegateName: delegate ? (delegate.profile?.name || delegate.userid || '') : ''
    } });
  } catch (error) {
    console.error('attendance setGeneralManagerDelegate failed:', error);
    if (error?.name === 'VersionError') return fail(res, 409, '考勤设置已被其他管理员更新，请刷新后重试');
    return fail(res, 500, '更新总经理代理审批人失败');
  }
};

exports.listSubmissionLocks = async (req, res) => {
  try {
    if (!requireExactOwner(req, res)) return;
    const locks = await AttendanceSubmissionLock.find({ tenantId: req.tenantId }).sort({ acquiredAt: 1 }).limit(100).lean();
    const employeeIds = [...new Set(locks.map(lock => String(lock.applicantId)))];
    const employees = await User.find({ _id: { $in: employeeIds }, tenantId: req.tenantId })
      .select('employeeNo profile.name userid').lean();
    const employeeById = new Map(employees.map(user => [String(user._id), user]));
    const now = Date.now();
    const data = locks.map(lock => {
      const state = getLockRecoveryState(lock, now);
      const employee = employeeById.get(String(lock.applicantId));
      return {
        applicantId: lock.applicantId,
        employeeNo: employee?.employeeNo || '',
        employeeName: employee?.profile?.name || employee?.userid || '',
        acquiredAt: lock.acquiredAt,
        ageMinutes: state.ageMs === null ? null : Math.floor(state.ageMs / 60000),
        minimumRecoveryAgeMinutes: SUBMISSION_LOCK_RECOVERY_MIN_AGE_MS / 60000,
        submissionActive: state.liveInThisProcess || state.ownerProcessAlive !== false,
        recoverable: state.recoverable
      };
    });
    return res.json({ ok: true, data });
  } catch (error) {
    console.error('attendance listSubmissionLocks failed:', error);
    return fail(res, 500, '读取申请锁状态失败');
  }
};

exports.releaseStaleSubmissionLock = async (req, res) => {
  try {
    if (!requireExactOwner(req, res)) return;
    if (!validObjectId(req.params.applicantId)) return fail(res, 400, '员工编号无效');
    if (req.body?.confirmNoLiveSubmission !== true) return fail(res, 400, '请明确确认该员工当前没有进行中的请假提交');
    const lock = await AttendanceSubmissionLock.findOne({ tenantId: req.tenantId, applicantId: req.params.applicantId }).lean();
    if (!lock) return fail(res, 404, '申请锁不存在');
    const state = getLockRecoveryState(lock);
    if (!state.oldEnough) return fail(res, 409, `申请锁需至少保留 ${SUBMISSION_LOCK_RECOVERY_MIN_AGE_MS / 60000} 分钟后才能恢复`);
    if (state.liveInThisProcess || state.ownerProcessAlive !== false) {
      return fail(res, 409, '无法确认原申请进程已停止，未解除申请锁');
    }
    const result = await AttendanceSubmissionLock.deleteOne({
      tenantId: req.tenantId,
      applicantId: req.params.applicantId,
      token: lock.token,
      acquiredAt: lock.acquiredAt
    });
    if (result.deletedCount !== 1) return fail(res, 409, '申请锁状态已变化，请刷新后重试');
    return res.json({ ok: true, data: { applicantId: req.params.applicantId, released: true } });
  } catch (error) {
    console.error('attendance releaseStaleSubmissionLock failed:', error);
    return fail(res, 500, '恢复申请锁失败');
  }
};

/** 本人审批入口按真实分配开放，与团队/公司查看权限分开。 */
exports.getApprovalAccess = async (req) => {
  const user = req.user;
  const userTenantId = user?.tenantId?._id || user?.tenantId;
  const tenantId = req.tenantId || req.tenant?._id || userTenantId;
  if (!user?._id || user.status === 'disabled' || user.role === 'platform' || !tenantId || String(userTenantId) !== String(tenantId)) return false;
  const privilege = Array.isArray(user.privilege) ? user.privilege : migrateBinaryToArray(user.privilege);
  if (user.role === 'owner' || isAdmin(privilege) || canViewTeam(user)) return true;
  if (String(req.tenant?.settings?.attendanceGeneralManagerDelegateId || '') === String(user._id)) return true;
  const [hasReports, hasAssignedRequest] = await Promise.all([
    User.exists({ tenantId, status: { $ne: 'disabled' }, role: { $ne: 'platform' }, managerId: user._id }),
    AttendanceRequest.exists({ tenantId, 'approvals.approverId': user._id }),
  ]);
  return Boolean(hasReports || hasAssignedRequest);
};

/**
 * 审批链上只有 approverId，而详情时间线要显示「谁在审 / 谁审过了」，这里补上审批人姓名。
 * 一次把涉及的人全查出来，避免逐条查库。姓名取不到（账号已删）时留空，前端按角色显示。
 */
async function approverNameMap(records) {
  const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
  const ids = new Set();
  for (const record of list) for (const approval of record.approvals || []) if (approval.approverId) ids.add(String(approval.approverId));
  if (!ids.size) return new Map();
  const users = await User.find({ _id: { $in: [...ids] } }).select('profile.name userid').lean();
  return new Map(users.map(user => [String(user._id), user.profile?.name || user.userid || '']));
}

/** 单条记录也带上审批人姓名再序列化，这样刚提交/刚审批完时就能显示下一级是谁。 */
async function serializeRequestWithApprovers(record) {
  return serializeRequest(record, await approverNameMap(record));
}

exports.listRequests = async (req, res) => {
  try {
    const view = req.query.view || 'mine';
    if (!['mine', 'inbox', 'history', 'team'].includes(view)) return fail(res, 400, '无法打开该考勤列表，请刷新页面后重试');
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
    const query = { tenantId: req.tenantId };
    if (view === 'mine') query.applicantId = req.user._id;
    if (view === 'inbox') query.currentApproverId = req.user._id, query.status = 'pending';
    if (view === 'history') {
      query.approvals = { $elemMatch: { approverId: req.user._id, status: { $in: ['approved', 'rejected'] } } };
    }
    if (view === 'team') {
      if (!canViewTeam(req.user)) return fail(res, 403, '没有团队考勤查看权限');
      if (hasAttendanceRole(req.user, 'general_manager') || hasAttendanceRole(req.user, 'attendance_admin')) {
        // Company-wide attendance access; this role grants no payroll access.
      } else {
        const reportIds = await User.find({ tenantId: req.tenantId, managerId: req.user._id }).distinct('_id');
        query.applicantId = { $in: reportIds };
      }
    }
    if (req.query.status && ['pending', 'approved', 'rejected', 'withdrawn'].includes(req.query.status) && view !== 'inbox') query.status = req.query.status;
    // 侧栏「我的申请」按类型分成请假/加班/出差三个入口，列表据此过滤；未传时返回全部类型。
    if (req.query.type && ALLOWED_TYPES.includes(req.query.type)) query.type = req.query.type;
    const [records, total] = await Promise.all([
      AttendanceRequest.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      AttendanceRequest.countDocuments(query)
    ]);
    const approverNames = await approverNameMap(records);
    return res.json({ ok: true, data: records.map(record => serializeRequest(record, approverNames)), pagination: { page, limit, total } });
  } catch (error) {
    console.error('attendance listRequests failed:', error);
    return fail(res, 500, '读取考勤申请失败');
  }
};

/**
 * 侧栏「待我审批」角标与页面待办链接用的计数：按类型统计**当前轮到我审**的申请。
 * 口径必须与 listRequests(view=inbox) 一致（`currentApproverId` + `status: pending`），
 * 否则角标数字会和点进去看到的条数对不上。
 * 刻意不挂 requireEmployee——没有工号的人同样要能看到自己的待办。
 */
exports.getApprovalCounts = async (req, res) => {
  try {
    const base = { tenantId: req.tenantId, currentApproverId: req.user._id, status: 'pending' };
    const counts = await Promise.all(ALLOWED_TYPES.map(type => AttendanceRequest.countDocuments({ ...base, type })));
    const byType = Object.fromEntries(ALLOWED_TYPES.map((type, index) => [type, counts[index]]));
    return res.json({ ok: true, data: { ...byType, total: counts.reduce((sum, value) => sum + value, 0) } });
  } catch (error) {
    console.error('attendance getApprovalCounts failed:', error);
    return fail(res, 500, '读取待审批数量失败');
  }
};

exports.createRequest = async (req, res) => {
  let leaveLockToken = null;
  const uploadedFilePaths = [];
  try {
    const body = req.body || {};
    if (!ALLOWED_TYPES.includes(body.type)) return fail(res, 400, '申请类型无效');
    const isAppeal = body.type === 'appeal';
    const reason = cleanText(body.reason, 4000, true);
    if (!reason) return fail(res, 400, '请填写事由');
    const attachments = cleanAttachments(body.attachmentUrls);
    if (!attachments) return fail(res, 400, '附件格式无效');
    // 申述没有起止时段，这两个值只在非申述分支里赋值（申述分支保持 undefined，不写进库）
    let startAt, endAt;
    let durationMinutes;
    let leaveAllocations = [];
    let occurredOn, appealType;
    let generalManagerThresholdDays = 3;
    let generalManagerThresholdMinutes = generalManagerThresholdDays * 24 * 60;

    if (isAppeal) {
      // 申述针对「某一天的某一类考勤异常」，不校验整点与时长
      if (typeof body.occurredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn)) {
        return fail(res, 400, '请填写有效的发生日期');
      }
      occurredOn = body.occurredOn;
      if (occurredOn > beijingTimestamp(Date.now(), tenantOffsetMinutes(req.tenant)).slice(0, 10)) {
        return fail(res, 400, '发生日期不能晚于今天');
      }
      if (!ALLOWED_APPEAL_TYPES.includes(body.appealType)) return fail(res, 400, '申述类型无效');
      appealType = body.appealType;
      // 台账按「已批申述次数」核减违纪次数，同一天同一类型重复提交会重复核减
      const duplicated = await AttendanceRequest.exists({
        tenantId: req.tenantId,
        applicantId: req.user._id,
        type: 'appeal',
        status: { $in: ['pending', 'approved'] },
        occurredOn,
        appealType
      });
      if (duplicated) return fail(res, 409, '这一天的同类考勤异常已在申请或已通过，无需重复提交');
    } else {
      startAt = parseDate(body.startAt);
      endAt = parseDate(body.endAt);
      if (!startAt || !endAt || endAt <= startAt) return fail(res, 400, '请填写有效的开始和结束时间');
      if (startAt.getUTCMinutes() || endAt.getUTCMinutes() || startAt.getUTCSeconds() || startAt.getUTCMilliseconds() || endAt.getUTCSeconds() || endAt.getUTCMilliseconds()) {
        return fail(res, 400, '申请时间必须精确到整点');
      }
    }

    if (body.type === 'leave') {
      if (!ALLOWED_LEAVE_TYPES.includes(body.leaveType)) return fail(res, 400, '请假类型无效');
      if (!isWorkdayAt(startAt.getTime(), req.tenant) || !isWorkdayAt(endAt.getTime(), req.tenant)) {
        return fail(res, 400, '请假开始和结束日期必须为工作日');
      }
      const calculated = calculateLeaveMinutes(startAt, endAt, req.tenant);
      durationMinutes = calculated.minutes;
      leaveAllocations = calculated.allocations;
      generalManagerThresholdMinutes = generalManagerThresholdDays * calculated.hoursPerDay * 60;
      if (durationMinutes <= 0) return fail(res, 400, '所选时段没有工作时间');
      leaveLockToken = await acquireLeaveSubmissionLock(req.tenantId, req.user._id);
      const overlaps = await AttendanceRequest.exists({
        tenantId: req.tenantId,
        applicantId: req.user._id,
        type: 'leave',
        status: { $in: ['pending', 'approved'] },
        startAt: { $lt: endAt },
        endAt: { $gt: startAt }
      });
      if (overlaps) return fail(res, 409, '该时段已有待审批或已批准的请假申请');
    } else if (!isAppeal) {
      durationMinutes = Math.round((endAt - startAt) / 60000);
      if (durationMinutes < 1 || durationMinutes > 366 * 24 * 60) return fail(res, 400, '申请时长无效或超过一年');
    }

    const applicantIsGeneralManager = hasAttendanceRole(req.user, 'general_manager');
    const applicantIsManager = hasAttendanceRole(req.user, 'manager');
    const longLeaveNeedsGeneralManager = body.type === 'leave' && durationMinutes > generalManagerThresholdMinutes;
    const requiresGeneralManager = applicantIsGeneralManager || applicantIsManager || longLeaveNeedsGeneralManager;
    let generalManager = null;
    if (requiresGeneralManager) {
      const generalManagers = await User.find({ tenantId: req.tenantId, status: { $ne: 'disabled' }, attendanceRoles: 'general_manager' })
        .select('_id employeeNo managerId profile.name userid department title').limit(2);
      if (generalManagers.length !== 1) {
        // 设计约定：缺少审批人时禁止提交并提示补全配置，不自动通过（docs/plans/2026-09-23-attendance-payroll-design.md）。
        const trigger = (applicantIsGeneralManager || applicantIsManager)
          ? '经理和总经理的申请需要总经理终审'
          : `请假超过 ${generalManagerThresholdDays} 个工作日需要总经理终审`;
        const fix = generalManagers.length > 1
          ? '但公司当前有多名总经理，请只保留 1 名'
          : '但公司当前没有在职总经理，请在「考勤设置 → 员工资料」为 1 名在职员工勾选「总经理」考勤角色';
        return fail(res, 409, `${trigger}，${fix}`);
      }
      generalManager = generalManagers[0];
    }
    const approvals = [];
    if (applicantIsGeneralManager) {
      const delegate = await getEmployeeUser(req.tenant?.settings?.attendanceGeneralManagerDelegateId, req.tenantId);
      if (!delegate) return fail(res, 409, '请先由公司主账号配置总经理代理审批人');
      if (String(delegate._id) === String(req.user._id)) return fail(res, 409, '代理审批人不能是申请人本人');
      approvals.push({ approverId: delegate._id, role: 'general_manager_delegate', status: 'pending' });
    } else if (applicantIsManager) {
      if (String(generalManager._id) === String(req.user._id)) return fail(res, 409, '总经理本人请由代理审批人处理');
      approvals.push({ approverId: generalManager._id, role: 'general_manager', status: 'pending' });
    } else {
      const manager = await getEmployeeUser(req.user.managerId, req.tenantId);
      if (!manager || String(manager._id) === String(req.user._id)) return fail(res, 409, '请先配置有效的直属经理');
      approvals.push({ approverId: manager._id, role: 'manager', status: 'pending' });
      if (requiresGeneralManager && String(generalManager._id) !== String(manager._id)) {
        approvals.push({ approverId: generalManager._id, role: 'general_manager', status: 'pending' });
      }
    }

    let leaveType, compensation, location, contact, workContent;
    if (body.type === 'leave') leaveType = body.leaveType;
    if (body.type === 'overtime') {
      if (!ALLOWED_COMPENSATION.includes(body.compensation)) return fail(res, 400, '加班补偿方式无效');
      compensation = body.compensation;
    }
    if (body.type === 'fieldwork' || body.type === 'overtime') {
      location = cleanText(body.location, 500, true);
      if (!location) return fail(res, 400, body.type === 'fieldwork' ? '请填写出差地点' : '请填写加班地点');
    }
    if (body.type === 'fieldwork') {
      contact = cleanText(body.contact, 500, true);
      if (!contact) return fail(res, 400, '请填写出差对接对象');
    }
    if (body.type === 'fieldwork' || body.type === 'overtime') {
      workContent = cleanText(body.workContent, 2000, true);
      if (!workContent) return fail(res, 400, '请填写工作内容');
    }

    const employee = sanitizeUser(req.user);
    const requestId = new mongoose.Types.ObjectId();
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length + attachments.length > 5) return fail(res, 400, '最多上传 5 个附件');
    const uploadedAttachments = files.map((file) => {
      const extension = ATTACHMENT_EXTENSIONS[file.mimetype];
      if (!extension) return null;
      const originalName = path.basename(String(file.originalname || '附件').replace(/\\/g, '/'))
        .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || '附件';
      return { id: randomUUID(), name: originalName, mimeType: file.mimetype, size: file.size, extension };
    });
    if (uploadedAttachments.some(item => !item)) return fail(res, 400, '附件格式无效');
    const requestAttachmentUrls = uploadedAttachments.map(item => `/attendance/requests/${requestId}/attachments/${item.id}`);
    const uploadDirectory = path.join(ATTENDANCE_UPLOAD_ROOT, String(req.tenantId), String(requestId));
    if (files.length) await fs.promises.mkdir(uploadDirectory, { recursive: true });
    for (let index = 0; index < files.length; index++) {
      const attachment = uploadedAttachments[index];
      const filePath = path.join(uploadDirectory, `${attachment.id}${attachment.extension}`);
      uploadedFilePaths.push(filePath);
      await fs.promises.writeFile(filePath, files[index].buffer, { flag: 'wx', mode: 0o600 });
    }
    const record = await AttendanceRequest.create({
      _id: requestId,
      tenantId: req.tenantId,
      applicantId: req.user._id,
      applicant: { employeeNo: employee.employeeNo, name: employee.name, department: employee.department, title: employee.title },
      type: body.type,
      leaveType,
      compensation,
      occurredOn,
      appealType,
      startAt,
      endAt,
      durationMinutes,
      leaveAllocations,
      reason,
      location,
      contact,
      workContent,
      attachments: uploadedAttachments.map(({ extension, ...attachment }) => attachment),
      attachmentUrls: [...attachments, ...requestAttachmentUrls],
      approvals,
      currentApproverId: approvals[0].approverId,
      status: 'pending'
    });
    uploadedFilePaths.length = 0;
    // 通知第一审批人；审批人恰好是申请人本人（自己申请跳过直属经理时会这样）就不必提醒自己
    const firstApproverId = approvals[0]?.approverId;
    if (firstApproverId && String(firstApproverId) !== String(req.user._id)) {
      const typeLabel = ATTENDANCE_TYPE_LABELS[record.type] || '考勤';
      await notifyAttendance(req.tenantId, firstApproverId, 'attendance_pending',
        `${record.applicant?.name || '同事'}提交了${typeLabel}申请`,
        requestSummary(record, tenantOffsetMinutes(req.tenant)),
        `/attendance/approvals?type=${record.type}`);
    }
    return res.status(201).json({ ok: true, data: await serializeRequestWithApprovers(record) });
  } catch (error) {
    await Promise.allSettled(uploadedFilePaths.map(filePath => fs.promises.unlink(filePath)));
    console.error('attendance createRequest failed:', error);
    if (error?.statusCode === 409) return fail(res, 409, error.message);
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) return fail(res, 400, error.message || '申请内容无效');
    if (/工作日历|工作时段配置|结束时间|不能超过一年/.test(error.message || '')) return fail(res, 400, error.message);
    return fail(res, 500, '创建考勤申请失败');
  } finally {
    if (leaveLockToken) {
      try {
        await releaseLeaveSubmissionLock(req.tenantId, req.user._id, leaveLockToken);
      } catch (error) {
        console.error('attendance release submission lock failed:', error);
      }
    }
  }
};

exports.getRequestAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    if (!validObjectId(id) || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(attachmentId)) return fail(res, 400, '附件编号无效');
    const record = await AttendanceRequest.findOne({ _id: id, tenantId: req.tenantId }).lean();
    if (!record) return fail(res, 404, '找不到该申请或附件');
    const attachment = (record.attachments || []).find(item => item.id === attachmentId);
    if (!attachment) return fail(res, 404, '找不到该申请或附件');

    const userId = String(req.user?._id || '');
    const isAllowed = String(record.applicantId) === userId
      || req.user?.role === 'owner'
      || hasAttendanceRole(req.user, 'attendance_admin')
      || hasAttendanceRole(req.user, 'general_manager')
      || (record.approvals || []).some(approval => String(approval.approverId) === userId);
    if (!isAllowed) return fail(res, 403, '无权读取该附件');

    const extension = ATTACHMENT_EXTENSIONS[attachment.mimeType];
    if (!extension) return fail(res, 404, '附件格式无效');
    const filePath = path.join(ATTENDANCE_UPLOAD_ROOT, String(req.tenantId), String(record._id), `${attachment.id}${extension}`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(filePath, attachment.name, (error) => {
      if (error && !res.headersSent) fail(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? '附件文件不存在' : '读取附件失败');
    });
  } catch (error) {
    console.error('attendance getRequestAttachment failed:', error);
    return fail(res, 500, '读取附件失败');
  }
};

exports.withdrawRequest = async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) return fail(res, 400, '申请编号无效');
    const record = await AttendanceRequest.findOneAndUpdate({
      _id: req.params.id,
      tenantId: req.tenantId,
      applicantId: req.user._id,
      status: 'pending'
    }, {
      $set: { status: 'withdrawn', currentApproverId: null, withdrawnAt: new Date(), updatedAt: new Date() }
    }, { new: true });
    if (!record) return fail(res, 404, '申请不存在、无权撤回或已处理');
    return res.json({ ok: true, data: await serializeRequestWithApprovers(record) });
  } catch (error) {
    console.error('attendance withdrawRequest failed:', error);
    return fail(res, 500, '撤回申请失败');
  }
};

exports.reviewRequest = async (req, res) => {
  const monthLocks = [];
  try {
    if (!validObjectId(req.params.id)) return fail(res, 400, '申请编号无效');
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return fail(res, 400, 'decision 仅支持 approve 或 reject');
    const comment = cleanText(req.body?.comment || '', 2000, decision === 'reject');
    if (comment === null) return fail(res, 400, decision === 'reject' ? '驳回时请填写意见' : '审批意见过长');

    const record = await AttendanceRequest.findOne({ _id: req.params.id, tenantId: req.tenantId, status: 'pending', currentApproverId: req.user._id });
    if (!record) {
      const alreadyReviewed = await AttendanceRequest.exists({
        _id: req.params.id,
        tenantId: req.tenantId,
        applicantId: { $ne: req.user._id },
        'approvals.approverId': req.user._id
      });
      if (alreadyReviewed) return fail(res, 409, '该申请已由你处理');
      return fail(res, 404, '待审批申请不存在');
    }
    if (String(record.applicantId) === String(req.user._id)) return fail(res, 403, '不能审批本人申请');
    const currentIndex = record.approvals.findIndex(step => String(step.approverId) === String(req.user._id) && step.status === 'pending');
    if (currentIndex < 0) return fail(res, 409, '当前用户不是有效审批人');
    if (decision === 'approve') {
      const monthKeys = new Set();
      // 申述按「发生日期」所在月份核减台账次数，已结账的月份一样要先重新开启，避免批了却没生效
      if (record.type === 'appeal') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(record.occurredOn || '')) monthKeys.add(record.occurredOn.slice(0, 7));
      } else {
        const allocations = record.leaveAllocations;
        const validAllocations = record.type === 'leave' && Array.isArray(allocations) && allocations.length > 0 &&
          allocations.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && Number.isInteger(item.minutes) && item.minutes >= 0) &&
          allocations.reduce((total, item) => total + item.minutes, 0) === record.durationMinutes;
        if (validAllocations) {
          for (const allocation of allocations) if (allocation.minutes > 0) monthKeys.add(allocation.date.slice(0, 7));
        } else {
          const first = new Date(record.startAt.getTime() + 8 * 60 * 60 * 1000);
          const last = new Date(record.endAt.getTime() - 1 + 8 * 60 * 60 * 1000);
          let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
          const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
          while (cursor <= end) {
            monthKeys.add(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
            cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
          }
        }
      }
      for (const month of [...monthKeys].sort()) monthLocks.push(await ledgerCoordination.acquireMonthMutationLock(req.tenantId, month));
      const closed = await AttendanceMonthLedger.exists({ tenantId: req.tenantId, month: { $in: [...monthKeys] }, status: 'closed' });
      if (closed) return fail(res, 409, '申请涉及已结账月份，请先由考勤管理员重新开启并登记原因');
    }

    const now = new Date();
    const update = {
      $set: { [`approvals.${currentIndex}.status`]: decision === 'approve' ? 'approved' : 'rejected', [`approvals.${currentIndex}.comment`]: comment, [`approvals.${currentIndex}.reviewedAt`]: now, updatedAt: now }
    };
    let nextApproverId = null;
    if (decision === 'reject') {
      update.$set.status = 'rejected';
      update.$set.currentApproverId = null;
    } else if (currentIndex + 1 < record.approvals.length) {
      nextApproverId = record.approvals[currentIndex + 1].approverId;
      update.$set.currentApproverId = nextApproverId;
    } else {
      update.$set.status = 'approved';
      update.$set.currentApproverId = null;
    }
    const updated = await AttendanceRequest.findOneAndUpdate({
      _id: record._id,
      tenantId: req.tenantId,
      status: 'pending',
      currentApproverId: req.user._id,
      [`approvals.${currentIndex}.status`]: 'pending'
    }, update, { new: true });
    if (!updated) return fail(res, 409, '申请状态已变化，请刷新后再试');
    await notifyReviewOutcome(updated, { tenantId: req.tenantId, tenant: req.tenant, decision, comment, nextApproverId });
    return res.json({ ok: true, data: await serializeRequestWithApprovers(updated), nextApproverId });
  } catch (error) {
    console.error('attendance reviewRequest failed:', error);
    if (error?.status === 409) return fail(res, 409, error.message);
    return fail(res, 500, '审批操作失败');
  } finally {
    for (const lock of monthLocks.reverse()) {
      try { await ledgerCoordination.releaseMonthMutationLock(req.tenantId, lock); }
      catch (error) { console.error('attendance release month mutation lock failed:', error); }
    }
  }
};
