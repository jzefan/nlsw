const COMPONENT_KEYS = Object.freeze([
  'basicPayCents',
  'performancePayCents',
  'positionPayCents',
  'seniorityPayCents',
  'attendanceBonusCents',
  'transportAllowanceCents',
  'lunchAllowanceCents',
  'overtimeAllowanceCents',
  'welfareCents',
  'employerSocialInsuranceCents',
  'employerHousingFundCents',
  'employeeSocialInsuranceCents',
  'employeeHousingFundCents',
  'sickLeaveDeductionCents',
  'personalLeaveDeductionCents',
  'absenceDeductionCents',
  'incomeTaxCents',
]);

const INCOME_KEYS = Object.freeze([
  'basicPayCents', 'performancePayCents', 'positionPayCents', 'seniorityPayCents',
  'attendanceBonusCents', 'transportAllowanceCents', 'lunchAllowanceCents', 'overtimeAllowanceCents', 'welfareCents',
]);
const ATTENDANCE_DEDUCTION_KEYS = Object.freeze([
  'sickLeaveDeductionCents', 'personalLeaveDeductionCents', 'absenceDeductionCents',
]);
const EMPLOYER_CONTRIBUTION_KEYS = Object.freeze([
  'employerSocialInsuranceCents', 'employerHousingFundCents',
]);
const EMPLOYEE_DEDUCTION_KEYS = Object.freeze([
  'employeeSocialInsuranceCents', 'employeeHousingFundCents', 'incomeTaxCents',
]);

function sumKeys(components, keys) {
  return keys.reduce((sum, key) => sum + components[key], 0);
}

function validatePayrollComponents(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '工资明细格式无效' };
  const components = {};
  for (const key of COMPONENT_KEYS) {
    const value = input[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_00) {
      return { ok: false, error: `${key} 必须是 0 至 1 亿元之间的整数分金额` };
    }
    components[key] = value;
  }
  const incomeSubtotalCents = sumKeys(components, INCOME_KEYS);
  const attendanceDeductionCents = sumKeys(components, ATTENDANCE_DEDUCTION_KEYS);
  const employerContributionCents = sumKeys(components, EMPLOYER_CONTRIBUTION_KEYS);
  const payableBeforePersonalDeductionsCents = incomeSubtotalCents - attendanceDeductionCents;
  const netPayCents = payableBeforePersonalDeductionsCents - sumKeys(components, EMPLOYEE_DEDUCTION_KEYS);
  if (![incomeSubtotalCents, attendanceDeductionCents, employerContributionCents, payableBeforePersonalDeductionsCents, netPayCents].every(Number.isSafeInteger)) {
    return { ok: false, error: '工资合计超出可计算范围' };
  }
  if (payableBeforePersonalDeductionsCents < 0 || netPayCents < 0) {
    return { ok: false, error: '考勤扣款或个人扣款不能超过应发金额' };
  }
  return {
    ok: true,
    components,
    totals: {
      incomeSubtotalCents,
      employerContributionCents,
      totalCompensationCents: incomeSubtotalCents + employerContributionCents,
      attendanceDeductionCents,
      payableBeforePersonalDeductionsCents,
      netPayCents,
    },
  };
}

/** 薪资标准里直接取用的固定金额项。 */
const STANDARD_MONEY_KEYS = Object.freeze([
  'basicPayCents',
  'positionPayCents',
  'seniorityPayCents',
  'attendanceBonusCents',
]);

/** 薪资标准里的「基数」项。 */
const STANDARD_BASE_KEYS = Object.freeze([
  'companySocialInsuranceBaseCents',
  'personalSocialInsuranceBaseCents',
  'companyHousingFundBaseCents',
  'personalHousingFundBaseCents',
]);

/**
 * 薪资标准里的「比例」项，单位是百分比（0~100，最多两位小数）。
 * 注意：社保与公积金这四个比例自 2026-09-29 起不再由员工标准决定，改由租户级「五险一金方案」
 * （见下方 DEFAULT_CONTRIBUTION_SCHEME）汇总而来；保留在列表里只为兼容旧客户端的请求体，
 * 写入时会由 withContributionSchemeRates 覆写成方案值，保证库里不留矛盾值。
 */
