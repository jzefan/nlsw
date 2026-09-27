/**
 * 国务院办公厅公布的年节假日安排（放假日 + 调休上班日）在本进程内的注册表。
 *
 * 两个来源，先内置后线上：
 *   1. YEARLY_SCHEDULES：仓库内置的兜底表，离线也能用，2026 年数据来自国办发明电〔2025〕7号；
 *   2. holiday_calendars 集合：某个年度第一次被需要时从公开数据源抓取一次并落库，之后一直读库。
 *
 * 取值接口保持同步（请假时长、台账、日历渲染都依赖它），所以启动时把库里已有的年度一次性读进内存；
 * 需要新年度时调 `ensureChinaAttendanceCalendar` 补齐。
 */
const HolidayCalendar = require('../models/HolidayCalendar');
const { fetchChinaHolidaySchedule, normalizeDays } = require('./china-holiday-source');

const YEARLY_SCHEDULES = {
  2026: {
    holidays: [
      { start: '2026-01-01', end: '2026-01-03', name: '元旦' },
      { start: '2026-02-15', end: '2026-02-23', name: '春节' },
      { start: '2026-04-04', end: '2026-04-06', name: '清明' },
      { start: '2026-05-01', end: '2026-05-05', name: '劳动节' },
      { start: '2026-06-19', end: '2026-06-21', name: '端午' },
      { start: '2026-09-25', end: '2026-09-27', name: '中秋' },
      { start: '2026-10-01', end: '2026-10-07', name: '国庆节' },
    ],
    workdays: [
      '2026-01-04',
      '2026-02-14',
      '2026-02-28',
      '2026-05-09',
      '2026-09-20',
      '2026-10-10',
    ],
  },
};

/** year -> { days: [{date, type, name?}], source, notice, fetchedAt, from }，days 已按日期排序 */
const registry = new Map();
/** 同一年度并发补齐时共用同一个 Promise，避免同时打多次外网 */
const inFlight = new Map();

function enumerateDates(start, end, callback) {
  const current = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (current <= last) {
    callback(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

/** 把内置表的「假期区间 + 调休日」展开成逐日条目。 */
function expandSchedule(schedule) {
  const days = new Map();
  for (const holiday of schedule.holidays) {
    enumerateDates(holiday.start, holiday.end, date => days.set(date, { date, type: 'holiday', name: holiday.name }));
  }
  for (const date of schedule.workdays) days.set(date, { date, type: 'workday' });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function applyYear(year, days, meta = {}) {
  registry.set(year, { days, ...meta });
}

for (const [year, schedule] of Object.entries(YEARLY_SCHEDULES)) {
  applyYear(Number(year), expandSchedule(schedule), { from: 'builtin', source: 'builtin' });
}

function getChinaAttendanceCalendar(year) {
  return registry.get(year)?.days ?? [];
}

function hasChinaAttendanceCalendar(year) {
  return registry.has(year);
}

function getChinaAttendanceCalendarYears() {
  return [...registry.keys()].sort((a, b) => a - b);
}

/** 某个年度安排的来源信息，用于告诉界面「这次是读库还是刚抓的」。 */
function chinaAttendanceCalendarMeta(year) {
  const entry = registry.get(year);
  if (!entry) return null;
  return { from: entry.from, source: entry.source || '', notice: entry.notice || '', fetchedAt: entry.fetchedAt ?? null };
}

async function readStoredYear(year) {
  try {
    const row = await HolidayCalendar.findOne({ year }).lean();
    // 落库的数据同样过一遍校验，避免历史坏数据把日历带偏
    const days = normalizeDays(row?.days, year);
    if (!days.length) return null;
    return { days, source: row.source || '', notice: row.notice || '', fetchedAt: row.fetchedAt ?? null };
  } catch (error) {
    console.warn(`读取 ${year} 年国务院安排缓存失败：${error?.message || error}`);
    return null;
  }
}

async function persistYear(year, result) {
  try {
    await HolidayCalendar.updateOne(
      { year },
      { $set: { days: result.days, source: result.source, notice: result.notice, fetchedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    // 存库失败不影响本次响应，下次访问会再试
    console.warn(`保存 ${year} 年国务院安排失败：${error?.message || error}`);
    return false;
  }
}

/**
 * 确保某个年度的国务院安排在注册表里：已经有就直接返回，否则先查库，库里没有才从线上抓一次并落库。
 * 抓取失败只回状态，不抛异常，调用方仍能返回其余日历数据。
 * @returns {Promise<{status: 'cached'|'fetched'|'unpublished'|'unavailable', source?: string, notice?: string}>}
 *   unpublished 表示数据源明确答复「该年度还没有」；unavailable 表示所有数据源都没答复（网络问题）。
 */
async function ensureChinaAttendanceCalendar(year, options = {}) {
  if (!Number.isInteger(year)) return { status: 'unpublished' };
  if (registry.has(year)) return { status: 'cached', ...chinaAttendanceCalendarMeta(year) };
  if (inFlight.has(year)) return inFlight.get(year);

  const task = (async () => {
    const stored = await readStoredYear(year);
    if (stored) {
      applyYear(year, stored.days, { ...stored, from: 'db' });
      return { status: 'cached', ...chinaAttendanceCalendarMeta(year) };
    }
    const result = await fetchChinaHolidaySchedule(year, options);
    if (result.status === 'ok') {
      applyYear(year, result.days, { source: result.source, notice: result.notice, fetchedAt: new Date(), from: 'online' });
      await persistYear(year, result);
      return { status: 'fetched', ...chinaAttendanceCalendarMeta(year) };
    }
    return result.status === 'empty' ? { status: 'unpublished' } : { status: 'unavailable', reason: result.reason };
  })().finally(() => inFlight.delete(year));

  inFlight.set(year, task);
  return task;
}

/** 启动预热：把库里已抓过的年度读进内存，离线部署也不会因此丢数据。 */
async function loadChinaAttendanceCalendar() {
  const rows = await HolidayCalendar.find({ 'days.0': { $exists: true } }).lean();
  let loaded = 0;
  for (const row of rows) {
    const days = normalizeDays(row?.days, row?.year);
    if (!Number.isInteger(row?.year) || !days.length) continue;
    applyYear(row.year, days, { source: row.source || '', notice: row.notice || '', fetchedAt: row.fetchedAt ?? null, from: 'db' });
    loaded += 1;
  }
  return loaded;
}

module.exports = {
  getChinaAttendanceCalendar,
  getChinaAttendanceCalendarYears,
  hasChinaAttendanceCalendar,
  chinaAttendanceCalendarMeta,
  ensureChinaAttendanceCalendar,
  loadChinaAttendanceCalendar,
};
