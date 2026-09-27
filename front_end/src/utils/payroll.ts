import { getTitleCode } from '@/services/api/user.api'
import type { PayrollStandard } from '@/services/api/payroll.api'

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

type StandardContributionInput = Pick<PayrollStandard,
  | 'companySocialInsuranceBaseCents' | 'companySocialInsuranceRatePercent'
  | 'personalSocialInsuranceBaseCents' | 'personalSocialInsuranceRatePercent'
  | 'companyHousingFundBaseCents' | 'companyHousingFundRatePercent'
  | 'personalHousingFundBaseCents' | 'personalHousingFundRatePercent'>

/** 基数 × 比例 ÷ 100 四舍五入到分；口径与后端 utils/payroll-calculations.js 保持一致。 */
export function computeStandardContributions(standard: StandardContributionInput): PayrollStandard['contributions'] {
  const contribution = (baseCents: number, ratePercent: number) => Math.round((baseCents * ratePercent) / 100)
  return {
    employerSocialInsuranceCents: contribution(standard.companySocialInsuranceBaseCents, standard.companySocialInsuranceRatePercent),
    employeeSocialInsuranceCents: contribution(standard.personalSocialInsuranceBaseCents, standard.personalSocialInsuranceRatePercent),
    employerHousingFundCents: contribution(standard.companyHousingFundBaseCents, standard.companyHousingFundRatePercent),
    employeeHousingFundCents: contribution(standard.personalHousingFundBaseCents, standard.personalHousingFundRatePercent),
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
