<script setup lang="ts">
import dayjs from 'dayjs'
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  List,
  Loader2,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCompanies } from '@/services/api/data-dict.api'
import { getSettleBills, markNotRequireSettle, settleBills } from '@/services/api/settle.api'
import { useAuthStore } from '@/stores/auth'
import { sortByOrder, toExcelDate, toExcelNum } from '@/utils/format'
import { deleteSettle, getSettleList } from '@/services/api/ticket.api'

import type { SettleRecord } from './ticket-types'
import type { PriceInputData, SettleBill, SettleFilterParams, SettleMode, SettleObject } from './types'

import BatchPriceInputDialog from './components/BatchPriceInputDialog.vue'
import PriceInputDialog from './components/PriceInputDialog.vue'
import SettleCardContent from './components/SettleCardContent.vue'
import SettleFilter from './components/SettleFilter.vue'
import SettleTable from './components/SettleTable.vue'
import PublicBasketsDialog from './components/PublicBasketsDialog.vue'
import SettleBasket from './components/SettleBasket.vue'
import SettleDetailDialog from './components/SettleDetailDialog.vue'
import SettleRecordFilter from './components/SettleRecordFilter.vue'
import type { SettleRecordFilterParams } from './components/SettleRecordFilter.vue'
import { useSettleBasket } from './composables/useSettleBasket'
import { COLLECTION_SETTLE_FLAG, CUSTOMER_SETTLE_FLAG } from './types'

