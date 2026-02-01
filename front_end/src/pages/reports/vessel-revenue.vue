<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'
import { Download, Filter, Search } from 'lucide-vue-next'
import { VisAxis, VisGroupedBar, VisXYContainer } from '@unovis/vue'

import type { ChartConfig } from '@/components/ui/chart'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'
import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import {
  getVesselRevenue,
  getVesselDetail,
  type VesselRevenueData,
  type VesselDetailItem,
  type VesselSummaryItem
} from '@/services/api/vessel-statistics.api'

// State
const loading = ref(false)
const showChart = ref(false)
const chartMode = ref<'weight' | 'amount'>('weight')
const statisticsData = ref<VesselRevenueData[]>([])

// Date Selection State (Reusing logic from customer-revenue)
const showDateDialog = ref(false)
const startDate = ref<Date>()
const endDate = ref<Date>()
const dateSelectionMode = ref<'month' | 'year' | 'custom'>('month')

const currentYear = new Date().getFullYear()
const years = Array.from({ length: currentYear - 2015 + 2 }, (_, i) => (2015 + i).toString()).reverse()
const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString())

const startYear = ref(currentYear.toString())
const startMonth = ref((new Date().getMonth() + 1).toString())
const endYear = ref(currentYear.toString())
const endMonth = ref((new Date().getMonth() + 1).toString())

const formattedStartDate = computed({
  get: () => startDate.value ? startDate.value.toISOString().split('T')[0] : '',
  set: (val: string) => {
    if (val) startDate.value = new Date(val)
    else startDate.value = undefined
  }
})

const formattedEndDate = computed({
  get: () => endDate.value ? endDate.value.toISOString().split('T')[0] : '',
  set: (val: string) => {
    if (val) endDate.value = new Date(val)
    else endDate.value = undefined
  }
})

// Details Dialog State
const showSummaryDialog = ref(false)
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const summaryItems = ref<Record<string, VesselSummaryItem>>({})
const detailItems = ref<Record<string, VesselDetailItem[]>>({})
const vehNameList = ref<string[]>([])
const detailTitle = ref('')

// Chart Config
const chartConfig = computed(() => {
  if (chartMode.value === 'weight') {
    return {
      vhTotal: { label: '车总吨位', color: 'var(--chart-1)' },
      vhOwnWeight: { label: '自有车吨位', color: 'var(--chart-2)' },
      vhNonOwnWeight: { label: '外挂车吨位', color: 'var(--chart-3)' },
      vsTotal: { label: '船总吨位', color: 'var(--chart-4)' },
      vsOwnWeight: { label: '自有船吨位', color: 'var(--chart-5)' },
    } as ChartConfig
  } else {
    return {
      vhRevenue: { label: '车总金额', color: 'var(--chart-1)' },
      vhOwnIncome: { label: '自有车收金额', color: 'var(--chart-2)' },
      vhNonOwnIncome: { label: '外挂车收金额', color: 'var(--chart-3)' },
      vsRevenue: { label: '船总金额', color: 'var(--chart-4)' },
      vsOwnIncome: { label: '自有船收金额', color: 'var(--chart-5)' },
    } as ChartConfig
  }
})

const chartAccessors = computed(() => {
  const keys = Object.keys(chartConfig.value)
  return keys.map(k => (d: any) => d[k])
})

const chartColors = computed(() => {
  return Object.values(chartConfig.value).map(c => c.color)
})

// Computed Totals
const summaryTotals = computed(() => {
  if (statisticsData.value.length === 0) return null
  const totals = {
    vsTotal: 0, vsRevenue: 0, vsOwnWeight: 0, vsOwnIncome: 0, vsOwnDeposit: 0, vsOwnProfit: 0,
    vsNonOwnWeight: 0, vsNonOwnIncome: 0, vsNonOwnDeposit: 0, vsProfit: 0, vsFixedCost: 0,
    vhTotal: 0, vhRevenue: 0, vhOwnWeight: 0, vhOwnIncome: 0, vhOwnDeposit: 0, vhOwnProfit: 0,
    vhNonOwnWeight: 0, vhNonOwnIncome: 0, vhNonOwnDeposit: 0, vhProfit: 0, vhFixedCost: 0,
    drayage: 0, forklift: 0,
    vsNetProfit: 0, vhNetProfit: 0
  }
  
  statisticsData.value.forEach(d => {
    Object.keys(totals).forEach(k => {
      if (k in d) (totals as any)[k] += (d as any)[k]
    })
    totals.vsNetProfit += (d.vsOwnProfit + d.vsProfit - d.vsFixedCost)
    totals.vhNetProfit += (d.vhOwnProfit + d.vhProfit - d.vhFixedCost + d.drayage + d.forklift)
  })
  return totals
})

