<script lang="ts" setup>
import { ref, onMounted, watch, computed } from 'vue'
import { toast } from 'vue-sonner'
import { useAuthStore } from '@/stores/auth'
import { isAdmin, hasPermission, PERMISSIONS } from '@/constants/permissions'
import { Calendar, Download, RefreshCw, Loader2 } from 'lucide-vue-next'
import ExcelJS from 'exceljs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { getDashboardStatistics, getDashboardInvoiceDetails, getDashboardBillingNamesStats, type DashboardStats, type VehicleData, type InvoiceDetail, type BillingNameStats } from '@/services/api/statistics.api'
import ExportDialog from '@/components/export-dialog.vue'

import OverviewChart from './overview-chart.vue'
import TopList from './top-list.vue'
import AllVehiclesTable from './all-vehicles-table.vue'

const authStore = useAuthStore()
const canDrillDown = computed(() =>
  isAdmin(authStore.user?.privilege ?? []) || authStore.isOwner
)
const canSeeSettle = computed(() => {
  const priv = authStore.user?.privilege ?? []
  return hasPermission(priv, PERMISSIONS.CUST_SETTLE) || hasPermission(priv, PERMISSIONS.VESSEL_SETTLE)
})

const now = new Date()
const currentYear = now.getFullYear()
// Generate years from 2015 to current year
const years = Array.from({ length: currentYear - 2015 + 1 }, (_, i) => (currentYear - i).toString())

const startDate = ref(`${currentYear}-01`)
const endDate = ref(`${currentYear}-12`)

// Computed year derived from endDate, or a dedicated ref if needed
const selectedYear = ref(currentYear.toString())

const loading = ref(false)
const hasLoaded = ref(false)
const initialLoading = computed(() => loading.value && !hasLoaded.value)
const stats = ref<DashboardStats>({
  totalTonnage: 0,
  truckToShipUnsettledTonnage: 0,
  customerUnsettledTonnage: 0,
  collectionUnsettledTonnage: 0,
  totalSettledTonnage: 0,
  totalInvoiceTonnage: 0,
  totalPaymentTonnage: 0,
  billingNameCount: 0,
  monthlyTrend: [],
  top10BillingNames: [],
  top5Vehicles: [],
  allVehicles: [],
  ownVehicleCount: 0,
  ownVehicleTonnage: 0,
  outsourcedVehicleCount: 0,
  outsourcedVehicleTonnage: 0,
  truckTonnage: 0,
  vesselTonnage: 0
})

