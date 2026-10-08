const mongoose = require('mongoose');
const User = require('../../models/User');
const PayrollStatement = require('../../models/PayrollStatement');
const PayrollStandard = require('../../models/PayrollStandard');
const AttendanceMonthLedger = require('../../models/AttendanceMonthLedger');
const { _coordination: monthCoordination, getMonthlyAttendanceSummary, getPayrollAttendanceSummary } = require('./attendance-ledger');
const { hasLinkedEmployee } = require('../../utils/attendance-permissions');
const {
  validatePayrollComponents, validatePayrollStandard, computeStandardContributions,
  normalizeContributionScheme, contributionSchemeTotals, validateContributionScheme, withContributionSchemeRates,
  COMPONENT_KEYS, STANDARD_MONEY_KEYS, STANDARD_BASE_KEYS, STANDARD_RATE_KEYS,
} = require('../../utils/payroll-calculations');
const { WELFARE_HOLIDAY_OPTIONS, WELFARE_HOLIDAY_LABELS, validateWelfareEntry, applyWelfareEntry, sumWelfareItems } = require('../../utils/payroll-welfare');
const { filterRealEmployees, isTestAccount } = require('../../utils/test-account');
const { buildPersonLabels } = require('../../utils/person-label');
const { isChairmanTitle, isGeneralManagerTitle } = require('../../utils/user-title');

const MAX_AMOUNT_CENTS = 10_000_000_000;
const fail = (res, status, message) => res.status(status).json({ ok: false, error: message });

function parseMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return { value, year, month, start: Date.UTC(year, month - 1, 1) - 8 * 3600000, end: Date.UTC(year, month, 1) - 8 * 3600000 };
}

function parsePeriod(period, value) {
  if (period === 'month') return parseMonth(value);
  if (period !== 'year' || typeof value !== 'string' || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (year < 2000 || year > 2200) return null;
  return { value, year, start: Date.UTC(year, 0, 1) - 8 * 3600000, end: Date.UTC(year + 1, 0, 1) - 8 * 3600000 };
}

// 未设置 status 的历史账号视为在职；密码是否改过与薪资权限无关
function isFinance(user) {
  return user?.status !== 'disabled' && Array.isArray(user.payrollRoles) && user.payrollRoles.includes('finance');
}

/**
 * 工资条相关列表的公共查询条件：只列本租户在职员工，且**排除平台管理员账号**。
 * 平台账号（role: 'platform'）是SaaS 运营方的人，不是本公司员工，不该出现在工资表里。
 * 与考勤台账的 `getScopedUsers` 口径一致（那边同样按 role 排除 platform）。
 */
function payrollEmployeeQuery(tenantId) {
  return { tenantId, status: { $ne: 'disabled' }, role: { $ne: 'platform' } };
}

// 总经理与董事长可只读查看全员工资：职务可能是代码（gm/ceo）或老账号的中文写法（总经理/董事长）。
// 董事长不占用唯一的总经理薪资角色，且两人都不能录入或发布。
function isActiveLeader(user) {
  return user?.status !== 'disabled'
    && (isGeneralManagerTitle(user?.title) || isChairmanTitle(user?.title));
}

function isPayrollReader(user) {
  return isFinance(user)
    || (user?.status !== 'disabled' && Array.isArray(user.payrollRoles) && user.payrollRoles.includes('general_manager'))
    || isActiveLeader(user);
}

function employeeSnapshot(user) {
  return {
    employeeNo: user.employeeNo || '',
    phone: user.phone || user.profile?.phone || '',
    name: user.profile?.name || user.userid || '',
    department: user.department || '',
  };
}

function asObject(value) {
  return value?.toObject ? value.toObject() : value;
}

/** 薪资标准序列化：金额/比例全量补齐，并附上算好的社保公积金金额，前端只用一份口径。 */
function serializeStandard(standard, scheme) {
  const data = asObject(standard);
  if (!data) return null;
  const result = {};
  for (const key of [...STANDARD_MONEY_KEYS, ...STANDARD_BASE_KEYS, ...STANDARD_RATE_KEYS]) result[key] = data[key] ?? 0;
  result.version = data.version || 0;
  result.updatedAt = data.updatedAt || null;
  // 社保比例以租户五险方案为准（库里可能还是历史值），对齐后再算金额，保证回给前端的数据自洽
  Object.assign(result, withContributionSchemeRates(result, scheme));
  result.contributions = computeStandardContributions(result, scheme);
  return result;
}

/**
 * 每月草稿底稿：薪资标准里能自动带出的项目（固定工资项 + 按五险方案算出的社保公积金），
 * 其余项目（绩效、补贴、考勤扣款、个税）按 0 起，由财务录入时补充。
 * 只用于给「未录入」的月份展示预估金额，不落库。
 */
function standardDraft(standard, scheme) {
  if (!standard) return null;
  const contributions = standard.contributions || computeStandardContributions(standard, scheme);
  const components = Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0]));
  components.basicPayCents = standard.basicPayCents;
  components.positionPayCents = standard.positionPayCents;
  components.seniorityPayCents = standard.seniorityPayCents;
  components.attendanceBonusCents = standard.attendanceBonusCents;
  components.employerSocialInsuranceCents = contributions.employerSocialInsuranceCents;
  components.employeeSocialInsuranceCents = contributions.employeeSocialInsuranceCents;
  components.employerHousingFundCents = contributions.employerHousingFundCents;
  components.employeeHousingFundCents = contributions.employeeHousingFundCents;
  const validated = validatePayrollComponents(components);
  return validated.ok ? { components: validated.components, totals: validated.totals } : null;
}

function latestPublished(statement) {
  const revision = statement?.currentPublishedRevision;
  if (!Number.isInteger(revision)) return null;
  return (statement.revisions || []).find(item => item.revision === revision) || null;
}

/** 工资条的当前有效金额：有草稿用草稿（未发布的最新一版），否则用最新的已发布版本。 */
function effectiveComponents(statement) {
  if (statement?.draft?.components) return { components: statement.draft.components, source: 'draft' };
  const published = latestPublished(statement);
  if (published?.components) return { components: published.components, source: 'published' };
  return null;
}

/**
 * 节日福利明细的下发口径：明细的金额合计必须等于当前有效金额里的 welfareCents。
 * 旧工资条（功能上线前录的）没有明细，只有合计 —— 这时补一条占位明细，
 * 让界面与「批量福利」的覆盖逻辑都还能正常工作，而不是显示成 0。
 */
function normalizeWelfareItems(items, components) {
  const list = (Array.isArray(items) ? items : [])
    .filter(item => item && WELFARE_HOLIDAY_LABELS[item.holiday] !== undefined && Number.isSafeInteger(item.amountCents) && item.amountCents >= 0)
    .map(item => ({ holiday: item.holiday, holidayLabel: item.holidayLabel || WELFARE_HOLIDAY_LABELS[item.holiday], amountCents: item.amountCents }));
  const total = components?.welfareCents || 0;
  if (!list.length) return total > 0 ? [{ holiday: 'other', holidayLabel: '福利（历史录入）', amountCents: total }] : [];
  // 明细与合计对不上（手工改过 welfareCents、或历史脏数据）时以合计为准补齐差额，
  // 不让界面显示一个和实发金额不一致的合计。
  const diff = total - sumWelfareItems(list);
  if (diff === 0) return list;
  if (diff > 0) return [...list, { holiday: 'other', holidayLabel: '福利（手工调整）', amountCents: diff }];
  return list;
}

