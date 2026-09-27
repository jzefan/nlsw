const Tenant = require('../models/Tenant');
const { isStandalone } = require('./deploy-mode');
const { getChinaAttendanceCalendar, getChinaAttendanceCalendarYears } = require('./china-attendance-calendar');
const secrets = require('../config/secrets');

const ATTENDANCE_ROLES = ['manager', 'general_manager', 'attendance_admin'];

function rolesOf(user) {
  return Array.isArray(user?.attendanceRoles) ? user.attendanceRoles : [];
}

function hasAttendanceRole(user, role) {
  return rolesOf(user).includes(role);
}

function hasLinkedEmployee(user) {
  // The authenticated account is the employee identity; employeeNo is optional metadata.
  return Boolean(user?._id && user?.tenantId);
}

function requireAuthenticated(req, res) {
  if (!req.user?._id) {
    res.status(401).json({ ok: false, error: '请先登录' });
    return false;
  }
  return true;
}

async function requireAttendanceEnabled(req, res, next) {
  try {
    if (!requireAuthenticated(req, res)) return;
    if (req.user.status === 'disabled') return res.status(403).json({ ok: false, error: '账号已停用，无法访问考勤' });
    if (req.user.role === 'platform' || !req.tenantId) {
      return res.status(403).json({ ok: false, error: '考勤仅限公司成员访问' });
    }

    let enabled = false;
    if (isStandalone()) {
      enabled = secrets.enableAttendance === true || process.env.ENABLE_ATTENDANCE === 'true';
    } else {
      const tenant = req.tenant || await Tenant.findById(req.tenantId).select('settings.attendanceEnabled').lean();
      enabled = tenant?.settings?.attendanceEnabled === true;
    }
    if (!enabled) return res.status(404).json({ ok: false, error: '考勤功能未启用' });
    return next();
  } catch (error) {
    console.error('attendance feature check failed:', error);
    return res.status(500).json({ ok: false, error: '无法验证考勤功能状态' });
  }
}

function requireEmployee(req, res, next) {
  if (!requireAuthenticated(req, res)) return;
  if (req.user.status === 'disabled') return res.status(403).json({ ok: false, error: '账号已停用，无法访问考勤' });
  if (!hasLinkedEmployee(req.user)) {
    return res.status(403).json({
      ok: false,
      error: '当前账号尚未关联公司，暂时无法访问考勤与工资条'
    });
  }
  const userTenantId = req.user.tenantId?._id || req.user.tenantId;
  if (String(userTenantId) !== String(req.tenantId)) {
    return res.status(403).json({ ok: false, error: '当前账号与所在公司不一致，请退出后重新登录' });
  }
  return next();
}

function canViewTeam(user) {
  return hasAttendanceRole(user, 'manager') || hasAttendanceRole(user, 'general_manager') || hasAttendanceRole(user, 'attendance_admin');
}

// Work schedule intentionally lives behind this policy accessor so a later settings API
// can replace defaults without changing request/approval rules.
function getAttendancePolicy(tenant) {
  const settings = tenant?.settings || {};
  const intervals = Array.isArray(settings.attendanceWorkPeriods) && settings.attendanceWorkPeriods.length
    ? settings.attendanceWorkPeriods
    : [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }];
  const normalizedIntervals = intervals.map(item => ({ start: toMinutes(item?.start), end: toMinutes(item?.end) }));
  normalizedIntervals.sort((a, b) => a.start - b.start);
  for (let i = 0; i < normalizedIntervals.length; i++) {
    const item = normalizedIntervals[i];
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start || (i > 0 && normalizedIntervals[i - 1].end > item.start)) {
      throw new Error('考勤工作时段配置无效');
    }
  }
  const normalizedWorkPeriods = normalizedIntervals.map(item => ({
    start: `${String(Math.floor(item.start / 60)).padStart(2, '0')}:${String(item.start % 60).padStart(2, '0')}`,
    end: `${String(Math.floor(item.end / 60)).padStart(2, '0')}:${String(item.end % 60).padStart(2, '0')}`
  }));
  const overridesRaw = settings.attendanceCalendarOverrides;
  const overrides = new Map();
  if (Array.isArray(overridesRaw)) {
    for (const item of overridesRaw) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item?.date) && ['holiday', 'workday'].includes(item?.type)) overrides.set(item.date, item.type);
    }
  } else if (overridesRaw && typeof overridesRaw === 'object') {
    for (const [date, type] of Object.entries(overridesRaw)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['holiday', 'workday'].includes(type)) overrides.set(date, type);
    }
  }
  const requestedOffset = settings.attendanceUtcOffsetMinutes;
  const offsetMinutes = Number.isInteger(requestedOffset) && requestedOffset >= -720 && requestedOffset <= 840 ? requestedOffset : 480;
  const configuredYears = new Set(Array.isArray(settings.attendanceCalendarYears)
    ? settings.attendanceCalendarYears.filter(year => Number.isInteger(year)) : []);
  const defaultOverrides = new Map();
  for (const year of getChinaAttendanceCalendarYears()) {
    for (const day of getChinaAttendanceCalendar(year)) defaultOverrides.set(day.date, day.type);
    configuredYears.add(year);
  }
  const hoursPerDay = Number.isInteger(settings.attendanceHoursPerDay) && settings.attendanceHoursPerDay >= 1 && settings.attendanceHoursPerDay <= 24
    ? settings.attendanceHoursPerDay : normalizedIntervals.reduce((sum, item) => sum + (item.end - item.start) / 60, 0);
  return { intervals: normalizedWorkPeriods, overrides, defaultOverrides, offsetMinutes, hoursPerDay, configuredYears };
}

function toMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return NaN;
  const h = Number(match[1]), m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}

function businessDate(epoch, offsetMinutes) {
  const d = new Date(epoch + offsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isWorkDate(date, policy) {
  const override = policy.overrides.get(date);
  if (override) return override === 'workday';
  const defaultOverride = policy.defaultOverrides.get(date);
  if (defaultOverride) return defaultOverride === 'workday';
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function isWorkdayAt(epoch, tenant) {
  const policy = getAttendancePolicy(tenant);
  const date = businessDate(epoch, policy.offsetMinutes);
  const year = Number(date.slice(0, 4));
  if (!policy.configuredYears.has(year)) throw new Error(`请先由考勤管理员确认 ${year} 年工作日历`);
  return isWorkDate(date, policy);
}

function calculateLeaveMinutes(startAt, endAt, tenant) {
  const policy = getAttendancePolicy(tenant);
  const start = startAt.getTime(), end = endAt.getTime();
  if (end <= start) throw new Error('结束时间必须晚于开始时间');
  const first = new Date(start + policy.offsetMinutes * 60000);
  const last = new Date(end - 1 + policy.offsetMinutes * 60000);
  const dayCount = Math.ceil((Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) - Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())) / 86400000) + 1;
  if (dayCount > 366) throw new Error('单次请假不能超过一年');
  let minutes = 0;
  const allocations = [];
  for (let i = 0; i < dayCount; i++) {
    const dateObj = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() + i));
    const date = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
    if (!policy.configuredYears.has(dateObj.getUTCFullYear())) throw new Error(`请先由考勤管理员确认 ${dateObj.getUTCFullYear()} 年工作日历`);
    if (!isWorkDate(date, policy)) {
      allocations.push({ date, minutes: 0 });
      continue;
    }
    let dayMinutes = 0;
    const dayStart = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()) - policy.offsetMinutes * 60000;
    for (const interval of policy.intervals) {
      const from = dayStart + toMinutes(interval.start) * 60000;
      const to = dayStart + toMinutes(interval.end) * 60000;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('考勤工作时段配置无效');
      dayMinutes += Math.max(0, Math.min(end, to) - Math.max(start, from)) / 60000;
    }
    dayMinutes = Math.round(dayMinutes);
    minutes += dayMinutes;
    allocations.push({ date, minutes: dayMinutes });
  }
  return { minutes: Math.round(minutes), hoursPerDay: policy.hoursPerDay, policy, allocations };
}

function sanitizeUser(user) {
  return {
    id: user._id,
    employeeNo: user.employeeNo || '',
    name: user.profile?.name || user.userid || '',
    department: user.department || '',
    title: user.title || ''
  };
}

module.exports = {
  ATTENDANCE_ROLES,
  rolesOf,
  hasAttendanceRole,
  hasLinkedEmployee,
  canViewTeam,
  requireAttendanceEnabled,
  requireEmployee,
  getAttendancePolicy,
  calculateLeaveMinutes,
  isWorkdayAt,
  businessDate,
  sanitizeUser
};
