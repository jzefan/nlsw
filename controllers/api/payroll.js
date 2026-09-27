const mongoose = require('mongoose');
const User = require('../../models/User');
const PayrollStatement = require('../../models/PayrollStatement');
const PayrollStandard = require('../../models/PayrollStandard');
const AttendanceMonthLedger = require('../../models/AttendanceMonthLedger');
const { _coordination: monthCoordination, getMonthlyAttendanceSummary } = require('./attendance-ledger');
const { hasLinkedEmployee } = require('../../utils/attendance-permissions');
const { validatePayrollComponents, validatePayrollStandard, computeStandardContributions, COMPONENT_KEYS, STANDARD_MONEY_KEYS, STANDARD_BASE_KEYS, STANDARD_RATE_KEYS } = require('../../utils/payroll-calculations');
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
function serializeStandard(standard) {
  const data = asObject(standard);
  if (!data) return null;
  const result = {};
  for (const key of [...STANDARD_MONEY_KEYS, ...STANDARD_BASE_KEYS, ...STANDARD_RATE_KEYS]) result[key] = data[key] ?? 0;
  result.version = data.version || 0;
  result.updatedAt = data.updatedAt || null;
  result.contributions = computeStandardContributions(result);
  return result;
}

/**
 * 每月草稿底稿：薪资标准里能自动带出的项目（固定工资项 + 基数×比例算出的社保公积金），
 * 其余项目（绩效、补贴、考勤扣款、个税）按 0 起，由财务录入时补充。
 * 只用于给「未录入」的月份展示预估金额，不落库。
 */