// Methods
function getMonthsList(start: Date, end: Date) {
  const list = []
  const current = new Date(start)
  const last = new Date(end)
  current.setDate(1)
  while (current < last) {
    const y = current.getFullYear()
    const m = current.getMonth() + 1
    list.push(`${y}-${m.toString().padStart(2, '0')}`)
    current.setMonth(current.getMonth() + 1)
  }
  return list
}

async function fetchData() {
  if (!startDate.value || !endDate.value) {
    toast.error('请选择日期范围')
    return
  }
  
  loading.value = true
  try {
    if (startDate.value && endDate.value && startDate.value > endDate.value) {
      toast.error('开始日期不能晚于结束日期')
      return
    }

    const res = await getVesselRevenue({
      fDate1: startDate.value.toISOString(),
      fDate2: endDate.value.toISOString(),
      fMonths: getMonthsList(startDate.value, endDate.value)
    })
    if (res.ok) {
      statisticsData.value = res.stat_data
      if (res.stat_data.length === 0) toast.info('没有找到数据，请选择其它日期')
    } else {
      toast.error('获取数据失败')
    }
  } catch (e) {
    console.error(e)
    toast.error('获取数据出错')
  } finally {
    loading.value = false
  }
}

function handleDateConfirm() {
  if (dateSelectionMode.value === 'month') {
    const s = new Date(parseInt(startYear.value), parseInt(startMonth.value) - 1, 1)
    const e = new Date(parseInt(endYear.value), parseInt(endMonth.value), 1)
    if (s >= e) { toast.error('开始月份不能晚于结束月份'); return }
    startDate.value = s
    endDate.value = e
  } else if (dateSelectionMode.value === 'year') {
    const year = parseInt(startYear.value)
    startDate.value = new Date(year, 0, 1)
    endDate.value = new Date(year + 1, 0, 1)
  } else {
    if (!startDate.value || !endDate.value) { toast.error('请选择日期范围'); return }
  }
  showDateDialog.value = false
  fetchData()
}

function formatDateRange(start?: Date, end?: Date) {
  if (!start || !end) return ''
  const displayEnd = new Date(end.getTime() - 1)
  return `${start.toLocaleDateString('zh-CN')} 到 ${displayEnd.toLocaleDateString('zh-CN')}`
}

function formatNum(val: number) {
  return val.toFixed(3)
}

// Drill-down Detail Handlers
async function openDrillDown(type: '自有' | '外挂', mode: 'summary' | 'detail') {
  if (!startDate.value || !endDate.value) { toast.error('请先查询数据'); return }
  
  detailTitle.value = `${type}车船费用${mode === 'summary' ? '统计' : '清单'}`
  detailLoading.value = true
  if (mode === 'summary') showSummaryDialog.value = true
  else showDetailDialog.value = true

  try {
    const res = await getVesselDetail({
      fDate1: startDate.value.toISOString(),
      fDate2: endDate.value.toISOString(),
      fVehType: type,
      fSummary: mode === 'summary' ? 'YES' : 'NO'
    })
    
    if (res.ok) {
      if (mode === 'summary') summaryItems.value = res.summary_data || {}
      else {
        detailItems.value = res.vessel_detail || {}
        vehNameList.value = res.vehNameList || []
      }
    } else {
      toast.error('获取明细失败')
    }
  } catch (e) {
    console.error(e)
  } finally {
    detailLoading.value = false
  }
}

