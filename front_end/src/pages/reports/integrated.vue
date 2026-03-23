<script setup lang="ts">
// @ts-nocheck
import type { ColumnDef } from '@tanstack/vue-table'

import { Download, FileSpreadsheet, RefreshCcw, Search, Settings2, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, h, reactive, ref, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { IntegratedQueryBill } from '@/services/api/report.api'

import dayjs from 'dayjs'
import { useDevice } from '@/composables/use-device'
import { formatDate, sortByOrder, toExcelDate, toExcelNum } from '@/utils/format'
import IntegratedMobile from './components/IntegratedMobile.vue'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getCompanies, getDestinations, getVehicles } from '@/services/api/data-dict.api'
import { getIntegratedQuery } from '@/services/api/report.api'
import { useAuthStore } from '@/stores/auth'
import { hasPermission, isAdmin, PERMISSIONS } from '@/constants/permissions'

const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const canSeePrice = computed(() => hasPermission(user.value?.privilege ?? [], PERMISSIONS.SEE_PRICE))

// 设备检测
const { isMobile } = useDevice()

// State
const loading = ref(false)
const bills = ref<IntegratedQueryBill[]>([])
const showNotSent = ref(false)
const showDestForVessel = ref(false)
const page = ref(1)
const limit = ref(10)
const total = ref(0)

// Filters
const filter = reactive({
  billingName: '',
  vehicle: '',
  vehicleMode: '',
  destination: '',
  origin: '',
  customer: '',
  orderNo: '',
  billNo: '',
  startDate: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
})

// Options
const vehicleModes = ['外挂', '自有']
const customers = ref<string[]>([])

// Dependent Select: Billing Name -> Customer
watch(
  () => filter.billingName,
  async (newVal) => {
    customers.value = []
    filter.customer = ''
    if (newVal) {
      try {
        const res = await getCompanies({ search: newVal, limit: 20 })
        if (res.ok && res.data.length > 0) {
          // 优先精确匹配，其次模糊匹配（Company名称可能带编号前缀）
          const company = res.data.find((c: any) => c.name === newVal)
            || res.data.find((c: any) => c.name.includes(newVal) || newVal.includes(c.name))
          customers.value = company?.customers || []
        }
      } catch (e) {
        console.error(e)
      }
    }
  },
)

// Reset
function handleReset() {
  filter.billingName = ''
  filter.vehicle = ''
  filter.vehicleMode = ''
  filter.destination = ''
  filter.origin = ''
  filter.customer = ''
  filter.orderNo = ''
  filter.billNo = ''
  filter.startDate = dayjs().subtract(1, 'month').format('YYYY-MM-DD')
  filter.endDate = dayjs().format('YYYY-MM-DD')
  showNotSent.value = false
  showDestForVessel.value = false
  handleQuery(true)
}

