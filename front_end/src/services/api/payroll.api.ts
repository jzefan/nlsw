import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface PayrollComponents {
  basicPayCents: number
  performancePayCents: number
  positionPayCents: number
  seniorityPayCents: number
  attendanceBonusCents: number
  transportAllowanceCents: number
  lunchAllowanceCents: number
  overtimeAllowanceCents: number
  employerSocialInsuranceCents: number
  employerHousingFundCents: number
  employeeSocialInsuranceCents: number
  employeeHousingFundCents: number
  sickLeaveDeductionCents: number
  personalLeaveDeductionCents: number
  absenceDeductionCents: number
  incomeTaxCents: number
}

export interface PayrollTotals {
  incomeSubtotalCents: number
  employerContributionCents: number
  totalCompensationCents: number
  attendanceDeductionCents: number
  payableBeforePersonalDeductionsCents: number
  netPayCents: number
}

export interface PayrollPayment {
  direction: 'payment' | 'refund'
  amountCents: number
  paidAt: string
  proofUrl: string
  note: string
  statementRevision: number
  createdAt: string
  createdBy: { id: string, name: string }
}

/** 薪资标准：很少变动的固定工资项 + 社保/公积金各自的基数与比例（比例单位是百分比）。 */
export interface PayrollStandard {
  basicPayCents: number
  positionPayCents: number
  seniorityPayCents: number
  attendanceBonusCents: number
  companySocialInsuranceBaseCents: number
  companySocialInsuranceRatePercent: number
  personalSocialInsuranceBaseCents: number
  personalSocialInsuranceRatePercent: number
  companyHousingFundBaseCents: number
  companyHousingFundRatePercent: number
  personalHousingFundBaseCents: number
  personalHousingFundRatePercent: number
  /** 由基数 × 比例算出的四项金额，服务端与前端算法一致 */
  contributions: Pick<PayrollComponents, 'employerSocialInsuranceCents' | 'employeeSocialInsuranceCents' | 'employerHousingFundCents' | 'employeeHousingFundCents'>
  version: number
  updatedAt: string | null
}

/**
 * 五险一金费率方案（全公司统一，比例单位是百分比）：员工只填各自的缴费基数，
 * 单位/个人社保与公积金金额由这张表汇总出的比例算出，社保个人另加医疗固定额。
 */
export interface PayrollContributionScheme {
  pensionEmployerPercent: number
  pensionEmployeePercent: number
  medicalEmployerPercent: number
  medicalEmployeePercent: number
  /** 个人医疗固定额（大额医疗互助），按分 */
  medicalEmployeeFlatCents: number
  unemploymentEmployerPercent: number
  unemploymentEmployeePercent: number
  injuryEmployerPercent: number
  maternityEmployerPercent: number
  housingFundEmployerPercent: number
  housingFundEmployeePercent: number
}

export interface PayrollContributionSchemeTotals {
  /** 五险的单位合计比例 */
  employerRatePercent: number
  /** 五险的个人合计比例 */
  employeeRatePercent: number
  employeeFlatCents: number
  housingFundEmployerPercent: number
  housingFundEmployeePercent: number
}

export interface PayrollContributionSchemePayload {
  scheme: PayrollContributionScheme
  totals: PayrollContributionSchemeTotals
}

/** 工资条明细里展示的当月考勤时长；台账未登记时 expectedMinutes/actualMinutes 为 null。 */
export interface PayrollAttendanceSummary {
  leaveMinutesByType: Record<string, number>
  overtimeApprovedMinutes: number
  overtimeCompTimeMinutes: number
  overtimePayMinutes: number
  fieldworkApprovedMinutes: number
  expectedMinutes: number | null
  actualMinutes: number | null
  requiresLeaveReconciliation?: boolean
}

export interface PayrollStandardRow {
  employeeId: string
  employeeNo: string
  phone?: string
  name: string
  displayName?: string
  department: string
  standard: PayrollStandard | null
}

export interface PayrollStatementRow {
  employeeId: string
  employeeNo: string
  phone?: string
  name: string
  displayName?: string
  department: string
  revision: number
  statementStatus: 'missing' | 'draft' | 'published' | 'withdrawn'
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'not_publish'
  components: PayrollComponents | null
  totals: PayrollTotals | null
  publishedComponents: PayrollComponents | null
  publishedTotals: PayrollTotals | null
  /** 该员工的薪资标准，用于录入弹窗预填 */
  standard?: PayrollStandard | null
  /** 未录入工资条的月份按薪资标准算出的底稿金额（只读展示，不落库） */
  standardDraft?: { components: PayrollComponents, totals: PayrollTotals } | null
  /** 当月考勤时长，用于展开明细展示 */
  attendance?: PayrollAttendanceSummary | null
  paidCents: number
  remainingCents: number
  version: number
  publishedAt: string | null
  paymentHistory: PayrollPayment[]
  revisionHistory: Array<{ revision: number, publishedAt: string, publishedBy: string }>
}

