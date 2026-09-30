<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Check, LockKeyhole, Pencil, RefreshCw, UnlockKeyhole, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MonthPicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import LedgerImportDialog from '@/pages/attendance/components/LedgerImportDialog.vue'
import LedgerStatistics from '@/pages/attendance/components/LedgerStatistics.vue'
import {
  closeAttendanceLedger,
  getAttendanceLedger,
  reopenAttendanceLedger,
  saveAttendanceLedgerEntry,
  type AttendanceLedger,
  type AttendanceLedgerConfirmationState,
  type AttendanceLedgerScope,
  type AttendanceLedgerTotals,
} from '@/services/api/attendance.api'
import { useAuthStore } from '@/stores/auth'
import { unconfirmedCalendarMessage } from '@/utils/attendance-error'
import { leaveTypeLabels } from '@/constants/attendance-labels'
import { formatMinutes } from '@/utils/payroll'

interface LedgerDraft {
  actualMinutes: string
  confirmationState: '' | Exclude<AttendanceLedgerConfirmationState, 'pending'>
  note: string
}

const authStore = useAuthStore()
const attendanceRoles = computed(() => {
  const roles = authStore.user?.attendanceRoles
  return Array.isArray(roles) ? roles : roles ? [roles] : []
})
const isOwner = computed(() => authStore.isOwner)
const isAttendanceAdmin = computed(() => attendanceRoles.value.includes('attendance_admin'))
const canManage = computed(() => isOwner.value || isAttendanceAdmin.value)
const defaultScope = computed<AttendanceLedgerScope>(() => {
  if (isOwner.value || isAttendanceAdmin.value || attendanceRoles.value.includes('general_manager')) return 'company'
  if (attendanceRoles.value.includes('manager')) return 'team'
  return 'mine'
})
const scopeOptions = computed((): AttendanceLedgerScope[] => {
  if (isOwner.value || isAttendanceAdmin.value || attendanceRoles.value.includes('general_manager')) {
    return attendanceRoles.value.includes('manager') ? ['company', 'team', 'mine'] : ['company', 'mine']
  }
  if (attendanceRoles.value.includes('manager')) return ['team', 'mine']
  return ['mine']
})
const scope = ref<AttendanceLedgerScope>(defaultScope.value)
const scopeLabel = computed(() => ({ mine: '本人', team: '团队', company: '全公司' })[scope.value])

/** 明细台账与统计汇总是同一份月度考勤数据的两个视图；入口已合并，用页签切换，统计视图首次进入才挂载。 */
const activeView = ref<'detail' | 'stats'>(useRoute().query.view === 'stats' ? 'stats' : 'detail')
const statsMounted = ref(activeView.value === 'stats')

function selectView(view: 'detail' | 'stats') {
  activeView.value = view
  if (view === 'stats') statsMounted.value = true
  else if (!ledger.value) void loadLedger()
}

const month = ref(getBeijingMonth())
const ledger = ref<AttendanceLedger | null>(null)
const drafts = reactive<Record<string, LedgerDraft>>({})
const loading = ref(false)
const loadError = ref(false)
const calendarError = ref('')
const savingEmployeeIds = ref(new Set<string>())
const hasSavingEmployees = computed(() => savingEmployeeIds.value.size > 0)
const editingEmployeeId = ref<string | null>(null)
const ledgerAction = ref<'' | 'close' | 'reopen'>('')
const actionDialogOpen = ref(false)
const actionReason = ref('')
const actionBusy = ref(false)
let loadRequestId = 0

const rows = computed(() => ledger.value?.rows ?? [])
const totals = computed<AttendanceLedgerTotals>(() => ledger.value?.totals ?? {})
const isClosed = computed(() => ledger.value?.status === 'closed')
const allResolved = computed(() => rows.value.length > 0 && rows.value.every(row => row.confirmationState === 'confirmed' || row.confirmationState === 'no_basis'))
const hasUnsavedChanges = computed(() => rows.value.some(isRowDirty))
const pendingCount = computed(() => rows.value.filter(row => row.confirmationState === 'pending').length)
const importOpen = ref(false)
/** 导入的考勤记录：null 表示没导入过，显示「—」而不是 0（不要把没数据当成 0 次）。 */
function countLabel(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : String(value)
}

