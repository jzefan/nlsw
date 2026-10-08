import type { PayrollComponents, PayrollTotals } from '@/services/api/payroll.api'

/**
 * 是否在界面上展示工资的「发放状态 / 已付 / 剩余 / 收退款登记」。
 * 当前系统只关注每月要发多少工资、生成工资条，暂不记录是否已发放与剩余多少，所以整块隐藏；
 * 后端接口与数据都保留，需要时改回 true 即可恢复（工资表、我的工资条、薪资统计三处共用这个开关）。
 */
export const showPayrollPayments = false

/**
 * 工资条列定义：字段、名称、顺序与分组按公司现行工资表（序号、姓名 + 以下各列）。
 * 补贴、请假是两级表头；工资总额/合计应发/实发金额是计算列，不是录入项。
 */
export type PayrollColumnGroup = '补贴' | '请假'

export interface PayrollColumn {
  kind: 'component' | 'totals'
  key: keyof PayrollComponents | keyof PayrollTotals
  label: string
  group?: PayrollColumnGroup
}

export const payslipColumns: PayrollColumn[] = [
  { kind: 'component', key: 'basicPayCents', label: '基本工资' },
  { kind: 'component', key: 'performancePayCents', label: '绩效工资' },
  { kind: 'component', key: 'positionPayCents', label: '岗位工资' },
  { kind: 'component', key: 'seniorityPayCents', label: '工龄工资' },
  { kind: 'component', key: 'attendanceBonusCents', label: '满勤奖' },
  { kind: 'component', key: 'transportAllowanceCents', label: '交通补贴', group: '补贴' },
  { kind: 'component', key: 'lunchAllowanceCents', label: '午餐补贴', group: '补贴' },
  { kind: 'component', key: 'overtimeAllowanceCents', label: '加班补贴', group: '补贴' },
  { kind: 'component', key: 'welfareCents', label: '福利', group: '补贴' },
  { kind: 'component', key: 'employerSocialInsuranceCents', label: '社保公司承担' },
  { kind: 'component', key: 'employerHousingFundCents', label: '公积金公司承担' },
  { kind: 'totals', key: 'totalCompensationCents', label: '工资总额（含社保公积金）' },
  { kind: 'component', key: 'employeeSocialInsuranceCents', label: '社保个人承担' },
  { kind: 'component', key: 'employeeHousingFundCents', label: '公积金个人承担' },
  { kind: 'component', key: 'sickLeaveDeductionCents', label: '病假', group: '请假' },
  { kind: 'component', key: 'personalLeaveDeductionCents', label: '事假', group: '请假' },
  { kind: 'component', key: 'absenceDeductionCents', label: '旷工' },
  { kind: 'totals', key: 'payableBeforePersonalDeductionsCents', label: '合计应发（不含社保公积金）' },
  { kind: 'component', key: 'incomeTaxCents', label: '个人所得税扣款' },
  { kind: 'totals', key: 'netPayCents', label: '实发金额' },
]

/**
 * 收入合计口径的项目（工资、薪金所得）。与后端 utils/payroll-calculations.js 的 INCOME_KEYS 一致。
 */
export const payrollIncomeKeys: readonly (keyof PayrollComponents)[] = [
  'basicPayCents',
  'performancePayCents',
  'positionPayCents',
  'seniorityPayCents',
  'attendanceBonusCents',
  'transportAllowanceCents',
  'lunchAllowanceCents',
  'overtimeAllowanceCents',
  'welfareCents',
]

/** 请假与旷工扣款项。与后端 utils/payroll-calculations.js 的 ATTENDANCE_DEDUCTION_KEYS 一致。 */
export const payrollAttendanceDeductionKeys: readonly (keyof PayrollComponents)[] = [
  'sickLeaveDeductionCents',
  'personalLeaveDeductionCents',
  'absenceDeductionCents',
]

/** 公司承担项。与后端 utils/payroll-calculations.js 的 EMPLOYER_CONTRIBUTION_KEYS 一致。 */
export const payrollEmployerContributionKeys: readonly (keyof PayrollComponents)[] = [
  'employerSocialInsuranceCents',
  'employerHousingFundCents',
]

/** 个人扣款项（社保、公积金、个税）。与后端 utils/payroll-calculations.js 的 EMPLOYEE_DEDUCTION_KEYS 一致。 */
export const payrollEmployeeDeductionKeys: readonly (keyof PayrollComponents)[] = [
  'employeeSocialInsuranceCents',
  'employeeHousingFundCents',
  'incomeTaxCents',
]

/**
 * 由录入项算出 6 个合计数，口径与后端 validatePayrollComponents 完全一致。
 * 用于导入时预览金额、并把文件里的计算列与系统口径做差异提示（真正落库的合计仍由后端算）。
 */
export function computePayrollTotals(components: PayrollComponents): PayrollTotals {
  const sum = (keys: readonly (keyof PayrollComponents)[]) => keys.reduce((total, key) => total + (components[key] ?? 0), 0)
  const incomeSubtotalCents = sum(payrollIncomeKeys)
  const employerContributionCents = sum(payrollEmployerContributionKeys)
  const attendanceDeductionCents = sum(payrollAttendanceDeductionKeys)
  const payableBeforePersonalDeductionsCents = incomeSubtotalCents - attendanceDeductionCents
  return {
    incomeSubtotalCents,
    employerContributionCents,
    totalCompensationCents: incomeSubtotalCents + employerContributionCents,
    attendanceDeductionCents,
    payableBeforePersonalDeductionsCents,
    netPayCents: payableBeforePersonalDeductionsCents - sum(payrollEmployeeDeductionKeys),
  }
}

/** 汇总区使用的口径名称，与工资条列保持一致。 */
export const payrollTotalsLabels: Record<keyof PayrollTotals, string> = {
  incomeSubtotalCents: '收入合计',
  employerContributionCents: '公司承担（社保公积金）',
  totalCompensationCents: '工资总额（含社保公积金）',
  attendanceDeductionCents: '请假与旷工扣款',
  payableBeforePersonalDeductionsCents: '合计应发（不含社保公积金）',
  netPayCents: '实发金额',
}
