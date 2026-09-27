/**
 * 从公开数据源抓取国务院办公厅公布的年节假日安排。
 *
 * 每个源都只列「放假」和「调休上班」两类特殊日期，与工作日历的 defaultDays 一一对应；
 * 源之间按顺序尝试，任一成功即返回（前面失效不影响后面）。
 * 抓不到时返回明确的状态，由调用方决定怎么提示，不静默当成空数组。
 */

const SOURCE_TIMEOUT_MS = 3500; // 单个源的超时
const OVERALL_DEADLINE_MS = 6000; // 所有源合计的截止时间，避免一次请求把页面卡太久
const USER_AGENT = 'nlsw-saas-attendance-calendar/1.0';

function isWeekendDate(date) {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * 归一化各源的输出：只保留本年度、日期合法、类型可识别的条目，并按日期去重、排序。
 */
function normalizeDays(raw, year) {
  const byDate = new Map();
  for (const item of Array.isArray(raw) ? raw : []) {
    const date = typeof item?.date === 'string' ? item.date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year) continue;
    const check = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== date) continue;
    if (!['holiday', 'workday'].includes(item.type) || byDate.has(date)) continue;
    byDate.set(date, { date, type: item.type, name: typeof item.name === 'string' ? item.name : '' });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * NateScarlet/holiday-cn：按年一份 JSON，只列特殊日期，并在 papers 里给出国务院通知原文。
 * 形状无法识别时返回 null，交给下一个源。
 */
function parseHolidayCn(body, year) {
  if (!body || !Array.isArray(body.days)) return null;
  const days = normalizeDays(body.days.map(item => ({
    date: item?.date,
    type: item?.isOffDay === true ? 'holiday' : item?.isOffDay === false ? 'workday' : '',
    name: item?.name
  })), year);
  const notice = Array.isArray(body.papers) ? (body.papers.find(item => typeof item === 'string') || '') : '';
  return { days, notice };
}

/**
 * jiejiariapi：按日期为键的对象，isOffDay=false 的条目里既有「调休上班」也有普通工作日
 * （如「北小年」），只有落在周末的才是调休，其余按普通工作日丢弃。
 */
function parseJiejiariapi(body, year) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = [];
  for (const item of Object.values(body)) {
    const date = typeof item?.date === 'string' ? item.date : '';
    if (item?.isOffDay === true) raw.push({ date, type: 'holiday', name: item?.name });
    else if (item?.isOffDay === false && isWeekendDate(date)) raw.push({ date, type: 'workday', name: item?.name });
  }
  return { days: normalizeDays(raw, year), notice: '' };
}

const SOURCES = [
  {
    name: 'holiday-cn',
    url: year => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    parse: parseHolidayCn
  },
  {
    name: 'jiejiariapi',
    url: year => `https://api.jiejiariapi.com/v1/holidays/${year}`,
    parse: parseJiejiariapi
  }
];

async function requestSource(source, year, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(source.url(year), {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT }
    });
    // 404 说明该年度这份数据还不存在，是「没有」而不是「失败」，交给下一个源并记录「已应答」
    if (response.status === 404) return { answered: true };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = source.parse(await response.json(), year);
    if (!parsed) throw new Error('响应格式无法识别');
    return { answered: true, days: parsed.days, notice: parsed.notice };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取某个年度的国务院安排。
 * @returns {Promise<
 *   { status: 'ok', days: Array<{date: string, type: 'holiday'|'workday', name: string}>, source: string, notice: string }
 *   | { status: 'empty' }
 *   | { status: 'error', reason: string }>}
 *   ok：至少一个源给出了有效安排；empty：所有源都答复了但没有该年度数据（通常尚未公布）；
 *   error：所有源都没答复（网络/超时）。
 */
async function fetchChinaHolidaySchedule(year, { fetchImpl = globalThis.fetch, timeoutMs = SOURCE_TIMEOUT_MS, deadlineMs = OVERALL_DEADLINE_MS } = {}) {
  if (typeof fetchImpl !== 'function') return { status: 'error', reason: '当前运行环境没有可用的 fetch' };
  const deadline = Date.now() + deadlineMs;
  let answered = false;
  const failures = [];
  for (const source of SOURCES) {
    const remaining = Math.min(timeoutMs, deadline - Date.now());
    if (remaining <= 0) {
      failures.push('整体超时');
      break;
    }
    try {
      const result = await requestSource(source, year, fetchImpl, remaining);
      if (result.answered) answered = true;
      if (result.days?.length) return { status: 'ok', days: result.days, source: source.name, notice: result.notice || '' };
    } catch (error) {
      failures.push(`${source.name}: ${error?.message || error}`);
    }
  }
  if (answered) return { status: 'empty' };
  return { status: 'error', reason: failures.join('; ') || '没有可用的数据源' };
}

module.exports = { fetchChinaHolidaySchedule, normalizeDays, parseHolidayCn, parseJiejiariapi };
