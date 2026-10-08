const Tenant = require('../models/Tenant');
const { isStandalone } = require('./deploy-mode');
const { getChinaAttendanceCalendar, getChinaAttendanceCalendarYears } = require('./china-attendance-calendar');
const secrets = require('../config/secrets');

const ATTENDANCE_ROLES = ['manager', 'general_manager', 'attendance_admin'];

/** 读取与写入共用的默认工作时段（上午 + 下午）；租户未配置时一律回落到这里。 */
const DEFAULT_WORK_PERIODS = Object.freeze([
  Object.freeze({ start: '08:00', end: '12:00' }),
  Object.freeze({ start: '14:00', end: '18:00' }),
]);

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
    : DEFAULT_WORK_PERIODS;
  const normalizedIntervals = intervals.map(item => ({ start: toMinutes(item?.start), end: toMinutes(item?.end) }));
  normalizedIntervals.sort((a, b) => a.start - b.start);
  for (let i = 0; i < normalizedIntervals.length; i++) {
    const item = normalizedIntervals[i];
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start || (i > 0 && normalizedIntervals[i - 1].end > item.start)) {
      throw new Error('考勤工作时段配置无效');
    }
  }
  const normalizedWorkPeriods = normalizedIntervals.map(formatWorkInterval);
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
  // 周六上午上班（单休/大小周）：周六只算上午那一段，其余照休。法定节假日与调休上班日由 override 优先决定，不受这里影响。
  const saturdayMorning = settings.attendanceSaturdayMorningWorkday === true;
  const morningIntervals = saturdayMorning ? leadingWorkIntervals(normalizedIntervals) : [];
  return {
    intervals: normalizedWorkPeriods,
    intervalMinutes: normalizedIntervals,
    morningIntervals: morningIntervals.map(formatWorkInterval),
    morningIntervalMinutes: morningIntervals,
    saturdayMorning,
    overrides, defaultOverrides, offsetMinutes, hoursPerDay, configuredYears
  };
}

/** 把「距零点分钟数」的时段还原成 HH:MM，供接口与前端消费。 */
function formatWorkInterval(item) {
  return {
    start: `${String(Math.floor(item.start / 60)).padStart(2, '0')}:${String(item.start % 60).padStart(2, '0')}`,
    end: `${String(Math.floor(item.end / 60)).padStart(2, '0')}:${String(item.end % 60).padStart(2, '0')}`
  };
}

/**
 * 周六上午的时段：从第一段起连着取，遇到休息间隔就停；全天只有一个连续时段时取前一半。
 * 默认配置 09:00–12:00 + 13:00–18:00 得到 09:00–12:00。
 */
function leadingWorkIntervals(intervals) {
  if (!intervals.length) return [];
  if (intervals.length === 1) {
    const only = intervals[0];
    const middle = Math.min(only.end, Math.max(only.start + 15, Math.round((only.start + only.end) / 2 / 15) * 15));
    return [{ start: only.start, end: middle }];
  }
  const leading = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start > intervals[i - 1].end) break;
    leading.push(intervals[i]);
  }
  return leading;
}

/**
 * 'HH:MM' → 距零点分钟数；格式不对返回 NaN。
 * 小时允许一位数（用户在输入框打 `8:00` 很常见），分钟必须是两位。
 * 输出侧一律经 formatWorkInterval 补零成 `HH:MM`，库里存的都是两位。
 */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return NaN;
  const h = Number(match[1]), m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}

function businessDate(epoch, offsetMinutes) {
  const d = new Date(epoch + offsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 某天实际计入工作的时段（距零点分钟数）：null 表示当天休息。
 * 优先级：租户单日覆盖 > 国务院安排 > 周六上午（开关开启时）> 默认周一至周五。
 */
function workIntervalMinutes(date, policy) {
  const override = policy.overrides.get(date);
  if (override) return override === 'workday' ? policy.intervalMinutes : null;
  const defaultOverride = policy.defaultOverrides.get(date);
  if (defaultOverride) return defaultOverride === 'workday' ? policy.intervalMinutes : null;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  if (weekday === 0) return null;
  if (weekday === 6) return policy.saturdayMorning ? policy.morningIntervalMinutes : null;
  return policy.intervalMinutes;
}

function isWorkDate(date, policy) {
  return workIntervalMinutes(date, policy) !== null;
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
    const dayIntervals = workIntervalMinutes(date, policy);
    if (!dayIntervals) {
      allocations.push({ date, minutes: 0 });
      continue;
    }
    let dayMinutes = 0;
    const dayStart = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()) - policy.offsetMinutes * 60000;
    for (const interval of dayIntervals) {
      dayMinutes += Math.max(0, Math.min(end, dayStart + interval.end * 60000) - Math.max(start, dayStart + interval.start * 60000)) / 60000;
    }
    dayMinutes = Math.round(dayMinutes);
    minutes += dayMinutes;
    allocations.push({ date, minutes: dayMinutes });
  }
  return { minutes: Math.round(minutes), hoursPerDay: policy.hoursPerDay, policy, allocations };
}

/**
 * 校验「工作时段」提交值。
 * - 必须是 1~4 段（1 段表示全天连续上班，2 段是常见的上下午分开）。
 * - 每段 HH:MM，结束必须晚于开始。
 * - 段之间不允许重叠（`getAttendancePolicy` 也要求不重叠，这里提前拦下并给可读原因）。
 * - 至少 1 分钟、最多 16 小时，避免 0 分钟或跨整天的异常配置。
 * @returns {{ok: true, periods: Array<{start: string, end: string}>} | {ok: false, error: string}}
 */
function validateWorkPeriods(input) {
  if (!Array.isArray(input) || !input.length) return { ok: false, error: '请至少设置一个工作时段' };
  if (input.length > 4) return { ok: false, error: '工作时段最多 4 段' };
  const parsed = [];
  for (const item of input) {
    const start = toMinutes(item?.start);
    const end = toMinutes(item?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: '工作时段要用 HH:MM 格式，例如 09:00' };
    if (end <= start) return { ok: false, error: '每个时段的结束时间必须晚于开始时间' };
    if (end - start < 1) return { ok: false, error: '每个时段至少 1 分钟' };
    parsed.push({ start, end });
  }
  parsed.sort((a, b) => a.start - b.start);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i - 1].end > parsed[i].start) return { ok: false, error: '工作时段不能相互重叠' };
  }
  const total = parsed.reduce((sum, item) => sum + (item.end - item.start), 0);
  if (total > 16 * 60) return { ok: false, error: '一天工作时间不能超过 16 小时' };
  return { ok: true, periods: parsed.map(formatWorkInterval) };
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
  DEFAULT_WORK_PERIODS,
  rolesOf,
  hasAttendanceRole,
  hasLinkedEmployee,
  canViewTeam,
  requireAttendanceEnabled,
  requireEmployee,
  validateWorkPeriods,
  getAttendancePolicy,
  calculateLeaveMinutes,
  isWorkdayAt,
  businessDate,
  sanitizeUser
};
