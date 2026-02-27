<script setup lang="ts">
import dayjs from 'dayjs'
import { Loader2, ShoppingCart, Filter } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ConfirmDialog from '@/components/confirm-dialog.vue'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import * as settleApi from '@/services/api/settle.api'
import { useAuthStore } from '@/stores/auth'

import SettleBasket from './components/SettleBasket.vue'
import VesselBatchPriceInputDialog from './components/VesselBatchPriceInputDialog.vue'
import VesselDelayInfoDialog from './components/VesselDelayInfoDialog.vue'
import VesselDetailDialog from './components/VesselDetailDialog.vue'
import VesselPriceInputDialog from './components/VesselPriceInputDialog.vue'
import VesselPrintDialog from './components/VesselPrintDialog.vue'
import VesselReceiptImageDialog from './components/VesselReceiptImageDialog.vue'
import VesselUploadReceiptDialog from './components/VesselUploadReceiptDialog.vue'
import { useSettleBasket } from './composables/useSettleBasket'
import { hasPermission, PERMISSIONS } from '@/constants/permissions'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = ref(route.query.selfOwned === 'true')

// 监听路由变化
watch(() => route.query.selfOwned, (val) => {
  isSelfOwnedMode.value = val === 'true'
  // 路由变化时重新加载数据
  handleSearch(true)
})

const { exportFromAOAWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// 权限
const hasPrivilegePrice = computed(() => hasPermission(authStore.user?.privilege ?? [], PERMISSIONS.SEE_PRICE))

// 对话框引用
const priceInputDialog = ref<InstanceType<typeof VesselPriceInputDialog>>()
const batchPriceInputDialog = ref<InstanceType<typeof VesselBatchPriceInputDialog>>()
const delayInfoDialog = ref<InstanceType<typeof VesselDelayInfoDialog>>()
const detailDialog = ref<InstanceType<typeof VesselDetailDialog>>()
const printDialog = ref()
const receiptImageDialog = ref()
const uploadReceiptDialog = ref()

// 结算篮功能
const {
  basketItems,
  showBasket,
  basketButtonRef,
  flyingItems,
  basketStatistics,
  isInBasket,
  addToBasket,
  removeFromBasket,
  clearBasket,
  refreshBasketItems,
} = useSettleBasket({
  isSameItem: (item1: any, item2: any) => {
    return (
      item1.waybill_no === item2.waybill_no &&
      item1.veh_name === item2.veh_name &&
      item1.send_weight === item2.send_weight &&
      item1.inner_waybill_no === item2.inner_waybill_no
    )
  },
  getPrice: (item: any) => item.vessel_price || 0,
  allItems: () => tableData.value,
})

// 筛选表单
const showFilter = ref(false)
const filterForm = ref({
  vehicle: '',
  billName: '',
  destination: '',
  startDate: dayjs().subtract(6, 'month').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
  settleState: '未结算',
  receiptState: '2',
  amount: '',
  weight: '',
})

// 筛选选项
// 车辆映射
const vehPersonMap = ref<Record<string, any>>({})

// 发货单位筛选
const showBillNameFilter = ref(false)
const shipFilterSelected = ref<string[]>([])
const billNameFilterOptions = ref<Array<{ value: string; label: string; checked: boolean }>>([])

// 表格数据
const tableData = ref<any[]>([])
const dbRecords = ref<any[]>([])
const selectAll = ref(false)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(100)

const totalPages = computed(() => Math.ceil(tableData.value.length / pageSize.value))

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return tableData.value.slice(start, start + pageSize.value)
})

// 分页控制函数
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

// 统计信息
const totalWeight = ref(0)
const totalAmount = ref(0)
const prePayment = ref(0)
const selectedTotalWeight = ref(0)
const selectedTotalAmount = ref(0)
const allReceiptOk = ref(true)
const allNotNeed = ref(true)

// 按钮显示控制
const showSettleBtn = ref(true)
const showSettleCancelBtn = ref(false)
const showPayBtn = ref(false)
const showPayCancelBtn = ref(false)
const showPrintBtn = ref(false)
const showUnpayBlock = ref(false)
const loading = ref(false)

// 不需要结算确认对话框
const showNotNeedSettleDialog = ref(false)
const pendingNotNeedSettleRow = ref<any>(null)

// 确认对话框状态
const selectVehiclesDialog = ref(false)
const selectVehiclesDialogData = ref<any>(null)

const basketPriceDialog = ref(false)
const basketPriceDialogData = ref<any[]>([])

const batchReceiptDialog = ref(false)

const batchNotNeedDialog = ref(false)

const payTicketDialog = ref(false)
const ticketNo = ref('')

// 计算属性
const selectedRecords = computed(() => tableData.value.filter((row) => row.selected && !row.isSubItem))
const selectedInnerNo = computed(() =>
  tableData.value.filter((row) => row.selected && row.isSubItem).map((row) => row.inner_waybill_no),
)

const canShowDetail = computed(() => selectedRecords.value.length === 1)

// 是否显示结算篮相关按钮（仅在"未结算"状态下显示）
const canShowBasket = computed(() => filterForm.value.settleState === '未结算')

// 初始化
onMounted(() => {
  handleSearch(true)
  // 点击其他地方关闭发货单位筛选面板
  document.addEventListener('click', closeBillNameFilter)
})

// 搜索函数 - 车船号（服务器端动态搜索）
async function searchVehicles(search: string, limit: number, page: number) {
  try {
    const response = await settleApi.searchVehicles(search, limit)
    return response
  } catch (error) {
    console.error('搜索车船号失败:', error)
    return { ok: false, data: [] }
  }
}

// 搜索函数 - 开单名称（服务器端动态搜索）
async function searchBillingNames(search: string, limit: number, page: number) {
  try {
    const response = await settleApi.searchBillingNames(search, limit)
    return response
  } catch (error) {
    console.error('搜索开单名称失败:', error)
    return { ok: false, data: [] }
  }
}

// 搜索函数 - 目的地（服务器端动态搜索）
async function searchDestinations(search: string, limit: number, page: number) {
  try {
    const response = await settleApi.searchDestinations(search, limit)
    return response
  } catch (error) {
    console.error('搜索目的地失败:', error)
    return { ok: false, data: [] }
  }
}

// 查询
async function handleSearch(silent = false) {
  if (
    filterForm.value.startDate &&
    filterForm.value.endDate &&
    dayjs(filterForm.value.startDate).isAfter(dayjs(filterForm.value.endDate))
  ) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  loading.value = true
  if (!silent) toast.loading('正在查询数据...', { id: 'search' })

  try {
    const params = {
      fVeh: filterForm.value.vehicle || null,
      fName: filterForm.value.billName || null,
      fDest: filterForm.value.destination || null,
      fDate1: filterForm.value.startDate
        ? dayjs(filterForm.value.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
        : null,
      fDate2: filterForm.value.endDate
        ? dayjs(filterForm.value.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
        : null,
      fSettledState: filterForm.value.settleState,
      fReceipt: Number(filterForm.value.receiptState),
      fAmount: filterForm.value.amount,
      fWeight: filterForm.value.weight,
      selfOwned: isSelfOwnedMode.value ? '1' : undefined,
    }

    const [response, initialData] = await Promise.all([
      settleApi.getInvoiceSettleVessel(params),
      settleApi.getVesselSettleData(params),
    ])

    if (initialData.ok && initialData.options?.vehPersonMap) {
      vehPersonMap.value = initialData.options.vehPersonMap
    }

    if (response.ok) {
      dbRecords.value = response.invs || []
      buildTableData()
      updateButtonStates()
      if (!silent) toast.success(`查询成功`, { id: 'search' })
    } else {
      console.error('查询 API 返回失败:', response)
      if (!silent) toast.error('查询失败: API 返回 ok=false', { id: 'search' })
    }
  } catch (error: any) {
    console.error('查询异常:', error)
    console.error('错误详情:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    })
    toast.error(`查询失败: ${error.message || '未知错误'}`, { id: 'search' })
  } finally {
    loading.value = false
  }
}

function disableStartDate(date: Date) {
  if (filterForm.value.endDate) {
    const end = dayjs(filterForm.value.endDate).endOf('day')
    return dayjs(date).isAfter(end)
  }
  return false
}

function disableEndDate(date: Date) {
  if (filterForm.value.startDate) {
    const start = dayjs(filterForm.value.startDate).startOf('day')
    return dayjs(date).isBefore(start)
  }
  return false
}

// 构建表格数据
function buildTableData() {
  const data: any[] = []
  totalWeight.value = 0
  totalAmount.value = 0
  prePayment.value = 0
  allReceiptOk.value = true
  allNotNeed.value = true

  let filteredRecords = dbRecords.value

  // 应用发货单位筛选
  if (shipFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const sc = inv.ship_customer || ''
      return shipFilterSelected.value.includes(sc)
    })
  }

  filteredRecords.forEach((inv) => {
    // 检查是否有车辆（船运）
    const isVessel = inv.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)
    const vehObj = isVessel ? makeVehInfo(inv) : null

    // 主行
    const mainRow = buildMainRow(inv, isVessel, vehObj)
    data.push(mainRow)

    // 更新统计
    if (inv.vessel_price >= 0) {
      const price = inv.vessel_price * inv.total_weight
      totalAmount.value += price
    }
    totalWeight.value += inv.total_weight
    prePayment.value += (inv.charge_cash || 0) + (inv.charge_oil || 0)

    if (inv.receipt !== 1) allReceiptOk.value = false
    if (inv.vessel_price >= 0) allNotNeed.value = false

    // 子行（车辆）
    if (isVessel && vehObj) {
      Object.keys(vehObj).forEach((key) => {
        const veh = vehObj[key]
        const subRow = buildSubRow(inv, veh, key, mainRow)
        data.push(subRow)

        // 更新统计
        if (veh.price >= 0) {
          totalAmount.value += veh.price * veh.weight
        }
        totalWeight.value += veh.weight
        prePayment.value += (veh.charge_cash || 0) + (veh.charge_oil || 0)

        if (veh.receipt !== 1) allReceiptOk.value = false
        if (veh.price >= 0) allNotNeed.value = false
      })
    }
  })

  tableData.value = data
  calcSelectedSummary()
}

