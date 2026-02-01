<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'
import { Check, ChevronsUpDown, Download, Filter, Search, X } from 'lucide-vue-next'
import { VisAxis, VisGroupedBar, VisXYContainer } from '@unovis/vue'
import { GroupedBar } from '@unovis/ts'

import type { ChartConfig } from '@/components/ui/chart'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { getCompanies } from '@/services/api/data-dict.api'
import {
  getStatisticsData,
  getCustomerDetail,
  getCustomerChartData,
  type StatisticsData,
  type CustomerDetailData,
  type ChartDataPoint
} from '@/services/api/statistics.api'

const chartConfig = {
  weight: {
    label: '总重量 (吨)',
    color: 'var(--chart-1)',
  },
  price: {
    label: '总金额 (元)',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

// State
const loading = ref(false)
const showChart = ref(false)
const showZeroAsEmpty = ref(false)
const statisticsData = ref<StatisticsData[]>([])
const chartData = ref<ChartDataPoint[]>([])
const allNames = ref<string[]>([]) // List of all company names for selection

// Date Selection State
const showDateDialog = ref(false)
const startDate = ref<Date>()
const endDate = ref<Date>()
const dateSelectionMode = ref<'month' | 'year' | 'custom'>('month')

// Options for Month/Year selects
const currentYear = new Date().getFullYear()
const years = Array.from({ length: currentYear - 2015 + 2 }, (_, i) => (2015 + i).toString()).reverse()
const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString())

const startYear = ref(currentYear.toString())
const startMonth = ref((new Date().getMonth() + 1).toString())
const endYear = ref(currentYear.toString())
const endMonth = ref((new Date().getMonth() + 1).toString())

// Date formatters for DatePicker
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

// Filter State
const selectedNames = ref<string[]>([])
const nameSearchQuery = ref('')
const nameOptions = ref<string[]>([]) // Options for the multiselect

// Details Dialog State
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const detailData = ref<CustomerDetailData[]>([])
const detailTitle = ref('')

// Computed
const formattedData = computed(() => {
  if (!showZeroAsEmpty.value) return statisticsData.value
  
  // Create a copy to avoid mutating original if needed, 
  // but for display we can just handle formatting in the template.
  return statisticsData.value
})

const summaryData = computed(() => {
  if (statisticsData.value.length === 0) return null
  
  const sum = {
    settledWDS: 0, notSettledWDS: 0, notNeedWDS: 0,
    settledWZT: 0, notSettledWZT: 0, notNeedWZT: 0, totalWeight: 0, totalPrice: 0,
    settledPDS: 0, notSettledPDS: 0,
    settledPZT: 0, notSettledPZT: 0
  }
  
  statisticsData.value.forEach(item => {
    sum.settledWDS += item.settledWDS
    sum.notSettledWDS += item.notSettledWDS
    sum.notNeedWDS += item.notNeedWDS
    sum.settledWZT += item.settledWZT
    sum.notSettledWZT += item.notSettledWZT
    sum.notNeedWZT += item.notNeedWZT
    sum.totalWeight += item.totalWeight
    sum.totalPrice += item.totalPrice
    sum.settledPDS += item.settledPDS
    sum.notSettledPDS += item.notSettledPDS
    sum.settledPZT += item.settledPZT
    sum.notSettledPZT += item.notSettledPZT
  })
  
  return sum
})

// Methods

function disableStartDate(date: Date) {
  if (endDate.value) {
    // Disable dates after the end date
    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (startDate.value) {
    // Disable dates before the start date
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

// Format number helper
function formatVal(val: number, isPrice = false) {
  if (showZeroAsEmpty.value && val === 0) return ''
  return val.toFixed(3)
}

function formatDateRange(start?: Date, end?: Date) {
  if (!start || !end) return ''
  const s = start.toLocaleDateString('zh-CN')
  // End date is exclusive in our logic (start of next day/month/year), 
  // so we subtract 1ms to get the inclusive end for display.
  const displayEnd = new Date(end.getTime() - 1)
  return `${s} 到 ${displayEnd.toLocaleDateString('zh-CN')}`
}

function getMonthsList(start: Date, end: Date) {
  const list = []
  const current = new Date(start)
  const last = new Date(end)
  
  // Reset to start of month to avoid issues
  current.setDate(1)
  
  while (current < last) {
    const y = current.getFullYear()
    const m = current.getMonth() + 1
    list.push(`${y}-${m.toString().padStart(2, '0')}`)
    current.setMonth(current.getMonth() + 1)
  }
  return list
}

async function loadCompanies() {
  try {
    const res = await getCompanies({ page: 1, limit: 1000 })
    if (res.ok) {
      nameOptions.value = res.data.map(c => c.name)
    }
  } catch (e) {
    console.error(e)
  }
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
  
      const params = {
        fDate1: startDate.value.toISOString(),
        fDate2: endDate.value.toISOString(),
        fName: selectedNames.value.length > 0 ? selectedNames.value : undefined,
        fMonths: getMonthsList(startDate.value, endDate.value)
      }    
    // Fetch Table Data
    const res = await getStatisticsData(params)
    if (res.ok) {
      statisticsData.value = res.stat_data
      if (res.stat_data.length === 0) {
        toast.info('没有找到数据，请选择其它日期')
      }
    } else {
      statisticsData.value = []
      toast.error('获取数据失败')
    }
  } catch (e) {
    console.error(e)
    toast.error('获取数据出错')
  } finally {
    loading.value = false
  }
}

function openDateDialog() {
  showDateDialog.value = true
}

function handleDateConfirm() {
  // Logic to set start and end date based on selection mode
  if (dateSelectionMode.value === 'month') {
    const s = new Date(parseInt(startYear.value), parseInt(startMonth.value) - 1, 1)
    const e = new Date(parseInt(endYear.value), parseInt(endMonth.value), 1) // Start of next month
    
    if (s >= e) {
      toast.error('开始月份不能晚于结束月份')
      return
    }
    
    startDate.value = s
    endDate.value = e
  } else if (dateSelectionMode.value === 'year') {
    const year = parseInt(startYear.value)
    
    const s = new Date(year, 0, 1)
    const e = new Date(year + 1, 0, 1)
    
    startDate.value = s
    endDate.value = e
  } else {
    // Custom mode: already set via DatePickers
    if (!startDate.value || !endDate.value) {
      toast.error('请选择日期范围')
      return
    }
  }
  
  showDateDialog.value = false
  fetchData()
}

// Detail Views
async function openAllDetails() {
  if (!startDate.value || !endDate.value) {
    toast.error('请先查询数据')
    return
  }
  
  detailTitle.value = '所有客户明细'
  showDetailDialog.value = true
  detailLoading.value = true
  
  try {
    const params = {
      fDate1: startDate.value.toISOString(),
      fDate2: endDate.value.toISOString(),
      fName: selectedNames.value.length > 0 ? selectedNames.value : undefined,
      fMonths: getMonthsList(startDate.value, endDate.value)
    }
    
    const res = await getCustomerDetail(params)
    if (res.ok) {
      detailData.value = res.detail_data
    } else {
      toast.error('获取明细失败')
    }
  } catch (e) {
    console.error(e)
  } finally {
    detailLoading.value = false
  }
}

async function openSingleDetail(name: string) {
    if (!startDate.value || !endDate.value) {
    toast.error('请先查询数据')
    return
  }

  detailTitle.value = `${name} - 明细`
  showDetailDialog.value = true
  detailLoading.value = true

  try {
     const params = {
      fDate1: startDate.value.toISOString(),
      fDate2: endDate.value.toISOString(),
      fName: [name],
      fMonths: getMonthsList(startDate.value, endDate.value)
    }

    const res = await getCustomerDetail(params)
    if (res.ok) {
      detailData.value = res.detail_data
    } else {
      toast.error('获取明细失败')
    }
  } catch(e) {
      console.error(e)
  } finally {
      detailLoading.value = false
  }
}

function handleExport() {
  // Export main table
  if (statisticsData.value.length === 0) return
  
  const data = statisticsData.value.map(item => ({
    '客户名称': item.name,
    '代收-结算-重量': item.settledWDS,
    '代收-结算-金额': item.settledPDS,
    '代收-未结算-重量': item.notSettledWDS,
    '代收-未结算-金额': item.notSettledPDS,
    '代收-不需要结算': item.notNeedWDS,
    '自提-结算-重量': item.settledWZT,
    '自提-结算-金额': item.settledPZT,
    '自提-未结算-重量': item.notSettledWZT,
    '自提-未结算-金额': item.notSettledPZT,
    '自提-不需要结算': item.notNeedWZT,
    '总重量': item.totalWeight,
    '总金额': item.totalPrice
  }))
  
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '客户营业额')
  XLSX.writeFile(wb, `客户营业额_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function handleDetailExport() {
    if (detailData.value.length === 0) return

    const data = detailData.value.map(item => ({
        '订单号': item.order,
        '提单号': item.bill_no,
        '开单名称': item.name,
        '车船号': item.veh_ves_name,
        '目的地': item.ship_to,
        '代收价格': item.coll_price,
        '客户价格': item.price,
        '价格': item.tot_price,
        '发运块数': item.send_num,
        '发运重量': item.send_weight,
        '发货日期': new Date(item.ship_date).toLocaleDateString(),
        '运单号': item.inv_no,
        '发货仓库': item.warehouse,
        '规格': item.spec,
        '牌号': item.brand_no,
        '合同号': item.contract_no
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '明细数据')
    XLSX.writeFile(wb, `明细数据_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Multi-select helpers
const filteredNameOptions = computed(() => {
  if (!nameSearchQuery.value) return nameOptions.value
  return nameOptions.value.filter(n => n.toLowerCase().includes(nameSearchQuery.value.toLowerCase()))
})

function toggleNameSelection(name: string) {
  if (selectedNames.value.includes(name)) {
    selectedNames.value = selectedNames.value.filter(n => n !== name)
  } else {
    selectedNames.value.push(name)
  }
}

// Load initial data
loadCompanies()

</script>

<template>
  <BasicPage title="客户营业额统计" description="查看客户营业额报表及图表">
    <!-- Toolbar -->
    <div class="flex flex-col gap-4 mb-6 p-4 border rounded-lg bg-muted/30">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <!-- Left Side: Filters -->
        <div class="flex flex-wrap items-center gap-4">
          <!-- Bill Name Multi-select -->
          <div class="flex items-center gap-2">
            <Label>开单名称</Label>
            <Popover>
              <PopoverTrigger as-child>
                <Button variant="outline" role="combobox" class="w-[240px] justify-between">
                  <span class="truncate">
                    {{ selectedNames.length > 0 ? `已选择 ${selectedNames.length} 项` : '所有客户' }}
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[240px] p-0">
                 <div class="flex items-center border-b px-3">
                    <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        v-model="nameSearchQuery"
                        class="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="搜索..."
                    />
                 </div>
                 <div class="max-h-[300px] overflow-y-auto p-1">
                    <div
                        v-for="name in filteredNameOptions"
                        :key="name"
                        class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        @click="toggleNameSelection(name)"
                    >
                        <Check
                            :class="['mr-2 h-4 w-4', selectedNames.includes(name) ? 'opacity-100' : 'opacity-0']"
                        />
                        {{ name }}
                    </div>
                 </div>
              </PopoverContent>
            </Popover>
          </div>

          <!-- Checkboxes -->
          <div class="flex items-center gap-2">
            <input
              id="show-chart"
              type="checkbox"
              v-model="showChart"
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <Label for="show-chart" class="cursor-pointer">显示图表</Label>
          </div>
          <div class="flex items-center gap-2">
            <input
              id="show-zero"
              type="checkbox"
              v-model="showZeroAsEmpty"
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <Label for="show-zero" class="cursor-pointer">显示0为空</Label>
          </div>
        </div>

        <!-- Right Side: Actions -->
        <div class="flex flex-wrap items-center gap-2">
            <Button variant="default" @click="openDateDialog">
                <Filter class="w-4 h-4 mr-2" />
                选择统计日期
            </Button>
            <Button variant="outline" @click="openAllDetails">
                <Search class="w-4 h-4 mr-2" />
                所有明细
            </Button>
            <Button variant="outline" @click="handleExport">
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
            :x="(d: StatisticsData) => d.name" 
            :y="[
              (d: StatisticsData) => d.totalWeight,
              (d: StatisticsData) => d.totalPrice
            ]"
            :color="(_d: StatisticsData, i: number) => [chartConfig.weight.color, chartConfig.price.color][i]"
          />
          <VisAxis
            type="x"
            :x="(d: StatisticsData) => d.name"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
          />
          <VisAxis
            type="y"
            :tick-line="false"
            :domain-line="false"
            :num-ticks="5"
          />
          <ChartTooltip />
          <ChartCrosshair
            :template="componentToString(chartConfig, ChartTooltipContent)"
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
            数据统计日期：{{ formatDateRange(startDate, endDate) }}
        </div>
        <div class="border rounded-md overflow-hidden">
            <Table class="border-collapse">
            <TableHeader class="bg-muted/50">
                <TableRow>
                    <TableHead rowspan="3" class="text-center border bg-orange-200 text-black font-bold w-[200px]">客户名称</TableHead>
                    <TableHead colspan="5" class="text-center border bg-blue-300 text-black">代收代付</TableHead>
                    <TableHead colspan="5" class="text-center border bg-indigo-300 text-black">客户自提</TableHead>
                    <TableHead rowspan="3" class="text-center border w-[100px]">总吨数</TableHead>
                    <TableHead rowspan="3" class="text-center border w-[100px]">总金额</TableHead>
                </TableRow>
                <TableRow>
                    <TableHead colspan="2" class="text-center border bg-blue-300 text-black">结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-blue-300 text-black">未结算</TableHead>
                    <TableHead rowspan="2" class="text-center border bg-blue-300 text-black">不需要结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-indigo-300 text-black">结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-indigo-300 text-black">未结算</TableHead>
                    <TableHead rowspan="2" class="text-center border bg-indigo-300 text-black">不需要结算</TableHead>
                </TableRow>
                <TableRow>
                    <TableHead class="text-center border bg-blue-300 text-black">重量</TableHead>
                    <TableHead class="text-center border bg-blue-300 text-black">金额</TableHead>
                    <TableHead class="text-center border bg-blue-300 text-black">重量</TableHead>
                    <TableHead class="text-center border bg-blue-300 text-black">金额</TableHead>
                    <TableHead class="text-center border bg-indigo-300 text-black">重量</TableHead>
                    <TableHead class="text-center border bg-indigo-300 text-black">金额</TableHead>
                    <TableHead class="text-center border bg-indigo-300 text-black">重量</TableHead>
                    <TableHead class="text-center border bg-indigo-300 text-black">金额</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="item in formattedData" :key="item.name" class="hover:bg-muted/50">
                    <TableCell class="font-medium border relative group cursor-pointer" @contextmenu.prevent="openSingleDetail(item.name)">
                         {{ item.name }}
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            class="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100"
                            title="查看明细"
                            @click.stop="openSingleDetail(item.name)"
                         >
                            <Search class="h-3 w-3" />
                         </Button>
                    </TableCell>
                    <TableCell class="text-right border">{{ formatVal(item.settledWDS) }}</TableCell>
                    <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.settledPDS, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(item.notSettledWDS) }}</TableCell>
                    <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.notSettledPDS, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(item.notNeedWDS) }}</TableCell>
                    
                    <TableCell class="text-right border">{{ formatVal(item.settledWZT) }}</TableCell>
                    <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.settledPZT, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(item.notSettledWZT) }}</TableCell>
                    <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.notSettledPZT, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(item.notNeedWZT) }}</TableCell>
                    
                    <TableCell class="text-right border font-bold">{{ formatVal(item.totalWeight) }}</TableCell>
                    <TableCell class="text-right border font-bold text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.totalPrice, true) }}</TableCell>
                </TableRow>
                
                <!-- Summary Row -->
                <TableRow v-if="summaryData" class="bg-muted font-bold">
                    <TableCell class="border text-center">总计</TableCell>
                    <TableCell class="text-right border">{{ formatVal(summaryData.settledWDS) }}</TableCell>
                    <TableCell class="text-right border"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.settledPDS, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(summaryData.notSettledWDS) }}</TableCell>
                    <TableCell class="text-right border"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.notSettledPDS, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(summaryData.notNeedWDS) }}</TableCell>
                    
                    <TableCell class="text-right border">{{ formatVal(summaryData.settledWZT) }}</TableCell>
                    <TableCell class="text-right border"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.settledPZT, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(summaryData.notSettledWZT) }}</TableCell>
                    <TableCell class="text-right border"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.notSettledPZT, true) }}</TableCell>
                    <TableCell class="text-right border">{{ formatVal(summaryData.notNeedWZT) }}</TableCell>
                    
                    <TableCell class="text-right border">{{ formatVal(summaryData.totalWeight) }}</TableCell>
                    <TableCell class="text-right border"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.totalPrice, true) }}</TableCell>
                </TableRow>
            </TableBody>
        </Table>
        </div>
    </div>
    
    <div v-else-if="!loading" class="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-muted/10 text-muted-foreground">
      <p>请选择日期范围并点击“选择统计日期”开始查询</p>
    </div>

    <!-- Date Selection Dialog -->
    <Dialog v-model:open="showDateDialog">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>选择统计日期</DialogTitle>
                <DialogDescription>
                    选择要统计的时间范围
                </DialogDescription>
            </DialogHeader>
            
            <div class="grid gap-4 py-4">
                <div class="flex items-center gap-4">
                     <Button 
                        :variant="dateSelectionMode === 'month' ? 'default' : 'outline'"
                        size="sm"
                        @click="dateSelectionMode = 'month'"
                     >
                        按月
                     </Button>
                     <Button 
                        :variant="dateSelectionMode === 'year' ? 'default' : 'outline'"
                        size="sm"
                        @click="dateSelectionMode = 'year'"
                     >
                        按年
                     </Button>
                     <Button 
                        :variant="dateSelectionMode === 'custom' ? 'default' : 'outline'"
                        size="sm"
                        @click="dateSelectionMode = 'custom'"
                     >
                        自定义
                     </Button>
                </div>
                
                <div v-if="dateSelectionMode === 'month'" class="space-y-4">
                    <div class="grid gap-2">
                        <Label>开始月份</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <Select v-model="startYear">
                                <SelectTrigger>
                                    <SelectValue placeholder="年份" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select v-model="startMonth">
                                <SelectTrigger>
                                    <SelectValue placeholder="月份" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="m in months" :key="m" :value="m">{{ m }}月</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div class="grid gap-2">
                        <Label>结束月份</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <Select v-model="endYear">
                                <SelectTrigger>
                                    <SelectValue placeholder="年份" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select v-model="endMonth">
                                <SelectTrigger>
                                    <SelectValue placeholder="月份" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="m in months" :key="m" :value="m">{{ m }}月</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                
                <div v-else-if="dateSelectionMode === 'year'" class="grid gap-2">
                    <Label>选择年份</Label>
                    <Select v-model="startYear">
                        <SelectTrigger>
                            <SelectValue placeholder="年份" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="y in years" :key="y" :value="y">{{ y }}年</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div v-else class="grid gap-4">
                    <div class="grid gap-2">
                        <Label>开始日期</Label>
                        <DatePicker v-model="formattedStartDate" :disabled-date="disableStartDate" disabled-hint="开始日期不能晚于结束日期" />
                    </div>
                    <div class="grid gap-2">
                        <Label>结束日期</Label>
                        <DatePicker v-model="formattedEndDate" :disabled-date="disableEndDate" disabled-hint="结束日期不能早于开始日期" />
                    </div>
                </div>
            </div>
            
            <DialogFooter>
                <Button @click="handleDateConfirm">确定</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Details Dialog -->
    <Dialog v-model:open="showDetailDialog">
        <DialogContent class="min-w-[90vw] h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>{{ detailTitle }}</DialogTitle>
            </DialogHeader>
            
            <div class="flex-1 overflow-auto border rounded-md">
                 <Table class="relative">
                    <TableHeader class="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead>订单号</TableHead>
                            <TableHead>提单号</TableHead>
                            <TableHead>开单名称</TableHead>
                            <TableHead>车船号</TableHead>
                            <TableHead>目的地</TableHead>
                            <TableHead>代收价格</TableHead>
                            <TableHead>客户价格</TableHead>
                            <TableHead>价格</TableHead>
                            <TableHead>发运块数</TableHead>
                            <TableHead>发运重量</TableHead>
                            <TableHead>发货日期</TableHead>
                            <TableHead>运单号</TableHead>
                            <TableHead>发货仓库</TableHead>
                            <TableHead>规格</TableHead>
                            <TableHead>牌号</TableHead>
                            <TableHead>合同号</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="(item, idx) in detailData" :key="idx">
                            <TableCell>{{ item.order }}</TableCell>
                            <TableCell>{{ item.bill_no }}</TableCell>
                            <TableCell>{{ item.name }}</TableCell>
                            <TableCell>{{ item.veh_ves_name }}</TableCell>
                            <TableCell>{{ item.ship_to }}</TableCell>
                            <TableCell>{{ item.coll_price }}</TableCell>
                            <TableCell>{{ item.price }}</TableCell>
                            <TableCell>{{ item.tot_price }}</TableCell>
                            <TableCell>{{ item.send_num }}</TableCell>
                            <TableCell>{{ item.send_weight }}</TableCell>
                            <TableCell>{{ new Date(item.ship_date).toLocaleDateString() }}</TableCell>
                            <TableCell>{{ item.inv_no }}</TableCell>
                            <TableCell>{{ item.warehouse }}</TableCell>
                            <TableCell>{{ item.spec }}</TableCell>
                            <TableCell>{{ item.brand_no }}</TableCell>
                            <TableCell>{{ item.contract_no }}</TableCell>
                        </TableRow>
                         <TableRow v-if="detailData.length === 0">
                            <TableCell colspan="16" class="text-center h-32">暂无数据</TableCell>
                        </TableRow>
                    </TableBody>
                 </Table>
            </div>
            
             <DialogFooter class="mt-4">
                <Button variant="outline" @click="handleDetailExport">
                     <Download class="w-4 h-4 mr-2" />
                     导出Excel
                </Button>
                <Button @click="showDetailDialog = false">关闭</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

  </BasicPage>
</template>

<style scoped>
.border {
    border-color: #e5e7eb;
}
</style>

<route lang="yaml">
meta:
  auth: true
</route>