/** 结账按钮被禁用时的原因，直接写在按钮旁（原先只在 title 悬浮提示里，屏幕上没有任何说明）。 */
const closeHint = computed(() => {
  if (isClosed.value || !canManage.value) return ''
  if (hasUnsavedChanges.value) return '请先保存未提交的修改'
  if (!allResolved.value) return `还有 ${pendingCount.value} 人待确认`
  return ''
})

function getBeijingMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value ?? String(new Date().getUTCFullYear())
  const month = parts.find(part => part.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

/** 这一行当前生效的实到分钟：人工确定过就显示填的值，否则显示系统建议值（只算不写库）。 */
function effectiveActualMinutes(row: AttendanceLedger['rows'][number]) {
  if (row.actualMinutesIsManual) return row.actualMinutes ?? null
  return row.suggestedActualMinutes ?? row.actualMinutes ?? null
}

function makeDraft(row: AttendanceLedger['rows'][number]): LedgerDraft {
  const actual = effectiveActualMinutes(row)
  return {
    actualMinutes: actual === null ? '' : String(actual),
    confirmationState: row.confirmationState === 'pending' ? '' : row.confirmationState,
    note: row.note ?? '',
  }
}

function isRowDirty(row: AttendanceLedger['rows'][number]) {
  const draft = drafts[row.employeeId]
  if (!draft) return false
  const expectedState = row.confirmationState === 'pending' ? '' : row.confirmationState
  // 与「生效值」比较：预填的系统建议值不算修改，否则一进页面就显示成有未保存修改
  const expectedMinutes = effectiveActualMinutes(row) ?? ''
  return draft.confirmationState !== expectedState || Number(draft.actualMinutes || 0) !== Number(expectedMinutes || 0) || draft.note.trim() !== (row.note ?? '').trim()
}

function sumRecordMinutes(values: Record<string, number> | undefined) {
  return Object.values(values ?? {}).reduce((sum, minutes) => sum + (Number(minutes) || 0), 0)
}

function totalMinutes(
  field: 'expectedMinutes' | 'overtimeApprovedMinutes' | 'fieldworkApprovedMinutes',
) {
  const summaryValue = totals.value[field]
  if (typeof summaryValue === 'number') return summaryValue
  return rows.value.reduce((sum, row) => sum + (row[field] ?? 0), 0)
}

const totalLeaveMinutes = computed(() => {
  if (totals.value.leaveMinutesByType) return sumRecordMinutes(totals.value.leaveMinutesByType)
  return rows.value.reduce((sum, row) => sum + sumRecordMinutes(row.leaveMinutesByType), 0)
})
const confirmedActualMinutes = computed(() => {
  const confirmedRows = rows.value.filter(row => row.confirmationState === 'confirmed' && row.actualMinutes !== null)
  if (!confirmedRows.length) return null
  return confirmedRows.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)
})

function leaveBreakdown(values: Record<string, number>) {
  const details = Object.entries(values ?? {}).filter(([, minutes]) => minutes > 0)
  if (!details.length) return '—'
  return details.map(([type, minutes]) => `${leaveTypeLabels[type] ?? type} ${formatMinutes(minutes)}`).join(' · ')
}

/**
 * 已批加班的补偿方式（调休 / 加班费 / 无补偿）：**只列真有时长的项**，没有的项不出现，
 * 免得又回到「调休 0 小时 · 加班费 0 小时」那种每行都写着零的样子。
 */
function overtimeMethodLabel(row: AttendanceLedger['rows'][number]) {
  return [
    ['调休', row.overtimeCompTimeMinutes],
    ['加班费', row.overtimePayMinutes],
    ['无补偿', row.overtimeUncompensatedMinutes],
  ].filter(([, minutes]) => Number(minutes) > 0)
    .map(([label, minutes]) => `${label} ${formatMinutes(Number(minutes))}`)
    .join(' · ')
}

