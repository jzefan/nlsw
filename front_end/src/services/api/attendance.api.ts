import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export type AttendanceRequestView = 'mine' | 'inbox' | 'history' | 'team'
export type AttendanceRequestKind = 'leave' | 'overtime' | 'fieldwork'

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
  reason?: string
  location?: string
  contact?: string
  workContent?: string
  attachments?: { id: string, name: string, mimeType: string, size: number }[]
  compensation?: 'comp_time' | 'overtime_pay' | string
  approvals?: { approverId?: string, role?: string, status?: string, comment?: string, reviewedAt?: string }[]
  currentApproverId?: string | null
  createdAt?: string
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
  fieldworkApprovedMinutes: number
  actualMinutes: number | null
  confirmationState: AttendanceLedgerConfirmationState
  note: string
  version: number
  requiresLeaveReconciliation?: boolean
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
  const response = await axiosInstance.get<AttendanceResponse<{ year: number, confirmed: boolean, defaultDays: AttendanceCalendarDay[], days: AttendanceCalendarDay[], workPeriods?: { start: string, end: string }[], official?: AttendanceOfficialCalendar }>>('/attendance/calendar', { params: { year } })
  return response.data
}

export async function saveAttendanceCalendarDay(year: number, date: string, type: AttendanceCalendarDay['type']) {
  const response = await axiosInstance.post<AttendanceResponse>('/attendance/calendar/day', { year, date, type })
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
}) {
  const response = await axiosInstance.post<AttendanceResponse<{ month: string, version: number, row: AttendanceLedgerRow }>>(`/attendance/ledger/rows/${encodeURIComponent(employeeId)}`, { ...entry, month })
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
