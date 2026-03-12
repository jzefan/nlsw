<script setup lang="ts">
// @ts-nocheck
import { computed, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Download, List, RefreshCcw, Search } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { formatDate, toExcelDate, toExcelNum } from '@/utils/format'
import SearchableCombobox from '@/components/searchable-combobox.vue'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { getCompanies, getDestinations, getVehicles } from '@/services/api/data-dict.api'
import { getInvoiceReport, getWaybillDetail } from '@/services/api/report.api'
import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// State
const loading = ref(false)
const invoices = ref<any[]>([])
const pricesMap = ref<Record<string, any>>({})
const selectedWaybillNo = ref<string | null>(null)

// Filters
const filter = reactive({
  billingName: '',
  vehicle: '',
  destination: '',
  shipper: '',
  startDate: '',
  endDate: '',
})

// Details Dialog State
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const detailBills = ref<any[]>([])
const detailInvoice = ref<any>(null)

// Search Functions
async function searchBillingNames(search: string, limit: number, page: number) {
  return getCompanies({ search, limit, page })
}
async function searchVehiclesFn(search: string, limit: number, page: number) {
  return getVehicles({ search, limit, page })
}
async function searchDestinationsFn(search: string, limit: number, page: number) {
  return getDestinations({ search, limit, page })
}
async function searchUsers(search: string, limit: number, page: number) {
  const res = await axiosInstance.get('/users')
  if (res.data.ok) {
    const users = res.data.data.map((u: any) => ({
      name: u.userid,
      desc: u.profile?.name || '',
    }))
    // Basic local filtering for demo as the endpoint returns all
    const filtered = users.filter((u: any) => 
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.desc.toLowerCase().includes(search.toLowerCase())
    )
    return { ok: true, data: filtered.slice((page - 1) * limit, page * limit), total: filtered.length }
  }
  return { ok: false, data: [], total: 0 }
}