function paymentSums(payments = []) {
  let paid = 0;
  let refunded = 0;
  for (const payment of payments) {
    if (payment.direction === 'payment') paid += payment.amountCents;
    else if (payment.direction === 'refund') refunded += payment.amountCents;
  }
  return { paidCents: paid, refundedCents: refunded, netPaidCents: paid - refunded };
}

function paymentStatus(statementStatus, netPayCents, netPaidCents) {
  if (statementStatus !== 'published') return 'not_publish';
  if (netPaidCents >= netPayCents) return 'paid';
  return netPaidCents > 0 ? 'partial' : 'unpaid';
}

function serializePayment(payment, actorNames = new Map()) {
  const actorId = payment.createdBy?._id || payment.createdBy;
  return {
    direction: payment.direction,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
    proofUrl: payment.proofUrl || '',
    note: payment.note || '',
    statementRevision: payment.statementRevision,
    createdAt: payment.createdAt,
    createdBy: { id: actorId, name: actorNames.get(String(actorId)) || '' },
  };
}

function isSafeProofUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  const candidate = value.trim();
  if (!candidate) return true;
  // A single-rooted path stays on the current origin. Reject protocol-relative
  // paths and backslashes because browsers normalize them as cross-origin URLs.
  if (candidate.startsWith('/')) return !candidate.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(candidate);
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch (_error) {
    return false;
  }
}

async function serializeStatement(statement, actorNames) {
  const data = asObject(statement);
  const published = latestPublished(data);
  const sums = paymentSums(data.payments);
  let statementStatus = 'missing';
  let components = null;
  let totals = null;
  if (data.draft?.components) {
    statementStatus = 'draft';
    components = data.draft.components;
    totals = data.draft.totals;
  } else if (published) {
    statementStatus = 'published';
    components = published.components;
    totals = published.totals;
  } else if ((data.events || []).some(event => event.action === 'withdrawn')) {
    statementStatus = 'withdrawn';
  }
  const publishedNetPayCents = published?.totals?.netPayCents ?? 0;
  // 节日福利明细跟着「当前有效金额」走：有草稿用草稿的明细，否则用当前发布版的。
  // 合计与 components.welfareCents 始终一致，旧数据没有明细时按合计兜底成一条。
  const welfareItems = normalizeWelfareItems(data.draft?.components ? data.draft.welfareItems : published?.welfareItems, components);
  // 只有「当前有效发布版」是强制发出来的才打标记；撤回后重新正常发布，标记自然消失。
  const forced = published
    ? (data.events || []).find(event => event.action === 'forced_publish' && event.revision === published.revision) || null
    : null;
  return {
    employeeId: data.employeeId,
    ...data.employee,
    revision: published?.revision || 0,
    statementStatus,
    paymentStatus: paymentStatus(published ? 'published' : statementStatus, publishedNetPayCents, sums.netPaidCents),
    components,
    totals,
    welfareItems,
    publishedComponents: published?.components || null,
    publishedTotals: published?.totals || null,
    paidCents: sums.netPaidCents,
    remainingCents: Math.max(0, publishedNetPayCents - sums.netPaidCents),
    version: data.version || 0,
    publishedAt: published?.publishedAt || null,
    forcedPublish: forced ? { revision: forced.revision, at: forced.at, ledgerStatus: forced.ledgerStatus || 'open' } : null,
    paymentHistory: (data.payments || []).map(item => serializePayment(item, actorNames)),
    revisionHistory: (data.revisions || []).map(item => ({ revision: item.revision, publishedAt: item.publishedAt, publishedBy: item.publishedBy })),
  };
}

