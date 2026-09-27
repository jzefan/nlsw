const COMPONENT_KEYS = Object.freeze([
  'basicPayCents',
  'performancePayCents',
  'positionPayCents',
  'seniorityPayCents',
  'attendanceBonusCents',
  'transportAllowanceCents',
  'lunchAllowanceCents',
  'overtimeAllowanceCents',
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
  'attendanceBonusCents', 'transportAllowanceCents', 'lunchAllowanceCents', 'overtimeAllowanceCents',
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

/** 薪资标准里的「比例」项，单位是百分比（0~100，最多两位小数）。 */
const STANDARD_RATE_KEYS = Object.freeze([
  'companySocialInsuranceRatePercent',
  'personalSocialInsuranceRatePercent',
  'companyHousingFundRatePercent',
  'personalHousingFundRatePercent',
]);

const MAX_STANDARD_AMOUNT_CENTS = 100_000_000_00;

/** 基数 × 比例 ÷ 100，四舍五入到分。 */
function contributionCents(baseCents, ratePercent) {
  return Math.round((baseCents * ratePercent) / 100);
}

/** 由薪资标准算出四项社保/公积金金额；前端 utils/payroll.ts 的 computeStandardContributions 必须与此保持一致。 */
function computeStandardContributions(standard) {
  return {
    employerSocialInsuranceCents: contributionCents(standard.companySocialInsuranceBaseCents, standard.companySocialInsuranceRatePercent),
    employeeSocialInsuranceCents: contributionCents(standard.personalSocialInsuranceBaseCents, standard.personalSocialInsuranceRatePercent),
    employerHousingFundCents: contributionCents(standard.companyHousingFundBaseCents, standard.companyHousingFundRatePercent),
    employeeHousingFundCents: contributionCents(standard.personalHousingFundBaseCents, standard.personalHousingFundRatePercent),
  };
}

function validatePayrollStandard(input) {
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
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - value) > 1e-9) return { ok: false, error: `${key} 最多两位小数` };
    standard[key] = rounded;
  }
  const contributions = computeStandardContributions(standard);
  if (!Object.values(contributions).every(Number.isSafeInteger)) return { ok: false, error: '社保公积金金额超出可计算范围' };
  return { ok: true, standard, contributions };
}

module.exports = {
  COMPONENT_KEYS,
  STANDARD_MONEY_KEYS,
  STANDARD_BASE_KEYS,
  STANDARD_RATE_KEYS,
  validatePayrollComponents,
  validatePayrollStandard,
  computeStandardContributions,
};