// Actions
async function handleQuery() {
  if (!filter.startDate || !filter.endDate) {
    toast.error('请选择发货日期范围')
    return
  }

  if (new Date(filter.startDate) > new Date(filter.endDate)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  loading.value = true
  try {
    const res = await getInvoiceReport({
      fName: filter.billingName || undefined,
      fVeh: filter.vehicle || undefined,
      fDest: filter.destination || undefined,
      fShipper: filter.shipper || undefined,
      fDate1: new Date(filter.startDate).toISOString(),
      fDate2: new Date(filter.endDate).toISOString(),
    })

    if (res.ok) {
      if (res.hint) {
        toast.warning(`查询到的记录数为：${res.num}，请缩小查询条件！`)
        invoices.value = []
        pricesMap.value = {}
      } else {
        invoices.value = res.invs || []
        pricesMap.value = res.prices || {}
        if (invoices.value.length === 0) toast.info('未找到符合条件的运单')
      }
    } else {
      toast.error(res.message || '查询失败')
    }
  } catch (e: any) {
    toast.error('查询出错', { description: e.message })
  } finally {
    loading.value = false
  }
}

function handleReset() {
  filter.billingName = ''
  filter.vehicle = ''
  filter.destination = ''
  filter.shipper = ''
  filter.startDate = ''
  filter.endDate = ''
  invoices.value = []
  pricesMap.value = {}
}

async function showDetail() {
  if (!selectedWaybillNo.value) {
    toast.error('请先选择一行运单')
    return
  }

  detailLoading.value = true
  showDetailDialog.value = true
  try {
    const res = await getWaybillDetail(selectedWaybillNo.value)
    detailBills.value = res.bills || []
    detailInvoice.value = res.invoices?.[0] || null
  } catch (e: any) {
    toast.error('获取明细出错', { description: e.message })
  } finally {
    detailLoading.value = false
  }
}

function getInvRecord(bill: any) {
  return bill.invoices?.find((ir: any) => ir.inv_no === selectedWaybillNo.value)
}


function formatNum(num: any) {
  if (num === undefined || num === null) return ''
  return Number(num).toFixed(3)
}

function getOrderDisplay(bill: any) {
  const itemNo = String(bill.order_item_no || 0).padStart(3, '0')
  return `${bill.order_no}-${itemNo}`
}

function selectRow(wno: string) {
  selectedWaybillNo.value = wno
}

function handleExport() {
  if (invoices.value.length === 0) return

  const data = invoices.value.map(inv => {
    const p = pricesMap.value[inv.waybill_no] || {}
    let billNum = 0
    inv.bills.forEach((b: any) => { billNum += b.num || 0 })

    return {
      state: inv.vessel_settle_state,
      ship_name: inv.ship_customer ? `${inv.ship_name}/${inv.ship_customer}` : inv.ship_name,
      vehicle_vessel_name: inv.vehicle_vessel_name,
      ship_to: inv.ship_to,
      bill_num: toExcelNum(billNum),
      total_weight: toExcelNum(inv.total_weight),
      cust_price: toExcelNum(p.cust_price),
      veh_price: toExcelNum(p.veh_price),
      net_income: toExcelNum(p.net_income),
      ship_date: toExcelDate(inv.ship_date),
      shipper: inv.shipper,
      waybill_no: inv.waybill_no
    }
  })

  exportWithPicker({
    fileName: `运输价格报表_${new Date().toISOString().slice(0, 10)}`,
    sheetName: '运输价格报表',
    columns: [
      { header: '状态', key: 'state' },
      { header: '开单名称', key: 'ship_name' },
      { header: '车船号', key: 'vehicle_vessel_name' },
      { header: '目的地', key: 'ship_to' },
      { header: '发运块数', key: 'bill_num' },
      { header: '发运重量', key: 'total_weight' },
      { header: '客户单价', key: 'cust_price' },
      { header: '应付单价', key: 'veh_price' },
      { header: '含税毛利', key: 'net_income' },
      { header: '发货日期', key: 'ship_date' },
      { header: '发货人', key: 'shipper' },
      { header: '运单号', key: 'waybill_no' },
    ],
    data,
  })
}

// Date linkage logic
function disableStartDate(date: Date) {
  if (filter.endDate) {
    const end = new Date(filter.endDate)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (filter.startDate) {
    const start = new Date(filter.startDate)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}
</script>

<template>
  <BasicPage title="运输价格报表" description="查询运单运输价格、单价及毛利">
    <!-- Toolbar -->
    <div class="mb-6 p-4 border rounded-lg bg-muted/30 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SearchableCombobox
          v-model="filter.billingName"
          :search-fn="searchBillingNames"
          placeholder="开单名称"
          class="w-full h-9"
        />
        <SearchableCombobox
          v-model="filter.vehicle"
          :search-fn="searchVehiclesFn"
          placeholder="车船号"
          class="w-full h-9"
        />
        <SearchableCombobox
          v-model="filter.destination"
          :search-fn="searchDestinationsFn"
          placeholder="目的地"
          class="w-full h-9"
        />
        <SearchableCombobox
          v-model="filter.shipper"
          :search-fn="searchUsers"
          placeholder="发货人"
          class="w-full h-9"
        />
        
        <DatePicker
          v-model="filter.startDate"
          placeholder="发货日期(开始)"
          :disabled-date="disableStartDate"
          disabled-hint="开始日期不能晚于结束日期"
          class="w-full h-9"
        />
        <DatePicker
          v-model="filter.endDate"
          placeholder="发货日期(结束)"
          :disabled-date="disableEndDate"
          disabled-hint="结束日期不能早于开始日期"
          class="w-full h-9"
        />

        <div class="lg:col-span-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="handleReset" class="h-9">
            <RefreshCcw class="w-4 h-4 mr-2" />
            重置
          </Button>
          <Button variant="outline" size="sm" :disabled="!selectedWaybillNo" @click="showDetail" class="h-9">
            <List class="w-4 h-4 mr-2" />
            显示明细
          </Button>
          <Button variant="outline" size="sm" @click="handleExport" class="h-9">
            <Download class="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button :disabled="loading" size="sm" @click="handleQuery" class="h-9 min-w-[100px]">
            <Search class="w-4 h-4 mr-2" />
            查询确定
          </Button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center p-24 border rounded-lg bg-muted/5">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4"></div>
        <p class="text-lg font-medium text-muted-foreground animate-pulse">正在查询数据，请稍等...</p>
    </div>

    <!-- Table -->
    <div v-else-if="invoices.length > 0" class="border rounded-md overflow-hidden">
      <Table class="border-collapse">
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="text-center border">状态</TableHead>
            <TableHead class="text-center border">开单名称</TableHead>
            <TableHead class="text-center border">车船号</TableHead>
            <TableHead class="text-center border">目的地</TableHead>
            <TableHead class="text-center border">发运块数</TableHead>
            <TableHead class="text-center border">发运重量</TableHead>
            <TableHead class="text-center border">客户单价</TableHead>
            <TableHead class="text-center border">应付单价</TableHead>
            <TableHead class="text-center border">含税毛利</TableHead>
            <TableHead class="text-center border text-nowrap">发货日期</TableHead>
            <TableHead class="text-center border">发货人</TableHead>
            <TableHead class="text-center border">运单号</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow 
            v-for="inv in invoices" 
            :key="inv.waybill_no" 
            :class="['hover:bg-muted/50 cursor-pointer transition-colors', selectedWaybillNo === inv.waybill_no && 'bg-primary/10']"
            @click="selectRow(inv.waybill_no)"
          >
            <TableCell class="text-center border text-nowrap">{{ inv.vessel_settle_state }}</TableCell>
            <TableCell class="border">{{ inv.ship_customer ? `${inv.ship_name}/${inv.ship_customer}` : inv.ship_name }}</TableCell>
            <TableCell class="text-center border">{{ inv.vehicle_vessel_name }}</TableCell>
            <TableCell class="text-center border">{{ inv.ship_to }}</TableCell>
            <TableCell class="text-right border">
              {{ inv.bills.reduce((sum: number, b: any) => sum + (b.num || 0), 0) }}
            </TableCell>
            <TableCell class="text-right border">{{ formatNum(inv.total_weight) }}</TableCell>
            <TableCell class="text-right border text-blue-600">
              <span class="text-xs mr-0.5">¥</span>{{ formatNum(pricesMap[inv.waybill_no]?.cust_price) }}
            </TableCell>
            <TableCell class="text-right border text-blue-600">
              <span class="text-xs mr-0.5">¥</span>{{ formatNum(pricesMap[inv.waybill_no]?.veh_price) }}
            </TableCell>
            <TableCell class="text-right border font-bold" :class="pricesMap[inv.waybill_no]?.net_income >= 0 ? 'text-red-600' : 'text-green-600'">
              <span class="text-xs mr-0.5">¥</span>{{ formatNum(pricesMap[inv.waybill_no]?.net_income) }}
            </TableCell>
            <TableCell class="text-center border text-nowrap">{{ formatDate(inv.ship_date) }}</TableCell>
            <TableCell class="text-center border">{{ inv.shipper }}</TableCell>
            <TableCell class="text-center border"><code>{{ inv.waybill_no }}</code></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-muted/10 text-muted-foreground">
      <p>请选择发货日期范围并点击“查询确定”开始查询</p>
    </div>

    <!-- Detail Dialog -->
    <Dialog v-model:open="showDetailDialog">
      <DialogContent class="min-w-[90vw] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>运单明细: {{ selectedWaybillNo }}</DialogTitle>
        </DialogHeader>
        
        <div class="flex-1 overflow-auto border rounded-md">
          <Table class="relative">
            <TableHeader class="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead class="border">提单号</TableHead>
                <TableHead class="border">订单号-项次号</TableHead>
                <TableHead class="border text-nowrap">发货仓库</TableHead>
                <TableHead class="border text-right">厚度</TableHead>
                <TableHead class="border text-right">宽度</TableHead>
                <TableHead class="border text-right">长度</TableHead>
                <TableHead class="border text-right">单重</TableHead>
                <TableHead class="border text-right">总块数</TableHead>
                <TableHead class="border text-right">总重量</TableHead>
                <TableHead class="border text-right">发运块数</TableHead>
                <TableHead class="border text-right">发运重量</TableHead>
                <TableHead class="border text-right">客户价格</TableHead>
                <TableHead class="border text-right">代收付价格</TableHead>
                <TableHead class="border">车号明细</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="bill in detailBills" :key="bill._id">
                <TableCell class="border">{{ bill.bill_no }}</TableCell>
                <TableCell class="border">{{ getOrderDisplay(bill) }}</TableCell>
                <TableCell class="border">{{ bill.ship_warehouse }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(bill.thickness) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(bill.width) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(bill.len) }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(bill.weight) }}</TableCell>
                <TableCell class="text-right border">{{ bill.block_num }}</TableCell>
                <TableCell class="text-right border">{{ formatNum(bill.total_weight) }}</TableCell>
                
                <!-- Shipped info from the specific invoice -->
                <TableCell class="text-right border font-bold">{{ getInvRecord(bill)?.num || 0 }}</TableCell>
                <TableCell class="text-right border font-bold">{{ formatNum(getInvRecord(bill)?.weight || (getInvRecord(bill)?.num * bill.weight)) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(bill.customer_price) }}</TableCell>
                <TableCell class="text-right border text-blue-600"><span class="text-xs mr-0.5">¥</span>{{ formatNum(bill.collection_price) }}</TableCell>
                <TableCell class="border text-xs">
                  <div v-for="veh in getInvRecord(bill)?.vehicles" :key="veh.inner_waybill_no">
                    {{ veh.veh_name }}: {{ veh.send_weight }}吨 / ¥{{ veh.veh_price }}
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <DialogFooter>
          <Button @click="showDetailDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 导出对话框 -->
    <ExportDialog
      v-model:open="showExportDialog"
      :default-file-name="exportFileName"
      @confirm="confirmExport"
    />
  </BasicPage>
</template>

<style scoped>
.border { border-color: #e5e7eb; }
</style>

<route lang="yaml">
meta:
  auth: true
</route>