async function getActorNames(statements) {
  const ids = [...new Set(statements.flatMap(item => (item.payments || []).map(payment => String(payment.createdBy))).filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select('_id profile.name userid').lean();
  return new Map(users.map(user => [String(user._id), user.profile?.name || user.userid || '']));
}

function getNetPaid(statement) {
  return paymentSums(statement?.payments).netPaidCents;
}

async function requireFinance(req, res) {
  if (!req.user || !isFinance(req.user)) {
    fail(res, 403, '仅在职财务人员可执行工资管理');
    return false;
  }
  const tenantId = req.user.tenantId?._id || req.user.tenantId;
  if (String(tenantId || '') !== String(req.tenantId || '')) {
    fail(res, 403, '薪资账号租户信息不匹配');
    return false;
  }
  return true;
}

async function requirePayrollReader(req, res) {
  if (!req.user || !isPayrollReader(req.user)) {
    fail(res, 403, '仅财务、总经理或董事长可查看全员工资');
    return false;
  }
  const tenantId = req.user.tenantId?._id || req.user.tenantId;
  if (String(tenantId || '') !== String(req.tenantId || '')) {
    fail(res, 403, '薪资账号租户信息不匹配');
    return false;
  }
  return true;
}

async function loadEmployee(employeeId, tenantId) {
  if (!mongoose.Types.ObjectId.isValid(employeeId)) return null;
  const user = await User.findOne({ _id: employeeId, tenantId, status: { $ne: 'disabled' } })
    .select('employeeNo phone profile.phone profile.name userid department status')
    .lean();
  if (!user) return null;
  return user;
}

/** 批量导入一次要取几十号人的快照，合并成一次查询，避免逐行查库。 */
async function loadEmployees(employeeIds, tenantId) {
  const ids = [...new Set((employeeIds || []).map(String).filter(id => mongoose.Types.ObjectId.isValid(id)))];
  if (!ids.length) return new Map();
  const users = await User.find({ ...payrollEmployeeQuery(tenantId), _id: { $in: ids } })
    .select('employeeNo phone profile.phone profile.name userid role department status')
    .lean();
  // 测试账号不给工资条：即使前端把它传了进来，这里也当「不存在」，不写库。
  return new Map(filterRealEmployees(users).map(user => [String(user._id), user]));
}

function emptyMonthlyRow(user) {
  return {
    employeeId: user._id,
    ...employeeSnapshot(user),
    revision: 0,
    statementStatus: 'missing',
    paymentStatus: 'not_publish',
    components: null,
    totals: null,
    paidCents: 0,
    remainingCents: 0,
    version: 0,
    publishedAt: null,
    paymentHistory: [],
    revisionHistory: [],
  };
}

/**
 * 个税「累计预扣预缴」所需的往月累计基数（本年度 1 月至本月）。
 * - 每月金额取该月的「有效版本」：有草稿用草稿，否则用最新已发布版本，与工资表展示口径一致；
 *   已撤回且没有草稿的月份没有有效金额，不计入累计。
 * - 累计收入按「合计应发（不含社保公积金）」口径，即收入合计减去病假/事假/旷工扣款；
 *   累计专项扣除 = 个人社保 + 个人公积金。
 * - 本月金额不在这里累计：本月由录入弹窗用当前输入值参与计算，这里只用它判断任职月数。
 * - 计税月数（「当年截至本月在本单位的任职受雇月份数」）= 从本年度首个有工资条的月份连续数到本月；
 *   本年度还没有任何往月工资条时按 1 个月计（此时累计收入也只有本月，口径自洽）。
 * 税额规则不在这里：前端 front_end/src/utils/income-tax.ts 按预扣率表算出本月应扣税额。
 */
async function collectTaxBasis(tenantId, employeeId, month) {
  const statements = await PayrollStatement.find({
    tenantId,
    employeeId,
    month: { $gte: `${month.year}-01`, $lte: month.value },
  }).lean();
  // YYYY-MM 定长，字典序即时间序
  let firstMonth = month.value;
  const months = [];
  let cumulativeIncomeCents = 0;
  let cumulativeSpecialDeductionCents = 0;
  let cumulativeWithheldTaxCents = 0;
  for (const statement of statements) {
    const effective = effectiveComponents(statement);
    if (!effective) continue;
    if (statement.month < firstMonth) firstMonth = statement.month;
    if (statement.month === month.value) continue;
    const validated = validatePayrollComponents(effective.components);
    if (!validated.ok) continue;
    const { components, totals } = validated;
    const incomeCents = totals.payableBeforePersonalDeductionsCents;
    const specialDeductionCents = components.employeeSocialInsuranceCents + components.employeeHousingFundCents;
    cumulativeIncomeCents += incomeCents;
    cumulativeSpecialDeductionCents += specialDeductionCents;
    cumulativeWithheldTaxCents += components.incomeTaxCents;
    months.push({ month: statement.month, source: effective.source, incomeCents, specialDeductionCents, incomeTaxCents: components.incomeTaxCents });
  }
  months.sort((a, b) => a.month.localeCompare(b.month));
  const firstIndex = Number(firstMonth.slice(5));
  return {
    month: month.value,
    serviceMonths: Math.max(1, month.month - firstIndex + 1),
    cumulativeIncomeCents,
    cumulativeSpecialDeductionCents,
    cumulativeWithheldTaxCents,
    months,
  };
}

/** 给工资表每行补上该员工的薪资标准与当月考勤时长；这两项失败都不应影响工资表本身的读取。 */
async function attachStandardAndAttendance(rows, tenantId, month, scheme) {
  const [standards, attendance] = await Promise.all([
    PayrollStandard.find({ tenantId }).lean().catch(error => {
      console.error('payroll standards load failed:', error);
      return [];
    }),
    getMonthlyAttendanceSummary(tenantId, month).catch(error => {
      console.error('payroll attendance summary failed:', error);
      return {};
    }),
  ]);
  const standardByEmployee = new Map(standards.map(item => [String(item.employeeId), item]));
  for (const row of rows) {
    row.standard = serializeStandard(standardByEmployee.get(String(row.employeeId)), scheme);
    row.attendance = attendance[String(row.employeeId)] || null;
    // 工资标准基本不变，所以没录入的月份直接按标准给出底稿金额；有工资条的行以工资条为准
    row.standardDraft = row.statementStatus === 'missing' ? standardDraft(row.standard, scheme) : null;
  }
}

exports.listStatements = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    const month = parseMonth(req.query.month);
    if (!month) return fail(res, 400, '月份格式应为 YYYY-MM');
    const [allEmployees, statements, ledgerStatus] = await Promise.all([
      User.find(payrollEmployeeQuery(req.tenantId))
        .select('employeeNo phone profile.name profile.phone userid role department status').sort({ department: 1, employeeNo: 1 }).lean(),
      PayrollStatement.find({ tenantId: req.tenantId, month: month.value }).lean(),
      monthLedgerStatus(req.tenantId, month.value),
    ]);
    // 测试账号不进入工资表：既不列新行，下面补历史行时也要挡掉。
    const employees = filterRealEmployees(allEmployees);
    const testAccountIds = new Set(allEmployees.filter(user => !employees.includes(user)).map(user => String(user._id)));
    const byEmployee = new Map(statements.map(statement => [String(statement.employeeId), statement]));
    const employeeById = new Map(employees.map(user => [String(user._id), user]));
    const actorNames = await getActorNames(statements);
    const rows = [];
    for (const user of employees) {
      const statement = byEmployee.get(String(user._id));
      rows.push(statement ? await serializeStatement(statement, actorNames) : emptyMonthlyRow(user));
    }
    // Keep previously paid/history rows visible after an employee is deactivated.
    for (const statement of statements) {
      if (testAccountIds.has(String(statement.employeeId))) continue;
      if (employees.some(user => String(user._id) === String(statement.employeeId))) continue;
      rows.push(await serializeStatement(statement, actorNames));
    }
    const displayNames = buildPersonLabels(rows.map(row => {
      const employee = employeeById.get(String(row.employeeId));
      return {
        userId: row.employeeId,
        userid: employee?.userid || '',
        name: row.name,
        employeeNo: row.employeeNo,
        phone: employee?.phone || employee?.profile?.phone || row.phone || '',
        department: row.department,
      };
    }));
    for (const row of rows) row.displayName = displayNames.get(String(row.employeeId)) || row.name;
    await attachStandardAndAttendance(rows, req.tenantId, month, req.tenant?.settings?.payrollContributionScheme);
    rows.sort((a, b) => (a.department || '').localeCompare(b.department || '') || (a.employeeNo || '').localeCompare(b.employeeNo || ''));
    const totals = rows.reduce((sum, row) => {
      if (row.statementStatus === 'draft') sum.draftCount++;
      const publishedTotals = row.publishedTotals || (row.statementStatus === 'published' ? row.totals : null);
      if (!publishedTotals) return sum;
      for (const key of ['incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents']) sum[key] += publishedTotals[key] || 0;
      sum.paidCents += row.paidCents;
      sum.remainingCents += row.remainingCents;
      sum.publishedCount++;
      return sum;
    }, { incomeSubtotalCents: 0, employerContributionCents: 0, totalCompensationCents: 0, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 0, netPayCents: 0, paidCents: 0, remainingCents: 0, publishedCount: 0, draftCount: 0 });
    return res.json({ ok: true, data: { month: month.value, ledgerStatus, rows, totals } });
  } catch (error) {
    console.error('payroll listStatements failed:', error);
    return fail(res, 500, '读取工资表失败');
  }
};

/**
 * 某员工某月的个税计税基数。只读，财务/总经理/董事长都能取（与工资表读取权限一致）。
 * 员工已离职也要能取到，因为历史月份的工资表仍可查看与修订，所以这里不校验在职状态。
 */
exports.getTaxBasis = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    const month = parseMonth(req.params.month);
    if (!month) return fail(res, 400, '月份格式应为 YYYY-MM');
    if (!mongoose.Types.ObjectId.isValid(req.params.employeeId)) return fail(res, 400, '员工无效');
    const employeeId = new mongoose.Types.ObjectId(req.params.employeeId);
    return res.json({ ok: true, data: await collectTaxBasis(req.tenantId, employeeId, month) });
  } catch (error) {
    console.error('payroll getTaxBasis failed:', error);
    return fail(res, 500, '读取个税计税基数失败');
  }
};

exports.listStandards = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    const allEmployees = await User.find(payrollEmployeeQuery(req.tenantId))
      .select('employeeNo phone profile.name profile.phone userid role department status').sort({ department: 1, employeeNo: 1 }).lean();
    // 测试账号不进薪资设置
    const employees = filterRealEmployees(allEmployees);
    const standards = await PayrollStandard.find({ tenantId: req.tenantId }).lean();
    const standardByEmployee = new Map(standards.map(item => [String(item.employeeId), item]));
    const employeeById = new Map(employees.map(user => [String(user._id), user]));
    const scheme = req.tenant?.settings?.payrollContributionScheme;
    const rows = employees.map(user => ({
      employeeId: user._id,
      ...employeeSnapshot(user),
      standard: serializeStandard(standardByEmployee.get(String(user._id)), scheme),
    }));
    const displayNames = buildPersonLabels(rows.map(row => {
      const employee = employeeById.get(String(row.employeeId));
      return {
        userId: row.employeeId,
        userid: employee?.userid || '',
        name: row.name,
        employeeNo: row.employeeNo,
        phone: employee?.phone || employee?.profile?.phone || row.phone || '',
        department: row.department,
      };
    }));
    for (const row of rows) row.displayName = displayNames.get(String(row.employeeId)) || row.name;
    rows.sort((a, b) => (a.department || '').localeCompare(b.department || '') || (a.employeeNo || '').localeCompare(b.employeeNo || ''));
    return res.json({ ok: true, data: { rows } });
  } catch (error) {
    console.error('payroll listStandards failed:', error);
    return fail(res, 500, '读取薪资标准失败');
  }
};