const route = useRoute()
const authStore = useAuthStore()
const { exportWithPicker, exportFromAOAWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = computed(() => route.query.selfOwned === 'true')

// 状态管理
const settleMode = ref<SettleMode>('CUSTOMER')
const viewTab = ref<'unsettled' | 'settled'>('unsettled') // 视图标签：未结算/已结算
const allBills = ref<SettleBill[]>([])
const displayBills = ref<SettleBill[]>([])
const selectedBills = ref<SettleBill[]>([])
const loading = ref(false) // 不自动加载数据，等用户点击查询
const dataLoaded = ref(false) // 是否已执行过主查询
const allBillingNames = ref<string[]>([]) // 全量开单名称（从 API 加载）
const showFilter = ref(true) // 默认显示过滤器
const showNonSettle = ref(false)

// 列显示控制（默认全部显示）
const showColStatus = ref(true)
const showColOrderNo = ref(true)
const showColBillNo = ref(true)
const showColBillingName = ref(true)
const showColVehicle = ref(true)
const showColNum = ref(true)
const showColWeight = ref(true)
const showColUnitPrice = ref(true)
const showColTotalPrice = ref(true)
const showColRoute = ref(true)
const showColWarehouse = ref(true)
const showColShipDate = ref(true)
const showColShipper = ref(true)
const showColSpec = ref(true)

const columnVisibility = computed(() => ({
  status: showColStatus.value,
  orderNo: showColOrderNo.value,
  billNo: showColBillNo.value,
  billingName: showColBillingName.value,
  vehicle: showColVehicle.value,
  num: showColNum.value,
  weight: showColWeight.value,
  unitPrice: showColUnitPrice.value,
  totalPrice: showColTotalPrice.value,
  route: showColRoute.value,
  warehouse: showColWarehouse.value,
  shipDate: showColShipDate.value,
  shipper: showColShipper.value,
  spec: showColSpec.value,
}))

// 判断两个提单是否相同
function isSameBill(bill1: SettleBill, bill2: SettleBill): boolean {
  return (
    bill1._id === bill2._id &&
    bill1.inv_no === bill2.inv_no &&
    bill1.veh_ves_name === bill2.veh_ves_name &&
    bill1.send_num === bill2.send_num &&
    bill1.send_weight === bill2.send_weight
  )
}

// 结算篮（使用composable，支持持久化）
const {
  basketItems: basketBills,
  showBasket,
  basketButtonRef,
  flyingItems,
  basketStatistics,
  isInBasket,
  addToBasket: composableAddToBasket,
  removeFromBasket: composableRemoveFromBasket,
  clearBasket: composableClearBasket,
  refreshBasketItems: refreshBasketBills,
  loadBasket,
  debouncedSave,
  isPublic,
  togglePublic,
  publicItems,
  showPublicBaskets,
  publicStatistics,
  loadPublicBaskets,
} = useSettleBasket<SettleBill>({
  basketType: 'bill',
  isSameItem: isSameBill,
  getPrice: (item: SettleBill) => (settleMode.value === 'CUSTOMER' ? item.price : item.collection_price),
  allItems: () => allBills.value,
})

// 结算篮卡片展开状态
const basketExpandedBills = ref(new Set<string>())
function toggleBillCardExpand(bill: SettleBill) {
  const key = `${bill._id}_${bill.inv_no}`
  if (basketExpandedBills.value.has(key)) {
    basketExpandedBills.value.delete(key)
  } else {
    basketExpandedBills.value.add(key)
  }
}

// 查看公开篮
async function handleShowPublicBaskets() {
  await loadPublicBaskets()
  showPublicBaskets.value = true
}

// 分页状态
const currentPage = ref(1)
const pageSize = ref(100)

// 对话框状态
const showPriceDialog = ref(false)
const showBatchPriceDialog = ref(false)
const currentBill = ref<SettleBill | null>(null)

// 过滤器引用
const settleFilterRef = ref<{ resetFilter: () => void } | null>(null)

// 已结算列表状态
const allSettledRecords = ref<SettleRecord[]>([])   // 全量（未过滤）
const settledRecords = ref<SettleRecord[]>([])       // 过滤后
const selectedSettles = ref<SettleRecord[]>([])
const showDetailDialog = ref(false)
const detailSettle = ref<SettleRecord | null>(null)
const showSettledFilter = ref(true)
const settledFilterRef = ref<InstanceType<typeof SettleRecordFilter> | null>(null)

// 过滤参数
const filterParams = ref<SettleFilterParams>({
  fType: 'invoice-first',
  fDate1: undefined,
  fDate2: undefined,
})

// 页面初始化
onMounted(async () => {
  loadBasket()
  // 加载全量开单名称列表（供筛选下拉用）
  try {
    const result = await getCompanies({ limit: 9999 })
    if (result.ok) {
      allBillingNames.value = result.data.map((c: any) => c.name).filter((n: string) => n).sort()
    }
  } catch { /* ignore */ }
})

// 监听 tab 切换（未结算 tab 不自动加载，需用户点击查询）
watch(viewTab, (newTab) => {
  if (newTab === 'settled') {
    loadSettledRecords()
  }
})

// 监听结算模式切换，重新加载当前 tab 的数据（保留筛选条件）
watch(settleMode, () => {
  if (viewTab.value === 'settled') {
    loadSettledRecords()
  } else {
    applyFrontendFilter()
  }
})

// 按结算状态过滤后的基础数据（传给 SettleFilter 作为二级筛选的数据源）
const baseBills = computed(() => {
  const flag = settleMode.value === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  return allBills.value.filter((bill) => {
    const price = bill[priceField]
    if (showNonSettle.value) {
      return price === -1
    } else {
      return (bill.inv_settle_flag & flag) !== flag && price >= 0
    }
  })
})

// 按结算状态过滤（用于对后端返回的数组做前端过滤）
function applySettleFilter(bills: SettleBill[]): SettleBill[] {
  const flag = settleMode.value === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  return bills.filter((bill) => {
    const price = bill[priceField]
    if (showNonSettle.value) {
      return price === -1
    } else {
      return (bill.inv_settle_flag & flag) !== flag && price >= 0
    }
  })
}

// 重新应用过滤（结算状态 + 二级筛选条件），用于模式切换、showNonSettle 变化等
function applyFrontendFilter() {
  let bills = applySettleFilter(allBills.value)
  const sets = buildFilterSets(filterParams.value)
  const hasSecondary = sets.fVeh || sets.fShipFrom || sets.fDest || sets.fOrder || sets.fBno || sets.fInvNo
  if (hasSecondary) {
    bills = bills.filter((bill) => matchesFilter(bill, sets))
  }
  displayBills.value = bills
  selectedBills.value = []
  currentPage.value = 1
}

// 将过滤条件数组转为 Set，提升 includes 查找为 O(1)
function toSet(arr: string[] | undefined): Set<string> | null {
  return arr && arr.length > 0 ? new Set(arr) : null
}

// 检测某条记录是否匹配指定的过滤条件（跳过 exclude 字段）
interface FilterSets {
  fName: Set<string> | null
  fVeh: Set<string> | null
  fShipFrom: Set<string> | null
  fDest: Set<string> | null
  fOrder: Set<string> | null
  fBno: Set<string> | null
  fInvNo: Set<string> | null
}

function buildFilterSets(fp: SettleFilterParams): FilterSets {
  return {
    fName: toSet(fp.fName),
    fVeh: toSet(fp.fVeh),
    fShipFrom: toSet(fp.fShipFrom),
    fDest: toSet(fp.fDest),
    fOrder: toSet(fp.fOrder),
    fBno: toSet(fp.fBno),
    fInvNo: toSet(fp.fInvNo),
  }
}

function matchesFilter(bill: SettleBill, sets: FilterSets, exclude?: string): boolean {
  if (exclude !== 'fName' && sets.fName && !sets.fName.has(bill.billing_name)) return false
  if (exclude !== 'fVeh' && sets.fVeh && !sets.fVeh.has(bill.veh_ves_name)) return false
  if (exclude !== 'fShipFrom' && sets.fShipFrom && !sets.fShipFrom.has(bill.ship_from)) return false
  if (exclude !== 'fDest' && sets.fDest && !sets.fDest.has(bill.ship_to)) return false
  if (exclude !== 'fOrder' && sets.fOrder && !sets.fOrder.has(bill.order_no)) return false
  if (exclude !== 'fBno' && sets.fBno && !sets.fBno.has(bill.bill_no)) return false
  if (exclude !== 'fInvNo' && sets.fInvNo && !sets.fInvNo.has(bill.inv_no)) return false
  return true
}

// 统计信息
const statistics = computed(() => {
  let totalNum = 0
  let totalWeight = 0
  let totalAmount = 0

  displayBills.value.forEach((bill) => {
    const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
    totalNum += bill.send_num
    totalWeight += bill.send_weight
    if (price > 0) {
      totalAmount += price * bill.send_weight
    }
  })

  return {
    count: displayBills.value.length,
    totalNum,
    totalWeight,
    totalAmount,
  }
})

// 已结算记录统计信息
const settledStatistics = computed(() => {
  let totalWeight = 0
  let totalAmount = 0

  settledRecords.value.forEach((record) => {
    totalWeight += record.ship_weight || 0
    totalAmount += record.price || 0
  })

  return {
    count: settledRecords.value.length,
    totalWeight,
    totalAmount,
  }
})

// 选中的统计信息
const selectedStatistics = computed(() => {
  let totalNum = 0
  let totalWeight = 0

  selectedBills.value.forEach((bill) => {
    totalNum += bill.send_num
    totalWeight += bill.send_weight
  })

  return { totalNum, totalWeight }
})

// basketStatistics is provided by useSettleBasket composable

// 检查另一个结算模式下是否有数据
const otherModeHasData = computed(() => {
  if (allBills.value.length === 0) return false

  const otherMode = settleMode.value === 'CUSTOMER' ? 'COLLECTION' : 'CUSTOMER'
  const flag = otherMode === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG
  const priceField = otherMode === 'CUSTOMER' ? 'price' : 'collection_price'

  const sets = buildFilterSets(filterParams.value)

  return allBills.value.some((bill) => {
    if (!matchesFilter(bill, sets)) return false
    const price = bill[priceField]
    if (showNonSettle.value) {
      return price === -1
    } else {
      return (bill.inv_settle_flag & flag) !== flag && price >= 0
    }
  })
})

// 分页计算
const totalPages = computed(() => Math.ceil(displayBills.value.length / pageSize.value))

const pagedBills = computed(() => displayBills.value)

// 切换结算模式
function switchMode(mode: SettleMode) {
  if (settleMode.value !== mode) {
    settleMode.value = mode
    if (viewTab.value === 'unsettled') {
      applyFrontendFilter()
    } else {
      loadSettledRecords()
    }
  }
}

// 切换视图标签
function switchViewTab(tab: 'unsettled' | 'settled') {
  if (viewTab.value !== tab) {
    viewTab.value = tab
    selectedBills.value = []
    selectedSettles.value = []
    if (tab === 'settled') {
      loadSettledRecords()
    }
  }
}


// 判断主条件（开单名称+日期）是否变化
const lastPrimaryName = ref<string[] | undefined>()
const lastPrimaryDate1 = ref<string | undefined>()
const lastPrimaryDate2 = ref<string | undefined>()

function isPrimaryChanged(params: SettleFilterParams): boolean {
  const nameStr = JSON.stringify(params.fName ?? [])
  const lastStr = JSON.stringify(lastPrimaryName.value ?? [])
  return nameStr !== lastStr
    || params.fDate1 !== lastPrimaryDate1.value
    || params.fDate2 !== lastPrimaryDate2.value
}

// 大数据量提醒
const LARGE_DATA_THRESHOLD = 5000
const showLargeDataWarning = ref(false)
const largeDataCount = ref(0)
const pendingQueryParams = ref<SettleFilterParams | null>(null)
const pendingQueryIsPrimary = ref(false)

// 用户确认加载大数据量：跳过阈值检查，直接展示已获取的数据
function confirmLoadLargeData() {
  if (pendingQueryParams.value) {
    applyLoadedData(pendingQueryParams.value, pendingQueryIsPrimary.value)
    pendingQueryParams.value = null
  }
}

// 将已获取的数据应用到视图
function applyLoadedData(params: SettleFilterParams, primaryChanged: boolean) {
  if (primaryChanged) {
    displayBills.value = applySettleFilter(allBills.value)
  } else {
    displayBills.value = applySettleFilter(allBills.value)
  }
  selectedBills.value = []
  currentPage.value = 1
  dataLoaded.value = true
}

// 每次查询都调后端
async function handleQuery(params: SettleFilterParams) {
  const primaryChanged = isPrimaryChanged(params)
  filterParams.value = params

  if (primaryChanged) {
    lastPrimaryName.value = params.fName
    lastPrimaryDate1.value = params.fDate1
    lastPrimaryDate2.value = params.fDate2
    // 主条件变了：加载全量数据
    loading.value = true
    try {
      const result = await getSettleBills({
        ...params,
        selfOwned: isSelfOwnedMode.value ? 1 : undefined,
      })
      if (result.ok) {
        const sorted = result.bills.sort((a: SettleBill, b: SettleBill) => {
          return new Date(b.inv_ship_date).getTime() - new Date(a.inv_ship_date).getTime()
        })
        allBills.value = sorted

        // 数据已拿到，检查过滤后的数量是否超过阈值
        const filtered = applySettleFilter(sorted)
        if (filtered.length > LARGE_DATA_THRESHOLD) {
          largeDataCount.value = filtered.length
          pendingQueryParams.value = params
          pendingQueryIsPrimary.value = true
          loading.value = false
          showLargeDataWarning.value = true
          return
        }

        displayBills.value = filtered
        selectedBills.value = []
        currentPage.value = 1
      } else {
        toast.error('获取数据失败')
      }
    } catch (error: any) {
      toast.error(error.message || '获取数据失败')
    } finally {
      loading.value = false
    }
  } else {
    // 主条件没变：只用全部参数加载展示数据，不更新 allBills（下拉选项不变）
    loading.value = true
    try {
      const result = await getSettleBills({
        ...params,
        selfOwned: isSelfOwnedMode.value ? 1 : undefined,
      })
      if (result.ok) {
        const sorted = result.bills.sort((a: SettleBill, b: SettleBill) => {
          return new Date(b.inv_ship_date).getTime() - new Date(a.inv_ship_date).getTime()
        })

        // 数据已拿到，检查过滤后的数量是否超过阈值
        const filtered = applySettleFilter(sorted)
        if (filtered.length > LARGE_DATA_THRESHOLD) {
          // 暂存数据到 allBills 备用，但不展示
          largeDataCount.value = filtered.length
          pendingQueryParams.value = params
          pendingQueryIsPrimary.value = false
          loading.value = false
          showLargeDataWarning.value = true
          // 暂存 sorted 到 allBills 以便确认后使用（二级筛选场景下不更新 allBills）
          return
        }

        displayBills.value = filtered
        selectedBills.value = []
        currentPage.value = 1
      } else {
        toast.error('获取数据失败')
      }
    } catch (error: any) {
      toast.error(error.message || '获取数据失败')
    } finally {
      loading.value = false
    }
  }

  dataLoaded.value = true
}

// 更新显示的提单列表（重新调后端获取最新数据，保持当前筛选条件）
async function updateDisplayBills(preserveSelection = true) {
  const prevSelectedIds = preserveSelection ? new Set(selectedBills.value.map((b) => b._id)) : null
  if (dataLoaded.value) {
    await handleQuery(filterParams.value)
  }
  // 价格保存后恢复选中状态
  if (prevSelectedIds && prevSelectedIds.size > 0) {
    selectedBills.value = displayBills.value.filter((b) => prevSelectedIds.has(b._id))
  }
  refreshBasketBills()
}

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

// 监听显示不需要结算的开关
watch(showNonSettle, () => {
  applyFrontendFilter()
})

// 智能价格输入（根据选择数量自动判断）
function openPriceDialog() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要输入价格的提单')
    return
  }

  // 根据选择数量自动打开对应的对话框
  if (selectedBills.value.length === 1) {
    currentBill.value = selectedBills.value[0]
    showPriceDialog.value = true
  } else {
    showBatchPriceDialog.value = true
  }
}