// 构建主行数据
function buildMainRow(inv: any, isVessel: boolean, vehObj: any) {
  const shipName = inv.ship_name + (inv.ship_customer ? `/${inv.ship_customer}` : '')
  const notNeedColor = inv.vessel_price < 0 ? 'darkgray' : 'red'

  // 承运单位处理
  const carrier = vehPersonMap.value[inv.vehicle_vessel_name]
  let carrierBoss = '-'
  let carrierOptions: string[] = []

  if (typeof carrier === 'string') {
    carrierBoss = carrier || '-'
  } else if (carrier && carrier.boss) {
    const bossList = carrier.boss
      .split(/,|，/)
      .map((b: string) => b.trim())
      .filter(Boolean)
    if (bossList.length === 1) {
      carrierBoss = bossList[0]
    } else if (bossList.length > 1) {
      carrierOptions = bossList
      // 查找已选择的
      if (carrier.real_boss && carrier.real_boss.length) {
        const found = carrier.real_boss.find((rb: any) => rb.waybill_no === inv.waybill_no)
        if (found) {
          carrierBoss = found.rb
        }
      }
      // 如果没有已选择的，默认不选
      if (carrierBoss === '-') {
        carrierBoss = ''
      }
    }
  }

  // 价格文本
  let priceText = '无'
  let unitPrice = '无'
  if (inv.vessel_price < 0) {
    priceText = '<code style="color: darkgray">无</code>'
  } else if (inv.vessel_price > 0) {
    const price = inv.vessel_price * inv.total_weight
    priceText = `<code style="color: blue">${formatNumber(price)}</code>`
    unitPrice = formatNumber(inv.vessel_price)
  }

  // 预付文本
  let chargeText = '无'
  if (inv.charge_cash > 0 && inv.charge_oil > 0) {
    chargeText = `现金:${inv.charge_cash},油:${inv.charge_oil}`
  } else if (inv.charge_cash > 0) {
    chargeText = `现金:${inv.charge_cash}`
  } else if (inv.charge_oil > 0) {
    chargeText = `油:${inv.charge_oil}`
  }

  // 状态HTML
  const statusHtml = getStatusHtml(inv.vessel_settle_state)

  // 计算发运块数
  let sendNum = 0
  inv.bills?.forEach((bill: any) => {
    sendNum += bill.num || 0
  })

  return {
    ...inv,
    isVessel,
    isSubItem: false,
    selected: false,
    expanded: false,
    shipName,
    notNeedColor,
    carrierBoss,
    carrierOptions,
    selectedCarrier: carrierBoss,
    priceText,
    unitPrice,
    chargeText,
    statusHtml,
    send_num: sendNum,
    send_weight: inv.total_weight || 0, // 添加 send_weight 字段
    settle_date: inv.vessel_settle_date,
    ticket_no: inv.ticket_no,
    vehObj,
  }
}

// 构建子行数据
function buildSubRow(inv: any, veh: any, innerNo: string, parentRow: any) {
  const shipName = inv.ship_name + (inv.ship_customer ? `/${inv.ship_customer}` : '')
  const notNeedColor = veh.price < 0 ? 'darkgray' : 'red'

  // 承运单位处理
  const carrier = vehPersonMap.value[veh.name]
  let carrierBoss = '-'
  let carrierOptions: string[] = []

  if (typeof carrier === 'string') {
    carrierBoss = carrier || '-'
  } else if (carrier && carrier.boss) {
    const bossList = carrier.boss
      .split(/,|，/)
      .map((b: string) => b.trim())
      .filter(Boolean)
    if (bossList.length === 1) {
      carrierBoss = bossList[0]
    } else if (bossList.length > 1) {
      carrierOptions = bossList
      // 查找已选择的
      if (carrier.real_boss && carrier.real_boss.length) {
        const found = carrier.real_boss.find((rb: any) => rb.waybill_no === innerNo)
        if (found) {
          carrierBoss = found.rb
        }
      }
      if (carrierBoss === '-') {
        carrierBoss = ''
      }
    }
  }

  // 价格文本
  let priceText = '无'
  let unitPrice = '无'
  if (veh.price < 0) {
    priceText = '无'
  } else if (veh.price > 0) {
    const price = veh.price * veh.weight
    priceText = formatNumber(price)
    unitPrice = formatNumber(veh.price)
  }

  // 预付文本
  let chargeText = '无'
  if (veh.charge_cash > 0 && veh.charge_oil > 0) {
    chargeText = `现金:${veh.charge_cash},油:${veh.charge_oil}`
  } else if (veh.charge_cash > 0) {
    chargeText = `现金:${veh.charge_cash}`
  } else if (veh.charge_oil > 0) {
    chargeText = `油:${veh.charge_oil}`
  }

  // 状态HTML
  const statusHtml = getStatusHtml(veh.state)

  return {
    isSubItem: true,
    isVessel: false,
    selected: false,
    parentRow,
    parentExpanded: parentRow.expanded,
    inner_waybill_no: innerNo,
    waybill_no: inv.waybill_no,
    veh_name: veh.name,
    ship_from: veh.ship_from,
    ship_to: inv.vehicle_vessel_name,
    send_num: veh.num,
    send_weight: veh.weight,
    ship_date: inv.ship_date,
    settle_date: veh.date,
    unship_date: veh.unship_date,
    delay_day: veh.delay_day,
    charge_cash: veh.charge_cash,
    charge_oil: veh.charge_oil,
    receipt: veh.receipt,
    remark: veh.remark,
    shipName,
    notNeedColor,
    carrierBoss,
    carrierOptions,
    selectedCarrier: carrierBoss,
    priceText,
    unitPrice,
    chargeText,
    statusHtml,
    price: veh.price,
    state: veh.state,
    ticket_no: veh.ticket_no,
  }
}

