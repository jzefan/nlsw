import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export type AttendanceRequestView = 'mine' | 'inbox' | 'history' | 'team'
export type AttendanceRequestKind = 'leave' | 'overtime' | 'fieldwork' | 'appeal'

// Keep the API shape permissive while the attendance service contract is being finalized.
export interface AttendanceRequest {
  id?: string
  _id?: string
  requestId?: string
  type?: AttendanceRequestKind | string
  kind?: AttendanceRequestKind | string
  status?: string
  applicantName?: string
  applicant?: string | Record<string, unknown>
  department?: string
  startAt?: string
  endAt?: string
  start_at?: string
  end_at?: string
  hours?: number
  durationMinutes?: number
  durationHours?: number
  leaveType?: string
  /** 考勤申述：申述的是哪一天的哪一类考勤异常（申述没有起止时段，这两个字段必填） */
  occurredOn?: string
  appealType?: string
  reason?: string
  location?: string
  contact?: string
  workContent?: string
  attachments?: { id: string, name: string, mimeType: string, size: number }[]
  compensation?: 'comp_time' | 'overtime_pay' | 'none' | string
  /** 审批链：approverName 由后端补上（审批链本身只存 approverId），详情时间线要显示「谁在审 / 谁审过了」。 */
  approvals?: { approverId?: string, approverName?: string, role?: string, status?: string, comment?: string, reviewedAt?: string }[]
  currentApproverId?: string | null
  createdAt?: string
  withdrawnAt?: string
  created_at?: string
  [key: string]: unknown
}

export interface AttendanceResponse<T = unknown> {
  ok?: boolean
  data?: T
  requests?: AttendanceRequest[]
  items?: AttendanceRequest[]
  message?: string
  pagination?: { page: number, limit: number, total: number }
  [key: string]: unknown
}

export interface AttendancePerson {
  userId: string
  name: string
  /** 登录名，在姓名及工号、手机号、部门仍无法消歧时用于区分，由后端拼进 displayName */
  userid?: string
  /** 人员显示名：姓名优先用工号、手机号、部门区分；仍重名时附登录名 */
  displayName?: string
  status?: 'active' | 'disabled' | string
  employeeNo?: string
  /** 登录手机号（跨租户唯一），缺失时为空串 */
  phone?: string
  department?: string
  managerId?: string
  managerName?: string
  attendanceRoles?: string[]
  /** 是否纳入考勤台账与统计；后端未设置时视为纳入 */
  attendanceTracked?: boolean
  payrollRoles?: string[]
  mustChangePassword?: boolean
  [key: string]: unknown
}

export interface AttendanceSubmissionLock {
  applicantId: string
  employeeNo: string
  employeeName: string
  acquiredAt: string
  ageMinutes: number | null
  minimumRecoveryAgeMinutes: number
  submissionActive: boolean
  recoverable: boolean
}

export interface AttendanceCalendarDay {
  date: string
  type: 'holiday' | 'workday' | string
  name?: string
}

/** 该年度国务院安排的获取结果：cached 本地已有 / fetched 本次从线上取得并入库 / unpublished 官方尚未公布 / unavailable 没能连上 */
export interface AttendanceOfficialCalendar {
  status: 'cached' | 'fetched' | 'unpublished' | 'unavailable'
  from?: 'builtin' | 'db' | 'online'
  source?: string
  notice?: string
  fetchedAt?: string
}

export type AttendanceLedgerScope = 'mine' | 'team' | 'company'
export type AttendanceLedgerStatus = 'open' | 'closed'
export type AttendanceLedgerConfirmationState = 'pending' | 'confirmed' | 'no_basis'

