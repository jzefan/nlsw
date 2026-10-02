import { getTitleCode } from '@/services/api/user.api'
import type { PayrollContributionScheme, PayrollStandard } from '@/services/api/payroll.api'

export function formatCents(amount: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
  return `¥${(amount / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function centsToYuanInput(amount: number | null | undefined) {
  return typeof amount === 'number' && Number.isFinite(amount) ? (amount / 100).toFixed(2) : '0.00'
}

/** 比例按百分比存（0~100，最多两位小数），界面上用字符串编辑。 */
export function rateToPercentInput(rate: number | null | undefined) {
  return typeof rate === 'number' && Number.isFinite(rate) ? String(Math.round(rate * 100) / 100) : '0'
}

/** 输入框可能是字符串，也可能被 <input type="number"> 转成了数字，这里统一按文本处理。 */
function inputText(value: string | number | null | undefined) {
  return String(value ?? '').trim()
}

export function parsePercentInput(value: string | number | null | undefined): number | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(inputText(value))
  if (!match) return null
  const percent = Number(`${match[1]}.${match[2] ?? '0'}`)
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null
}

/** 算社保公积金只需要四个缴费基数：费率一律取自租户「五险一金方案」。 */
type StandardContributionInput = Pick<PayrollStandard,
  | 'companySocialInsuranceBaseCents' | 'personalSocialInsuranceBaseCents'
  | 'companyHousingFundBaseCents' | 'personalHousingFundBaseCents'>

/**
 * 五险一金方案的兜底值，与后端 utils/payroll-calculations.js 的 DEFAULT_CONTRIBUTION_SCHEME 一致。
 * 权威值来自接口返回的租户方案；这里只在拿不到方案时兜底，别在这里改成另一套口径。
 */
export const DEFAULT_CONTRIBUTION_SCHEME: PayrollContributionScheme = {
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
}

/** 方案合计：五险单位/个人各一个比例（个人另有医疗固定额）+ 公积金单位/个人比例。 */
export function contributionSchemeTotals(scheme: PayrollContributionScheme = DEFAULT_CONTRIBUTION_SCHEME) {
  const percent = (value: number) => Math.round(value * 100) / 100
  return {
    employerRatePercent: percent(scheme.pensionEmployerPercent + scheme.medicalEmployerPercent
      + scheme.unemploymentEmployerPercent + scheme.injuryEmployerPercent + scheme.maternityEmployerPercent),
    employeeRatePercent: percent(scheme.pensionEmployeePercent + scheme.medicalEmployeePercent + scheme.unemploymentEmployeePercent),
    employeeFlatCents: scheme.medicalEmployeeFlatCents,
    housingFundEmployerPercent: scheme.housingFundEmployerPercent,
    housingFundEmployeePercent: scheme.housingFundEmployeePercent,
  }
}

/** 社保按方案的五险合计（个人另加医疗固定额），公积金按方案的公积金比例；口径与后端保持一致。 */
export function computeStandardContributions(
  standard: StandardContributionInput,
  scheme: PayrollContributionScheme = DEFAULT_CONTRIBUTION_SCHEME,
): PayrollStandard['contributions'] {
  const contribution = (baseCents: number, ratePercent: number) => Math.round((baseCents * ratePercent) / 100)
  const totals = contributionSchemeTotals(scheme)
  return {
    employerSocialInsuranceCents: contribution(standard.companySocialInsuranceBaseCents, totals.employerRatePercent),
    employeeSocialInsuranceCents: contribution(standard.personalSocialInsuranceBaseCents, totals.employeeRatePercent) + totals.employeeFlatCents,
    employerHousingFundCents: contribution(standard.companyHousingFundBaseCents, totals.housingFundEmployerPercent),
    employeeHousingFundCents: contribution(standard.personalHousingFundBaseCents, totals.housingFundEmployeePercent),
  }
}

/** 考勤时长统一按「小时」展示，保留两位小数。 */
export function formatMinutes(minutes: number | null | undefined) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '—'
  return `${Number((minutes / 60).toFixed(2))} 小时`
}

export function parseYuanToCents(value: string | number | null | undefined): number | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(inputText(value))
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function getBeijingMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find(part => part.type === 'year')?.value ?? '2026'}-${parts.find(part => part.type === 'month')?.value ?? '01'}`
}

export function getBeijingYear() {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date()))
}

export interface PayrollRoleHolder {
  payrollRoles?: string[] | string
  title?: string
}

/** 薪资角色既可能是数组也可能是单个字符串（老数据）。 */
export function payrollRolesOf(user: PayrollRoleHolder | null | undefined) {
  const roles = user?.payrollRoles
  return Array.isArray(roles) ? roles : roles ? [roles] : []
}

/** 可查看全公司工资：财务、总经理（由职位同步的唯一薪资角色）以及董事长；职务写代码或中文都认。 */
export function canViewCompanyPayroll(user: PayrollRoleHolder | null | undefined) {
  const titleCode = getTitleCode(String(user?.title || ''))
  return payrollRolesOf(user).some(role => ['finance', 'general_manager'].includes(role)) || titleCode === 'gm' || titleCode === 'ceo'
}

/** 只有财务可以录入、发布、撤回工资条并登记收退款。 */
export function canEditPayroll(user: PayrollRoleHolder | null | undefined) {
  return payrollRolesOf(user).includes('finance')
}

export function wallClockToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return ''
  const [, y, m, d, h, minute, second = '0'] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(minute), Number(second))).toISOString()
}

export function formatBeijingDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

/** 工资条纸头用的期间文案：'2026-10' → '2026 年 10 月'；非 YYYY-MM 原样带回。 */
export function formatPayrollMonthLabel(month: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''))
  if (!match) return String(month ?? '')
  return `${match[1]} 年 ${Number(match[2])} 月`
}
