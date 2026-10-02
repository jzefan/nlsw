<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Badge } from '@/components/ui/badge'
import PayslipReceipt from '@/components/payslip-receipt.vue'
import PayslipTable from '@/components/payslip-table.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { useDevice } from '@/composables/use-device'
import { getMyPayrollStatements, type MyPayroll } from '@/services/api/payroll.api'
import { payrollTotalsLabels, showPayrollPayments } from '@/constants/payroll-fields'
import { formatBeijingDate, formatCents, formatPayrollMonthLabel, getBeijingYear } from '@/utils/payroll'

type MyPayrollRow = MyPayroll['rows'][number]
/** 隐藏发放相关列时，加载/空态/展开行的合并列数 */
const visibleColumnCount = showPayrollPayments ? 10 : 7
const { isMobile } = useDevice()
const year = ref(getBeijingYear())
const payroll = ref<MyPayroll | null>(null)
const loadError = ref(false)
const loading = ref(false)
const expandedId = ref('')
let requestId = 0

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '读取工资条失败')
}
function rowKey(row: MyPayrollRow) { return `${row.month}-${row.revision}` }
/** 整行单击即可展开/收缩明细，与工资表页保持一致。 */
function toggleRow(key: string) {
  expandedId.value = expandedId.value === key ? '' : key
}
/** 本人页面打开即展示完整工资条，默认展开最新月份，无需再点开才发现各项明细。 */
function latestRowKey(rows: MyPayrollRow[]) {
  const latest = rows.reduce<MyPayrollRow | null>((max, row) => (!max || (row.month ?? '') > (max.month ?? '') ? row : max), null)
  return latest ? rowKey(latest) : ''
}