export interface AttendanceLedgerRow {
  employeeId: string
  employeeNo: string
  phone?: string
  name: string
  displayName?: string
  department: string
  expectedMinutes: number
  leaveMinutesByType: Record<string, number>
  overtimeApprovedMinutes: number
  overtimeCompTimeMinutes: number
  overtimePayMinutes: number
  overtimeUncompensatedMinutes?: number
  fieldworkApprovedMinutes: number
  /** 待审批（未批完）的申请时长：只作提示，不并入已批口径、不参与实到；已结账月份没有这几个字段。 */
  pendingOvertimeMinutes?: number
  pendingFieldworkMinutes?: number
  pendingLeaveMinutes?: number
  /** 待审批的请假没有按天分摊，算不出时长，只能提示「有待审批请假」。 */
  pendingLeaveUnreconciled?: boolean
  /**
   * 已批「考勤申述」按类型核减台账违纪次数（旷工只留痕）；只影响建议值，不改库里导入的次数。
   * appealOffsetLabel 是核减说明，直接显示在备注里；已结账月份没有这几个字段。
   */
  appealApprovedCounts?: Record<string, number>
  appealOffsetLabel?: string
  appealPendingCount?: number
  actualMinutes: number | null
  /** 'auto' = 采用系统建议值（后续导入/日历变化会重算）；'manual' = 人工改过（不再被建议值覆盖）。 */
  actualMinutesSource?: 'auto' | 'manual' | null
  /** 按规则算出的实到建议值（只算不写库）；null 表示算不出来，原因见 suggestedActualNote。 */
  suggestedActualMinutes?: number | null
  suggestedActualNote?: string
  /** true = 这一行的实到由人工确定，前端显示实际值而不是建议值。 */
  actualMinutesIsManual?: boolean
  confirmationState: AttendanceLedgerConfirmationState
  note: string
  /** 导入的考勤记录（次数）；null 表示没导入过。作为「实到」自动计算的依据，本身不直接等于实到。 */
  lateWithin10: number | null
  lateOver10: number | null
  lateTotal: number | null
  earlyLeave: number | null
  noClockRecord: number | null
  importNote: string
  importedAt: string | null
  version: number
  requiresLeaveReconciliation?: boolean
}

/** 一行要导入的考勤记录：留空 / 不传的字段不会覆盖原有值。 */
export interface AttendanceLedgerImportEntry {
  employeeId: string
  name?: string
  lateWithin10?: number | null
  lateOver10?: number | null
  lateTotal?: number | null
  earlyLeave?: number | null
  noClockRecord?: number | null
  importNote?: string
}

export interface AttendanceLedgerImportResult {
  employeeId: string
  name: string
  status: 'created' | 'updated' | 'failed'
  fields?: string[]
  error?: string
}

export interface AttendanceLedgerTotals {
  expectedMinutes?: number
  leaveMinutesByType?: Record<string, number>
  overtimeApprovedMinutes?: number
  overtimeCompTimeMinutes?: number
  overtimePayMinutes?: number
  fieldworkApprovedMinutes?: number
  actualMinutes?: number | null
  pendingCount?: number
  confirmedCount?: number
  noBasisCount?: number
  [key: string]: unknown
}

export interface AttendanceLedger {
  month: string
  status: AttendanceLedgerStatus
  version: number
  /** 1 个工作日 = 多少分钟；用来把实到拆成「天 + 小时」。老数据或异常配置下可能缺失，前端按 480 兜底。 */
  dayMinutes?: number
  rows: AttendanceLedgerRow[]
  totals: AttendanceLedgerTotals
}

export interface AttendanceLedgerStatistics {
  period: 'month' | 'year'
  value: string
  scope: AttendanceLedgerScope
  byMonth: { month: string, status: AttendanceLedgerStatus | 'not_started', totals: AttendanceLedgerTotals }[]
  totals: AttendanceLedgerTotals
}

// 工资项名称与顺序与工资条（components/payslip-table.vue）保持一致
export const payrollComponentFields = [
  ['basicPayCents', '基本工资'],
  ['performancePayCents', '绩效工资'],
  ['positionPayCents', '岗位工资'],
  ['seniorityPayCents', '工龄工资'],
  ['attendanceBonusCents', '满勤奖'],
  ['transportAllowanceCents', '交通补贴'],
  ['lunchAllowanceCents', '午餐补贴'],
  ['overtimeAllowanceCents', '加班补贴'],
  ['welfareCents', '福利'],
  ['employerSocialInsuranceCents', '社保公司承担'],
  ['employerHousingFundCents', '公积金公司承担'],
  ['employeeSocialInsuranceCents', '社保个人承担'],
  ['employeeHousingFundCents', '公积金个人承担'],
  ['sickLeaveDeductionCents', '病假'],
  ['personalLeaveDeductionCents', '事假'],
  ['absenceDeductionCents', '旷工'],
  ['incomeTaxCents', '个人所得税扣款'],
] as const

export async function getAttendanceRequests(view: AttendanceRequestView, page = 1, limit = 20, type: AttendanceRequestKind | '' = '') {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceRequest[]>>('/attendance/requests', { params: { view, page, limit, ...(type ? { type } : {}) } })
  return response.data
}

