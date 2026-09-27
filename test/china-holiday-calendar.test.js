const test = require('node:test');
const assert = require('node:assert/strict');
const HolidayCalendar = require('../models/HolidayCalendar');
const { parseHolidayCn, parseJiejiariapi, fetchChinaHolidaySchedule } = require('../utils/china-holiday-source');
const {
  chinaAttendanceCalendarMeta,
  ensureChinaAttendanceCalendar,
  getChinaAttendanceCalendar,
  getChinaAttendanceCalendarYears,
  hasChinaAttendanceCalendar,
  loadChinaAttendanceCalendar,
} = require('../utils/china-attendance-calendar');

/** 每个用例用不同的年度，避免注册表在同一个进程里互相污染。 */

function holidayCnBody(year, days) {
  return { year, papers: [`https://www.gov.cn/zhengce/zhengceku/${year}/notice.htm`], days };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push(url);
    return handler(url, options);
  };
  impl.calls = calls;
  return impl;
}

/** mongoose 查询对象是 thenable 链，读库那一步用了 .lean()，mock 必须还原这一层。 */
function leanResult(row) {
  return { lean: async () => row };
}

test('内置表：2026 年开箱可用，且不依赖数据库', async t => {
  t.mock.method(HolidayCalendar, 'findOne', () => { throw new Error('内置年度不应读库'); });
  const days = getChinaAttendanceCalendar(2026);
  assert.equal(days.length, 39);
  assert.equal(days.filter(day => day.type === 'holiday').length, 33);
  assert.equal(days.filter(day => day.type === 'workday').length, 6);
  assert.equal(hasChinaAttendanceCalendar(2026), true);
  assert.ok(getChinaAttendanceCalendarYears().includes(2026));
  assert.equal(chinaAttendanceCalendarMeta(2026).from, 'builtin');
  assert.deepEqual(getChinaAttendanceCalendar(2001), []);
  assert.equal(hasChinaAttendanceCalendar(2001), false);
});

test('holiday-cn 解析：只保留本年度特殊日期，并带出国务院通知链接', () => {
  const parsed = parseHolidayCn(holidayCnBody(2027, [
    { name: '元旦', date: '2027-01-01', isOffDay: true },
    { name: '元旦', date: '2027-01-03', isOffDay: false },
    { name: '元旦', date: '2026-01-01', isOffDay: true }, // 上一年度，丢弃
    { name: '无关键', date: '2027-02-30', isOffDay: true }, // 非法日期，丢弃
    { name: '重复项', date: '2027-01-01', isOffDay: false }, // 同日重复，保留先出现的一条
  ]), 2027);
  assert.equal(parsed.notice, 'https://www.gov.cn/zhengce/zhengceku/2027/notice.htm');
  assert.deepEqual(parsed.days, [
    { date: '2027-01-01', type: 'holiday', name: '元旦' },
    { date: '2027-01-03', type: 'workday', name: '元旦' },
  ]);
  assert.equal(parseHolidayCn({ code: 0, msg: 'ok' }, 2027), null);
  assert.equal(parseHolidayCn('<html>403</html>', 2027), null);
});

test('jiejiariapi 解析：普通工作日不算调休，落在周末的才算', () => {
  const parsed = parseJiejiariapi({
    '2027-01-01': { date: '2027-01-01', name: '元旦', isOffDay: true },
    '2027-01-02': { date: '2027-01-02', name: '北小年', isOffDay: false }, // 周六
    '2027-01-05': { date: '2027-01-05', name: '南小年', isOffDay: false }, // 周二，普通工作日
  }, 2027);
  assert.deepEqual(parsed.days, [
    { date: '2027-01-01', type: 'holiday', name: '元旦' },
    { date: '2027-01-02', type: 'workday', name: '北小年' },
  ]);
  assert.equal(parseJiejiariapi([], 2027), null);
});

test('抓取：前一个数据源失败时用下一个，全部失败/全部没有各回各的状态', async () => {
  const fallbackBody = { '2027-01-01': { date: '2027-01-01', name: '元旦', isOffDay: true } };
  const fallback = fakeFetch(() => jsonResponse(fallbackBody, 200));
  const firstDown = async url => {
    if (url.includes('jsdelivr')) throw new Error('certificate has expired');
    return fallback(url);
  };
  const recovered = await fetchChinaHolidaySchedule(2027, { fetchImpl: firstDown });
  assert.equal(recovered.status, 'ok');
  assert.equal(recovered.source, 'jiejiariapi');
  assert.deepEqual(recovered.days, [{ date: '2027-01-01', type: 'holiday', name: '元旦' }]);

  const allDown = await fetchChinaHolidaySchedule(2027, { fetchImpl: fakeFetch(() => { throw new Error('ENOTFOUND'); }) });
  assert.equal(allDown.status, 'error');
  assert.match(allDown.reason, /ENOTFOUND/);

  const notPublished = await fetchChinaHolidaySchedule(2099, { fetchImpl: fakeFetch(() => jsonResponse({}, 404)) });
  assert.equal(notPublished.status, 'empty');

  const noFetch = await fetchChinaHolidaySchedule(2027, { fetchImpl: null });
  assert.equal(noFetch.status, 'error');
});

