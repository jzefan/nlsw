<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { useDevice } from '@/composables/use-device'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MonthPicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getAttendanceLedgerStatistics, type AttendanceLedgerScope, type AttendanceLedgerStatistics } from '@/services/api/attendance.api'
import { useAuthStore } from '@/stores/auth'
import { leaveLabel } from '@/constants/attendance-labels'
import { getBeijingMonth, getBeijingYear } from '@/utils/payroll'
import { unconfirmedCalendarMessage } from '@/utils/attendance-error'

const authStore = useAuthStore()
const { isMobile } = useDevice()
const scopeLabels: Record<AttendanceLedgerScope, string> = { mine: '本人', team: '团队', company: '全公司' }
const roles = computed(() => {
  const value = authStore.user?.attendanceRoles
  return Array.isArray(value) ? value : value ? [value] : []
})
const defaultScope = computed<AttendanceLedgerScope>(() => {
  if (authStore.isOwner || roles.value.includes('attendance_admin') || roles.value.includes('general_manager')) return 'company'
  if (roles.value.includes('manager')) return 'team'
  return 'mine'
})
const scopeOptions = computed<AttendanceLedgerScope[]>(() => {
  if (authStore.isOwner || roles.value.includes('attendance_admin') || roles.value.includes('general_manager')) return roles.value.includes('manager') ? ['company', 'team', 'mine'] : ['company', 'mine']
  if (roles.value.includes('manager')) return ['team', 'mine']
  return ['mine']
})
const scope = ref<AttendanceLedgerScope>(defaultScope.value)
const scopeLabel = computed(() => scopeLabels[scope.value])
const period = ref<'month' | 'year'>('month')
const month = ref(getBeijingMonth())
const year = ref(getBeijingYear())
const stats = ref<AttendanceLedgerStatistics | null>(null)
const loadError = ref(false)
const calendarError = ref('')
const canManageCalendar = computed(() => authStore.isOwner || roles.value.includes('attendance_admin'))
const loadedScope = ref<AttendanceLedgerScope | null>(null)
const loadedPeriod = ref<'month' | 'year' | null>(null)
const loading = ref(false)
const filterOpen = ref(false)
const requestValue = computed(() => period.value === 'month' ? month.value : String(year.value))
let requestId = 0

// 加班不区分调休 / 加班费，只统计一个「已批加班」口径
const summaryFields = [
  ['expectedMinutes', '应出勤'], ['actualMinutes', '实到'], ['overtimeApprovedMinutes', '已批加班'],
  ['fieldworkApprovedMinutes', '已批出差'],
] as const

function formatMinutes(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const hours = Number((value / 60).toFixed(2))
  return `${hours} 小时`
}
function leaveTotal(values: unknown) {
  if (!values || typeof values !== 'object') return 0
  return Object.values(values as Record<string, unknown>).reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0)
}
function leaveEntries(values: unknown) {
  if (!values || typeof values !== 'object') return [] as Array<[string, number]>
  return Object.entries(values as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([type, minutes]) => [leaveLabel(type), minutes])
}
function statusLabel(status: string) { return status === 'closed' ? '已结账' : status === 'not_started' ? '未开始' : '开放中' }
function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '读取考勤统计失败')
}

async function load() {
  const currentId = ++requestId
  stats.value = null
  loadedScope.value = null
  loadedPeriod.value = null
  loadError.value = false
  calendarError.value = ''
  loading.value = false
  if ((period.value === 'month' && !/^\d{4}-\d{2}$/.test(month.value)) || (period.value === 'year' && (!Number.isInteger(year.value) || year.value < 2000 || year.value > 2100))) {
    toast.error('请选择有效的统计期间')
    return
  }
  const submittedPeriod = period.value
  const submittedValue = requestValue.value
  const submittedScope = scope.value
  loading.value = true
  try {
    const response = await getAttendanceLedgerStatistics(submittedPeriod, submittedValue, submittedScope)
    if (response.ok === false) throw new Error(String(response.error || '读取考勤统计失败'))
    if (currentId === requestId) {
      stats.value = response.data ?? null
      loadedScope.value = submittedScope
      loadedPeriod.value = submittedPeriod
    }
  }
  catch (error) {
    if (currentId !== requestId) return
    calendarError.value = unconfirmedCalendarMessage(error)
    if (!calendarError.value) { loadError.value = true; showError(error) }
  }
  finally { if (currentId === requestId) loading.value = false }
}