export async function createAttendanceRequest(data: Record<string, unknown>, files: File[] = []) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) formData.append(key, String(value))
  }
  for (const file of files) formData.append('attachments', file, file.name)
  const response = await axiosInstance.post<AttendanceResponse<AttendanceRequest>>('/attendance/requests', formData)
  return response.data
}

export async function downloadAttendanceRequestAttachment(requestId: string, attachmentId: string) {
  const response = await axiosInstance.get<Blob>(`/attendance/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(attachmentId)}`, { responseType: 'blob' })
  return response.data
}

export async function withdrawAttendanceRequest(id: string) {
  const response = await axiosInstance.post<AttendanceResponse>(`/attendance/requests/${encodeURIComponent(id)}/withdraw`)
  return response.data
}

export async function reviewAttendanceRequest(id: string, decision: 'approve' | 'reject', comment = '') {
  const response = await axiosInstance.post<AttendanceResponse>(`/attendance/requests/${encodeURIComponent(id)}/review`, { decision, comment })
  return response.data
}

export async function getAttendancePeople() {
  const response = await axiosInstance.get<AttendanceResponse<AttendancePerson[]>>('/attendance/users/people')
  return response.data
}

export async function saveAttendanceProfile(profile: Pick<AttendancePerson, 'userId' | 'employeeNo' | 'phone' | 'department' | 'managerId' | 'attendanceRoles' | 'attendanceTracked'>) {
  const response = await axiosInstance.post<AttendanceResponse>('/attendance/users/profile', profile)
  return response.data
}

export async function getAttendanceCalendar(year: number) {
  const response = await axiosInstance.get<AttendanceResponse<{ year: number, confirmed: boolean, defaultDays: AttendanceCalendarDay[], days: AttendanceCalendarDay[], workPeriods?: { start: string, end: string }[], saturdayMorning?: AttendanceSaturdayMorning, official?: AttendanceOfficialCalendar }>>('/attendance/calendar', { params: { year } })
  return response.data
}

export async function saveAttendanceCalendarDay(year: number, date: string, type: AttendanceCalendarDay['type']) {
  const response = await axiosInstance.post<AttendanceResponse>('/attendance/calendar/day', { year, date, type })
  return response.data
}

/** 每周六上午按工作日计：periods 是周六当天计入工作的时段（默认 09:00–12:00）。 */
export interface AttendanceSaturdayMorning {
  enabled: boolean
  periods: { start: string, end: string }[]
}

export async function saveAttendanceCalendarSaturdayMorning(enabled: boolean) {
  const response = await axiosInstance.post<AttendanceResponse<AttendanceSaturdayMorning>>('/attendance/calendar/saturday-morning', { enabled })
  return response.data
}

/** 每天的工作时段（上午/下午各一段的起止时间），租户级设置。 */
export interface AttendanceWorkPeriodsResult {
  periods: { start: string, end: string }[]
  /** 每天合计小时数：时段一改它就变，台账实到扣减按小时口径走。 */
  hoursPerDay: number
  saturdayMorning: AttendanceSaturdayMorning
}

export async function saveAttendanceWorkPeriods(periods: { start: string, end: string }[]) {
  const response = await axiosInstance.post<AttendanceResponse<AttendanceWorkPeriodsResult>>('/attendance/calendar/work-periods', { periods })
  return response.data
}

export async function saveAttendanceCalendar(year: number, days: AttendanceCalendarDay[]) {
  const response = await axiosInstance.post<AttendanceResponse>('/attendance/calendar', { year, confirmed: true, days })
  return response.data
}

export async function getGeneralManagerDelegate() {
  const response = await axiosInstance.get<AttendanceResponse<{ generalManagerDelegateId: string | null, generalManagerDelegateName: string }>>('/attendance/settings/approval-delegate')
  return response.data
}

export async function saveGeneralManagerDelegate(generalManagerDelegateId: string | null) {
  const response = await axiosInstance.post<AttendanceResponse>('/attendance/settings/approval-delegate', { generalManagerDelegateId })
  return response.data
}

export async function getAttendanceSubmissionLocks() {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceSubmissionLock[]>>('/attendance/settings/submission-locks')
  return response.data
}

export async function releaseAttendanceSubmissionLock(applicantId: string) {
  const response = await axiosInstance.post<AttendanceResponse>(`/attendance/settings/submission-locks/${encodeURIComponent(applicantId)}/release`, { confirmNoLiveSubmission: true })
  return response.data
}