// 生成车辆信息对象
function makeVehInfo(invoice: any) {
  const allVehicles: any[] = []
  invoice.bills?.forEach((bill: any) => {
    if (bill.vehicles) {
      allVehicles.push(...bill.vehicles)
    }
  })

  const vehObj: any = {}
  allVehicles.forEach((veh) => {
    // 容错处理：正常情况下，同一个 inner_waybill_no 对应同一辆车的同一次配发
    // 但历史数据可能存在不同车辆共享同一个 inner_waybill_no 的情况
    // 如果发现 inner_waybill_no 已存在但车名不同，则使用组合 key
    let key = veh.inner_waybill_no

    if (vehObj[key]) {
      if (vehObj[key].name === veh.veh_name) {
        // 相同车名，累加数量和重量（正常情况：同一车多个提单）
        vehObj[key].num += veh.send_num
        vehObj[key].weight += veh.send_weight
      } else {
        // 不同车名但 inner_waybill_no 相同（历史脏数据），使用组合 key
        key = `${veh.inner_waybill_no}_${veh.veh_name}`
        if (vehObj[key]) {
          vehObj[key].num += veh.send_num
          vehObj[key].weight += veh.send_weight
        } else {
          vehObj[key] = {
            name: veh.veh_name,
            num: veh.send_num,
            weight: veh.send_weight,
            price: veh.veh_price || 0,
            ship_from: veh.veh_ship_from,
            state: '未结算',
            date: null,
            unship_date: null,
            delay_day: 0,
            charge_cash: 0,
            charge_oil: 0,
            receipt: 0,
            remark: '',
            pay_date: null,
          }
        }
      }
    } else {
      vehObj[key] = {
        name: veh.veh_name,
        num: veh.send_num,
        weight: veh.send_weight,
        price: veh.veh_price || 0,
        ship_from: veh.veh_ship_from,
        state: '未结算',
        date: null,
        unship_date: null,
        delay_day: 0,
        charge_cash: 0,
        charge_oil: 0,
        receipt: 0,
        remark: '',
        pay_date: null,
      }
    }
  })

  // 合并结算信息
  if (invoice.inner_settle && invoice.inner_settle.length) {
    invoice.inner_settle.forEach((innset: any) => {
      if (vehObj[innset.inner_waybill_no]) {
        Object.assign(vehObj[innset.inner_waybill_no], {
          state: innset.state,
          date: innset.date,
          unship_date: innset.unship_date,
          delay_day: innset.delay_day,
          charge_cash: innset.charge_cash,
          charge_oil: innset.charge_oil,
          receipt: innset.receipt,
          remark: innset.remark,
          pay_date: innset.pay_date,
          ticket_no: innset.ticket_no,
        })
      }
    })
  }

  return vehObj
}

// 获取状态HTML
function getStatusHtml(state: string) {
  const colorMap: Record<string, string> = {
    未结算: 'red',
    已结算: 'blue',
    已付款: 'green',
    不需要结算: 'gray',
  }
  const color = colorMap[state] || 'black'
  return `<span style="color: ${color}">${state}</span>`
}

// 格式化数字
function formatNumber(num: number | string): string {
  if (num === null || num === undefined || num === '') return '0'
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  return isNaN(n) ? '0' : n.toFixed(3)
}

// 格式化日期
function formatDate(date: any, allowEmpty = false): string {
  if (!date) return allowEmpty ? '' : '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// 更新按钮状态
function updateButtonStates() {
  const state = filterForm.value.settleState
  showSettleBtn.value = state === '未结算'
  showSettleCancelBtn.value = state === '已结算'
  showPayBtn.value = state === '已结算'
  showPayCancelBtn.value = state === '已付款'
  showPrintBtn.value = state === '已结算'
  showUnpayBlock.value = state === '已结算'
}

// 全选
function handleSelectAll() {
  tableData.value.forEach((row) => {
    row.selected = selectAll.value
  })
  calcSelectedSummary()
}

// 行选择
// 检查并询问是否同时选中船下的车
function checkAndSelectVehicles(row: any, wasUnselected: boolean) {
  // 如果是船运单且有子行（车），且从未选中变为选中
  if (wasUnselected && row.selected && row.isVessel && row.vehObj && Object.keys(row.vehObj).length > 0) {
    nextTick(() => {
      // 检查该船下的车是否已经全部选中
      const allVehiclesSelected = tableData.value
        .filter((r) => r.isSubItem && r.parentRow === row && !isInBasket(r))
        .every((r) => r.selected)

      // 如果车辆已经全部选中，不需要弹出对话框
      if (allVehiclesSelected) {
        calcSelectedSummary()
      } else {
        selectVehiclesDialogData.value = row
        selectVehiclesDialog.value = true
      }
    })
  } else {
    calcSelectedSummary()
  }
}

// 确认选中船下的车
function handleConfirmSelectVehicles() {
  const row = selectVehiclesDialogData.value
  if (row) {
    // 展开该船的行
    row.expanded = true

    // 选中该船下的所有车
    tableData.value.forEach((r) => {
      if (r.isSubItem && r.parentRow === row && !isInBasket(r)) {
        r.selected = true
        r.parentExpanded = true // 更新子行的展开状态
      }
    })
  }
  calcSelectedSummary()
  selectVehiclesDialog.value = false
}

function handleRowClick(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  if (!row.isSubItem) {
    const wasUnselected = !row.selected
    row.selected = !row.selected
    checkAndSelectVehicles(row, wasUnselected)
  }
}

function handleRowSelect(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  // 点击复选框，v-model 会自动更新 row.selected
  // 如果当前是选中状态（刚刚被选中），检查是否需要弹出对话框
  nextTick(() => {
    if (row.selected) {
      // 刚刚被选中，wasUnselected = true
      checkAndSelectVehicles(row, true)
    } else {
      // 刚刚被取消选中
      calcSelectedSummary()
    }
  })
}

function handleSubRowClick(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  if (row.isSubItem) {
    row.selected = !row.selected
    calcSelectedSummary()
  }
}

function handleSubRowSelect(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  calcSelectedSummary()
}

// 展开/收缩
function toggleExpand(row: any) {
  row.expanded = !row.expanded
  // 更新子行的显示状态
  tableData.value.forEach((r) => {
    if (r.isSubItem && r.parentRow === row) {
      r.parentExpanded = row.expanded
    }
  })
}

// 计算已选统计
function calcSelectedSummary() {
  selectedTotalWeight.value = 0
  selectedTotalAmount.value = 0

  tableData.value.forEach((row) => {
    if (row.selected) {
      if (row.isSubItem) {
        selectedTotalWeight.value += row.send_weight || 0
        if (row.price >= 0) {
          selectedTotalAmount.value += row.price * row.send_weight
        }
      } else {
        selectedTotalWeight.value += row.total_weight || 0
        if (row.vessel_price >= 0) {
          selectedTotalAmount.value += row.vessel_price * row.total_weight
        }
      }
    }
  })
}

// Watch selected records
watch([selectedRecords, selectedInnerNo], () => {
  calcSelectedSummary()
})

// 发货单位筛选相关
function toggleBillNameFilter(e: Event) {
  e.stopPropagation()
  showBillNameFilter.value = !showBillNameFilter.value
  if (showBillNameFilter.value) {
    buildBillNameFilterOptions()
  }
}

function buildBillNameFilterOptions() {
  const map = new Map<string, boolean>()
  dbRecords.value.forEach((inv) => {
    const val = inv.ship_customer || ''
    if (!map.has(val)) {
      const checked = shipFilterSelected.value.length === 0 || shipFilterSelected.value.includes(val)
      map.set(val, checked)
    }
  })

  billNameFilterOptions.value = Array.from(map).map(([value, checked]) => ({
    value,
    label: value === '' ? '（空）' : value,
    checked,
  }))
}

function applyBillNameFilter() {
  shipFilterSelected.value = billNameFilterOptions.value.filter((item) => item.checked).map((item) => item.value)
  showBillNameFilter.value = false
  buildTableData()
}

function clearBillNameFilter() {
  shipFilterSelected.value = []
  showBillNameFilter.value = false
  buildTableData()
}

function closeBillNameFilter(e: Event) {
  const target = e.target as HTMLElement
  if (!target.closest('.bill-name-filter-panel') && !target.closest('.filter-icon')) {
    showBillNameFilter.value = false
  }
}

// 承运单位变更
async function handleCarrierChange(row: any) {
  try {
    const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
    const vName = row.isSubItem ? row.veh_name : row.vehicle_vessel_name
    await settleApi.postCarrierDepartment({
      vehName: vName,
      wno,
      boss: row.selectedCarrier,
    })
    toast.success('承运单位已更新')
  } catch (error) {
    toast.error('设置承运单位失败')
  }
}

// 智能价格输入（根据选择数量自动判断）
function handlePriceInput() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value
  const totalSelected = selected.length + selectedInner.length

  if (totalSelected === 0) {
    toast.warning('请选择要输入价格的记录')
    return
  }

  // 只选择了一条记录，打开单行输入
  if (totalSelected === 1) {
    if (selected.length === 1) {
      // 选中了一个主运单
      const inv = selected[0]
      priceInputDialog.value?.open(inv, true)
    } else if (selectedInner.length === 1) {
      // 选中了一个内部运单
      const innerNo = selectedInner[0]
      const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
      if (row) {
        const inv = dbRecords.value.find((inv) => inv.waybill_no === row.waybill_no)
        priceInputDialog.value?.open(inv, false, innerNo)
      }
    }
  } else {
    // 选择了多条记录，打开批量输入
    batchPriceInputDialog.value?.open(selected, selectedInner, dbRecords.value)
  }
}

