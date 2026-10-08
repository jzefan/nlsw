/**
 * 批量福利的节假日清单。
 *
 * 用固定列表而不是从工作日历推：工作日历是「哪几天放假」，而财务要的是「按节日名记账」
 * （国庆发一次、中秋再发一次），同一个节日名在一个月里只该有一条。两个口径不同源，
 * 混用会导致某年日历没数据时福利下拉框直接空掉，财务录不进去。
 *
 * 「其他」用于不在清单里的节日（公司年会、开业纪念日等），由财务自填名称。
 */
const WELFARE_HOLIDAY_KEYS = Object.freeze(['new_year', 'spring_festival', 'qingming', 'labour_day', 'dragon_boat', 'mid_autumn', 'national_day']);
const OTHER_HOLIDAY_KEY = 'other';

/** 界面展示顺序即此顺序，元旦在最前、国庆在最后。 */
const WELFARE_HOLIDAY_LABELS = Object.freeze({
  new_year: '元旦',
  spring_festival: '春节',
  qingming: '清明',
  labour_day: '劳动节',
  dragon_boat: '端午',
  mid_autumn: '中秋',
  national_day: '国庆节',
  [OTHER_HOLIDAY_KEY]: '其他',
});

const WELFARE_HOLIDAY_OPTIONS = Object.freeze(
  [...WELFARE_HOLIDAY_KEYS, OTHER_HOLIDAY_KEY].map(key => ({ key, label: WELFARE_HOLIDAY_LABELS[key] })),
);

const WELFARE_HOLIDAY_MAX_AMOUNT_CENTS = 10_000_000_000;

/**
 * 校验一次「按节日记一笔福利」的提交。
 * - 金额是整数分且 ≥ 0（0 合法：表示这个节日不发了，把旧值清掉）。
 * - 选「其他」时必须自填名称，名称去空白后限长 20 字。
 * @returns {{ok: true, entry: {holiday: string, holidayLabel: string, amountCents: number}} | {ok: false, error: string}}
 */
function validateWelfareEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '福利录入内容无效' };
  const holiday = String(input.holiday || '');
  const amountCents = input.amountCents;
  if (!WELFARE_HOLIDAY_LABELS[holiday]) return { ok: false, error: '请选择有效的节假日' };
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > WELFARE_HOLIDAY_MAX_AMOUNT_CENTS) {
    return { ok: false, error: '福利金额必须是 0 至 1 亿元之间的整数分金额' };
  }
  let holidayLabel = WELFARE_HOLIDAY_LABELS[holiday];
  if (holiday === OTHER_HOLIDAY_KEY) {
    const custom = String(input.holidayLabel || '').replace(/\s+/g, ' ').trim();
    if (!custom) return { ok: false, error: '选择「其他」时请填写节日名称' };
    if (custom.length > 20) return { ok: false, error: '节日名称最多 20 个字' };
    holidayLabel = custom;
  }
  return { ok: true, entry: { holiday, holidayLabel, amountCents } };
}

/**
 * 把一次录入并进已有的节日福利明细：**同一个 key 覆盖，不累加**。
 * 财务的意图是「国庆发 300」，改口变成 500 时期望是 500 而不是 800。
 * 「其他」按自填名称归一：同名视为同一笔，不同名可以各记一笔。
 * @param {Array<{holiday: string, holidayLabel: string, amountCents: number}>} existing
 * @returns {{items: Array, replaced: boolean, previousAmountCents: number}}
 */
function applyWelfareEntry(existing, entry) {
  const list = Array.isArray(existing) ? existing : [];
  const match = entry.holiday === OTHER_HOLIDAY_KEY
    ? item => item?.holiday === OTHER_HOLIDAY_KEY && item?.holidayLabel === entry.holidayLabel
    : item => item?.holiday === entry.holiday;
  const index = list.findIndex(match);
  if (index < 0) return { items: [...list, entry], replaced: false, previousAmountCents: 0 };
  const previousAmountCents = list[index].amountCents || 0;
  const items = [...list];
  items[index] = entry;
  return { items, replaced: true, previousAmountCents };
}

/** 某人的节日福利合计，写进 components.welfareCents 的值。 */
function sumWelfareItems(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + (item?.amountCents || 0), 0);
}

module.exports = {
  WELFARE_HOLIDAY_OPTIONS,
  WELFARE_HOLIDAY_LABELS,
  OTHER_HOLIDAY_KEY,
  validateWelfareEntry,
  applyWelfareEntry,
  sumWelfareItems,
};