export async function getAttendanceLedger(month: string, scope: AttendanceLedgerScope) {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceLedger>>('/attendance/ledger', { params: { month, scope } })
  return response.data
}

export async function getAttendanceLedgerStatistics(period: 'month' | 'year', value: string, scope: AttendanceLedgerScope) {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceLedgerStatistics>>('/attendance/ledger/statistics', { params: { period, value, scope } })
  return response.data
}

export interface AttendanceLedgerLock {
  month: string
  acquiredAt: string
  ageMinutes: number | null
  minimumRecoveryAgeMinutes: number
  mutationActive: boolean
  recoverable: boolean
}

export async function getAttendanceLedgerLocks() {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceLedgerLock[]>>('/attendance/ledger/locks')
  return response.data
}

export async function releaseAttendanceLedgerLock(month: string) {
  const response = await axiosInstance.post<AttendanceResponse<{ month: string, released: boolean }>>(`/attendance/ledger/locks/${encodeURIComponent(month)}/release`, { confirmNoLiveMutation: true })
  return response.data
}

export async function saveAttendanceLedgerEntry(employeeId: string, month: string, entry: {
  actualMinutes: number | null
  confirmationState: AttendanceLedgerConfirmationState
  note: string
  version: number
  /** 没改动建议值时传 'auto'（以后跟着重算），其余传 'manual'（不再被覆盖）。 */
  actualMinutesSource?: 'auto' | 'manual'
}) {
  const response = await axiosInstance.post<AttendanceResponse<{ month: string, version: number, row: AttendanceLedgerRow }>>(`/attendance/ledger/rows/${encodeURIComponent(employeeId)}`, { ...entry, month })
  return response.data
}

/** 实到计算规则：实到 = 应出勤 − 请假 − 迟到/早退/无打卡扣减。数值按小时（无打卡按工作日）。 */
export interface AttendanceLedgerActualRule {
  lateWithin10Hours: number
  lateOver10Hours: number
  earlyLeaveHours: number
  noClockFullDays: number
}

/** 规则字段的标签与单位由后端给出，前端只负责渲染，避免两处口径写法漂移。 */
export interface AttendanceLedgerActualRuleField {
  key: keyof AttendanceLedgerActualRule
  label: string
  unit: 'hour' | 'day'
  max: number
}

export interface AttendanceLedgerActualRulePayload {
  rule: AttendanceLedgerActualRule
  /** 一个工作日的有效时长（分钟），用于说明「1 个工作日 = 几小时」。 */
  dayMinutes: number
  fields: AttendanceLedgerActualRuleField[]
}

export async function getAttendanceLedgerActualRule() {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceLedgerActualRulePayload>>('/attendance/ledger/actual-rule')
  return response.data
}

export async function saveAttendanceLedgerActualRule(rule: AttendanceLedgerActualRule) {
  const response = await axiosInstance.post<AttendanceResponse<AttendanceLedgerActualRulePayload>>('/attendance/ledger/actual-rule', { rule })
  return response.data
}

export async function importAttendanceLedgerRecords(month: string, rows: AttendanceLedgerImportEntry[]) {
  const response = await axiosInstance.post<AttendanceResponse<{ month: string, results: AttendanceLedgerImportResult[] }>>('/attendance/ledger/import', { month, rows })
  return response.data
}

export async function closeAttendanceLedger(month: string, version: number) {
  const response = await axiosInstance.post<AttendanceResponse<AttendanceLedger>>('/attendance/ledger/close', { month, version })
  return response.data
}

export async function reopenAttendanceLedger(month: string, version: number, reason: string) {
  const response = await axiosInstance.post<AttendanceResponse<AttendanceLedger>>('/attendance/ledger/reopen', { month, version, reason })
  return response.data
}

/**
 * 侧栏「待我审批」角标与页面待办链接用的计数。
 * 口径与 listRequests(view=inbox) 一致：只统计**轮到我审**的（currentApproverId + pending），
 * 否则角标数字会和点进去看到的条数对不上。
 */
export interface AttendanceApprovalCounts {
  leave: number
  overtime: number
  fieldwork: number
  appeal: number
  total: number
}

export async function getAttendanceApprovalCounts() {
  const response = await axiosInstance.get<AttendanceResponse<AttendanceApprovalCounts>>('/attendance/approvals/pending-counts')
  return response.data
}