// 加入结算篮
function handleAddToBasket() {
  const selected = selectedRecords.value.filter((r) => !r.isSubItem)
  if (addToBasket(selected)) {
    // 清除选中状态
    tableData.value.forEach((row) => {
      if (row.selected && !row.isSubItem) {
        row.selected = false
      }
    })
    selectAll.value = false
  }
}

// 从结算篮结算
async function handleSettleFromBasket(items: any[]) {
  if (items.length === 0) {
    toast.warning('结算篮为空，请先添加记录')
    return
  }

  // 验证船运单下的所有车是否都已结算
  const vesselItems = items.filter((item) => item.isVessel && item.vehObj)
  for (const vesselItem of vesselItems) {
    const unsettledVehs = Object.entries(vesselItem.vehObj).filter(
      ([_, veh]: [string, any]) => veh.state === '未结算' && veh.price >= 0,
    )
    if (unsettledVehs.length > 0) {
      const names = unsettledVehs.map(([_, veh]: [string, any]) => veh.name).join('、')
      toast.error(`船运单 ${vesselItem.waybill_no} 下还有 ${unsettledVehs.length} 辆车未结算：${names}，请先结算这些车`)
      return
    }
  }

  // 检查价格输入情况
  const itemsWithoutPrice = items.filter((item) => item.vessel_price === 0)
  const itemsNotRequireSettle = items.filter((item) => item.vessel_price < 0)

  // 如果有标记为不需要结算的
  if (itemsNotRequireSettle.length > 0) {
    toast.error(`结算篮中有 ${itemsNotRequireSettle.length} 条记录已确定为不需要结算，请先移除`)
    return
  }

  // 如果有未输入价格的，提示用户输入
  if (itemsWithoutPrice.length > 0) {
    basketPriceDialogData.value = itemsWithoutPrice
    basketPriceDialog.value = true
    return
  }

  // 选中结算篮中的所有项目
  tableData.value.forEach((row) => {
    row.selected = items.some((item) => item.waybill_no === row.waybill_no)
  })

  // 执行结算
  await performSettle(true, '已结算', new Date(), authStore.user?.userid)

  // 结算成功后清空结算篮
  clearBasket()
  showBasket.value = false
}

// 确认结算篮价格输入
function handleConfirmBasketPrice() {
  const itemsWithoutPrice = basketPriceDialogData.value
  // 选中这些没有价格的记录
  tableData.value.forEach((row) => {
    row.selected = itemsWithoutPrice.some((item: any) => item.waybill_no === row.waybill_no)
  })
  // 根据数量打开相应的价格输入对话框
  if (itemsWithoutPrice.length === 1) {
    priceInputDialog.value?.open(itemsWithoutPrice[0], true)
  } else {
    batchPriceInputDialog.value?.open(itemsWithoutPrice, [], dbRecords.value)
  }
  basketPriceDialog.value = false
}

// 回执滞留信息
function handleDelayInfo() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length + selectedInner.length !== 1) {
    if (selected.length + selectedInner.length > 1) {
      toast.warning('只能选择一条记录查看滞留信息')
    } else {
      toast.warning('请选择一条记录')
    }
    return
  }

  if (selected.length === 1) {
    delayInfoDialog.value?.open(selected[0], false)
  } else {
    const innerNo = selectedInner[0]
    const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
    if (row) {
      const inv = dbRecords.value.find((inv) => inv.waybill_no === row.waybill_no)
      delayInfoDialog.value?.open(inv, false, innerNo)
    }
  }
}

// 批量预付
function handleBatchCharge() {
  // 获取所有显示的运单号（包括展开的子行）
  const allWnoList = tableData.value
    .filter((row) => !row.isSubItem || row.parentExpanded)
    .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

  if (allWnoList.length === 0) {
    toast.warning('没有可更新的运单')
    return
  }

  delayInfoDialog.value?.openBatch(allWnoList)
}

// 批量回执
function handleBatchReceipt() {
  batchReceiptDialog.value = true
}

// 确认批量回执
async function handleConfirmBatchReceipt() {
  try {
    const allNo = tableData.value
      .filter((row) => !row.isSubItem || row.parentExpanded)
      .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

    await settleApi.updateVesselDelayInfo({
      unshipData: { receipt: allReceiptOk.value ? 0 : 1 },
      wnoList: allNo,
      partInd: 2,
    })

    toast.success('批量设置回执成功')
    handleSearch(true)
  } catch (error) {
    if (error !== 'cancel') {
      toast.error('批量设置回执失败')
    }
  }
}

// 显示明细
function handleShowDetail() {
  if (selectedRecords.value.length === 1) {
    detailDialog.value?.open(selectedRecords.value[0])
  }
}

// 结算
async function handleSettle() {
  await performSettle(true, '已结算', new Date(), authStore.user?.userid)
}

// 结算取消
async function handleSettleCancel() {
  await performSettle(false, '未结算', '', '')
}