async function load() {
  if (!Number.isInteger(year.value) || year.value < 2000 || year.value > 2100) {
    toast.error('年份须为2000至2100年')
    return
  }
  const currentId = ++requestId
  loading.value = true
  loadError.value = false
  payroll.value = null
  expandedId.value = ''
  try {
    const response = await getMyPayrollStatements(String(year.value))
    if (response.ok === false) throw new Error(String(response.error || '读取工资条失败'))
    if (currentId !== requestId) return
    payroll.value = response.data ?? null
    expandedId.value = latestRowKey(response.data?.rows ?? [])
  }
  catch (error) {
    if (currentId !== requestId) return
    loadError.value = true
    showError(error)
  }
  finally { if (currentId === requestId) loading.value = false }
}
onMounted(load)
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold">我的工资条</h1>
      <div class="flex flex-wrap items-center gap-2"><label for="my-payroll-year" class="flex items-center gap-2 text-xs text-muted-foreground"><span class="whitespace-nowrap">年度</span><Input id="my-payroll-year" v-model.number="year" type="number" min="2000" max="2100" class="h-9 w-28 text-foreground" /></label><Button size="sm" variant="outline" :disabled="loading" @click="load">查询</Button></div>
    </div>
    <div v-if="loadError && !loading" class="rounded-md border py-10 text-center"><p class="text-sm text-destructive">工资条读取失败，请稍后重试。</p><Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button></div>
    <section v-if="payroll" class="space-y-2">
      <h2 class="text-sm font-semibold">年度汇总 <span class="ml-1 text-xs font-normal text-muted-foreground">{{ payroll.year }} 年 · 各月合计，含公司承担</span></h2>
      <div class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="key in (['incomeSubtotalCents', 'employerContributionCents', 'totalCompensationCents', 'attendanceDeductionCents', 'payableBeforePersonalDeductionsCents', 'netPayCents'] as const)" :key="key">
          <div class="text-xs text-muted-foreground">{{ payrollTotalsLabels[key] }}</div><div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(payroll.totals[key]) }}</div>
        </div>
      </div>
    </section>
    <!-- 移动端：一条月份一张小票；读取失败走上方的错误块，不落成空状态 -->
    <div v-if="isMobile && !loadError" class="space-y-4">
      <p v-if="loading" class="rounded-xl border bg-background py-10 text-center text-sm text-muted-foreground">加载中…</p>
      <p v-else-if="!payroll?.rows.length" class="rounded-xl border bg-background py-10 text-center text-sm text-muted-foreground">暂无已发布工资条</p>
      <template v-else>
        <PayslipReceipt
          v-for="row in payroll?.rows ?? []"
          :key="rowKey(row)"
          :period="formatPayrollMonthLabel(row.month)"
          :name="row.employee?.name ?? ''"
          :employee-no="row.employee?.employeeNo"
          :department="row.employee?.department"
          :components="row.components"
          :totals="row.totals"
        />
      </template>
    </div>

    <div v-else-if="!loadError" class="overflow-x-auto rounded-md border bg-background">
      <Table :class="showPayrollPayments ? 'min-w-[1100px]' : 'min-w-[840px]'">
        <TableHeader><TableRow><TableHead class="w-36">月份</TableHead><TableHead class="w-24">工资条</TableHead><TableHead v-if="showPayrollPayments" class="w-24">发放</TableHead><TableHead class="w-32 text-right">收入合计</TableHead><TableHead class="w-32 text-right">工资总额</TableHead><TableHead class="w-32 text-right">请假与旷工</TableHead><TableHead class="w-32 text-right">实发</TableHead><TableHead v-if="showPayrollPayments" class="w-32 text-right">累计已付</TableHead><TableHead v-if="showPayrollPayments" class="w-32 text-right">剩余</TableHead><TableHead class="w-16 text-right">详情</TableHead></TableRow></TableHeader>
        <TableBody>
          <TableRow v-if="loading"><TableCell :colspan="visibleColumnCount" class="h-20 text-center text-muted-foreground">加载中…</TableCell></TableRow>
          <TableRow v-else-if="!payroll?.rows.length"><TableCell :colspan="visibleColumnCount" class="h-20 text-center text-muted-foreground">暂无已发布工资条</TableCell></TableRow>
          <template v-for="row in payroll?.rows ?? []" :key="rowKey(row)">
            <TableRow class="cursor-pointer" @click="toggleRow(rowKey(row))">
              <TableCell class="font-medium">{{ row.month ?? '—' }}</TableCell>
              <TableCell><Badge variant="outline">已发布</Badge><div class="mt-1 text-[10px] text-muted-foreground">{{ formatBeijingDate(row.publishedAt) }}</div></TableCell>
              <TableCell v-if="showPayrollPayments"><Badge variant="outline">{{ ({ unpaid: '未发放', partial: '部分发放', paid: '已发放', not_publish: '未发布' } as Record<string, string>)[row.paymentStatus] ?? row.paymentStatus }}</Badge></TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.totals?.incomeSubtotalCents) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.totals?.totalCompensationCents) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatCents(row.totals?.attendanceDeductionCents) }}</TableCell>
              <TableCell class="text-right font-medium tabular-nums">{{ formatCents(row.totals?.netPayCents) }}</TableCell>
              <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(row.paidCents) }}</TableCell>
              <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{ formatCents(row.remainingCents) }}</TableCell>
              <TableCell class="text-right"><Button variant="ghost" size="icon" class="size-8" :aria-label="`${expandedId === rowKey(row) ? '收起' : '展开'}工资条详情：${row.month ?? ''}`" :aria-expanded="expandedId === rowKey(row)" @click.stop="toggleRow(rowKey(row))"><ChevronUp v-if="expandedId === rowKey(row)" class="size-4" /><ChevronDown v-else class="size-4" /></Button></TableCell>
            </TableRow>
            <TableRow v-if="expandedId === rowKey(row)"><TableCell :colspan="visibleColumnCount" class="bg-muted/30">
              <div class="space-y-3 py-1">
                <div>
                  <h2 class="mb-2 text-xs font-semibold">有效发布版工资条</h2>
                  <PayslipTable :index="1" :name="row.employee?.name ?? ''" :month="row.month" :components="row.components" :totals="row.totals" :published-at="row.publishedAt" />
                </div>
                <div v-if="showPayrollPayments">
                  <h2 class="mb-2 text-xs font-semibold">收退款记录</h2>
                  <div v-if="!row.paymentHistory?.length" class="py-2 text-xs text-muted-foreground">暂无记录</div>
                  <div v-for="(payment, index) in row.paymentHistory ?? []" :key="`${payment.createdAt}-${index}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-1.5 text-xs">
                    <Badge variant="outline">{{ payment.direction === 'payment' ? '付款' : '退款' }}</Badge><span class="font-medium tabular-nums">{{ formatCents(payment.amountCents) }}</span><span class="text-muted-foreground">{{ payment.paidAt ? formatBeijingDate(payment.paidAt) : '—' }}</span><a v-if="payment.proofUrl" :href="payment.proofUrl" target="_blank" rel="noreferrer" class="underline">凭证</a><span>{{ payment.note }}</span><span class="text-muted-foreground">{{ payment.createdBy?.name }} · 第{{ payment.statementRevision }}版</span>
                  </div>
                </div>
              </div>
            </TableCell></TableRow>
          </template>
        </TableBody>
      </Table>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
