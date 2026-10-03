<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MonthPicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getPayrollStatistics, type PayrollStatistics } from '@/services/api/payroll.api'
import { useAuthStore } from '@/stores/auth'
import { useDevice } from '@/composables/use-device'
import { payrollTotalsLabels, showPayrollPayments } from '@/constants/payroll-fields'
import { formatCents, formatAttendanceDays, formatDayCount, formatMinutes, getBeijingMonth, getBeijingYear, canViewCompanyPayroll } from '@/utils/payroll'

const authStore = useAuthStore()
const { isMobile } = useDevice()
/** 财务、总经理、董事长看全公司，其他账号只看本人。 */
const companyScope = computed(() => canViewCompanyPayroll(authStore.user))
const period = ref<'month' | 'year'>('month')
const month = ref(getBeijingMonth())
const year = ref(getBeijingYear())
const stats = ref<PayrollStatistics | null>(null)
const loadError = ref(false)
const loading = ref(false)
let requestId = 0

const value = computed(() => period.value === 'month' ? month.value : String(year.value))
const accrualFields = ([
  'incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents',
  'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents',
] as const).map(key => [key, payrollTotalsLabels[key]] as const)

/** 考勤口径整天没读到（dayMinutes 为 null）时，时长一律写「—」，避免把取不到当成「真的没有」。 */
const attendanceAvailable = computed(() => stats.value?.attendance?.dayMinutes != null)
/** 每日工作分钟：把请假/旷工分钟折成天；出差直接用日历天数。 */
const dayMinutes = computed(() => stats.value?.attendance?.dayMinutes ?? null)

/** 出差没有金额项（系统里没有出差补贴字段），单独说明一句比留空更清楚；其余项金额为 0 也照实写 ¥0.00。 */
function attendanceAmount(cents: number | null | undefined, label: string) {
  return typeof cents === 'number' ? `${label} ${formatCents(cents)}` : label
}

/** 四个考勤口径的固定顺序：表头与每一行都按它排。 */
const attendanceMetrics = [
  { key: 'fieldwork', label: '出差' },
  { key: 'overtime', label: '加班' },
  { key: 'leave', label: '请假' },
  { key: 'absence', label: '旷工' },
] as const

type AttendanceRow = PayrollStatistics['attendance']['byMonth'][number]

/** 某个月份没等到考勤行时的占位（只可能出现在接口异常时，界面按「—」渲染）。 */
const emptyAttendanceRow: AttendanceRow = {
  month: '',
  leaveMinutes: 0, overtimeMinutes: 0, fieldworkMinutes: 0, fieldworkDays: 0,
  absenceMinutes: 0, absenceSkippedCount: 0, leaveUnreconciled: false,
  leaveDeductionCents: 0, absenceDeductionCents: 0, overtimeAllowanceCents: 0,
}

/** 一行/合计的四个口径：时长/天数在前，金额在后。考勤口径没读到时时长一律「—」。 */
function attendanceCells(row: AttendanceRow) {
  const duration = (text: string) => attendanceAvailable.value ? text : '—'
  return [
    { key: 'fieldwork', label: '出差', duration: duration(formatDayCount(row.fieldworkDays)), amount: '无金额项' },
    { key: 'overtime', label: '加班', duration: duration(formatMinutes(row.overtimeMinutes)), amount: attendanceAmount(row.overtimeAllowanceCents, '加班补贴') },
    { key: 'leave', label: '请假', duration: duration(formatAttendanceDays(row.leaveMinutes, dayMinutes.value)), amount: attendanceAmount(row.leaveDeductionCents, '扣款') },
    { key: 'absence', label: '旷工', duration: duration(formatAttendanceDays(row.absenceMinutes, dayMinutes.value)), amount: attendanceAmount(row.absenceDeductionCents, '扣款') },
  ]
}

/** 工资口径与考勤口径按月份合成同一张表：一个月份一行，两边都按同一个月取值。 */
const monthlyRows = computed(() => {
  const attendance = new Map((stats.value?.attendance?.byMonth ?? []).map(row => [row.month, row]))
  return (stats.value?.accrual.byMonth ?? []).map(row => ({ ...row, attendance: attendance.get(row.month) ?? emptyAttendanceRow }))
})

/** 多个月份时才补一行「合计」（月度模式下那一行本身就是合计，再加一行是重复）。 */
const showTotalsRow = computed(() => monthlyRows.value.length > 1)
const tableColumnCount = computed(() => showPayrollPayments ? 13 : 9)

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '读取薪资统计失败')
}