// Query
async function handleQuery(resetPage = true) {
  if (resetPage) {
    page.value = 1
  }

  loading.value = true
  try {
    const params: any = {
      fName: filter.billingName ? [filter.billingName] : undefined,
      fVeh: filter.vehicle ? [filter.vehicle] : undefined,
      fVehMode: filter.vehicleMode || undefined,
      fDest: filter.destination ? [filter.destination] : undefined,
      fFrom: filter.origin ? [filter.origin] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      page: page.value,
      limit: limit.value,
    }

    if (filter.startDate && filter.endDate) {
      // Ensure ISO format as backend expects
      params.fDate1 = dayjs(filter.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
      params.fDate2 = dayjs(filter.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    }

    const res = await getIntegratedQuery(params)
    if (res.ok) {
      bills.value = res.bills || []
      total.value = res.total || 0
      // 优先使用服务端全量汇总，若服务端未返回则退回当页计算
      if (res.totalSendNum !== undefined || res.totalSendWeight !== undefined || res.totalUnsendWeight !== undefined) {
        totalNum.value = res.totalSendNum ?? 0
        totalWeight.value = showNotSent.value ? (res.totalUnsendWeight ?? 0) : (res.totalSendWeight ?? 0)
      } else {
        totalNum.value = (res.bills || []).reduce((sum, b) => sum + (showNotSent.value ? 0 : (b.send_num || 0)), 0)
        totalWeight.value = (res.bills || []).reduce((sum, b) => {
          const w = showNotSent.value
            ? (b.block_num > 0 ? (b.left_num || 0) * (b.weight || 0) : (b.left_num || 0))
            : (!b.send_weight && b.block_num > 0 ? (b.send_num || 0) * (b.weight || 0) : (b.send_weight || 0))
          return sum + w
        }, 0)
      }
      if (resetPage) {
        toast.success(`查询成功，共 ${total.value} 条记录`)
      }
    } else {
      toast.error('查询失败')
    }
  } catch (e: any) {
    toast.error('查询出错', { description: e.message })
  } finally {
    loading.value = false
  }
}

// Data Processing Helpers
function getStrByStatus(status: string, defaultVal: string) {
  return status || defaultVal
}

function getOrder(orderNo: string, itemNo: string) {
  if (itemNo) return `${orderNo}-${itemNo}`
  return orderNo
}

function getStrValue(val: any) {
  return val === undefined || val === null ? '' : val
}

function toExcelDateTimeMinute(date: string | Date | null | undefined) {
  if (!date) return ''
  const d = dayjs(date)
  if (!d.isValid()) return ''
  return d.format('YYYY-MM-DD HH:mm')
}


// Columns
const columns = computed<ColumnDef<IntegratedQueryBill>[]>(() => {
  const cols: ColumnDef<IntegratedQueryBill>[] = [
    {
      id: 'settleStatus',
      header: '已配发的结算状态',
      accessorFn: (row) => {
        if (showNotSent.value) return ''
        // Logic from integ_query.js
        if (row.inv_settle_flag === 0) {
          if (row.collection_price < 0 && row.price < 0) return '客户，代收都不需要结算'
          if (row.price < 0) return '客户不需要结算，代收未结算'
          if (row.collection_price < 0) return '客户未结算，代收不需要结算'
          return '客户，代收都未结算'
        } else if (row.inv_settle_flag === 1) {
          if (row.collection_price < 0) return `客户已结算，代收不需要结算 - ${row.status_2 || ''}`
          return `客户已结算，代收未结算 - ${row.status_2 || ''}`
        } else if (row.inv_settle_flag === 2) {
          if (row.price < 0) return `客户不需要结算，代收已结算 - ${row.status_2 || ''}`
          return `代收已结算，客户未结算 - ${row.status_2 || ''}`
        } else if (row.inv_settle_flag === 3) {
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
    { id: 'orderNo', header: '订单号', accessorFn: (row) => getOrder(row.order_no, row.order_item_no) },
    { header: '提单号', accessorKey: 'bill_no' },
    {
      id: 'billingName',
      header: '开单名称',
      accessorFn: (row) => (row.ship_customer ? `${row.billing_name}/${row.ship_customer}` : row.billing_name),
    },
    {
      header: '车船号',
      accessorKey: 'veh_ves_name',
      cell: ({ row }) => {
        const name = row.original.veh_ves_name || ''
        const mode = row.original.veh_mode
        if (!mode || !name) return name
        const label = mode === '自有' ? '自' : '外'
        const cls = mode === '自有'
          ? 'bg-blue-100 text-blue-700 border-transparent'
          : 'bg-orange-100 text-orange-700 border-transparent'
        return h('span', { class: 'inline-flex items-center gap-1' }, [
          name,
          h(Badge, { variant: 'secondary', class: `${cls} text-[10px] px-1 py-0 leading-tight` }, () => label),
        ])
      },
    },
    { header: '目的地', accessorKey: 'ship_to' },
    {
      id: 'sendNum',
      header: '发运块数',
      accessorFn: (row) => (showNotSent.value ? 0 : row.send_num),
      meta: { fixedWidth: '80px' },
    },
    {
      id: 'sendWeight',
      header: '发运重量',
      accessorFn: (row) => {
        if (showNotSent.value) {
          return row.block_num > 0 ? row.left_num * row.weight : row.left_num
        }
        return row.send_weight
      },
      cell: ({ getValue }) => Number(getValue()).toFixed(3),
      meta: { fixedWidth: '90px' },
    },
  ]

  // Privilege Check for Price Columns
  if (canSeePrice.value) {
    cols.push(
      { header: '客户单价', accessorKey: 'price', meta: { fixedWidth: '80px' } },
      { header: '南钢单价', accessorKey: 'collection_price', meta: { fixedWidth: '80px' } },
      { header: '应付单价', accessorKey: 'veh_ves_price', meta: { fixedWidth: '80px' } },
    )
  }

  cols.push(
    { id: 'shipDate', header: '发货日期', accessorFn: (row) => formatDate(row.inv_ship_date || ''), meta: { fixedWidth: '100px' } },
    { header: '发货人', accessorKey: 'inv_shipper', meta: { fixedWidth: '70px' } },
    { header: '运单号', accessorKey: 'inv_no', cell: ({ getValue }) => h('span', { class: 'text-xs whitespace-nowrap' }, getValue() as string) },
    { header: '发货仓库', accessorKey: 'ship_warehouse', meta: { fixedWidth: '80px' } },
    {
      header: '牌号',
      accessorKey: 'brand_no',
      cell: ({ getValue }) => h('span', { class: 'block whitespace-normal line-clamp-2', style: 'min-width:180px' }, getValue() as string),
    },
    { id: 'spec', header: '规格', accessorFn: (row) => `${row.thickness}*${row.width}*${row.len}`, meta: { fixedWidth: '100px' } },
    { header: '尺寸', accessorKey: 'size_type', meta: { fixedWidth: '60px' } },
    { header: '总块数', accessorKey: 'block_num', meta: { fixedWidth: '70px' } },
    { header: '总重量', accessorKey: 'total_weight', cell: ({ getValue }) => Number(getValue()).toFixed(3), meta: { fixedWidth: '90px' } },
    { header: '合同号', accessorKey: 'contract_no' },
    { header: '销售部门', accessorKey: 'sales_dep', meta: { fixedWidth: '80px' } },
    { id: 'createDate', header: '创建日期', accessorFn: (row) => formatDate(row.create_date), meta: { fixedWidth: '100px' } },
    { header: '创建人', accessorKey: 'creater', meta: { fixedWidth: '70px' } },
  )

  return cols
})

// Summary — 全量汇总由服务端返回，分页时不重新计算
const totalNum = ref(0)
const totalWeight = ref(0)

// 当前页小计（用于与全部合计对照）
const pageNum = computed(() =>
  bills.value.reduce((sum, b) => sum + (showNotSent.value ? 0 : (b.send_num || 0)), 0)
)
const pageWeight = computed(() =>
  bills.value.reduce((sum, b) => {
    const w = showNotSent.value
      ? (b.block_num > 0 ? (b.left_num || 0) * (b.weight || 0) : (b.left_num || 0))
      : (!b.send_weight && b.block_num > 0 ? (b.send_num || 0) * (b.weight || 0) : (b.send_weight || 0))
    return sum + w
  }, 0)
)

// Data Table Helper
const serverPagination = computed(() => ({
  page: page.value,
  pageSize: limit.value,
  total: total.value,
  onPageChange: handlePageChange,
  onPageSizeChange: (s: number) => {
    limit.value = s
    handlePageChange(1)
  },
}))

const table = generateVueTable(reactive({
  data: toRef(bills),
  columns,
  serverPagination,
}))

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
      fFrom: filter.origin ? [filter.origin] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      isExport: true,
    }

    if (filter.startDate && filter.endDate) {
      params.fDate1 = dayjs(filter.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
      params.fDate2 = dayjs(filter.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    }

    const res = await getIntegratedQuery(params)
    if (!res.ok || !res.bills) {
      toast.error('导出失败: 获取数据错误')
      return
    }

    // 按订单号排序
    const exportBills = sortByOrder(res.bills)
    const headers = columns.value.map((c) => (c as any).header as string)
    // 在"车船号"后插入"车船类型"（仅导出，表格不显示此列）
    const vehIdx = headers.indexOf('车船号')
    if (vehIdx >= 0) headers.splice(vehIdx + 1, 0, '车船类型')
    const data = exportBills.map((bill) => {
      const w = bill.block_num > 0 ? bill.left_num * bill.weight : bill.left_num

      const getSettleState = () => {
        if (bill.inv_settle_flag === 0) {
          if (bill.collection_price < 0 && bill.price < 0) return '客户，代收都不需要结算'
          if (bill.price < 0) return '客户不需要结算，代收未结算'
          if (bill.collection_price < 0) return '客户未结算，代收不需要结算'
          return '客户，代收都未结算'
        } else if (bill.inv_settle_flag === 1) {
          if (bill.collection_price < 0) return `客户已结算，代收不需要结算 - ${bill.status_2 || ''}`
          return `客户已结算，代收未结算 - ${bill.status_2 || ''}`
        } else if (bill.inv_settle_flag === 2) {
          if (bill.price < 0) return `客户不需要结算，代收已结算 - ${bill.status_2 || ''}`
          return `代收已结算，客户未结算 - ${bill.status_2 || ''}`
        } else if (bill.inv_settle_flag === 3) {
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
        row.push('')
        row.push(0)
        row.push(toExcelNum(w))
        if (canSeePrice.value) {
          row.push(toExcelNum(bill.price))
          row.push(toExcelNum(bill.collection_price))
          row.push(toExcelNum(bill.veh_ves_price))
        }
        row.push('')
        row.push('')
        row.push('')
      } else {
        row.push(getSettleState())
        row.push(bill.status)
        row.push(getOrder(bill.order_no, bill.order_item_no))
        row.push(bill.bill_no)
        row.push(bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name)
        row.push(bill.veh_ves_name)
        row.push(bill.veh_mode || '')
        row.push(bill.ship_to)
        row.push(toExcelNum(bill.send_num))
        row.push(toExcelNum(bill.send_weight))
        if (canSeePrice.value) {
          row.push(toExcelNum(bill.price))
          row.push(toExcelNum(bill.collection_price))
          row.push(toExcelNum(bill.veh_ves_price))
        }
        row.push(toExcelDateTimeMinute(bill.inv_ship_date))
        row.push(bill.inv_shipper)
        row.push(bill.inv_no)
      }

      row.push(bill.ship_warehouse)
      row.push(bill.brand_no)
      row.push(`${bill.thickness}*${bill.width}*${bill.len}`)
      row.push(bill.size_type)
      row.push(toExcelNum(bill.block_num))
      row.push(toExcelNum(bill.total_weight))
      row.push(bill.contract_no)
      row.push(bill.sales_dep)
      row.push(toExcelDate(bill.create_date))
      row.push(bill.creater)

      return row
    })

    const aoa = [headers, ...data]
    await exportFromAOAWithPicker(aoa, `综合查询_${new Date().toISOString().slice(0, 10)}`, '综合查询')
  } catch (e: any) {
    toast.error('导出出错', { description: e.message })
  } finally {
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
      fFrom: filter.origin ? [filter.origin] : undefined,
      fCustomerName: filter.customer || undefined,
      fBno: filter.billNo || undefined,
      fOrder: filter.orderNo || undefined,
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel.value ? 1 : 0,
      fShowUnsend: showNotSent.value ? 1 : 0,
      isExport: true,
    }

    if (filter.startDate && filter.endDate) {
      params.fDate1 = dayjs(filter.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
      params.fDate2 = dayjs(filter.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    }

    const res = await getIntegratedQuery(params)
    if (!res.ok || !res.bills) {
      toast.error('导出失败: 获取数据错误')
      return
    }
    // 按订单号排序
    const exportBills = sortByOrder(res.bills)

    const headers = [
      '状态',
      '订单号',
      '提单号',
      '开单名称',
      '车船号',
      '车船类型',
      '目的地',
      '发运块数',
      '发运重量',
      '总块 数',
      '总重量',
      '发货日期',
      '发货人',
      '运单号',
      '发货仓库',
      '牌号',
      '厚',
      '宽',
      '长',
      '尺寸',
      '合同号',
      '销售部门',
      '创建日期',
      '创建人',
      '结算状态',
    ]
    const data: any[] = []

    let prevBill: IntegratedQueryBill | null = null

    const sameBill = (b1: IntegratedQueryBill, b2: IntegratedQueryBill) => {
      return b1.bill_no === b2.bill_no && b1.order_no === b2.order_no && b1.order_item_no === b2.order_item_no
    }

    for (let i = 0; i < exportBills.length; ++i) {
      const bill = exportBills[i]
      let settleState = ''
      if (bill.settle_flag === 0) settleState = '未结算'
      else if (bill.settle_flag === 1) settleState = '客户结算'
      else if (bill.settle_flag === 2) settleState = '代收付结算'
      else if (bill.settle_flag === 3) settleState = '客户,代收付结算'

      const name = bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name
      const same = !!prevBill && sameBill(prevBill, bill)

      if (!same && prevBill && prevBill.left_num > 0) {
        const leftW =
          prevBill.block_num && prevBill.block_num > 0 ? prevBill.left_num * prevBill.weight : prevBill.left_num

        data.push([
          prevBill.status,
          getOrder(prevBill.order_no, prevBill.order_item_no),
          prevBill.bill_no,
          name,
          '',
          '',
          '',
          0,
          0,
          toExcelNum(prevBill.block_num),
          toExcelNum(leftW),
          '',
          '',
          '',
          prevBill.ship_warehouse,
          prevBill.brand_no,
          toExcelNum(prevBill.thickness),
          toExcelNum(prevBill.width),
          toExcelNum(prevBill.len),
          prevBill.size_type,
          prevBill.contract_no,
          prevBill.sales_dep,
          toExcelDate(prevBill.create_date),
          prevBill.creater,
          settleState,
        ])
      }

      let tWeight = 0
      if (!same) {
        if (bill.block_num && bill.block_num > 0) {
          if (bill.left_num !== bill.block_num) {
            tWeight = (bill.block_num - bill.left_num) * bill.weight
          } else {
            tWeight = bill.total_weight
          }
        } else {
          if (bill.left_num !== bill.total_weight) {
            tWeight = bill.total_weight - bill.left_num
          } else {
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
        bill.veh_mode || '',
        bill.ship_to,
        toExcelNum(bill.send_num),
        toExcelNum(bill.send_weight),
        toExcelNum(bill.block_num),
        toExcelNum(tWeight),
        toExcelDateTimeMinute(bill.inv_ship_date),
        bill.inv_shipper,
        bill.inv_no,
        bill.ship_warehouse,
        bill.brand_no,
        toExcelNum(bill.thickness),
        toExcelNum(bill.width),
        toExcelNum(bill.len),
        bill.size_type,
        bill.contract_no,
        bill.sales_dep,
        toExcelDate(bill.create_date),
        bill.creater,
        settleState,
      ])

      prevBill = bill
    }

    const aoa = [headers, ...data]
    await exportFromAOAWithPicker(aoa, `对账数据_${new Date().toISOString().slice(0, 10)}`, '对账数据')
  } catch (e: any) {
    toast.error('导出出错', { description: e.message })
  } finally {
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
async function searchOriginsFn(search: string, limit: number, page: number) {
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
const hasPrivilege = computed(() => isAdmin(user.value?.privilege ?? []))

// Watchers for "Show Not Sent"
watch(showNotSent, (val) => {
  if (val) {
    showDestForVessel.value = false
    // Clear filters that are disabled in old code
    filter.vehicle = ''
    filter.destination = ''
    filter.origin = ''
    filter.customer = ''
    filter.vehicleMode = ''
  } else {
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
    :search-origins-fn="searchOriginsFn"
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
          <X
            v-if="filter.billingName"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.billingName = ''"
          />
        </div>

        <div class="relative w-full">
          <UiSelect v-model="filter.customer" :disabled="showNotSent || customers.length === 0">
            <UiSelectTrigger class="w-full">
              <UiSelectValue placeholder="发货单位" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="c in customers" :key="c" :value="c"> {{ c }} </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <X
            v-if="filter.customer && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.customer = ''"
          />
        </div>

        <div class="relative w-full">
          <UiInput v-model="filter.orderNo" placeholder="订单号" class="w-full pr-8" />
          <X
            v-if="filter.orderNo"
            class="absolute right-2 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.orderNo = ''"
          />
        </div>

        <div class="relative w-full">
          <UiInput v-model="filter.billNo" placeholder="提单号" class="w-full pr-8" />
          <X
            v-if="filter.billNo"
            class="absolute right-2 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.billNo = ''"
          />
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
          <X
            v-if="filter.vehicle && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.vehicle = ''"
          />
        </div>

        <div class="relative w-full">
          <UiSelect v-model="filter.vehicleMode" :disabled="showNotSent">
            <UiSelectTrigger class="w-full">
              <UiSelectValue placeholder="车船类型" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="m in vehicleModes" :key="m" :value="m"> {{ m }} </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <X
            v-if="filter.vehicleMode && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.vehicleMode = ''"
          />
        </div>

        <div class="relative w-full">
          <SearchableCombobox
            v-model="filter.destination"
            :search-fn="searchDestinationsFn"
            placeholder="目的地"
            :disabled="showNotSent"
            class="w-full"
          />
          <X
            v-if="filter.destination && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.destination = ''"
          />
        </div>

        <div class="relative w-full">
          <SearchableCombobox
            v-model="filter.origin"
            :search-fn="searchOriginsFn"
            placeholder="起始地"
            :disabled="showNotSent"
            class="w-full"
          />
          <X
            v-if="filter.origin && !showNotSent"
            class="absolute right-8 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground z-10"
            @click="filter.origin = ''"
          />
        </div>

        <!-- Row 3 -->
        <div class="relative w-full">
          <DatePicker
            v-model="filter.startDate"
            placeholder="发货日期(开始)"
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
            <UiCheckbox id="showNotSent" v-model="showNotSent" />
            <label for="showNotSent" class="text-sm cursor-pointer whitespace-nowrap">未配发</label>
          </div>
          <div class="flex items-center gap-2">
            <UiCheckbox id="showDestForVessel" v-model="showDestForVessel" :disabled="showNotSent" />
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
    <div class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground border p-3 rounded bg-muted/10">
      <!-- 全部合计 -->
      <span>
        记录总数: <strong class="text-foreground">{{ total }}</strong>
      </span>
      <span v-if="!showNotSent">
        发运块数(全部): <strong class="text-foreground">{{ totalNum }}</strong>
      </span>
      <span>
        {{ showNotSent ? '未配发重量(全部)' : '发运重量(全部)' }}:
        <strong class="text-foreground">{{ totalWeight.toFixed(3) }}</strong>
      </span>
      <!-- 分隔 -->
      <span class="text-muted-foreground/40">|</span>
      <!-- 当前页小计 -->
      <span>
        当前页行数: <strong class="text-foreground">{{ bills.length }}</strong>
      </span>
      <span v-if="!showNotSent">
        发运块数(当前页): <strong class="text-foreground">{{ pageNum }}</strong>
      </span>
      <span>
        {{ showNotSent ? '未配发重量(当前页)' : '发运重量(当前页)' }}:
        <strong class="text-foreground">{{ pageWeight.toFixed(3) }}</strong>
      </span>
      <!-- 列设置 -->
      <div class="ml-auto">
        <Popover>
          <PopoverTrigger as-child>
            <UiButton variant="outline" size="sm">
              <Settings2 class="w-4 h-4 mr-1" />
              列设置
            </UiButton>
          </PopoverTrigger>
          <PopoverContent class="w-56" align="end">
            <div class="space-y-2">
              <h4 class="font-medium text-sm mb-3">显示列</h4>
              <div class="space-y-2 max-h-80 overflow-y-auto">
                <label
                  v-for="col in table.getAllLeafColumns()"
                  :key="col.id"
                  class="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    :model-value="col.getIsVisible()"
                    @update:model-value="col.toggleVisibility(!!$event)"
                  />
                  <span class="text-sm">{{ col.columnDef.header }}</span>
                </label>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <!-- Table -->
    <div class="border rounded-md overflow-auto compact-table">
      <DataTable
        :table="table"
        :columns="columns"
        :data="bills"
        :loading="loading"
        :server-pagination="serverPagination"
      />
    </div>
  </BasicPage>

  <!-- 导出对话框（移动端和桌面端共用） -->
  <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />
</template>

<route lang="yaml">
meta:
  auth: true
</route>

<style scoped>
.compact-table :deep(table) {
  table-layout: auto;
}
.compact-table :deep(td) {
  padding: 0.25rem 0.5rem;
  white-space: nowrap;
}
.compact-table :deep(th) {
  padding: 0.25rem 0.5rem;
  height: 2rem;
  white-space: nowrap;
}
</style>