function standardDraft(standard) {
  if (!standard) return null;
  const contributions = standard.contributions || computeStandardContributions(standard);
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
  return {
    employeeId: data.employeeId,
    ...data.employee,
    revision: published?.revision || 0,
    statementStatus,
    paymentStatus: paymentStatus(published ? 'published' : statementStatus, publishedNetPayCents, sums.netPaidCents),
    components,
    totals,
    publishedComponents: published?.components || null,
    publishedTotals: published?.totals || null,
    paidCents: sums.netPaidCents,
    remainingCents: Math.max(0, publishedNetPayCents - sums.netPaidCents),
    version: data.version || 0,
    publishedAt: published?.publishedAt || null,
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
  const users = await User.find({ _id: { $in: ids }, tenantId, status: { $ne: 'disabled' } })
    .select('employeeNo phone profile.phone profile.name userid department status')
    .lean();
  return new Map(users.map(user => [String(user._id), user]));
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
async function attachStandardAndAttendance(rows, tenantId, month) {
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
    row.standard = serializeStandard(standardByEmployee.get(String(row.employeeId)));
    row.attendance = attendance[String(row.employeeId)] || null;
    // 工资标准基本不变，所以没录入的月份直接按标准给出底稿金额；有工资条的行以工资条为准
    row.standardDraft = row.statementStatus === 'missing' ? standardDraft(row.standard) : null;
  }
}

exports.listStatements = async (req, res) => {
  try {
    if (!(await requirePayrollReader(req, res))) return;
    const month = parseMonth(req.query.month);
    if (!month) return fail(res, 400, '月份格式应为 YYYY-MM');
    const [employees, statements] = await Promise.all([
      User.find({ tenantId: req.tenantId, status: { $ne: 'disabled' } })
        .select('employeeNo phone profile.name profile.phone userid department status').sort({ department: 1, employeeNo: 1 }).lean(),
      PayrollStatement.find({ tenantId: req.tenantId, month: month.value }).lean(),
    ]);
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
    await attachStandardAndAttendance(rows, req.tenantId, month);
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
    return res.json({ ok: true, data: { month: month.value, rows, totals } });
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
    const employees = await User.find({ tenantId: req.tenantId, status: { $ne: 'disabled' } })
      .select('employeeNo phone profile.name profile.phone userid department status').sort({ department: 1, employeeNo: 1 }).lean();
    const standards = await PayrollStandard.find({ tenantId: req.tenantId }).lean();
    const standardByEmployee = new Map(standards.map(item => [String(item.employeeId), item]));
    const employeeById = new Map(employees.map(user => [String(user._id), user]));
    const rows = employees.map(user => ({
      employeeId: user._id,
      ...employeeSnapshot(user),
      standard: serializeStandard(standardByEmployee.get(String(user._id))),
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
    const validated = validatePayrollStandard(req.body?.standard);
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
    return res.json({ ok: true, data: serializeStandard(standard) });
  } catch (error) {
    if (error?.code === 11000 || error?.name === 'VersionError') return fail(res, 409, '薪资标准已被其他财务修改，请刷新后重试');
    console.error('payroll saveStandard failed:', error);
    return fail(res, 500, '保存薪资标准失败');
  }
};

/** 当月考勤必须已结账才能发布工资条；单条发布与批量发布共用这同一条前置条件。 */
async function isMonthLedgerClosed(tenantId, month) {
  const ledger = await AttendanceMonthLedger.findOne({ tenantId, month }).select('status').lean();
  return ledger?.status === 'closed';
}

/**
 * 发布一份草稿的核心动作：单条 publish 与批量发布共用，避免两处逻辑各写一份后漂移。
 * - 没有草稿、版本不一致、台账未结账都返回 { ok: false, error }，由调用方决定 HTTP 状态码。
 * - 台账检查可关掉：批量发布时已经在抢锁后统一校验过一次，不必逐人再查。
 * - 用 version 条件做乐观锁，并发写入时后到的一方拿不到文档。
 */
async function publishDraftStatement({ tenantId, employeeId, month, userId, expectedVersion, requireClosedLedger = true }) {
  const statement = await PayrollStatement.findOne({ tenantId, employeeId, month });
  if (!statement || !statement.draft?.components || !statement.draft?.totals) return { ok: false, error: '请先保存完整工资草稿' };
  if (Number.isInteger(expectedVersion) && statement.version !== expectedVersion) return { ok: false, error: '工资条已被其他财务修改，请刷新后重试' };
  if (requireClosedLedger && !(await isMonthLedgerClosed(tenantId, month))) return { ok: false, error: '请先完成当月考勤结账，再发布工资条' };
  const revision = (statement.revisions || []).reduce((max, item) => Math.max(max, item.revision), 0) + 1;
  const publishedAt = new Date();
  const updated = await PayrollStatement.findOneAndUpdate({ _id: statement._id, tenantId, version: statement.version, 'draft.components': { $exists: true } }, {
    $push: { revisions: { revision, employee: statement.employee, components: statement.draft.components, totals: statement.draft.totals, publishedBy: userId, publishedAt } },
    $set: { currentPublishedRevision: revision, updatedAt: publishedAt },
    $unset: { draft: 1 },
    $inc: { version: 1, __v: 1 },
  }, { new: true, runValidators: true });
  if (!updated) return { ok: false, error: '工资条已被其他财务修改，请刷新后重试' };
  return { ok: true, revision, statement: updated };
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
    const values = {
      employee: employeeSnapshot(employee),
      draft: { components: validated.components, totals: validated.totals, updatedBy: req.user._id, updatedAt: now },
      updatedAt: now,
    };
    let statement;
    const existing = await PayrollStatement.findOne({ tenantId: req.tenantId, employeeId: employee._id, month: month.value }).select('_id version');
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
    const { version } = req.body || {};
    if (!month || !mongoose.Types.ObjectId.isValid(req.params.employeeId) || !Number.isInteger(version)) return fail(res, 400, '月份、员工或版本无效');
    monthLock = await monthCoordination.acquireMonthMutationLock(req.tenantId, month.value);
    const result = await publishDraftStatement({ tenantId: req.tenantId, employeeId: req.params.employeeId, month: month.value, userId: req.user._id, expectedVersion: version });
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
    const now = new Date();
    const updated = await PayrollStatement.findOneAndUpdate({ _id: statement._id, tenantId: req.tenantId, version, currentPublishedRevision: published.revision }, {
      $push: { events: { action: 'withdrawn', revision: published.revision, actorId: req.user._id, reason: reason.trim(), at: now } },
      $set: { currentPublishedRevision: null, updatedAt: now },
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
    const statements = await PayrollStatement.find({ ...criteria, month: { $in: months } }).lean();
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
    const accrual = accrualRows.reduce((sum, row) => {
      for (const key of ['statementCount', 'incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents', 'paidCents', 'refundCents', 'netPaidCents', 'remainingCents']) sum[key] += row[key];
      return sum;
    }, blankStatsRow(value));
    return res.json({ ok: true, data: {
      period,
      value,
      accrual: { ...accrual, byMonth: accrualRows },
      cash: { paidCents: cashPaid, refundCents: cashRefund, netPaidCents: cashPaid - cashRefund, byMonth: cashRows },
    } });
  } catch (error) {
    console.error('payroll getStatistics failed:', error);
    return fail(res, 500, '读取工资统计失败');
  }
};

/** 单次导入或批量发布最多处理 500 人；再多人请分批，避免一个请求把连接占太久。 */
const MAX_BATCH_ROWS = 500;

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
        draft: { components: validated.components, totals: validated.totals, updatedBy: req.user._id, updatedAt: now },
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
 * - 没有草稿的人会以「请先保存完整工资草稿」失败，前端只勾选有草稿的人即可避免。
 */
exports.publishBatch = async (req, res) => {
  let monthLock;
  try {
    if (!(await requireFinance(req, res))) return;
    const month = parseMonth(req.params.month);
    const employeeIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(String) : null;
    if (!month || !employeeIds?.length || employeeIds.length > MAX_BATCH_ROWS) return fail(res, 400, `请选择 1 至 ${MAX_BATCH_ROWS} 位员工`);
    if (new Set(employeeIds).size !== employeeIds.length) return fail(res, 400, '发布名单里存在重复员工');
    if (!employeeIds.every(id => mongoose.Types.ObjectId.isValid(id))) return fail(res, 400, '员工无效');
    monthLock = await monthCoordination.acquireMonthMutationLock(req.tenantId, month.value);
    if (!(await isMonthLedgerClosed(req.tenantId, month.value))) return fail(res, 409, '请先完成当月考勤结账，再发布工资条');
    const employeeMap = await loadEmployees(employeeIds, req.tenantId);
    const results = [];
    for (const employeeId of employeeIds) {
      const employee = employeeMap.get(employeeId);
      const label = { employeeId, name: employee?.profile?.name || employee?.userid || '', employeeNo: employee?.employeeNo || '' };
      const result = await publishDraftStatement({ tenantId: req.tenantId, employeeId, month: month.value, userId: req.user._id, requireClosedLedger: false });
      if (result.ok) results.push({ ...label, status: 'published', revision: result.revision });
      else results.push({ ...label, status: 'failed', error: result.error });
    }
    const published = results.filter(item => item.status === 'published').length;
    return res.json({ ok: true, data: { month: month.value, results, published, failed: results.length - published } });
  } catch (error) {
    console.error('payroll publishBatch failed:', error);
    if (error?.status === 409 || error?.name === 'VersionError') return fail(res, 409, error.message || '考勤台账正在处理或工资条已变化，请刷新后重试');
    return fail(res, 500, '批量发布工资条失败');
  } finally {
    if (monthLock) await monthCoordination.releaseMonthMutationLock(req.tenantId, monthLock).catch(() => {});
  }
};

exports._test = { parseMonth, parsePeriod, paymentSums, paymentStatus, latestPublished, effectiveComponents, collectTaxBasis, serializeStatement, isSafeProofUrl, isMonthLedgerClosed, publishDraftStatement, loadEmployees };