const STANDARD_RATE_KEYS = Object.freeze([
  'companySocialInsuranceRatePercent',
  'personalSocialInsuranceRatePercent',
  'companyHousingFundRatePercent',
  'personalHousingFundRatePercent',
]);

const MAX_STANDARD_AMOUNT_CENTS = 100_000_000_00;

/**
 * 五险一金费率方案：全公司统一（费率是地区/公司政策，不是个人属性），
 * 比例按百分比、固定额按分。五险默认值是国标口径，公积金默认 12%（常见上限），
 * 都可在「薪资标准设置 → 五险一金方案」里整表调整。
 * 前端 front_end/src/utils/payroll.ts 的 DEFAULT_CONTRIBUTION_SCHEME 是同一份兜底值。
 */
const DEFAULT_CONTRIBUTION_SCHEME = Object.freeze({
  pensionEmployerPercent: 21,
  pensionEmployeePercent: 8,
  medicalEmployerPercent: 9,
  medicalEmployeePercent: 2,
  medicalEmployeeFlatCents: 300,
  unemploymentEmployerPercent: 2,
  unemploymentEmployeePercent: 1,
  injuryEmployerPercent: 0.5,
  maternityEmployerPercent: 1,
  housingFundEmployerPercent: 12,
  housingFundEmployeePercent: 12,
});

const CONTRIBUTION_SCHEME_PERCENT_KEYS = Object.freeze([
  'pensionEmployerPercent', 'pensionEmployeePercent',
  'medicalEmployerPercent', 'medicalEmployeePercent',
  'unemploymentEmployerPercent', 'unemploymentEmployeePercent',
  'injuryEmployerPercent', 'maternityEmployerPercent',
  'housingFundEmployerPercent', 'housingFundEmployeePercent',
]);
/** 个人医疗的固定额（大额医疗互助），按分存整数。 */
const CONTRIBUTION_SCHEME_FLAT_KEYS = Object.freeze(['medicalEmployeeFlatCents']);
const CONTRIBUTION_SCHEME_KEYS = Object.freeze([...CONTRIBUTION_SCHEME_PERCENT_KEYS, ...CONTRIBUTION_SCHEME_FLAT_KEYS]);

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

/** 把存储值补全成完整方案：缺项或越界值回落到默认值，读取路径不会因为脏数据算错。 */
function normalizeContributionScheme(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const scheme = {};
  for (const key of CONTRIBUTION_SCHEME_PERCENT_KEYS) {
    const value = source[key];
    scheme[key] = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
      ? roundPercent(value) : DEFAULT_CONTRIBUTION_SCHEME[key];
  }
  for (const key of CONTRIBUTION_SCHEME_FLAT_KEYS) {
    const value = source[key];
    scheme[key] = Number.isSafeInteger(value) && value >= 0 && value <= MAX_STANDARD_AMOUNT_CENTS
      ? value : DEFAULT_CONTRIBUTION_SCHEME[key];
  }
  return scheme;
}

/**
 * 方案合计：五险单位/个人各一个比例（个人另有一笔固定额；工伤与生育个人不缴），
 * 加上公积金单位/个人比例。
 */
function contributionSchemeTotals(scheme) {
  const normalized = normalizeContributionScheme(scheme);
  return {
    employerRatePercent: roundPercent(
      normalized.pensionEmployerPercent + normalized.medicalEmployerPercent
      + normalized.unemploymentEmployerPercent + normalized.injuryEmployerPercent + normalized.maternityEmployerPercent
    ),
    employeeRatePercent: roundPercent(
      normalized.pensionEmployeePercent + normalized.medicalEmployeePercent + normalized.unemploymentEmployeePercent
    ),
    employeeFlatCents: normalized.medicalEmployeeFlatCents,
    housingFundEmployerPercent: normalized.housingFundEmployerPercent,
    housingFundEmployeePercent: normalized.housingFundEmployeePercent,
  };
}