export interface PayrollRoleCandidate {
  userId: string
  employeeNo: string
  userid?: string
  name: string
  /** 人员显示名：姓名（工号｜手机号｜部门），无区分信息时就是姓名本身 */
  displayName?: string
  phone?: string
  department: string
  payrollRoles: Array<'finance' | 'general_manager'>
  status: 'active' | 'disabled' | string
  mustChangePassword: boolean
}

export interface PayrollRoleLock {
  acquiredAt: string
  ageMinutes: number | null
  minimumRecoveryAgeMinutes: number
  mutationActive: boolean
  recoverable: boolean
}

export interface PayrollMonthlySummary extends PayrollTotals {
  statementCount: number
  paidCents: number
  refundCents: number
  netPaidCents: number
  remainingCents: number
  month: string
}

export interface PayrollStatements {
  month: string
  rows: PayrollStatementRow[]
  totals: Omit<PayrollMonthlySummary, 'month'> & { publishedCount: number, draftCount: number }
}

/** 计税基数里某一个月的数据来源：有草稿用草稿，否则用最新已发布版本。 */
export interface PayrollTaxBasisMonth {
  month: string
  source: 'draft' | 'published'
  /** 当月收入合计 − 病假/事假/旷工扣款。 */
  incomeCents: number
  /** 当月个人社保 + 个人公积金。 */
  specialDeductionCents: number
  /** 当月已录入的个人所得税。 */
  incomeTaxCents: number
}

/**
 * 个税「累计预扣预缴」所需的往月累计数据（不含本月，本月由录入弹窗里的当前值参与计算）。
 * 计税规则见 front_end/src/utils/income-tax.ts。
 */
export interface PayrollTaxBasis {
  month: string
  /** 当年截至本月在本单位的任职受雇月份数（含本月），至少 1。 */
  serviceMonths: number
  cumulativeIncomeCents: number
  cumulativeSpecialDeductionCents: number
  cumulativeWithheldTaxCents: number
  months: PayrollTaxBasisMonth[]
}

export interface PayrollStatistics {
  period: 'month' | 'year'
  value: string
  accrual: PayrollMonthlySummary & { publishedCount: number, byMonth: PayrollMonthlySummary[] }
  cash: { paidCents: number, refundCents: number, netPaidCents: number, byMonth: PayrollMonthlySummary[] }
}

export interface MyPayroll {
  year: string
  rows: Array<{
    month: string
    revision: number
    employee: { employeeNo: string, phone?: string, name: string, department: string }
    components: PayrollComponents
    totals: PayrollTotals
    publishedAt: string
    paymentStatus: PayrollStatementRow['paymentStatus']
    paidCents: number
    remainingCents: number
    paymentHistory: PayrollPayment[]
  }>
  totals: PayrollTotals & { paidCents: number, remainingCents: number }
}

/** 单次导入或批量发布最多处理 500 人，与后端 MAX_BATCH_ROWS 一致。 */
export const payrollBatchLimit = 500

/** 导入时每行只提交「员工 + 16 项录入金额」；计算列（工资总额/合计应发/实发金额）由后端按录入项重算。 */
export interface PayrollImportInput {
  employeeId: string
  components: PayrollComponents
}

export interface PayrollImportRowResult {
  employeeId: string
  name: string
  employeeNo: string
  status: 'created' | 'updated' | 'failed'
  /** 该员工当月本来就有已发布版本：导入覆盖了草稿，需要重新发布才会生效 */
  hadPublished?: boolean
  error?: string
}

export interface PayrollImportSummary {
  month: string
  results: PayrollImportRowResult[]
  succeeded: number
  failed: number
  /** 其中有多少人本来已发布过、被覆盖成未发布草稿 */
  overwrittenPublished: number
}

export interface PayrollPublishRowResult {
  employeeId: string
  name: string
  employeeNo: string
  status: 'published' | 'failed'
  revision?: number
  error?: string
}

export interface PayrollPublishSummary {
  month: string
  results: PayrollPublishRowResult[]
  published: number
  failed: number
}

interface ApiResponse<T> { ok: boolean, data?: T, error?: string, message?: string }

export async function getPayrollStatements(month: string) {
  const response = await axiosInstance.get<ApiResponse<PayrollStatements>>('/attendance/payroll/statements', { params: { month } })
  return response.data
}

export async function getPayrollTaxBasis(employeeId: string, month: string) {
  const response = await axiosInstance.get<ApiResponse<PayrollTaxBasis>>(`/attendance/payroll/statements/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}/tax-basis`)
  return response.data
}

export async function savePayrollDraft(employeeId: string, month: string, components: PayrollComponents, version: number) {
  const response = await axiosInstance.post<ApiResponse<PayrollStatementRow>>(`/attendance/payroll/statements/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}/draft`, { components, version })
  return response.data
}

