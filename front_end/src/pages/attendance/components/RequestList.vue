<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronLeft, ChevronRight, Clock3, Paperclip, Plus, RotateCcw, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { useAuthStore } from '@/stores/auth'
import { attendanceKindLabels } from '@/constants/attendance-labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  createAttendanceRequest,
  downloadAttendanceRequestAttachment,
  getAttendanceCalendar,
  getAttendanceRequests,
  reviewAttendanceRequest,
  withdrawAttendanceRequest,
  type AttendanceRequest,
  type AttendanceRequestKind,
} from '@/services/api/attendance.api'

const props = withDefaults(defineProps<{ view?: 'mine' | 'inbox' | 'history', type?: AttendanceRequestKind | '' }>(), { view: 'mine', type: '' })
const authStore = useAuthStore()

const rows = ref<AttendanceRequest[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const page = ref(1)
const limit = 20
const total = ref(0)
const pendingApprovalCount = ref(0)
const dialogOpen = ref(false)
const saving = ref(false)
const downloadingAttachment = ref('')
const attachmentInput = ref<HTMLInputElement>()
const attachmentFiles = ref<File[]>([])
const busyId = ref('')
const expandedId = ref('')
const reviewComment = ref('')
/** 加班补偿方式的展示名，表单与列表共用一份。 */
const compensationLabels: Record<string, string> = { comp_time: '调休', overtime_pay: '加班费', none: '无补偿' }

const form = ref({ type: 'leave' as AttendanceRequestKind, leaveType: 'personal', startAt: '', endAt: '', reason: '', location: '', contact: '', workContent: '', compensation: 'none' })
const calendarCache = ref<Record<number, { confirmed: boolean, defaultDays: { date: string, type: string }[], days: { date: string, type: string }[], workPeriods: { start: string, end: string }[], saturdayMorning: { enabled: boolean, periods: { start: string, end: string }[] } }>>({})
const calendarRequests = new Map<number, Promise<void>>()
const calendarGenerations = new Map<number, number>()
const existingLeaveDates = ref(new Set<string>())
const existingLeaveDatesLoading = ref(false)
let existingLeaveDatesLoaded = false
let existingLeaveDatesRequest: Promise<void> | undefined

const isInbox = computed(() => props.view === 'inbox')
const isHistory = computed(() => props.view === 'history')
/**
 * 侧栏把「我的申请」「待我审批」都按类型拆成请假/加班/出差三个入口，用 ?type= 区分，未指定时展示全部。
 * 「审核记录」保持不分类型（它是「我审批过的全部记录」，没有类型入口）。
 */
const scopedType = computed<AttendanceRequestKind | ''>(() => (isHistory.value ? '' : props.type))
const attendanceRoles = computed(() => {
  const roles = authStore.user?.attendanceRoles
  return Array.isArray(roles) ? roles : roles ? [roles] : []
})
const canReview = computed(() => authStore.isOwner || authStore.isAppAdmin || attendanceRoles.value.some(role => ['manager', 'general_manager', 'attendance_admin'].includes(role)))
const durationPreview = computed(() => {
  const { startAt, endAt, type } = form.value
  if (!startAt || !endAt) return ''
  const start = wallClockTimestamp(startAt)
  const end = wallClockTimestamp(endAt)
  if (start === null || end === null || end <= start) return ''

  const minutes = type === 'leave'
    ? calculateLeavePreviewMinutes(startAt, endAt, start, end)
    : Math.round((end - start) / 60000)
  return minutes === null ? '' : formatRequestDuration(minutes)
})
/** 与后端 controllers/api/attendance.js 的 generalManagerThresholdDays 保持一致。 */
const generalManagerThresholdDays = 3
const leaveNeedsGeneralManager = computed(() => {
  const { startAt, endAt, type } = form.value
  if (type !== 'leave' || !startAt || !endAt) return false
  const start = wallClockTimestamp(startAt)
  const end = wallClockTimestamp(endAt)
  if (start === null || end === null || end <= start) return false
  const minutes = calculateLeavePreviewMinutes(startAt, endAt, start, end)
  const minutesPerWorkday = calendarMinutesPerWorkday(selectedYear(startAt))
  if (minutes === null || !minutesPerWorkday) return false
  return minutes > generalManagerThresholdDays * minutesPerWorkday
})
/** 类型名与面包屑共用 constants/attendance-labels 里那份，避免「请假/审批」两处对不上。 */
const kindOptions: { value: AttendanceRequestKind, label: string }[] = (Object.keys(attendanceKindLabels) as AttendanceRequestKind[])
  .map(value => ({ value, label: attendanceKindLabels[value] }))
const leaveTypes = [
  { value: 'personal', label: '事假' }, { value: 'sick', label: '病假' }, { value: 'annual', label: '年假' },
  { value: 'marriage', label: '婚假' }, { value: 'maternity', label: '产假' }, { value: 'paternity', label: '陪产假' },
  { value: 'bereavement', label: '丧假' }, { value: 'parental', label: '育儿假' }, { value: 'compensatory', label: '调休' }, { value: 'other', label: '其他' },
]
const statusLabels: Record<string, string> = {
  pending: '审批中', awaiting_review: '审批中', approved: '已通过', rejected: '已驳回', withdrawn: '已撤回', draft: '草稿',
}
const scopedTypeLabel = computed(() => kindOptions.find(item => item.value === scopedType.value)?.label ?? '')
/** 「我的申请」的页面标题；审批视图（待我审批 / 审核记录）只用顶部面包屑。 */
const listTitle = computed(() => (scopedTypeLabel.value ? `${scopedTypeLabel.value}申请` : '我的申请'))
/** 在「待我审批 / 审核记录」之间切换时保留当前类型，避免筛选条件被悄悄丢掉。 */
function listLink(path: string) {
  return scopedType.value ? { path, query: { type: scopedType.value } } : path
}
const emptyText = computed(() => (isHistory.value ? '暂无审核记录' : isInbox.value ? '暂无待审批申请' : `暂无${scopedTypeLabel.value ? `${scopedTypeLabel.value}申请` : '申请'}`))

function requestId(row: AttendanceRequest) {
  const id = row.id ?? row._id ?? row.requestId
  return id == null ? '' : String(id)
}
function getKind(row: AttendanceRequest) {
  const key = String(row.type ?? row.kind ?? '')
  return kindOptions.find(item => item.value === key)?.label ?? key ?? '申请'
}
function getApplicant(row: AttendanceRequest) {
  if (typeof row.applicantName === 'string') return row.applicantName
  if (typeof row.applicant === 'string') return row.applicant
  if (row.applicant && typeof row.applicant === 'object') {
    const user = row.applicant as Record<string, unknown>
    return String(user.name ?? user.userid ?? '')
  }
  return ''
}
function getPeriod(row: AttendanceRequest) {
  const start = row.startAt ?? row.start_at
  const end = row.endAt ?? row.end_at
  if (!start) return '—'
  return `${formatDate(start)}${end ? ` 至 ${formatDate(end)}` : ''}`
}
function getDuration(row: AttendanceRequest) {
  if (typeof row.durationHours === 'number') return `${row.durationHours} 小时`
  if (typeof row.durationMinutes === 'number') return `${Math.round(row.durationMinutes / 60 * 100) / 100} 小时`
  return ''
}
function getLeaveType(row: AttendanceRequest) {
  return leaveTypes.find(item => item.value === row.leaveType)?.label ?? row.leaveType ?? ''
}
function getDetail(row: AttendanceRequest) {
  const details = [row.reason || row.workContent]
  if (row.type === 'leave' && getLeaveType(row)) details.unshift(getLeaveType(row))
  if (row.type === 'overtime' && row.compensation) details.unshift(compensationLabels[row.compensation] ?? row.compensation)
  if (row.type === 'fieldwork' && row.location) details.push(`地点：${row.location}`)
  if (row.type === 'overtime' && row.location) details.push(`地点：${row.location}`)
  return details.filter(Boolean).join(' · ') || '—'
}
function getApprovalLabel(role?: string) {
  return ({ manager: '直属经理', general_manager: '总经理', general_manager_delegate: '代理审批人' } as Record<string, string>)[role ?? ''] ?? role ?? '审批人'
}
function getPendingApprover(row: AttendanceRequest) {
  if (!isPending(row)) return undefined
  return row.approvals?.find(item => item.status === 'pending')
}
function getApprovalStatusLabel(row: AttendanceRequest, status?: string) {
  const value = status ?? 'pending'
  if (value === 'pending' && ['withdrawn', 'rejected', 'approved'].includes(String(row.status))) return '已结束'
  return value === 'approved' ? '已通过' : value === 'rejected' ? '已驳回' : '待审批'
}
function getMyReviewStatus(row: AttendanceRequest) {
  const userId = authStore.user?.id
  const review = row.approvals?.find(item => String(item.approverId) === String(userId) && ['approved', 'rejected'].includes(String(item.status)))
  return review?.status === 'approved' ? '已通过' : review?.status === 'rejected' ? '已驳回' : '—'
}
function getWallClockIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return ''
  const [, y, m, d, h, minute, second = '0'] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(minute), Number(second))).toISOString()
}
function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value.replace('T', ' ') : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
function getStatus(row: AttendanceRequest) {
  const status = String(row.status ?? 'pending')
  return statusLabels[status] ?? status
}
function isPending(row: AttendanceRequest) {
  return ['pending', 'awaiting_review'].includes(String(row.status ?? 'pending'))
}
function extractRows(result: Record<string, unknown>) {
  const candidates = [result.requests, result.items, result.data]
  return candidates.find(Array.isArray) as AttendanceRequest[] | undefined
}