/** 校验「五险一金方案」提交值：比例 0~100 且最多两位小数，固定额是整数分。 */
function validateContributionScheme(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '五险一金方案格式无效' };
  const scheme = {};
  for (const key of CONTRIBUTION_SCHEME_PERCENT_KEYS) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, error: `${key} 必须是 0 至 100 之间的比例` };
    }
    const rounded = roundPercent(value);
    if (Math.abs(rounded - value) > 1e-9) return { ok: false, error: `${key} 最多两位小数` };
    scheme[key] = rounded;
  }
  for (const key of CONTRIBUTION_SCHEME_FLAT_KEYS) {
    const value = input[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_STANDARD_AMOUNT_CENTS) {
      return { ok: false, error: `${key} 必须是 0 至 1 亿元之间的整数分金额` };
    }
    scheme[key] = value;
  }
  return { ok: true, scheme };
}

/** 基数 × 比例 ÷ 100，四舍五入到分。 */
function contributionCents(baseCents, ratePercent) {
  return Math.round((baseCents * ratePercent) / 100);
}

/** 把标准里四个比例字段对齐成方案值，读写两条路径共用，避免库里与展示口径打架。 */
function withContributionSchemeRates(standard, scheme) {
  const totals = contributionSchemeTotals(scheme);
  return {
    ...standard,
    companySocialInsuranceRatePercent: totals.employerRatePercent,
    personalSocialInsuranceRatePercent: totals.employeeRatePercent,
    companyHousingFundRatePercent: totals.housingFundEmployerPercent,
    personalHousingFundRatePercent: totals.housingFundEmployeePercent,
  };
}

/**
 * 由薪资标准算出四项社保/公积金金额：社保按方案的五险合计（个人另加医疗固定额），
 * 公积金按方案的公积金比例。不传方案时按默认值算。
 * 前端 utils/payroll.ts 的 computeStandardContributions 必须与此保持一致。
 */
function computeStandardContributions(standard, scheme) {
  const totals = contributionSchemeTotals(scheme);
  return {
    employerSocialInsuranceCents: contributionCents(standard.companySocialInsuranceBaseCents, totals.employerRatePercent),
    employeeSocialInsuranceCents: contributionCents(standard.personalSocialInsuranceBaseCents, totals.employeeRatePercent) + totals.employeeFlatCents,
    employerHousingFundCents: contributionCents(standard.companyHousingFundBaseCents, totals.housingFundEmployerPercent),
    employeeHousingFundCents: contributionCents(standard.personalHousingFundBaseCents, totals.housingFundEmployeePercent),
  };
}

function validatePayrollStandard(input, scheme) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '薪资标准格式无效' };
  const standard = {};
  for (const key of [...STANDARD_MONEY_KEYS, ...STANDARD_BASE_KEYS]) {
    const value = input[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_STANDARD_AMOUNT_CENTS) {
      return { ok: false, error: `${key} 必须是 0 至 1 亿元之间的整数分金额` };
    }
    standard[key] = value;
  }
  for (const key of STANDARD_RATE_KEYS) {
    const value = input[key] ?? 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, error: `${key} 必须是 0 至 100 之间的比例` };
    }
    // 比例只保留两位小数，避免出现 12.345% 这种无法复核的输入（浮点误差按 1e-9 容差处理）
    const rounded = roundPercent(value);
    if (Math.abs(rounded - value) > 1e-9) return { ok: false, error: `${key} 最多两位小数` };
    standard[key] = rounded;
  }
  const aligned = withContributionSchemeRates(standard, scheme);
  const contributions = computeStandardContributions(aligned, scheme);
  if (!Object.values(contributions).every(Number.isSafeInteger)) return { ok: false, error: '社保公积金金额超出可计算范围' };
  return { ok: true, standard: aligned, contributions };
}

module.exports = {
  COMPONENT_KEYS,
  STANDARD_MONEY_KEYS,
  STANDARD_BASE_KEYS,
  STANDARD_RATE_KEYS,
  DEFAULT_CONTRIBUTION_SCHEME,
  CONTRIBUTION_SCHEME_KEYS,
  CONTRIBUTION_SCHEME_PERCENT_KEYS,
  CONTRIBUTION_SCHEME_FLAT_KEYS,
  normalizeContributionScheme,
  contributionSchemeTotals,
  validateContributionScheme,
  withContributionSchemeRates,
  validatePayrollComponents,
  validatePayrollStandard,
  computeStandardContributions,
};