async function load() {
  if ((period.value === 'month' && !/^\d{4}-\d{2}$/.test(month.value)) || (period.value === 'year' && (!Number.isInteger(year.value) || year.value < 2000 || year.value > 2100))) {
    toast.error('请选择有效的统计期间')
    return
  }
  const currentId = ++requestId
  loading.value = true
  loadError.value = false
  stats.value = null
  try {
    const response = await getPayrollStatistics(period.value, value.value)
    if (response.ok === false) throw new Error(String(response.error || '读取薪资统计失败'))
    if (currentId === requestId) stats.value = response.data ?? null
  }
  catch (error) { if (currentId === requestId) { loadError.value = true; showError(error) } }
  finally { if (currentId === requestId) loading.value = false }
}

watch([period, month, year], () => { void load() })
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-xs text-muted-foreground"><span>{{ companyScope ? '全公司' : '本人' }}范围</span><Badge variant="outline">{{ period === 'month' ? '月度' : '年度' }}</Badge></div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">周期</span>
          <Select v-model="period"><SelectTrigger class="w-24" aria-label="统计周期"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">月度</SelectItem><SelectItem value="year">年度</SelectItem></SelectContent></Select>
        </div>
        <div v-if="period === 'month'" class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">月份</span>
          <MonthPicker v-model="month" placeholder="选择月份" class="h-9 w-40 text-foreground" />
        </div>
        <label v-else class="flex items-center gap-2 text-xs text-muted-foreground"><span class="whitespace-nowrap">年度</span><Input v-model.number="year" type="number" min="2000" max="2100" aria-label="薪资统计年度" class="h-9 w-28 text-foreground" /></label>
        <Button size="sm" variant="outline" :disabled="loading" @click="load">查询</Button>
      </div>
    </div>

    <div v-if="loading" class="rounded-md border py-16 text-center text-sm text-muted-foreground">读取统计中…</div>
    <div v-else-if="loadError" class="rounded-md border py-10 text-center"><p class="text-sm text-destructive">薪资统计读取失败，请检查网络后重试。</p><Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button></div>
    <template v-else-if="stats">
      <section class="space-y-3">
        <h2 class="text-sm font-semibold">工资计提 <span class="ml-1 font-normal text-muted-foreground">{{ stats.value }}</span></h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-3 sm:border-y sm:py-3 lg:grid-cols-6">
          <div v-for="[key, label] in accrualFields" :key="key" class="rounded-lg border bg-background p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"><div class="text-xs text-muted-foreground">{{ label }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(stats.accrual[key]) }}</div></div>
          <div class="rounded-lg border bg-background p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"><div class="text-xs text-muted-foreground">工资条数</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.accrual.statementCount }}</div></div>
          <div class="rounded-lg border bg-background p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"><div class="text-xs text-muted-foreground">已发布</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.accrual.publishedCount }}</div></div>
        </div>
      </section>

      <!-- 移动端：逐月一张卡，考勤四项 + 工资金额都在里面 -->
      <div v-if="isMobile" class="space-y-2">
        <p v-if="!monthlyRows.length" class="rounded-xl border bg-background py-8 text-center text-sm text-muted-foreground">所选期间暂无薪资统计</p>
        <div v-for="row in monthlyRows" :key="row.month" class="rounded-xl border bg-background p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium tabular-nums">{{ row.month }}</span>
            <span class="text-xs text-muted-foreground">工资条 {{ row.statementCount }}</span>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            <div v-for="cell in attendanceCells(row.attendance)" :key="cell.key">
              <div class="text-xs text-muted-foreground">{{ cell.label }}</div>
              <div class="mt-0.5 text-xs font-medium tabular-nums">{{ cell.duration }}</div>
              <div class="text-[11px] text-muted-foreground tabular-nums">{{ cell.amount }}</div>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2">
            <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">收入合计</span><span class="text-xs font-medium tabular-nums">{{ formatCents(row.incomeSubtotalCents) }}</span></div>
            <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">工资总额</span><span class="text-xs font-medium tabular-nums">{{ formatCents(row.totalCompensationCents) }}</span></div>
            <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">实发金额</span><span class="text-xs font-medium tabular-nums">{{ formatCents(row.netPayCents) }}</span></div>
            <template v-if="showPayrollPayments">
              <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">付款</span><span class="text-xs font-medium tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.paidCents) }}</span></div>
              <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">退款</span><span class="text-xs font-medium tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.refundCents) }}</span></div>
              <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">净支付</span><span class="text-xs font-medium tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.netPaidCents) }}</span></div>
              <div class="flex items-baseline justify-between gap-2"><span class="text-xs text-muted-foreground">待发</span><span class="text-xs font-medium tabular-nums">{{ formatCents(row.remainingCents) }}</span></div>
            </template>
          </div>
        </div>
      </div>

      <!-- 桌面：工资口径与考勤口径合并成一张按月表，考勤四项占 4 列、每格「时长 + 金额」两行 -->
      <div v-else class="overflow-x-auto rounded-md border bg-background">
        <Table :class="showPayrollPayments ? 'min-w-[1200px]' : 'min-w-[880px]'">
          <TableHeader>
            <TableRow>
              <TableHead>月份</TableHead><TableHead class="text-right">工资条</TableHead><TableHead class="text-right">收入合计</TableHead><TableHead class="text-right">工资总额</TableHead>
              <TableHead v-for="item in attendanceMetrics" :key="item.key" class="text-right">{{ item.label }}</TableHead>
              <TableHead class="text-right">实发金额</TableHead>
              <TableHead v-if="showPayrollPayments" class="text-right">付款</TableHead><TableHead v-if="showPayrollPayments" class="text-right">退款</TableHead><TableHead v-if="showPayrollPayments" class="text-right">净支付</TableHead><TableHead v-if="showPayrollPayments" class="text-right">待发</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="row in monthlyRows" :key="row.month">
              <TableCell class="font-medium tabular-nums">{{ row.month }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ row.statementCount }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.incomeSubtotalCents) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.totalCompensationCents) }}</TableCell>
              <TableCell v-for="cell in attendanceCells(row.attendance)" :key="cell.key" class="text-right">
                <div class="tabular-nums">{{ cell.duration }}</div>
                <div class="text-xs text-muted-foreground tabular-nums">{{ cell.amount }}</div>
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.netPayCents) }}</TableCell>
              <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.paidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.refundCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.netPaidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(row.remainingCents) }}</TableCell>
            </TableRow>
            <TableRow v-if="!monthlyRows.length"><TableCell :colspan="tableColumnCount" class="h-16 text-center text-muted-foreground">所选期间暂无薪资统计</TableCell></TableRow>
            <TableRow v-else-if="showTotalsRow" class="border-t bg-muted/40 font-medium">
              <TableCell>合计</TableCell>
              <TableCell class="text-right tabular-nums">{{ stats.accrual.statementCount }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(stats.accrual.incomeSubtotalCents) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(stats.accrual.totalCompensationCents) }}</TableCell>
              <TableCell v-for="cell in attendanceCells(stats.attendance.totals)" :key="cell.key" class="text-right">
                <div class="tabular-nums">{{ cell.duration }}</div>
                <div class="text-xs font-normal text-muted-foreground tabular-nums">{{ cell.amount }}</div>
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(stats.accrual.netPayCents) }}</TableCell>
              <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.paidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.refundCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.netPaidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.accrual.remainingCents) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p v-if="!attendanceAvailable" class="text-xs text-amber-700 dark:text-amber-400">
        考勤时长这次没读到，出差/加班/请假/旷工的时长显示「—」，金额仍取自工资条。
      </p>
      <p v-if="stats.attendance.totals.leaveUnreconciled" class="text-xs text-amber-700 dark:text-amber-400">
        有请假单没能按天分摊（需要先在考勤台账复核），涉及的员工没有计算旷工。
      </p>
      <p v-if="stats.attendance.totals.absenceSkippedCount" class="text-xs text-amber-700 dark:text-amber-400">
        {{ stats.attendance.totals.absenceSkippedCount }} 人月的实到还没确认（或无依据、工作日历未确认），这部分没有计入旷工。
      </p>
      <p class="text-xs text-muted-foreground">{{ showPayrollPayments ? '工资计提与实际收退款分开统计；未登记付款不会计入实付金额。' : '按工资归属月统计已发布工资条（草稿与未录入不计入）。' }}</p>
      <p class="text-xs text-muted-foreground">出差按日历天数、加班按小时、请假与旷工按每日工作分钟折成天；金额取自已发布工资条（出差没有对应金额项）。旷工按台账缺口推导：应出勤 − 实到 − 请假 − 迟到/早退/无打卡扣减，只统计已确认实到的人。</p>
    </template>
    <div v-else class="rounded-md border py-16 text-center text-sm text-muted-foreground">暂无统计数据</div>
  </div>
</template>
