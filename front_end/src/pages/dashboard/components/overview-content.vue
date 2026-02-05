<script lang="ts" setup>
import { ref, onMounted, watch, computed } from 'vue'
import { toast } from 'vue-sonner'
import { Calendar, Download } from 'lucide-vue-next'
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

const now = new Date()
const currentYear = now.getFullYear()
// Generate last 10 years
const years = Array.from({ length: 10 }, (_, i) => (currentYear - i).toString())

const startDate = ref(`${currentYear}-01`)
const endDate = ref(`${currentYear}-12`)

// Computed year derived from endDate, or a dedicated ref if needed
const selectedYear = ref(currentYear.toString())

const loading = ref(false)
const stats = ref<DashboardStats>({
  totalTonnage: 0,
  totalInvoiceTonnage: 0,
  totalPaymentTonnage: 0,
  billingNameCount: 0,
  monthlyTrend: [],
  top8BillingNames: [],
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

// 运单明细下钻对话框状态
const showInvoiceDialog = ref(false)
const invoiceData = ref<InvoiceDetail[]>([])
const invoiceLoading = ref(false)

// 开单名称下钻对话框状态
const showBillingNameDialog = ref(false)
const billingNameData = ref<BillingNameStats[]>([])
const billingNameLoading = ref(false)

// 导出对话框状态
const showExportDialog = ref(false)
const exportFileName = ref('')
const exportType = ref<'vehicle' | 'billingName' | 'invoice'>('vehicle')

// 车辆下钻函数
function drillDownVehicle(type: 'own' | 'outsourced' | 'truck' | 'vessel') {
  console.log('drillDownVehicle called with type:', type)
  console.log('stats.allVehicles:', stats.value.allVehicles)

  const titles = {
    own: '自有车辆明细',
    outsourced: '外挂车辆明细',
    truck: '车运明细',
    vessel: '船运明细'
  }

  const filters = {
    own: (v: VehicleData) => v.veh_category === '自有',
    outsourced: (v: VehicleData) => v.veh_category === '外挂',
    truck: (v: VehicleData) => v.veh_type === '车',
    vessel: (v: VehicleData) => v.veh_type === '船'
  }

  vehicleDrillDownTitle.value = titles[type]
  vehicleDrillDownData.value = stats.value.allVehicles.filter(filters[type])
  console.log('Filtered data:', vehicleDrillDownData.value)
  exportType.value = 'vehicle'
  showVehicleDrillDownDialog.value = true
  console.log('Dialog should open now')
}

// 运单明细下钻函数
async function drillDownInvoices() {
  invoiceLoading.value = true
  showInvoiceDialog.value = true
  exportType.value = 'invoice'

  try {
    const res = await getDashboardInvoiceDetails(startDate.value, endDate.value)
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
  billingNameLoading.value = true
  showBillingNameDialog.value = true
  exportType.value = 'billingName'

  try {
    const res = await getDashboardBillingNamesStats(startDate.value, endDate.value)
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

async function handleExport(fileName: string, directoryHandle: FileSystemDirectoryHandle | null) {
  try {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('明细')

    if (exportType.value === 'vehicle') {
      // 车辆导出
      sheet.columns = [
        { header: '车船号', key: 'name', width: 20 },
        { header: '配发吨数', key: 'value', width: 15 },
        { header: '车辆类型', key: 'veh_type', width: 12 },
        { header: '所有权', key: 'veh_category', width: 12 }
      ]

      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      }

      vehicleDrillDownData.value.forEach(item => {
        sheet.addRow({
          name: item.name,
          value: item.value,
          veh_type: item.veh_type || '-',
          veh_category: item.veh_category || '-'
        })
      })
    } else if (exportType.value === 'invoice') {
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

    // 添加边框
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
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Year Selector -->
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight">概览</h2>
      <div class="flex items-center space-x-2">
        <Select v-model="selectedYear">
          <SelectTrigger class="w-[140px]">
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
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            总配发吨数
          </UiCardTitle>
            <div class="h-4 w-4 text-muted-foreground flex items-center justify-center">
              ¥
            </div>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold cursor-pointer hover:text-primary hover:underline" @click="drillDownInvoices">
            {{ stats.totalTonnage.toLocaleString() }} 吨
          </div>
          <div class="mt-2 space-y-1">
            <p class="text-sm text-muted-foreground">
              开票: <span class="font-medium text-foreground">{{ stats.totalInvoiceTonnage.toLocaleString() }}</span> 吨
              <span class="ml-2 text-blue-600 font-semibold">{{ ((stats.totalInvoiceTonnage / stats.totalTonnage) * 100).toFixed(2) }}%</span>
            </p>
            <p class="text-sm text-muted-foreground">
              回款: <span class="font-medium text-foreground">{{ stats.totalPaymentTonnage.toLocaleString() }}</span> 吨
              <span class="ml-2 text-green-600 font-semibold">{{ ((stats.totalPaymentTonnage / stats.totalTonnage) * 100).toFixed(2) }}%</span>
            </p>
          </div>
          <p class="text-xs text-muted-foreground mt-2">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发开单名称数
          </UiCardTitle>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            class="h-4 w-4 text-muted-foreground"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold cursor-pointer hover:text-primary hover:underline" @click="drillDownBillingNames">
            {{ stats.billingNameCount }}
          </div>
          <p class="text-xs text-muted-foreground">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>
      
       <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发车船数
          </UiCardTitle>
           <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            class="h-4 w-4 text-muted-foreground"
          >
            <rect width="20" height="14" x="2" y="5" rx="2" />
            <path d="M2 10h20" />
          </svg>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ stats.allVehicles.length }}
          </div>
          <div class="mt-2 space-y-1">
            <p class="text-sm text-muted-foreground">
              自有: <span
                class="font-medium text-foreground cursor-pointer hover:text-primary hover:underline"
                @click="drillDownVehicle('own')"
              >{{ stats.ownVehicleCount }}</span> 辆
              <span class="text-xs ml-1">({{ stats.ownVehicleTonnage.toLocaleString() }}吨)</span>
              <span class="mx-2">|</span>
              外挂: <span
                class="font-medium text-foreground cursor-pointer hover:text-primary hover:underline"
                @click="drillDownVehicle('outsourced')"
              >{{ stats.outsourcedVehicleCount }}</span> 辆
              <span class="text-xs ml-1">({{ stats.outsourcedVehicleTonnage.toLocaleString() }}吨)</span>
            </p>
            <p class="text-sm text-muted-foreground">
              车运: <span
                class="font-medium text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                @click="drillDownVehicle('truck')"
              >{{ stats.truckTonnage.toLocaleString() }}</span> 吨
              <span class="mx-2">|</span>
              船运: <span
                class="font-medium text-indigo-600 cursor-pointer hover:text-indigo-800 hover:underline"
                @click="drillDownVehicle('vessel')"
              >{{ stats.vesselTonnage.toLocaleString() }}</span> 吨
            </p>
          </div>
          <p class="text-xs text-muted-foreground mt-2">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-7">
      <!-- Monthly Trend -->
      <div class="col-span-1 lg:col-span-4 h-auto lg:h-[500px]">
        <OverviewChart
          :data="stats.monthlyTrend"
          v-model:startDate="startDate"
          v-model:endDate="endDate"
        />
      </div>

      <!-- Top Billing Names -->
      <div class="col-span-1 lg:col-span-3 h-auto lg:h-[500px]">
        <TopList
          title="开单名称排名 (Top 8)"
          description="按配发吨数排名"
          :data="stats.top8BillingNames"
        />
      </div>
    </div>

    <!-- Bottom Section -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-7 h-[600px]">
      <!-- Top Vehicles -->
      <div class="col-span-1 lg:col-span-3 h-full">
         <TopList 
          title="车船排名 (Top 5)" 
          description="按配发吨数排名" 
          :data="stats.top5Vehicles" 
        />
      </div>

      <!-- All Vehicles Table -->
      <div class="col-span-1 lg:col-span-4 h-full">
         <AllVehiclesTable :data="stats.allVehicles" />
      </div>
    </div>

    <!-- 车辆下钻明细对话框 -->
    <Dialog v-model:open="showVehicleDrillDownDialog">
      <DialogContent class="w-[95vw] min-w-[70vw] md:max-w-[85vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ vehicleDrillDownTitle }}</DialogTitle>
          <DialogDescription>
            共 {{ vehicleDrillDownData.length }} 条记录
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>车船号</TableHead>
                <TableHead class="text-right">配发吨数</TableHead>
                <TableHead>车辆类型</TableHead>
                <TableHead>所有权</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in vehicleDrillDownData" :key="item.name">
                <TableCell class="font-medium">{{ item.name }}</TableCell>
                <TableCell class="text-right">{{ item.value.toLocaleString() }}</TableCell>
                <TableCell>{{ item.veh_type || '-' }}</TableCell>
                <TableCell>{{ item.veh_category || '-' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="openExport">
            <Download class="w-4 h-4 mr-2" />
            导出
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
          </DialogDescription>
        </DialogHeader>

        <div v-if="invoiceLoading" class="flex-1 flex items-center justify-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>

        <div v-else class="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
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
          </Table>
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
          </DialogDescription>
        </DialogHeader>

        <div v-if="billingNameLoading" class="flex-1 flex items-center justify-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>

        <div v-else class="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>开单名称</TableHead>
                <TableHead class="text-right">结算吨数</TableHead>
                <TableHead class="text-right">结算金额</TableHead>
                <TableHead class="text-right">开票吨数</TableHead>
                <TableHead class="text-right">开票金额</TableHead>
                <TableHead class="text-right">回款吨数</TableHead>
                <TableHead class="text-right">回款金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in billingNameData" :key="item.name">
                <TableCell class="font-medium">{{ item.name }}</TableCell>
                <TableCell class="text-right">{{ item.settledWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right">¥{{ item.settledAmount.toLocaleString() }}</TableCell>
                <TableCell class="text-right">{{ item.invoicedWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right">¥{{ item.invoicedAmount.toLocaleString() }}</TableCell>
                <TableCell class="text-right">{{ item.paidWeight.toLocaleString() }}</TableCell>
                <TableCell class="text-right">¥{{ item.paidAmount.toLocaleString() }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
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