exports.saveStandard = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const employee = await loadEmployee(req.params.employeeId, req.tenantId);
    const version = req.body?.version;
    const scheme = req.tenant?.settings?.payrollContributionScheme;
    const validated = validatePayrollStandard(req.body?.standard, scheme);
    if (!employee || !Number.isInteger(version) || version < 0) return fail(res, 400, '员工或版本无效');
    if (!validated.ok) return fail(res, 400, validated.error);
    const now = new Date();
    const values = { employee: employeeSnapshot(employee), ...validated.standard, updatedBy: req.user._id, updatedAt: now };
    let standard;
    const existing = await PayrollStandard.findOne({ tenantId: req.tenantId, employeeId: employee._id }).select('_id version');
    if (!existing) {
      if (version !== 0) return fail(res, 409, '薪资标准已变化，请刷新后重试');
      try {
        standard = await PayrollStandard.create({ tenantId: req.tenantId, employeeId: employee._id, ...values, version: 1 });
      } catch (error) {
        if (error?.code === 11000) return fail(res, 409, '薪资标准已被其他财务建立，请刷新后重试');
        throw error;
      }
    } else {
      if (existing.version !== version) return fail(res, 409, '薪资标准已被其他财务修改，请刷新后重试');
      standard = await PayrollStandard.findOneAndUpdate({ _id: existing._id, tenantId: req.tenantId, version }, {
        $set: values,
        $inc: { version: 1, __v: 1 },
      }, { new: true, runValidators: true });
      if (!standard) return fail(res, 409, '薪资标准已被其他财务修改，请刷新后重试');
    }
    return res.json({ ok: true, data: serializeStandard(standard, scheme) });
  } catch (error) {
    if (error?.code === 11000 || error?.name === 'VersionError') return fail(res, 409, '薪资标准已被其他财务修改，请刷新后重试');
    console.error('payroll saveStandard failed:', error);
    return fail(res, 500, '保存薪资标准失败');
  }
};

/** 社保五险方案（全公司统一）：薪资读者可读，财务可改。 */
exports.getContributionScheme = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    const scheme = normalizeContributionScheme(req.tenant?.settings?.payrollContributionScheme);
    return res.json({ ok: true, data: { scheme, totals: contributionSchemeTotals(scheme) } });
  } catch (error) {
    console.error('payroll getContributionScheme failed:', error);
    return fail(res, 500, '读取社保方案失败');
  }
};

exports.saveContributionScheme = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const validated = validateContributionScheme(req.body?.scheme);
    if (!validated.ok) return fail(res, 400, validated.error);
    const tenant = req.tenant;
    if (!tenant?.settings) return fail(res, 403, '缺少租户配置');
    tenant.settings.payrollContributionScheme = validated.scheme;
    tenant.markModified('settings.payrollContributionScheme');
    await tenant.save();
    return res.json({ ok: true, data: { scheme: validated.scheme, totals: contributionSchemeTotals(validated.scheme) } });
  } catch (error) {
    if (error?.name === 'VersionError') return fail(res, 409, '社保方案已被其他人更新，请刷新后重试');
    console.error('payroll saveContributionScheme failed:', error);
    return fail(res, 500, '保存社保方案失败');
  }
};

/**
 * 当月考勤台账状态：closed 已结账 / open 已建台账但未结账 / missing 还没建台账。
 * 工资表上的「考勤」列与发布前置条件都读这一个口径。
 */
async function monthLedgerStatus(tenantId, month) {
  const ledger = await AttendanceMonthLedger.findOne({ tenantId, month }).select('status').lean();
  if (!ledger) return 'missing';
  return ledger.status === 'closed' ? 'closed' : 'open';
}

/** 当月考勤必须已结账才能发布工资条；单条发布与批量发布共用这同一条前置条件。 */
async function isMonthLedgerClosed(tenantId, month) {
  return (await monthLedgerStatus(tenantId, month)) === 'closed';
}

/**
 * 发布一份草稿的核心动作：单条 publish 与批量发布共用，避免两处逻辑各写一份后漂移。
 * - 没有草稿、版本不一致、台账未结账都返回 { ok: false, error }，由调用方决定 HTTP 状态码。
 * - 台账检查可关掉：批量发布时已经在抢锁后统一校验过一次，不必逐人再查（此时由传入的 ledgerStatus 兜底）。
 * - force 为 true 时允许在当月考勤未结账时强行发布，并在工资条事件里写一条 forced_publish 留痕。
 * - 用 version 条件做乐观锁，并发写入时后到的一方拿不到文档。
 */
async function publishDraftStatement({ tenantId, employeeId, month, userId, expectedVersion, requireClosedLedger = true, force = false, ledgerStatus }) {
  const statement = await PayrollStatement.findOne({ tenantId, employeeId, month });
  if (!statement || !statement.draft?.components || !statement.draft?.totals) return { ok: false, error: '请先保存完整工资草稿' };
  if (Number.isInteger(expectedVersion) && statement.version !== expectedVersion) return { ok: false, error: '工资条已被其他财务修改，请刷新后重试' };
  const status = ledgerStatus || (requireClosedLedger || force ? await monthLedgerStatus(tenantId, month) : 'closed');
  if (status !== 'closed' && !force) return { ok: false, error: '请先完成当月考勤结账，再发布工资条' };
  const forced = force === true && status !== 'closed';
  const revision = (statement.revisions || []).reduce((max, item) => Math.max(max, item.revision), 0) + 1;
  const publishedAt = new Date();
  const update = {
    $push: { revisions: { revision, employee: statement.employee, components: statement.draft.components, totals: statement.draft.totals, welfareItems: statement.draft.welfareItems || [], publishedBy: userId, publishedAt } },
    $set: { currentPublishedRevision: revision, updatedAt: publishedAt },
    $unset: { draft: 1 },
    $inc: { version: 1, __v: 1 },
  };
  // 未结账强制发布不要求填原因，但必须留下「当时台账是什么状态」的凭据。
  if (forced) update.$push.events = { action: 'forced_publish', revision, actorId: userId, ledgerStatus: status, at: publishedAt };
  const updated = await PayrollStatement.findOneAndUpdate({ _id: statement._id, tenantId, version: statement.version, 'draft.components': { $exists: true } }, update, { new: true, runValidators: true });
  if (!updated) return { ok: false, error: '工资条已被其他财务修改，请刷新后重试' };
  return { ok: true, revision, forced, ledgerStatus: status, statement: updated };
}