/**
 * 还没批完的请假提示一句：能算出时长就带时长；算不出来（未按天分摊）只说有事没批完。
 * 没有待审批请假时返回空串，界面上不多一行字。
 */
function pendingLeaveLabel(row: AttendanceLedger['rows'][number]) {
  if (row.pendingLeaveMinutes) return `待审批 ${formatMinutes(row.pendingLeaveMinutes)}`
  return row.pendingLeaveUnreconciled ? '待审批请假（未按天分摊）' : ''
}

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '操作失败')
}

function checkResponse<T>(response: { ok?: boolean, error?: string, data?: T }, fallback: string) {
  if (response.ok === false) throw new Error(response.error || fallback)
  if (response.data === undefined) throw new Error(fallback)
  return response.data
}

async function loadLedger() {
  if (!/^\d{4}-\d{2}$/.test(month.value)) return
  const requestId = ++loadRequestId
  loading.value = true
  ledger.value = null
  loadError.value = false
  calendarError.value = ''
  try {
    const response = await getAttendanceLedger(month.value, scope.value)
    const data = checkResponse(response, '读取考勤台账失败')
    if (requestId !== loadRequestId) return
    ledger.value = data
    editingEmployeeId.value = null
    for (const key of Object.keys(drafts)) delete drafts[key]
    for (const row of data.rows) drafts[row.employeeId] = makeDraft(row)
  }
  catch (error) {
    if (requestId !== loadRequestId) return
    calendarError.value = unconfirmedCalendarMessage(error)
    if (!calendarError.value) { loadError.value = true; showError(error) }
  }
  finally { if (requestId === loadRequestId) loading.value = false }
}

function onConfirmationChange(employeeId: string) {
  if (drafts[employeeId]?.confirmationState === 'no_basis') drafts[employeeId].actualMinutes = ''
}

function isRowEditing(row: AttendanceLedger['rows'][number]) {
  return canManage.value && !isClosed.value && editingEmployeeId.value === row.employeeId
}

function startEditRow(row: AttendanceLedger['rows'][number]) {
  if (editingEmployeeId.value === row.employeeId) return
  if (hasUnsavedChanges.value) {
    toast.error('请先保存当前修改')
    return
  }
  drafts[row.employeeId] = makeDraft(row)
  editingEmployeeId.value = row.employeeId
}

function stopEditRow() {
  editingEmployeeId.value = null
}

function cancelEditRow(row: AttendanceLedger['rows'][number]) {
  drafts[row.employeeId] = makeDraft(row)
  stopEditRow()
}

async function confirmRow(row: AttendanceLedger['rows'][number]) {
  if (!isRowDirty(row)) { stopEditRow(); return }
  if (await saveRow(row)) stopEditRow()
}

async function saveRow(row: AttendanceLedger['rows'][number]) {
  const draft = drafts[row.employeeId]
  if (!draft || hasSavingEmployees.value) return false
  const submittedDraft = { ...draft }
  const minutes = Number(submittedDraft.actualMinutes)
  let actualMinutes: number | null = null
  if (submittedDraft.confirmationState === 'confirmed') {
    if (submittedDraft.actualMinutes === '' || !Number.isInteger(minutes) || minutes < 0) {
      toast.error('请填写有效的实到分钟数')
      return false
    }
    actualMinutes = minutes
  }
  else if (submittedDraft.confirmationState === 'no_basis') {
    if (!submittedDraft.note.trim()) {
      toast.error('无考勤依据时请填写原因')
      return false
    }
  }
  else {
    toast.error('请选择确认状态')
    return false
  }

  savingEmployeeIds.value.add(row.employeeId)
  try {
    // 直接采用系统建议值 → 记 auto（以后导入/日历变化会跟着重算）；改成别的值 → 记 manual，不再被覆盖
    const suggested = row.suggestedActualMinutes ?? null
    const keepSuggestion = submittedDraft.confirmationState === 'confirmed' && !row.actualMinutesIsManual && suggested !== null && actualMinutes === suggested
    const response = await saveAttendanceLedgerEntry(row.employeeId, month.value, {
      actualMinutes,
      confirmationState: submittedDraft.confirmationState,
      note: submittedDraft.note.trim(),
      version: ledger.value?.version ?? 0,
      actualMinutesSource: keepSuggestion ? 'auto' : 'manual',
    })
    if (response.ok === false) throw new Error(typeof response.error === 'string' ? response.error : '保存考勤失败')
    const saved = response.data
    if (!saved?.row || typeof saved.version !== 'number') throw new Error('保存结果不完整，请刷新台账后重试')
    Object.assign(row, saved.row)
    // 保存接口回的是库里的原始行，这里补上建议值与「是否人工」，否则本行会立刻显示成有未保存修改
    row.actualMinutesIsManual = saved.row.actualMinutesSource !== 'auto'
    if (saved.row.actualMinutesSource === 'auto') row.suggestedActualMinutes = saved.row.actualMinutes
    if (ledger.value) ledger.value.version = saved.version
    toast.success('已保存')
    return true
  }
  catch (error) { showError(error); return false }
  finally { savingEmployeeIds.value.delete(row.employeeId) }
}

