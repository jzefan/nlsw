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
import { payrollTotalsLabels, showPayrollPayments } from '@/constants/payroll-fields'
import { formatCents, getBeijingMonth, getBeijingYear, canViewCompanyPayroll } from '@/utils/payroll'

const authStore = useAuthStore()
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
        <div class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3 lg:grid-cols-6">
          <div v-for="[key, label] in accrualFields" :key="key"><div class="text-xs text-muted-foreground">{{ label }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(stats.accrual[key]) }}</div></div>
          <div><div class="text-xs text-muted-foreground">工资条数</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.accrual.statementCount }}</div></div>
          <div><div class="text-xs text-muted-foreground">已发布</div><div class="mt-1 text-sm font-medium tabular-nums">{{ stats.accrual.publishedCount }}</div></div>
        </div>
      </section>
      <section v-if="showPayrollPayments" class="space-y-3">
        <h2 class="text-sm font-semibold">资金收付</h2>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3">
          <div><div class="text-xs text-muted-foreground">付款总额</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(stats.cash.paidCents) }}</div></div>
          <div><div class="text-xs text-muted-foreground">退款总额</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(stats.cash.refundCents) }}</div></div>
          <div><div class="text-xs text-muted-foreground">净支付</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(stats.cash.netPaidCents) }}</div></div>
        </div>
      </section>
      <div class="overflow-x-auto rounded-md border bg-background">
        <Table :class="showPayrollPayments ? 'min-w-[900px]' : 'min-w-[620px]'">
          <TableHeader><TableRow><TableHead>月份</TableHead><TableHead class="text-right">工资条</TableHead><TableHead class="text-right">收入合计</TableHead><TableHead class="text-right">工资总额</TableHead><TableHead class="text-right">请假与旷工</TableHead><TableHead class="text-right">实发金额</TableHead><TableHead v-if="showPayrollPayments" class="text-right">付款</TableHead><TableHead v-if="showPayrollPayments" class="text-right">退款</TableHead><TableHead v-if="showPayrollPayments" class="text-right">净支付</TableHead><TableHead v-if="showPayrollPayments" class="text-right">待发</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="row in stats.accrual.byMonth" :key="row.month">
              <TableCell class="font-medium tabular-nums">{{ row.month }}</TableCell><TableCell class="text-right tabular-nums">{{ row.statementCount }}</TableCell><TableCell class="text-right tabular-nums">{{ formatCents(row.incomeSubtotalCents) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatCents(row.totalCompensationCents) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatCents(row.attendanceDeductionCents) }}</TableCell><TableCell class="text-right tabular-nums">{{ formatCents(row.netPayCents) }}</TableCell>
              <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.paidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.refundCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(stats.cash.byMonth.find(item => item.month === row.month)?.netPaidCents) }}</TableCell><TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(row.remainingCents) }}</TableCell>
            </TableRow>
            <TableRow v-if="!stats.accrual.byMonth.length"><TableCell :colspan="showPayrollPayments ? 10 : 6" class="h-16 text-center text-muted-foreground">所选期间暂无薪资统计</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
      <p class="text-xs text-muted-foreground">{{ showPayrollPayments ? '工资计提与实际收退款分开统计；未登记付款不会计入实付金额。' : '按工资归属月统计已发布工资条（草稿与未录入不计入）。' }}</p>
    </template>
    <div v-else class="rounded-md border py-16 text-center text-sm text-muted-foreground">暂无统计数据</div>
  </div>
</template>