export async function publishPayrollStatement(employeeId: string, month: string, version: number) {
  const response = await axiosInstance.post<ApiResponse<PayrollStatementRow>>(`/attendance/payroll/statements/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}/publish`, { version })
  return response.data
}

export async function withdrawPayrollStatement(employeeId: string, month: string, version: number, reason: string) {
  const response = await axiosInstance.post<ApiResponse<PayrollStatementRow>>(`/attendance/payroll/statements/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}/withdraw`, { version, reason })
  return response.data
}

export async function addPayrollPayment(employeeId: string, month: string, input: {
  version: number
  direction: 'payment' | 'refund'
  amountCents: number
  paidAt: string
  proofUrl?: string
  note?: string
  statementRevision: number
}) {
  const response = await axiosInstance.post<ApiResponse<PayrollStatementRow>>(`/attendance/payroll/statements/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}/payments`, input)
  return response.data
}

export async function getMyPayrollStatements(year: string) {
  const response = await axiosInstance.get<ApiResponse<MyPayroll>>('/attendance/payroll/my', { params: { year } })
  return response.data
}

export async function getPayrollStatistics(period: 'month' | 'year', value: string) {
  const response = await axiosInstance.get<ApiResponse<PayrollStatistics>>('/attendance/payroll/statistics', { params: { period, value } })
  return response.data
}

/** 按月份批量导入工资草稿：只写草稿、不发布，逐行回报结果。 */
export async function importPayrollDrafts(month: string, rows: PayrollImportInput[]) {
  const response = await axiosInstance.post<ApiResponse<PayrollImportSummary>>(`/attendance/payroll/import/${encodeURIComponent(month)}`, { rows })
  return response.data
}

/** 批量发布当月待发布草稿：一次抢月度锁、一次校验考勤结账，逐人独立发布。 */
export async function publishPayrollStatements(month: string, employeeIds: string[]) {
  const response = await axiosInstance.post<ApiResponse<PayrollPublishSummary>>(`/attendance/payroll/publish-batch/${encodeURIComponent(month)}`, { employeeIds })
  return response.data
}

export async function getPayrollStandards() {
  const response = await axiosInstance.get<ApiResponse<{ rows: PayrollStandardRow[] }>>('/attendance/payroll/standards')
  return response.data
}

/** 员工标准里可提交的部分：社保与公积金的费率都由租户「五险一金方案」决定，不再由这里提交。 */
export type PayrollStandardInput = Omit<PayrollStandard,
  'contributions' | 'version' | 'updatedAt'
  | 'companySocialInsuranceRatePercent' | 'personalSocialInsuranceRatePercent'
  | 'companyHousingFundRatePercent' | 'personalHousingFundRatePercent'>

export async function savePayrollStandard(employeeId: string, standard: PayrollStandardInput, version: number) {
  const response = await axiosInstance.post<ApiResponse<PayrollStandard>>(`/attendance/payroll/standards/${encodeURIComponent(employeeId)}`, { standard, version })
  return response.data
}

/** 五险一金方案：全公司统一，财务可改。 */
export async function getPayrollContributionScheme() {
  const response = await axiosInstance.get<ApiResponse<PayrollContributionSchemePayload>>('/attendance/payroll/contribution-scheme')
  return response.data
}

export async function savePayrollContributionScheme(scheme: PayrollContributionScheme) {
  const response = await axiosInstance.post<ApiResponse<PayrollContributionSchemePayload>>('/attendance/payroll/contribution-scheme', { scheme })
  return response.data
}

export async function savePayrollRoles(userId: string, payrollRoles: Array<'finance' | 'general_manager'>) {
  const response = await axiosInstance.post<ApiResponse<{ userId: string, payrollRoles: Array<'finance' | 'general_manager'> }>>(`/payroll/users/${encodeURIComponent(userId)}/roles`, { payrollRoles })
  return response.data
}

export async function getPayrollRoleCandidates() {
  const response = await axiosInstance.get<ApiResponse<PayrollRoleCandidate[]>>('/payroll/users/candidates')
  return response.data
}

export async function handoverPayrollGeneralManager(targetUserId: string, reason: string) {
  const response = await axiosInstance.post<ApiResponse<{ previousGeneralManagerId: string, generalManagerId: string, reason: string }>>('/payroll/general-manager/handover', { targetUserId, reason })
  return response.data
}

export async function getPayrollRoleLocks() {
  const response = await axiosInstance.get<ApiResponse<PayrollRoleLock[]>>('/payroll/role-locks')
  return response.data
}

export async function releasePayrollRoleLock() {
  const response = await axiosInstance.post<ApiResponse<{ released: boolean }>>('/payroll/role-locks/release', { confirmNoLiveMutation: true })
  return response.data
}