// 保存价格
async function savePrices(data: PriceInputData[]) {
  // 逻辑在对话框组件中处理
}

// 结算
async function handleSettle() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要结算的提单')
    return
  }

  // 验证：同一批次只能选择相同开单名称
  const billingNames = [...new Set(selectedBills.value.map((b) => b.billing_name))]
  if (billingNames.length > 1) {
    toast.error('您选择的提单中存在多个开单名称，一次只能结算一个开单名称的提单')
    return
  }

  // 验证：价格必须已输入
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  for (const bill of selectedBills.value) {
    const price = bill[priceField]
    if (price === -1) {
      toast.error(`提单 ${bill.bill_no}_${bill.order_no} 已确定为不需要结算`)
      return
    }
    if (price === 0) {
      toast.error(`提单 ${bill.bill_no}_${bill.order_no} 还没有完全输入价格，不能结算`)
      return
    }
  }

  const confirmed = window.confirm('确定要结算选中的提单吗？')
  if (!confirmed) return

  loading.value = true
  try {
    const settleObj: SettleObject[] = []
    let totalPrice = 0

    selectedBills.value.forEach((bill) => {
      const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
      totalPrice += price * bill.send_weight

      if (settleMode.value === 'COLLECTION') {
        bill.inv_settle_flag |= COLLECTION_SETTLE_FLAG
        bill.settle_flag = (bill.settle_flag || 0) | COLLECTION_SETTLE_FLAG
      } else {
        bill.inv_settle_flag |= CUSTOMER_SETTLE_FLAG
      }

      settleObj.push({
        bid: bill._id,
        inv_no: bill.inv_no,
        num: bill.send_num,
        weight: bill.send_weight,
        settle_flag: bill.inv_settle_flag,
      })
    })

    const shipToList = [...new Set(selectedBills.value.map((b) => b.ship_to))]
    const firstBill = selectedBills.value[0]
    const billName = firstBill.ship_customer
      ? `${firstBill.billing_name}/${firstBill.ship_customer}`
      : firstBill.billing_name

    const result = await settleBills({
      settleObj,
      price: totalPrice,
      settle_type: settleMode.value,
      billName,
      shipTo: shipToList.join(','),
    })

    if (result.ok) {
      toast.success('结算成功')
      updateDisplayBills(false)
    } else {
      toast.error(result.message || '结算失败')
    }
  } catch (error: any) {
    toast.error(error.message || '结算失败')
  } finally {
    loading.value = false
  }
}

// 标记不需要结算
async function handleMarkNotRequireSettle() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择不打算进行结算的提单')
    return
  }

  // 检查是否已输入价格
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  const hasPrice = selectedBills.value.some((b) => b[priceField] > 0)

  let confirmed = true
  if (hasPrice) {
    confirmed = window.confirm('您选择的提单中已经输入过价格，不结算后这些价格都会清除为0，确认吗？')
  } else {
    confirmed = window.confirm('确定标记选中的提单为不需要结算吗？')
  }

  if (!confirmed) return

  loading.value = true
  try {
    const nonSettleObj = selectedBills.value.map((bill) => {
      if (settleMode.value === 'CUSTOMER') {
        bill.inv_settle_flag &= ~CUSTOMER_SETTLE_FLAG
        bill.price = -1
        return { bid: bill._id, inv_no: bill.inv_no }
      } else {
        bill.inv_settle_flag &= ~COLLECTION_SETTLE_FLAG
        bill.collection_price = -1
        return { bid: bill._id, inv_no: bill.inv_no, settle_flag: bill.inv_settle_flag }
      }
    })

    const result = await markNotRequireSettle({
      nonSettleObj,
      settle_type: settleMode.value,
    })

    if (result.ok) {
      toast.success('标记成功')
      updateDisplayBills(false)
    } else {
      toast.error(result.message || '标记失败')
    }
  } catch (error: any) {
    toast.error(error.message || '标记失败')
  } finally {
    loading.value = false
  }
}

// 重置过滤
function handleResetFilter() {
  if (settleFilterRef.value) {
    settleFilterRef.value.resetFilter()
  }
}

// ==================== 结算篮功能 ====================
// addToBasket, removeFromBasket, clearBasket, isInBasket, refreshBasketBills
// are provided by useSettleBasket composable

// 添加选中的提单到结算篮（包装 composable 方法，清除选中状态）
function addToBasket() {
  const added = composableAddToBasket(selectedBills.value)
  if (added) {
    selectedBills.value = []
  }
}

// 结算篮导出
function handleExportFromBasket() {
  if (basketBills.value.length === 0) {
    toast.warning('结算篮为空')
    return
  }

  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  const columns = [
    '开单名称',
    '运单号',
    '车船号',
    '始发地',
    '目的地',
    '块数',
    '发运量',
    '单价',
    '总价格',
    '发货日期',
  ]
  const data: any[][] = [columns]

  basketBills.value.forEach((bill: SettleBill) => {
    const price = bill[priceField] || 0
    data.push([
      bill.billing_name,
      bill.inv_no,
      bill.veh_ves_name,
      bill.ship_from || '',
      bill.ship_to || '',
      toExcelNum(bill.send_num),
      toExcelNum(bill.send_weight),
      toExcelNum(price),
      toExcelNum(price > 0 ? price * bill.send_weight : 0),
      toExcelDate(bill.inv_ship_date),
    ])
  })

  // 列格式：块数(5)无, 发运量(6)重量, 单价(7)金额, 总价格(8)金额
  const columnFormats = [null, null, null, null, null, null, '0.000', '0.00', '0.00', null]
  exportFromAOAWithPicker(data, `结算篮_客户_${dayjs().format('YYYY-MM-DD')}`, '结算篮', columnFormats)
}

// 结算篮价格设置
function handlePriceInputFromBasket() {
  if (basketBills.value.length === 0) {
    toast.warning('结算篮为空')
    return
  }
  selectedBills.value = [...basketBills.value]
  showBatchPriceDialog.value = true
}