watch([period, month, year, scope], () => { void load() })
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div v-if="!isMobile" class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{{ loadedScope ? scopeLabels[loadedScope] : scopeLabel }}范围</span>
        <Badge variant="outline">月度与年度</Badge>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div v-if="scopeOptions.length > 1" class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">范围</span>
          <Select v-model="scope"><SelectTrigger class="w-28" aria-label="考勤统计范围"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in scopeOptions" :key="option" :value="option">{{ scopeLabels[option] }}</SelectItem></SelectContent></Select>
        </div>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">周期</span>
          <Select v-model="period"><SelectTrigger class="w-24" aria-label="考勤统计周期"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">月度</SelectItem><SelectItem value="year">年度</SelectItem></SelectContent></Select>
        </div>
        <div v-if="period === 'month'" class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">月份</span>
          <MonthPicker v-model="month" placeholder="选择月份" class="h-9 w-40 text-foreground" />
        </div>
        <label v-else class="flex items-center gap-2 text-xs text-muted-foreground"><span class="whitespace-nowrap">年度</span><Input v-model.number="year" type="number" min="2000" max="2100" aria-label="考勤统计年度" class="h-9 w-28 text-foreground" /></label>
        <Button size="sm" variant="outline" :disabled="loading" @click="load">查询</Button>
      </div>
    </div>

    <!-- 移动端：筛选条件收进底部 Sheet，避免窄屏横向滚动 -->
    <div v-else class="flex items-center justify-between gap-2 border-b pb-2">
      <div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span class="truncate">{{ loadedScope ? scopeLabels[loadedScope] : scopeLabel }}范围 · {{ period === 'month' ? month : `${year} 年` }}</span>
        <Badge variant="outline" class="shrink-0">月度与年度</Badge>
      </div>
      <Button size="sm" variant="outline" class="shrink-0" @click="filterOpen = true"><SlidersHorizontal class="mr-1.5 size-4" />筛选</Button>
    </div>

    <Sheet v-if="isMobile" v-model:open="filterOpen">
      <SheetContent side="bottom">
        <SheetHeader><SheetTitle>统计条件</SheetTitle></SheetHeader>
        <div class="space-y-3 px-4 text-sm">
          <div v-if="scopeOptions.length > 1" class="space-y-1.5">
            <div class="text-xs text-muted-foreground">范围</div>
            <Select v-model="scope"><SelectTrigger class="w-full" aria-label="考勤统计范围"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in scopeOptions" :key="option" :value="option">{{ scopeLabels[option] }}</SelectItem></SelectContent></Select>
          </div>
          <div class="space-y-1.5">
            <div class="text-xs text-muted-foreground">周期</div>
            <Select v-model="period"><SelectTrigger class="w-full" aria-label="考勤统计周期"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">月度</SelectItem><SelectItem value="year">年度</SelectItem></SelectContent></Select>
          </div>
          <div v-if="period === 'month'" class="space-y-1.5">
            <div class="text-xs text-muted-foreground">月份</div>
            <MonthPicker v-model="month" placeholder="选择月份" class="h-9 w-full" />
          </div>
          <label v-else class="space-y-1.5"><span class="text-xs text-muted-foreground">年度</span><Input v-model.number="year" type="number" min="2000" max="2100" aria-label="考勤统计年度" class="h-9 w-full" /></label>
        </div>
        <SheetFooter><Button class="w-full" :disabled="loading" @click="filterOpen = false">{{ loading ? '读取中…' : '完成' }}</Button></SheetFooter>
      </SheetContent>
    </Sheet>

    <div v-if="loading" class="rounded-md border py-16 text-center text-sm text-muted-foreground">读取统计中…</div>
    <div v-else-if="calendarError" class="rounded-md border px-4 py-12 text-center">
      <p class="text-sm font-medium">{{ calendarError }}</p>
      <p class="mt-2 text-xs text-muted-foreground">确认日历后，才能准确统计应出勤时长。</p>
      <Button v-if="canManageCalendar" as-child size="sm" variant="outline" class="mt-4"><router-link to="/attendance/settings?tab=calendar">去确认工作日历</router-link></Button>
      <p v-else class="mt-3 text-xs text-muted-foreground">请联系考勤管理员处理。</p>
    </div>
    <div v-else-if="loadError" class="rounded-md border py-10 text-center"><p class="text-sm text-destructive">统计读取失败，请检查网络后重试。</p><Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button></div>
    <template v-else-if="stats">
      <section class="space-y-3">
        <h2 class="text-sm font-semibold">汇总 <span class="ml-1 font-normal text-muted-foreground">{{ stats.value }}</span></h2>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3 lg:grid-cols-6">
          <div v-for="[key, label] in summaryFields" :key="key"><div class="text-xs text-muted-foreground">{{ label }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(stats.totals[key]) }}</div></div>
          <div><div class="text-xs text-muted-foreground">请假</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatMinutes(leaveTotal(stats.totals.leaveMinutesByType)) }}</div></div>
          <div><div class="text-xs text-muted-foreground">{{ loadedPeriod === 'year' ? '待确认人月' : '待确认人数' }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.totals.pendingCount ?? '—' }}</div></div>
          <div><div class="text-xs text-muted-foreground">{{ loadedPeriod === 'year' ? '已确认人月' : '已确认人数' }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.totals.confirmedCount ?? '—' }}</div></div>
        </div>
      </section>
      <details class="rounded-md border bg-background px-3 py-2">
        <summary class="cursor-pointer text-sm font-medium">假种统计</summary>
        <div v-if="leaveEntries(stats.totals.leaveMinutesByType).length" class="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 border-t pt-2 sm:grid-cols-3 lg:grid-cols-5">
          <div v-for="[label, minutes] in leaveEntries(stats.totals.leaveMinutesByType)" :key="label" class="flex items-center justify-between gap-2 text-sm"><span class="text-muted-foreground">{{ label }}</span><span class="font-medium tabular-nums">{{ formatMinutes(minutes) }}</span></div>
        </div>
        <p v-else class="mt-2 border-t pt-2 text-xs text-muted-foreground">所选期间暂无请假记录</p>
      </details>
      <div v-if="!isMobile" class="overflow-x-auto rounded-md border bg-background">
        <Table class="min-w-[760px]">
          <TableHeader><TableRow><TableHead>月份</TableHead><TableHead>台账</TableHead><TableHead class="text-right">应出勤</TableHead><TableHead class="text-right">请假</TableHead><TableHead class="text-right">已批加班</TableHead><TableHead class="text-right">已批出差</TableHead><TableHead class="text-right">实到</TableHead><TableHead class="text-right">待确认</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="row in stats.byMonth" :key="row.month">
              <TableCell class="font-medium tabular-nums">{{ row.month }}</TableCell><TableCell><Badge variant="outline">{{ statusLabel(row.status) }}</Badge></TableCell>
              <TableCell class="text-right tabular-nums">{{ formatMinutes(row.totals.expectedMinutes) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatMinutes(leaveTotal(row.totals.leaveMinutesByType)) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatMinutes(row.totals.overtimeApprovedMinutes) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatMinutes(row.totals.fieldworkApprovedMinutes) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatMinutes(row.totals.actualMinutes) }}</TableCell><TableCell class="text-right tabular-nums">{{ row.totals.pendingCount ?? '—' }}</TableCell>
            </TableRow>
            <TableRow v-if="!stats.byMonth.length"><TableCell colspan="8" class="h-16 text-center text-muted-foreground">所选期间暂无考勤统计</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 移动端：按月卡片，2 列汇总块，不横向滚动 -->
      <div v-else class="space-y-2">
        <div v-for="row in stats.byMonth" :key="row.month" class="rounded-md border bg-background">
          <div class="flex items-center justify-between gap-2 px-3 py-2">
            <span class="text-sm font-medium tabular-nums">{{ row.month }}</span>
            <Badge variant="outline">{{ statusLabel(row.status) }}</Badge>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 border-t px-3 py-2.5">
            <div><div class="text-xs text-muted-foreground">应出勤</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ formatMinutes(row.totals.expectedMinutes) }}</div></div>
            <div><div class="text-xs text-muted-foreground">实到</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ formatMinutes(row.totals.actualMinutes) }}</div></div>
            <div><div class="text-xs text-muted-foreground">请假</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ formatMinutes(leaveTotal(row.totals.leaveMinutesByType)) }}</div></div>
            <div><div class="text-xs text-muted-foreground">已批加班</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ formatMinutes(row.totals.overtimeApprovedMinutes) }}</div></div>
            <div><div class="text-xs text-muted-foreground">已批出差</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ formatMinutes(row.totals.fieldworkApprovedMinutes) }}</div></div>
            <div><div class="text-xs text-muted-foreground">待确认</div><div class="mt-0.5 text-sm font-medium tabular-nums">{{ row.totals.pendingCount ?? '—' }}</div></div>
          </div>
        </div>
        <p v-if="!stats.byMonth.length" class="rounded-md border py-10 text-center text-sm text-muted-foreground">所选期间暂无考勤统计</p>
      </div>
      <p class="text-xs text-muted-foreground">已批加班与出差代表审批通过时长，不等同于实际完成；实到仅来自人工确认。</p>
    </template>
    <div v-else class="rounded-md border py-16 text-center text-sm text-muted-foreground">暂无统计数据</div>
  </div>
</template>