test('补齐：库里没有就从线上抓一次并落库，之后改走内存', async t => {
  const body = holidayCnBody(2027, [
    { name: '元旦', date: '2027-01-01', isOffDay: true },
    { name: '元旦', date: '2027-01-04', isOffDay: false }, // 周一，仍按 holiday-cn 原样接受
  ]);
  const fetchImpl = fakeFetch(() => jsonResponse(body, 200));
  t.mock.method(HolidayCalendar, 'findOne', () => leanResult(null));
  const persisted = [];
  t.mock.method(HolidayCalendar, 'updateOne', async (filter, update, options) => { persisted.push({ filter, update, options }); });

  const result = await ensureChinaAttendanceCalendar(2027, { fetchImpl });
  assert.equal(result.status, 'fetched');
  assert.equal(result.source, 'holiday-cn');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0].filter, { year: 2027 });
  assert.equal(persisted[0].options.upsert, true);
  assert.equal(persisted[0].update.$set.days.length, 2);
  assert.equal(persisted[0].update.$set.source, 'holiday-cn');
  assert.ok(persisted[0].update.$set.fetchedAt instanceof Date);

  // 落库后同一年度后续只读内存，不再打外网
  assert.equal(hasChinaAttendanceCalendar(2027), true);
  assert.equal(getChinaAttendanceCalendar(2027).length, 2);
  const again = await ensureChinaAttendanceCalendar(2027, { fetchImpl });
  assert.equal(again.status, 'cached');
  assert.equal(again.from, 'online');
  assert.equal(fetchImpl.calls.length, 1);
});

test('补齐：库里已有就只读库，不再联网', async t => {
  const stored = { year: 2031, days: [{ date: '2031-01-01', type: 'holiday', name: '元旦' }], source: 'holiday-cn', notice: 'https://www.gov.cn/x', fetchedAt: new Date('2026-11-01T00:00:00.000Z') };
  const fetchImpl = fakeFetch(() => { throw new Error('不该联网'); });
  t.mock.method(HolidayCalendar, 'findOne', () => leanResult(stored));

  const result = await ensureChinaAttendanceCalendar(2031, { fetchImpl });
  assert.equal(result.status, 'cached');
  assert.equal(result.from, 'db');
  assert.equal(result.source, 'holiday-cn');
  assert.equal(fetchImpl.calls.length, 0);
  assert.deepEqual(getChinaAttendanceCalendar(2031), [{ date: '2031-01-01', type: 'holiday', name: '元旦' }]);
});

test('补齐：数据源连不上时回 unavailable，既不抛错也不落库', async t => {
  const fetchImpl = fakeFetch(() => { throw new Error('getaddrinfo ENOTFOUND'); });
  t.mock.method(HolidayCalendar, 'findOne', () => leanResult(null));
  const persisted = [];
  t.mock.method(HolidayCalendar, 'updateOne', async (...args) => { persisted.push(args); });

  const result = await ensureChinaAttendanceCalendar(2028, { fetchImpl });
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /ENOTFOUND/);
  assert.equal(persisted.length, 0);
  assert.equal(hasChinaAttendanceCalendar(2028), false);
});

test('补齐：数据源明确说没有该年度时回 unpublished', async t => {
  const fetchImpl = fakeFetch(() => jsonResponse({}, 404));
  t.mock.method(HolidayCalendar, 'findOne', () => leanResult(null));
  const persisted = [];
  t.mock.method(HolidayCalendar, 'updateOne', async (...args) => { persisted.push(args); });

  const result = await ensureChinaAttendanceCalendar(2029, { fetchImpl });
  assert.equal(result.status, 'unpublished');
  assert.equal(persisted.length, 0);
});

test('补齐：读库失败不影响线上抓取', async t => {
  const body = holidayCnBody(2030, [{ name: '元旦', date: '2030-01-01', isOffDay: true }]);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(HolidayCalendar, 'findOne', () => { throw new Error('not connected'); });
  t.mock.method(HolidayCalendar, 'updateOne', async () => {});

  const result = await ensureChinaAttendanceCalendar(2030, { fetchImpl: fakeFetch(() => jsonResponse(body, 200)) });
  assert.equal(result.status, 'fetched');
  assert.equal(getChinaAttendanceCalendar(2030).length, 1);
});

test('启动预热：把库里抓过的年度读进内存', async t => {
  t.mock.method(HolidayCalendar, 'find', () => leanResult([
    { year: 2032, days: [{ date: '2032-01-01', type: 'holiday', name: '元旦' }], source: 'jiejiariapi', fetchedAt: new Date('2026-11-02T00:00:00.000Z') },
    { year: 2033, days: [] }, // 空数据不入内存
  ]));

  const loaded = await loadChinaAttendanceCalendar();
  assert.equal(loaded, 1);
  assert.deepEqual(getChinaAttendanceCalendar(2032), [{ date: '2032-01-01', type: 'holiday', name: '元旦' }]);
  assert.equal(hasChinaAttendanceCalendar(2033), false);
});
