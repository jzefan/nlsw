const test = require('node:test');
const assert = require('node:assert/strict');
const Tenant = require('../models/Tenant');
const { validateWorkPeriods, getAttendancePolicy, DEFAULT_WORK_PERIODS } = require('../utils/attendance-permissions');

/**
 * 回归护栏：settings 里新增的考勤配置**必须在 Tenant schema 里声明**。
 * mongoose strict 模式会静默丢弃未声明字段的赋值 —— 接口返回 200、校验与重算全对，
 * 但值根本没落库，读取时永远回落默认值。这个坑非常难查，所以钉一条断言。
 * 注意 settings 是平铺路径（`settings.xxx`），不是嵌套 schema。
 */
test('Tenant schema 声明了考勤相关的配置字段（否则写入被 strict 静默丢弃）', () => {
  const paths = Tenant.schema.paths;
  for (const key of ['settings.attendanceWorkPeriods', 'settings.attendanceSaturdayMorningWorkday', 'settings.attendanceEnabled', 'settings.attendanceCalendarOverrides']) {
    assert.ok(paths[key], `Tenant schema 未声明 ${key}，写入会被 strict 静默丢弃`);
  }
});

test('租户文档能真的存下工作时段并在读回来时保持原样', () => {
  const validated = validateWorkPeriods([{ start: '8:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);
  assert.equal(validated.ok, true);
  // 不连库，直接用 schema 做一遍「赋值 → toObject」：strict 会在这一步暴露问题
  const doc = new Tenant({ name: 'x', settings: { attendanceWorkPeriods: validated.periods } });
  const saved = doc.toObject().settings.attendanceWorkPeriods;
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map(item => [item.start, item.end]), [['08:00', '12:00'], ['13:00', '18:00']]);
});

test('默认工作时段是上午 08:00–12:00 + 下午 14:00–18:00', () => {
  assert.deepEqual(DEFAULT_WORK_PERIODS.map(item => [item.start, item.end]), [['08:00', '12:00'], ['14:00', '18:00']]);
  const policy = getAttendancePolicy({ settings: {} });
  assert.deepEqual(policy.intervals, [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }]);
  assert.equal(policy.hoursPerDay, 8, '8 小时 = 4 + 4');
});

test('配置成 8:00–12:00 + 13:00–18:00 时应出勤与 hoursPerDay 一起变', () => {
  const policy = getAttendancePolicy({ settings: { attendanceWorkPeriods: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }] } });
  assert.deepEqual(policy.intervals, [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);
  assert.equal(policy.hoursPerDay, 9, '4 + 5 = 9 小时');
  // 应出勤分钟数直接读这份时段，30 分钟的差要体现出来
  assert.deepEqual(policy.intervalMinutes.map(item => item.end - item.start), [240, 300]);
});

test('周六上午上班的时段从工作时段切出来，起止时间改了它跟着变', () => {
  const policy = getAttendancePolicy({ settings: { attendanceSaturdayMorningWorkday: true, attendanceWorkPeriods: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }] } });
  assert.equal(policy.saturdayMorning, true);
  // 上午 + 下午之间有休息间隔，所以周六只取到 08:00–12:00
  assert.deepEqual(policy.morningIntervals, [{ start: '08:00', end: '12:00' }]);
});

test('工作时段校验：接受 1 段或 2 段合法配置', () => {
  const two = validateWorkPeriods([{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);
  assert.equal(two.ok, true);
  assert.deepEqual(two.periods, [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);

  // 全天连着上一天：合并成一段也合法（有些公司不午休）
  const one = validateWorkPeriods([{ start: '09:00', end: '18:00' }]);
  assert.equal(one.ok, true);
  assert.equal(one.periods.length, 1);
});

test('工作时段校验：按时间排序输出，先后顺序填反也能过', () => {
  const result = validateWorkPeriods([{ start: '13:00', end: '18:00' }, { start: '08:00', end: '12:00' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.periods.map(item => item.start), ['08:00', '13:00']);
});

test('工作时段校验：一位数小时也接受（用户打 8:00 是自然操作），输出统一补零成 HH:MM', () => {
  const result = validateWorkPeriods([{ start: '8:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.periods, [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }], '存库前补零');
});

test('工作时段校验：非法输入都带可读原因', () => {
  const cases = [
    [null, /至少设置一个/],
    [[], /至少设置一个/],
    [[{ start: '9:0', end: '12:00' }, { start: '13:00', end: '18:00' }], /HH:MM/],
    [[{ start: '9', end: '12:00' }], /HH:MM/],
    [[{ start: '25:00', end: '26:00' }], /HH:MM/],
    [[{ start: '09:70', end: '12:00' }], /HH:MM/],
    [[{ start: '12:00', end: '12:00' }], /结束时间必须晚于开始时间/],
    [[{ start: '13:00', end: '12:00' }], /结束时间必须晚于开始时间/],
    [[{ start: '09:00', end: '12:00' }, { start: '11:00', end: '15:00' }], /不能相互重叠/],
    [[{ start: '00:00', end: '23:59' }], /不能超过 16 小时/],
    [[{ start: '01:00', end: '02:00' }, { start: '03:00', end: '04:00' }, { start: '05:00', end: '06:00' }, { start: '07:00', end: '08:00' }, { start: '09:00', end: '10:00' }], /最多 4 段/],
  ];
  for (const [input, pattern] of cases) {
    const result = validateWorkPeriods(input);
    assert.equal(result.ok, false, `应拒绝：${JSON.stringify(input)}`);
    assert.match(result.error, pattern);
  }
});

test('保存后读回来的时段就是新值，未配置时回落到默认', () => {
  const configured = getAttendancePolicy({ settings: { attendanceWorkPeriods: [{ start: '08:30', end: '12:00' }, { start: '13:30', end: '17:30' }] } });
  assert.deepEqual(configured.intervals, [{ start: '08:30', end: '12:00' }, { start: '13:30', end: '17:30' }]);
  assert.equal(configured.hoursPerDay, 7.5, '3.5 + 4 = 7.5 小时');
  assert.equal(getAttendancePolicy({ settings: { attendanceWorkPeriods: [] } }).intervals.length, 2, '空数组按未配置处理，回落默认');
});
