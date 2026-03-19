<script setup lang="ts">
// @ts-nocheck
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import ExcelJS from 'exceljs'
import { Check, ChevronsUpDown, Download, Filter, Search, X } from 'lucide-vue-next'
import { VisAxis, VisGroupedBar, VisXYContainer } from '@unovis/vue'
import { GroupedBar } from '@unovis/ts'

import { useDevice } from '@/composables/use-device'
import CustomerRevenueMobile from './components/CustomerRevenueMobile.vue'
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
import { DatePicker, MonthPicker } from '@/components/ui/date-picker'
import { getCompanies } from '@/services/api/data-dict.api'
import {
  getStatisticsData,
  getCustomerDetail,
  getCustomerChartData,
  type StatisticsData,
  type CustomerDetailData,
  type ChartDataPoint
} from '@/services/api/statistics.api'

// 设备检测
const { isMobile } = useDevice()

const chartConfig = {
  daishouPrice: {
    label: '代收金额 (元)',
    color: 'var(--chart-1)',
  },
  zitiPrice: {
    label: '自提金额 (元)',
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

// MonthPicker 双向绑定：YYYY-MM ↔ startYear/startMonth, endYear/endMonth
const startYearMonth = computed({
  get: () => `${startYear.value}-${startMonth.value.padStart(2, '0')}`,
  set: (val: string) => {
    const [y, m] = val.split('-')
    startYear.value = y
    startMonth.value = String(parseInt(m))
  },
})

const endYearMonth = computed({
  get: () => `${endYear.value}-${endMonth.value.padStart(2, '0')}`,
  set: (val: string) => {
    const [y, m] = val.split('-')
    endYear.value = y
    endMonth.value = String(parseInt(m))
  },
})

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

// Pagination State
const detailCurrentPage = ref(1)
const detailPageSize = ref('50')

// Watch page size change to reset page
watch(detailPageSize, () => {
  detailCurrentPage.value = 1
})

// Export dialog state
const showExportSelectDialog = ref(false)
const exportCustomerSearch = ref('')
const exportSelectedCustomers = ref<string[]>([])

// Computed: unique customers in detail data
const detailCustomerNames = computed(() => {
  const names = new Set<string>()
  detailData.value.forEach(item => names.add(item.name))
  return Array.from(names).sort((a, b) => a.localeCompare(b))
})

// Filtered export customer options
const filteredExportCustomers = computed(() => {
  if (!exportCustomerSearch.value) return detailCustomerNames.value
  return detailCustomerNames.value.filter(n =>
    n.toLowerCase().includes(exportCustomerSearch.value.toLowerCase())
  )
})

// Paginated detail data
const paginatedDetailData = computed(() => {
  const pageSize = parseInt(detailPageSize.value)
  const start = (detailCurrentPage.value - 1) * pageSize
  const end = start + pageSize
  return detailData.value.slice(start, end)
})

const detailTotalPages = computed(() => {
  const pageSize = parseInt(detailPageSize.value)
  return Math.ceil(detailData.value.length / pageSize) || 1
})

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

// 日期范围字符串（供移动端使用）
const dateRange = computed(() => formatDateRange(startDate.value, endDate.value))

// 根据发货日期计算所属财务月（上月26日~当月25日 → 当月）
function toFinancialMonth(date: Date): string {
  const d = new Date(date)
  if (d.getDate() >= 26) {
    d.setMonth(d.getMonth() + 1)
  }
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${m.toString().padStart(2, '0')}`
}

function getMonthsList(start: Date, end: Date) {
  const startFm = toFinancialMonth(start)
  const endFm = toFinancialMonth(end)
  const [sy, sm] = startFm.split('-').map(Number)
  const [ey, em] = endFm.split('-').map(Number)

  const list: string[] = []
  let cy = sy, cm = sm
  while (cy < ey || (cy === ey && cm <= em)) {
    list.push(`${cy}-${cm.toString().padStart(2, '0')}`)
    cm++
    if (cm > 12) { cm = 1; cy++ }
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

    // Fetch Table Data and Chart Data in parallel
    const [tableRes, chartRes] = await Promise.all([
      getStatisticsData(params),
      getCustomerChartData(params)
    ])

    if (tableRes.ok) {
      statisticsData.value = tableRes.stat_data
      if (tableRes.stat_data.length === 0) {
        toast.info('没有找到数据，请选择其它日期')
      }
    } else {
      statisticsData.value = []
      toast.error('获取数据失败')
    }

    if (chartRes.ok) {
      chartData.value = chartRes.chart_data
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
    const startY = parseInt(startYear.value)
    const startM = parseInt(startMonth.value)
    const endY = parseInt(endYear.value)
    const endM = parseInt(endMonth.value)

    // 财务月：上月26日 00:00:00 到本月25日 23:59:59
    const s = startM === 1
      ? new Date(startY - 1, 11, 26, 0, 0, 0)   // 1月→上月=上年12月
      : new Date(startY, startM - 2, 26, 0, 0, 0)
    const e = new Date(endY, endM - 1, 25, 23, 59, 59)

    if (s >= e) {
      toast.error('开始月份不能晚于结束月份')
      return
    }

    startDate.value = s
    endDate.value = e
  } else if (dateSelectionMode.value === 'year') {
    const year = parseInt(startYear.value)

    // 财务年：上年12月26日 00:00:00 到本年12月25日 23:59:59
    startDate.value = new Date(year - 1, 11, 26, 0, 0, 0)
    endDate.value = new Date(year, 11, 25, 23, 59, 59)
  } else {
    // Custom mode: already set via DatePickers
    if (!startDate.value || !endDate.value) {
      toast.error('请选择日期范围')
      return
    }
  }

  // 统一截止到当前财务月（不显示未来月份）
  const nowFm = toFinancialMonth(new Date())
  const [fmY, fmM] = nowFm.split('-').map(Number)
  const maxEnd = new Date(fmY, fmM - 1, 25, 23, 59, 59)
  if (endDate.value! > maxEnd) {
    endDate.value = maxEnd
  }

  if (startDate.value! > endDate.value!) { toast.error('所选区间超出当前财务月，无可用数据'); return }

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
  detailCurrentPage.value = 1

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
  detailCurrentPage.value = 1

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
  } catch (e) {
    console.error(e)
  } finally {
    detailLoading.value = false
  }
}

async function handleExport() {
  if (statisticsData.value.length === 0) return

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('客户营业额')

  // 样式定义
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }

  const orangeFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } }
  const blueFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF93C5FD' } }
  const indigoFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5B4FC' } }
  const grayFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

  // 列宽跟踪
  const columnWidths: number[] = Array(13).fill(0)
  const getTextWidth = (text: any): number => {
    const str = String(text || '')
    return [...str].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0)
  }
  const updateWidth = (col: number, text: any) => {
    columnWidths[col] = Math.max(columnWidths[col], getTextWidth(text))
  }

  let rowNum = 1

  // 标题行
  sheet.mergeCells(rowNum, 1, rowNum, 13)
  const titleCell = sheet.getCell(rowNum, 1)
  const titleText = `数据统计日期：${formatDateRange(startDate.value, endDate.value)}`
  titleCell.value = titleText
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(rowNum).height = 25
  rowNum++

  // 表头第一行
  const h1 = sheet.getRow(rowNum)
  sheet.mergeCells(rowNum, 1, rowNum + 2, 1)
  h1.getCell(1).value = '客户名称'
  h1.getCell(1).fill = orangeFill
  h1.getCell(1).font = { bold: true, color: { argb: 'FF000000' } }
  h1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  h1.getCell(1).border = thinBorder
  updateWidth(0, '客户名称')

  // 代收代付: 列2-5 (4列，不包含"不需要结算")
  sheet.mergeCells(rowNum, 2, rowNum, 5)
  h1.getCell(2).value = '代收代付'
  h1.getCell(2).fill = blueFill
  h1.getCell(2).font = { bold: true, color: { argb: 'FF000000' } }
  h1.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 2; c <= 5; c++) h1.getCell(c).border = thinBorder

  // 客户自提: 列6-11 (6列，包含"不需要结算"的重量和金额)
  sheet.mergeCells(rowNum, 6, rowNum, 11)
  h1.getCell(6).value = '客户自提'
  h1.getCell(6).fill = indigoFill
  h1.getCell(6).font = { bold: true, color: { argb: 'FF000000' } }
  h1.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 6; c <= 11; c++) h1.getCell(c).border = thinBorder

  sheet.mergeCells(rowNum, 12, rowNum + 2, 12)
  h1.getCell(12).value = '总吨数'
  h1.getCell(12).fill = grayFill
  h1.getCell(12).font = { bold: true }
  h1.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' }
  h1.getCell(12).border = thinBorder
  updateWidth(11, '总吨数')

  sheet.mergeCells(rowNum, 13, rowNum + 2, 13)
  h1.getCell(13).value = '总金额'
  h1.getCell(13).fill = grayFill
  h1.getCell(13).font = { bold: true }
  h1.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' }
  h1.getCell(13).border = thinBorder
  updateWidth(12, '总金额')
  rowNum++

  // 表头第二行
  const h2 = sheet.getRow(rowNum)

  // 代收代付部分
  sheet.mergeCells(rowNum, 2, rowNum, 3)
  h2.getCell(2).value = '结算'
  h2.getCell(2).fill = blueFill
  h2.getCell(2).font = { bold: true, color: { argb: 'FF000000' } }
  h2.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
  h2.getCell(2).border = thinBorder
  h2.getCell(3).border = thinBorder

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  h2.getCell(4).value = '未结算'
  h2.getCell(4).fill = blueFill
  h2.getCell(4).font = { bold: true, color: { argb: 'FF000000' } }
  h2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
  h2.getCell(4).border = thinBorder
  h2.getCell(5).border = thinBorder

  // 客户自提部分
  sheet.mergeCells(rowNum, 6, rowNum, 7)
  h2.getCell(6).value = '结算'
  h2.getCell(6).fill = indigoFill
  h2.getCell(6).font = { bold: true, color: { argb: 'FF000000' } }
  h2.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }
  h2.getCell(6).border = thinBorder
  h2.getCell(7).border = thinBorder

  sheet.mergeCells(rowNum, 8, rowNum, 9)
  h2.getCell(8).value = '未结算'
  h2.getCell(8).fill = indigoFill
  h2.getCell(8).font = { bold: true, color: { argb: 'FF000000' } }
  h2.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }
  h2.getCell(8).border = thinBorder
  h2.getCell(9).border = thinBorder

  sheet.mergeCells(rowNum, 10, rowNum, 11)
  h2.getCell(10).value = '不需要结算'
  h2.getCell(10).fill = indigoFill
  h2.getCell(10).font = { bold: true, color: { argb: 'FF000000' } }
  h2.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' }
  h2.getCell(10).border = thinBorder
  h2.getCell(11).border = thinBorder
  updateWidth(9, '不需要结算')
  updateWidth(10, '不需要结算')
  rowNum++

  // 表头第三行
  const h3 = sheet.getRow(rowNum)
  const subHeaders = ['重量', '金额', '重量', '金额', '重量', '金额', '重量', '金额', '重量', '金额']
  const fills = [blueFill, blueFill, blueFill, blueFill, indigoFill, indigoFill, indigoFill, indigoFill, indigoFill, indigoFill]

  subHeaders.forEach((header, idx) => {
    const cell = h3.getCell(idx + 2)
    cell.value = header
    cell.fill = fills[idx]
    cell.font = { bold: true, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
    updateWidth(idx + 1, header)
  })
  rowNum++

  // 数据行
  statisticsData.value.forEach((item) => {
    const row = sheet.getRow(rowNum)
    const values = [
      item.name,
      // 代收代付: 结算-重量, 结算-金额, 未结算-重量, 未结算-金额 (不包含"不需要结算")
      item.settledWDS, item.settledPDS,
      item.notSettledWDS, item.notSettledPDS,
      // 客户自提: 结算-重量, 结算-金额, 未结算-重量, 未结算-金额, 不需要结算-重量, 不需要结算-金额
      item.settledWZT, item.settledPZT,
      item.notSettledWZT, item.notSettledPZT,
      item.notNeedWZT, 0, // 不需要结算的重量和金额(金额为0)
      // 总计
      item.totalWeight,
      item.totalPrice
    ]

    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1)
      cell.value = val
      cell.border = thinBorder
      if (idx > 0) {
        cell.alignment = { horizontal: 'right' }
      }
      updateWidth(idx, val)
    })
    rowNum++
  })

  // 汇总行
  if (summaryData.value) {
    const sumRow = sheet.getRow(rowNum)
    const sumVals = [
      '总计',
      // 代收代付: 结算-重量, 结算-金额, 未结算-重量, 未结算-金额
      summaryData.value.settledWDS, summaryData.value.settledPDS,
      summaryData.value.notSettledWDS, summaryData.value.notSettledPDS,
      // 客户自提: 结算-重量, 结算-金额, 未结算-重量, 未结算-金额, 不需要结算-重量, 不需要结算-金额
      summaryData.value.settledWZT, summaryData.value.settledPZT,
      summaryData.value.notSettledWZT, summaryData.value.notSettledPZT,
      summaryData.value.notNeedWZT, 0, // 不需要结算的重量和金额
      // 总计
      summaryData.value.totalWeight,
      summaryData.value.totalPrice
    ]

    sumVals.forEach((val, idx) => {
      const cell = sumRow.getCell(idx + 1)
      cell.value = val
      cell.border = thinBorder
      cell.fill = grayFill
      cell.font = { bold: true }
      if (idx > 0) {
        cell.alignment = { horizontal: 'right' }
      }
      updateWidth(idx, val)
    })
  }

  // 应用列宽
  sheet.columns = columnWidths.map(width => ({ width: Math.max(10, Math.min(width + 2, 50)) }))

  // 导出
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `客户营业额_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  }
  catch (error: any) {
    console.error('Export error:', error)
    toast.error('导出失败', { description: error.message })
  }
}

// 打开导出选择对话框
function openExportSelectDialog() {
  if (detailData.value.length === 0) {
    toast.error('没有数据可导出')
    return
  }
  exportSelectedCustomers.value = []
  exportCustomerSearch.value = ''
  showExportSelectDialog.value = true
}

// 确认导出
async function confirmDetailExport() {
  if (exportSelectedCustomers.value.length === 0) {
    toast.error('请选择要导出的客户')
    return
  }

  const filteredData = detailData.value.filter(item =>
    exportSelectedCustomers.value.includes(item.name)
  )

  const headers = ['订单号', '提单号', '开单名称', '车船号', '目的地', '代收价格', '客户价格', '价格', '发运块数', '发运重量', '发货日期', '运单号', '发货仓库', '规格', '牌号', '合同号']

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('明细数据')

  sheet.addRow(headers)
  sheet.getRow(1).font = { bold: true }

  filteredData.forEach(item => {
    sheet.addRow([
      item.order, item.bill_no, item.name, item.veh_ves_name, item.ship_to,
      item.coll_price, item.price, item.tot_price, item.send_num, item.send_weight,
      item.ship_date ? new Date(item.ship_date).toLocaleDateString() : '',
      item.inv_no, item.warehouse, item.spec, item.brand_no, item.contract_no,
    ])
  })

  // 自动列宽
  sheet.columns.forEach((col, i) => {
    let maxLen = headers[i].length * 2
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value || '').length
      if (len > maxLen) maxLen = len
    })
    col.width = Math.min(maxLen + 2, 40)
  })

  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `明细数据_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    showExportSelectDialog.value = false
    toast.success(`已导出 ${filteredData.length} 条数据`)
  } catch (error: any) {
    console.error('Export error:', error)
    toast.error('导出失败', { description: error.message })
  }
}

function toggleExportCustomer(name: string) {
  if (exportSelectedCustomers.value.includes(name)) {
    exportSelectedCustomers.value = exportSelectedCustomers.value.filter(n => n !== name)
  } else {
    exportSelectedCustomers.value.push(name)
  }
}

function selectAllExportCustomers() {
  exportSelectedCustomers.value = [...detailCustomerNames.value]
}

function clearExportCustomers() {
  exportSelectedCustomers.value = []
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
  <!-- 移动端视图 -->
  <CustomerRevenueMobile
    v-if="isMobile"
    :loading="loading"
    :statistics-data="statisticsData"
    :summary-data="summaryData"
    :date-range="dateRange"
    @open-date-dialog="openDateDialog"
    @open-all-details="openAllDetails"
    @handle-export="handleExport"
    @open-single-detail="openSingleDetail"
  />

  <!-- 桌面端视图 -->
  <BasicPage v-else title="客户营业额统计" description="查看客户营业额报表及图表">
    <!-- Toolbar -->
    <div class="mb-6 p-5 border-0 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <!-- Left Side: Filters -->
        <div class="flex flex-wrap items-center gap-4">
          <!-- Bill Name Multi-select -->
          <div class="flex items-center gap-2">
            <Label class="text-sm font-medium text-muted-foreground">开单名称</Label>
            <Popover>
              <PopoverTrigger as-child>
                <Button variant="outline" role="combobox" class="w-[240px] justify-between bg-white dark:bg-slate-900 shadow-sm border-0">
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
          <div class="flex items-center gap-4 ml-2">
            <label class="flex items-center gap-2 cursor-pointer group">
              <div class="relative">
                <input
                  type="checkbox"
                  v-model="showChart"
                  class="peer sr-only"
                />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </div>
              <span class="text-sm text-muted-foreground group-hover:text-foreground transition-colors">显示图表</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer group">
              <div class="relative">
                <input
                  type="checkbox"
                  v-model="showZeroAsEmpty"
                  class="peer sr-only"
                />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </div>
              <span class="text-sm text-muted-foreground group-hover:text-foreground transition-colors">显示0为空</span>
            </label>
          </div>
        </div>

        <!-- Right Side: Actions -->
        <div class="flex flex-wrap items-center gap-2">
            <Button @click="openDateDialog" class="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md border-0">
                <Filter class="w-4 h-4 mr-2" />
                选择统计日期
            </Button>
            <Button variant="outline" @click="openAllDetails" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">
                <Search class="w-4 h-4 mr-2" />
                所有明细
            </Button>
            <Button variant="outline" @click="handleExport" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">
                <Download class="w-4 h-4 mr-2" />
                导出数据
            </Button>
        </div>
      </div>
    </div>

    <!-- Chart Section -->
    <div v-if="showChart && chartData.length > 0" class="mb-8 p-6 border-0 rounded-xl bg-gradient-to-br from-slate-50 to-white dark:from-slate-950/50 dark:to-background shadow-md">
      <div class="flex items-center gap-3 mb-4">
        <div class="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" class="h-5 w-5">
            <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-lg">营业额趋势图</h3>
          <p class="text-sm text-muted-foreground">按月份统计代收代付与客户自提金额</p>
        </div>
      </div>
      <ChartContainer :config="chartConfig" class="aspect-auto h-[350px] w-full" :cursor="false">
        <VisXYContainer :data="chartData">
          <VisGroupedBar
            :x="(_d: ChartDataPoint, i: number) => i"
            :y="[
              (d: ChartDataPoint) => Number(d.daishouPrice) || 0,
              (d: ChartDataPoint) => Number(d.zitiPrice) || 0
            ]"
            :color="(_d: ChartDataPoint, i: number) => [chartConfig.daishouPrice.color, chartConfig.zitiPrice.color][i]"
          />
          <VisAxis
            type="x"
            :x="(_d: ChartDataPoint, i: number) => i"
            :tick-format="(i: number) => chartData[i]?.month || ''"
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

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center p-24 border-0 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-950/50 dark:to-background shadow-sm">
        <div class="relative">
          <div class="h-16 w-16 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6 text-blue-500">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </div>
        </div>
        <p class="text-lg font-medium text-muted-foreground mt-6">正在查询数据，请稍等...</p>
        <p class="text-sm text-muted-foreground/70 mt-1">数据加载中</p>
    </div>

    <!-- Table Section -->
    <div v-else-if="statisticsData.length > 0" class="space-y-6">
        <div class="flex items-center gap-2 px-4 py-0 text-sm text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
          </svg>
          <span>统计区间：{{ formatDateRange(startDate, endDate) }}</span>
        </div>
        <div class="border-0 rounded-xl overflow-hidden shadow-md bg-white dark:bg-slate-900">
            <Table class="border-collapse">
            <TableHeader>
                <TableRow class="border-b-2 border-gray-200">
                    <TableHead rowspan="3" class="text-center border bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-800 dark:text-amber-300 font-bold w-[200px]">客户名称</TableHead>
                    <TableHead colspan="5" class="text-center border bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 text-blue-800 dark:text-blue-300 font-semibold">代收代付</TableHead>
                    <TableHead colspan="5" class="text-center border bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 text-indigo-800 dark:text-indigo-300 font-semibold">客户自提</TableHead>
                    <TableHead rowspan="3" class="text-center border bg-gradient-to-br from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50 font-bold w-[100px]">总吨数</TableHead>
                    <TableHead rowspan="3" class="text-center border bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 text-emerald-800 dark:text-emerald-300 font-bold w-[100px]">总金额</TableHead>
                </TableRow>
                <TableRow>
                    <TableHead colspan="2" class="text-center border bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">未结算</TableHead>
                    <TableHead rowspan="2" class="text-center border bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">不需要结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">结算</TableHead>
                    <TableHead colspan="2" class="text-center border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">未结算</TableHead>
                    <TableHead rowspan="2" class="text-center border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">不需要结算</TableHead>
                </TableRow>
                <TableRow>
                    <TableHead class="text-center border bg-blue-50/50 dark:bg-blue-900/10 text-xs font-medium">重量</TableHead>
                    <TableHead class="text-center border bg-blue-50/50 dark:bg-blue-900/10 text-xs font-medium">金额</TableHead>
                    <TableHead class="text-center border bg-blue-50/50 dark:bg-blue-900/10 text-xs font-medium">重量</TableHead>
                    <TableHead class="text-center border bg-blue-50/50 dark:bg-blue-900/10 text-xs font-medium">金额</TableHead>
                    <TableHead class="text-center border bg-indigo-50/50 dark:bg-indigo-900/10 text-xs font-medium">重量</TableHead>
                    <TableHead class="text-center border bg-indigo-50/50 dark:bg-indigo-900/10 text-xs font-medium">金额</TableHead>
                    <TableHead class="text-center border bg-indigo-50/50 dark:bg-indigo-900/10 text-xs font-medium">重量</TableHead>
                    <TableHead class="text-center border bg-indigo-50/50 dark:bg-indigo-900/10 text-xs font-medium">金额</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="item in formattedData" :key="item.name" class="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                    <TableCell class="font-medium border relative group cursor-pointer bg-amber-50/30 dark:bg-amber-900/10" @contextmenu.prevent="openSingleDetail(item.name)">
                         {{ item.name }}
                         <Button
                            variant="ghost"
                            size="icon"
                            class="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 bg-white dark:bg-slate-800 shadow-sm"
                            title="查看明细"
                            @click.stop="openSingleDetail(item.name)"
                         >
                            <Search class="h-3 w-3" />
                         </Button>
                    </TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(item.settledWDS) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-blue-600 dark:text-blue-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.settledPDS, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(item.notSettledWDS) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-blue-600 dark:text-blue-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.notSettledPDS, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-muted-foreground">{{ formatVal(item.notNeedWDS) }}</TableCell>

                    <TableCell class="text-right border tabular-nums">{{ formatVal(item.settledWZT) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-indigo-600 dark:text-indigo-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.settledPZT, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(item.notSettledWZT) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-indigo-600 dark:text-indigo-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.notSettledPZT, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-muted-foreground">{{ formatVal(item.notNeedWZT) }}</TableCell>

                    <TableCell class="text-right border font-semibold tabular-nums bg-gray-50/50 dark:bg-gray-800/30">{{ formatVal(item.totalWeight) }}</TableCell>
                    <TableCell class="text-right border font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10"><span class="text-xs mr-0.5">¥</span>{{ formatVal(item.totalPrice, true) }}</TableCell>
                </TableRow>

                <!-- Summary Row -->
                <TableRow v-if="summaryData" class="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800/50 dark:to-gray-800/50 font-bold">
                    <TableCell class="border text-center">
                      <span class="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm">总计</span>
                    </TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.settledWDS) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-blue-600 dark:text-blue-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.settledPDS, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.notSettledWDS) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-blue-600 dark:text-blue-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.notSettledPDS, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.notNeedWDS) }}</TableCell>

                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.settledWZT) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-indigo-600 dark:text-indigo-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.settledPZT, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.notSettledWZT) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-indigo-600 dark:text-indigo-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.notSettledPZT, true) }}</TableCell>
                    <TableCell class="text-right border tabular-nums">{{ formatVal(summaryData.notNeedWZT) }}</TableCell>

                    <TableCell class="text-right border tabular-nums text-lg">{{ formatVal(summaryData.totalWeight) }}</TableCell>
                    <TableCell class="text-right border tabular-nums text-lg text-emerald-600 dark:text-emerald-400"><span class="text-xs mr-0.5">¥</span>{{ formatVal(summaryData.totalPrice, true) }}</TableCell>
                </TableRow>
            </TableBody>
        </Table>
        </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading" class="flex flex-col items-center justify-center p-16 border-0 rounded-xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/50 dark:to-slate-950/50 shadow-sm">
      <div class="h-20 w-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-10 w-10 text-blue-500">
          <path d="M21 21l-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21h4.8"/><path d="M21 7.8V3h-4.8"/><path d="M3 7.8V3h4.8"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <p class="text-lg font-medium text-muted-foreground mb-2">暂无统计数据</p>
      <p class="text-sm text-muted-foreground/70">请选择日期范围并点击"选择统计日期"开始查询</p>
    </div>
  </BasicPage>

  <!-- 对话框（移动端和桌面端共用） -->
  <!-- Date Selection Dialog -->
    <Dialog v-model:open="showDateDialog">
        <DialogContent class="sm:max-w-[450px] border-0 shadow-xl">
            <DialogHeader class="pb-4 border-b">
                <DialogTitle class="flex items-center gap-2 text-xl">
                  <div class="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" class="h-4 w-4">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
                    </svg>
                  </div>
                  选择统计日期
                </DialogTitle>
                <DialogDescription>
                    选择要统计的时间范围
                </DialogDescription>
            </DialogHeader>

            <div class="grid gap-4 py-4">
                <div class="flex items-center justify-center gap-2 p-1 bg-muted/50 rounded-lg">
                     <Button
                        :variant="dateSelectionMode === 'month' ? 'default' : 'ghost'"
                        size="sm"
                        class="flex-1"
                        :class="dateSelectionMode === 'month' ? 'shadow-sm' : ''"
                        @click="dateSelectionMode = 'month'"
                     >
                        按月
                     </Button>
                     <Button
                        :variant="dateSelectionMode === 'year' ? 'default' : 'ghost'"
                        size="sm"
                        class="flex-1"
                        :class="dateSelectionMode === 'year' ? 'shadow-sm' : ''"
                        @click="dateSelectionMode = 'year'"
                     >
                        按年
                     </Button>
                     <Button
                        :variant="dateSelectionMode === 'custom' ? 'default' : 'ghost'"
                        size="sm"
                        class="flex-1"
                        :class="dateSelectionMode === 'custom' ? 'shadow-sm' : ''"
                        @click="dateSelectionMode = 'custom'"
                     >
                        自定义
                     </Button>
                </div>
                
                <div v-if="dateSelectionMode === 'month'" class="space-y-4">
                    <div class="grid gap-2">
                        <Label>开始月份</Label>
                        <MonthPicker v-model="startYearMonth" placeholder="选择开始月份" />
                    </div>
                    <div class="grid gap-2">
                        <Label>结束月份</Label>
                        <MonthPicker v-model="endYearMonth" placeholder="选择结束月份" />
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
                <DialogDescription v-if="detailData.length > 0">
                  共 {{ detailData.length }} 条数据，当前显示第 {{ (detailCurrentPage - 1) * parseInt(detailPageSize) + 1 }} - {{ Math.min(detailCurrentPage * parseInt(detailPageSize), detailData.length) }} 条
                </DialogDescription>
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
                        <TableRow v-for="(item, idx) in paginatedDetailData" :key="idx">
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

            <!-- Pagination -->
            <div v-if="detailTotalPages > 1" class="flex items-center justify-center gap-2 py-2">
              <Button variant="outline" size="sm" :disabled="detailCurrentPage <= 1" @click="detailCurrentPage--">上一页</Button>
              <span class="text-sm text-muted-foreground">第 {{ detailCurrentPage }} / {{ detailTotalPages }} 页</span>
              <Button variant="outline" size="sm" :disabled="detailCurrentPage >= detailTotalPages" @click="detailCurrentPage++">下一页</Button>
              <Select v-model="detailPageSize" class="w-24">
                <SelectTrigger class="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50条/页</SelectItem>
                  <SelectItem value="100">100条/页</SelectItem>
                  <SelectItem value="200">200条/页</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter class="mt-2">
                <Button variant="outline" @click="openExportSelectDialog">
                     <Download class="w-4 h-4 mr-2" />
                     导出Excel
                </Button>
                <Button @click="showDetailDialog = false">关闭</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Export Customer Selection Dialog -->
    <Dialog v-model:open="showExportSelectDialog">
      <DialogContent class="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>选择导出客户</DialogTitle>
          <DialogDescription>
            选择要导出的客户，将导出所选客户在当前时间区间内的所有明细数据
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <!-- Search -->
          <div class="flex items-center border rounded-md px-3">
            <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              v-model="exportCustomerSearch"
              class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="搜索客户..."
            />
          </div>

          <!-- Select All / Clear -->
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="selectAllExportCustomers">全选 ({{ detailCustomerNames.length }})</Button>
            <Button variant="outline" size="sm" @click="clearExportCustomers">清空</Button>
            <span class="ml-auto text-sm text-muted-foreground self-center">已选 {{ exportSelectedCustomers.length }} 个</span>
          </div>

          <!-- Customer List -->
          <div class="border rounded-md max-h-[300px] overflow-y-auto">
            <div
              v-for="name in filteredExportCustomers"
              :key="name"
              class="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
              @click="toggleExportCustomer(name)"
            >
              <Check :class="['mr-2 h-4 w-4', exportSelectedCustomers.includes(name) ? 'opacity-100' : 'opacity-0']" />
              {{ name }}
            </div>
            <div v-if="filteredExportCustomers.length === 0" class="px-3 py-4 text-center text-muted-foreground">
              没有找到匹配的客户
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showExportSelectDialog = false">取消</Button>
          <Button @click="confirmDetailExport" :disabled="exportSelectedCustomers.length === 0">
            <Download class="w-4 h-4 mr-2" />
            确认导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
