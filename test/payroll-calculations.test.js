const test = require('node:test');
const assert = require('node:assert/strict');
const { COMPONENT_KEYS, validatePayrollComponents } = require('../utils/payroll-calculations');

test('payroll formula keeps employer contributions out of employee cash pay', () => {
  const values = Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0]));
  Object.assign(values, {
    basicPayCents: 500_000,
    performancePayCents: 50_000,
    transportAllowanceCents: 10_000,
    employerSocialInsuranceCents: 40_000,
    employerHousingFundCents: 20_000,
    employeeSocialInsuranceCents: 15_000,
    employeeHousingFundCents: 10_000,
    sickLeaveDeductionCents: 5_000,
    incomeTaxCents: 8_000,
  });

  const result = validatePayrollComponents(values);
  assert.equal(result.ok, true);
  assert.deepEqual(result.totals, {
    incomeSubtotalCents: 560_000,
    employerContributionCents: 60_000,
    totalCompensationCents: 620_000,
    attendanceDeductionCents: 5_000,
    payableBeforePersonalDeductionsCents: 555_000,
    netPayCents: 522_000,
  });
});

test('payroll amounts must be nonnegative integer cents and net cannot be negative', () => {
  const values = Object.fromEntries(COMPONENT_KEYS.map(key => [key, 0]));
  assert.equal(validatePayrollComponents({ ...values, basicPayCents: 1.5 }).ok, false);
  assert.equal(validatePayrollComponents({ ...values, incomeTaxCents: -1 }).ok, false);
  assert.equal(validatePayrollComponents({ ...values, personalLeaveDeductionCents: 1 }).ok, false);
  assert.equal(validatePayrollComponents({ ...values, basicPayCents: 100, incomeTaxCents: 101 }).ok, false);
});

test('payroll standard turns bases and rates into contribution cents', () => {
  const { validatePayrollStandard, computeStandardContributions } = require('../utils/payroll-calculations');
  const result = validatePayrollStandard({
    basicPayCents: 500_000,
    positionPayCents: 30_000,
    seniorityPayCents: 20_000,
    attendanceBonusCents: 10_000,
    companySocialInsuranceBaseCents: 500_000,
    companySocialInsuranceRatePercent: 12,
    personalSocialInsuranceBaseCents: 500_000,
    personalSocialInsuranceRatePercent: 8.5,
    companyHousingFundBaseCents: 400_000,
    companyHousingFundRatePercent: 12,
    personalHousingFundBaseCents: 400_000,
    personalHousingFundRatePercent: 12,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.contributions, {
    employerSocialInsuranceCents: 60_000,
    employeeSocialInsuranceCents: 42_500,
    employerHousingFundCents: 48_000,
    employeeHousingFundCents: 48_000,
  });
  // 四舍五入到分：1000 分 × 3.33% = 33.3 分 → 33 分；1000 分 × 3.35% = 33.5 分 → 34 分
  assert.equal(computeStandardContributions({
    companySocialInsuranceBaseCents: 1000, companySocialInsuranceRatePercent: 3.33,
    personalSocialInsuranceBaseCents: 1000, personalSocialInsuranceRatePercent: 3.35,
    companyHousingFundBaseCents: 0, companyHousingFundRatePercent: 0,
    personalHousingFundBaseCents: 0, personalHousingFundRatePercent: 0,
  }).employerSocialInsuranceCents, 33);
  assert.equal(computeStandardContributions({
    companySocialInsuranceBaseCents: 1000, companySocialInsuranceRatePercent: 3.33,
    personalSocialInsuranceBaseCents: 1000, personalSocialInsuranceRatePercent: 3.35,
    companyHousingFundBaseCents: 0, companyHousingFundRatePercent: 0,
    personalHousingFundBaseCents: 0, personalHousingFundRatePercent: 0,
  }).employeeSocialInsuranceCents, 34);
});

test('payroll standard rejects negative amounts, out-of-range rates and rates beyond two decimals', () => {
  const { validatePayrollStandard } = require('../utils/payroll-calculations');
  const base = {
    basicPayCents: 0, positionPayCents: 0, seniorityPayCents: 0, attendanceBonusCents: 0,
    companySocialInsuranceBaseCents: 0, companySocialInsuranceRatePercent: 0,
    personalSocialInsuranceBaseCents: 0, personalSocialInsuranceRatePercent: 0,
    companyHousingFundBaseCents: 0, companyHousingFundRatePercent: 0,
    personalHousingFundBaseCents: 0, personalHousingFundRatePercent: 0,
  };
  assert.equal(validatePayrollStandard(null).ok, false);
  assert.equal(validatePayrollStandard({ ...base, basicPayCents: -1 }).ok, false);
  assert.equal(validatePayrollStandard({ ...base, basicPayCents: 1.5 }).ok, false);
  assert.equal(validatePayrollStandard({ ...base, companyHousingFundRatePercent: 100.01 }).ok, false);
  assert.equal(validatePayrollStandard({ ...base, companyHousingFundRatePercent: 12.345 }).ok, false);

  const rounded = validatePayrollStandard({ ...base, companyHousingFundRatePercent: 12.34 });
  assert.equal(rounded.ok, true);
  assert.equal(rounded.standard.companyHousingFundRatePercent, 12.34);
});