async function loadData() {
  if (startDate.value > endDate.value) {
    toast.error('开始月份不能晚于结束月份')
    return
  }

  loading.value = true
  try {
    const res = await getDashboardStatistics(startDate.value, endDate.value)
    if (res.ok) {
      stats.value = res.data
    } else {
      toast.error('获取统计数据失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('获取统计数据出错')
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

// Update date range when year selector changes
watch(selectedYear, (newYear) => {
  startDate.value = `${newYear}-01`
  endDate.value = `${newYear}-12`
})

watch([startDate, endDate], () => {
  loadData()
})

onMounted(() => {
  loadData()
})

// 车辆下钻对话框状态
const showVehicleDrillDownDialog = ref(false)
const vehicleDrillDownTitle = ref('')
const vehicleDrillDownData = ref<VehicleData[]>([])
const vehicleCategoryFilter = ref<'all' | '自有' | '外挂'>('all')
const showTruckDestColumns = ref(false)
const vehicleDrillDownMonth = ref('all')
const vehicleDrillDownType = ref<'own' | 'outsourced' | 'truck' | 'vessel'>('truck')
const vehicleMonthlyCache = ref(new Map<string, VehicleData[]>())
const vehicleMonthLoading = ref(false)
const vehicleExportLoading = ref(false)

// 从 startDate~endDate 生成月份列表（不超过当前月份）
const vehicleMonthOptions = computed(() => {
  const months: { label: string; value: string }[] = [{ label: '全部', value: 'all' }]
  const [startY, startM] = startDate.value.split('-').map(Number)
  const [endY, endM] = endDate.value.split('-').map(Number)
  const today = new Date()
  const curY = today.getFullYear()
  const curM = today.getMonth() + 1
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    // 跳过未来月份
    if (y > curY || (y === curY && m > curM)) break
    const val = `${y}-${String(m).padStart(2, '0')}`
    months.push({ label: val, value: val })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
})

function resolveDrillDownRange(month: string) {
  if (month === 'all') {
    return { start: startDate.value, end: endDate.value }
  }
  return { start: month, end: month }
}

const vehicleTypeFilter: Record<string, (v: VehicleData) => boolean> = {
  own: (v) => v.veh_category === '自有',
  outsourced: (v) => v.veh_category === '外挂',
  truck: (v) => v.veh_type === '车',
  vessel: (v) => v.veh_type === '船'
}

// 按月获取车辆数据
async function loadVehicleMonthData(month: string) {
  if (month === 'all') {
    vehicleDrillDownData.value = stats.value.allVehicles.filter(vehicleTypeFilter[vehicleDrillDownType.value])
    return
  }

  const cacheKey = `${month}_${vehicleDrillDownType.value}`
  if (vehicleMonthlyCache.value.has(cacheKey)) {
    vehicleDrillDownData.value = vehicleMonthlyCache.value.get(cacheKey)!
    return
  }

  vehicleMonthLoading.value = true
  try {
    const res = await getDashboardStatistics(month, month)
    if (res.ok) {
      const filtered = res.data.allVehicles.filter(vehicleTypeFilter[vehicleDrillDownType.value])
      vehicleMonthlyCache.value.set(cacheKey, filtered)
      vehicleDrillDownData.value = filtered
    } else {
      toast.error('获取月度数据失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('获取月度数据出错')
  } finally {
    vehicleMonthLoading.value = false
  }
}

// 刷新当前月数据
async function refreshVehicleMonth() {
  const month = vehicleDrillDownMonth.value
  if (month === 'all') {
    await loadData()
    vehicleDrillDownData.value = stats.value.allVehicles.filter(vehicleTypeFilter[vehicleDrillDownType.value])
    return
  }
  const cacheKey = `${month}_${vehicleDrillDownType.value}`
  vehicleMonthlyCache.value.delete(cacheKey)
  await loadVehicleMonthData(month)
}

// 监听月份切换
watch(vehicleDrillDownMonth, (month) => {
  loadVehicleMonthData(month)
})

const filteredVehicleDrillDownData = computed(() => {
  if (vehicleCategoryFilter.value === 'all') return vehicleDrillDownData.value
  return vehicleDrillDownData.value.filter(v => v.veh_category === vehicleCategoryFilter.value)
})

const vehicleDrillDownTotalPrice = computed(() => {
  return filteredVehicleDrillDownData.value.reduce((sum, v) => sum + (v.total_price || 0), 0)
})

const vehicleDrillDownTotalTonnage = computed(() => {
  return filteredVehicleDrillDownData.value.reduce((sum, v) => sum + v.value, 0)
})

// 运单明细下钻对话框状态
const showInvoiceDialog = ref(false)
const invoiceData = ref<InvoiceDetail[]>([])
const invoiceLoading = ref(false)
const invoiceDrillDownMonth = ref('all')

// 开单名称下钻对话框状态
const showBillingNameDialog = ref(false)
const billingNameData = ref<BillingNameStats[]>([])
const billingNameLoading = ref(false)
const billingNameDrillDownMonth = ref('all')

// 导出对话框状态
const showExportDialog = ref(false)
const exportFileName = ref('')
const exportType = ref<'vehicle' | 'billingName' | 'invoice'>('vehicle')

// 车辆下钻函数
function drillDownVehicle(type: 'own' | 'outsourced' | 'truck' | 'vessel') {
  const titles = {
    own: '自有车辆明细',
    outsourced: '外挂车辆明细',
    truck: '车运明细',
    vessel: '船运明细'
  }

  vehicleDrillDownTitle.value = titles[type]
  vehicleDrillDownType.value = type
  vehicleDrillDownMonth.value = 'all'
  vehicleMonthlyCache.value.clear()
  vehicleDrillDownData.value = stats.value.allVehicles.filter(vehicleTypeFilter[type])
  vehicleCategoryFilter.value = (type === 'own') ? '自有' : (type === 'outsourced') ? '外挂' : 'all'
  showTruckDestColumns.value = type !== 'vessel'
  exportType.value = 'vehicle'
  showVehicleDrillDownDialog.value = true
}

// 运单明细下钻函数
async function drillDownInvoices() {
  invoiceDrillDownMonth.value = 'all'
  showInvoiceDialog.value = true
  exportType.value = 'invoice'
  await loadInvoiceDetails()
}

async function loadInvoiceDetails() {
  invoiceLoading.value = true
  try {
    const { start, end } = resolveDrillDownRange(invoiceDrillDownMonth.value)
    const res = await getDashboardInvoiceDetails(start, end)
    if (res.ok) {
      invoiceData.value = res.data
    } else {
      toast.error('获取运单明细失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('获取运单明细出错')
  } finally {
    invoiceLoading.value = false
  }
}

// 开单名称下钻函数
async function drillDownBillingNames() {
  billingNameDrillDownMonth.value = 'all'
  showBillingNameDialog.value = true
  exportType.value = 'billingName'
  await loadBillingNameDetails()
}

async function loadBillingNameDetails() {
  billingNameLoading.value = true
  try {
    const { start, end } = resolveDrillDownRange(billingNameDrillDownMonth.value)
    const res = await getDashboardBillingNamesStats(start, end)
    if (res.ok) {
      billingNameData.value = res.data
    } else {
      toast.error('获取开单名称统计失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('获取开单名称统计出错')
  } finally {
    billingNameLoading.value = false
  }
}

watch(invoiceDrillDownMonth, () => {
  if (!showInvoiceDialog.value) return
  loadInvoiceDetails()
})

watch(billingNameDrillDownMonth, () => {
  if (!showBillingNameDialog.value) return
  loadBillingNameDetails()
})

// 导出函数
function openExport() {
  if (exportType.value === 'vehicle') {
    const typeMap: Record<string, string> = {
      '自有车辆明细': '自有车辆',
      '外挂车辆明细': '外挂车辆',
      '车运明细': '车运',
      '船运明细': '船运'
    }
    const baseName = typeMap[vehicleDrillDownTitle.value] || '车辆'
    exportFileName.value = `${baseName}_${new Date().toISOString().slice(0, 10)}`
  } else if (exportType.value === 'invoice') {
    exportFileName.value = `运单明细_${new Date().toISOString().slice(0, 10)}`
  } else if (exportType.value === 'billingName') {
    exportFileName.value = `开单名称统计_${new Date().toISOString().slice(0, 10)}`
  }
  showExportDialog.value = true
}

// 填充车辆sheet的列、表头和数据
function fillVehicleSheet(sheet: ExcelJS.Worksheet, data: VehicleData[], showDest: boolean) {
  const baseColumns: Partial<ExcelJS.Column>[] = [
    { header: '车船号', key: 'name', width: 20 },
    { header: '配发吨数', key: 'value', width: 15 },
  ]
  if (showDest) {
    baseColumns.push({ header: '到船吨数', key: 'to_ship', width: 15 })
    baseColumns.push({ header: '到客户吨数', key: 'to_customer', width: 15 })
  }
  baseColumns.push({ header: '总价格', key: 'total_price', width: 15 })
  baseColumns.push({ header: '车船类型', key: 'veh_type_info', width: 15 })
  sheet.columns = baseColumns

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  }

  data.forEach(item => {
    const row: Record<string, unknown> = {
      name: item.name,
      value: item.value,
      total_price: item.total_price || 0,
      veh_type_info: [item.veh_type, item.veh_category].filter(Boolean).join(' / ') || '-',
    }
    if (showDest) {
      row.to_ship = item.to_ship || 0
      row.to_customer = item.to_customer || 0
    }
    sheet.addRow(row)
  })
}

async function handleExport(fileName: string, directoryHandle: FileSystemDirectoryHandle | null) {
  try {
    const workbook = new ExcelJS.Workbook()

    if (exportType.value === 'vehicle') {
      vehicleExportLoading.value = true

      // 总计sheet
      const totalSheet = workbook.addWorksheet('总计')
      fillVehicleSheet(totalSheet, filteredVehicleDrillDownData.value, showTruckDestColumns.value)

      // 每月sheet
      const months = vehicleMonthOptions.value.filter(o => o.value !== 'all')
      const filter = vehicleTypeFilter[vehicleDrillDownType.value]

      for (const { value: month } of months) {
        let monthData: VehicleData[]
        const cacheKey = `${month}_${vehicleDrillDownType.value}`

        if (vehicleMonthlyCache.value.has(cacheKey)) {
          monthData = vehicleMonthlyCache.value.get(cacheKey)!
        } else {
          try {
            const res = await getDashboardStatistics(month, month)
            if (res.ok) {
              monthData = res.data.allVehicles.filter(filter)
              vehicleMonthlyCache.value.set(cacheKey, monthData)
            } else {
              monthData = []
            }
          } catch {
            monthData = []
          }
        }

        // 按当前筛选条件过滤
        const filtered = vehicleCategoryFilter.value === 'all'
          ? monthData
          : monthData.filter(v => v.veh_category === vehicleCategoryFilter.value)

        const monthSheet = workbook.addWorksheet(month)
        fillVehicleSheet(monthSheet, filtered, showTruckDestColumns.value)
      }

      vehicleExportLoading.value = false
    } else if (exportType.value === 'invoice') {
      const sheet = workbook.addWorksheet('明细')
      // 运单明细导出
      sheet.columns = [
        { header: '运单号', key: 'waybill_no', width: 18 },
        { header: '车船', key: 'vehicle', width: 15 },
        { header: '开单名称', key: 'billingName', width: 20 },
        { header: '配发时间', key: 'shipDate', width: 15 },
        { header: '配发吨数', key: 'tonnage', width: 12 }
      ]

      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      }

      invoiceData.value.forEach(item => {
        sheet.addRow({
          waybill_no: item.waybill_no,
          vehicle: item.vehicle,
          billingName: item.billingName,
          shipDate: new Date(item.shipDate).toLocaleDateString('zh-CN'),
          tonnage: item.tonnage
        })
      })
    } else if (exportType.value === 'billingName') {
      const sheet = workbook.addWorksheet('明细')
      // 开单名称导出
      sheet.columns = [
        { header: '开单名称', key: 'name', width: 25 },
        { header: '结算吨数', key: 'settledWeight', width: 12 },
        { header: '结算金额', key: 'settledAmount', width: 15 },
        { header: '开票吨数', key: 'invoicedWeight', width: 12 },
        { header: '开票金额', key: 'invoicedAmount', width: 15 },
        { header: '回款吨数', key: 'paidWeight', width: 12 },
        { header: '回款金额', key: 'paidAmount', width: 15 }
      ]

      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      }

      billingNameData.value.forEach(item => {
        sheet.addRow({
          name: item.name,
          settledWeight: item.settledWeight,
          settledAmount: item.settledAmount,
          invoicedWeight: item.invoicedWeight,
          invoicedAmount: item.invoicedAmount,
          paidWeight: item.paidWeight,
          paidAmount: item.paidAmount
        })
      })
    }

    // 添加边框（所有sheet）
    workbook.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
        })
      })
    })

    // 生成文件
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    if (directoryHandle) {
      const fileHandle = await directoryHandle.getFileHandle(`${fileName}.xlsx`, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      toast.success('导出成功')
    } else {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('导出成功')
    }
  } catch (error) {
    console.error('导出失败:', error)
    toast.error('导出失败')
  } finally {
    vehicleExportLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 首次加载 loading -->
    <div v-if="initialLoading" class="flex flex-col items-center justify-center py-32 text-muted-foreground">
      <Loader2 class="h-10 w-10 animate-spin mb-4 text-primary" />
      <span class="text-sm">正在加载数据...</span>
    </div>

    <template v-else>
    <!-- Header with Year Selector -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold tracking-tight">数据概览</h2>
        <p class="text-muted-foreground text-sm mt-1">实时监控配发、开票及回款数据</p>
      </div>
      <div class="flex items-center space-x-2">
        <Select v-model="selectedYear">
          <SelectTrigger class="w-[140px] bg-white dark:bg-slate-900 shadow-sm">
            <Calendar class="mr-2 h-4 w-4" />
            <SelectValue placeholder="选择年份" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in years" :key="y" :value="y">
              {{ y }}年
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UiCard class="border-0 dark:border dark:border-border/40 shadow-md bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-background">
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            总配发吨数
          </UiCardTitle>
          <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-blue-600">
              <path d="M12 12v10M7 3l5 7 5-7M7 10h10M7 14h10"/>
            </svg>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-3xl font-bold" :class="canDrillDown && 'cursor-pointer hover:text-primary transition-colors'" @click="canDrillDown && drillDownInvoices()">
            {{ stats.totalTonnage.toLocaleString() }} <span class="text-lg font-normal text-muted-foreground">吨</span>
          </div>
          <div v-if="canSeeSettle" class="mt-3 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">未结算（车运到船）</span>
              <span class="font-medium text-yellow-700 dark:text-yellow-400">{{ stats.truckToShipUnsettledTonnage.toLocaleString() }} 吨</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">未结算（客户/南钢）</span>
              <span class="font-medium text-yellow-700 dark:text-yellow-400">{{ stats.customerUnsettledTonnage.toLocaleString() }}/{{ stats.collectionUnsettledTonnage.toLocaleString() }} 吨</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">未开票</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ (stats.totalSettledTonnage - stats.totalInvoiceTonnage).toLocaleString() }} 吨</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  {{ stats.totalSettledTonnage > 0 ? (((stats.totalSettledTonnage - stats.totalInvoiceTonnage) / stats.totalSettledTonnage) * 100).toFixed(1) : '0' }}%
                </span>
              </div>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">未回款</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ (stats.totalInvoiceTonnage - stats.totalPaymentTonnage).toLocaleString() }} 吨</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {{ stats.totalInvoiceTonnage > 0 ? (((stats.totalInvoiceTonnage - stats.totalPaymentTonnage) / stats.totalInvoiceTonnage) * 100).toFixed(1) : '0' }}%
                </span>
              </div>
            </div>
          </div>
        </UiCardContent>
      </UiCard>

      <UiCard class="border-0 dark:border dark:border-border/40 shadow-md bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/40 dark:to-background">
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发开单名称数
          </UiCardTitle>
          <div class="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-purple-600">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-3xl font-bold" :class="canDrillDown && 'cursor-pointer hover:text-primary transition-colors'" @click="canDrillDown && drillDownBillingNames()">
            {{ stats.billingNameCount }} <span class="text-lg font-normal text-muted-foreground">个</span>
          </div>
          <p class="text-sm text-muted-foreground mt-3">
            {{ startDate }} 至 {{ endDate }} 期间有配发记录的客户数量
          </p>
        </UiCardContent>
      </UiCard>

      <UiCard class="border-0 dark:border dark:border-border/40 shadow-md bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-background">
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发车船数
          </UiCardTitle>
          <div class="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-emerald-600">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-3xl font-bold">
            {{ stats.allVehicles.length }} <span class="text-lg font-normal text-muted-foreground">辆/艘</span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div class="flex items-center justify-between p-2 rounded-lg bg-background/50">
              <span class="text-muted-foreground">自有</span>
              <span class="font-medium" :class="canDrillDown && 'cursor-pointer hover:text-primary'" @click="canDrillDown && drillDownVehicle('own')">{{ stats.ownVehicleCount }}</span>
            </div>
            <div class="flex items-center justify-between p-2 rounded-lg bg-background/50">
              <span class="text-muted-foreground">外挂</span>
              <span class="font-medium" :class="canDrillDown && 'cursor-pointer hover:text-primary'" @click="canDrillDown && drillDownVehicle('outsourced')">{{ stats.outsourcedVehicleCount }}</span>
            </div>
            <div class="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <span class="text-blue-600">车运</span>
              <span class="font-medium text-blue-700 dark:text-blue-400" :class="canDrillDown && 'cursor-pointer'" @click="canDrillDown && drillDownVehicle('truck')">{{ stats.truckTonnage.toLocaleString() }}吨</span>
            </div>
            <div class="flex items-center justify-between p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <span class="text-indigo-600">船运</span>
              <span class="font-medium text-indigo-700 dark:text-indigo-400" :class="canDrillDown && 'cursor-pointer'" @click="canDrillDown && drillDownVehicle('vessel')">{{ stats.vesselTonnage.toLocaleString() }}吨</span>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-7">
      <!-- Monthly Trend -->
      <div class="col-span-1 lg:col-span-4 h-[500px]">
        <OverviewChart
          :data="stats.monthlyTrend"
          v-model:startDate="startDate"
          v-model:endDate="endDate"
        />
      </div>

      <!-- Top Billing Names -->
      <div class="col-span-1 lg:col-span-3 h-[500px]">
        <TopList
          title="开单名称排名 (Top 10)"
          description="按配发吨数排名"
          :data="stats.top10BillingNames"
        />
      </div>
    </div>

    <!-- All Vehicles Table -->
    <div class="h-[500px]">
      <AllVehiclesTable :data="stats.allVehicles" />
    </div>
    </template>

    <!-- 车辆下钻明细对话框 -->
    <Dialog v-model:open="showVehicleDrillDownDialog">
      <DialogContent class="w-[95vw] min-w-[70vw] md:max-w-[85vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ vehicleDrillDownTitle }}</DialogTitle>
          <DialogDescription>
            共 {{ filteredVehicleDrillDownData.length }} 条记录，合计 {{ vehicleDrillDownTotalTonnage.toLocaleString() }} 吨，总价 {{ vehicleDrillDownTotalPrice.toLocaleString() }} 元
            <span v-if="vehicleDrillDownMonth !== 'all'" class="ml-2 text-xs text-muted-foreground">（财务月：上月26日 ~ 本月25日）</span>
          </DialogDescription>
        </DialogHeader>

        <!-- 筛选栏：自有/外挂 + 月份选择 + 刷新 -->
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted-foreground">筛选：</span>
            <div class="flex gap-1">
              <Button
                size="sm" variant="outline"
                :class="vehicleCategoryFilter === 'all' ? 'bg-primary text-primary-foreground' : ''"
                @click="vehicleCategoryFilter = 'all'"
              >全部</Button>
              <Button
                size="sm" variant="outline"
                :class="vehicleCategoryFilter === '自有' ? 'bg-primary text-primary-foreground' : ''"
                @click="vehicleCategoryFilter = '自有'"
              >自有</Button>
              <Button
                size="sm" variant="outline"
                :class="vehicleCategoryFilter === '外挂' ? 'bg-primary text-primary-foreground' : ''"
                @click="vehicleCategoryFilter = '外挂'"
              >外挂</Button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted-foreground">月份：</span>
            <Select v-model="vehicleDrillDownMonth">
              <SelectTrigger class="w-[120px] h-8">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in vehicleMonthOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" class="h-8 w-8" @click="refreshVehicleMonth" :disabled="vehicleMonthLoading">
              <Loader2 v-if="vehicleMonthLoading" class="h-4 w-4 animate-spin" />
              <RefreshCw v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div v-if="vehicleMonthLoading" class="flex-1 flex items-center justify-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>

        <div v-else class="flex-1 overflow-auto border rounded-md">
          <table class="w-full caption-bottom text-sm">
            <TableHeader class="sticky top-0 z-10 bg-background shadow-sm">
              <TableRow>
                <TableHead>车船号</TableHead>
                <TableHead class="text-right">配发吨数</TableHead>
                <TableHead v-if="showTruckDestColumns" class="text-right">到船吨数</TableHead>
                <TableHead v-if="showTruckDestColumns" class="text-right">到客户吨数</TableHead>
                <TableHead class="text-right">总价格</TableHead>
                <TableHead>车船类型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in filteredVehicleDrillDownData" :key="item.name">
                <TableCell class="font-medium">{{ item.name }}</TableCell>
                <TableCell class="text-right">{{ item.value.toLocaleString() }}</TableCell>
                <TableCell v-if="showTruckDestColumns" class="text-right">{{ (item.to_ship || 0).toLocaleString() }}</TableCell>
                <TableCell v-if="showTruckDestColumns" class="text-right">{{ (item.to_customer || 0).toLocaleString() }}</TableCell>
                <TableCell class="text-right">{{ (item.total_price || 0).toLocaleString() }}</TableCell>
                <TableCell>
                  <span class="mr-1">{{ item.veh_type || '-' }}</span>
                  <span v-if="item.veh_category" class="text-muted-foreground">/ {{ item.veh_category }}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="openExport" :disabled="vehicleExportLoading || vehicleMonthLoading">
            <Loader2 v-if="vehicleExportLoading" class="w-4 h-4 mr-2 animate-spin" />
            <Download v-else class="w-4 h-4 mr-2" />
            {{ vehicleExportLoading ? '导出中...' : '导出' }}
          </Button>
          <Button @click="showVehicleDrillDownDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 运单明细下钻对话框 -->
    <Dialog v-model:open="showInvoiceDialog">
      <DialogContent class="w-[95vw] min-w-[70vw] md:max-w-[85vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>运单明细</DialogTitle>
          <DialogDescription>
            共 {{ invoiceData.length }} 条记录
            <span v-if="invoiceDrillDownMonth !== 'all'" class="ml-2 text-xs text-muted-foreground">（财务月：上月26日 ~ 本月25日）</span>
          </DialogDescription>
        </DialogHeader>

        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">月份：</span>
          <Select v-model="invoiceDrillDownMonth">
            <SelectTrigger class="w-[120px] h-8">
              <SelectValue placeholder="选择月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in vehicleMonthOptions" :key="`invoice-${opt.value}`" :value="opt.value">
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="invoiceLoading" class="flex-1 flex items-center justify-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>

        <div v-else class="flex-1 overflow-auto border rounded-md">
          <table class="w-full caption-bottom text-sm">
            <TableHeader class="sticky top-0 z-10 bg-background shadow-sm">
              <TableRow>
                <TableHead>运单号</TableHead>
                <TableHead>车船</TableHead>
                <TableHead>开单名称</TableHead>
                <TableHead>配发时间</TableHead>
                <TableHead class="text-right">配发吨数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in invoiceData" :key="item.waybill_no">
                <TableCell class="font-medium">{{ item.waybill_no }}</TableCell>
                <TableCell>{{ item.vehicle }}</TableCell>
                <TableCell>{{ item.billingName }}</TableCell>
                <TableCell>{{ new Date(item.shipDate).toLocaleDateString('zh-CN') }}</TableCell>
                <TableCell class="text-right">{{ item.tonnage.toLocaleString() }}</TableCell>
              </TableRow>
            </TableBody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="openExport" :disabled="invoiceLoading">
            <Download class="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button @click="showInvoiceDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 开单名称下钻对话框 -->
    <Dialog v-model:open="showBillingNameDialog">
      <DialogContent class="w-[95vw] min-w-[70vw] md:max-w-[85vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>开单名称统计明细</DialogTitle>
          <DialogDescription>
            共 {{ billingNameData.length }} 条记录
            <span v-if="billingNameDrillDownMonth !== 'all'" class="ml-2 text-xs text-muted-foreground">（财务月：上月26日 ~ 本月25日）</span>
          </DialogDescription>
        </DialogHeader>

        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">月份：</span>
          <Select v-model="billingNameDrillDownMonth">
            <SelectTrigger class="w-[120px] h-8">
              <SelectValue placeholder="选择月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in vehicleMonthOptions" :key="`billing-${opt.value}`" :value="opt.value">
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="billingNameLoading" class="flex-1 flex items-center justify-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>

        <div v-else class="flex-1 overflow-auto border rounded-md">
          <table class="w-full caption-bottom text-sm">
            <TableHeader class="sticky top-0 z-10 bg-background shadow-sm">
              <TableRow>
                <TableHead>开单名称</TableHead>
                <TableHead class="text-right text-blue-600 dark:text-blue-400">结算吨数</TableHead>
                <TableHead class="text-right text-amber-600 dark:text-amber-400">结算金额</TableHead>
                <TableHead class="text-right text-blue-600 dark:text-blue-400">开票吨数</TableHead>
                <TableHead class="text-right text-amber-600 dark:text-amber-400">开票金额</TableHead>
                <TableHead class="text-right text-blue-600 dark:text-blue-400">回款吨数</TableHead>
                <TableHead class="text-right text-amber-600 dark:text-amber-400">回款金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in billingNameData" :key="item.name">
                <TableCell class="font-medium">{{ item.name }}</TableCell>
                <TableCell class="text-right text-blue-600 dark:text-blue-400 tabular-nums">{{ item.settledWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right text-amber-600 dark:text-amber-400 tabular-nums">¥{{ item.settledAmount.toLocaleString() }}</TableCell>
                <TableCell class="text-right text-blue-600 dark:text-blue-400 tabular-nums">{{ item.invoicedWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right text-amber-600 dark:text-amber-400 tabular-nums">¥{{ item.invoicedAmount.toLocaleString() }}</TableCell>
                <TableCell class="text-right text-blue-600 dark:text-blue-400 tabular-nums">{{ item.paidWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right text-amber-600 dark:text-amber-400 tabular-nums">¥{{ item.paidAmount.toLocaleString() }}</TableCell>
              </TableRow>
            </TableBody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="openExport" :disabled="billingNameLoading">
            <Download class="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button @click="showBillingNameDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 导出对话框 -->
    <ExportDialog
      v-model:open="showExportDialog"
      :default-file-name="exportFileName"
      @confirm="handleExport"
    />
  </div>
</template>