function shanghaiDateKey(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function loadExistingLeaveDates(refresh = false) {
  if (existingLeaveDatesLoaded && !refresh) return
  if (existingLeaveDatesRequest) return existingLeaveDatesRequest
  existingLeaveDatesLoading.value = true
  const request = (async () => {
    try {
      const firstPage = await getAttendanceRequests('mine', 1, 100)
      const records = [...(extractRows(firstPage as Record<string, unknown>) ?? [])]
      const totalPages = Math.ceil((firstPage.pagination?.total ?? records.length) / 100)
      for (let currentPage = 2; currentPage <= totalPages; currentPage++) {
        const response = await getAttendanceRequests('mine', currentPage, 100)
        records.push(...(extractRows(response as Record<string, unknown>) ?? []))
      }

      const dates = new Set<string>()
      for (const record of records) {
        if (record.type !== 'leave' || !['pending', 'awaiting_review', 'approved'].includes(String(record.status))) continue
        const start = shanghaiDateKey(record.startAt ?? record.start_at)
        const end = shanghaiDateKey(record.endAt ?? record.end_at)
        if (!start || !end || end < start) continue
        const cursor = new Date(`${start}T00:00:00.000Z`)
        const last = new Date(`${end}T00:00:00.000Z`)
        while (cursor <= last) {
          dates.add(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
      }
      existingLeaveDates.value = dates
      existingLeaveDatesLoaded = true
    }
    finally {
      existingLeaveDatesRequest = undefined
      existingLeaveDatesLoading.value = false
    }
  })()
  existingLeaveDatesRequest = request
  return request
}

function leaveDateIndicator(date: Date) {
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return existingLeaveDates.value.has(dateText) ? '已有待审批或已通过的请假' : undefined
}

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '操作失败')
}

async function load() {
  loading.value = true
  try {
    const response = await getAttendanceRequests(props.view, page.value, limit, scopedType.value)
    rows.value = extractRows(response as Record<string, unknown>) ?? []
    total.value = response.pagination?.total ?? rows.value.length
    if (isInbox.value) pendingApprovalCount.value = total.value
    loadFailed.value = false
  }
  catch (error) {
    rows.value = []
    total.value = 0
    loadFailed.value = true
    showError(error)
  }
  finally { loading.value = false }
}

async function loadPendingApprovalCount() {
  if (!canReview.value) {
    pendingApprovalCount.value = 0
    return
  }
  try {
    // 角标和列表是同一批单子，也要按当前类型统计
    const response = await getAttendanceRequests('inbox', 1, 1, scopedType.value)
    pendingApprovalCount.value = response.pagination?.total ?? extractRows(response as Record<string, unknown>)?.length ?? 0
  }
  catch {
    pendingApprovalCount.value = 0
  }
}

function changePage(nextPage: number) {
  const pageCount = Math.max(1, Math.ceil(total.value / limit))
  if (nextPage < 1 || nextPage > pageCount || nextPage === page.value) return
  page.value = nextPage
  load()
}

async function ensureCalendar(year: number) {
  if (calendarCache.value[year]) return
  const pending = calendarRequests.get(year)
  if (pending) return pending
  const request = (async () => {
    const generation = calendarGenerations.get(year) ?? 0
    try {
      const response = await getAttendanceCalendar(year)
      if (response.ok === false) throw new Error(String(response.error || '读取工作日历失败'))
      const data = response.data as {
        confirmed?: boolean
        defaultDays?: { date: string, type: string }[]
        days?: { date: string, type: string }[]
        workPeriods?: { start: string, end: string }[]
        saturdayMorning?: { enabled: boolean, periods: { start: string, end: string }[] }
      } | undefined
      if (generation === (calendarGenerations.get(year) ?? 0)) {
        calendarCache.value[year] = {
          confirmed: data?.confirmed === true,
          defaultDays: data?.defaultDays ?? [],
          days: data?.days ?? [],
          workPeriods: data?.workPeriods ?? [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
          saturdayMorning: data?.saturdayMorning ?? { enabled: false, periods: [] },
        }
      }
    }
    finally { calendarRequests.delete(year) }
  })()
  calendarRequests.set(year, request)
  return request
}

function invalidateCalendar(event: Event) {
  const year = (event as CustomEvent<{ year?: number }>).detail?.year
  // 不带年度的是租户级设置（如周六上午上班），影响所有年度，整表失效
  const targets = typeof year === 'number' ? [year] : Object.keys(calendarCache.value).map(Number)
  for (const target of targets) {
    calendarGenerations.set(target, (calendarGenerations.get(target) ?? 0) + 1)
    delete calendarCache.value[target]
  }
}

function selectedYear(value: string) {
  const year = Number(value.slice(0, 4))
  return Number.isInteger(year) ? year : 0
}

function wallClockTimestamp(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
}

function calculateLeavePreviewMinutes(startAt: string, endAt: string, start: number, end: number) {
  if (end - start > 366 * 24 * 60 * 60 * 1000) return null
  const firstDate = startAt.slice(0, 10)
  const lastDate = endAt.slice(0, 10)
  if (!calendarCache.value[selectedYear(startAt)] || !calendarCache.value[selectedYear(endAt)]) return null

  let totalMinutes = 0
  const date = new Date(`${firstDate}T00:00:00.000Z`)
  const last = new Date(`${lastDate}T00:00:00.000Z`)
  while (date <= last) {
    const dateText = date.toISOString().slice(0, 10)
    const year = selectedYear(dateText)
    const calendar = calendarCache.value[year]
    if (!calendar) return null
    const workPeriods = calendarWorkdayIntervals(year, dateText)
    if (workPeriods) {
      for (const interval of workPeriods) {
        const from = wallClockTimestamp(`${dateText}T${interval.start}`)
        const to = wallClockTimestamp(`${dateText}T${interval.end}`)
        if (from !== null && to !== null && to > from) {
          totalMinutes += Math.max(0, Math.min(end, to) - Math.max(start, from)) / 60000
        }
      }
    }
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return Math.round(totalMinutes)
}

/** 一个工作日的上班分钟数（等于当日工作时段之和），用于判断是否触发总经理终审。 */
function calendarMinutesPerWorkday(year: number) {
  const calendar = calendarCache.value[year]
  if (!calendar) return 0
  let minutes = 0
  for (const interval of calendar.workPeriods) {
    const from = wallClockTimestamp(`2000-01-01T${interval.start}`)
    const to = wallClockTimestamp(`2000-01-01T${interval.end}`)
    if (from !== null && to !== null && to > from) minutes += (to - from) / 60000
  }
  return minutes
}

function formatRequestDuration(minutes: number) {
  const fullDayMinutes = 8 * 60
  const halfDayMinutes = 4 * 60
  const fullDays = Math.floor(minutes / fullDayMinutes)
  const remainder = minutes % fullDayMinutes
  if (remainder === halfDayMinutes) return `${fullDays + 0.5} 天`

  const parts: string[] = []
  if (fullDays) parts.push(`${fullDays} 天`)
  const hours = Math.floor(remainder / 60)
  const remainingMinutes = remainder % 60
  if (hours) parts.push(`${hours} 小时`)
  if (remainingMinutes) parts.push(`${remainingMinutes} 分钟`)
  return parts.join('') || (fullDays ? `${fullDays} 天` : '0 小时')
}

/** 一天实际计入工作的时段：null 表示休息日；周六上午上班时只返回上午那几个时段，与后端口径一致。 */
function calendarWorkdayIntervals(year: number, date: string) {
  const calendar = calendarCache.value[year]
  const fallbackPeriods = [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }]
  const periods = calendar?.workPeriods?.length ? calendar.workPeriods : fallbackPeriods
  const type = calendar?.days.find(item => item.date === date)?.type
    ?? calendar?.defaultDays.find(item => item.date === date)?.type
  if (type === 'workday') return periods
  if (type === 'holiday') return null
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  if (weekday === 0) return null
  if (weekday === 6) {
    if (calendar?.saturdayMorning?.enabled !== true) return null
    return calendar.saturdayMorning.periods?.length ? calendar.saturdayMorning.periods : periods.slice(0, 1)
  }
  return periods
}

function isCalendarWorkday(year: number, date: string) {
  return calendarWorkdayIntervals(year, date) !== null
}

function isLeaveDateUnavailable(date: Date) {
  const year = date.getFullYear()
  const dateText = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (!existingLeaveDatesLoaded || existingLeaveDatesLoading.value || !calendarCache.value[year]) return true
  return !isCalendarWorkday(year, dateText) || existingLeaveDates.value.has(dateText)
}

function handleCalendarYearChange(year: number) {
  if (form.value.type !== 'leave') return
  void ensureCalendar(year).catch(showError)
}

async function validateLeaveDate(field: 'startAt' | 'endAt') {
  if (form.value.type !== 'leave') return
  const value = form.value[field]
  if (!value) return
  const year = selectedYear(value)
  if (!year) return
  try {
    await ensureCalendar(year)
    if (form.value.type !== 'leave' || form.value[field] !== value) return
    const date = value.slice(0, 10)
    const isWorkday = isCalendarWorkday(year, date)
    if (!isWorkday && form.value.type === 'leave') {
      form.value[field] = ''
      toast.error('请假起止日不能是休息日或节假日')
    }
  }
  catch (error) { showError(error) }
}

function openCreate() {
  form.value = { type: scopedType.value || 'leave', leaveType: 'personal', startAt: '', endAt: '', reason: '', location: '', contact: '', workContent: '', compensation: 'none' }
  attachmentFiles.value = []
  handleCalendarYearChange(new Date().getFullYear())
  dialogOpen.value = true
  void loadExistingLeaveDates(true).catch(showError)
}

const acceptedAttachmentExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'])
const maxAttachmentCount = 5
const maxAttachmentSize = 10 * 1024 * 1024

function addAttachmentFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  const remaining = maxAttachmentCount - attachmentFiles.value.length
  if (selected.length > remaining) toast.warning(`最多上传 ${maxAttachmentCount} 个附件`)
  for (const file of selected.slice(0, remaining)) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!acceptedAttachmentExtensions.has(extension)) {
      toast.warning(`${file.name} 格式不支持`)
      continue
    }
    if (file.size > maxAttachmentSize) {
      toast.warning(`${file.name} 超过 10MB`)
      continue
    }
    if (file.size === 0) {
      toast.warning(`${file.name} 内容为空`)
      continue
    }
    attachmentFiles.value.push(file)
  }
  input.value = ''
}

