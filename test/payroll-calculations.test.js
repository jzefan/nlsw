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

test('payroll standard turns bases and the tenant scheme into contribution cents', () => {
  const { validatePayrollStandard, computeStandardContributions, DEFAULT_CONTRIBUTION_SCHEME } = require('../utils/payroll-calculations');
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
  // 社保按默认五险方案：单位 21+9+2+0.5+1 = 33.5%，个人 8+2+1 = 11% 另加 3 元大额医疗
  assert.deepEqual(result.contributions, {
    employerSocialInsuranceCents: 167_500,
    employeeSocialInsuranceCents: 55_300,
    employerHousingFundCents: 48_000,
    employeeHousingFundCents: 48_000,
  });
  // 标准里提交的社保比例会被对齐成方案合计，库里不留与计算口径矛盾的旧值
  assert.equal(result.standard.companySocialInsuranceRatePercent, 33.5);
  assert.equal(result.standard.personalSocialInsuranceRatePercent, 11);

  // 传自定义方案时按方案的合计算：单位 10+9+2+0.5+1 = 22.5%，个人 5+2+1 = 8% 且固定额为 0
  const custom = { ...DEFAULT_CONTRIBUTION_SCHEME, pensionEmployerPercent: 10, pensionEmployeePercent: 5, medicalEmployeeFlatCents: 0 };
  assert.deepEqual(computeStandardContributions({
    companySocialInsuranceBaseCents: 100_000,
    personalSocialInsuranceBaseCents: 100_000,
    companyHousingFundBaseCents: 0, companyHousingFundRatePercent: 0,
    personalHousingFundBaseCents: 0, personalHousingFundRatePercent: 0,
  }, custom), {
    employerSocialInsuranceCents: 22_500,
    employeeSocialInsuranceCents: 8_000,
    employerHousingFundCents: 0,
    employeeHousingFundCents: 0,
  });

  // 四舍五入到分：1000 分 × 3.33% = 33.3 分 → 33 分；1000 分 × 3.35% = 33.5 分 → 34 分
  const roundingScheme = {
    ...DEFAULT_CONTRIBUTION_SCHEME,
    pensionEmployerPercent: 3.33, pensionEmployeePercent: 3.35, medicalEmployeeFlatCents: 0,
    medicalEmployerPercent: 0, medicalEmployeePercent: 0,
    unemploymentEmployerPercent: 0, unemploymentEmployeePercent: 0,
    injuryEmployerPercent: 0, maternityEmployerPercent: 0,
  };
  const roundingStandard = {
    companySocialInsuranceBaseCents: 1000, personalSocialInsuranceBaseCents: 1000,
    companyHousingFundBaseCents: 0, companyHousingFundRatePercent: 0,
    personalHousingFundBaseCents: 0, personalHousingFundRatePercent: 0,
  };
  assert.equal(computeStandardContributions(roundingStandard, roundingScheme).employerSocialInsuranceCents, 33);
  assert.equal(computeStandardContributions(roundingStandard, roundingScheme).employeeSocialInsuranceCents, 34);
});

test('contribution scheme sums the five insurances plus housing fund and rejects malformed input', () => {
  const { validateContributionScheme, contributionSchemeTotals, normalizeContributionScheme, DEFAULT_CONTRIBUTION_SCHEME } = require('../utils/payroll-calculations');
  // 国标口径：单位 33.5%，个人 11% + 3 元；公积金默认 12% / 12%
  assert.deepEqual(contributionSchemeTotals(DEFAULT_CONTRIBUTION_SCHEME), {
    employerRatePercent: 33.5,
    employeeRatePercent: 11,
    employeeFlatCents: 300,
    housingFundEmployerPercent: 12,
    housingFundEmployeePercent: 12,
  });
  // 公积金比例改了就跟着变（方案是唯一来源）
  assert.equal(contributionSchemeTotals({ ...DEFAULT_CONTRIBUTION_SCHEME, housingFundEmployerPercent: 8 }).housingFundEmployerPercent, 8);
  // 工伤与生育没有个人部分，合计里也不算它们
  assert.equal(contributionSchemeTotals({ ...DEFAULT_CONTRIBUTION_SCHEME, injuryEmployerPercent: 0, maternityEmployerPercent: 0 }).employerRatePercent, 32);
  // 缺项或脏数据回落到默认值，不会把金额算歪
  assert.deepEqual(normalizeContributionScheme({ pensionEmployerPercent: 16, medicalEmployeePercent: 999 }), {
    ...DEFAULT_CONTRIBUTION_SCHEME,
    pensionEmployerPercent: 16,
  });
  assert.deepEqual(normalizeContributionScheme(undefined), { ...DEFAULT_CONTRIBUTION_SCHEME });

  const ok = validateContributionScheme({ ...DEFAULT_CONTRIBUTION_SCHEME });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.scheme, { ...DEFAULT_CONTRIBUTION_SCHEME });
  assert.equal(validateContributionScheme(null).ok, false);
  assert.equal(validateContributionScheme({ ...DEFAULT_CONTRIBUTION_SCHEME, pensionEmployerPercent: 100.5 }).ok, false);
  assert.equal(validateContributionScheme({ ...DEFAULT_CONTRIBUTION_SCHEME, pensionEmployerPercent: 16.005 }).ok, false);
  assert.equal(validateContributionScheme({ ...DEFAULT_CONTRIBUTION_SCHEME, medicalEmployeeFlatCents: 3.5 }).ok, false);
  // 比例允许两位小数，固定额只收整数分
  assert.equal(validateContributionScheme({ ...DEFAULT_CONTRIBUTION_SCHEME, medicalEmployeeFlatCents: 0 }).ok, true);
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
  // 比例字段仍按两位小数校验格式，但返回值会被对齐成方案值（这里没传方案，落到默认公积金 12%）
  assert.equal(rounded.standard.companyHousingFundRatePercent, 12);
});