exports.saveDraft = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const employee = await loadEmployee(req.params.employeeId, req.tenantId);
    const version = req.body?.version;
    const validated = validatePayrollComponents(req.body?.components);
    if (!month || !employee || !Number.isInteger(version) || version < 0) return fail(res, 400, '月份、员工或版本无效');
    if (!validated.ok) return fail(res, 400, validated.error);
    const now = new Date();
    const existingFull = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId: employee._id, month: month.value })
      .select('draft.components draft.welfareItems currentPublishedRevision');
    const previousItems = existingFull?.draft?.welfareItems || [];
    // 手工改过「福利」金额就说明明细已经不按节日拆了，直接清空；否则原样带过去，
    // 免得「批量福利」刚录的明细在下次保存时被冲掉。
    const itemsMatchAmount = sumWelfareItems(previousItems) === (existingFull?.draft?.components?.welfareCents || 0);
    const values = {
      employee: employeeSnapshot(employee),
      draft: {
        components: validated.components,
        totals: validated.totals,
        welfareItems: itemsMatchAmount ? previousItems : [],
        updatedBy: req.user._id,
        updatedAt: now,
      },
      updatedAt: now,
    };
    let statement;
    const existing = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId: employee._id, month: month.value }).select('_id version currentPublishedRevision');
    // 已发布的工资条：未结账月份允许直接改了再发布（那时的发布本就是过渡版本），
    // 已结账月份必须先撤回——撤回会把旧版留在 revisions 里，改直接覆盖会丢掉这条记录。
    if (existing?.currentPublishedRevision && (await monthLedgerStatus(req.tenantId, month.value)) === 'closed') {
      return fail(res, 409, '当月考勤已结账，已发布的工资条请先撤回再修改');
    }
    if (!existing) {
      if (version !== 0) return fail(res, 409, '工资条已变化，请刷新后重试');
      try {
        statement = await PayrollStatement.create({ tenantId: req.tenantId, employeeId: employee._id, month: month.value, ...values, version: 1 });
      } catch (error) {
        if (error?.code === 11000) return fail(res, 409, '工资条已被其他财务建立，请刷新后重试');
        throw error;
      }
    } else {
      if (existing.version !== version) return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
      statement = await PayrollStatement.findOneAndUpdate({ _id: existing._id, tenantId: req.tenantId, version }, {
        $set: values,
        $inc: { version: 1, __v: 1 },
      }, { new: true, runValidators: true });
      if (!statement) return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
    }
    const actorNames = await getActorNames([asObject(statement)]);
    return res.json({ ok: true, data: await serializeStatement(statement, actorNames) });
  } catch (error) {
    if (error?.code === 11000 || error?.name === 'VersionError') return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
    console.error('payroll saveDraft failed:', error);
    return fail(res, 500, '保存工资草稿失败');
  }
};

exports.publish = async (req, res) => {
  let monthLock;
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const { version, force } = req.body || {};
    if (!month || !mongoose.Types.ObjectId.isValid(req.params.employeeId) || !Number.isInteger(version)) return fail(res, 400, '月份、员工或版本无效');
    monthLock = await monthCoordination.acquireMonthMutationLock(req.tenantId, month.value);
    const result = await publishDraftStatement({ tenantId: req.tenantId, employeeId: req.params.employeeId, month: month.value, userId: req.user._id, expectedVersion: version, force: force === true });
    if (!result.ok) return fail(res, 409, result.error);
    return res.json({ ok: true, data: await serializeStatement(result.statement, new Map()) });
  } catch (error) {
    console.error('payroll publish failed:', error);
    if (error?.status === 409 || error?.name === 'VersionError') return fail(res, 409, error.message || '考勤台账正在处理或工资条已变化，请刷新后重试');
    return fail(res, 500, '发布工资条失败');
  } finally {
    if (monthLock) await monthCoordination.releaseMonthMutationLock(req.tenantId, monthLock).catch(() => {});
  }
};

exports.withdraw = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const { version, reason } = req.body || {};
    if (!month || !Number.isInteger(version) || typeof reason !== 'string' || !reason.trim() || reason.length > 2000) return fail(res, 400, '请填写有效的月份、版本和撤回原因');
    const statement = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId: req.params.employeeId, month: month.value });
    if (!statement || statement.version !== version) return fail(res, 409, '工资条不存在或已被修改');
    const published = latestPublished(statement);
    if (!published) return fail(res, 409, '没有可撤回的已发布工资条');
    // 撤回后仍能基于原金额更正；已有未发布修订稿时保留财务的新输入。
    const validated = validatePayrollComponents(asObject(statement.draft?.components || published.components));
    if (!validated.ok) return fail(res, 409, `工资金额无效，无法生成修订草稿：${validated.error}`);
    const now = new Date();
    const updated = await PayrollStatement.findOneAndUpdate({ _id: statement._id, tenantId: req.tenantId, version, currentPublishedRevision: published.revision }, {
      $push: { events: { action: 'withdrawn', revision: published.revision, actorId: req.user._id, reason: reason.trim(), at: now } },
      $set: {
        currentPublishedRevision: null,
        draft: { components: validated.components, totals: validated.totals, welfareItems: normalizeWelfareItems(published.welfareItems, validated.components), updatedBy: statement.draft?.updatedBy || req.user._id, updatedAt: statement.draft?.updatedAt || now },
        updatedAt: now,
      },
      $inc: { version: 1, __v: 1 },
    }, { new: true, runValidators: true });
    if (!updated) return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
    return res.json({ ok: true, data: await serializeStatement(updated, new Map()) });
  } catch (error) {
    console.error('payroll withdraw failed:', error);
    return fail(res, 500, '撤回工资条失败');
  }
};

exports.addPayment = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const { version, direction, amountCents, paidAt, proofUrl = '', note = '', statementRevision } = req.body || {};
    const date = typeof paidAt === 'string' ? new Date(paidAt) : null;
    if (!month || !Number.isInteger(version) || !['payment', 'refund'].includes(direction) || !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > MAX_AMOUNT_CENTS || !date || !Number.isFinite(date.getTime()) || !isSafeProofUrl(proofUrl) || typeof note !== 'string' || note.length > 2000 || !Number.isInteger(statementRevision)) return fail(res, 400, '发薪流水内容无效');
    const statement = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId: req.params.employeeId, month: month.value });
    if (!statement || statement.version !== version) return fail(res, 409, '工资条不存在或已被修改');
    const published = latestPublished(statement);
    if (!published || published.revision !== statementRevision) return fail(res, 409, '只能登记当前已发布工资版本的付款');
    const sums = paymentSums(statement.payments);
    if (direction === 'payment' && amountCents > published.totals.netPayCents - sums.netPaidCents) return fail(res, 409, '付款金额超过当前剩余应付金额');
    if (direction === 'refund' && amountCents > sums.netPaidCents) return fail(res, 409, '退款金额超过已付款净额');
    const updated = await PayrollStatement.findOneAndUpdate({ _id: statement._id, tenantId: req.tenantId, version, currentPublishedRevision: statementRevision }, {
      $push: { payments: { direction, amountCents, paidAt: date, proofUrl: proofUrl.trim(), note: note.trim(), statementRevision, createdBy: req.user._id } },
      $set: { updatedAt: new Date() },
      $inc: { version: 1, __v: 1 },
    }, { new: true, runValidators: true });
    if (!updated) return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
    const actorNames = await getActorNames([asObject(updated)]);
    return res.json({ ok: true, data: await serializeStatement(updated, actorNames) });
  } catch (error) {
    if (error?.name === 'VersionError') return fail(res, 409, '工资条已被其他财务修改，请刷新后重试');
    console.error('payroll addPayment failed:', error);
    return fail(res, 500, '登记发薪失败');
  }
};