function removeAttachment(index: number) {
  attachmentFiles.value.splice(index, 1)
}

function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

function updateStartTime(value: string) {
  form.value.startAt = value
  void validateLeaveDate('startAt')
}

function updateEndTime(value: string) {
  form.value.endAt = value
  void validateLeaveDate('endAt')
}

watch(() => form.value.type, (type) => {
  if (type === 'leave') {
    handleCalendarYearChange(form.value.startAt ? selectedYear(form.value.startAt) : new Date().getFullYear())
    if (form.value.startAt) void validateLeaveDate('startAt')
    if (form.value.endAt) void validateLeaveDate('endAt')
  }
})

async function downloadAttachment(row: AttendanceRequest, attachment: NonNullable<AttendanceRequest['attachments']>[number]) {
  const rowId = requestId(row)
  if (!rowId) return
  const key = `${rowId}:${attachment.id}`
  downloadingAttachment.value = key
  try {
    const blob = await downloadAttendanceRequestAttachment(rowId, attachment.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  catch (error) { showError(error) }
  finally { downloadingAttachment.value = '' }
}

async function submit() {
  const submittedForm = { ...form.value }
  if (!submittedForm.startAt || !submittedForm.endAt || !submittedForm.reason.trim()) {
    toast.error('请填写时间和事由')
    return
  }
  if (submittedForm.type === 'overtime' && (!submittedForm.location.trim() || !submittedForm.workContent.trim())) {
    toast.error('请填写加班地点和工作内容')
    return
  }
  if (submittedForm.type === 'fieldwork' && (!submittedForm.location.trim() || !submittedForm.contact.trim() || !submittedForm.workContent.trim())) {
    toast.error('请填写出差地点、对接对象和工作内容')
    return
  }
  if ([submittedForm.startAt, submittedForm.endAt].some(value => !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value))) {
    toast.error('申请时间按整点填写')
    return
  }
  if (submittedForm.endAt <= submittedForm.startAt) {
    toast.error('结束时间须晚于开始时间')
    return
  }
  if (submittedForm.type === 'leave') {
    const years = [...new Set([selectedYear(submittedForm.startAt), selectedYear(submittedForm.endAt)])]
    try {
      await Promise.all(years.map(ensureCalendar))
    }
    catch (error) { showError(error); return }
    if (JSON.stringify(form.value) !== JSON.stringify(submittedForm)) {
      toast.error('申请内容已变更，请重新提交')
      return
    }
    if (years.some(year => !calendarCache.value[year]?.confirmed)) {
      toast.error('该年度工作日历尚未确认，暂不能提交请假')
      return
    }
    for (const field of ['startAt', 'endAt'] as const) {
      const date = submittedForm[field].slice(0, 10)
      const isWorkday = isCalendarWorkday(selectedYear(submittedForm[field]), date)
      if (!isWorkday) {
        toast.error('请假起止日不能是休息日或节假日')
        return
      }
    }
  }
  saving.value = true
  try {
    await createAttendanceRequest({
      type: submittedForm.type,
      startAt: getWallClockIso(submittedForm.startAt),
      endAt: getWallClockIso(submittedForm.endAt),
      reason: submittedForm.reason.trim(),
      ...(submittedForm.type === 'leave' ? { leaveType: submittedForm.leaveType } : {}),
      ...(submittedForm.type === 'fieldwork' ? { location: submittedForm.location.trim(), contact: submittedForm.contact.trim(), workContent: submittedForm.workContent.trim() } : {}),
      ...(submittedForm.type === 'overtime' ? { location: submittedForm.location.trim(), workContent: submittedForm.workContent.trim(), compensation: submittedForm.compensation } : {}),
    }, attachmentFiles.value)
    if (submittedForm.type === 'leave') existingLeaveDatesLoaded = false
    toast.success('申请已提交')
    dialogOpen.value = false
    attachmentFiles.value = []
    page.value = 1
    await load()
  }
  catch (error) { showError(error) }
  finally { saving.value = false }
}

async function withdraw(row: AttendanceRequest) {
  const id = requestId(row)
  if (!id) return
  busyId.value = id
  try {
    await withdrawAttendanceRequest(id)
    toast.success('已撤回')
    await load()
  }
  catch (error) { showError(error) }
  finally { busyId.value = '' }
}

async function review(row: AttendanceRequest, decision: 'approve' | 'reject') {
  const id = requestId(row)
  if (!id) return
  busyId.value = id
  try {
    await reviewAttendanceRequest(id, decision, reviewComment.value.trim())
    toast.success(decision === 'approve' ? '已通过' : '已驳回')
    expandedId.value = ''
    reviewComment.value = ''
    await load()
  }
  catch (error) { showError(error) }
  finally { busyId.value = '' }
}

watch(() => props.view, () => {
  page.value = 1
  load()
  if (!isInbox.value) void loadPendingApprovalCount()
})
// 侧栏在请假/加班/出差之间切换时复用同一个组件实例，需要按新类型重新取数。
watch(scopedType, () => {
  page.value = 1
  load()
})
watch(canReview, (allowed) => {
  if (allowed && !isInbox.value) void loadPendingApprovalCount()
  else if (!allowed) pendingApprovalCount.value = 0
})
onMounted(() => {
  load()
  if (!isInbox.value) void loadPendingApprovalCount()
  window.addEventListener('attendance-calendar-updated', invalidateCalendar)
})
onBeforeUnmount(() => window.removeEventListener('attendance-calendar-updated', invalidateCalendar))
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- 标题在顶部面包屑里；「我的申请」页内再给一次大标题，审批视图只出下面这条切换 -->
      <h1 v-if="!isInbox && !isHistory" class="text-lg font-semibold">{{ listTitle }}</h1>
      <nav v-if="canReview && (isInbox || isHistory)" class="flex items-center gap-1 border-b pb-2 text-xs">
        <router-link :to="listLink('/attendance/approvals')" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors" :class="isInbox ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'">
          待我审批
          <Badge v-if="pendingApprovalCount > 0" variant="destructive" class="h-4 rounded-full px-1.5 text-[10px]" :aria-label="`${pendingApprovalCount} 条待审批`">{{ pendingApprovalCount }}</Badge>
        </router-link>
        <router-link to="/attendance/approval-history" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors" :class="isHistory ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'">审核记录</router-link>
      </nav>
      <div v-if="!isInbox && !isHistory" class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="loading" @click="load"><RotateCcw class="mr-1.5 size-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button size="sm" @click="openCreate"><Plus class="mr-1.5 size-4" />新建申请</Button>
      </div>
    </div>

    <div v-if="loadFailed" class="rounded-md border bg-background py-10 text-center">
      <p class="text-sm text-muted-foreground">申请列表读取失败，请稍后重试。</p>
      <Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button>
    </div>

    <div v-else class="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead v-if="isInbox || isHistory" class="w-28">申请人</TableHead>
            <TableHead class="w-20">类型</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>事由</TableHead>
            <TableHead class="w-24">状态</TableHead>
            <TableHead v-if="isHistory" class="w-24">我的审核</TableHead>
            <TableHead class="w-36 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading"><TableCell :colspan="isHistory ? 7 : isInbox ? 6 : 5" class="h-20 text-center text-muted-foreground">加载中…</TableCell></TableRow>
          <TableRow v-else-if="!rows.length"><TableCell :colspan="isHistory ? 7 : isInbox ? 6 : 5" class="h-20 text-center text-muted-foreground">{{ emptyText }}</TableCell></TableRow>
          <template v-for="row in rows" :key="requestId(row) || String(row.createdAt ?? row.created_at)">
            <TableRow>
              <TableCell v-if="isInbox || isHistory" class="font-medium">{{ getApplicant(row) || '—' }}</TableCell>
              <TableCell>{{ getKind(row) }}</TableCell>
              <TableCell class="whitespace-nowrap text-muted-foreground">{{ getPeriod(row) }}<span v-if="getDuration(row)" class="ml-2">{{ getDuration(row) }}</span></TableCell>
              <TableCell class="max-w-[28rem] truncate">{{ getDetail(row) }}</TableCell>
              <TableCell><Badge variant="outline" :class="isPending(row) ? 'text-amber-700 dark:text-amber-400' : ''">{{ getStatus(row) }}</Badge></TableCell>
              <TableCell v-if="isHistory"><Badge variant="outline" :class="getMyReviewStatus(row) === '已驳回' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'">{{ getMyReviewStatus(row) }}</Badge></TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-1">
                  <Button v-if="isInbox && isPending(row)" variant="outline" size="sm" class="cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground" :aria-expanded="expandedId === requestId(row)" @click="expandedId = expandedId === requestId(row) ? '' : requestId(row); reviewComment = ''">审核</Button>
                  <Button v-else variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" :aria-expanded="expandedId === requestId(row)" @click="expandedId = expandedId === requestId(row) ? '' : requestId(row)">{{ expandedId === requestId(row) ? '收起' : '详情' }}</Button>
                  <Button v-if="!isInbox && isPending(row)" variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" :disabled="busyId === requestId(row)" @click="withdraw(row)">
                    <RotateCcw class="mr-1 size-3.5" />撤回
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="expandedId === requestId(row)">
              <TableCell :colspan="isHistory ? 7 : isInbox ? 6 : 5" class="bg-muted/30">
                <div class="flex flex-col gap-3 py-1">
                  <div class="min-w-0 space-y-1">
                    <p class="text-sm font-medium">{{ getKind(row) }} · {{ getApplicant(row) }} <span class="font-normal text-muted-foreground">{{ getPeriod(row) }}</span></p>
                    <p v-if="row.applicant && typeof row.applicant === 'object'" class="text-xs text-muted-foreground">
                      {{ [row.applicant.department, row.applicant.employeeNo, row.applicant.title].filter(Boolean).join(' · ') }}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {{ getDetail(row) }}
                      <span v-if="row.contact"> · 对接：{{ row.contact }}</span>
                      <span v-if="row.workContent && row.type !== 'leave'"> · 工作内容：{{ row.workContent }}</span>
                    </p>
                    <div v-if="row.attachments?.length" class="flex flex-wrap items-center gap-1 pt-1">
                      <span class="mr-1 text-xs text-muted-foreground">附件</span>
                      <Button
                        v-for="attachment in row.attachments"
                        :key="attachment.id"
                        variant="link"
                        size="sm"
                        class="h-auto gap-1 px-1 py-0 text-xs"
                        :disabled="downloadingAttachment === `${requestId(row)}:${attachment.id}`"
                        @click="downloadAttachment(row, attachment)"
                      >
                        <Paperclip class="size-3" />{{ attachment.name }} · {{ formatFileSize(attachment.size) }}
                      </Button>
                    </div>
                    <div v-if="getPendingApprover(row)" class="text-xs text-muted-foreground">当前审批：{{ getApprovalLabel(getPendingApprover(row)?.role) }}</div>
                    <div v-if="row.approvals?.length" class="space-y-1 pt-1">
                      <div v-for="(approval, index) in row.approvals" :key="`${approval.role}-${index}`" class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{{ getApprovalLabel(approval.role) }}</span>
                        <span>{{ getApprovalStatusLabel(row, approval.status) }}</span>
                        <span v-if="approval.reviewedAt">{{ formatDate(approval.reviewedAt) }}</span>
                        <span v-if="approval.comment">{{ approval.comment }}</span>
                      </div>
                    </div>
                    <div v-if="isInbox && isPending(row)" class="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label :for="`review-comment-${requestId(row)}`" class="text-xs text-muted-foreground">审批意见</label>
                      <div class="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" :disabled="busyId === requestId(row)" @click="review(row, 'reject')"><X class="mr-1 size-4" />驳回</Button>
                        <Button size="sm" :disabled="busyId === requestId(row)" @click="review(row, 'approve')"><Check class="mr-1 size-4" />通过</Button>
                      </div>
                    </div>
                    <Textarea v-if="isInbox && isPending(row)" :id="`review-comment-${requestId(row)}`" v-model="reviewComment" rows="2" class="min-h-16 resize-y bg-background" aria-label="审批意见" />
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
      <div v-if="total > limit" class="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{{ (page - 1) * limit + 1 }}–{{ Math.min(page * limit, total) }} / {{ total }}</span>
        <div class="flex gap-1">
          <Button variant="ghost" size="icon" class="size-7" aria-label="上一页" :disabled="page <= 1 || loading" @click="changePage(page - 1)"><ChevronLeft class="size-4" /></Button>
          <span class="flex items-center px-1">{{ page }} / {{ Math.max(1, Math.ceil(total / limit)) }}</span>
          <Button variant="ghost" size="icon" class="size-7" aria-label="下一页" :disabled="page >= Math.ceil(total / limit) || loading" @click="changePage(page + 1)"><ChevronRight class="size-4" /></Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{{ scopedTypeLabel ? `新建${scopedTypeLabel}申请` : '新建申请' }}</DialogTitle></DialogHeader>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="grid gap-3 sm:grid-cols-3">
            <!-- 侧栏按类型分开入口后，弹窗类型固定为该入口的类型，避免新建出列表里看不到的申请 -->
            <div v-if="!scopedTypeLabel" class="space-y-1.5 text-sm sm:col-span-3"><span>申请类型</span>
              <Select v-model="form.type">
                <SelectTrigger class="w-full" aria-label="申请类型"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent>
              </Select>
            </div>
            <div v-if="form.type === 'leave'" class="space-y-1.5 text-sm sm:col-span-3"><span>请假类型</span>
              <Select v-model="form.leaveType">
                <SelectTrigger class="w-full" aria-label="请假类型"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem v-for="option in leaveTypes" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5 text-sm sm:col-span-3"><span>开始时间</span><DateTimePicker :model-value="form.startAt" :minute-step="60" :max-value="form.endAt" :default-hour="form.type === 'leave' ? '08' : undefined" :disabled-date="form.type === 'leave' ? isLeaveDateUnavailable : undefined" :disabled-hint="form.type === 'leave' ? '请假起止日只能选工作日且未申请过请假的日期' : undefined" :date-indicator="form.type === 'leave' ? leaveDateIndicator : undefined" label="开始时间" @update:model-value="updateStartTime" @visible-year-change="handleCalendarYearChange" /></div>
            <div class="space-y-1.5 text-sm sm:col-span-3"><span>结束时间</span><DateTimePicker :model-value="form.endAt" :minute-step="60" :min-value="form.startAt" :default-hour="form.type === 'leave' ? '18' : undefined" :disabled-date="form.type === 'leave' ? isLeaveDateUnavailable : undefined" :disabled-hint="form.type === 'leave' ? '请假起止日只能选工作日且未申请过请假的日期' : undefined" :date-indicator="form.type === 'leave' ? leaveDateIndicator : undefined" label="结束时间" @update:model-value="updateEndTime" @visible-year-change="handleCalendarYearChange" /></div>
            <div v-if="durationPreview" class="text-sm text-muted-foreground sm:col-span-3">
              预计时长：<span class="font-medium text-foreground">{{ durationPreview }}</span>
              <span v-if="leaveNeedsGeneralManager" class="ml-2 text-amber-700 dark:text-amber-400">超过 {{ generalManagerThresholdDays }} 个工作日，提交后需总经理终审</span>
            </div>
            <div v-if="form.type === 'overtime'" class="space-y-1.5 text-sm"><span>补偿方式</span>
              <Select v-model="form.compensation">
                <SelectTrigger class="w-full" aria-label="加班补偿方式"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="comp_time">调休</SelectItem><SelectItem value="overtime_pay">加班费</SelectItem><SelectItem value="none">无补偿</SelectItem></SelectContent>
              </Select>
            </div>
            <template v-if="form.type === 'overtime'">
              <label class="space-y-1.5 text-sm"><span>地点</span><Input v-model="form.location" aria-label="加班地点" required /></label>
              <label class="space-y-1.5 text-sm sm:col-span-2"><span>工作内容</span><Textarea v-model="form.workContent" rows="2" aria-label="加班工作内容" required /></label>
            </template>
            <template v-if="form.type === 'fieldwork'">
              <label class="space-y-1.5 text-sm"><span>地点</span><Input v-model="form.location" aria-label="出差地点" required /></label>
              <label class="space-y-1.5 text-sm"><span>对接对象</span><Input v-model="form.contact" aria-label="出差对接对象" required /></label>
              <label class="space-y-1.5 text-sm sm:col-span-3"><span>工作内容</span><Textarea v-model="form.workContent" rows="2" aria-label="出差工作内容" required /></label>
            </template>
            <label class="space-y-1.5 text-sm sm:col-span-3"><span>事由</span><Textarea v-model="form.reason" rows="3" required /></label>
            <div class="space-y-2 text-sm sm:col-span-3">
              <div class="flex flex-wrap items-center gap-2">
                <input
                  ref="attachmentInput"
                  type="file"
                  multiple
                  class="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  :disabled="saving"
                  @change="addAttachmentFiles"
                >
                <Button type="button" variant="outline" size="sm" :disabled="saving || attachmentFiles.length >= maxAttachmentCount" @click="attachmentInput?.click()">
                  <Paperclip class="mr-1.5 size-4" />添加附件
                </Button>
                <span class="text-xs text-muted-foreground">选填，最多 {{ maxAttachmentCount }} 个，每个不超过 10MB；支持图片、PDF、Word、Excel</span>
              </div>
              <ul v-if="attachmentFiles.length" class="space-y-1">
                <li v-for="(file, index) in attachmentFiles" :key="`${file.name}-${file.size}-${index}`" class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <span class="flex min-w-0 items-center gap-2"><Paperclip class="size-3.5 shrink-0 text-muted-foreground" /><span class="truncate">{{ file.name }}</span><span class="shrink-0 text-muted-foreground">{{ formatFileSize(file.size) }}</span></span>
                  <Button type="button" variant="ghost" size="icon" class="size-7 shrink-0" :disabled="saving" :aria-label="`移除附件 ${file.name}`" @click="removeAttachment(index)"><X class="size-4" /></Button>
                </li>
              </ul>
            </div>
          </div>
      <p class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Clock3 class="size-3.5" />请假按小时填写；起止日须为工作日，跨休息日不计时。<span class="size-1.5 rounded-full bg-amber-600" aria-hidden="true" />日历中的标记表示已有待审批或已通过的请假日期，该日期不可再选。</p>
          <DialogFooter>
            <Button type="button" variant="outline" :disabled="saving" @click="dialogOpen = false">取消</Button>
            <Button type="submit" :disabled="saving">{{ saving ? '提交中…' : '提交申请' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </main>
</template>