// 公开篮导出
function handleExportFromPublicBaskets() {
  if (publicItems.value.length === 0) {
    toast.warning('公开篮为空')
    return
  }

  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  const columns = [
    '用户',
    '开单名称',
    '运单号',
    '车船号',
    '始发地',
    '目的地',
    '块数',
    '发运量',
    '单价',
    '总价格',
    '发货日期',
  ]
  const data: any[][] = [columns]

  publicItems.value.forEach((bill: any) => {
    const price = bill[priceField] || 0
    data.push([
      bill._basketOwner || '',
      bill.billing_name,
      bill.inv_no,
      bill.veh_ves_name,
      bill.ship_from || '',
      bill.ship_to || '',
      toExcelNum(bill.send_num),
      toExcelNum(bill.send_weight),
      toExcelNum(price),
      toExcelNum(price > 0 ? price * bill.send_weight : 0),
      toExcelDate(bill.inv_ship_date),
    ])
  })

  // 列格式：发运量(7)重量, 单价(8)金额, 总价格(9)金额
  const columnFormats = [null, null, null, null, null, null, null, '0.000', '0.00', '0.00', null]
  exportFromAOAWithPicker(data, `公开篮_客户_${dayjs().format('YYYY-MM-DD')}`, '公开篮', columnFormats)
}

// 公开篮价格设置
function handlePriceInputFromPublicBaskets() {
  if (publicItems.value.length === 0) {
    toast.warning('公开篮为空')
    return
  }
  selectedBills.value = [...publicItems.value]
  showBatchPriceDialog.value = true
}

// 从结算篮结算
async function handleSettleFromBasket() {
  if (basketBills.value.length === 0) {
    toast.warning('结算篮为空，请先添加提单')
    return
  }

  // 验证：同一批次只能选择相同开单名称
  const billingNames = [...new Set(basketBills.value.map((b) => b.billing_name))]
  if (billingNames.length > 1) {
    toast.error('结算篮中存在多个开单名称，一次只能结算一个开单名称的提单')
    return
  }

  // 检查价格输入情况
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  const billsWithoutPrice = basketBills.value.filter((bill) => bill[priceField] === 0)
  const billsNotRequireSettle = basketBills.value.filter((bill) => bill[priceField] === -1)

  // 如果有标记为不需要结算的提单
  if (billsNotRequireSettle.length > 0) {
    toast.error(`结算篮中有 ${billsNotRequireSettle.length} 条提单已确定为不需要结算，请先移除`)
    return
  }

  // 如果有未输入价格的提单，提示用户输入
  if (billsWithoutPrice.length > 0) {
    const confirmed = window.confirm(
      `结算篮中有 ${billsWithoutPrice.length} 条提单还没有输入价格，是否现在输入价格？\n\n点击"确定"打开价格输入对话框`,
    )
    if (confirmed) {
      // 选中这些没有价格的提单
      selectedBills.value = billsWithoutPrice
      // 根据数量打开相应的价格输入对话框
      if (billsWithoutPrice.length === 1) {
        currentBill.value = billsWithoutPrice[0]
        showPriceDialog.value = true
      } else {
        showBatchPriceDialog.value = true
      }
    }
    return
  }

  const confirmed = window.confirm(`确定要结算结算篮中的 ${basketBills.value.length} 条提单吗？`)
  if (!confirmed) return

  loading.value = true
  try {
    const settleObj: SettleObject[] = []
    let totalPrice = 0

    basketBills.value.forEach((bill) => {
      const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
      totalPrice += price * bill.send_weight

      if (settleMode.value === 'COLLECTION') {
        bill.inv_settle_flag |= COLLECTION_SETTLE_FLAG
        bill.settle_flag = (bill.settle_flag || 0) | COLLECTION_SETTLE_FLAG
      } else {
        bill.inv_settle_flag |= CUSTOMER_SETTLE_FLAG
      }

      settleObj.push({
        bid: bill._id,
        inv_no: bill.inv_no,
        num: bill.send_num,
        weight: bill.send_weight,
        settle_flag: bill.inv_settle_flag,
      })
    })

    const shipToList = [...new Set(basketBills.value.map((b) => b.ship_to))]
    const firstBill = basketBills.value[0]
    const billName = firstBill.ship_customer
      ? `${firstBill.billing_name}/${firstBill.ship_customer}`
      : firstBill.billing_name

    const result = await settleBills({
      settleObj,
      price: totalPrice,
      settle_type: settleMode.value,
      billName,
      shipTo: shipToList.join(','),
    })

    if (result.ok) {
      toast.success('结算成功')
      composableClearBasket() // 清空结算篮并同步到数据库
      showBasket.value = false
      updateDisplayBills(false)
    } else {
      toast.error(result.message || '结算失败')
    }
  } catch (error: any) {
    toast.error(error.message || '结算失败')
  } finally {
    loading.value = false
  }
}

// 导出
function handleExport() {
  if (displayBills.value.length === 0) {
    toast.warning('没有数据可以导出')
    return
  }

  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'

  // 按订单号排序
  const sorted = sortByOrder(displayBills.value)

  const data = sorted.map((bill) => {
    const price = bill[priceField]
    const orderDisplay = bill.order_item_no
      ? `${bill.order_no}-${String(bill.order_item_no).padStart(3, '0')}`
      : bill.order_no
    const name = bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name
    const spec = `${bill.thickness}*${bill.width}*${bill.len}`
    const specSize = getSpecSize(bill.width, bill.len)

    return {
      status: getSettleStatus(bill),
      order_no: orderDisplay,
      bill_no: bill.bill_no,
      billing_name: name,
      veh_ves_name: bill.veh_ves_name,
      ship_to: bill.ship_to,
      total_price: price > 0 ? price * bill.send_weight : '',
      price: price < 0 ? '不需要结算' : toExcelNum(price),
      send_num: toExcelNum(bill.send_num),
      send_weight: toExcelNum(bill.send_weight),
      ship_from: bill.ship_from,
      ship_warehouse: bill.ship_warehouse || '',
      ship_date: toExcelDate(bill.inv_ship_date),
      shipper: bill.inv_shipper || '',
      inv_no: bill.inv_no,
      spec_size: specSize,
      spec,
      contract_no: bill.contract_no || '',
    }
  })

  exportWithPicker({
    fileName: `结算数据_${settleMode.value}_${new Date().toLocaleDateString()}`,
    sheetName: '结算数据',
    columns: [
      { header: '状态', key: 'status' },
      { header: '订单号', key: 'order_no' },
      { header: '提单号', key: 'bill_no' },
      { header: '开单名称', key: 'billing_name' },
      { header: '车船', key: 'veh_ves_name' },
      { header: '目的地', key: 'ship_to' },
      { header: '块数', key: 'send_num', type: 'number' },
      { header: '发运量', key: 'send_weight', type: 'weight' },
      { header: '单价', key: 'price', type: 'amount' },
      { header: '总价格', key: 'total_price', type: 'amount' },
      { header: '起始地', key: 'ship_from' },
      { header: '发货仓库', key: 'ship_warehouse' },
      { header: '发货日期', key: 'ship_date', type: 'datetime' },
      { header: '发货人', key: 'shipper' },
      { header: '运单号', key: 'inv_no' },
      { header: '规格大小', key: 'spec_size' },
      { header: '规格', key: 'spec' },
      { header: '合同号', key: 'contract_no' },
    ],
    data,
  })
}

// 获取价格显示文本
function getPriceText(price: number): string {
  if (price > 0) return price.toString()
  if (price < 0) return '不需要结算'
  return '0'
}

// 获取规格大小
function getSpecSize(width: number, len: number): string {
  if (width < 3000 && len < 13500) return '正常'
  if ((width >= 3000 && width < 3300) || (len >= 13500 && len < 16500)) return '超长宽'
  if (width >= 3300 || len >= 16500) return '特长宽'
  return ''
}