async function performSettle(settle: boolean, state: string, date: any, username: any) {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择您要结算或结算取消的行')
    return
  }

  // 验证
  const allSelectedWNo: string[] = []
  for (const rec of selected) {
    if (settle) {
      if (rec.vessel_price < 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 已设置为不需要结算, 请先取消不结算,再来结算`)
        return
      } else if (rec.vessel_price === 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 还未输入价格, 不能继续结算`)
        return
      } else if (rec.isVessel && rec.vehObj) {
        // 船运单：检查所有车是否都已结算
        const unsettledVehs = Object.entries(rec.vehObj).filter(
          ([_, veh]: [string, any]) => veh.state === '未结算' && veh.price >= 0,
        )
        if (unsettledVehs.length > 0) {
          const names = unsettledVehs.map(([_, veh]: [string, any]) => veh.name).join('、')
          toast.error(`船运单 ${rec.waybill_no} 下还有 ${unsettledVehs.length} 辆车未结算：${names}，请先结算这些车`)
          return
        }
        if (rec.vessel_settle_state === '未结算') {
          allSelectedWNo.push(rec.waybill_no)
        }
      } else if (rec.vessel_settle_state === '未结算') {
        allSelectedWNo.push(rec.waybill_no)
      }
    } else {
      if (rec.vessel_price < 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 已设置为不需要结算, 不能取消`)
        return
      } else if (rec.vessel_settle_state === '已结算') {
        allSelectedWNo.push(rec.waybill_no)
      }
    }
  }

  const wnoListFromInner: string[] = []
  for (const innerNo of selectedInner) {
    const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
    if (row) {
      if (settle) {
        if (row.price < 0) {
          toast.error(`您选择的内部运单: ${innerNo} 已设置为不需要结算, 请先取消不结算,再来结算`)
          return
        } else if (row.price === 0) {
          toast.error(`您选择的内部运单: ${innerNo} 还未输入价格, 不能继续结算`)
          return
        }
      } else {
        if (row.price < 0) {
          toast.error(`您选择的内部运单: ${innerNo} 已设置为不需要结算, 不能取消结算`)
          return
        }
      }

      if (!wnoListFromInner.includes(row.waybill_no)) {
        wnoListFromInner.push(row.waybill_no)
      }
    }
  }

  try {
    await settleApi.settleVessel({
      allSelectedInvNo: allSelectedWNo,
      allInvNoFromInner: wnoListFromInner,
      allInnerNo: selectedInner,
      settle,
    })

    toast.success(settle ? '结算成功' : '结算取消成功')
    handleSearch(true)
  } catch (error) {
    toast.error(settle ? '结算失败' : '结算取消失败')
  }
}

// 付款
async function handlePay() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择记录')
    return
  }

  ticketNo.value = ''
  payTicketDialog.value = true
}

async function handleConfirmPay() {
  await performPay(true, '已付款', new Date(), ticketNo.value)
  payTicketDialog.value = false
}

// 付款取消
async function handlePayCancel() {
  await performPay(false, '已结算', '')
}

async function performPay(pay: boolean, state: string, date: any, ticketNoParam?: string) {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择记录')
    return
  }

  const allPayWNo = selected.map((rec) => rec.waybill_no)
  const wnoListFromInner = [
    ...new Set(
      selectedInner
        .map((innerNo) => tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)?.waybill_no)
        .filter(Boolean),
    ),
  ]

  try {
    await settleApi.settleVesselPay({
      allPayInvNo: allPayWNo,
      allInvNoFromInner: wnoListFromInner,
      allInnerNo: selectedInner,
      forPay: pay,
      ticketNo: ticketNoParam,
    })

    toast.success(pay ? '付款成功' : '付款取消成功')
    handleSearch(true)
  } catch (error) {
    toast.error(pay ? '付款失败' : '付款取消失败')
  }
}

// 打印
function handlePrintDetail() {
  const selected = tableData.value.filter((row) => row.selected)
  if (selected.length === 0) {
    toast.warning('请选择你要打印的清单列表')
    return
  }

  printDialog.value?.open(selected)
}

// 不需要结算
function handleNotNeedSettle(row: any) {
  if (filterForm.value.settleState !== '未结算') {
    toast.warning('已结算,不能再进行"不需要结算操作"')
    return
  }

  // 保存待处理的行数据，显示确认对话框
  pendingNotNeedSettleRow.value = row
  showNotNeedSettleDialog.value = true
}

// 确认不需要结算
async function confirmNotNeedSettle() {
  const row = pendingNotNeedSettleRow.value
  if (!row) return

  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  const notNeeded = row.notNeedColor === 'red'

  try {
    await settleApi.settleVesselNotNeeded({
      wayNoList: [wno],
      notNeeded,
    })

    toast.success(notNeeded ? '已设置为不需要结算' : '已取消不需要结算')
    handleSearch(true)
  } catch (error) {
    toast.error('操作失败')
  } finally {
    showNotNeedSettleDialog.value = false
    pendingNotNeedSettleRow.value = null
  }
}

// 批量不需要结算
function handleBatchNotNeed() {
  if (filterForm.value.settleState !== '未结算') {
    toast.warning('在已结算状态下不能进行此操作')
    return
  }

  batchNotNeedDialog.value = true
}

// 确认批量不结算
async function handleConfirmBatchNotNeed() {
  try {
    const wnoList = tableData.value
      .filter((row) => !row.isSubItem || row.parentExpanded)
      .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

    await settleApi.settleVesselNotNeeded({
      wayNoList: wnoList,
      notNeeded: !allNotNeed.value,
    })

    toast.success('批量设置成功')
    handleSearch(true)
  } catch (error) {
    if (error !== 'cancel') {
      toast.error('操作失败')
    }
  }
}

// 上传回执
function handleUploadReceipt(row: any) {
  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  uploadReceiptDialog.value?.open(wno)
}

// 查看回执
function handleViewReceipt(row: any) {
  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  receiptImageDialog.value?.open(wno)
}

// 导出
function handleExport() {
  if (tableData.value.length === 0) {
    toast.warning('没有数据可以导出')
    return
  }

  const columns = [
    '状态',
    '车船号',
    '承运单位',
    '开单名称/发货单位',
    '起始→目的地',
    '总价格',
    '单价',
    '发运块数',
    '发运重量',
    '发货日期',
    '结算日期',
    '卸船日期',
    '滞留天数',
    '运单号',
    '票号',
    '预付',
    '回执',
  ]

  const data: any[][] = [columns]

  tableData.value
    .filter((row) => !row.isSubItem || row.parentExpanded)
    .forEach((row) => {
      data.push([
        row.isSubItem ? row.state : row.vessel_settle_state,
        row.isSubItem ? row.veh_name : row.vehicle_vessel_name,
        row.carrierBoss,
        row.shipName,
        `${row.ship_from || ''}→${row.ship_to || ''}`,
        row.isSubItem ? formatNumber(row.price * row.send_weight) : formatNumber(row.vessel_price * row.total_weight),
        row.isSubItem ? formatNumber(row.price) : formatNumber(row.vessel_price),
        row.send_num,
        formatNumber(row.isSubItem ? row.send_weight : row.total_weight),
        formatDate(row.ship_date),
        formatDate(row.settle_date),
        formatDate(row.unship_date, true),
        row.delay_day,
        row.isSubItem ? row.inner_waybill_no : row.waybill_no,
        row.ticket_no,
        row.chargeText.replace(',', '，'),
        row.receipt === 1 ? '已回执' : '未回执',
      ])
    })

  exportFromAOAWithPicker(data, `车船结算_${dayjs().format('YYYY-MM-DD')}`, '车船结算')
}

// 对话框回调
function handlePriceConfirm(data: any) {
  handleSearch(true)
}

function handleBatchPriceConfirm(data: any) {
  selectAll.value = false
  handleSearch(true)
}

function handleDelayInfoConfirm(data: any) {
  handleSearch(true)
}

function handlePrintConfirm(forPay: boolean) {
  if (forPay) {
    performPay(true, '已付款', new Date())
  }
}

function handleUploadReceiptConfirm() {
  handleSearch(true)
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '车船结算(自有车)' : '车船结算'"
    :description="isSelfOwnedMode ? '自有车船运费结算管理' : '车船运费结算管理'">
    <div class="settle-vessel-page relative h-full flex flex-col">
      <!-- 操作栏 -->
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
          <!-- 价格输入按钮组 -->
          <template v-if="hasPrivilegePrice">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedRecords.length + selectedInnerNo.length === 0"
              @click="handlePriceInput"
            >
              <span class="mr-1 font-semibold">¥</span>
              价格输入
              <span v-if="selectedRecords.length + selectedInnerNo.length > 0" class="ml-1 text-xs opacity-70">
                ({{ selectedRecords.length + selectedInnerNo.length }})
              </span>
            </UiButton>
            <UiButton variant="outline" size="sm" @click="handleDelayInfo"> 回执滞留 </UiButton>
          </template>

          <!-- 工具按钮组 -->
          <UiButton variant="outline" size="sm" @click="handleExport"> 导出 </UiButton>
          <UiButton variant="outline" size="sm" :disabled="!canShowDetail" @click="handleShowDetail">
            显示明细
          </UiButton>
          <div
            v-if="filterForm.settleState !== '全部' && filterForm.settleState !== '不需要结算'"
            class="w-px h-6 bg-border"
          />

          <!-- 结算篮按钮 -->
          <UiButton
            v-if="canShowBasket"
            ref="basketButtonRef"
            variant="default"
            size="sm"
            class="relative"
            @click="showBasket = true"
          >
            <ShoppingCart class="w-4 h-4 mr-1" />
            结算篮
            <span
              v-if="basketItems.length > 0"
              class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse"
            >
              {{ basketItems.length > 99 ? '99+' : basketItems.length }}
            </span>
          </UiButton>

          <!-- 结算按钮组 -->
          <UiButton v-if="showSettleBtn" variant="default" size="sm" @click="handleSettle"> 结算 </UiButton>
          <UiButton v-if="showSettleCancelBtn" variant="outline" size="sm" @click="handleSettleCancel">
            结算取消
          </UiButton>

          <UiButton v-if="showPrintBtn" variant="outline" size="sm" @click="handlePrintDetail"> 车船清单打印 </UiButton>
          <UiButton v-if="showPayBtn" variant="default" size="sm" @click="handlePay"> 付款 </UiButton>
          <UiButton v-if="showPayCancelBtn" variant="outline" size="sm" @click="handlePayCancel"> 付款取消 </UiButton>
        </div>

        <!-- 状态筛选 -->
        <div class="ml-auto flex items-center gap-3">
          <Tabs v-model="filterForm.settleState" @update:model-value="() => handleSearch(true)">
            <TabsList class="h-9">
              <TabsTrigger
                value="未结算"
                class="text-xs data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400"
              >
                未结算
              </TabsTrigger>
              <TabsTrigger
                value="已结算"
                class="text-xs data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
              >
                已结算
              </TabsTrigger>
              <TabsTrigger
                value="已付款"
                class="text-xs data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400"
              >
                已付款
              </TabsTrigger>
              <TabsTrigger value="不需要结算" class="text-xs data-[state=active]:text-muted-foreground">
                不需要结算
              </TabsTrigger>
              <TabsTrigger value="全部" class="text-xs"> 全部 </TabsTrigger>
            </TabsList>
          </Tabs>

          <div class="w-px h-6 bg-border" />
          <UiButton variant="outline" size="sm" @click="showFilter = !showFilter">
            <Filter class="w-4 h-4 mr-1" />
            筛选
          </UiButton>
        </div>
      </div>

      <!-- 筛选区域 -->
      <div v-show="showFilter" class="p-4 border rounded-lg bg-muted/30 space-y-2 mb-4">
        <!-- 第一行：车船号 | 开单名称 | 目的地 | 回执状态 -->
        <div class="grid grid-cols-4 gap-2">
          <SearchableCombobox
            v-model="filterForm.vehicle"
            :search-fn="searchVehicles"
            placeholder="车船号"
            class="h-8 text-sm w-full"
          />
          <SearchableCombobox
            v-model="filterForm.billName"
            :search-fn="searchBillingNames"
            placeholder="开单名称"
            class="h-8 text-sm w-full"
          />
          <SearchableCombobox
            v-model="filterForm.destination"
            :search-fn="searchDestinations"
            placeholder="目的地"
            class="h-8 text-sm w-full"
          />
          <Select v-model="filterForm.receiptState" @update:model-value="() => handleSearch(true)">
            <SelectTrigger class="h-8 text-sm w-full">
              <SelectValue placeholder="回执状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">回执(全部)</SelectItem>
              <SelectItem value="1">已回执</SelectItem>
              <SelectItem value="0">未回执</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 第二行：[开始日期] | [结束日期] | [单价 吨位 查询] -->
        <div class="grid grid-cols-4 gap-2">
          <!-- 开始日期 -->
          <DatePicker
            v-model="filterForm.startDate"
            placeholder="发货日期(开始)"
            :disabled-date="disableStartDate"
            disabled-hint="开始日期不能晚于结束日期"
            class="h-8 w-full"
          />

          <!-- 结束日期 -->
          <DatePicker
            v-model="filterForm.endDate"
            placeholder="发货日期(结束)"
            :disabled-date="disableEndDate"
            disabled-hint="结束日期不能早于开始日期"
            class="h-8 w-full"
          />

          <!-- 查询组 -->
          <div class="col-span-2 flex gap-2">
            <Input
              v-model="filterForm.amount"
              placeholder="单价"
              class="h-8 text-sm flex-1"
              @input="filterForm.amount = filterForm.amount.replace(/[^0-9.]/g, '')"
            />
            <Input
              v-model="filterForm.weight"
              placeholder="吨位"
              class="h-8 text-sm flex-1"
              @input="filterForm.weight = filterForm.weight.replace(/[^0-9.]/g, '')"
            />
            <UiButton variant="default" size="sm" class="h-8 shrink-0" :disabled="loading" @click="handleSearch">
              <Loader2 v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
              查询
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 统计信息行 -->
      <div class="flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm mb-4">
        <span class="text-muted-foreground">
          记录数: <strong class="text-foreground">{{ pagedData.length }}</strong>
        </span>
        <span class="text-muted-foreground">
          重量: <strong class="text-foreground">{{ formatNumber(totalWeight) }}</strong>
        </span>
        <span v-if="hasPrivilegePrice" class="text-muted-foreground">
          合计金额: <strong class="text-foreground">¥{{ formatNumber(totalAmount) }}</strong>
        </span>
        <template v-if="selectedTotalWeight > 0">
          <span class="text-primary font-medium">
            已选: {{ formatNumber(selectedTotalWeight) }}吨
            <template v-if="hasPrivilegePrice"> / ¥{{ formatNumber(selectedTotalAmount) }}</template>
          </span>
        </template>
        <span v-if="showUnpayBlock" class="text-orange-600 font-medium">
          未付: ¥{{ formatNumber(totalAmount - prePayment) }}
        </span>

        <!-- 加入结算篮按钮 -->
        <UiButton
          v-if="canShowBasket && selectedRecords.length > 0"
          variant="default"
          size="sm"
          class="bg-orange-500 hover:bg-orange-600 text-white ml-auto"
          @click="handleAddToBasket"
        >
          <ShoppingCart class="w-4 h-4 mr-1" />
          加入结算篮 ({{ selectedRecords.length }})
        </UiButton>
      </div>

      <!-- 表格 -->
      <div class="flex-1 min-h-0 border rounded-lg overflow-hidden">
        <div class="h-full overflow-auto">
          <Table class="text-sm min-w-[1024px] w-full">
            <TableHeader class="bg-muted/80 sticky top-0 z-10">
              <TableRow class="border-b">
                <TableHead class="px-1.5 py-1.5 text-left flex items-center w-20" nowrap>
                  <input v-model="selectAll" type="checkbox" class="h-4 w-4 cursor-pointer" @change="handleSelectAll" />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Toggle
                          :pressed="allNotNeed"
                          @click="handleBatchNotNeed"
                          size="sm"
                          class="ml-2 h-6 w-6 p-0"
                          :class="allNotNeed ? 'text-gray-400' : 'text-red-500'"
                        >
                          ★
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ allNotNeed ? '批量取消不结算' : '批量不结算' }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[80px]"> 状态 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[100px]"> 车船号 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[100px]"> 承运单位 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left relative min-w-[180px]">
                  开单名称/发货单位
                  <span
                    class="ml-2 cursor-pointer"
                    :class="shipFilterSelected.length ? 'text-blue-500' : 'text-gray-400'"
                    @click="toggleBillNameFilter"
                    >⧩</span
                  >

                  <!-- 发货单位筛选面板 -->
                  <div
                    v-show="showBillNameFilter"
                    class="absolute z-50 bg-white border rounded-lg shadow-lg p-3 min-w-[220px] max-w-[360px] mt-1 top-full left-0"
                    @click.stop
                  >
                    <div class="max-h-60 overflow-auto space-y-1">
                      <div
                        v-for="item in billNameFilterOptions"
                        :key="item.value"
                        class="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer"
                      >
                        <input v-model="item.checked" type="checkbox" class="h-4 w-4 cursor-pointer" />
                        <span class="text-sm">{{ item.label }}</span>
                      </div>
                    </div>
                    <div class="flex justify-end gap-2 mt-3 pt-2 border-t">
                      <UiButton variant="outline" size="sm" @click="clearBillNameFilter"> 清除 </UiButton>
                      <UiButton variant="default" size="sm" @click="applyBillNameFilter"> 确定 </UiButton>
                    </div>
                  </div>
                </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[120px]"> 起始→目的地 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-center min-w-[80px]"> 总价格 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-center min-w-[80px]"> 单价 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-center min-w-[70px]"> 发运数 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-center min-w-[80px]"> 发运量 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[100px]"> 发货日期 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[100px]"> 结算日期 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[100px]"> 卸船日期 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-center min-w-[70px]"> 滞留天数 </TableHead>
                <TableHead class="px-1.5 py-1.5 text-left min-w-[140px]"> 运单号 </TableHead>
                <TableHead
                  v-if="filterForm.settleState === '已付款' || filterForm.settleState === '全部'"
                  class="px-1.5 py-1.5 text-left min-w-[100px]"
                >
                  票号
                </TableHead>
                <TableHead
                  class="pl-1.5 pr-0 py-1.5 text-center w-20 sticky right-24 bg-muted border-l border-gray-200 z-10 hover:bg-orange-100 transition-colors"
                  :class="{ 'cursor-pointer': hasPrivilegePrice }"
                  nowrap
                  @click="hasPrivilegePrice && handleBatchCharge()"
                >
                  <template v-if="hasPrivilegePrice">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <UiButton variant="secondary" size="sm" class="h-6 text-xs"> 预付 </UiButton>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>批量设置预付金额和油卡</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </template>
                  <span v-else class="text-sm font-medium">预付</span>
                </TableHead>
                <TableHead class="px-0 py-1.5 text-center w-24 sticky right-0 w-24 min-w-24 bg-muted z-10" nowrap>
                  <!-- <UiButton v-if="hasPrivilegePrice" variant="secondary" size="sm" class="h-6 text-xs" @click="handleBatchReceipt"> -->
                  <UiButton v-if="hasPrivilegePrice" variant="secondary" size="sm" class="h-6 text-xs">
                    <!-- <span :class="allReceiptOk ? 'text-green-600' : 'text-red-500'" class="mr-[2px] text-2xl">{{ allReceiptOk ? '☑' : '☐' }}</span> -->
                    回执
                  </UiButton>
                  <span v-else class="text-sm font-medium">回执</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <!-- 空状态 -->
              <TableRow v-if="pagedData.length === 0">
                <TableCell
                  :colspan="filterForm.settleState === '已付款' || filterForm.settleState === '全部' ? 19 : 18"
                  class="p-8 text-center text-muted-foreground"
                >
                  暂无数据，请调整筛选条件后重新查询
                </TableCell>
              </TableRow>

              <template v-for="(row, index) in pagedData" :key="row.waybill_no || row.inner_waybill_no">
                <!-- 主行 -->
                <TableRow
                  v-if="!row.isSubItem"
                  class="border-b transition-colors"
                  :class="{
                    'bg-orange-100 hover:bg-orange-200 cursor-pointer':
                      row.isVessel && !row.selected && !isInBasket(row),
                    'hover:bg-muted/50 cursor-pointer': !row.isVessel && !row.selected && !isInBasket(row),
                    'bg-blue-100 border-l-4 border-l-blue-500': row.selected,
                    'bg-orange-50 border-l-4 border-l-orange-500 opacity-60 cursor-not-allowed': isInBasket(row),
                  }"
                  @click="handleRowClick(row)"
                >
                  <TableCell class="px-1.5 py-1.5 flex items-center" nowrap>
                    <input
                      v-model="row.selected"
                      type="checkbox"
                      class="h-4 w-4"
                      :class="isInBasket(row) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
                      :disabled="isInBasket(row)"
                      :checked="row.selected || isInBasket(row)"
                      @click.stop="handleRowSelect(row)"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Toggle
                            :pressed="row.notNeedColor === 'darkgray'"
                            @click.stop="handleNotNeedSettle(row)"
                            size="sm"
                            class="ml-2 h-6 w-6 p-0"
                            :class="row.notNeedColor === 'darkgray' ? 'text-gray-400' : 'text-red-500'"
                          >
                            ★
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{{ row.notNeedColor === 'darkgray' ? '取消不需要结算' : '不需要结算' }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span
                      v-if="row.isVessel"
                      class="ml-1 cursor-pointer text-xl text-gray-500 hover:text-gray-800"
                      @click.stop="toggleExpand(row)"
                    >
                      {{ row.expanded ? '▼' : '▶' }}
                    </span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5" v-html="row.statusHtml" />
                  <TableCell class="px-1.5 py-1.5">
                    {{ row.vehicle_vessel_name }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    <Select
                      v-if="row.carrierOptions && row.carrierOptions.length > 1"
                      v-model="row.selectedCarrier"
                      @update:model-value="handleCarrierChange(row)"
                      @click.stop
                    >
                      <SelectTrigger class="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="opt in row.carrierOptions" :key="opt" :value="opt">
                          {{ opt }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <span v-else>{{ row.carrierBoss }}</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ row.shipName }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5"> {{ row.ship_from }}→{{ row.ship_to }} </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    <span v-if="hasPrivilegePrice" v-html="row.priceText" />
                    <span v-else class="blurred-price">***</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    <span v-if="hasPrivilegePrice">{{ row.unitPrice }}</span>
                    <span v-else class="blurred-price">***</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ row.send_num }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ formatNumber(row.total_weight) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.ship_date) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.settle_date) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.unship_date, true) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ row.delay_day }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    <div class="flex items-center gap-1.5">
                      <span>{{ row.waybill_no }}</span>
                      <span
                        v-if="isInBasket(row)"
                        class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                      >
                        <ShoppingCart class="w-2.5 h-2.5" />
                        已在结算篮
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    v-if="filterForm.settleState === '已付款' || filterForm.settleState === '全部'"
                    class="px-1.5 py-1.5"
                  >
                    {{ row.ticket_no || '-' }}
                  </TableCell>
                  <TableCell
                    class="pl-1.5 pr-0 py-1.5 text-center text-xs sticky right-24 border-l border-gray-200 z-10"
                    :class="
                      row.isVessel && !row.selected ? 'bg-orange-200' : row.selected ? 'bg-blue-200' : 'bg-gray-50'
                    "
                    nowrap
                  >
                    {{ row.chargeText }}
                  </TableCell>
                  <TableCell
                    class="px-0 py-1.5 text-center sticky right-0 w-24 min-w-24 z-10"
                    :class="
                      row.isVessel && !row.selected ? 'bg-orange-200' : row.selected ? 'bg-blue-200' : 'bg-gray-50'
                    "
                    nowrap
                  >
                    <div class="flex items-center justify-center gap-1">
                      <UiButton
                        v-if="row.receipt === 1"
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs px-2"
                        @click.stop="handleViewReceipt(row)"
                      >
                        查看
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs px-2"
                        @click.stop="handleUploadReceipt(row)"
                      >
                        上传
                      </UiButton>
                      <span v-if="row.remark" class="text-red-500 cursor-pointer" :title="row.remark">ⓘ</span>
                    </div>
                  </TableCell>
                </TableRow>

                <!-- 子行（车辆） -->
                <TableRow
                  v-if="row.isSubItem && row.parentExpanded"
                  class="border-b transition-colors"
                  :class="{
                    'bg-green-100 hover:bg-green-200 cursor-pointer': !row.selected && !isInBasket(row),
                    'bg-blue-200 border-l-4 border-l-blue-500': row.selected,
                    'bg-orange-50 border-l-4 border-l-orange-500 opacity-60 cursor-not-allowed': isInBasket(row),
                  }"
                  @click="handleSubRowClick(row)"
                >
                  <TableCell class="px-1.5 py-1.5 pl-6 flex items-center" nowrap>
                    <input
                      v-model="row.selected"
                      type="checkbox"
                      class="h-4 w-4"
                      :class="isInBasket(row) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
                      :disabled="isInBasket(row)"
                      :checked="row.selected || isInBasket(row)"
                      @click.stop="handleSubRowSelect(row)"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Toggle
                            :pressed="row.notNeedColor === 'darkgray'"
                            @click.stop="handleNotNeedSettle(row)"
                            size="sm"
                            class="ml-2 h-6 w-6 p-0"
                            :class="row.notNeedColor === 'darkgray' ? 'text-gray-400' : 'text-red-500'"
                          >
                            ★
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{{ row.notNeedColor === 'darkgray' ? '取消不需要结算' : '不需要结算' }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5" v-html="row.statusHtml" />
                  <TableCell class="px-1.5 py-1.5">
                    {{ row.veh_name }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    <Select
                      v-if="row.carrierOptions && row.carrierOptions.length > 1"
                      v-model="row.selectedCarrier"
                      @update:model-value="handleCarrierChange(row)"
                      @click.stop
                    >
                      <SelectTrigger class="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="opt in row.carrierOptions" :key="opt" :value="opt">
                          {{ opt }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <span v-else>{{ row.carrierBoss }}</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ row.shipName }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5"> {{ row.ship_from }}→{{ row.ship_to }} </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    <span v-if="hasPrivilegePrice">{{ row.priceText }}</span>
                    <span v-else class="blurred-price">***</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    <span v-if="hasPrivilegePrice">{{ row.unitPrice }}</span>
                    <span v-else class="blurred-price">***</span>
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ row.send_num }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ formatNumber(row.send_weight) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.ship_date) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.settle_date) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    {{ formatDate(row.unship_date, true) }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5 text-center">
                    {{ row.delay_day }}
                  </TableCell>
                  <TableCell class="px-1.5 py-1.5">
                    <div class="flex items-center gap-1.5">
                      <span>{{ row.inner_waybill_no }}</span>
                      <span
                        v-if="isInBasket(row)"
                        class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                      >
                        <ShoppingCart class="w-2.5 h-2.5" />
                        已在结算篮
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    v-if="filterForm.settleState === '已付款' || filterForm.settleState === '全部'"
                    class="px-1.5 py-1.5"
                  >
                    {{ row.ticket_no || '-' }}
                  </TableCell>
                  <TableCell
                    class="pl-1.5 pr-0 py-1.5 text-center text-xs sticky right-24 border-l border-gray-300 z-10"
                    :class="row.selected ? 'bg-blue-300' : 'bg-green-200'"
                    nowrap
                  >
                    {{ row.chargeText }}
                  </TableCell>
                  <TableCell
                    class="px-0 py-1.5 text-center sticky right-0 w-24 min-w-24 z-10"
                    :class="row.selected ? 'bg-blue-300' : 'bg-green-200'"
                    nowrap
                  >
                    <div class="flex items-center justify-center gap-1">
                      <UiButton
                        v-if="row.receipt === 1"
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs px-2"
                        @click.stop="handleViewReceipt(row)"
                      >
                        查看
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs px-2"
                        @click.stop="handleUploadReceipt(row)"
                      >
                        上传
                      </UiButton>
                      <span v-if="row.remark" class="text-red-500 cursor-pointer" :title="row.remark">ⓘ</span>
                    </div>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="tableData.length > pageSize" class="flex items-center justify-between mt-4 px-2">
        <div class="text-sm text-muted-foreground">
          显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, tableData.length) }} 条，共
          {{ tableData.length }} 条
        </div>
        <div class="flex items-center gap-2">
          <UiButton variant="outline" size="sm" :disabled="currentPage === 1" @click="previousPage"> 上一页 </UiButton>
          <div class="flex items-center gap-1">
            <span class="text-sm">第</span>
            <input
              type="number"
              :value="currentPage"
              :min="1"
              :max="totalPages"
              class="w-16 px-2 py-1 text-sm text-center border rounded"
              @change="goToPage(($event.target as HTMLInputElement).valueAsNumber)"
            />
            <span class="text-sm">/ {{ totalPages }} 页</span>
          </div>
          <UiButton variant="outline" size="sm" :disabled="currentPage === totalPages" @click="nextPage">
            下一页
          </UiButton>
        </div>
      </div>

      <!-- 对话框组件 -->
      <VesselPriceInputDialog ref="priceInputDialog" @confirm="handlePriceConfirm" />
      <VesselBatchPriceInputDialog ref="batchPriceInputDialog" @confirm="handleBatchPriceConfirm" />
      <VesselDelayInfoDialog ref="delayInfoDialog" @confirm="handleDelayInfoConfirm" />
      <VesselDetailDialog ref="detailDialog" />
      <VesselPrintDialog ref="printDialog" @confirm="handlePrintConfirm" />
      <VesselReceiptImageDialog ref="receiptImageDialog" @confirm="handleUploadReceiptConfirm" />
      <VesselUploadReceiptDialog ref="uploadReceiptDialog" @confirm="handleUploadReceiptConfirm" />

      <!-- 不需要结算确认对话框 -->
      <AlertDialog v-model:open="showNotNeedSettleDialog">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription class="space-y-3">
              <p class="font-medium">
                {{
                  pendingNotNeedSettleRow?.notNeedColor === 'red'
                    ? '确定要将此运单设置为"不需要结算"吗？'
                    : '确定要取消"不需要结算"状态吗？'
                }}
              </p>
              <div v-if="pendingNotNeedSettleRow" class="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <span class="text-muted-foreground">运单号：</span>
                    <span class="font-medium">{{
                      pendingNotNeedSettleRow.isSubItem
                        ? pendingNotNeedSettleRow.inner_waybill_no
                        : pendingNotNeedSettleRow.waybill_no
                    }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">车船号：</span>
                    <span class="font-medium">{{
                      pendingNotNeedSettleRow.isSubItem
                        ? pendingNotNeedSettleRow.veh_name
                        : pendingNotNeedSettleRow.vehicle_vessel_name
                    }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">开单名称：</span>
                    <span class="font-medium">{{ pendingNotNeedSettleRow.shipName }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">发运块数：</span>
                    <span class="font-medium">{{ pendingNotNeedSettleRow.send_num }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">发运重量：</span>
                    <span class="font-medium"
                      >{{
                        formatNumber(
                          pendingNotNeedSettleRow.isSubItem
                            ? pendingNotNeedSettleRow.send_weight
                            : pendingNotNeedSettleRow.total_weight,
                        )
                      }}
                      吨</span
                    >
                  </div>
                  <div>
                    <span class="text-muted-foreground">发货日期：</span>
                    <span class="font-medium">{{ formatDate(pendingNotNeedSettleRow.ship_date) }}</span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction @click="confirmNotNeedSettle">确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 付款票号对话框 -->
      <AlertDialog v-model:open="payTicketDialog">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认付款</AlertDialogTitle>
            <AlertDialogDescription>
              请输入票号（可选）：
              <Input v-model="ticketNo" placeholder="票号" class="mt-2" @keyup.enter="handleConfirmPay" />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="payTicketDialog = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="handleConfirmPay">确认付款</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 结算篮组件 -->
      <SettleBasket
        v-model:open="showBasket"
        :items="basketItems"
        :statistics="basketStatistics"
        @settle="handleSettleFromBasket"
        @remove="removeFromBasket"
        @clear="clearBasket"
      >
        <template #item-title="{ item }">
          <span class="font-medium truncate">{{ item.veh_name || item.vehicle_vessel_name }}</span>
        </template>
        <template #item-subtitle="{ item }">
          <div class="text-sm text-muted-foreground truncate">
            {{ item.shipName || item.ship_name }}{{ item.ship_customer ? `/${item.ship_customer}` : '' }}
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">{{ item.ship_from }} → {{ item.ship_to }}</div>
        </template>
        <template #item-details="{ item }">
          <div class="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>{{ item.send_num }}块</span>
            <span>{{ formatNumber(item.send_weight) }}吨</span>
            <span v-if="hasPrivilegePrice" class="text-muted-foreground">
              单价: ¥{{ formatNumber(item.vessel_price || 0) }}
            </span>
            <span v-if="hasPrivilegePrice" class="text-primary font-medium">
              ¥{{ formatNumber((item.vessel_price || 0) * item.send_weight) }}
            </span>
          </div>
        </template>
      </SettleBasket>

      <!-- 飞行动画元素 -->
      <Teleport to="body">
        <div
          v-for="item in flyingItems"
          :key="item.id"
          class="flying-item"
          :style="{
            '--start-x': `${item.x}px`,
            '--start-y': `${item.y}px`,
            '--end-x': `${item.targetX}px`,
            '--end-y': `${item.targetY}px`,
          }"
        >
          <div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
            <ShoppingCart class="w-4 h-4 text-white" />
          </div>
        </div>
      </Teleport>

      <!-- 导出对话框 -->
      <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />

      <!-- 确认对话框：选中船下的车 -->
      <ConfirmDialog
        v-model:open="selectVehiclesDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmSelectVehicles"
      >
        <template #title>选择车辆</template>
        <template #description>
          <div v-if="selectVehiclesDialogData" class="space-y-2">
            <p>该船运单下有 {{ Object.keys(selectVehiclesDialogData.vehObj || {}).length }} 辆车：</p>
            <p class="text-sm text-muted-foreground">
              {{
                Object.values(selectVehiclesDialogData.vehObj || {})
                  .map((veh: any) => veh.name)
                  .join('、')
              }}
            </p>
            <p class="mt-4">是否同时选中这些车？</p>
          </div>
        </template>
      </ConfirmDialog>

      <!-- 确认对话框：结算篮价格输入 -->
      <ConfirmDialog
        v-model:open="basketPriceDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBasketPrice"
      >
        <template #title>输入价格</template>
        <template #description>
          <div class="space-y-2">
            <p>结算篮中有 {{ basketPriceDialogData.length }} 条记录还没有输入价格</p>
            <p class="mt-4">是否现在输入价格？</p>
            <p class="text-sm text-muted-foreground">点击"确定"打开价格输入对话框</p>
          </div>
        </template>
      </ConfirmDialog>

      <!-- 确认对话框：批量回执 -->
      <ConfirmDialog
        v-model:open="batchReceiptDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBatchReceipt"
      >
        <template #title>批量回执</template>
        <template #description>
          <p>您确定要批量设置回执吗？</p>
        </template>
      </ConfirmDialog>

      <!-- 确认对话框：批量不结算 -->
      <ConfirmDialog
        v-model:open="batchNotNeedDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBatchNotNeed"
      >
        <template #title>批量不结算</template>
        <template #description>
          <p>您确定要批量不结算操作吗？</p>
        </template>
      </ConfirmDialog>
    </div>
  </BasicPage>
</template>

<style scoped>
/* 价格模糊效果（无权限查看价格时） */
.blurred-price {
  position: relative;
  display: inline-block;
  color: transparent;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
  letter-spacing: 2px;
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 10px;
  border-radius: 5px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* 飞行动画 */
.flying-item {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  left: var(--start-x);
  top: var(--start-y);
  transform: translate(-50%, -50%);
  animation: fly-to-basket 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fly-to-basket {
  0% {
    left: var(--start-x);
    top: var(--start-y);
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.8);
  }
  100% {
    left: var(--end-x);
    top: var(--end-y);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
}
</style>
