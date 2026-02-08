<script setup lang="ts">
// @ts-nocheck
import type { ColumnDef } from '@tanstack/vue-table'

import { Download, FileSpreadsheet, RefreshCcw, Search, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, h, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { IntegratedQueryBill } from '@/services/api/report.api'

import { useDevice } from '@/composables/use-device'
import IntegratedMobile from './components/IntegratedMobile.vue'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { getCompanies, getDestinations, getVehicles } from '@/services/api/data-dict.api'
import { getIntegratedQuery } from '@/services/api/report.api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const { user } = storeToRefs(authStore)

// 设备检测
const { isMobile } = useDevice()

// State
const loading = ref(false)
const bills = ref<IntegratedQueryBill[]>([])
const showNotSent = ref(false)
const showDestForVessel = ref(false)
const page = ref(1)
const limit = ref(20)
const total = ref(0)

// Filters
const filter = reactive({
  billingName: '',
  vehicle: '',
  vehicleMode: '',
  destination: '',
  customer: '',
  orderNo: '',
  billNo: '',
  startDate: '',
  endDate: '',
})

// Options
const vehicleModes = ['外挂', '自有']
const customers = ref<string[]>([])

// Dependent Select: Billing Name -> Customer
watch(() => filter.billingName, async (newVal) => {
  customers.value = []
  filter.customer = ''
  if (newVal) {
    try {
      const res = await getCompanies({ search: newVal, limit: 1 })
      if (res.ok && res.data.length > 0 && res.data[0].name === newVal) {
        customers.value = res.data[0].customers || []
      }
    }
    catch (e) {
      console.error(e)
    }
  }
})

// Reset
function handleReset() {
  filter.billingName = ''
  filter.vehicle = ''
  filter.vehicleMode = ''
  filter.destination = ''
  filter.customer = ''
  filter.orderNo = ''
  filter.billNo = ''
  filter.startDate = ''
  filter.endDate = ''
  showNotSent.value = false
  showDestForVessel.value = false
  handleQuery(true)
}

// Query
async function handleQuery(resetPage = true) {
  if (resetPage) {
    page.value = 1
  }

  if (!showNotSent.value && filter.startDate && filter.endDate && new Date(filter.startDate) > new Date(filter.endDate)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  loading.value = true
  try {
    const params: any = {
      fName: filter.billingName ? [filter.billingName] : undefined,
      fVeh: filter.vehicle ? [filter.vehicle] : undefined,
      fVehMode: filter.vehicleMode || undefined,
      fDest: filter.destination ? [filter.destination] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      page: page.value,
      limit: limit.value,
    }

    if (!showNotSent.value && filter.startDate && filter.endDate) {
      // Ensure ISO format as backend expects
      params.fDate1 = new Date(filter.startDate).toISOString()
      params.fDate2 = new Date(filter.endDate).toISOString()
    }

    const res = await getIntegratedQuery(params)
    if (res.ok) {
      bills.value = res.bills || []
      total.value = res.total || 0
      if (resetPage) {
        toast.success(`查询成功，共 ${total.value} 条记录`)
      }
    }
    else {
      toast.error('查询失败')
    }
  }
  catch (e: any) {
    toast.error('查询出错', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// Data Processing Helpers
function getStrByStatus(status: string, defaultVal: string) {
  return status || defaultVal
}

function getOrder(orderNo: string, itemNo: string) {
  if (itemNo)
    return `${orderNo}-${itemNo}`
  return orderNo
}

function getStrValue(val: any) {
  return (val === undefined || val === null) ? '' : val
}

function formatDate(dateStr: string) {
  if (!dateStr)
    return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN')
}

// Columns
const columns = computed<ColumnDef<IntegratedQueryBill>[]>(() => {
  const cols: ColumnDef<IntegratedQueryBill>[] = [
    {
      id: 'settleStatus',
      header: '已配发的结算状态',
      accessorFn: (row) => {
        if (showNotSent.value)
          return ''
        // Logic from integ_query.js
        if (row.inv_settle_flag === 0) {
          if (row.collection_price < 0 && row.price < 0)
            return '客户，代收都不需要结算'
          if (row.collection_price < 0)
            return '客户未结算，代收不需要结算'
          return '客户，代收都未结算'
        }
        else if (row.inv_settle_flag === 1) {
          if (row.collection_price < 0)
            return `客户已结算，代收不需要结算 - ${row.status_2 || ''}`
          return `客户已结算，代收未结算 - ${row.status_2 || ''}`
        }
        else if (row.inv_settle_flag === 2) {
          if (row.price < 0)
            return `客户不需要结算，代收已结算 - ${row.status_2 || ''}`
          return `代收已结算，客户未结算 - ${row.status_2 || ''}`
        }
        else if (row.inv_settle_flag === 3) {
          return `客户，代收付都已结算 - ${row.status_2 || ''}`
        }
        return ''
      },
    },
    {
      header: '提单状态',
      accessorKey: 'status',
      cell: ({ row }) => {
        const status = row.original.status as string
        let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline'
        let className = ''

        switch (status) {
          case '已结算':
            variant = 'secondary'
            className = 'bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent'
            break
          case '已配发':
            variant = 'secondary'
            className = 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent'
            break
          case '待配发':
            variant = 'secondary'
            className = 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80 border-transparent'
            break
          case '新建':
            variant = 'secondary'
            className = 'bg-gray-100 text-gray-800 hover:bg-gray-100/80 border-transparent'
            break
          case '作废':
            variant = 'destructive'
            break
          default:
            variant = 'outline'
        }

        return h(Badge, { variant, class: className }, () => status)
      },
    },
    { header: '订单号', accessorFn: row => getOrder(row.order_no, row.order_item_no) },
    // ... existing code ...
    { header: '提单号', accessorKey: 'bill_no' },
    {
      header: '开单名称',
      accessorFn: row => row.ship_customer ? `${row.billing_name}/${row.ship_customer}` : row.billing_name,
    },
    { header: '车船号', accessorKey: 'veh_ves_name' },
    { header: '目的地', accessorKey: 'ship_to' },
    {
      header: '发运块数',
      accessorFn: row => showNotSent.value ? 0 : row.send_num,
    },
    {
      header: '发运重量',
      accessorFn: (row) => {
        if (showNotSent.value) {
          return row.block_num > 0 ? (row.left_num * row.weight) : row.left_num
        }
        return row.send_weight
      },
      cell: ({ getValue }) => Number(getValue()).toFixed(3),
    },
  ]

  // Privilege Check for Price Columns
  if (user.value?.privilege === '11111111') {
    cols.push(
      { header: '客户单价', accessorKey: 'price' },
      { header: '南钢单价', accessorKey: 'collection_price' },
      { header: '应付单价', accessorKey: 'veh_ves_price' },
    )
  }

  cols.push(
    { header: '发货日期', accessorFn: row => formatDate(row.inv_ship_date || '') },
    { header: '发货人', accessorKey: 'inv_shipper' },
    { header: '运单号', accessorKey: 'inv_no' },
    { header: '发货仓库', accessorKey: 'ship_warehouse' },
    { header: '牌号', accessorKey: 'brand_no' },
    { header: '规格', accessorFn: row => `${row.thickness}*${row.width}*${row.len}` },
    { header: '尺寸', accessorKey: 'size_type' },
    { header: '总块数', accessorKey: 'block_num' },
    { header: '总重量', accessorKey: 'total_weight', cell: ({ getValue }) => Number(getValue()).toFixed(3) },
    { header: '合同号', accessorKey: 'contract_no' },
    { header: '销售部门', accessorKey: 'sales_dep' },
    { header: '创建日期', accessorFn: row => formatDate(row.create_date) },
    { header: '创建人', accessorKey: 'creater' },
  )

  return cols
})

// Summary
const totalNum = computed(() => {
  return bills.value.reduce((sum, b) => sum + (showNotSent.value ? 0 : b.send_num), 0)
})

const totalWeight = computed(() => {
  return bills.value.reduce((sum, b) => {
    const w = showNotSent.value
      ? (b.block_num > 0 ? (b.left_num * b.weight) : b.left_num)
      : b.send_weight
    return sum + (w || 0)
  }, 0)
})

// Data Table Helper
const table = generateVueTable({
  data: bills,
  columns: columns.value,
})

// Export
const { exportFromAOAWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

async function handleExport() {
  loading.value = true
  try {
    // Fetch all data
    const params: any = {
      fName: filter.billingName ? [filter.billingName] : undefined,
      fVeh: filter.vehicle ? [filter.vehicle] : undefined,
      fVehMode: filter.vehicleMode || undefined,
      fDest: filter.destination ? [filter.destination] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      isExport: true,
    }

    if (!showNotSent.value && filter.startDate && filter.endDate) {
      params.fDate1 = new Date(filter.startDate).toISOString()
      params.fDate2 = new Date(filter.endDate).toISOString()
    }

    const res = await getIntegratedQuery(params)
    if (!res.ok || !res.bills) {
      toast.error('导出失败: 获取数据错误')
      return
    }

    const exportBills = res.bills
    const headers = columns.value.map(c => (c as any).header as string)
    const data = exportBills.map((bill) => {
      const w = (bill.block_num > 0 ? (bill.left_num * bill.weight) : bill.left_num)

      const getSettleState = () => {
        if (bill.inv_settle_flag === 0) {
          if (bill.collection_price < 0 && bill.price < 0)
            return '客户，代收都不需要结算'
          if (bill.collection_price < 0)
            return '客户未结算，代收不需要结算'
          return '客户，代收都未结算'
        }
        else if (bill.inv_settle_flag === 1) {
          if (bill.collection_price < 0)
            return `客户已结算，代收不需要结算 - ${bill.status_2 || ''}`
          return `客户已结算，代收未结算 - ${bill.status_2 || ''}`
        }
        else if (bill.inv_settle_flag === 2) {
          if (bill.price < 0)
            return `客户不需要结算，代收已结算 - ${bill.status_2 || ''}`
          return `代收已结算，客户未结算 - ${bill.status_2 || ''}`
        }
        else if (bill.inv_settle_flag === 3) {
          return `客户，代收付都已结算 - ${bill.status_2 || ''}`
        }
        return ''
      }

      const row: any[] = []

      if (showNotSent.value) {
        row.push('')
        row.push(bill.status)
        row.push(getOrder(bill.order_no, bill.order_item_no))
        row.push(bill.bill_no)
        row.push(bill.billing_name)
        row.push('')
        row.push('')
        row.push(0)
        row.push(w)
        if (user.value?.privilege === '11111111') {
          row.push(getStrValue(bill.price))
          row.push(getStrValue(bill.collection_price))
          row.push(getStrValue(bill.veh_ves_price))
        }
        row.push('')
        row.push('')
        row.push('')
      }
      else {
        row.push(getSettleState())
        row.push(bill.status)
        row.push(getOrder(bill.order_no, bill.order_item_no))
        row.push(bill.bill_no)
        row.push(bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name)
        row.push(bill.veh_ves_name)
        row.push(bill.ship_to)
        row.push(bill.send_num)
        row.push(bill.send_weight)
        if (user.value?.privilege === '11111111') {
          row.push(getStrValue(bill.price))
          row.push(getStrValue(bill.collection_price))
          row.push(getStrValue(bill.veh_ves_price))
        }
        row.push(formatDate(bill.inv_ship_date || ''))
        row.push(bill.inv_shipper)
        row.push(bill.inv_no)
      }

      row.push(bill.ship_warehouse)
      row.push(bill.brand_no)
      row.push(`${bill.thickness}*${bill.width}*${bill.len}`)
      row.push(bill.size_type)
      row.push(bill.block_num)
      row.push(bill.total_weight)
      row.push(bill.contract_no)
      row.push(bill.sales_dep)
      row.push(formatDate(bill.create_date))
      row.push(bill.creater)

      return row
    })

    const aoa = [headers, ...data]
    await exportFromAOAWithPicker(aoa, `综合查询_${new Date().toISOString().slice(0, 10)}`, '综合查询')
  }
  catch (e: any) {
    toast.error('导出出错', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

async function handleExportAccount() {
  loading.value = true
  try {
    const params: any = {
      fName: filter.billingName ? [filter.billingName] : undefined,
      fVeh: filter.vehicle ? [filter.vehicle] : undefined,
      fVehMode: filter.vehicleMode || undefined,
      fDest: filter.destination ? [filter.destination] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      isExport: true,
    }

    if (!showNotSent.value && filter.startDate && filter.endDate) {
      params.fDate1 = new Date(filter.startDate).toISOString()
      params.fDate2 = new Date(filter.endDate).toISOString()
    }

    const res = await getIntegratedQuery(params)
    if (!res.ok || !res.bills) {
      toast.error('导出失败: 获取数据错误')
      return
    }
    const exportBills = res.bills

    const headers = ['状态', '订单号', '提单号', '开单名称', '车船号', '目的地', '发运块数', '发运重量', '总块 数', '总重量', '发货日期', '发货人', '运单号', '发货仓库', '牌号', '厚', '宽', '长', '尺寸', '合同号', '销售部门', '创建日期', '创建人', '结算状态']
    const data: any[] = []

    let prevBill: IntegratedQueryBill | null = null

    const sameBill = (b1: IntegratedQueryBill, b2: IntegratedQueryBill) => {
      return b1.bill_no === b2.bill_no && b1.order_no === b2.order_no && b1.order_item_no === b2.order_item_no
    }

    for (let i = 0; i < exportBills.length; ++i) {
      const bill = exportBills[i]
      let settleState = ''
      if (bill.settle_flag === 0)
        settleState = '未结算'
      else if (bill.settle_flag === 1)
        settleState = '客户结算'
      else if (bill.settle_flag === 2)
        settleState = '代收付结算'
      else if (bill.settle_flag === 3)
        settleState = '客户,代收付结算'

      const name = bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name
      const same = !!prevBill && sameBill(prevBill, bill)

      if (!same && prevBill && prevBill.left_num > 0) {
        const leftW = prevBill.block_num && prevBill.block_num > 0
          ? prevBill.left_num * prevBill.weight
          : prevBill.left_num

        data.push([
          prevBill.status,
          getOrder(prevBill.order_no, prevBill.order_item_no),
          prevBill.bill_no,
          name,
          '',
          '',
          0,
          0,
          prevBill.block_num,
          leftW,
          '',
          '',
          '',
          prevBill.ship_warehouse,
          prevBill.brand_no,
          prevBill.thickness,
          prevBill.width,
          prevBill.len,
          prevBill.size_type,
          prevBill.contract_no,
          prevBill.sales_dep,
          formatDate(prevBill.create_date),
          prevBill.creater,
          settleState,
        ])
      }

      let tWeight = 0
      if (!same) {
        if (bill.block_num && bill.block_num > 0) {
          if (bill.left_num !== bill.block_num) {
            tWeight = (bill.block_num - bill.left_num) * bill.weight
          }
          else {
            tWeight = bill.total_weight
          }
        }
        else {
          if (bill.left_num !== bill.total_weight) {
            tWeight = bill.total_weight - bill.left_num
          }
          else {
            tWeight = bill.total_weight
          }
        }
      }

      data.push([
        bill.status,
        getOrder(bill.order_no, bill.order_item_no),
        bill.bill_no,
        name,
        bill.veh_ves_name,
        bill.ship_to,
        bill.send_num,
        bill.send_weight,
        bill.block_num,
        tWeight,
        formatDate(bill.inv_ship_date || ''),
        bill.inv_shipper,
        bill.inv_no,
        bill.ship_warehouse,
        bill.brand_no,
        bill.thickness,
        bill.width,
        bill.len,
        bill.size_type,
        bill.contract_no,
        bill.sales_dep,
        formatDate(bill.create_date),
        bill.creater,
        settleState,
      ])

      prevBill = bill
    }

    const aoa = [headers, ...data]
    await exportFromAOAWithPicker(aoa, `对账数据_${new Date().toISOString().slice(0, 10)}`, '对账数据')
  }
  catch (e: any) {
    toast.error('导出出错', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// Search Functions for Comboboxes
async function searchBillingNames(search: string, limit: number, page: number) {
  return getCompanies({ search, limit, page })
}
async function searchVehiclesFn(search: string, limit: number, page: number) {
  return getVehicles({ search, limit, page })
}
async function searchDestinationsFn(search: string, limit: number, page: number) {
  return getDestinations({ search, limit, page })
}

// 移动端需要的方法
function updateFilter(newFilter: typeof filter) {
  Object.assign(filter, newFilter)
}

function updateShowNotSent(val: boolean) {
  showNotSent.value = val
}

function updateShowDestForVessel(val: boolean) {
  showDestForVessel.value = val
}

// 权限检查
const hasPrivilege = computed(() => user.value?.privilege === '11111111')

// Watchers for "Show Not Sent"
watch(showNotSent, (val) => {
  if (val) {
    showDestForVessel.value = false
    // Clear filters that are disabled in old code
    filter.vehicle = ''
    filter.destination = ''
    filter.startDate = ''
    filter.endDate = ''
    filter.customer = ''
    filter.vehicleMode = ''
  }
})

// Pagination
function handlePageChange(p: number) {
  page.value = p
  handleQuery(false)
}
</script>

<template>
  <!-- 移动端视图 -->
  <IntegratedMobile
    v-if="isMobile"
    :loading="loading"
    :bills="bills"
    :total="total"
    :total-num="totalNum"
    :total-weight="totalWeight"
    :show-not-sent="showNotSent"
    :show-dest-for-vessel="showDestForVessel"
    :filter="filter"
    :customers="customers"
    :vehicle-modes="vehicleModes"
    :page="page"
    :limit="limit"
    :has-privilege="hasPrivilege"
    :search-billing-names="searchBillingNames"
    :search-vehicles-fn="searchVehiclesFn"
    :search-destinations-fn="searchDestinationsFn"
    @update:filter="updateFilter"
    @update:show-not-sent="updateShowNotSent"
    @update:show-dest-for-vessel="updateShowDestForVessel"
    @query="handleQuery"
    @reset="handleReset"
    @export="handleExport"
    @export-account="handleExportAccount"
    @page-change="handlePageChange"
  />

  <!-- 桌面端视图 -->
  <BasicPage v-else title="综合查询" description="综合查询提单、运单及发货情况">
    <template #actions>
      <UiButton variant="outline" size="sm" @click="handleExportAccount">
        <FileSpreadsheet class="w-4 h-4 mr-1" />
        导出对账数据
      </UiButton>
      <UiButton variant="outline" size="sm" @click="handleExport">
        <Download class="w-4 h-4 mr-1" />
        导出
      </UiButton>
    </template>

    <!-- Filters -->
    <div class="mb-4 p-4 border rounded-lg bg-muted/30 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Row 1 -->
        <div class="relative w-full">
          <SearchableCombobox
            v-model="filter.billingName"
            :search-fn="searchBillingNames"
            placeholder="开单名称"
            class="w-full"
          />
          <X v-if="filter.billingName" class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.billingName = ''" />
        </div>

        <div class="relative w-full">
          <UiSelect v-model="filter.customer" :disabled="showNotSent || customers.length === 0">
            <UiSelectTrigger class="w-full">
              <UiSelectValue placeholder="发货单位" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="c in customers" :key="c" :value="c">
                {{ c }}
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <X v-if="filter.customer && !showNotSent" class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.customer = ''" />
        </div>

        <div class="relative w-full">
          <UiInput v-model="filter.orderNo" placeholder="订单号" class="w-full pr-8" />
          <X v-if="filter.orderNo" class="absolute right-2 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.orderNo = ''" />
        </div>

        <div class="relative w-full">
          <UiInput v-model="filter.billNo" placeholder="提单号" class="w-full pr-8" />
          <X v-if="filter.billNo" class="absolute right-2 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.billNo = ''" />
        </div>

        <!-- Row 2 -->
        <div class="relative w-full">
          <SearchableCombobox
            v-model="filter.vehicle"
            :search-fn="searchVehiclesFn"
            placeholder="车船号"
            :disabled="showNotSent"
            class="w-full"
          />
          <X v-if="filter.vehicle && !showNotSent" class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.vehicle = ''" />
        </div>

        <div class="relative w-full">
          <UiSelect v-model="filter.vehicleMode" :disabled="showNotSent">
            <UiSelectTrigger class="w-full">
              <UiSelectValue placeholder="运输方式" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="m in vehicleModes" :key="m" :value="m">
                {{ m }}
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <X v-if="filter.vehicleMode && !showNotSent" class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.vehicleMode = ''" />
        </div>

        <div class="relative w-full">
          <SearchableCombobox
            v-model="filter.destination"
            :search-fn="searchDestinationsFn"
            placeholder="目的地"
            :disabled="showNotSent"
            class="w-full"
          />
          <X v-if="filter.destination && !showNotSent" class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10" @click="filter.destination = ''" />
        </div>

        <div class="hidden lg:block" /> <!-- Spacer for Row 2, Col 4 -->

        <!-- Row 3 -->
        <div class="relative w-full">
          <DatePicker
            v-model="filter.startDate"
            placeholder="发货日期(开始)"
            :disabled-date="disableStartDate"
            disabled-hint="开始日期不能晚于结束日期"
            class="w-full"
          />
          <X
            v-if="filter.startDate && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click.stop="filter.startDate = ''"
          />
        </div>

        <div class="relative w-full">
          <DatePicker
            v-model="filter.endDate"
            placeholder="发货日期(结束)"
            :disabled-date="disableEndDate"
            disabled-hint="结束日期不能早于开始日期"
            class="w-full"
          />
          <X
            v-if="filter.endDate && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click.stop="filter.endDate = ''"
          />
        </div>

        <!-- Checkboxes & Button (Spans 2 cols) -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 col-span-1 md:col-span-2 lg:col-span-2">
          <div class="flex items-center gap-2">
            <UiCheckbox id="showNotSent" v-model:checked="showNotSent" />
            <label for="showNotSent" class="text-sm cursor-pointer whitespace-nowrap">未配发</label>
          </div>
          <div class="flex items-center gap-2">
            <UiCheckbox
              id="showDestForVessel"
              v-model:checked="showDestForVessel"
              :disabled="showNotSent"
            />
            <label for="showDestForVessel" class="text-sm cursor-pointer whitespace-nowrap">目的地为船</label>
          </div>
          <div class="flex-1" />
          <UiButton variant="outline" size="icon" title="重置" @click="handleReset">
            <RefreshCcw class="h-4 w-4" />
          </UiButton>
          <UiButton :disabled="loading" class="w-full sm:w-auto min-w-[100px]" @click="handleQuery(true)">
            <UiSpinner v-if="loading" class="mr-2" />
            <template v-else>
              <Search class="w-4 h-4 mr-1" />
              查询确定
            </template>
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div class="mb-4 flex gap-6 text-sm text-muted-foreground border p-3 rounded bg-muted/10">
      <span>当前行数: <strong class="text-foreground">{{ bills.length }}</strong> (共 {{ total }})</span>
      <span v-if="!showNotSent">发运块数: <strong class="text-foreground">{{ totalNum }}</strong></span>
      <span>{{ showNotSent ? '未配发重量' : '发运重量' }}: <strong class="text-foreground">{{ totalWeight.toFixed(3) }}</strong></span>
    </div>

    <!-- Table -->
    <div class="border rounded-md overflow-hidden">
      <DataTable
        :table="table"
        :columns="columns"
        :data="bills"
        :loading="loading"
        :server-pagination="{
          page,
          pageSize: limit,
          total,
          onPageChange: handlePageChange,
          onPageSizeChange: (s) => { limit = s; handlePageChange(1) },
        }"
      />
    </div>
  </BasicPage>

  <!-- 导出对话框（移动端和桌面端共用） -->
  <ExportDialog
    v-model:open="showExportDialog"
    :default-file-name="exportFileName"
    @confirm="confirmExport"
  />
</template>

<route lang="yaml">
meta:
  auth: true
</route>