// 获取结算状态
function getSettleStatus(bill: SettleBill): string {
  if (!bill.inv_settle_flag || bill.inv_settle_flag === 0) {
    if (bill.price === -1 && bill.collection_price === -1) return '客户,代收不需结算'
    if (bill.price === -1) return '客户不需结算'
    if (bill.collection_price === -1) return '代收不需结算'
    return '未结算'
  }

  const statusText: string[] = []
  if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG) {
    statusText.push('客户')
  }
  if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG) {
    statusText.push('代收付')
  }
  return `${statusText.join(',')}已结算`
}

// 加载已结算记录
async function loadSettledRecords() {
  loading.value = true
  try {
    const result = await getSettleList({
      settle_type: settleMode.value,
      display_mode: 'settle',
      selfOwned: isSelfOwnedMode.value ? '1' : '0',
    })
    if (result.ok) {
      allSettledRecords.value = result.settles
      settledRecords.value = result.settles
    } else {
      toast.error('获取已结算记录失败')
    }
  } catch (error: any) {
    console.error('loadSettledRecords error:', error)
    toast.error(error.message || '获取已结算记录失败')
  } finally {
    loading.value = false
  }
}

// 已结算记录过滤
function handleSettledFilter(params: SettleRecordFilterParams) {
  let filtered = allSettledRecords.value

  if (params.billingName) {
    filtered = filtered.filter(s => s.billing_name === params.billingName)
  }
  if (params.serialNumber) {
    filtered = filtered.filter(s => s.serial_number === params.serialNumber)
  }
  if (params.shipTo) {
    filtered = filtered.filter(s => s.ship_to === params.shipTo)
  }
  if (params.startDate && params.endDate) {
    filtered = filtered.filter(s => {
      if (!s.settle_date) return false
      const d = new Date(s.settle_date)
      const start = new Date(params.startDate)
      const end = new Date(params.endDate)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      return d >= start && d <= end
    })
  }

  settledRecords.value = [...filtered].sort((a, b) => {
    return new Date(b.settle_date || 0).getTime() - new Date(a.settle_date || 0).getTime()
  })
  selectedSettles.value = []
}

// 删除结算
async function handleDeleteSettle() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要删除的结算记录')
    return
  }

  const confirmed = window.confirm(
    `确定要删除选中的 ${selectedSettles.value.length} 条结算记录吗？删除后提单将恢复到已配发状态！`,
  )
  if (!confirmed) return

  loading.value = true
  try {
    const result = await deleteSettle({
      settle_ids: selectedSettles.value.map((s) => s._id),
      settle_type: settleMode.value,
    })

    if (result.ok) {
      toast.success('删除成功')
      selectedSettles.value = []
      loadSettledRecords()
    } else {
      toast.error(result.message || '删除失败')
    }
  } catch (error: any) {
    toast.error(error.message || '删除失败')
  } finally {
    loading.value = false
  }
}

// 查看结算明细
function handleShowDetail() {
  if (selectedSettles.value.length !== 1) {
    toast.warning('请选择一条记录')
    return
  }
  detailSettle.value = selectedSettles.value[0]
  showDetailDialog.value = true
}

// 切换已结算记录选择
function toggleSettle(settle: SettleRecord) {
  const index = selectedSettles.value.findIndex((s) => s._id === settle._id)
  if (index >= 0) {
    const newSelected = [...selectedSettles.value]
    newSelected.splice(index, 1)
    selectedSettles.value = newSelected
  } else {
    selectedSettles.value = [...selectedSettles.value, settle]
  }
}

// 判断已结算记录是否选中
function isSettleSelected(settle: SettleRecord) {
  return selectedSettles.value.some((s) => s._id === settle._id)
}

// 切换全选已结算记录
function toggleAllSettles() {
  if (selectedSettles.value.length === settledRecords.value.length) {
    selectedSettles.value = []
  } else {
    selectedSettles.value = [...settledRecords.value]
  }
}

// 获取订单显示（包含项次号）
function getOrderDisplay(bill: SettleBill) {
  if (bill.order_item_no) {
    const itemNo = String(bill.order_item_no).padStart(3, '0')
    return `${bill.order_no}-${itemNo}`
  }
  return bill.order_no
}

// 获取结算状态样式类
function getStatusClass(bill: SettleBill): string {
  const status = getSettleStatus(bill)
  if (status.includes('已结算')) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status.includes('不需')) return 'bg-gray-50 text-gray-500 border-gray-200'
  return 'bg-orange-50 text-orange-700 border-orange-200'
}

// 获取卡片价格显示
function getCardPrice(bill: SettleBill): string {
  const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
  if (price <= 0) return getPriceText(price)
  const total = (price * bill.send_weight).toFixed(2)
  return `¥${price} → ¥${total}`
}

// 获取卡片价格样式类
function getCardPriceClass(bill: SettleBill): string {
  const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
  if (price > 0) return 'text-primary font-medium'
  if (price < 0) return 'text-gray-400'
  return 'text-orange-500'
}

// 切换单个提单选择（移动端卡片用）
function toggleBill(bill: SettleBill) {
  if (isInBasket(bill)) return
  const index = selectedBills.value.findIndex((b) => b._id === bill._id)
  if (index >= 0) {
    const newSelected = [...selectedBills.value]
    newSelected.splice(index, 1)
    selectedBills.value = newSelected
  } else {
    selectedBills.value = [...selectedBills.value, bill]
  }
}

