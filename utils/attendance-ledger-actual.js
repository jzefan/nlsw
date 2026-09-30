/**
 * 月台账「实到分钟」的自动计算规则。
 *
 * 口径（2026-09-30 与使用方确认）：**实到 = 应出勤 − 请假合计 − 违纪扣减**，下限 0。
 * - 扣减数值按「小时/次」配置（对方口径就是小时，不按分钟），无打卡按「工作日/次」；
 *   1 个工作日 = 当前工作时段的一天有效时长（与「应出勤」的日口径一致）。
 * - 自动算出来的只是**建议值**，管理员可以改；改过的行（actualMinutesSource = 'manual'）不再被覆盖。
 * - 请假未按天分摊（requiresLeaveReconciliation）时算不出来 —— 返回 null，仍由人工确认。
 *
 * 默认值是唯一来源：前端「考勤设置」侧只做同一份兜底，接口返回值才是权威。
 */

const DEFAULT_ACTUAL_RULE = {
  lateWithin10Hours: 0.5,
  lateOver10Hours: 1,
  earlyLeaveHours: 1,
  noClockFullDays: 1
};

/** 字段清单：校验、界面标签、界面单位共用一份，避免三处写法漂移。 */
const ACTUAL_RULE_FIELDS = [
  { key: 'lateWithin10Hours', label: '迟到（10分钟以内）', unit: 'hour', max: 24 },
  { key: 'lateOver10Hours', label: '迟到（10分钟以上）', unit: 'hour', max: 24 },
  { key: 'earlyLeaveHours', label: '早退', unit: 'hour', max: 24 },
  { key: 'noClockFullDays', label: '无打卡记录', unit: 'day', max: 31 }
];

const DEFAULT_DAY_MINUTES = 480;

/** 空值 / 非法值一律返回 null，由调用方回落到默认值（0 是有效值，不能被当成空）。 */
function ruleNumber(value, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) return null;
  // 精确到分钟，避免 0.333… 这类值在库里越存越长
  return Math.round(number * 60) / 60;
}

/** 读租户规则：缺项或非法项回落到默认值。 */
function readActualRule(tenant) {
  const raw = tenant?.settings?.attendanceLedgerActualRule || {};
  const rule = {};
  for (const field of ACTUAL_RULE_FIELDS) {
    rule[field.key] = ruleNumber(raw[field.key], field.max) ?? DEFAULT_ACTUAL_RULE[field.key];
  }
  return rule;
}

/** 校验「考勤设置」提交上来的规则，错误文案用中文标签。 */
function validateActualRule(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: '实到计算规则格式无效' };
  const rule = {};
  for (const field of ACTUAL_RULE_FIELDS) {
    const value = ruleNumber(input[field.key], field.max);
    if (value === null) {
      return { ok: false, error: `${field.label} 的扣减数值应为 0 至 ${field.max} 之间的数字（单位：${field.unit === 'hour' ? '小时' : '工作日'}）` };
    }
    rule[field.key] = value;
  }
  return { ok: true, rule };
}

/** 一个工作日的有效时长（分钟）：当前工作时段各段之和。 */
function dailyWorkMinutes(policy) {
  const intervals = Array.isArray(policy?.intervalMinutes) ? policy.intervalMinutes : [];
  const total = intervals.reduce((sum, item) => sum + Math.max(0, (item?.end ?? 0) - (item?.start ?? 0)), 0);
  return total > 0 ? total : DEFAULT_DAY_MINUTES;
}

function hoursText(minutes) {
  const hours = minutes / 60;
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text} 小时`;
}

function countOf(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

/**
 * 这一行的实到是否由人工确定（不再被自动建议覆盖）。
 * 旧数据没有来源标记：**已经有值的**一定是当年人工填的，保护起来；没值的可以自动填。
 */
function isActualManual(row) {
  if (row?.actualMinutesSource === 'manual') return true;
  if (row?.actualMinutesSource === 'auto') return false;
  return row?.actualMinutes !== null && row?.actualMinutes !== undefined;
}

/**
 * 算一行的实到建议值。
 * 返回 { minutes, note }：minutes 为 null 表示算不出来，note 说明原因并直接显示给使用者。
 */
function computeSuggestedActualMinutes(row, rule, dayMinutes) {
  if (row?.requiresLeaveReconciliation) return { minutes: null, note: '请假未按天分摊，无法自动计算，请人工确认' };
  const expected = Number(row?.expectedMinutes);
  if (!Number.isInteger(expected) || expected <= 0) return { minutes: null, note: '本月无应出勤，无法自动计算' };

  const leaveMinutes = Object.values(row?.leaveMinutesByType || {}).reduce((sum, value) => sum + countOf(value), 0);
  const deductionItems = [
    { label: '迟到（10分钟以内）', minutes: Math.round(countOf(row?.lateWithin10) * rule.lateWithin10Hours * 60) },
    { label: '迟到（10分钟以上）', minutes: Math.round(countOf(row?.lateOver10) * rule.lateOver10Hours * 60) },
    { label: '早退', minutes: Math.round(countOf(row?.earlyLeave) * rule.earlyLeaveHours * 60) },
    { label: '无打卡记录', minutes: Math.round(countOf(row?.noClockRecord) * rule.noClockFullDays * dayMinutes) }
  ].filter(item => item.minutes > 0);

  const deducted = deductionItems.reduce((sum, item) => sum + item.minutes, 0);
  const raw = expected - leaveMinutes - deducted;
  const minutes = Math.max(0, raw);

  let note = `应出勤 ${hoursText(expected)}`;
  if (leaveMinutes > 0) note += ` − 请假 ${hoursText(leaveMinutes)}`;
  if (deducted > 0) note += ` − 迟到/早退/无打卡扣减 ${hoursText(deducted)}${deductionItems.length ? `（${deductionItems.map(item => item.label).join('、')}）` : ''}`;
  note += leaveMinutes + deducted > 0 ? ` = ${hoursText(minutes)}` : '（无请假与违纪扣减）';
  // 迟到只导入了「合计」、没分档时无法判断该按哪一档扣，宁可不扣并说清楚
  if (countOf(row?.lateWithin10) === 0 && countOf(row?.lateOver10) === 0 && countOf(row?.lateTotal) > 0) {
    note += '；迟到只导入了合计、未分档，本次未扣减';
  }
  if (raw < 0) note += '；扣减超过应出勤，按 0 计';

  return { minutes, note };
}

module.exports = {
  DEFAULT_ACTUAL_RULE,
  ACTUAL_RULE_FIELDS,
  readActualRule,
  validateActualRule,
  dailyWorkMinutes,
  isActualManual,
  computeSuggestedActualMinutes
};