exports.getMyStatements = async (req, res) => {
  try {
    if (!req.user || req.user.status === 'disabled') return fail(res, 403, '在职员工才能查看本人工资条');
    if (!hasLinkedEmployee(req.user)) return fail(res, 403, '当前账号尚未关联公司，暂时无法查看工资条');
    const userTenantId = req.user.tenantId?._id || req.user.tenantId;
    if (String(userTenantId || '') !== String(req.tenantId || '')) return fail(res, 403, '员工租户信息不匹配');
    const year = req.query.year;
    if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2200) return fail(res, 400, '年份格式应为 YYYY');
    const statements = await PayrollStatement.find({ tenantId: req.tenantId, employeeId: req.user._id, month: { $gte: `${year}-01`, $lte: `${year}-12` } }).sort({ month: 1 }).lean();
    const actorNames = await getActorNames(statements);
    const rows = statements.filter(statement => latestPublished(statement)).map(statement => {
      const published = latestPublished(statement);
      const sums = paymentSums(statement.payments);
      return { month: statement.month, revision: published.revision, employee: published.employee, components: published.components, totals: published.totals, publishedAt: published.publishedAt, paymentStatus: paymentStatus('published', published.totals.netPayCents, sums.netPaidCents), paidCents: sums.netPaidCents, remainingCents: Math.max(0, published.totals.netPayCents - sums.netPaidCents), paymentHistory: (statement.payments || []).map(item => serializePayment(item, actorNames)) };
    });
    const totals = rows.reduce((sum, row) => {
      for (const key of ['incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents']) sum[key] += row.totals[key] || 0;
      sum.paidCents += row.paidCents;
      sum.remainingCents += row.remainingCents;
      return sum;
    }, { incomeSubtotalCents: 0, employerContributionCents: 0, totalCompensationCents: 0, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 0, netPayCents: 0, paidCents: 0, remainingCents: 0 });
    return res.json({ ok: true, data: { year, rows, totals } });
  } catch (error) {
    console.error('payroll getMyStatements failed:', error);
    return fail(res, 500, '读取个人工资条失败');
  }
};

function blankStatsRow(month) {
  return { month, statementCount: 0, incomeSubtotalCents: 0, employerContributionCents: 0, totalCompensationCents: 0, attendanceDeductionCents: 0, payableBeforePersonalDeductionsCents: 0, netPayCents: 0, paidCents: 0, refundCents: 0, netPaidCents: 0, remainingCents: 0 };
}

/**
 * 把测试账号的工资条从统计里剔掉。
 * 工资条本身只有 employeeId、没有 userid，得回查这些人的账号判据。
 * **只查这次统计实际用到的那些 id**；没有候选时直接返回，不必碰数据库。
 */