// 判断提单是否选中
function isBillSelected(bill: SettleBill): boolean {
  return selectedBills.value.some((b) => b._id === bill._id)
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '结算管理(自有车)' : '结算管理'"
    :description="isSelfOwnedMode ? '自有车客户结算和南钢结算（代收代付）管理' : '客户结算和南钢结算（代收代付）管理'"
  >
    <Tabs v-model="viewTab" class="w-full">
      <!-- 操作栏：移动端 -->
      <div class="md:hidden space-y-2 mb-4" :class="{ 'pointer-events-none opacity-50': loading }">
        <!-- 第一行：结算模式切换 + 未结算/已结算切换 -->
        <div class="flex items-center justify-between">
          <div class="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium border rounded-l-lg"
              :class="[
                settleMode === 'CUSTOMER'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input',
              ]"
              @click="switchMode('CUSTOMER')"
            >
              客户
            </button>
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium border-l-0 rounded-r-lg"
              :class="[
                settleMode === 'COLLECTION'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input',
              ]"
              @click="switchMode('COLLECTION')"
            >
              南钢
            </button>
          </div>
          <TabsList :class="{ 'pointer-events-none opacity-50': loading }">
            <TabsTrigger value="unsettled" class="w-[80px]"> 未结算 </TabsTrigger>
            <TabsTrigger value="settled" class="w-[80px]"> 已结算 </TabsTrigger>
          </TabsList>
        </div>
        <!-- 第二行：图标按钮横向排列 -->
        <div class="flex items-center gap-1.5 overflow-x-auto">
          <template v-if="viewTab === 'unsettled'">
            <UiButton
              variant="outline"
              size="icon"
              class="shrink-0 h-8 w-8 relative"
              title="价格输入"
              :disabled="selectedBills.length === 0"
              @click="openPriceDialog"
            >
              <span class="font-bold text-sm">¥</span>
              <span
                v-if="selectedBills.length > 0"
                class="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center"
                >{{ selectedBills.length }}</span
              >
            </UiButton>
            <UiButton
              variant="outline"
              size="icon"
              class="shrink-0 h-8 w-8"
              title="过滤"
              @click="showFilter = !showFilter"
            >
              <Filter class="w-4 h-4" />
            </UiButton>
            <UiButton
              variant="outline"
              size="icon"
              class="shrink-0 h-8 w-8"
              title="导出"
              :disabled="displayBills.length === 0"
              @click="handleExport"
            >
              <Download class="w-4 h-4" />
            </UiButton>
            <UiButton
              ref="basketButtonRef"
              variant="default"
              size="icon"
              class="shrink-0 h-8 w-8 relative"
              title="结算篮"
              @click="showBasket = true"
            >
              <ShoppingCart class="w-4 h-4" />
              <span
                v-if="basketBills.length > 0"
                class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center animate-pulse"
                >{{ basketBills.length > 99 ? '99+' : basketBills.length }}</span
              >
            </UiButton>
            <UiButton
              variant="default"
              size="sm"
              :disabled="selectedBills.length === 0 || loading"
              @click="handleSettle"
            >
              直接结算
            </UiButton>
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedBills.length === 0 || loading"
              @click="handleMarkNotRequireSettle"
            >
              不需要结算
            </UiButton>
          </template>
          <template v-else>
            <UiButton
              variant="outline"
              size="icon"
              class="shrink-0 h-8 w-8"
              title="查看结算明细"
              :disabled="selectedSettles.length !== 1"
              @click="handleShowDetail"
            >
              <List class="w-4 h-4" />
            </UiButton>
            <UiButton
              variant="destructive"
              size="icon"
              class="shrink-0 h-8 w-8"
              title="删除结算"
              :disabled="selectedSettles.length === 0 || loading"
              @click="handleDeleteSettle"
            >
              <Trash2 class="w-4 h-4" />
            </UiButton>
          </template>
        </div>
      </div>

      <!-- 操作栏：桌面端 -->
      <div class="hidden md:flex items-center justify-between mb-4">
        <!-- 操作按钮组 -->
        <div class="flex items-center gap-2" :class="{ 'pointer-events-none opacity-50': loading }">
          <!-- 结算模式切换 -->
          <div class="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium border rounded-l-lg"
              :class="[
                settleMode === 'CUSTOMER'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input',
              ]"
              @click="switchMode('CUSTOMER')"
            >
              客户结算
            </button>
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium border-l-0 rounded-r-lg"
              :class="[
                settleMode === 'COLLECTION'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input',
              ]"
              @click="switchMode('COLLECTION')"
            >
              南钢结算
            </button>
          </div>

          <!-- 未结算操作按钮 -->
          <template v-if="viewTab === 'unsettled'">
            <!-- 价格输入（智能） -->
            <UiButton variant="outline" size="sm" :disabled="selectedBills.length === 0" @click="openPriceDialog">
              <span class="mr-1 font-semibold">¥</span>
              价格输入
              <span v-if="selectedBills.length > 0" class="ml-1 text-xs opacity-70">
                ({{ selectedBills.length }})
              </span>
            </UiButton>

            <!-- 过滤和导出 -->
            <UiButton variant="outline" size="sm" @click="showFilter = !showFilter">
              <Filter class="w-4 h-4 mr-1" />
              过滤
            </UiButton>
            <UiButton variant="outline" size="sm" :disabled="displayBills.length === 0" @click="handleExport">
              <Download class="w-4 h-4 mr-1" />
              导出
            </UiButton>

            <!-- 结算篮按钮 -->
            <UiButton ref="basketButtonRef" variant="default" size="sm" class="relative" @click="showBasket = true">
              <ShoppingCart class="w-4 h-4 mr-1" />
              结算篮
              <span
                v-if="basketBills.length > 0"
                class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse"
              >
                {{ basketBills.length > 99 ? '99+' : basketBills.length }}
              </span>
            </UiButton>

            <!-- 查看公开篮 -->
            <UiButton
              v-if="authStore.features.publicBasket"
              variant="outline"
              size="sm"
              @click="handleShowPublicBaskets"
            >
              <Users class="w-4 h-4 mr-1" />
              公开篮
            </UiButton>

            <!-- 原有结算操作 -->
            <UiButton
              variant="default"
              size="sm"
              :disabled="selectedBills.length === 0 || loading"
              @click="handleSettle"
            >
              直接结算
            </UiButton>
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedBills.length === 0 || loading"
              @click="handleMarkNotRequireSettle"
            >
              不需要结算
            </UiButton>
          </template>

          <!-- 已结算操作按钮 -->
          <template v-else>
            <UiButton variant="outline" size="sm" :disabled="selectedSettles.length !== 1" @click="handleShowDetail">
              <List class="w-4 h-4 mr-1" />
              查看结算明细
            </UiButton>
            <UiButton
              variant="destructive"
              size="sm"
              :disabled="selectedSettles.length === 0 || loading"
              @click="handleDeleteSettle"
            >
              删除结算
            </UiButton>
          </template>
        </div>

        <TabsList :class="{ 'pointer-events-none opacity-50': loading }">
          <TabsTrigger value="unsettled" class="w-[120px]"> 未结算 </TabsTrigger>
          <TabsTrigger value="settled" class="w-[120px]"> 已结算 </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="unsettled" class="space-y-4" force-mount v-show="viewTab === 'unsettled'">
        <!-- 过滤器 -->
        <SettleFilter
          v-show="showFilter"
          ref="settleFilterRef"
          v-model:show-non-settle="showNonSettle"
          :class="{ 'pointer-events-none opacity-50': loading }"
          :settle-mode="settleMode"
          :loading="loading"
          :data-loaded="dataLoaded"
          :all-billing-names="allBillingNames"
          :bills="baseBills"
          @query="handleQuery"
        />

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-20">
          <Loader2 class="w-8 h-8 animate-spin text-primary mb-2" />
          <span class="text-muted-foreground text-sm">正在加载数据...</span>
        </div>

        <!-- 未查询提示 -->
        <div v-else-if="!dataLoaded" class="flex flex-col items-center justify-center py-20">
          <Search class="w-8 h-8 text-muted-foreground/50 mb-2" />
          <span class="text-muted-foreground text-sm">请选择开单名称和日期范围，点击查询</span>
        </div>

        <!-- 汇总统计信息：桌面端 -->
        <div
          v-if="dataLoaded && !loading"
          class="hidden md:flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm"
          :class="{ 'pointer-events-none opacity-50': loading }"
        >
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ statistics.totalWeight.toFixed(3) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ statistics.totalAmount.toFixed(2) }}</strong></span
          >
          <span v-if="selectedBills.length > 0" class="text-primary font-medium">
            已选: {{ selectedStatistics.totalNum }}块 / {{ selectedStatistics.totalWeight.toFixed(3) }}吨
          </span>
          <!-- 加入结算篮按钮 -->
          <UiButton
            v-if="selectedBills.length > 0"
            variant="default"
            size="sm"
            class="bg-orange-500 hover:bg-orange-600 text-white"
            @click="addToBasket"
          >
            <ShoppingCart class="w-4 h-4 mr-1" />
            加入结算篮 ({{ selectedBills.length }})
          </UiButton>
          <div class="ml-auto flex items-center gap-2">
            <div class="flex items-center gap-2">
              <input
                id="show-non-settle-main"
                v-model="showNonSettle"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
              <label for="show-non-settle-main" class="text-sm cursor-pointer whitespace-nowrap"> 不需要结算 </label>
            </div>
            <UiButton variant="outline" size="sm" @click="handleResetFilter"> 重置 </UiButton>
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
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColStatus" />
                      <span class="text-sm">状态</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColOrderNo" />
                      <span class="text-sm">订单号</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColBillNo" />
                      <span class="text-sm">提单号</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColBillingName" />
                      <span class="text-sm">开单名称</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColVehicle" />
                      <span class="text-sm">车船/运单号</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColNum" />
                      <span class="text-sm">块数</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColWeight" />
                      <span class="text-sm">发运量</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColUnitPrice" />
                      <span class="text-sm">单价</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColTotalPrice" />
                      <span class="text-sm">总价格</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColRoute" />
                      <span class="text-sm">始发→目的地</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColWarehouse" />
                      <span class="text-sm">发货仓库</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColShipDate" />
                      <span class="text-sm">发货日期</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColShipper" />
                      <span class="text-sm">发货人</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColSpec" />
                      <span class="text-sm">规格</span>
                    </label>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <!-- 汇总统计信息：移动端 -->
        <div
          v-if="dataLoaded && !loading"
          class="md:hidden px-3 py-2 bg-muted/50 rounded-lg border text-sm space-y-2"
          :class="{ 'pointer-events-none opacity-50': loading }"
        >
          <div class="grid grid-cols-2 gap-1">
            <span class="text-muted-foreground"
              >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
            >
            <span class="text-muted-foreground"
              >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
            >
            <span class="text-muted-foreground"
              >重量: <strong class="text-foreground">{{ statistics.totalWeight.toFixed(3) }}</strong></span
            >
            <span class="text-muted-foreground"
              >金额: <strong class="text-foreground">¥{{ statistics.totalAmount.toFixed(2) }}</strong></span
            >
          </div>
          <div class="flex items-center gap-2">
            <input
              id="show-non-settle-mobile"
              v-model="showNonSettle"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <label for="show-non-settle-mobile" class="text-sm cursor-pointer whitespace-nowrap"> 不需要结算 </label>
            <span v-if="selectedBills.length > 0" class="text-primary font-medium text-xs ml-auto">
              已选: {{ selectedStatistics.totalNum }}块 / {{ selectedStatistics.totalWeight.toFixed(3) }}吨
            </span>
          </div>
          <UiButton
            v-if="selectedBills.length > 0"
            variant="default"
            size="sm"
            class="bg-orange-500 hover:bg-orange-600 text-white w-full"
            @click="addToBasket"
          >
            <ShoppingCart class="w-4 h-4 mr-1" />
            加入结算篮 ({{ selectedBills.length }})
          </UiButton>
        </div>

        <!-- 数据表格：桌面端 -->
        <div class="hidden lg:block">
          <SettleTable
            v-if="dataLoaded && !loading"
            v-model:selected="selectedBills"
            :bills="pagedBills"
            :settle-mode="settleMode"
            :loading="loading"
            :other-mode-has-data="otherModeHasData"
            :basket-bills="basketBills"
            :column-visibility="columnVisibility"
            @switch-mode="switchMode"
          />
        </div>

        <!-- 数据卡片：移动端 -->
        <div v-if="dataLoaded && !loading" class="lg:hidden space-y-2">
          <div
            v-if="pagedBills.length === 0 && !loading"
            class="border rounded-lg p-8 text-center text-muted-foreground"
          >
            暂无数据，请调整筛选条件后重新查询
          </div>

          <div
            v-for="bill in pagedBills"
            :key="bill._id"
            class="relative flex items-center gap-3 p-3 rounded-lg border transition-colors"
            :class="{
              'bg-orange-50 border-l-4 border-l-orange-500 opacity-60': isInBasket(bill),
              'bg-amber-100 border-l-4 border-l-amber-500': !isInBasket(bill) && isBillSelected(bill),
              'bg-muted/30 hover:border-primary/30': !isInBasket(bill) && !isBillSelected(bill),
            }"
            @click="toggleBill(bill)"
          >
            <!-- 已在结算篮 -->
            <template v-if="isInBasket(bill)">
              <ShoppingCart class="w-5 h-5 text-orange-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <span class="font-medium text-sm truncate">{{ getOrderDisplay(bill) }}</span>
                <span class="ml-2 text-xs text-orange-500">已在结算篮</span>
              </div>
              <button
                class="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0"
                title="从结算篮移除"
                @click.stop="composableRemoveFromBasket(bill)"
              >
                <X class="w-4 h-4" />
              </button>
            </template>

            <!-- 正常状态 -->
            <template v-else>
              <input
                :checked="isBillSelected(bill)"
                type="checkbox"
                class="h-4 w-4 shrink-0 cursor-pointer"
                @click.stop="toggleBill(bill)"
              />
              <SettleCardContent
                :order-no="getOrderDisplay(bill)"
                :status="getSettleStatus(bill)"
                :status-class="getStatusClass(bill)"
                :in-basket="isInBasket(bill)"
                :billing-name="bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name"
                :ship-from="bill.ship_from"
                :ship-to="bill.ship_to"
                :ship-date="bill.inv_ship_date ? dayjs(bill.inv_ship_date).format('YYYY-MM-DD HH:mm:ss') : ''"
                :weight="`${bill.send_weight.toFixed(3)}吨`"
                :price="getCardPrice(bill)"
                :price-class="getCardPriceClass(bill)"
              />
            </template>
          </div>
        </div>


        <!-- 价格输入对话框 -->
        <PriceInputDialog
          v-if="currentBill"
          v-model:open="showPriceDialog"
          :bill="currentBill"
          :settle-mode="settleMode"
          @saved="updateDisplayBills"
        />

        <!-- 批量价格输入对话框 -->
        <BatchPriceInputDialog
          v-model:open="showBatchPriceDialog"
          :bills="selectedBills.length > 0 ? selectedBills : displayBills"
          :settle-mode="settleMode"
          @saved="updateDisplayBills"
        />
      </TabsContent>

      <!-- 已结算视图 -->
      <TabsContent value="settled" class="space-y-4" force-mount v-show="viewTab === 'settled'">
        <!-- 过滤器 -->
        <SettleRecordFilter ref="settledFilterRef" v-if="showSettledFilter" :records="allSettledRecords" @filter="handleSettledFilter" />

        <!-- 汇总统计：桌面端 -->
        <div class="hidden md:flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ settledStatistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ settledStatistics.totalWeight.toFixed(3) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ settledStatistics.totalAmount.toFixed(2) }}</strong></span
          >
          <span v-if="selectedSettles.length > 0" class="text-primary font-medium ml-auto">
            已选: {{ selectedSettles.length }} 条
          </span>
        </div>

        <!-- 汇总统计：移动端 -->
        <div class="md:hidden px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <div class="grid grid-cols-2 gap-1">
            <span class="text-muted-foreground"
              >记录数: <strong class="text-foreground">{{ settledStatistics.count }}</strong></span
            >
            <span class="text-muted-foreground"
              >重量: <strong class="text-foreground">{{ settledStatistics.totalWeight.toFixed(3) }}</strong></span
            >
            <span class="text-muted-foreground"
              >金额: <strong class="text-foreground">¥{{ settledStatistics.totalAmount.toFixed(2) }}</strong></span
            >
            <span v-if="selectedSettles.length > 0" class="text-primary font-medium">
              已选: {{ selectedSettles.length }} 条
            </span>
          </div>
        </div>

        <!-- 已结算列表：桌面端 -->
        <div class="hidden lg:block border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/80">
                <tr class="border-b">
                  <th class="px-2 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="selectedSettles.length === settledRecords.length && settledRecords.length > 0"
                      @change="toggleAllSettles"
                    />
                  </th>
                  <th class="px-2 py-2 text-left">结算号</th>
                  <th class="px-2 py-2 text-left">开单名称</th>
                  <th class="px-2 py-2 text-left">目的地</th>
                  <th class="px-2 py-2 text-right">块数</th>
                  <th class="px-2 py-2 text-right">重量(吨)</th>
                  <th class="px-2 py-2 text-right">金额(元)</th>
                  <th class="px-2 py-2 text-left">结算日期</th>
                  <th class="px-2 py-2 text-left">结算人</th>
                  <th class="px-2 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="10" class="p-8 text-center text-muted-foreground">加载中...</td>
                </tr>
                <tr v-else-if="settledRecords.length === 0">
                  <td colspan="10" class="p-8 text-center text-muted-foreground">暂无已结算记录</td>
                </tr>
                <tr
                  v-for="settle in settledRecords"
                  v-else
                  :key="settle._id"
                  class="border-b hover:bg-amber-50 cursor-pointer transition-colors"
                  :class="{
                    'bg-amber-100 border-l-4 border-l-amber-500': isSettleSelected(settle),
                  }"
                  @click="toggleSettle(settle)"
                >
                  <td class="px-2 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="isSettleSelected(settle)"
                      @change="toggleSettle(settle)"
                    />
                  </td>
                  <td class="px-2 py-2">{{ settle.serial_number }}</td>
                  <td class="px-2 py-2">{{ settle.billing_name }}</td>
                  <td class="px-2 py-2">{{ settle.ship_to }}</td>
                  <td class="px-2 py-2 text-right">{{ settle.ship_number }}</td>
                  <td class="px-2 py-2 text-right">{{ (settle.ship_weight || 0).toFixed(3) }}</td>
                  <td class="px-2 py-2 text-right">{{ (settle.price || 0).toFixed(2) }}</td>
                  <td class="px-2 py-2">{{ dayjs(settle.settle_date).format('YYYY-MM-DD HH:mm') }}</td>
                  <td class="px-2 py-2">{{ settle.settler || '-' }}</td>
                  <td class="px-2 py-2">
                    <span
                      class="px-2 py-0.5 rounded text-xs font-medium"
                      :class="{
                        'bg-blue-100 text-blue-700': settle.status === '已结算',
                        'bg-green-100 text-green-700': settle.status === '已开票',
                      }"
                    >
                      {{ settle.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 已结算列表：移动端卡片 -->
        <div class="lg:hidden space-y-2">
          <div v-if="loading" class="border rounded-lg p-8 text-center text-muted-foreground">加载中...</div>
          <div v-else-if="settledRecords.length === 0" class="border rounded-lg p-8 text-center text-muted-foreground">
            暂无已结算记录
          </div>
          <div
            v-for="settle in settledRecords"
            v-else
            :key="settle._id"
            class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
            :class="{
              'bg-amber-100 border-l-4 border-l-amber-500': isSettleSelected(settle),
              'bg-muted/30 hover:border-primary/30': !isSettleSelected(settle),
            }"
            @click="toggleSettle(settle)"
          >
            <input
              :checked="isSettleSelected(settle)"
              type="checkbox"
              class="h-4 w-4 shrink-0 cursor-pointer"
              @click.stop="toggleSettle(settle)"
            />
            <div class="flex-1 min-w-0">
              <!-- 行1：结算号 + 状态 -->
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm truncate">{{ settle.serial_number }}</span>
                <span
                  class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium"
                  :class="{
                    'bg-blue-50 text-blue-700 border-blue-200': settle.status === '已结算',
                    'bg-green-50 text-green-700 border-green-200': settle.status === '已开票',
                  }"
                  >{{ settle.status }}</span
                >
              </div>
              <!-- 行2：开单名称 -->
              <div class="text-sm text-muted-foreground truncate mt-0.5">{{ settle.billing_name }}</div>
              <!-- 行3：目的地 + 日期 -->
              <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span>{{ settle.ship_to }}</span>
                <span class="ml-auto shrink-0">{{ dayjs(settle.settle_date).format('MM-DD HH:mm') }}</span>
              </div>
              <!-- 行4：重量 + 金额 -->
              <div class="flex items-center gap-3 mt-0.5 text-xs">
                <span class="text-foreground font-medium">{{ (settle.ship_weight || 0).toFixed(3) }}吨</span>
                <span class="text-primary font-medium">¥{{ (settle.price || 0).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <!-- 结算篮组件 -->
    <SettleBasket
      v-model:open="showBasket"
      :items="basketBills"
      :statistics="basketStatistics"
      :settle-mode="settleMode"
      :is-public="isPublic"
      @settle="handleSettleFromBasket"
      @remove="composableRemoveFromBasket"
      @clear="composableClearBasket"
      @export="handleExportFromBasket"
      @toggle-public="togglePublic"
      @price-input="handlePriceInputFromBasket"
    >
      <template #item="{ item }">
        <div class="flex-1 min-w-0 cursor-pointer" @click.stop="toggleBillCardExpand(item)">
          <!-- 行1：提单号 + 订单号 -->
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium truncate">{{ item.bill_no }}</span>
            <span class="text-xs text-muted-foreground">{{ getOrderDisplay(item) }}</span>
          </div>
          <!-- 行2：开单名称 -->
          <div class="text-sm text-muted-foreground truncate">
            {{ item.billing_name }}
          </div>
          <!-- 行3：数量 + 重量 + 金额 + 展开箭头 -->
          <div class="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>{{ item.send_num }}块</span>
            <span>{{ item.send_weight.toFixed(3) }}吨</span>
            <span class="text-primary">
              ¥{{ ((settleMode === 'CUSTOMER' ? item.price : item.collection_price) * item.send_weight).toFixed(2) }}
            </span>
            <component
              :is="basketExpandedBills.has(`${item._id}_${item.inv_no}`) ? ChevronUp : ChevronDown"
              class="ml-auto h-4 w-4 text-muted-foreground shrink-0"
            />
          </div>
          <!-- 展开详情 -->
          <div
            v-if="basketExpandedBills.has(`${item._id}_${item.inv_no}`)"
            class="border-t mt-2 pt-2 space-y-1 text-xs"
            @click.stop
          >
            <div>
              <span class="text-muted-foreground">运单号：</span>
              <span>{{ item.inv_no || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">车船号：</span>
              <span>{{ item.veh_ves_name || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">开单名称：</span>
              <span>{{ item.billing_name }}</span>
              <span v-if="item.ship_customer" class="text-muted-foreground ml-1">/ {{ item.ship_customer }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">始发地：</span>
              <span>{{ item.ship_from || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">目的地：</span>
              <span>{{ item.ship_to || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">发运数：</span>
              <span>{{ item.send_num }}块</span>
            </div>
            <div>
              <span class="text-muted-foreground">发运量：</span>
              <span class="font-medium">{{ item.send_weight.toFixed(3) }}吨</span>
            </div>
            <div>
              <span class="text-muted-foreground">客户单价：</span>
              <span :class="item.price > 0 ? 'text-primary' : ''">{{ item.price || 0 }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">代收单价：</span>
              <span :class="item.collection_price > 0 ? 'text-blue-600' : ''">{{ item.collection_price || 0 }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">发货日期：</span>
              <span>{{ item.inv_ship_date ? dayjs(item.inv_ship_date).format('YYYY-MM-DD') : '-' }}</span>
            </div>
          </div>
        </div>
      </template>
    </SettleBasket>

    <!-- 公开篮面板 -->
    <PublicBasketsDialog
      v-model:open="showPublicBaskets"
      :items="publicItems"
      :statistics="publicStatistics"
      @export="handleExportFromPublicBaskets"
      @price-input="handlePriceInputFromPublicBaskets"
    >
      <template #item="{ item }">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-medium text-sm">{{ item.bill_no }}</span>
            <span class="text-xs text-muted-foreground">{{ item.billing_name }}</span>
            <span
              v-if="item._basketOwner"
              class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
              >{{ item._basketOwner }}</span
            >
          </div>
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{{ item.send_num }}块</span>
            <span>{{ item.send_weight?.toFixed(3) }}吨</span>
            <span v-if="item.price" class="text-primary">¥{{ (item.price * item.send_weight).toFixed(2) }}</span>
          </div>
        </div>
      </template>
    </PublicBasketsDialog>

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

    <!-- 结算明细对话框 -->
    <SettleDetailDialog v-model:open="showDetailDialog" :settle="detailSettle" />

    <!-- 导出对话框 -->
    <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />

    <!-- 大数据量提醒对话框 -->
    <AlertDialog v-model:open="showLargeDataWarning">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>数据量较大</AlertDialogTitle>
          <AlertDialogDescription>
            当前查询条件匹配到约 {{ largeDataCount }} 条记录，加载可能较慢且浏览器可能卡顿，请谨慎操作。建议缩小日期范围或增加筛选条件。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="confirmLoadLargeData()">确定查询</AlertDialogAction>
          <AlertDialogCancel>取消</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </BasicPage>
</template>

<style scoped>
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