// Date Linkage logic
function disableStartDate(date: Date) {
  if (endDate.value) {
    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (startDate.value) {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

function handleExport() {
  if (statisticsData.value.length === 0) return
  const ws = XLSX.utils.table_to_sheet(document.getElementById('stat-table'))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '车船营业额')
  XLSX.writeFile(wb, `车船营业额_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

</script>

<template>
  <BasicPage title="车船营业额统计" description="查看车船运输营业额及利润统计">
    <!-- Toolbar -->
    <div class="flex flex-col gap-4 mb-6 p-4 border rounded-lg bg-muted/30">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <Button variant="default" @click="showDateDialog = true">
            <Filter class="w-4 h-4 mr-2" />
            选择统计日期
          </Button>
          
          <div class="flex items-center gap-2">
            <input
              id="show-chart"
              type="checkbox"
              v-model="showChart"
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <Label for="show-chart" class="cursor-pointer">显示图表</Label>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex bg-muted p-1 rounded-md mr-4">
            <Button 
              size="sm" 
              :variant="chartMode === 'weight' ? 'secondary' : 'ghost'" 
              @click="chartMode = 'weight'"
              class="h-7 text-xs px-3"
            >
              显示吨位
            </Button>
            <Button 
              size="sm" 
              :variant="chartMode === 'amount' ? 'secondary' : 'ghost'" 
              @click="chartMode = 'amount'"
              class="h-7 text-xs px-3"
            >
              显示金额
            </Button>
          </div>

          <div class="flex gap-1 border-r pr-2 mr-2">
            <Button variant="outline" size="sm" @click="openDrillDown('自有', 'summary')">自有统计</Button>
            <Button variant="outline" size="sm" @click="openDrillDown('自有', 'detail')">自有清单</Button>
          </div>
          <div class="flex gap-1 border-r pr-2 mr-2">
            <Button variant="outline" size="sm" @click="openDrillDown('外挂', 'summary')">外挂统计</Button>
            <Button variant="outline" size="sm" @click="openDrillDown('外挂', 'detail')">外挂清单</Button>
          </div>
          <Button variant="secondary" size="sm" @click="handleExport">
            <Download class="w-4 h-4 mr-2" />
            导出数据
          </Button>
        </div>
      </div>
    </div>

    <!-- Chart Section -->
    <div v-if="showChart && statisticsData.length > 0" class="mb-8 p-6 border rounded-lg bg-card shadow-sm">
      <ChartContainer :config="chartConfig" class="aspect-auto h-[350px] w-full" :cursor="false">
        <VisXYContainer :data="statisticsData">
          <VisGroupedBar 
            :x="(d: VesselRevenueData) => d.month" 
            :y="chartAccessors"
            :color="(_d: any, i: number) => chartColors[i]"
          />
          <VisAxis type="x" :x="(d: VesselRevenueData) => d.month" :tick-line="false" :domain-line="false" />
          <VisAxis type="y" :tick-line="false" :domain-line="false" :num-ticks="5" />
          <ChartTooltip />
          <ChartCrosshair 
            :template="componentToString(chartConfig, ChartTooltipContent, {
              labelFormatter: (d: string) => d
            })" 
          />
        </VisXYContainer>
        <ChartLegendContent />
      </ChartContainer>
    </div>

    <!-- Table Section -->
    <div v-if="loading" class="flex flex-col items-center justify-center p-24 border rounded-lg bg-muted/5">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4"></div>
        <p class="text-lg font-medium text-muted-foreground animate-pulse">正在查询数据，请稍等...</p>
    </div>

    <div v-else-if="statisticsData.length > 0" class="space-y-6">
      <div class="text-2xl font-bold text-center">
        车船数据统计日期：{{ formatDateRange(startDate, endDate) }}
      </div>
      
      <div class="border rounded-md overflow-x-auto">
        <Table id="stat-table" class="border-collapse min-w-[1200px]">
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead colspan="2" rowspan="2" class="text-center border font-bold bg-muted">月份</TableHead>
              <TableHead colspan="2" class="text-center border bg-orange-100 text-black font-bold">总营业额</TableHead>
              <TableHead colspan="4" class="text-center border bg-blue-100 text-black font-bold">自有车船</TableHead>
              <TableHead colspan="4" class="text-center border bg-emerald-100 text-black font-bold">外挂车船</TableHead>
              <TableHead rowspan="2" class="text-center border font-bold bg-gray-50">固定成本</TableHead>
              <TableHead rowspan="2" class="text-center border font-bold bg-gray-50">短驳应收</TableHead>
              <TableHead rowspan="2" class="text-center border font-bold bg-gray-50">叉车应收</TableHead>
              <TableHead rowspan="2" class="text-center border font-bold bg-gray-50">总利润</TableHead>
            </TableRow>
            <TableRow>
              <TableHead class="text-center border bg-orange-50">总吨位</TableHead>
              <TableHead class="text-center border bg-orange-50">总金额</TableHead>
              <TableHead class="text-center border bg-blue-50">吨位</TableHead>
              <TableHead class="text-center border bg-blue-50">应收金额</TableHead>
              <TableHead class="text-center border bg-blue-50">应付金额</TableHead>
              <TableHead class="text-center border bg-blue-50 font-bold">利润</TableHead>
              <TableHead class="text-center border bg-emerald-50">吨位</TableHead>
              <TableHead class="text-center border bg-emerald-50">应收金额</TableHead>
              <TableHead class="text-center border bg-emerald-50">应付金额</TableHead>
              <TableHead class="text-center border bg-emerald-50 font-bold">利润</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="item in statisticsData" :key="item.month">
              <!-- Vessel Row -->
              <TableRow>
                <TableCell rowspan="2" class="text-center border font-medium align-middle">{{ item.month }}</TableCell>
                <TableCell class="text-center border bg-indigo-50/30 text-xs font-bold">船运</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vsTotal) }}</TableCell>
                <TableCell class="text-right border font-bold text-orange-600"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vsRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vsOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vsOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vsOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vsOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vsNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vsNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vsNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vsProfit) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vsFixedCost) }}</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border font-bold" :class="item.vsOwnProfit + item.vsProfit - item.vsFixedCost >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vsOwnProfit + item.vsProfit - item.vsFixedCost) }}
                </TableCell>
              </TableRow>
              <!-- Truck Row -->
              <TableRow>
                <TableCell class="text-center border bg-amber-50/30 text-xs font-bold">车运</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vhTotal) }}</TableCell>
                <TableCell class="text-right border font-bold text-orange-600"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vhRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vhOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vhOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vhOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vhOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(item.vhNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vhNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vhNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vhProfit) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.vhFixedCost) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.drayage) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(item.forklift) }}</TableCell>
                <TableCell class="text-right border font-bold" :class="item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift) }}
                </TableCell>
              </TableRow>
            </template>

            <!-- Summary Total Row -->
            <template v-if="summaryTotals">
              <TableRow class="bg-muted font-bold">
                <TableCell rowspan="2" class="text-center border align-middle">总计</TableCell>
                <TableCell class="text-center border text-xs">船运</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vsTotal) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vsOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vsNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsProfit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsFixedCost) }}</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border" :class="summaryTotals.vsNetProfit >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vsNetProfit) }}
                </TableCell>
              </TableRow>
              <TableRow class="bg-muted font-bold">
                <TableCell class="text-center border text-xs">车运</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vhTotal) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vhOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(summaryTotals.vhNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhProfit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhFixedCost) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.drayage) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.forklift) }}</TableCell>
                <TableCell class="text-right border" :class="summaryTotals.vhNetProfit >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNum(summaryTotals.vhNetProfit) }}
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>
    </div>

    <div v-else-if="!loading" class="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-muted/10 text-muted-foreground">
      <p>请选择日期范围并点击“选择统计日期”开始查询</p>
    </div>

    <!-- Reuse Date Selection Dialog -->
    <Dialog v-model:open="showDateDialog">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader><DialogTitle>选择统计日期</DialogTitle></DialogHeader>
            <div class="grid gap-4 py-4">
                <div class="flex items-center gap-4">
                     <Button :variant="dateSelectionMode === 'month' ? 'default' : 'outline'" size="sm" @click="dateSelectionMode = 'month'">按月</Button>
                     <Button :variant="dateSelectionMode === 'year' ? 'default' : 'outline'" size="sm" @click="dateSelectionMode = 'year'">按年</Button>
                     <Button :variant="dateSelectionMode === 'custom' ? 'default' : 'outline'" size="sm" @click="dateSelectionMode = 'custom'">自定义</Button>
                </div>
                <div v-if="dateSelectionMode === 'month'" class="space-y-4">
                    <div class="grid gap-2">
                        <Label>开始月份</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <Select v-model="startYear"><SelectTrigger><SelectValue placeholder="年份" /></SelectTrigger><SelectContent><SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem></SelectContent></Select>
                            <Select v-model="startMonth"><SelectTrigger><SelectValue placeholder="月份" /></SelectTrigger><SelectContent><SelectItem v-for="m in months" :key="m" :value="m">{{ m }}月</SelectItem></SelectContent></Select>
                        </div>
                    </div>
                    <div class="grid gap-2">
                        <Label>结束月份</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <Select v-model="endYear"><SelectTrigger><SelectValue placeholder="年份" /></SelectTrigger><SelectContent><SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem></SelectContent></Select>
                            <Select v-model="endMonth"><SelectTrigger><SelectValue placeholder="月份" /></SelectTrigger><SelectContent><SelectItem v-for="m in months" :key="m" :value="m">{{ m }}月</SelectItem></SelectContent></Select>
                        </div>
                    </div>
                </div>
                <div v-else-if="dateSelectionMode === 'year'" class="grid gap-2">
                    <Label>选择年份</Label>
                    <Select v-model="startYear"><SelectTrigger><SelectValue placeholder="年份" /></SelectTrigger><SelectContent><SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem></SelectContent></Select>
                </div>
                <div v-else class="grid gap-4">
                    <div class="grid gap-2"><Label>开始日期</Label><DatePicker v-model="formattedStartDate" :disabled-date="disableStartDate" disabled-hint="开始日期不能晚于结束日期" /></div>
                    <div class="grid gap-2"><Label>结束日期</Label><DatePicker v-model="formattedEndDate" :disabled-date="disableEndDate" disabled-hint="结束日期不能早于开始日期" /></div>
                </div>
            </div>
            <DialogFooter><Button @click="handleDateConfirm">确定</Button></DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Summary Dialog -->
    <Dialog v-model:open="showSummaryDialog">
      <DialogContent class="min-w-[60vw] flex flex-col max-h-[80vh]">
        <DialogHeader><DialogTitle>{{ detailTitle }}</DialogTitle></DialogHeader>
        <div class="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow><TableHead>车船号</TableHead><TableHead>吨位</TableHead><TableHead>金额</TableHead><TableHead>车船联系人</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, vname) in summaryItems" :key="vname">
                <TableCell>{{ vname }}</TableCell>
                <TableCell>{{ formatNum(item.weight) }}</TableCell>
                <TableCell>{{ formatNum(item.amount) }}</TableCell>
                <TableCell>{{ item.contact }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" @click="() => {}">导出Excel</Button><Button @click="showSummaryDialog = false">关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Detailed List Dialog -->
    <Dialog v-model:open="showDetailDialog">
      <DialogContent class="min-w-[90vw] flex flex-col h-[90vh]">
        <DialogHeader><DialogTitle>{{ detailTitle }}</DialogTitle></DialogHeader>
        <div class="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>车船号</TableHead><TableHead>客户名称/单位</TableHead><TableHead>起始地</TableHead><TableHead>目的地</TableHead>
                <TableHead>总价</TableHead><TableHead>单价</TableHead><TableHead>发运块数</TableHead><TableHead>发运重量</TableHead>
                <TableHead>发货日期</TableHead><TableHead>预付</TableHead><TableHead>滞留天数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="vname in vehNameList" :key="vname">
                <TableRow v-for="(item, idx) in detailItems[vname]" :key="`${vname}-${idx}`">
                  <TableCell>{{ vname }}</TableCell><TableCell>{{ item.name }}</TableCell><TableCell>{{ item.ship_from }}</TableCell><TableCell>{{ item.ship_to }}</TableCell>
                  <TableCell>{{ formatNum(item.price) }}</TableCell><TableCell>{{ formatNum(item.single_price) }}</TableCell>
                  <TableCell>{{ item.send_num }}</TableCell><TableCell>{{ formatNum(item.send_weight) }}</TableCell>
                  <TableCell>{{ new Date(item.ship_date).toLocaleDateString() }}</TableCell>
                  <TableCell>{{ item.advance_mode }}: {{ formatNum(item.advance_charge) }}</TableCell><TableCell>{{ item.delay_day }}</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" @click="() => {}">导出Excel</Button><Button @click="showDetailDialog = false">关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>

  </BasicPage>
</template>

<style scoped>
.border { border-color: #e5e7eb; }
</style>

<route lang="yaml">
meta:
  auth: true
</route>