async function filterOutTestAccountStatements(tenantId, statements) {
  if (!statements.length) return statements;
  const ids = [...new Set(statements.map(item => String(item.employeeId)))]
    .filter(id => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return statements;
  const users = await User.find({ tenantId, _id: { $in: ids } })
    .select('userid profile.name role').lean().catch(() => []);
  const testIds = new Set(users.filter(isTestAccount).map(user => String(user._id)));
  if (!testIds.size) return statements;
  return statements.filter(item => !testIds.has(String(item.employeeId)));
}

/**
 * 「考勤统计」块的一行。
 * - 时长/天数来自考勤侧（已批申请单 + 月台账），见 attendance-ledger 的 getPayrollAttendanceSummary；
 * - 金额来自**已发布**工资条：请假 = 病假 + 事假扣款，旷工 = 旷工扣款，加班 = 加班补贴；
 *   系统没有出差补贴项，所以出差没有金额（保持 0，界面显示「—」）。
 * - absenceMinutes 是台账缺口推导出来的旷工时长；absenceSkippedCount 是没能参与推导的人数
 *   （实到未确认 / 无依据 / 日历未确认），>0 时界面要提示缺了这部分。
 */
function blankAttendanceRow(month) {
  return {
    month,
    leaveMinutes: 0, overtimeMinutes: 0, fieldworkMinutes: 0, fieldworkDays: 0,
    absenceMinutes: 0, absenceSkippedCount: 0, leaveUnreconciled: false,
    leaveDeductionCents: 0, absenceDeductionCents: 0, overtimeAllowanceCents: 0,
  };
}

exports.getStatistics = async (req, res) => {
  try {
    const period = req.query.period;
    const value = req.query.value;
    const parsed = parsePeriod(period, value);
    if (!parsed) return fail(res, 400, '统计周期或值格式无效');
    const employeeOnly = !isPayrollReader(req.user);
    if (employeeOnly && (!req.user || req.user.status === 'disabled')) return fail(res, 403, '在职员工才能查看本人薪资统计');
    if (employeeOnly && !hasLinkedEmployee(req.user)) return fail(res, 403, '当前账号尚未关联公司，暂时无法查看薪资统计');
    if (!employeeOnly && !(await requirePayrollReader(req, res))) return;
    const criteria = { tenantId: req.tenantId };
    if (employeeOnly) criteria.employeeId = req.user._id;
    const months = period === 'month' ? [value] : Array.from({ length: 12 }, (_, i) => `${value}-${String(i + 1).padStart(2, '0')}`);
    // 考勤口径单独取：它挂了不影响工资口径，整块退回空值（界面按「考勤数据不可用」处理）
    const [allStatements, attendanceSummary] = await Promise.all([
      PayrollStatement.find({ ...criteria, month: { $in: months } }).lean(),
      getPayrollAttendanceSummary(req.tenantId, months, employeeOnly ? String(req.user._id) : null).catch(error => {
        console.error('payroll statistics attendance failed:', error);
        return null;
      }),
    ]);
    // 测试账号的工资条不计入合计（自己看自己时除外，那条路本来只查本人）
    const statements = employeeOnly ? allStatements : (await filterOutTestAccountStatements(req.tenantId, allStatements));
    const attendanceByMonth = new Map(months.map(month => [month, blankAttendanceRow(month)]));
    const accrualByMonth = new Map(months.map(month => [month, blankStatsRow(month)]));
    for (const statement of statements) {
      const published = latestPublished(statement);
      if (!published) continue;
      const row = accrualByMonth.get(statement.month);
      row.statementCount++;
      for (const key of ['incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents']) row[key] += published.totals[key] || 0;
      const payment = paymentSums(statement.payments);
      row.paidCents += payment.paidCents;
      row.refundCents += payment.refundedCents;
      row.netPaidCents += payment.netPaidCents;
      row.remainingCents += Math.max(0, published.totals.netPayCents - payment.netPaidCents);
      // 考勤四项的金额口径：请假 = 病假 + 事假扣款，与工资条「请假」两级表头一致
      const components = published.components || {};
      const attendanceRow = attendanceByMonth.get(statement.month);
      attendanceRow.leaveDeductionCents += (components.sickLeaveDeductionCents || 0) + (components.personalLeaveDeductionCents || 0);
      attendanceRow.absenceDeductionCents += components.absenceDeductionCents || 0;
      attendanceRow.overtimeAllowanceCents += components.overtimeAllowanceCents || 0;
    }
    for (const item of attendanceSummary?.byMonth || []) {
      const row = attendanceByMonth.get(item.month);
      if (!row) continue;
      Object.assign(row, {
        leaveMinutes: item.leaveMinutes, overtimeMinutes: item.overtimeMinutes,
        fieldworkMinutes: item.fieldworkMinutes, fieldworkDays: item.fieldworkDays,
        absenceMinutes: item.absenceMinutes, absenceSkippedCount: item.absenceSkippedCount,
        leaveUnreconciled: item.leaveUnreconciled === true,
      });
    }
    // Cash accounting follows the date money moved, not the wage month.
    const paymentCriteria = { tenantId: req.tenantId, 'payments.paidAt': { $gte: new Date(parsed.start), $lt: new Date(parsed.end) } };
    if (employeeOnly) paymentCriteria.employeeId = req.user._id;
    const paymentStatements = await PayrollStatement.find(paymentCriteria).select('payments').lean();
    const cashByMonth = new Map(months.map(month => [month, blankStatsRow(month)]));
    let cashPaid = 0, cashRefund = 0;
    for (const statement of paymentStatements) {
      for (const item of statement.payments || []) {
        const timestamp = new Date(item.paidAt).getTime();
        if (timestamp < parsed.start || timestamp >= parsed.end) continue;
        const date = new Date(timestamp + 8 * 3600000);
        const paymentMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        const row = cashByMonth.get(paymentMonth);
        if (!row) continue;
        if (item.direction === 'payment') { row.paidCents += item.amountCents; cashPaid += item.amountCents; }
        else { row.refundCents += item.amountCents; cashRefund += item.amountCents; }
        row.netPaidCents = row.paidCents - row.refundCents;
      }
    }
    const accrualRows = [...accrualByMonth.values()];
    const cashRows = [...cashByMonth.values()];
    const attendanceRows = [...attendanceByMonth.values()];
    const accrual = accrualRows.reduce((sum, row) => {
      for (const key of ['statementCount', 'incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents', 'paidCents', 'refundCents', 'netPaidCents', 'remainingCents']) sum[key] += row[key];
      return sum;
    }, blankStatsRow(value));
    const attendanceTotals = attendanceRows.reduce((sum, row) => {
      for (const key of ['leaveMinutes', 'overtimeMinutes', 'fieldworkMinutes', 'fieldworkDays', 'absenceMinutes', 'absenceSkippedCount', 'leaveDeductionCents', 'absenceDeductionCents', 'overtimeAllowanceCents']) sum[key] += row[key] || 0;
      sum.leaveUnreconciled = sum.leaveUnreconciled || row.leaveUnreconciled;
      return sum;
    }, blankAttendanceRow(value));
    return res.json({ ok: true, data: {
      period,
      value,
      accrual: { ...accrual, byMonth: accrualRows },
      cash: { paidCents: cashPaid, refundCents: cashRefund, netPaidCents: cashPaid - cashRefund, byMonth: cashRows },
      attendance: {
        // dayMinutes 为 null 表示考勤口径整体没读到（界面按「—」处理，不影响上面的工资计提）
        dayMinutes: attendanceSummary?.dayMinutes ?? null,
        byMonth: attendanceRows,
        totals: attendanceTotals,
      },
    } });
  } catch (error) {
    console.error('payroll getStatistics failed:', error);
    return fail(res, 500, '读取工资统计失败');
  }
};

/** 单次导入或批量发布最多处理 500 人；再多人请分批，避免一个请求把连接占太久。 */
const MAX_BATCH_ROWS = 500;

/**
 * 批量给当月全体在职员工记一笔节日福利。
 *
 * 口径（与用户 2026-10-06 定的交互一致）：
 * - 范围是**当月工资表里的全部员工**，不逐人勾选——福利是全员同额的事，让财务按人勾选反而容易漏人。
 * - 同一个节日**覆盖不累加**：先发中秋 200、改成 300 得到 300，不是 500。
 * - 只写草稿，不发布：录完财务自己核对，之后走原有的「批量发布」。
 * - 已发布过的人会被覆盖成未发布修订草稿，用 hadPublished 标出来提醒重新发布。
 * - 当月考勤已结账且工资条已发布的，按 saveDraft 的同一口径跳过（要改得先撤回），逐人回报原因。
 * - 员工当月还没有任何工资数据时以 0 起底：只写福利这一项，其余保持 0，
 *   不去猜薪资标准（财务后续手工补，或用「导入」整表覆盖）。
 */
exports.batchWelfare = async (req, res) => {
  let monthLock;
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const entry = validateWelfareEntry(req.body);
    if (!month) return fail(res, 400, '月份格式应为 YYYY-MM');
    if (!entry.ok) return fail(res, 400, entry.error);
    const allEmployees = await User.find(payrollEmployeeQuery(req.tenantId))
      .select('employeeNo phone profile.name userid role department status').lean();
    // 测试账号不是真员工，不发福利
    const employees = filterRealEmployees(allEmployees);
    if (!employees.length) return fail(res, 400, '当前没有在职员工');
    if (employees.length > MAX_BATCH_ROWS) return fail(res, 400, `当月在职员工超过 ${MAX_BATCH_ROWS} 人，请分批处理`);
    monthLock = await monthCoordination.acquireMonthMutationLock(req.tenantId, month.value);
    // 结账口径只查一次，逐人复用；整批要么都能改要么都改不了。
    const ledgerStatus = await monthLedgerStatus(req.tenantId, month.value);
    const existingStatements = await PayrollStatement.find({ tenantId: req.tenantId, month: month.value })
      .select('employeeId version currentPublishedRevision draft');
    const byEmployee = new Map(existingStatements.map(statement => [String(statement.employeeId), statement]));
    const now = new Date();
    const results = [];
    for (const employee of employees) {
      const employeeId = String(employee._id);
      const label = { employeeId, name: employee.profile?.name || employee.userid || '', employeeNo: employee.employeeNo || '' };
      const existing = byEmployee.get(employeeId);
      if (existing?.currentPublishedRevision && ledgerStatus === 'closed') {
        results.push({ ...label, status: 'failed', error: '当月考勤已结账，该员工工资条需先撤回再修改' });
        continue;
      }
      // 基准金额：有草稿用草稿，没有就用当前发布版，都没有就全 0 起底。
      const baseComponents = existing?.draft?.components
        || (existing ? latestPublished(existing)?.components : null)
        || Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0]));
      const applied = applyWelfareEntry(normalizeWelfareItems(existing?.draft?.welfareItems, baseComponents), entry.entry);
      const components = { ...asObject(baseComponents), welfareCents: sumWelfareItems(applied.items) };
      const validated = validatePayrollComponents(components);
      if (!validated.ok) {
        results.push({ ...label, status: 'failed', error: validated.error });
        continue;
      }
      const values = {
        employee: employeeSnapshot(employee),
        draft: { components: validated.components, totals: validated.totals, welfareItems: applied.items, updatedBy: req.user._id, updatedAt: now },
        updatedAt: now,
      };
      if (!existing) {
        try {
          await PayrollStatement.create({ tenantId: req.tenantId, employeeId, month: month.value, ...values, version: 1 });
          results.push({ ...label, status: 'created', hadPublished: false, replaced: applied.replaced });
        } catch (error) {
          if (error?.code === 11000) results.push({ ...label, status: 'failed', error: '工资条已被其他财务建立，请刷新后重试' });
          else throw error;
        }
        continue;
      }
      const updated = await PayrollStatement.findOneAndUpdate({ _id: existing._id, tenantId: req.tenantId, version: existing.version }, {
        $set: values,
        $inc: { version: 1, __v: 1 },
      }, { new: true, runValidators: true });
      if (!updated) results.push({ ...label, status: 'failed', error: '工资条已被其他财务修改，请刷新后重试' });
      else {
        results.push({
          ...label,
          status: 'updated',
          hadPublished: Boolean(existing.currentPublishedRevision),
          replaced: applied.replaced,
          previousAmountCents: applied.previousAmountCents,
          welfareCents: validated.components.welfareCents,
        });
      }
    }
    const succeeded = results.filter(item => item.status !== 'failed').length;
    return res.json({ ok: true, data: {
      month: month.value,
      holiday: entry.entry.holiday,
      holidayLabel: entry.entry.holidayLabel,
      amountCents: entry.entry.amountCents,
      ledgerStatus,
      results,
      succeeded,
      failed: results.length - succeeded,
      overwrittenPublished: results.filter(item => item.hadPublished).length,
      created: results.filter(item => item.status === 'created').length,
    } });
  } catch (error) {
    console.error('payroll batchWelfare failed:', error);
    if (error?.status === 409 || error?.name === 'VersionError') return fail(res, 409, error.message || '考勤台账正在处理或工资条已变化，请刷新后重试');
    return fail(res, 500, '批量录入福利失败');
  } finally {
    if (monthLock) await monthCoordination.releaseMonthMutationLock(req.tenantId, monthLock).catch(() => {});
  }
};

