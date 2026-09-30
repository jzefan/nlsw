<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Check, Pencil, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  getAttendanceCalendar,
  getAttendanceLedgerActualRule,
  getAttendancePeople,
  getGeneralManagerDelegate,
  saveAttendanceCalendarDay,
  saveAttendanceCalendarSaturdayMorning,
  saveAttendanceLedgerActualRule,
  saveAttendanceProfile,
  saveGeneralManagerDelegate,
  type AttendanceCalendarDay,
  type AttendanceLedgerActualRule,
  type AttendanceLedgerActualRuleField,
  type AttendancePerson,
} from '@/services/api/attendance.api'
import { getPayrollRoleCandidates, savePayrollRoles, type PayrollRoleCandidate } from '@/services/api/payroll.api'
import { useAuthStore } from '@/stores/auth'
import { canSeeAttendanceSettings, canViewAttendanceSettingsView, visibleAttendanceSettingsViews, type AttendanceSettingsView } from '@/utils/attendance-settings'

/** 员工资料行的编辑草稿；只有点「编辑」后才写入，取消或保存后重置。 */
interface PersonDraft {
  phone: string
  employeeNo: string
  department: string
  managerId: string
  attendanceRoles: string[]
  attendanceTracked: boolean
}

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const roles = computed(() => {
  const values = authStore.user?.attendanceRoles
  return Array.isArray(values) ? values : values ? [values] : []
})
const payrollRoles = computed(() => {
  const values = authStore.user?.payrollRoles
  return Array.isArray(values) ? values : values ? [values] : []
})
const isOwner = computed(() => authStore.isOwner)
/** 左侧菜单与页面用同一份可见性规则，避免菜单能点、进来了却说无权。 */
const settingsRoles = computed(() => ({
  isOwner: isOwner.value,
  isAppAdmin: authStore.isAppAdmin,
  attendanceRoles: roles.value,
  payrollRoles: payrollRoles.value,
}))
const canManageCalendar = computed(() => canViewAttendanceSettingsView('calendar', settingsRoles.value))
const canManagePeople = computed(() => canViewAttendanceSettingsView('people', settingsRoles.value))
const canManagePayrollRoles = computed(() => canViewAttendanceSettingsView('payroll', settingsRoles.value))
const visibleViews = computed(() => visibleAttendanceSettingsViews(settingsRoles.value))
const canSeeSettings = computed(() => canSeeAttendanceSettings(settingsRoles.value))

