<script setup lang="ts">
// @ts-nocheck
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import ExcelJS from 'exceljs'
import { Download, Filter, Loader2, Search } from 'lucide-vue-next'
import { VisAxis, VisGroupedBar, VisXYContainer } from '@unovis/vue'

import ExportDialog from '@/components/export-dialog.vue'
import { useDevice } from '@/composables/use-device'
import { useExport } from '@/composables/use-export'
import VesselRevenueMobile from './components/VesselRevenueMobile.vue'
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
import { DatePicker, MonthPicker } from '@/components/ui/date-picker'
import { formatDate, formatNumber, toExcelNum } from '@/utils/format'
import {
  getVesselRevenue,
  getVesselDetail,
  type VesselRevenueData,
  type VesselDetailItem,
  type VesselSummaryItem
} from '@/services/api/vessel-statistics.api'
import { PAGE_SIZES } from '@/constants/pagination'

// 设备检测
const { isMobile } = useDevice()
const { exportWithPicker, exportWithBufferPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// State
const loading = ref(false)
const showChart = ref(false)
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

// MonthPicker 双向绑定
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
const detailExporting = ref(false)
const summaryItems = ref<Record<string, VesselSummaryItem>>({})
const detailRows = ref<VesselDetailItem[]>([])
const detailTitle = ref('')
const detailVehType = ref<'自有' | '外挂'>('外挂')
const detailVehMode = ref<'全部' | '车' | '船'>('全部')
const detailPage = ref(1)
const detailLimit = ref(50)
const detailTotal = ref(0)
const detailTotalPages = computed(() => Math.max(1, Math.ceil(detailTotal.value / detailLimit.value)))

const detailMonth = ref('全部')
const detailSendWeight = ref(0)
const detailReceivable = ref(0)
const detailPayable = ref(0)

// 可选月份列表（从已查询的 statisticsData 中提取）
const detailMonthOptions = computed(() => {
  return statisticsData.value.map(d => d.month)
})

// 根据选择的月份计算对应的财务月日期范围
function getMonthDateRange(month: string): { fDate1: string, fDate2: string } {
  if (month === '全部' || !startDate.value || !endDate.value) {
    return {
      fDate1: toLocalDateTimeString(startDate.value!),
      fDate2: toLocalDateTimeString(endDate.value!),
    }
  }
  const [y, m] = month.split('-').map(Number)
  // 财务月：上月26日 ~ 本月25日
  const s = m === 1
    ? new Date(y - 1, 11, 26, 0, 0, 0)
    : new Date(y, m - 2, 26, 0, 0, 0)
  const e = new Date(y, m - 1, 25, 23, 59, 59)
  return {
    fDate1: toLocalDateTimeString(s),
    fDate2: toLocalDateTimeString(e),
  }
}

// Chart Config - 固定显示金额
const chartConfig = {
  vsRevenue: { label: '船运金额', color: 'var(--chart-1)' },
  vhRevenue: { label: '车运金额', color: 'var(--chart-2)' },
} as ChartConfig

const chartAccessors = [
  (d: VesselRevenueData) => d.vsRevenue,
  (d: VesselRevenueData) => d.vhRevenue
]

const chartColors = [chartConfig.vsRevenue.color, chartConfig.vhRevenue.color]

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
// 根据发货日期计算所属财务月（上月26日~当月25日 → 当月）
function toFinancialMonth(date: Date): string {
  const d = new Date(date)
  let y = d.getFullYear()
  let m = d.getMonth() + 1
  if (d.getDate() >= 26) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return `${y}-${m.toString().padStart(2, '0')}`
}

function getMonthsList(start: Date, end: Date) {
  // 用财务月起止来生成月份列表
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
      fDate1: toLocalDateTimeString(startDate.value),
      fDate2: toLocalDateTimeString(endDate.value),
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
    const startY = parseInt(startYear.value)
    const startM = parseInt(startMonth.value)
    const endY = parseInt(endYear.value)
    const endM = parseInt(endMonth.value)

    // 财务月：上月26日 00:00:00 到本月25日 23:59:59
    const s = startM === 1
      ? new Date(startY - 1, 11, 26, 0, 0, 0)   // 1月→上月=上年12月
      : new Date(startY, startM - 2, 26, 0, 0, 0)
    const e = new Date(endY, endM - 1, 25, 23, 59, 59)

    if (s >= e) { toast.error('开始月份不能晚于结束月份'); return }
    startDate.value = s
    endDate.value = e
  } else if (dateSelectionMode.value === 'year') {
    const year = parseInt(startYear.value)

    // 财务年：上年12月26日 00:00:00 到本年12月25日 23:59:59
    startDate.value = new Date(year - 1, 11, 26, 0, 0, 0)
    endDate.value = new Date(year, 11, 25, 23, 59, 59)
  } else {
    if (!startDate.value || !endDate.value) { toast.error('请选择日期范围'); return }
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

function formatDateRange(start?: Date, end?: Date) {
  if (!start || !end) return ''
  const displayEnd = new Date(end.getTime() - 1)
  return `${start.toLocaleDateString('zh-CN')} 到 ${displayEnd.toLocaleDateString('zh-CN')}`
}

// 日期范围字符串（供移动端使用）
const dateRange = computed(() => formatDateRange(startDate.value, endDate.value))

// 格式化为本地时间字符串（与综合查询保持一致，避免时区偏差）
function toLocalDateTimeString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

// Drill-down Detail Handlers
async function openDrillDown(type: '自有' | '外挂', mode: 'summary' | 'detail') {
  if (!startDate.value || !endDate.value) { toast.error('请先查询数据'); return }
  
  detailTitle.value = `${type}车船费用${mode === 'summary' ? '统计' : '清单'}`
  detailVehType.value = type
  if (mode === 'detail') {
    detailVehMode.value = '全部'
    detailMonth.value = '全部'
    detailPage.value = 1
  }
  detailLoading.value = true
  if (mode === 'summary') showSummaryDialog.value = true
  else showDetailDialog.value = true

  try {
    const dateRange = getMonthDateRange(detailMonth.value)
    const res = await getVesselDetail({
      fDate1: dateRange.fDate1,
      fDate2: dateRange.fDate2,
      fVehType: type,
      fSummary: mode === 'summary' ? 'YES' : 'NO',
      fVehMode: mode === 'detail' && detailVehMode.value !== '全部' ? detailVehMode.value : undefined,
      page: mode === 'detail' ? detailPage.value : undefined,
      limit: mode === 'detail' ? detailLimit.value : undefined,
    })
    
    if (res.ok) {
      if (mode === 'summary') summaryItems.value = res.summary_data || {}
      else {
        detailRows.value = res.rows || []
        detailTotal.value = res.total || 0
        detailPage.value = res.page || detailPage.value
        detailLimit.value = res.limit || detailLimit.value
        detailSendWeight.value = res.totalSendWeight || 0
        detailReceivable.value = res.totalReceivable || 0
        detailPayable.value = res.totalPayable || 0
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

async function reloadDetailList() {
  if (!showDetailDialog.value || !startDate.value || !endDate.value) return

  detailLoading.value = true
  try {
    const dateRange = getMonthDateRange(detailMonth.value)
    const res = await getVesselDetail({
      fDate1: dateRange.fDate1,
      fDate2: dateRange.fDate2,
      fVehType: detailVehType.value,
      fSummary: 'NO',
      fVehMode: detailVehMode.value !== '全部' ? detailVehMode.value : undefined,
      page: detailPage.value,
      limit: detailLimit.value,
    })

    if (res.ok) {
      detailRows.value = res.rows || []
      detailTotal.value = res.total || 0
      detailPage.value = res.page || detailPage.value
      detailLimit.value = res.limit || detailLimit.value
      detailSendWeight.value = res.totalSendWeight || 0
      detailReceivable.value = res.totalReceivable || 0
      detailPayable.value = res.totalPayable || 0
    } else {
      toast.error('获取明细失败')
    }
  } catch (e) {
    console.error(e)
    toast.error('获取明细失败')
  } finally {
    detailLoading.value = false
  }
}

watch(detailVehMode, async (val, prev) => {
  if (val === prev || !showDetailDialog.value) return
  detailPage.value = 1
  await reloadDetailList()
})

watch(detailMonth, async (val, prev) => {
  if (val === prev || !showDetailDialog.value) return
  detailPage.value = 1
  await reloadDetailList()
})

watch(detailLimit, async (val, prev) => {
  if (val === prev || !showDetailDialog.value) return
  detailPage.value = 1
  await reloadDetailList()
})

async function handleDetailPageChange(nextPage: number) {
  if (nextPage < 1 || nextPage > detailTotalPages.value || nextPage === detailPage.value) return
  detailPage.value = nextPage
  await reloadDetailList()
}

function handleDetailPageSizeChange(value: string) {
  const nextLimit = Number(value)
  if (!Number.isFinite(nextLimit) || nextLimit <= 0) return
  detailLimit.value = nextLimit
}

async function fetchAllDetailRowsForExport() {
  if (!startDate.value || !endDate.value) return []

  const pageSize = 500
  let page = 1
  let total = 0
  const allRows: VesselDetailItem[] = []

  while (page === 1 || allRows.length < total) {
    const res = await getVesselDetail({
      fDate1: toLocalDateTimeString(startDate.value),
      fDate2: toLocalDateTimeString(endDate.value),
      fVehType: detailVehType.value,
      fSummary: 'NO',
      fVehMode: detailVehMode.value !== '全部' ? detailVehMode.value : undefined,
      page,
      limit: pageSize,
    })

    if (!res.ok) {
      throw new Error('获取导出数据失败')
    }

    const pageRows = res.rows || []
    total = res.total || 0
    allRows.push(...pageRows)

    if (pageRows.length === 0) break
    page += 1
  }

  return allRows
}

function handleExportSummaryDetail() {
  const rows = Object.entries(summaryItems.value).map(([vname, item]) => ({
    vname,
    weight: toExcelNum(item.weight),
    amount: toExcelNum(item.amount),
    contact: item.contact || '',
  }))

  if (rows.length === 0) {
    toast.error('没有可导出的数据')
    return
  }

  exportWithPicker({
    fileName: `${detailTitle.value || '车船费用统计'}_${new Date().toISOString().slice(0, 10)}`,
    sheetName: '车船费用统计',
    columns: [
      { header: '车船号', key: 'vname' },
      { header: '吨位', key: 'weight', type: 'number' },
      { header: '金额', key: 'amount', type: 'number' },
      { header: '车船联系人', key: 'contact' },
    ],
    data: rows,
  })
}

async function handleExportDetailList() {
  detailExporting.value = true
  try {
    const allDetailRows = await fetchAllDetailRowsForExport()
    const rows = allDetailRows.map(item => ({
      vname: item.vname || '',
      name: item.name || '',
      ship_from: item.ship_from || '',
      ship_to: item.ship_to || '',
      receivable_price: toExcelNum(item.receivable_price ?? 0),
      receivable_single_price: toExcelNum(item.receivable_single_price ?? 0),
      price: toExcelNum(item.price ?? 0),
      single_price: toExcelNum(item.single_price ?? 0),
      payable_price: toExcelNum(item.payable_price ?? 0),
      payable_single_price: toExcelNum(item.payable_single_price ?? 0),
      send_num: toExcelNum(item.send_num),
      send_weight: toExcelNum(item.send_weight),
      ship_date: formatDate(item.ship_date, ''),
      advance_charge: `${item.advance_mode || ''}: ${formatDateValue(item.advance_charge)}`,
      delay_day: toExcelNum(item.delay_day),
    }))

    if (rows.length === 0) {
      toast.error('没有可导出的数据')
      return
    }

    const columns = [
      { header: '车船号', key: 'vname' },
      { header: '客户名称/单位', key: 'name' },
      { header: '起始地', key: 'ship_from' },
      { header: '目的地', key: 'ship_to' },
      { header: '应收总价', key: 'receivable_price', type: 'number' as const, fill: 'FFDCFCE7' },
      { header: '应收单价', key: 'receivable_single_price', type: 'number' as const, fill: 'FFE0F2FE' },
      { header: '应付总价', key: 'payable_price', type: 'number' as const, fill: 'FFFFEDD5' },
      { header: '应付单价', key: 'payable_single_price', type: 'number' as const, fill: 'FFFFE4E6' },
      { header: '发运块数', key: 'send_num', type: 'number' as const },
      { header: '发运重量', key: 'send_weight', type: 'number' as const },
      { header: '发货日期', key: 'ship_date' },
      { header: '预付', key: 'advance_charge' },
      { header: '滞留天数', key: 'delay_day', type: 'number' as const },
    ]

    exportWithBufferPicker({
      fileName: `${detailTitle.value || '车船费用清单'}_${detailVehMode.value}_${new Date().toISOString().slice(0, 10)}`,
      generateBuffer: async () => {
        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet('车船费用清单')

        const thinBorder: Partial<ExcelJS.Borders> = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
        const headerFill: ExcelJS.Fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        }
        const getTextWidth = (value: any) => {
          const text = String(value ?? '')
          return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0)
        }
        const colWidths = columns.map(col => getTextWidth(col.header))

        const headerRow = sheet.addRow(columns.map(col => col.header))
        headerRow.height = 22
        headerRow.eachCell((cell, colNumber) => {
          const col = columns[colNumber - 1]
          cell.font = { bold: true, size: 11 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.border = thinBorder
          cell.fill = col.fill
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: col.fill } }
            : headerFill
          colWidths[colNumber - 1] = Math.max(colWidths[colNumber - 1], getTextWidth(cell.value))
        })

        rows.forEach((row) => {
          const excelRow = sheet.addRow(columns.map(col => row[col.key]))
          excelRow.eachCell((cell, colNumber) => {
            const col = columns[colNumber - 1]
            cell.border = thinBorder
            cell.alignment = {
              vertical: 'middle',
              horizontal: col.type === 'number' ? 'right' : 'left',
            }
            if (col.fill) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.fill } }
            }
            colWidths[colNumber - 1] = Math.max(colWidths[colNumber - 1], getTextWidth(cell.value))
          })
        })

        sheet.columns = colWidths.map(width => ({
          width: Math.max(10, width + 2),
        }))
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: columns.length },
        }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]

        return workbook.xlsx.writeBuffer()
      },
    })
  } catch (e) {
    console.error(e)
    toast.error('导出失败')
  } finally {
    detailExporting.value = false
  }
}

function formatDateValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '0'
  return String(value)
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

async function handleExport() {
  if (statisticsData.value.length === 0) {
    toast.error('没有可导出的数据')
    return
  }

  try {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('车船营业额')

    // Helper function to calculate text width (Chinese = 2, English = 1)
    function getTextWidth(text: any): number {
      const str = String(text || '')
      return [...str].reduce((sum, char) => {
        return sum + (char.charCodeAt(0) > 127 ? 2 : 1)
      }, 0)
    }

    // Track column widths
    const columnWidths = Array(16).fill(0)
    function updateWidth(colIndex: number, text: any) {
      const width = getTextWidth(text)
      if (width > columnWidths[colIndex]) {
        columnWidths[colIndex] = width
      }
    }

    // Define header structure
    // Row 1: 月份(2 cols, 2 rows) | 总营业额(2 cols) | 自有车船(4 cols) | 外挂车船(4 cols) | 固定成本(1 col, 2 rows) | 短驳应收(1 col, 2 rows) | 叉车应收(1 col, 2 rows) | 总利润(1 col, 2 rows)
    const row1 = sheet.getRow(1)
    row1.height = 24

    // 月份 (A1:B1, merged with A2:B2)
    sheet.mergeCells('A1:B2')
    const cellMonth = sheet.getCell('A1')
    cellMonth.value = '月份'
    cellMonth.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    cellMonth.font = { bold: true, size: 12 }
    cellMonth.alignment = { vertical: 'middle', horizontal: 'center' }
    cellMonth.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 总营业额 (C1:D1)
    sheet.mergeCells('C1:D1')
    const cellRevenue = sheet.getCell('C1')
    cellRevenue.value = '总营业额'
    cellRevenue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } } // orange-100
    cellRevenue.font = { bold: true, size: 12, color: { argb: 'FF000000' } }
    cellRevenue.alignment = { vertical: 'middle', horizontal: 'center' }
    cellRevenue.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 自有车船 (E1:H1)
    sheet.mergeCells('E1:H1')
    const cellOwn = sheet.getCell('E1')
    cellOwn.value = '自有车船'
    cellOwn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } } // blue-100
    cellOwn.font = { bold: true, size: 12, color: { argb: 'FF000000' } }
    cellOwn.alignment = { vertical: 'middle', horizontal: 'center' }
    cellOwn.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 外挂车船 (I1:L1)
    sheet.mergeCells('I1:L1')
    const cellNonOwn = sheet.getCell('I1')
    cellNonOwn.value = '外挂车船'
    cellNonOwn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } } // emerald-100
    cellNonOwn.font = { bold: true, size: 12, color: { argb: 'FF000000' } }
    cellNonOwn.alignment = { vertical: 'middle', horizontal: 'center' }
    cellNonOwn.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 固定成本 (M1:M2)
    sheet.mergeCells('M1:M2')
    const cellCost = sheet.getCell('M1')
    cellCost.value = '固定成本'
    cellCost.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } } // gray-50
    cellCost.font = { bold: true, size: 12 }
    cellCost.alignment = { vertical: 'middle', horizontal: 'center' }
    cellCost.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 短驳应收 (N1:N2)
    sheet.mergeCells('N1:N2')
    const cellDrayage = sheet.getCell('N1')
    cellDrayage.value = '短驳应收'
    cellDrayage.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    cellDrayage.font = { bold: true, size: 12 }
    cellDrayage.alignment = { vertical: 'middle', horizontal: 'center' }
    cellDrayage.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 叉车应收 (O1:O2)
    sheet.mergeCells('O1:O2')
    const cellForklift = sheet.getCell('O1')
    cellForklift.value = '叉车应收'
    cellForklift.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    cellForklift.font = { bold: true, size: 12 }
    cellForklift.alignment = { vertical: 'middle', horizontal: 'center' }
    cellForklift.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // 总利润 (P1:P2)
    sheet.mergeCells('P1:P2')
    const cellProfit = sheet.getCell('P1')
    cellProfit.value = '总利润'
    cellProfit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    cellProfit.font = { bold: true, size: 12 }
    cellProfit.alignment = { vertical: 'middle', horizontal: 'center' }
    cellProfit.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

    // Row 2 headers
    const row2 = sheet.getRow(2)
    row2.height = 20
    const row2Headers = [
      { col: 'C', text: '总吨位', bg: 'FFFED7AA' }, // orange-50
      { col: 'D', text: '总金额', bg: 'FFFED7AA' },
      { col: 'E', text: '吨位', bg: 'FFBFDBFE' }, // blue-50
      { col: 'F', text: '应收金额', bg: 'FFBFDBFE' },
      { col: 'G', text: '应付金额', bg: 'FFBFDBFE' },
      { col: 'H', text: '利润', bg: 'FFBFDBFE' },
      { col: 'I', text: '吨位', bg: 'FFA7F3D0' }, // emerald-50
      { col: 'J', text: '应收金额', bg: 'FFA7F3D0' },
      { col: 'K', text: '应付金额', bg: 'FFA7F3D0' },
      { col: 'L', text: '利润', bg: 'FFA7F3D0' }
    ]

    row2Headers.forEach(({ col, text, bg }) => {
      const cell = sheet.getCell(`${col}2`)
      cell.value = text
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.font = { size: 11 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      updateWidth(col.charCodeAt(0) - 65, text)
    })

    // Update widths for header text
    updateWidth(0, '2025-12')
    updateWidth(1, '船运/车运')

    // Add data rows (each month has 2 rows: 船运 and 车运)
    let currentRow = 3
    statisticsData.value.forEach(item => {
      // Vessel row
      const vesselRow = sheet.getRow(currentRow)
      vesselRow.height = 18

      // Month cell (merged for vessel and truck rows)
      sheet.mergeCells(`A${currentRow}:A${currentRow + 1}`)
      const monthCell = sheet.getCell(`A${currentRow}`)
      monthCell.value = item.month
      monthCell.font = { size: 11, bold: true }
      monthCell.alignment = { vertical: 'middle', horizontal: 'center' }
      monthCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      updateWidth(0, item.month)

      // Type cell (船运)
      const vesselTypeCell = sheet.getCell(`B${currentRow}`)
      vesselTypeCell.value = '船运'
      vesselTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } } // indigo-50/30
      vesselTypeCell.font = { size: 10, bold: true }
      vesselTypeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      vesselTypeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

      // Vessel data
      const vesselData = [
        item.vsTotal,
        item.vsRevenue,
        item.vsOwnWeight,
        item.vsOwnIncome,
        item.vsOwnDeposit,
        item.vsOwnProfit,
        item.vsNonOwnWeight,
        item.vsNonOwnIncome,
        item.vsNonOwnDeposit,
        item.vsProfit,
        item.vsFixedCost,
        '-',
        '-',
        item.vsOwnProfit + item.vsProfit - item.vsFixedCost
      ]

      vesselData.forEach((val, idx) => {
        const cell = sheet.getCell(currentRow, idx + 3) // columns C onwards
        cell.value = val === '-' ? val : Number(val.toFixed(3))
        cell.alignment = { vertical: 'middle', horizontal: val === '-' ? 'center' : 'right' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        cell.font = { size: 10 }
        updateWidth(idx + 2, cell.value)
      })

      currentRow++

      // Truck row
      const truckRow = sheet.getRow(currentRow)
      truckRow.height = 18

      // Type cell (车运)
      const truckTypeCell = sheet.getCell(`B${currentRow}`)
      truckTypeCell.value = '车运'
      truckTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } } // amber-50/30
      truckTypeCell.font = { size: 10, bold: true }
      truckTypeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      truckTypeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

      // Truck data
      const truckData = [
        item.vhTotal,
        item.vhRevenue,
        item.vhOwnWeight,
        item.vhOwnIncome,
        item.vhOwnDeposit,
        item.vhOwnProfit,
        item.vhNonOwnWeight,
        item.vhNonOwnIncome,
        item.vhNonOwnDeposit,
        item.vhProfit,
        item.vhFixedCost,
        item.drayage,
        item.forklift,
        item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift
      ]

      truckData.forEach((val, idx) => {
        const cell = sheet.getCell(currentRow, idx + 3)
        cell.value = Number(val.toFixed(3))
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        cell.font = { size: 10 }
        updateWidth(idx + 2, cell.value)
      })

      currentRow++
    })

    // Add summary rows if we have totals
    if (summaryTotals.value) {
      const totals = summaryTotals.value

      // Vessel total row
      const vsTotalRow = sheet.getRow(currentRow)
      vsTotalRow.height = 18

      // "总计" cell (merged for both summary rows)
      sheet.mergeCells(`A${currentRow}:A${currentRow + 1}`)
      const totalCell = sheet.getCell(`A${currentRow}`)
      totalCell.value = '总计'
      totalCell.font = { size: 11, bold: true }
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      totalCell.alignment = { vertical: 'middle', horizontal: 'center' }
      totalCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

      // Vessel summary type
      const vsSummaryTypeCell = sheet.getCell(`B${currentRow}`)
      vsSummaryTypeCell.value = '船运'
      vsSummaryTypeCell.font = { size: 10, bold: true }
      vsSummaryTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      vsSummaryTypeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      vsSummaryTypeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

      // Vessel summary data
      const vsSummaryData = [
        totals.vsTotal,
        totals.vsRevenue,
        totals.vsOwnWeight,
        totals.vsOwnIncome,
        totals.vsOwnDeposit,
        totals.vsOwnProfit,
        totals.vsNonOwnWeight,
        totals.vsNonOwnIncome,
        totals.vsNonOwnDeposit,
        totals.vsProfit,
        totals.vsFixedCost,
        '-',
        '-',
        totals.vsNetProfit
      ]

      vsSummaryData.forEach((val, idx) => {
        const cell = sheet.getCell(currentRow, idx + 3)
        cell.value = val === '-' ? val : Number(val.toFixed(3))
        cell.font = { size: 10, bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
        cell.alignment = { vertical: 'middle', horizontal: val === '-' ? 'center' : 'right' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        updateWidth(idx + 2, cell.value)
      })

      currentRow++

      // Truck summary row
      const vhTotalRow = sheet.getRow(currentRow)
      vhTotalRow.height = 18

      // Truck summary type
      const vhSummaryTypeCell = sheet.getCell(`B${currentRow}`)
      vhSummaryTypeCell.value = '车运'
      vhSummaryTypeCell.font = { size: 10, bold: true }
      vhSummaryTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      vhSummaryTypeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      vhSummaryTypeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

      // Truck summary data
      const vhSummaryData = [
        totals.vhTotal,
        totals.vhRevenue,
        totals.vhOwnWeight,
        totals.vhOwnIncome,
        totals.vhOwnDeposit,
        totals.vhOwnProfit,
        totals.vhNonOwnWeight,
        totals.vhNonOwnIncome,
        totals.vhNonOwnDeposit,
        totals.vhProfit,
        totals.vhFixedCost,
        totals.drayage,
        totals.forklift,
        totals.vhNetProfit
      ]

      vhSummaryData.forEach((val, idx) => {
        const cell = sheet.getCell(currentRow, idx + 3)
        cell.value = Number(val.toFixed(3))
        cell.font = { size: 10, bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        updateWidth(idx + 2, cell.value)
      })
    }

    // Apply auto-width to columns
    sheet.columns = columnWidths.map(width => ({
      width: Math.max(10, Math.min(width + 2, 50))
    }))

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `车船营业额_${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    URL.revokeObjectURL(url)

    toast.success('导出成功')
  } catch (error) {
    console.error('Export error:', error)
    toast.error('导出失败')
  }
}

</script>

<template>
  <!-- 移动端视图 -->
  <VesselRevenueMobile
    v-if="isMobile"
    :loading="loading"
    :statistics-data="statisticsData"
    :summary-totals="summaryTotals"
    :date-range="dateRange"
    @open-date-dialog="showDateDialog = true"
    @handle-export="handleExport"
    @open-drill-down="openDrillDown"
  />

  <!-- 桌面端视图 -->
  <BasicPage v-else title="车船营业额统计" description="查看车船运输营业额及利润统计">
    <!-- Toolbar -->
    <div class="mb-6 p-5 border-0 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <!-- Left Side: Date & Toggle -->
        <div class="flex flex-wrap items-center gap-4">
          <Button @click="showDateDialog = true" class="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md border-0">
            <Filter class="w-4 h-4 mr-2" />
            选择统计日期
          </Button>

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
        </div>

        <!-- Right Side: Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex gap-1 pr-2 mr-2 border-r border-gray-300 dark:border-gray-600">
            <Button variant="outline" size="sm" @click="openDrillDown('自有', 'summary')" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">自有统计</Button>
            <Button variant="outline" size="sm" @click="openDrillDown('自有', 'detail')" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">自有清单</Button>
          </div>
          <div class="flex gap-1 pr-2 mr-2 border-r border-gray-300 dark:border-gray-600">
            <Button variant="outline" size="sm" @click="openDrillDown('外挂', 'summary')" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">外挂统计</Button>
            <Button variant="outline" size="sm" @click="openDrillDown('外挂', 'detail')" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">外挂清单</Button>
          </div>
          <Button variant="outline" @click="handleExport" class="bg-white dark:bg-slate-900 shadow-sm border-0 hover:bg-gray-50">
            <Download class="w-4 h-4 mr-2" />
            导出数据
          </Button>
        </div>
      </div>
    </div>

    <!-- Chart Section -->
    <div v-if="showChart && statisticsData.length > 0" class="mb-8 p-6 border-0 rounded-xl bg-gradient-to-br from-slate-50 to-white dark:from-slate-950/50 dark:to-background shadow-md">
      <div class="flex items-center gap-3 mb-4">
        <div class="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" class="h-5 w-5">
            <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-lg">营业额趋势图</h3>
          <p class="text-sm text-muted-foreground">按月份统计船运与车运金额</p>
        </div>
      </div>
      <ChartContainer :config="chartConfig" class="aspect-auto h-[350px] w-full" :cursor="false">
        <VisXYContainer :data="statisticsData">
          <VisGroupedBar
            :x="(_d: VesselRevenueData, i: number) => i"
            :y="chartAccessors"
            :color="(_d: any, i: number) => chartColors[i]"
          />
          <VisAxis
            type="x"
            :x="(_d: VesselRevenueData, i: number) => i"
            :tick-format="(i: number) => statisticsData[i]?.month || ''"
            :tick-line="false"
            :domain-line="false"
          />
          <VisAxis type="y" :tick-line="false" :domain-line="false" :num-ticks="5" />
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
    <div v-else-if="statisticsData.length > 0" class="space-y-4">
      <div class="flex items-center gap-2 px-4 py-0 text-sm text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
        <span>统计区间：{{ formatDateRange(startDate, endDate) }}</span>
      </div>

      <div class="border-0 rounded-xl overflow-hidden shadow-md bg-white dark:bg-slate-900 overflow-x-auto">
        <Table id="stat-table" class="border-collapse min-w-[1200px]">
          <TableHeader>
            <TableRow class="border-b-2 border-gray-200">
              <TableHead colspan="2" rowspan="2" class="text-center border bg-gradient-to-br from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50 font-bold">月份</TableHead>
              <TableHead colspan="2" class="text-center border bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-800 dark:text-amber-300 font-semibold">总营业额</TableHead>
              <TableHead colspan="4" class="text-center border bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 text-blue-800 dark:text-blue-300 font-semibold">自有车船</TableHead>
              <TableHead colspan="4" class="text-center border bg-gradient-to-r from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 text-emerald-800 dark:text-emerald-300 font-semibold">外挂车船</TableHead>
              <TableHead rowspan="2" class="text-center border bg-gradient-to-br from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50 font-bold">固定成本</TableHead>
              <TableHead rowspan="2" class="text-center border bg-gradient-to-br from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50 font-bold">短驳应收</TableHead>
              <TableHead rowspan="2" class="text-center border bg-gradient-to-br from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50 font-bold">叉车应收</TableHead>
              <TableHead rowspan="2" class="text-center border bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 text-indigo-800 dark:text-indigo-300 font-bold">总利润</TableHead>
            </TableRow>
            <TableRow>
              <TableHead class="text-center border bg-amber-50 dark:bg-amber-900/20 text-xs font-medium">总吨位</TableHead>
              <TableHead class="text-center border bg-amber-50 dark:bg-amber-900/20 text-xs font-medium">总金额</TableHead>
              <TableHead class="text-center border bg-blue-50 dark:bg-blue-900/20 text-xs font-medium">吨位</TableHead>
              <TableHead class="text-center border bg-blue-50 dark:bg-blue-900/20 text-xs font-medium">应收金额</TableHead>
              <TableHead class="text-center border bg-blue-50 dark:bg-blue-900/20 text-xs font-medium">应付金额</TableHead>
              <TableHead class="text-center border bg-blue-50 dark:bg-blue-900/20 text-xs font-medium">利润</TableHead>
              <TableHead class="text-center border bg-emerald-50 dark:bg-emerald-900/20 text-xs font-medium">吨位</TableHead>
              <TableHead class="text-center border bg-emerald-50 dark:bg-emerald-900/20 text-xs font-medium">应收金额</TableHead>
              <TableHead class="text-center border bg-emerald-50 dark:bg-emerald-900/20 text-xs font-medium">应付金额</TableHead>
              <TableHead class="text-center border bg-emerald-50 dark:bg-emerald-900/20 text-xs font-medium">利润</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="item in statisticsData" :key="item.month">
              <!-- Vessel Row -->
              <TableRow class="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                <TableCell rowspan="2" class="text-center border font-medium align-middle bg-gray-50/50 dark:bg-gray-800/30">{{ item.month }}</TableCell>
                <TableCell class="text-center border bg-indigo-50/50 dark:bg-indigo-900/20 text-xs font-bold text-indigo-700 dark:text-indigo-400">船运</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vsTotal) }}</TableCell>
                <TableCell class="text-right border font-bold text-orange-600"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vsRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vsOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vsOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vsOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vsOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vsNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vsNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vsNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vsProfit) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vsFixedCost) }}</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border font-bold" :class="item.vsOwnProfit + item.vsProfit - item.vsFixedCost >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vsOwnProfit + item.vsProfit - item.vsFixedCost) }}
                </TableCell>
              </TableRow>
              <!-- Truck Row -->
              <TableRow class="hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors">
                <TableCell class="text-center border bg-amber-50/50 dark:bg-amber-900/20 text-xs font-bold text-amber-700 dark:text-amber-400">车运</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vhTotal) }}</TableCell>
                <TableCell class="text-right border font-bold text-orange-600"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vhRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vhOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vhOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vhOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vhOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(item.vhNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vhNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vhNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border font-bold"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vhProfit) }}</TableCell>
                <TableCell class="text-right border text-red-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.vhFixedCost) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.drayage) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNumber(item.forklift) }}</TableCell>
                <TableCell class="text-right border font-bold" :class="item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift) }}
                </TableCell>
              </TableRow>
            </template>

            <!-- Summary Total Row -->
            <template v-if="summaryTotals">
              <TableRow class="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800/50 dark:to-gray-800/50 font-bold">
                <TableCell rowspan="2" class="text-center border align-middle">
                  <span class="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm">总计</span>
                </TableCell>
                <TableCell class="text-center border text-xs text-indigo-700 dark:text-indigo-400">船运</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vsTotal) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vsOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vsNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsProfit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsFixedCost) }}</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border">-</TableCell>
                <TableCell class="text-right border" :class="summaryTotals.vsNetProfit >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vsNetProfit) }}
                </TableCell>
              </TableRow>
              <TableRow class="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800/50 dark:to-gray-800/50 font-bold">
                <TableCell class="text-center border text-xs text-amber-700 dark:text-amber-400">车运</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vhTotal) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhRevenue) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vhOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhOwnProfit) }}</TableCell>
                <TableCell class="text-right border">{{ formatNumber(summaryTotals.vhNonOwnWeight) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhNonOwnIncome) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhNonOwnDeposit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhProfit) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhFixedCost) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.drayage) }}</TableCell>
                <TableCell class="text-right border"><span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.forklift) }}</TableCell>
                <TableCell class="text-right border" :class="summaryTotals.vhNetProfit >= 0 ? 'text-red-600' : 'text-green-600'">
                  <span class="text-xs mr-0.5 font-normal">¥</span>{{ formatNumber(summaryTotals.vhNetProfit) }}
                </TableCell>
              </TableRow>
            </template>
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
                <DialogDescription>选择要统计的时间范围</DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
                <div class="flex items-center justify-center gap-2 p-1 bg-muted/50 rounded-lg">
                     <Button :variant="dateSelectionMode === 'month' ? 'default' : 'ghost'" size="sm" class="flex-1" :class="dateSelectionMode === 'month' ? 'shadow-sm' : ''" @click="dateSelectionMode = 'month'">按月</Button>
                     <Button :variant="dateSelectionMode === 'year' ? 'default' : 'ghost'" size="sm" class="flex-1" :class="dateSelectionMode === 'year' ? 'shadow-sm' : ''" @click="dateSelectionMode = 'year'">按年</Button>
                     <Button :variant="dateSelectionMode === 'custom' ? 'default' : 'ghost'" size="sm" class="flex-1" :class="dateSelectionMode === 'custom' ? 'shadow-sm' : ''" @click="dateSelectionMode = 'custom'">自定义</Button>
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
      <DialogContent class="min-w-[60vw] flex flex-col max-h-[80vh] border-0 shadow-xl">
        <DialogHeader>
          <DialogTitle>{{ detailTitle }}</DialogTitle>
          <DialogDescription>车船费用汇总统计</DialogDescription>
        </DialogHeader>
        <div class="flex-1 overflow-auto border rounded-md bg-white dark:bg-slate-900">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow><TableHead>车船号</TableHead><TableHead>吨位</TableHead><TableHead>金额</TableHead><TableHead>车船联系人</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, vname) in summaryItems" :key="vname">
                <TableCell>{{ vname }}</TableCell>
                <TableCell>{{ formatNumber(item.weight) }}</TableCell>
                <TableCell>{{ formatNumber(item.amount) }}</TableCell>
                <TableCell>{{ item.contact }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <DialogFooter class="mt-2">
          <Button variant="outline" @click="handleExportSummaryDetail" :disabled="Object.keys(summaryItems).length === 0" class="shadow-sm">
            <Download class="w-4 h-4 mr-2" />
            导出Excel
          </Button>
          <Button @click="showSummaryDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Detailed List Dialog -->
    <Dialog v-model:open="showDetailDialog">
      <DialogContent class="min-w-[90vw] flex flex-col h-[90vh] border-0 shadow-xl">
        <DialogHeader>
          <DialogTitle>{{ detailTitle }}</DialogTitle>
          <DialogDescription>车船费用明细清单</DialogDescription>
        </DialogHeader>
        <div class="flex items-center gap-3 flex-wrap">
          <Label class="shrink-0">月份</Label>
          <Select v-model="detailMonth">
            <SelectTrigger class="w-[140px]">
              <SelectValue placeholder="全部月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="全部">全部月份</SelectItem>
              <SelectItem v-for="m in detailMonthOptions" :key="m" :value="m">{{ m }}</SelectItem>
            </SelectContent>
          </Select>
          <Label class="shrink-0">类型</Label>
          <Select v-model="detailVehMode">
            <SelectTrigger class="w-[140px]">
              <SelectValue placeholder="全部车船" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="全部">全部车船</SelectItem>
              <SelectItem value="车">仅车</SelectItem>
              <SelectItem value="船">仅船</SelectItem>
            </SelectContent>
          </Select>
          <template v-if="detailTotal > 0">
            <span class="ml-auto" />
            <span class="text-muted-foreground text-xs">{{ detailTotal }}条</span>
            <span class="text-muted-foreground text-xs">吨位: <strong>{{ formatNumber(detailSendWeight) }}</strong></span>
            <span class="text-green-700 dark:text-green-400 text-xs">应收: <strong>¥{{ formatNumber(detailReceivable) }}</strong></span>
            <span class="text-orange-700 dark:text-orange-400 text-xs">应付: <strong>¥{{ formatNumber(detailPayable) }}</strong></span>
            <span class="text-xs" :class="detailReceivable - detailPayable >= 0 ? 'text-blue-600' : 'text-red-600'">利润: <strong>¥{{ formatNumber(detailReceivable - detailPayable) }}</strong></span>
          </template>
        </div>
        <div class="flex-1 overflow-auto border rounded-md bg-white dark:bg-slate-900 relative">
          <!-- 导出遮罩 -->
          <div v-if="detailExporting" class="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div class="flex flex-col items-center gap-3">
              <Loader2 class="h-8 w-8 animate-spin text-primary" />
              <span class="text-sm text-muted-foreground">正在导出数据，请稍候...</span>
            </div>
          </div>
          <div v-if="detailLoading" class="flex h-full min-h-[240px] items-center justify-center">
            <div class="flex items-center gap-2 text-muted-foreground">
              <Loader2 class="h-4 w-4 animate-spin" />
              <span>正在加载数据...</span>
            </div>
          </div>
          <div v-else-if="detailRows.length === 0" class="flex h-full min-h-[240px] items-center justify-center text-muted-foreground">
            没有明细数据
          </div>
          <Table v-else>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>车船号</TableHead><TableHead>客户名称/单位</TableHead><TableHead>起始地</TableHead><TableHead>目的地</TableHead>
                <TableHead class="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">应收总价</TableHead>
                <TableHead class="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">应收单价</TableHead>
                <TableHead class="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">应付总价</TableHead>
                <TableHead class="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">应付单价</TableHead>
                <TableHead>发运块数</TableHead><TableHead>发运重量</TableHead>
                <TableHead>发货日期</TableHead><TableHead>预付</TableHead><TableHead>滞留天数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, idx) in detailRows" :key="`${item.vname}-${idx}-${item.ship_date}`">
                  <TableCell>{{ item.vname }}</TableCell><TableCell>{{ item.name }}</TableCell><TableCell>{{ item.ship_from }}</TableCell><TableCell>{{ item.ship_to }}</TableCell>
                  <TableCell class="text-green-700 dark:text-green-400">{{ formatNumber(item.receivable_price ?? 0) }}</TableCell>
                  <TableCell class="text-green-700 dark:text-green-400">{{ formatNumber(item.receivable_single_price ?? 0) }}</TableCell>
                  <TableCell class="text-orange-700 dark:text-orange-400">{{ formatNumber(item.payable_price ?? 0) }}</TableCell>
                  <TableCell class="text-orange-700 dark:text-orange-400">{{ formatNumber(item.payable_single_price ?? 0) }}</TableCell>
                  <TableCell>{{ item.send_num }}</TableCell><TableCell>{{ formatNumber(item.send_weight) }}</TableCell>
                  <TableCell>{{ new Date(item.ship_date).toLocaleDateString() }}</TableCell>
                  <TableCell>{{ item.advance_mode }}: {{ formatNumber(item.advance_charge) }}</TableCell><TableCell>{{ item.delay_day }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-if="detailTotal > 0" class="flex items-center justify-between gap-3 border rounded-md px-4 py-3 text-sm">
          <div class="text-muted-foreground">
            共 {{ detailTotal }} 条 | 第 {{ detailPage }} 页 / 共 {{ detailTotalPages }} 页
          </div>
          <div class="flex items-center gap-3">
            <Select :model-value="String(detailLimit)" @update:model-value="handleDetailPageSizeChange">
              <SelectTrigger class="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="pageSize in PAGE_SIZES.filter(size => size >= 20)" :key="pageSize" :value="String(pageSize)">
                  {{ pageSize }}条/页
                </SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" :disabled="detailPage <= 1 || detailLoading" @click="handleDetailPageChange(1)">首页</Button>
            <Button variant="outline" size="sm" :disabled="detailPage <= 1 || detailLoading" @click="handleDetailPageChange(detailPage - 1)">上一页</Button>
            <Button variant="outline" size="sm" :disabled="detailPage >= detailTotalPages || detailLoading" @click="handleDetailPageChange(detailPage + 1)">下一页</Button>
            <Button variant="outline" size="sm" :disabled="detailPage >= detailTotalPages || detailLoading" @click="handleDetailPageChange(detailTotalPages)">末页</Button>
          </div>
        </div>
        <DialogFooter class="mt-2">
          <Button variant="outline" @click="handleExportDetailList" :disabled="detailLoading || detailExporting || detailTotal === 0" class="shadow-sm">
            <Download class="w-4 h-4 mr-2" />
            {{ detailExporting ? '导出中...' : '导出Excel' }}
          </Button>
          <Button @click="showDetailDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />
</template>

<style scoped>
.border { border-color: #e5e7eb; }
</style>

<route lang="yaml">
meta:
  auth: true
</route>