/** 节日福利下拉清单由后端下发，前端不另写一份，避免两边节假日对不上。 */
exports.listWelfareHolidays = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    return res.json({ ok: true, data: { holidays: WELFARE_HOLIDAY_OPTIONS } });
  } catch (error) {
    console.error('payroll listWelfareHolidays failed:', error);
    return fail(res, 500, '读取节日清单失败');
  }
};

/**
 * 按月份批量导入工资草稿。
 * - 名单匹配（姓名/工号）在导入弹窗里完成，这里只接收 employeeId + 16 项录入金额。
 * - 只写草稿、不发布；当月已发布过的人会被覆盖成「未发布修订草稿」，用 hadPublished 标出来提醒财务重新发布。
 * - 计算列（工资总额 / 合计应发 / 实发金额）不接收：一律由 validatePayrollComponents 按录入项重算，保证全系统口径一致。
 * - 逐行独立处理并逐行回报，某一行的数据问题不影响其他行。
 */
exports.importDrafts = async (req, res) => {
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!month || !rows?.length || rows.length > MAX_BATCH_ROWS) return fail(res, 400, `请提供 1 至 ${MAX_BATCH_ROWS} 行工资数据`);
    const employeeIds = rows.map(row => String(row?.employeeId || ''));
    if (new Set(employeeIds).size !== employeeIds.length) return fail(res, 400, '导入数据里存在重复员工');
    const employeeMap = await loadEmployees(employeeIds, req.tenantId);
    const now = new Date();
    const results = [];
    for (const [index, row] of rows.entries()) {
      const employeeId = employeeIds[index];
      const employee = employeeMap.get(employeeId);
      if (!employee) {
        results.push({ employeeId, name: '', employeeNo: '', status: 'failed', error: '员工不存在或已停用' });
        continue;
      }
      const label = { employeeId, name: employee.profile?.name || employee.userid || '', employeeNo: employee.employeeNo || '' };
      const validated = validatePayrollComponents(row?.components);
      if (!validated.ok) {
        results.push({ ...label, status: 'failed', error: validated.error });
        continue;
      }
      const values = {
        employee: employeeSnapshot(employee),
        draft: { components: validated.components, totals: validated.totals, welfareItems: [], updatedBy: req.user._id, updatedAt: now },
        updatedAt: now,
      };
      const existing = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId, month: month.value }).select('_id version currentPublishedRevision');
      if (!existing) {
        try {
          await PayrollStatement.create({ tenantId: req.tenantId, employeeId, month: month.value, ...values, version: 1 });
          results.push({ ...label, status: 'created', hadPublished: false });
        } catch (error) {
          if (error?.code === 11000) results.push({ ...label, status: 'failed', error: '工资条已被其他财务建立，请刷新后重试' });
          else throw error;
        }
        continue;
      }
      const updated = await PayrollStatement.findOneAndUpdate({ _id: existing._id, tenantId: req.tenantId, version: existing.version }, {
        $set: values,
        $inc: { version: 1, __v: 1 },
      }, { new: true, runValidators: true });
      if (!updated) results.push({ ...label, status: 'failed', error: '工资条已被其他财务修改，请刷新后重试' });
      else results.push({ ...label, status: 'updated', hadPublished: Boolean(existing.currentPublishedRevision) });
    }
    const succeeded = results.filter(item => item.status !== 'failed').length;
    return res.json({ ok: true, data: {
      month: month.value,
      results,
      succeeded,
      failed: results.length - succeeded,
      overwrittenPublished: results.filter(item => item.hadPublished).length,
    } });
  } catch (error) {
    console.error('payroll importDrafts failed:', error);
    return fail(res, 500, '导入工资数据失败');
  }
};

/**
 * 批量发布当月工资草稿。
 * - 月度锁只抢一次、台账结账只校验一次，逐人独立发布（部分成功可接受），每行单独回报原因。
 * - force=true 时允许台账未结账强发，每人各写一条 forced_publish 事件留痕。
 * - 没有草稿的人会以「请先保存完整工资草稿」失败，前端只勾选有草稿的人即可避免。
 */
exports.publishBatch = async (req, res) => {
  let monthLock;
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const employeeIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(String) : null;
    const force = req.body?.force === true;
    if (!month || !employeeIds?.length || employeeIds.length > MAX_BATCH_ROWS) return fail(res, 400, `请选择 1 至 ${MAX_BATCH_ROWS} 位员工`);
    if (new Set(employeeIds).size !== employeeIds.length) return fail(res, 400, '发布名单里存在重复员工');
    if (!employeeIds.every(id => mongoose.Types.ObjectId.isValid(id))) return fail(res, 400, '员工无效');
    monthLock = await monthCoordination.acquireMonthMutationLock(req.tenantId, month.value);
    const ledgerStatus = await monthLedgerStatus(req.tenantId, month.value);
    if (ledgerStatus !== 'closed' && !force) return fail(res, 409, '请先完成当月考勤结账，再发布工资条');
    const employeeMap = await loadEmployees(employeeIds, req.tenantId);
    const results = [];
    for (const employeeId of employeeIds) {
      const employee = employeeMap.get(employeeId);
      const label = { employeeId, name: employee?.profile?.name || employee?.userid || '', employeeNo: employee?.employeeNo || '' };
      const result = await publishDraftStatement({ tenantId: req.tenantId, employeeId, month: month.value, userId: req.user._id, requireClosedLedger: false, force, ledgerStatus });
      if (result.ok) results.push({ ...label, status: 'published', revision: result.revision });
      else results.push({ ...label, status: 'failed', error: result.error });
    }
    const published = results.filter(item => item.status === 'published').length;
    return res.json({ ok: true, data: { month: month.value, ledgerStatus, forced: force && ledgerStatus !== 'closed', results, published, failed: results.length - published } });
  } catch (error) {
    console.error('payroll publishBatch failed:', error);
    if (error?.status === 409 || error?.name === 'VersionError') return fail(res, 409, error.message || '考勤台账正在处理或工资条已变化，请刷新后重试');
    return fail(res, 500, '批量发布工资条失败');
  } finally {
    if (monthLock) await monthCoordination.releaseMonthMutationLock(req.tenantId, monthLock).catch(() => {});
  }
};

exports._test = { parseMonth, parsePeriod, paymentSums, paymentStatus, latestPublished, effectiveComponents, collectTaxBasis, serializeStatement, isSafeProofUrl, monthLedgerStatus, isMonthLedgerClosed, publishDraftStatement, loadEmployees, normalizeWelfareItems };