const people = ref<AttendancePerson[]>([])
const peopleLoading = ref(false)
const savingUser = ref('')
const editingUserId = ref('')
const personDrafts = reactive<Record<string, PersonDraft>>({})
const savingPayrollUser = ref('')
const payrollCandidates = ref<PayrollRoleCandidate[]>([])
const payrollCandidatesLoading = ref(false)
const financeRoleDrafts = ref<Record<string, boolean>>({})
const editingPayrollUserId = ref('')
const delegateId = ref('')
const delegateSaving = ref(false)
const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date()))
const year = ref(currentYear)
const defaultDays = ref<AttendanceCalendarDay[]>([])
const days = ref<AttendanceCalendarDay[]>([])
const calendarConfirmed = ref(false)
const calendarLoading = ref(false)
const calendarSaving = ref(false)
const savingCalendarDate = ref('')
const calendarLoadSucceeded = ref(false)
const calendarLoadedYear = ref(0)
const calendarRequestId = ref(0)
/** 该年度国务院安排的获取结果：'' 尚未请求 / cached 本地已有 / fetched 本次从线上取得并入库 / unpublished 官方尚未公布 / unavailable 没连上 */
const officialStatus = ref<'' | 'cached' | 'fetched' | 'unpublished' | 'unavailable'>('')
/** 实到分钟计算规则：字段标签与单位由后端给，前端只负责渲染，避免两处口径写法漂移。 */
const actualRuleFields = ref<AttendanceLedgerActualRuleField[]>([])
const actualRuleDraft = ref<Record<string, string>>({})
const actualRuleBaseline = ref<AttendanceLedgerActualRule | null>(null)
const actualRuleDayMinutes = ref(0)
const actualRuleSaving = ref(false)
const actualRuleLoaded = ref(false)
/** 「1 个工作日 = 几小时」，无打卡记录按工作日扣，写出来免得使用者猜。 */
const actualRuleDayHours = computed(() => {
  const hours = actualRuleDayMinutes.value / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
})
const actualRuleDirty = computed(() => {
  const baseline = actualRuleBaseline.value
  if (!baseline) return false
  return actualRuleFields.value.some(field => Number(actualRuleDraft.value[field.key]) !== Number(baseline[field.key]))
})
/** 特殊情况：每周六上午算工作日（法定节假日与调休上班日除外），租户级开关，不按年度区分。 */
const saturdayMorning = ref(false)
const saturdayMorningPeriods = ref<{ start: string, end: string }[]>([])
const savingSaturdayMorning = ref(false)
const CALENDAR_BASE_YEAR = 2026
/** 年度下拉：2026 年（国务院安排起始年）到当前年份后 10 年；当前年份早于 2026 时从当前年份起。 */
const yearOptions = computed(() => {
  const options: number[] = []
  for (let value = Math.min(CALENDAR_BASE_YEAR, currentYear); value <= currentYear + 10; value++) options.push(value)
  // 更早年度若已确认过日历，也让当前值留在下拉里，否则会显示成空白
  if (!options.includes(year.value)) options.push(year.value)
  return options.sort((a, b) => a - b)
})
/** 下拉只接受字符串值，这里包一层，不改动 year 的数值语义。 */
const selectedYear = computed({
  get: () => String(year.value),
  set: (value: string) => { year.value = Number(value) },
})
const weekHeaders = ['日', '一', '二', '三', '四', '五', '六']
const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const calendarMonths = computed(() => Array.from({ length: 12 }, (_, monthIndex) => {
  const month = monthIndex + 1
  const firstWeekday = new Date(Date.UTC(year.value, monthIndex, 1)).getUTCDay()
  const dayCount = new Date(Date.UTC(year.value, month, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= dayCount; day++) cells.push(`${year.value}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return { month, cells }
}))
const officialHolidayCount = computed(() => defaultDays.value.filter(day => day.type === 'holiday').length)
const officialWorkdayCount = computed(() => defaultDays.value.filter(day => day.type === 'workday').length)
// 「总经理」由用户管理的职位决定，这里不提供勾选
const roleOptions = [
  { value: 'manager', label: '经理' },
  { value: 'attendance_admin', label: '考勤管理员' },
]
// 「总经理」不在勾选项里，但摘要仍要显示中文
const roleLabels: Record<string, string> = { manager: '经理', general_manager: '总经理', attendance_admin: '考勤管理员' }

/** 左侧菜单用 ?tab= 指定当前视图；没带参数（旧书签、直接进地址）时落到第一个可见视图。 */
function resolveView(): AttendanceSettingsView | '' {
  const requested = String(route.query.tab ?? '')
  const views = visibleViews.value
  return (views.find(view => view.value === requested) ?? views[0])?.value ?? ''
}
const activeView = ref<AttendanceSettingsView | ''>(resolveView())
const loadedViews = new Set<string>()

function extractList<T>(response: Record<string, unknown>, key: string): T[] {
  const data = response.data
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) return (data as Record<string, unknown>)[key] as T[]
  if (Array.isArray(response[key])) return response[key] as T[]
  return []
}
function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, msg?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.msg || value?.response?.data?.error || value?.message || '操作失败')
}
function ensureRoles(person: AttendancePerson) {
  if (!Array.isArray(person.attendanceRoles)) person.attendanceRoles = []
}
function makePersonDraft(person: AttendancePerson): PersonDraft {
  ensureRoles(person)
  return {
    phone: person.phone ?? '',
    employeeNo: person.employeeNo ?? '',
    department: person.department ?? '',
    managerId: person.managerId ?? '',
    attendanceRoles: [...person.attendanceRoles!],
    attendanceTracked: person.attendanceTracked !== false,
  }
}
function isPersonEditing(person: AttendancePerson) {
  return editingUserId.value === person.userId
}
function isPersonDirty(person: AttendancePerson) {
  const draft = personDrafts[person.userId]
  if (!draft) return false
  ensureRoles(person)
  return draft.phone.trim() !== (person.phone ?? '').trim()
    || draft.employeeNo.trim() !== (person.employeeNo ?? '').trim()
    || draft.department.trim() !== (person.department ?? '').trim()
    || draft.managerId !== (person.managerId ?? '')
    || draft.attendanceTracked !== (person.attendanceTracked !== false)
    || [...draft.attendanceRoles].sort().join(',') !== [...person.attendanceRoles!].sort().join(',')
}
function startEditPerson(person: AttendancePerson) {
  if (isPersonEditing(person)) return
  if (people.value.some(isPersonDirty)) {
    toast.error('请先保存当前修改')
    return
  }
  personDrafts[person.userId] = makePersonDraft(person)
  editingUserId.value = person.userId
}
function cancelEditPerson(person: AttendancePerson) {
  personDrafts[person.userId] = makePersonDraft(person)
  editingUserId.value = ''
}
function draftRoles(person: AttendancePerson) {
  return personDrafts[person.userId]?.attendanceRoles ?? []
}
function hasDraftRole(person: AttendancePerson, role: string) {
  return draftRoles(person).includes(role)
}
function toggleDraftRole(person: AttendancePerson, role: string, checked: boolean) {
  const draft = personDrafts[person.userId]
  if (!draft) return
  draft.attendanceRoles = checked
    ? [...new Set([...draft.attendanceRoles, role])]
    : draft.attendanceRoles.filter(value => value !== role)
}
function managerLabel(managerId: string | undefined) {
  if (!managerId) return '—'
  const manager = people.value.find(item => item.userId === managerId)
  return manager?.displayName || manager?.name || manager?.userid || '—'
}
/** 编辑态下拉的显示值：未选择时留空，由占位提示而不是「无」来表达。 */
function draftManagerLabel(person: AttendancePerson) {
  const managerId = personDrafts[person.userId]?.managerId
  return managerId ? managerLabel(managerId) : ''
}
/** 该员工当前考勤角色的可读摘要，没有角色时按约定显示「无」；编辑中按草稿实时显示。 */
function roleSummary(person: AttendancePerson) {
  const values = isPersonEditing(person) ? draftRoles(person) : (person.attendanceRoles ?? [])
  return values.length ? values.map(value => roleLabels[value] || value).join('、') : '无'
}
/**
 * 与后端 utils/person-label.js 同一套规则，仅用于「保存后本地刷新选人下拉的显示名」，
 * 免得改了工号/手机号/部门后下拉里还是旧文本（本页 tab 只加载一次，不会自动重拉）。
 * 规则改动时两边要一起改。
 */
function applyPersonLabels() {
  const rows = people.value
  const nameCounts = new Map<string, number>()
  for (const row of rows) {
    const key = row.name || row.userid || ''
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }
  for (const row of rows) {
    const name = row.name || row.userid || ''
    const suffix = row.employeeNo?.trim() || row.phone?.trim() || row.department?.trim() || ((nameCounts.get(name) ?? 0) > 1 ? (row.userid || '') : '')
    row.displayName = suffix ? `${name}（${suffix}）` : name
  }
  const labels = new Map<string, number>()
  for (const row of rows) labels.set(row.displayName || row.name, (labels.get(row.displayName || row.name) ?? 0) + 1)
  for (const row of rows) {
    if ((labels.get(row.displayName || row.name) ?? 0) > 1) row.displayName = `${row.displayName || row.name}（账号 ${row.userid || row.userId}）`
  }
}
async function loadPeople() {
  if (!canManagePeople.value) return
  peopleLoading.value = true
  try {
    const result = await getAttendancePeople()
    people.value = extractList<AttendancePerson>(result as Record<string, unknown>, 'people').map(person => ({
      ...person,
      attendanceRoles: [...(person.attendanceRoles ?? [])],
      payrollRoles: [...(person.payrollRoles ?? [])],
    }))
    editingUserId.value = ''
    for (const key of Object.keys(personDrafts)) delete personDrafts[key]
    for (const person of people.value) personDrafts[person.userId] = makePersonDraft(person)
    if (isOwner.value) {
      const delegate = await getGeneralManagerDelegate()
      delegateId.value = String(delegate.data?.generalManagerDelegateId ?? '')
    }
  }
  catch (error) { showError(error) }
  finally { peopleLoading.value = false }
}

async function loadPayrollCandidates() {
  if (!canManagePayrollRoles.value) return
  payrollCandidatesLoading.value = true
  try {
    const response = await getPayrollRoleCandidates()
    if (response.ok === false) throw new Error(String(response.error || '读取薪资权限失败'))
    payrollCandidates.value = Array.isArray(response.data) ? response.data : []
    editingPayrollUserId.value = ''
    financeRoleDrafts.value = Object.fromEntries(payrollCandidates.value.map(candidate => [candidate.userId, candidate.payrollRoles.includes('finance')]))
  }
  catch (error) { showError(error) }
  finally { payrollCandidatesLoading.value = false }
}

/** 三个视图都含未保存编辑，首次进入后不重复拉取，避免冲掉用户输入。 */
async function loadViewData(view: AttendanceSettingsView) {
  if (loadedViews.has(view)) return
  loadedViews.add(view)
  if (view === 'people') await loadPeople()
  else if (view === 'payroll') await loadPayrollCandidates()
  else {
    await loadCalendar()
    await loadActualRule()
  }
}

async function loadActualRule() {
  if (!canManageCalendar.value) return
  try {
    const response = await getAttendanceLedgerActualRule()
    if (response.ok === false) throw new Error(String(response.error || '读取实到计算规则失败'))
    const data = response.data
    if (!data?.rule) throw new Error('读取实到计算规则失败')
    actualRuleFields.value = data.fields ?? []
    actualRuleBaseline.value = data.rule
    actualRuleDraft.value = Object.fromEntries(Object.entries(data.rule).map(([key, value]) => [key, String(value)]))
    actualRuleDayMinutes.value = data.dayMinutes ?? 0
    actualRuleLoaded.value = true
  }
  catch (error) { showError(error) }
}

async function saveActualRule() {
  if (actualRuleSaving.value || !actualRuleFields.value.length) return
  const rule = {} as AttendanceLedgerActualRule
  for (const field of actualRuleFields.value) {
    const text = String(actualRuleDraft.value[field.key] ?? '').trim()
    const value = Number(text)
    if (!text || !Number.isFinite(value) || value < 0 || value > field.max) {
      toast.error(`${field.label}应填写 0 至 ${field.max} 之间的数字`)
      return
    }
    rule[field.key] = value
  }
  actualRuleSaving.value = true
  try {
    const response = await saveAttendanceLedgerActualRule(rule)
    if (response.ok === false) throw new Error(String(response.error || '保存实到计算规则失败'))
    const data = response.data
    if (data?.rule) {
      actualRuleBaseline.value = data.rule
      actualRuleDraft.value = Object.fromEntries(Object.entries(data.rule).map(([key, value]) => [key, String(value)]))
    }
    if (typeof data?.dayMinutes === 'number') actualRuleDayMinutes.value = data.dayMinutes
    toast.success('实到计算规则已保存')
  }
  catch (error) { showError(error) }
  finally { actualRuleSaving.value = false }
}

/** 左侧菜单切换视图只改查询参数，页面不会重建，所以在地址变化时响应。 */
async function applyRouteView() {
  if (!canSeeSettings.value) return
  const next = resolveView()
  activeView.value = next
  if (!next) return
  // 地址里没带视图时补上，左侧菜单才能高亮到对应项
  if (String(route.query.tab ?? '') !== next) await router.replace({ path: '/attendance/settings', query: { tab: next } })
  await loadViewData(next)
}

async function saveDelegate() {
  delegateSaving.value = true
  try {
    await saveGeneralManagerDelegate(delegateId.value || null)
    toast.success('代理审批人已保存')
  }
  catch (error) { showError(error) }
  finally { delegateSaving.value = false }
}

function reloadPeople() {
  if (people.value.some(isPersonDirty)) {
    toast.error('请先保存当前修改')
    return
  }
  void loadPeople()
}

async function confirmPerson(person: AttendancePerson) {
  if (isPersonDirty(person)) { await savePerson(person); return }
  cancelEditPerson(person)
}

async function savePerson(person: AttendancePerson) {
  const draft = personDrafts[person.userId] ?? makePersonDraft(person)
  const submitted = {
    userId: person.userId,
    employeeNo: draft.employeeNo.trim(),
    phone: draft.phone.trim(),
    department: draft.department.trim(),
    managerId: draft.managerId || '',
    attendanceRoles: [...draft.attendanceRoles],
    attendanceTracked: draft.attendanceTracked,
  }
  savingUser.value = person.userId
  try {
    const response = await saveAttendanceProfile(submitted)
    const saved = response.data as Partial<AttendancePerson> | undefined
    Object.assign(person, submitted, saved ?? {})
    personDrafts[person.userId] = makePersonDraft(person)
    editingUserId.value = ''
    applyPersonLabels()
    toast.success('员工资料已保存')
  }
  catch (error) { showError(error) }
  finally { savingUser.value = '' }
}

function isSelfCandidate(candidate: PayrollRoleCandidate) {
  return candidate.userId === authStore.user?.id || candidate.userId === authStore.user?.userid
}

/** 有权限编辑这一行的财务角色：主账号/管理员/总经理，且不是本人、账号在职。 */
function canEditPayrollRow(candidate: PayrollRoleCandidate) {
  return canManagePayrollRoles.value && !isSelfCandidate(candidate) && candidate.status !== 'disabled'
}

function isPayrollEditing(candidate: PayrollRoleCandidate) {
  return editingPayrollUserId.value === candidate.userId
}

function hasUnsavedPayrollEdits() {
  return payrollCandidates.value.some(candidate => isPayrollDirty(candidate))
}

function isPayrollDirty(candidate: PayrollRoleCandidate) {
  const draft = financeRoleDrafts.value[candidate.userId]
  return typeof draft === 'boolean' && draft !== candidate.payrollRoles.includes('finance')
}

function startEditPayroll(candidate: PayrollRoleCandidate) {
  if (isPayrollEditing(candidate)) return
  if (hasUnsavedPayrollEdits()) {
    toast.error('请先保存当前修改')
    return
  }
  financeRoleDrafts.value[candidate.userId] = candidate.payrollRoles.includes('finance')
  editingPayrollUserId.value = candidate.userId
}

function cancelEditPayroll(candidate: PayrollRoleCandidate) {
  financeRoleDrafts.value[candidate.userId] = candidate.payrollRoles.includes('finance')
  editingPayrollUserId.value = ''
}

function reloadPayrollCandidates() {
  if (hasUnsavedPayrollEdits()) {
    toast.error('请先保存当前修改')
    return
  }
  editingPayrollUserId.value = ''
  void loadPayrollCandidates()
}

/** 无改动时点对勾只退出编辑；有改动才提交。 */
async function confirmPayrollRow(candidate: PayrollRoleCandidate) {
  if (!isPayrollDirty(candidate)) {
    cancelEditPayroll(candidate)
    return
  }
  if (await saveFinanceRole(candidate)) cancelEditPayroll(candidate)
}

async function saveFinanceRole(candidate: PayrollRoleCandidate) {
  if (!canEditPayrollRow(candidate) || savingPayrollUser.value) return false
  const submittedRoles: 'finance'[] = financeRoleDrafts.value[candidate.userId] ? ['finance'] : []
  savingPayrollUser.value = candidate.userId
  try {
    const response = await savePayrollRoles(candidate.userId, submittedRoles)
    if (response.ok === false) throw new Error(String(response.error || '保存财务权限失败'))
    const data = response.data as { payrollRoles?: string[] } | undefined
    candidate.payrollRoles = [...(data?.payrollRoles ?? submittedRoles)] as PayrollRoleCandidate['payrollRoles']
    financeRoleDrafts.value[candidate.userId] = candidate.payrollRoles.includes('finance')
    toast.success('财务权限已保存')
    return true
  }
  catch (error) { showError(error); return false }
  finally { savingPayrollUser.value = '' }
}

async function loadCalendar(targetYear = year.value) {
  if (!canManageCalendar.value) return
  const requestId = ++calendarRequestId.value
  calendarLoadedYear.value = targetYear
  calendarLoadSucceeded.value = false
  defaultDays.value = []
  days.value = []
  calendarConfirmed.value = false
  officialStatus.value = ''
  calendarLoading.value = true
  try {
    const response = await getAttendanceCalendar(targetYear)
    if (response.ok === false) throw new Error(String(response.error || '读取工作日历失败'))
    const data = response.data
    if (requestId !== calendarRequestId.value || targetYear !== year.value) return
    defaultDays.value = data?.defaultDays ?? []
    days.value = data?.days ?? (Array.isArray(response.data) ? response.data : [])
    calendarConfirmed.value = data?.confirmed === true
    officialStatus.value = data?.official?.status ?? ''
    saturdayMorning.value = data?.saturdayMorning?.enabled === true
    saturdayMorningPeriods.value = data?.saturdayMorning?.periods ?? []
    calendarLoadSucceeded.value = true
  }
  catch (error) {
    if (requestId === calendarRequestId.value) showError(error)
  }
  finally {
    if (requestId === calendarRequestId.value) calendarLoading.value = false
  }
}

function dayType(date: string) {
  const override = days.value.find(item => item.date === date)?.type
  if (override === 'holiday' || override === 'workday') return override
  const defaultDay = defaultDays.value.find(item => item.date === date)?.type
  if (defaultDay === 'holiday' || defaultDay === 'workday') return defaultDay
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return weekday === 0 || weekday === 6 ? 'holiday' : 'workday'
}

/** 周六上午上班的普通周六：国务院放假/调休与管理员单日覆盖都不涉及它，才按半天算。 */
function isHalfDaySaturday(date: string) {
  if (!saturdayMorning.value) return false
  if (days.value.some(item => item.date === date)) return false
  if (defaultDays.value.some(item => item.date === date)) return false
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 6
}

function holidayName(date: string) {
  return defaultDays.value.find(item => item.date === date && item.type === 'holiday')?.name || ''
}

function dayLabel(date: string) {
  if (isHalfDaySaturday(date)) return '周六上午上班'
  return dayType(date) === 'workday' ? '上班' : '休息'
}

function dayAriaLabel(date: string) {
  const [dateYear, month, day] = date.split('-').map(Number)
  const name = holidayName(date)
  return `${dateYear}年${month}月${day}日，${dayLabel(date)}${name ? `，${name}` : ''}`
}

async function toggleCalendarDay(date: string) {
  if (!calendarLoadSucceeded.value || calendarLoadedYear.value !== year.value || calendarSaving.value) return
  const nextType = dayType(date) === 'holiday' ? 'workday' : 'holiday'
  const previousDays = days.value
  days.value = [...previousDays.filter(day => day.date !== date), { date, type: nextType }]
  calendarSaving.value = true
  savingCalendarDate.value = date
  try {
    const result = await saveAttendanceCalendarDay(year.value, date, nextType)
    if (result.ok === false) throw new Error(String(result.error || '更新工作日失败'))
    calendarConfirmed.value = true
    window.dispatchEvent(new CustomEvent('attendance-calendar-updated', { detail: { year: year.value } }))
    toast.success(`${date}已设为${nextType === 'holiday' ? '休息日' : '上班日'}`)
  }
  catch (error) {
    days.value = previousDays
    showError(error)
  }
  finally {
    calendarSaving.value = false
    savingCalendarDate.value = ''
  }
}

/** 周六上午上班是租户级设置，影响所有年度，所以派发不带年度的失效事件。 */
async function saveSaturdayMorning(enabled: boolean) {
  if (savingSaturdayMorning.value) return
  const previousEnabled = saturdayMorning.value
  const previousPeriods = saturdayMorningPeriods.value
  saturdayMorning.value = enabled
  savingSaturdayMorning.value = true
  try {
    const result = await saveAttendanceCalendarSaturdayMorning(enabled)
    if (result.ok === false) throw new Error(String(result.error || '保存周六上午上班失败'))
    saturdayMorningPeriods.value = result.data?.periods ?? []
    window.dispatchEvent(new CustomEvent('attendance-calendar-updated'))
    toast.success(enabled ? '周六上午已按工作日计' : '周六上午不再计入工作日')
  }
  catch (error) {
    saturdayMorning.value = previousEnabled
    saturdayMorningPeriods.value = previousPeriods
    showError(error)
  }
  finally {
    savingSaturdayMorning.value = false
  }
}

// 年度只能从下拉里选，非法值进不来，不再需要范围校验
watch(year, (nextYear) => {
  if (nextYear === calendarLoadedYear.value) return
  void loadCalendar(nextYear)
})
watch(() => route.query.tab, () => { void applyRouteView() })
onMounted(() => { void applyRouteView() })

</script>

<template>
  <main class="space-y-5 p-4 md:p-0">
    <div v-if="!canSeeSettings" class="rounded-md border p-8 text-center text-sm text-muted-foreground">无权查看设置</div>

    <div v-else-if="activeView === 'people'" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-lg font-semibold">员工资料</h1>
        <div class="flex items-center gap-2">
          <Badge variant="outline">{{ people.length }} 人</Badge>
          <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" :disabled="peopleLoading" @click="reloadPeople">刷新</Button>
        </div>
      </div>
      <div class="overflow-x-auto rounded-md border bg-background">
        <Table class="min-w-[1080px]">
          <TableHeader><TableRow><TableHead class="w-36">员工姓名</TableHead><TableHead class="w-36">手机号</TableHead><TableHead class="w-24">工号</TableHead><TableHead class="w-36">部门</TableHead><TableHead class="w-40">直属经理</TableHead><TableHead class="w-52">考勤角色</TableHead><TableHead class="w-28">考勤统计</TableHead><TableHead class="w-24 text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-if="peopleLoading"><TableCell colspan="8" class="h-16 text-center text-muted-foreground">加载中…</TableCell></TableRow>
            <TableRow v-else-if="!people.length"><TableCell colspan="8" class="h-16 text-center text-muted-foreground">暂无员工</TableCell></TableRow>
            <TableRow v-for="person in people" :key="person.userId">
              <TableCell><div class="font-medium">{{ person.name || '未命名' }}</div><div v-if="person.status !== 'active'" class="text-xs text-muted-foreground">已停用</div></TableCell>
              <TableCell>
                <Input v-if="isPersonEditing(person)" v-model="personDrafts[person.userId].phone" class="h-8 tabular-nums" placeholder="" aria-label="手机号" />
                <span v-else class="tabular-nums">{{ person.phone || '—' }}</span>
              </TableCell>
              <TableCell>
                <Input v-if="isPersonEditing(person)" v-model="personDrafts[person.userId].employeeNo" class="h-8 tabular-nums" placeholder="" aria-label="工号（选填）" />
                <span v-else class="tabular-nums">{{ person.employeeNo || '—' }}</span>
              </TableCell>
              <TableCell>
                <Input v-if="isPersonEditing(person)" v-model="personDrafts[person.userId].department" class="h-8" placeholder="" aria-label="部门" />
                <span v-else>{{ person.department || '—' }}</span>
              </TableCell>
              <TableCell>
                <Select v-if="isPersonEditing(person)" :model-value="personDrafts[person.userId].managerId || '__none__'" @update:model-value="value => personDrafts[person.userId].managerId = value == null || value === '__none__' ? '' : String(value)">
                  <SelectTrigger size="sm" class="w-full" :aria-label="`${person.name || person.userid}直属经理`"><SelectValue placeholder="">{{ draftManagerLabel(person) }}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">无</SelectItem>
                    <SelectItem v-for="candidate in people.filter(item => item.status === 'active')" :key="candidate.userId" :value="candidate.userId" :disabled="candidate.userId === person.userId">{{ candidate.displayName || candidate.name || candidate.userid }}</SelectItem>
                  </SelectContent>
                </Select>
                <span v-else>{{ managerLabel(person.managerId) }}</span>
              </TableCell>
              <TableCell>
                <div v-if="!isPersonEditing(person)" class="text-xs text-muted-foreground">{{ roleSummary(person) }}</div>
                <div v-else class="flex flex-wrap gap-x-3 gap-y-1">
                  <div v-for="role in roleOptions" :key="role.value" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox :id="`attendance-role-${person.userId}-${role.value}`" :model-value="hasDraftRole(person, role.value)" :disabled="person.status !== 'active' && !hasDraftRole(person, role.value)" @update:model-value="checked => toggleDraftRole(person, role.value, checked === true)" />
                    <label :for="`attendance-role-${person.userId}-${role.value}`">{{ role.label }}</label>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div v-if="isPersonEditing(person)" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox :id="`attendance-tracked-${person.userId}`" :model-value="personDrafts[person.userId].attendanceTracked" @update:model-value="checked => personDrafts[person.userId].attendanceTracked = checked === true" />
                  <label :for="`attendance-tracked-${person.userId}`">纳入</label>
                </div>
                <span v-else :class="person.attendanceTracked === false ? 'text-muted-foreground' : ''">{{ person.attendanceTracked === false ? '不纳入' : '纳入' }}</span>
              </TableCell>
              <TableCell class="text-right">
                <template v-if="isPersonEditing(person)">
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingUser === person.userId" :aria-label="`取消编辑员工资料：${person.name || person.userid}`" title="放弃修改" @click="cancelEditPerson(person)"><X class="size-4" /></Button>
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingUser === person.userId" :aria-label="`保存员工资料：${person.name || person.userid}`" title="保存本行" @click="confirmPerson(person)"><Check class="size-4" /></Button>
                </template>
                <Button v-else size="sm" variant="ghost" class="h-8 w-7 px-0" :aria-label="`编辑员工资料：${person.name || person.userid}`" title="编辑本行" @click="startEditPerson(person)"><Pencil class="size-4" /></Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div v-if="isOwner" class="flex flex-wrap items-end gap-3 rounded-md border bg-background p-3">
        <div class="min-w-44 flex-1">
          <label for="gm-delegate" class="text-sm font-medium">总经理申请审批人</label>
          <p class="mt-0.5 text-xs text-muted-foreground">总经理本人提交的申请由该员工审批</p>
        </div>
        <Select :model-value="delegateId || '__none__'" @update:model-value="value => delegateId = value == null || value === '__none__' ? '' : String(value)">
          <SelectTrigger id="gm-delegate" class="min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不指定</SelectItem>
            <SelectItem v-for="person in people.filter(item => item.status === 'active' && !item.attendanceRoles?.includes('general_manager'))" :key="person.userId" :value="person.userId">{{ person.displayName || person.name || person.userid }}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" :disabled="delegateSaving || peopleLoading" @click="saveDelegate">{{ delegateSaving ? '保存中…' : '保存' }}</Button>
      </div>
    </div>

    <div v-else-if="activeView === 'payroll'" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-lg font-semibold">薪资权限</h1>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" :disabled="payrollCandidatesLoading" @click="reloadPayrollCandidates">刷新</Button>
        </div>
      </div>
      <div class="overflow-x-auto rounded-md border bg-background">
        <Table class="min-w-[720px]">
          <TableHeader><TableRow><TableHead class="w-48">员工</TableHead><TableHead class="w-28">工号</TableHead><TableHead>部门</TableHead><TableHead class="w-36">薪资身份</TableHead><TableHead class="w-36 text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-if="payrollCandidatesLoading"><TableCell colspan="5" class="h-16 text-center text-muted-foreground">加载中…</TableCell></TableRow>
            <TableRow v-else-if="!payrollCandidates.length"><TableCell colspan="5" class="h-16 text-center text-muted-foreground">暂无可配置员工</TableCell></TableRow>
            <TableRow v-for="candidate in payrollCandidates" :key="candidate.userId">
              <TableCell><div class="font-medium">{{ candidate.name || candidate.userId }}</div><div class="text-xs text-muted-foreground"><span v-if="candidate.status !== 'active'">已停用</span><span v-else>在职</span></div></TableCell>
              <TableCell class="tabular-nums">{{ candidate.employeeNo || '—' }}</TableCell>
              <TableCell>{{ candidate.department || '—' }}</TableCell>
              <TableCell>
                <div v-if="!isPayrollEditing(candidate)" class="flex flex-wrap gap-1"><Badge v-if="candidate.payrollRoles.includes('general_manager')" variant="outline">总经理</Badge><Badge v-if="candidate.payrollRoles.includes('finance')" variant="outline">财务</Badge><span v-if="!candidate.payrollRoles.length" class="text-xs text-muted-foreground">无</span></div>
                <div v-else class="space-y-1">
                  <div v-if="candidate.payrollRoles.includes('general_manager')" class="flex flex-wrap gap-1"><Badge variant="outline">总经理</Badge><span class="text-xs text-muted-foreground">由职位决定</span></div>
                  <div class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox :id="`finance-role-${candidate.userId}`" :model-value="financeRoleDrafts[candidate.userId]" :disabled="savingPayrollUser === candidate.userId" @update:model-value="checked => financeRoleDrafts[candidate.userId] = checked === true" />
                    <label :for="`finance-role-${candidate.userId}`">财务</label>
                  </div>
                </div>
              </TableCell>
              <TableCell class="text-right">
                <template v-if="isPayrollEditing(candidate)">
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingPayrollUser === candidate.userId" :aria-label="`取消编辑${candidate.name}财务权限`" title="放弃修改" @click="cancelEditPayroll(candidate)"><X class="size-4" /></Button>
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingPayrollUser === candidate.userId" :aria-label="`保存${candidate.name}财务权限`" title="保存本行" @click="confirmPayrollRow(candidate)"><Check class="size-4" /></Button>
                </template>
                <Button v-else-if="canEditPayrollRow(candidate)" size="sm" variant="ghost" class="h-8 w-7 px-0" :aria-label="`编辑${candidate.name}财务权限`" title="编辑本行" @click="startEditPayroll(candidate)"><Pencil class="size-4" /></Button>
                <span v-else-if="isSelfCandidate(candidate)" class="text-xs text-muted-foreground">不能修改本人</span>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <div v-else-if="activeView === 'calendar'" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="text-lg font-semibold">工作日历设置</h1>
        <div class="flex items-center gap-2">
          <label class="text-sm text-muted-foreground" for="attendance-year">年度</label>
          <Select v-model="selectedYear" :disabled="calendarLoading || calendarSaving">
            <SelectTrigger id="attendance-year" class="w-28 tabular-nums"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in yearOptions" :key="option" :value="String(option)">{{ option }}</SelectItem>
            </SelectContent>
          </Select>
          <Badge v-if="calendarConfirmed" variant="outline" class="font-normal">日历可用</Badge>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"><span class="inline-flex size-5 items-center justify-center rounded bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">休</span>休息日</span>
        <span class="inline-flex items-center gap-1.5"><span class="inline-flex size-5 items-center justify-center rounded bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">班</span>周末调休上班</span>
        <span v-if="saturdayMorning" class="inline-flex items-center gap-1.5"><span class="inline-flex size-5 items-center justify-center rounded bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">半</span>周六上午上班</span>
        <span v-if="officialHolidayCount" class="sm:ml-auto">国务院安排：{{ officialHolidayCount }} 个假期日 · {{ officialWorkdayCount }} 个调休工作日</span>
        <span v-else-if="officialStatus === 'unpublished'" class="sm:ml-auto">{{ year }} 年国务院安排尚未公布，法定节假日与调休上班日暂未知</span>
        <span v-else-if="officialStatus === 'unavailable'" class="sm:ml-auto">未能在线获取 {{ year }} 年国务院安排，法定节假日与调休上班日暂未知</span>
        <span v-else class="sm:ml-auto">{{ saturdayMorning ? '按周一至周五上班、周六上午上班' : '按周一至周五上班、周末休息' }}</span>
        <span v-if="calendarSaving" class="basis-full text-primary sm:basis-auto">正在保存 {{ savingCalendarDate }}…</span>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
        <Switch
          id="attendance-saturday-morning"
          :model-value="saturdayMorning"
          :disabled="savingSaturdayMorning || calendarLoading || !calendarLoadSucceeded"
          @update:model-value="saveSaturdayMorning"
        />
        <label for="attendance-saturday-morning" class="text-sm">周六上午按工作日计</label>
        <span v-if="saturdayMorning" class="text-xs text-muted-foreground">计入 {{ saturdayMorningPeriods.map(item => `${item.start}–${item.end}`).join('、') }}，法定节假日与调休上班日除外</span>
        <span v-else class="text-xs text-muted-foreground">法定节假日与调休上班日除外，半天计入月应出勤</span>
        <span v-if="savingSaturdayMorning" class="text-primary">正在保存…</span>
      </div>
      <section class="rounded-lg border px-3 py-2.5">
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div class="min-w-0">
            <h2 class="text-sm font-medium">实到分钟计算规则</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">台账的实到 = 应出勤 − 请假 − 以下扣减，自动填入供确认，可改成实际值；改过的行不再被覆盖。1 个工作日 = {{ actualRuleDayHours }} 小时。</p>
          </div>
          <Button size="sm" variant="outline" :disabled="actualRuleSaving || !actualRuleDirty" @click="saveActualRule">{{ actualRuleSaving ? '保存中…' : '保存' }}</Button>
        </div>
        <div v-if="actualRuleFields.length" class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label v-for="field in actualRuleFields" :key="field.key" class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground">{{ field.label }}</span>
            <Input v-model="actualRuleDraft[field.key]" class="h-7 w-16 text-right tabular-nums" inputmode="decimal" :aria-label="`${field.label}每次扣减`" />
            <span class="text-muted-foreground">{{ field.unit === 'hour' ? '小时/次' : '工作日/次' }}</span>
          </label>
        </div>
        <p v-else class="mt-2 text-xs text-muted-foreground">{{ actualRuleLoaded ? '规则不可用' : '加载中…' }}</p>
      </section>
      <div v-if="calendarLoading" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <div v-for="month in 12" :key="month" class="h-64 animate-pulse rounded-lg border bg-muted/30" />
      </div>
      <div v-else-if="!calendarLoadSucceeded" class="flex flex-wrap items-center justify-center gap-3 rounded-lg border py-12 text-sm text-muted-foreground">
        <span>未能读取工作日历。</span>
        <Button size="sm" variant="outline" :disabled="calendarSaving" @click="loadCalendar(year)">重试</Button>
      </div>
      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <section v-for="month in calendarMonths" :key="month.month" class="min-w-0 rounded-lg border bg-card p-3">
          <h3 class="mb-2 text-sm font-semibold">{{ month.month }}月</h3>
          <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            <span v-for="(weekday, index) in weekHeaders" :key="weekday" class="py-1" :class="index === 0 || index === 6 ? 'text-rose-700/70 dark:text-rose-300/70' : ''">{{ weekday }}</span>
            <template v-for="(date, cellIndex) in month.cells" :key="date || `blank-${cellIndex}`">
              <span v-if="!date" aria-hidden="true" class="aspect-square" />
              <button
                v-else
                type="button"
                class="relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-md text-xs tabular-nums transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                :class="[
                  dayType(date) === 'holiday' && !isHalfDaySaturday(date) ? 'bg-rose-50/80 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-900/50' : 'text-foreground',
                  date === todayDate ? 'ring-1 ring-primary ring-offset-1 ring-offset-background' : '',
                  date === savingCalendarDate ? 'animate-pulse' : '',
                ]"
                :aria-label="dayAriaLabel(date)"
                :title="`${dayAriaLabel(date)}，点击切换`"
                :disabled="calendarSaving || calendarLoading"
                @click="toggleCalendarDay(date)"
              >
                <span>{{ Number(date.slice(-2)) }}</span>
                <span v-if="holidayName(date)" class="max-w-full truncate text-[9px] leading-3 text-rose-700/80 dark:text-rose-300/80">{{ holidayName(date) }}</span>
                <span
                  v-if="isHalfDaySaturday(date) || dayType(date) === 'holiday' || (new Date(`${date}T00:00:00.000Z`).getUTCDay() % 6 === 0 && dayType(date) === 'workday')"
                  class="absolute right-0.5 top-0.5 text-[9px] font-bold leading-none"
                  :class="dayType(date) === 'holiday' && !isHalfDaySaturday(date) ? 'text-rose-700 dark:text-rose-300' : 'text-sky-700 dark:text-sky-300'"
                >{{ isHalfDaySaturday(date) ? '半' : (dayType(date) === 'holiday' ? '休' : '班') }}</span>
              </button>
            </template>
          </div>
        </section>
      </div>
    </div>

    <div v-else class="rounded-md border p-8 text-center text-sm text-muted-foreground">
      当前账号没有可配置项<span v-if="!isOwner && roles.includes('general_manager')">，工作日历由考勤管理员维护</span>
    </div>

  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