function openLedgerAction(action: 'close' | 'reopen') {
  ledgerAction.value = action
  actionReason.value = ''
  actionDialogOpen.value = true
}

async function submitLedgerAction() {
  const reason = actionReason.value.trim()
  if (ledgerAction.value === 'reopen' && !reason) {
    toast.error('请填写重新开启原因')
    return
  }
  actionBusy.value = true
  try {
    const response = ledgerAction.value === 'close'
      ? await closeAttendanceLedger(month.value, ledger.value?.version ?? 0)
      : await reopenAttendanceLedger(month.value, ledger.value?.version ?? 0, reason)
    if (response.ok === false) throw new Error(typeof response.error === 'string' ? response.error : (ledgerAction.value === 'close' ? '结账失败' : '重新开启失败'))
    toast.success(ledgerAction.value === 'close' ? '本月台账已结账' : '本月台账已重新开启')
    actionDialogOpen.value = false
    await loadLedger()
  }
  catch (error) { showError(error) }
  finally { actionBusy.value = false }
}

watch(month, (nextMonth, previousMonth) => {
  if (ledger.value?.month === nextMonth) return
  if (hasUnsavedChanges.value) {
    month.value = previousMonth
    toast.error('请先保存当前修改')
    return
  }
  void loadLedger()
})
watch(scope, (nextScope, previousScope) => {
  if (hasUnsavedChanges.value) {
    scope.value = previousScope
    toast.error('请先保存当前修改')
    return
  }
  void loadLedger()
})
onMounted(() => { if (activeView.value === 'detail') void loadLedger() })
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <!-- 标题在顶部面包屑里；这一行只放视图切换与台账操作 -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
      <div class="flex flex-wrap items-center gap-2">
        <nav class="flex items-center gap-1 text-xs">
          <button type="button" class="rounded-md px-3 py-1.5 font-medium transition-colors" :class="activeView === 'detail' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'" :aria-pressed="activeView === 'detail'" @click="selectView('detail')">明细台账</button>
          <button type="button" class="rounded-md px-3 py-1.5 font-medium transition-colors" :class="activeView === 'stats' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'" :aria-pressed="activeView === 'stats'" @click="selectView('stats')">统计汇总</button>
        </nav>
        <Badge v-if="ledger" variant="outline" :class="isClosed ? '' : 'text-amber-700 dark:text-amber-400'">{{ isClosed ? '已结账' : '开放中' }}</Badge>
      </div>
      <div v-show="activeView === 'detail'" class="flex flex-wrap items-center gap-2">
        <!-- 只有单一范围时才需要这行文字，可选范围时下拉框本身就写着当前范围 -->
        <span v-if="scopeOptions.length <= 1" class="text-xs text-muted-foreground">{{ scopeLabel }}范围</span>
        <label v-if="scopeOptions.length > 1" class="sr-only" for="ledger-scope">台账范围</label>
        <Select v-if="scopeOptions.length > 1" v-model="scope" :disabled="loading || hasSavingEmployees || actionBusy">
          <SelectTrigger id="ledger-scope" aria-label="台账范围"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem v-for="option in scopeOptions" :key="option" :value="option">{{ ({ mine: '本人', team: '团队', company: '全公司' } as Record<string, string>)[option] }}</SelectItem></SelectContent>
        </Select>
        <div class="w-40"><MonthPicker v-model="month" placeholder="选择考勤月份" class="h-9" :disabled="loading || hasSavingEmployees || actionBusy" /></div>
        <Button variant="ghost" size="icon" class="size-8" aria-label="刷新台账" :disabled="loading || hasUnsavedChanges" title="刷新会放弃未保存修改" @click="loadLedger"><RefreshCw class="size-4" /></Button>
        <Button v-if="canManage && !isClosed" variant="outline" size="sm" :disabled="loading || hasUnsavedChanges" title="导入迟到、早退、无打卡记录与备注；实到分钟仍需人工确认" @click="importOpen = true"><Upload class="mr-1.5 size-4" />导入考勤</Button>
        <span v-if="closeHint" class="text-xs text-muted-foreground">{{ closeHint }}</span>
        <Button v-if="canManage && isClosed" variant="outline" size="sm" @click="openLedgerAction('reopen')"><UnlockKeyhole class="mr-1.5 size-4" />重新开启</Button>
        <Button v-else-if="canManage" size="sm" :disabled="!ledger || isClosed || !allResolved || hasUnsavedChanges || loading" @click="openLedgerAction('close')"><LockKeyhole class="mr-1.5 size-4" />结账</Button>
      </div>
    </div>

    <LedgerStatistics v-if="statsMounted" v-show="activeView === 'stats'" />

    <div v-show="activeView === 'detail'" class="space-y-4">

    <div v-if="loading && !ledger" class="rounded-md border py-16 text-center text-sm text-muted-foreground">加载中…</div>
    <div v-else-if="calendarError" class="rounded-md border px-4 py-12 text-center">
      <p class="text-sm font-medium">{{ calendarError }}</p>
      <p class="mt-2 text-xs text-muted-foreground">确认日历后，才能准确计算本月应出勤时长。</p>
      <Button v-if="canManage" as-child size="sm" variant="outline" class="mt-4"><router-link to="/attendance/settings?tab=calendar">去确认工作日历</router-link></Button>
      <p v-else class="mt-3 text-xs text-muted-foreground">请联系考勤管理员处理。</p>
    </div>
    <div v-else-if="loadError" class="rounded-md border py-12 text-center"><p class="text-sm text-destructive">台账读取失败，请稍后重试。</p><Button class="mt-3" size="sm" variant="outline" @click="loadLedger">重试</Button></div>
    <div v-else-if="!ledger" class="rounded-md border py-16 text-center text-sm text-muted-foreground">暂无台账</div>
    <template v-else>
      <section class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3 lg:grid-cols-6">
        <div><div class="text-xs text-muted-foreground">应出勤</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(totalMinutes('expectedMinutes')) }}</div></div>
        <div><div class="text-xs text-muted-foreground">请假</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(totalLeaveMinutes) }}</div></div>
        <div><div class="text-xs text-muted-foreground">已批加班时长</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(totalMinutes('overtimeApprovedMinutes')) }}</div></div>
        <div><div class="text-xs text-muted-foreground">已批出差时长</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(totalMinutes('fieldworkApprovedMinutes')) }}</div></div>
        <div><div class="text-xs text-muted-foreground">已确认实到</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(confirmedActualMinutes) }}</div></div>
        <div><div class="text-xs text-muted-foreground">待确认</div><div class="mt-1 text-sm font-medium tabular-nums">{{ pendingCount }} 人</div></div>
      </section>

      <div class="overflow-x-auto rounded-md border bg-background">
        <Table class="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead class="sticky left-0 z-10 w-48 bg-muted">员工</TableHead>
              <TableHead class="w-24 text-right">应出勤</TableHead>
              <TableHead class="min-w-36">请假</TableHead>
              <TableHead class="w-40">已批加班</TableHead>
              <TableHead class="w-32">已批出差</TableHead>
              <TableHead class="min-w-36">考勤记录（导入）</TableHead>
              <TableHead class="w-28">实到分钟</TableHead>
              <TableHead class="w-28">确认状态</TableHead>
              <TableHead class="min-w-40">说明</TableHead>
              <TableHead v-if="canManage && !isClosed" class="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading"><TableCell :colspan="canManage && !isClosed ? 10 : 9" class="h-20 text-center text-muted-foreground">加载中…</TableCell></TableRow>
            <TableRow v-else-if="!rows.length"><TableCell :colspan="canManage && !isClosed ? 10 : 9" class="h-20 text-center text-muted-foreground">本月暂无考勤记录</TableCell></TableRow>
            <TableRow v-for="row in rows" :key="row.employeeId">
              <TableCell class="sticky left-0 z-[1] bg-background">
                <div class="font-medium">{{ row.displayName || row.name }}</div>
                <div class="text-xs text-muted-foreground">{{ [row.employeeNo, row.phone, row.department].filter(Boolean).join(' · ') }}</div>
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ formatMinutes(row.expectedMinutes) }}</TableCell>
              <TableCell class="whitespace-normal text-xs text-muted-foreground"><span v-if="row.requiresLeaveReconciliation" class="mb-1 block text-amber-700 dark:text-amber-400">请假分配待核对</span>{{ leaveBreakdown(row.leaveMinutesByType) }}<div v-if="pendingLeaveLabel(row)" class="tabular-nums">{{ pendingLeaveLabel(row) }}</div></TableCell>
              <TableCell class="whitespace-normal text-xs tabular-nums">
                <div>已批 {{ formatMinutes(row.overtimeApprovedMinutes) }}</div>
                <div v-if="overtimeMethodLabel(row)" class="text-muted-foreground">{{ overtimeMethodLabel(row) }}</div>
                <div v-if="row.pendingOvertimeMinutes" class="text-muted-foreground">待审批 {{ formatMinutes(row.pendingOvertimeMinutes) }}</div>
              </TableCell>
              <TableCell class="text-xs tabular-nums">
                <div>已批 {{ formatMinutes(row.fieldworkApprovedMinutes) }}</div>
                <div v-if="row.pendingFieldworkMinutes" class="text-muted-foreground">待审批 {{ formatMinutes(row.pendingFieldworkMinutes) }}</div>
              </TableCell>
              <TableCell class="whitespace-normal text-xs">
                <template v-if="row.importedAt">
                  <div class="tabular-nums">
                    迟到 {{ countLabel(row.lateTotal) }}<span class="text-muted-foreground">（≤10 {{ countLabel(row.lateWithin10) }} · >10 {{ countLabel(row.lateOver10) }}）</span>
                    · 早退 {{ countLabel(row.earlyLeave) }} · 无打卡 {{ countLabel(row.noClockRecord) }}
                  </div>
                  <div v-if="row.importNote" class="mt-0.5 text-muted-foreground">{{ row.importNote }}</div>
                </template>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="tabular-nums">
                <Input
                  v-if="isRowEditing(row)"
                  v-model="drafts[row.employeeId].actualMinutes"
                  type="number"
                  min="0"
                  step="1"
                  class="h-8 w-24 text-right tabular-nums"
                  :aria-label="`${row.name}实到分钟`"
                  :title="row.actualMinutesIsManual ? '' : row.suggestedActualNote"
                  :disabled="drafts[row.employeeId].confirmationState === 'no_basis'"
                />
                <span v-else>{{ formatMinutes(effectiveActualMinutes(row)) }}</span>
                <!-- 建议值只算不写库：标出来，免得被当成已确认的数据；完整计算过程在提示里 -->
                <div v-if="!isRowEditing(row) && !row.actualMinutesIsManual && row.suggestedActualNote" class="text-[11px] text-muted-foreground" :title="row.suggestedActualNote">系统建议</div>
              </TableCell>
              <TableCell>
                <Select v-if="isRowEditing(row)" :model-value="drafts[row.employeeId].confirmationState || '__pending__'" @update:model-value="value => { drafts[row.employeeId].confirmationState = value == null || value === '__pending__' ? '' : String(value) as LedgerDraft['confirmationState']; onConfirmationChange(row.employeeId) }">
                  <SelectTrigger size="sm" class="w-full text-xs" :aria-label="`${row.name}确认状态`"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__pending__">待确认</SelectItem><SelectItem value="confirmed">已确认</SelectItem><SelectItem value="no_basis">无依据</SelectItem></SelectContent>
                </Select>
                <Badge v-else variant="outline" :class="row.confirmationState === 'pending' ? 'text-amber-700 dark:text-amber-400' : ''">{{ row.confirmationState === 'confirmed' ? '已确认' : row.confirmationState === 'no_basis' ? '无依据' : '待确认' }}</Badge>
              </TableCell>
              <TableCell>
                <Textarea v-if="isRowEditing(row)" v-model="drafts[row.employeeId].note" rows="1" class="min-h-8 resize-y text-xs" :aria-label="`${row.name}考勤说明`" :placeholder="drafts[row.employeeId].confirmationState === 'no_basis' ? '填写无依据原因' : '说明（选填）'" />
                <span v-else class="whitespace-normal break-words text-xs text-muted-foreground">{{ row.note || '—' }}</span>
              </TableCell>
              <TableCell v-if="canManage && !isClosed" class="text-right">
                <template v-if="isRowEditing(row)">
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="hasSavingEmployees" :aria-label="`取消编辑${row.name}考勤`" title="放弃修改" @click="cancelEditRow(row)"><X class="size-4" /></Button>
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="hasSavingEmployees" :aria-label="`保存${row.name}考勤`" title="保存本行" @click="confirmRow(row)"><Check class="size-4" /></Button>
                </template>
                <Button v-else size="sm" variant="ghost" class="h-8 w-7 px-0" :aria-label="`编辑${row.name}考勤`" title="编辑本行" @click="startEditRow(row)"><Pencil class="size-4" /></Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <p v-if="isClosed" class="text-xs text-muted-foreground">本月已结账，台账只读。</p>
      <p v-else-if="canManage" class="text-xs text-muted-foreground">点行末「编辑」确认实到分钟与状态，点对勾保存；关闭月份前需确认每位员工的实到或填写无依据原因。实到按规则预填（应出勤 − 请假 − 迟到 / 早退 / 无打卡扣减），可直接采用或改成实际值，改过的不再被覆盖；加班与出差按已批准时长统计，还没批完的单独标「待审批」。</p>
      <p v-else class="text-xs text-muted-foreground">每人的实到确认与本月结账由<span class="font-medium text-foreground">公司主账号或考勤管理员</span>执行，其他角色只能查看；显示「待确认」是等他们确认，不需要你操作。</p>
    </template>
    </div>

    <AlertDialog v-model:open="actionDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ ledgerAction === 'close' ? '结账本月台账' : '重新开启本月台账' }}</AlertDialogTitle>
          <AlertDialogDescription>{{ month }} · {{ ledgerAction === 'close' ? '结账后本月数据将只读。' : '重新开启后可继续更正台账。' }}</AlertDialogDescription>
        </AlertDialogHeader>
        <label v-if="ledgerAction === 'reopen'" for="ledger-action-reason" class="space-y-1.5 text-sm">
          <span>操作原因</span>
          <Textarea id="ledger-action-reason" v-model="actionReason" rows="3" aria-label="结账或重新开启原因" required />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="actionBusy" @click="actionDialogOpen = false">取消</AlertDialogCancel>
          <Button :disabled="actionBusy || (ledgerAction === 'reopen' && !actionReason.trim())" @click="submitLedgerAction">{{ actionBusy ? '处理中…' : ledgerAction === 'close' ? '确认结账' : '确认开启' }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <LedgerImportDialog v-model:open="importOpen" :month="month" :rows="rows" @imported="loadLedger" />
  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
