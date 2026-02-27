<script setup lang="ts">
import { Download, Filter, ShoppingCart, Trash2, X } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getSettleBills,
  markNotRequireSettle,
  settleBills,
} from '@/services/api/settle.api'
import {
  deleteSettle,
  getSettleList,
} from '@/services/api/ticket.api'

import type { SettleRecord } from './ticket-types'
import type {
  PriceInputData,
  SettleBill,
  SettleFilterParams,
  SettleMode,
  SettleObject,
} from './types'

import BatchPriceInputDialog from './components/BatchPriceInputDialog.vue'
import PriceInputDialog from './components/PriceInputDialog.vue'
import SettleFilter from './components/SettleFilter.vue'
import SettleTable from './components/SettleTable.vue'
import {
  COLLECTION_SETTLE_FLAG,
  CUSTOMER_SETTLE_FLAG,
} from './types'

const route = useRoute()
const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = computed(() => route.query.selfOwned === 'true')

// 状态管理
const settleMode = ref<SettleMode>('CUSTOMER')
const viewTab = ref<'unsettled' | 'settled'>('unsettled') // 视图标签：未结算/已结算
const allBills = ref<SettleBill[]>([])
const displayBills = ref<SettleBill[]>([])
const selectedBills = ref<SettleBill[]>([])
const loading = ref(false)
const showFilter = ref(true) // 默认显示过滤器
const showNonSettle = ref(false)

// 结算篮状态
const basketBills = ref<SettleBill[]>([])
const showBasket = ref(false)

// 动画状态
const basketButtonRef = ref<any>(null)
const flyingItems = ref<{ id: string, x: number, y: number, targetX: number, targetY: number }[]>([])

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
const settledRecords = ref<SettleRecord[]>([])
const selectedSettles = ref<SettleRecord[]>([])

// 过滤参数
const filterParams = ref<SettleFilterParams>({
  fType: 'invoice-first',
  fDate1: undefined,
  fDate2: undefined,
})

// 页面初始化
onMounted(() => {
  // 过滤器组件会自动初始化日期并触发 applyFilter
})

// 监听 tab 切换，实时获取数据
watch(viewTab, (newTab) => {
  console.log('viewTab changed to:', newTab)
  if (newTab === 'settled') {
    console.log('Loading settled records...')
    loadSettledRecords()
  }
  else if (newTab === 'unsettled') {
    console.log('Reloading unsettled bills...')
    // 重新加载未结算数据
    if (filterParams.value.fDate1 && filterParams.value.fDate2) {
      loadData(filterParams.value.fDate1, filterParams.value.fDate2)
    }
  }
}, { immediate: true })

// 监听结算模式切换，重新加载当前 tab 的数据
watch(settleMode, () => {
  console.log('settleMode changed to:', settleMode.value)
  if (viewTab.value === 'settled') {
    console.log('Reloading settled records due to mode change...')
    loadSettledRecords()
  }
  else {
    console.log('Reloading unsettled bills due to mode change...')
    applyFrontendFilter()
  }
})

// 从运单数据中提取过滤选项
const filterOptions = computed(() => {
  const billingNames = new Set<string>()
  const vehicleNames = new Set<string>()
  const shipFroms = new Set<string>()
  const destinations = new Set<string>()
  const orderNos = new Set<string>()
  const billNos = new Set<string>()
  const invNosMap = new Map<string, string>() // inv_no -> shipper

  allBills.value.forEach((bill) => {
    if (bill.billing_name)
      billingNames.add(bill.billing_name)
    if (bill.veh_ves_name)
      vehicleNames.add(bill.veh_ves_name)
    if (bill.ship_from)
      shipFroms.add(bill.ship_from)
    if (bill.ship_to)
      destinations.add(bill.ship_to)
    if (bill.order_no)
      orderNos.add(bill.order_no)
    if (bill.bill_no)
      billNos.add(bill.bill_no)
    if (bill.inv_no && !invNosMap.has(bill.inv_no)) {
      invNosMap.set(bill.inv_no, bill.inv_shipper || '')
    }
  })

  // 将运单号转换为对象数组，包含运单号和创建人
  const invNos = Array.from(invNosMap.entries()).map(([invNo, shipper]) => ({
    inv_no: invNo,
    shipper,
  })).sort((a, b) => a.inv_no.localeCompare(b.inv_no))

  return {
    billingNames: Array.from(billingNames).sort(),
    vehicleNames: Array.from(vehicleNames).sort(),
    shipFroms: Array.from(shipFroms).sort(),
    destinations: Array.from(destinations).sort(),
    orderNos: Array.from(orderNos).sort(),
    billNos: Array.from(billNos).sort(),
    invNos,
  }
})

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

// 结算篮统计信息
const basketStatistics = computed(() => {
  let totalNum = 0
  let totalWeight = 0
  let totalAmount = 0

  basketBills.value.forEach((bill) => {
    const price = settleMode.value === 'CUSTOMER' ? bill.price : bill.collection_price
    totalNum += bill.send_num
    totalWeight += bill.send_weight
    if (price > 0) {
      totalAmount += price * bill.send_weight
    }
  })

  return {
    count: basketBills.value.length,
    totalNum,
    totalWeight,
    totalAmount,
  }
})

// 检查另一个结算模式下是否有数据
const otherModeHasData = computed(() => {
  if (allBills.value.length === 0)
    return false

  const otherMode = settleMode.value === 'CUSTOMER' ? 'COLLECTION' : 'CUSTOMER'
  const flag = otherMode === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG
  const priceField = otherMode === 'CUSTOMER' ? 'price' : 'collection_price'

  // 应用相同的前端过滤条件
  let filtered = allBills.value

  if (filterParams.value.fName && filterParams.value.fName.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fName!.includes(bill.billing_name))
  }
  if (filterParams.value.fVeh && filterParams.value.fVeh.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fVeh!.includes(bill.veh_ves_name))
  }
  if (filterParams.value.fShipFrom && filterParams.value.fShipFrom.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fShipFrom!.includes(bill.ship_from))
  }
  if (filterParams.value.fDest && filterParams.value.fDest.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fDest!.includes(bill.ship_to))
  }
  if (filterParams.value.fOrder && filterParams.value.fOrder.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fOrder!.includes(bill.order_no))
  }
  if (filterParams.value.fBno && filterParams.value.fBno.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fBno!.includes(bill.bill_no))
  }
  if (filterParams.value.fInvNo && filterParams.value.fInvNo.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fInvNo!.includes(bill.inv_no))
  }

  // 检查另一个模式下是否有未结算的数据
  return filtered.some((bill) => {
    const price = bill[priceField]
    if (showNonSettle.value) {
      return price === -1
    }
    else {
      return (bill.inv_settle_flag & flag) !== flag && price >= 0
    }
  })
})

// 分页计算
const totalPages = computed(() => Math.ceil(displayBills.value.length / pageSize.value))

const pagedBills = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return displayBills.value.slice(start, end)
})

// 切换结算模式
function switchMode(mode: SettleMode) {
  if (settleMode.value !== mode) {
    settleMode.value = mode
    if (viewTab.value === 'unsettled') {
      applyFrontendFilter()
    }
    else {
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

// 从后端加载数据（仅日期范围）
async function loadData(startDate?: string, endDate?: string) {
  loading.value = true
  try {
    const result = await getSettleBills({
      fDate1: startDate,
      fDate2: endDate,
      fType: 'invoice-first',
      selfOwned: isSelfOwnedMode.value ? '1' : undefined,
    })
    if (result.ok) {
      allBills.value = result.bills.sort((a, b) => {
        return new Date(b.inv_ship_date).getTime() - new Date(a.inv_ship_date).getTime()
      })
      applyFrontendFilter()
    }
    else {
      toast.error('获取数据失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '获取数据失败')
  }
  finally {
    loading.value = false
  }
}

// 前端过滤
function applyFrontendFilter() {
  let filtered = allBills.value

  // 开单名称过滤
  if (filterParams.value.fName && filterParams.value.fName.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fName!.includes(bill.billing_name))
  }

  // 车船过滤
  if (filterParams.value.fVeh && filterParams.value.fVeh.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fVeh!.includes(bill.veh_ves_name))
  }

  // 起始地过滤
  if (filterParams.value.fShipFrom && filterParams.value.fShipFrom.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fShipFrom!.includes(bill.ship_from))
  }

  // 目的地过滤
  if (filterParams.value.fDest && filterParams.value.fDest.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fDest!.includes(bill.ship_to))
  }

  // 订单号过滤
  if (filterParams.value.fOrder && filterParams.value.fOrder.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fOrder!.includes(bill.order_no))
  }

  // 提单号过滤
  if (filterParams.value.fBno && filterParams.value.fBno.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fBno!.includes(bill.bill_no))
  }

  // 运单号过滤
  if (filterParams.value.fInvNo && filterParams.value.fInvNo.length > 0) {
    filtered = filtered.filter(bill => filterParams.value.fInvNo!.includes(bill.inv_no))
  }

  // 根据结算模式和状态过滤
  const flag = settleMode.value === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'

  displayBills.value = filtered.filter((bill) => {
    const price = bill[priceField]

    if (showNonSettle.value) {
      // 只显示不需要结算的记录
      return price === -1
    }
    else {
      // 显示未结算的记录（排除已结算和不需要结算的）
      return (bill.inv_settle_flag & flag) !== flag && price >= 0
    }
  })

  selectedBills.value = []
  currentPage.value = 1
}

// 应用过滤（由子组件调用）
function applyFilter(params: SettleFilterParams) {
  const dateChanged = filterParams.value.fDate1 !== params.fDate1 || filterParams.value.fDate2 !== params.fDate2

  filterParams.value = params

  if (dateChanged) {
    // 日期变化，重新加载数据
    loadData(params.fDate1, params.fDate2)
  }
  else {
    // 其他条件变化，只做前端过滤
    applyFrontendFilter()
  }
}

// 更新显示的提单列表（现在使用前端过滤）
function updateDisplayBills() {
  applyFrontendFilter()
  refreshBasketBills() // 同时刷新结算篮中的数据
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
  }
  else {
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
  const billingNames = [...new Set(selectedBills.value.map(b => b.billing_name))]
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
  if (!confirmed)
    return

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
      }
      else {
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

    const shipToList = [...new Set(selectedBills.value.map(b => b.ship_to))]
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
      updateDisplayBills()
    }
    else {
      toast.error(result.message || '结算失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '结算失败')
  }
  finally {
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
  const hasPrice = selectedBills.value.some(b => b[priceField] > 0)

  let confirmed = true
  if (hasPrice) {
    confirmed = window.confirm('您选择的提单中已经输入过价格，不结算后这些价格都会清除为0，确认吗？')
  }
  else {
    confirmed = window.confirm('确定标记选中的提单为不需要结算吗？')
  }

  if (!confirmed)
    return

  loading.value = true
  try {
    const nonSettleObj = selectedBills.value.map((bill) => {
      if (settleMode.value === 'CUSTOMER') {
        bill.inv_settle_flag &= ~CUSTOMER_SETTLE_FLAG
        bill.price = -1
        return { bid: bill._id, inv_no: bill.inv_no }
      }
      else {
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
      updateDisplayBills()
    }
    else {
      toast.error(result.message || '标记失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '标记失败')
  }
  finally {
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

// 添加选中的提单到结算篮（带动画）
function addToBasket() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要添加到结算篮的提单')
    return
  }

  // 检查是否有已在结算篮中的提单
  const newBills = selectedBills.value.filter(
    bill => !basketBills.value.some(b => isSameBill(b, bill)),
  )

  if (newBills.length === 0) {
    toast.info('选中的提单已在结算篮中')
    return
  }

  // 获取结算篮按钮位置
  const basketBtn = basketButtonRef.value?.$el || basketButtonRef.value
  if (basketBtn) {
    const btnRect = (basketBtn as HTMLElement).getBoundingClientRect()
    const targetX = btnRect.left + btnRect.width / 2
    const targetY = btnRect.top + btnRect.height / 2

    // 获取选中行的位置并创建飞行动画
    const selectedRows = document.querySelectorAll('tr.bg-blue-50')
    const maxAnimations = Math.min(selectedRows.length, 5) // 最多显示5个动画

    selectedRows.forEach((row, index) => {
      if (index >= maxAnimations)
        return
      const rowRect = row.getBoundingClientRect()
      const startX = rowRect.left + rowRect.width / 2
      const startY = rowRect.top + rowRect.height / 2

      flyingItems.value.push({
        id: `fly-${Date.now()}-${index}`,
        x: startX,
        y: startY,
        targetX,
        targetY,
      })
    })

    // 动画结束后清理
    setTimeout(() => {
      flyingItems.value = []
    }, 600)
  }

  basketBills.value = [...basketBills.value, ...newBills]
  toast.success(`已添加 ${newBills.length} 条提单到结算篮`)
  selectedBills.value = []
}

// 从结算篮移除单个提单
function removeFromBasket(bill: SettleBill) {
  basketBills.value = basketBills.value.filter(b => b._id !== bill._id)
}

// 清空结算篮
function clearBasket() {
  if (basketBills.value.length === 0)
    return

  const confirmed = window.confirm('确定要清空结算篮吗？')
  if (confirmed) {
    basketBills.value = []
    toast.success('结算篮已清空')
  }
}

// 判断两个提单是否相同（使用更精确的条件）
function isSameBill(bill1: SettleBill, bill2: SettleBill): boolean {
  return bill1._id === bill2._id
    && bill1.inv_no === bill2.inv_no
    && bill1.veh_ves_name === bill2.veh_ves_name
    && bill1.send_num === bill2.send_num
    && bill1.send_weight === bill2.send_weight
}

// 检查提单是否在结算篮中
function isInBasket(bill: SettleBill): boolean {
  return basketBills.value.some(b => isSameBill(b, bill))
}

// 刷新结算篮中的提单数据（从 allBills 中更新）
function refreshBasketBills() {
  if (basketBills.value.length === 0)
    return

  // 根据精确匹配从 allBills 中查找并更新
  basketBills.value = basketBills.value.map((basketBill) => {
    const updatedBill = allBills.value.find(b => isSameBill(b, basketBill))
    return updatedBill || basketBill
  })
}

// 从结算篮结算
async function handleSettleFromBasket() {
  if (basketBills.value.length === 0) {
    toast.warning('结算篮为空，请先添加提单')
    return
  }

  // 验证：同一批次只能选择相同开单名称
  const billingNames = [...new Set(basketBills.value.map(b => b.billing_name))]
  if (billingNames.length > 1) {
    toast.error('结算篮中存在多个开单名称，一次只能结算一个开单名称的提单')
    return
  }

  // 检查价格输入情况
  const priceField = settleMode.value === 'CUSTOMER' ? 'price' : 'collection_price'
  const billsWithoutPrice = basketBills.value.filter(bill => bill[priceField] === 0)
  const billsNotRequireSettle = basketBills.value.filter(bill => bill[priceField] === -1)

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
      }
      else {
        showBatchPriceDialog.value = true
      }
    }
    return
  }

  const confirmed = window.confirm(`确定要结算结算篮中的 ${basketBills.value.length} 条提单吗？`)
  if (!confirmed)
    return

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
      }
      else {
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

    const shipToList = [...new Set(basketBills.value.map(b => b.ship_to))]
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
      basketBills.value = [] // 清空结算篮
      showBasket.value = false
      updateDisplayBills()
    }
    else {
      toast.error(result.message || '结算失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '结算失败')
  }
  finally {
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

  const data = displayBills.value.map((bill) => {
    const price = bill[priceField]
    const orderDisplay = bill.order_item_no
      ? `${bill.order_no}-${String(bill.order_item_no).padStart(3, '0')}`
      : bill.order_no
    const name = bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name
    const totPrice = price > 0 ? (price * bill.send_weight).toFixed(2) : '-'
    const priceText = getPriceText(price)
    const spec = `${bill.thickness}*${bill.width}*${bill.len}`
    const specSize = getSpecSize(bill.width, bill.len)
    const shipDate = bill.inv_ship_date ? new Date(bill.inv_ship_date).toLocaleDateString('zh-CN') : ''

    return {
      status: getSettleStatus(bill),
      order_no: orderDisplay,
      bill_no: bill.bill_no,
      billing_name: name,
      veh_ves_name: bill.veh_ves_name,
      ship_to: bill.ship_to,
      total_price: totPrice,
      price: priceText,
      send_num: bill.send_num || '',
      send_weight: bill.send_weight.toFixed(3),
      ship_from: bill.ship_from,
      ship_warehouse: bill.ship_warehouse || '',
      ship_date: shipDate,
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
      { header: '总价格', key: 'total_price' },
      { header: '单价', key: 'price' },
      { header: '发运块数', key: 'send_num' },
      { header: '发运重量', key: 'send_weight' },
      { header: '起始地', key: 'ship_from' },
      { header: '发货仓库', key: 'ship_warehouse' },
      { header: '发货日期', key: 'ship_date' },
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
  if (price > 0)
    return price.toString()
  if (price < 0)
    return '不需要结算'
  return '0'
}

// 获取规格大小
function getSpecSize(width: number, len: number): string {
  if (width < 3000 && len < 13500)
    return '正常'
  if ((width >= 3000 && width < 3300) || (len >= 13500 && len < 16500))
    return '超长宽'
  if (width >= 3300 || len >= 16500)
    return '特长宽'
  return ''
}

// 获取结算状态
function getSettleStatus(bill: SettleBill): string {
  if (!bill.inv_settle_flag || bill.inv_settle_flag === 0) {
    if (bill.price === -1 && bill.collection_price === -1)
      return '客户,代收不需结算'
    if (bill.price === -1)
      return '客户不需结算'
    if (bill.collection_price === -1)
      return '代收不需结算'
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
  console.log('loadSettledRecords called, settleMode:', settleMode.value)
  loading.value = true
  try {
    const result = await getSettleList({
      settle_type: settleMode.value,
      display_mode: 'settle',
      selfOwned: isSelfOwnedMode.value ? '1' : '0',
    })
    console.log('getSettleList result:', result)
    if (result.ok) {
      settledRecords.value = result.settles
      console.log('settledRecords:', result.settles.length)
    }
    else {
      toast.error('获取已结算记录失败')
    }
  }
  catch (error: any) {
    console.error('loadSettledRecords error:', error)
    toast.error(error.message || '获取已结算记录失败')
  }
  finally {
    loading.value = false
  }
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
  if (!confirmed)
    return

  loading.value = true
  try {
    const result = await deleteSettle({
      settle_ids: selectedSettles.value.map(s => s._id),
      settle_type: settleMode.value,
    })

    if (result.ok) {
      toast.success('删除成功')
      selectedSettles.value = []
      loadSettledRecords()
    }
    else {
      toast.error(result.message || '删除失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '删除失败')
  }
  finally {
    loading.value = false
  }
}

// 切换已结算记录选择
function toggleSettle(settle: SettleRecord) {
  const index = selectedSettles.value.findIndex(s => s._id === settle._id)
  if (index >= 0) {
    const newSelected = [...selectedSettles.value]
    newSelected.splice(index, 1)
    selectedSettles.value = newSelected
  }
  else {
    selectedSettles.value = [...selectedSettles.value, settle]
  }
}

// 判断已结算记录是否选中
function isSettleSelected(settle: SettleRecord) {
  return selectedSettles.value.some(s => s._id === settle._id)
}

// 切换全选已结算记录
function toggleAllSettles() {
  if (selectedSettles.value.length === settledRecords.value.length) {
    selectedSettles.value = []
  }
  else {
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
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '结算管理(自有车)' : '结算管理'"
    :description="isSelfOwnedMode ? '自有车客户结算和南钢结算（代收代付）管理' : '客户结算和南钢结算（代收代付）管理'"
  >
    <Tabs v-model="viewTab" class="w-full">
      <!-- Tabs 和操作按钮在同一行 -->
      <div class="flex items-center justify-between mb-4">
        <!-- 操作按钮组 -->
        <div class="flex items-center gap-2">
          <!-- 结算模式切换 -->
          <div class="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium border rounded-l-lg" :class="[
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
              class="px-4 py-2 text-sm font-medium border-l-0 rounded-r-lg" :class="[
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
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedBills.length === 0"
              @click="openPriceDialog"
            >
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
            <UiButton
              variant="outline"
              size="sm"
              :disabled="displayBills.length === 0"
              @click="handleExport"
            >
              <Download class="w-4 h-4 mr-1" />
              导出
            </UiButton>

            <!-- 结算篮按钮 -->
            <UiButton
              ref="basketButtonRef"
              variant="default"
              size="sm"
              class="relative"
              @click="showBasket = true"
            >
              <ShoppingCart class="w-4 h-4 mr-1" />
              结算篮
              <span
                v-if="basketBills.length > 0"
                class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse"
              >
                {{ basketBills.length > 99 ? '99+' : basketBills.length }}
              </span>
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

        <TabsList>
          <TabsTrigger value="unsettled" class="w-[120px]">
            未结算
          </TabsTrigger>
          <TabsTrigger value="settled" class="w-[120px]">
            已结算
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="unsettled" class="space-y-4">
        <!-- 过滤器 -->
        <SettleFilter
          v-if="showFilter"
          ref="settleFilterRef"
          v-model:show-non-settle="showNonSettle"
          :settle-mode="settleMode"
          :billing-names="filterOptions.billingNames"
          :vehicle-names="filterOptions.vehicleNames"
          :ship-froms="filterOptions.shipFroms"
          :destinations="filterOptions.destinations"
          :order-nos="filterOptions.orderNos"
          :bill-nos="filterOptions.billNos"
          :inv-nos="filterOptions.invNos"
          @apply="applyFilter"
        />

        <!-- 汇总统计信息 -->
        <div class="flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <span class="text-muted-foreground">记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span>
          <span class="text-muted-foreground">合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span>
          <span class="text-muted-foreground">重量: <strong class="text-foreground">{{ statistics.totalWeight.toFixed(3) }}</strong> 吨</span>
          <span class="text-muted-foreground">金额: <strong class="text-foreground">¥{{ statistics.totalAmount.toFixed(2) }}</strong></span>
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
              >
              <label for="show-non-settle-main" class="text-sm cursor-pointer whitespace-nowrap">
                不需要结算
              </label>
            </div>
            <UiButton variant="outline" size="sm" @click="handleResetFilter">
              重置
            </UiButton>
          </div>
        </div>

        <!-- 数据表格 -->
        <SettleTable
          v-model:selected="selectedBills"
          :bills="pagedBills"
          :settle-mode="settleMode"
          :loading="loading"
          :other-mode-has-data="otherModeHasData"
          :basket-bills="basketBills"
          @switch-mode="switchMode"
        />

        <!-- 分页 -->
        <div v-if="displayBills.length > pageSize" class="flex items-center justify-between mt-4 px-2">
          <div class="text-sm text-muted-foreground">
            显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, displayBills.length) }} 条，共 {{ displayBills.length }} 条
          </div>
          <div class="flex items-center gap-2">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="currentPage === 1"
              @click="previousPage"
            >
              上一页
            </UiButton>
            <div class="flex items-center gap-1">
              <span class="text-sm">第</span>
              <input
                type="number"
                :value="currentPage"
                :min="1"
                :max="totalPages"
                class="w-16 px-2 py-1 text-sm text-center border rounded"
                @change="goToPage(($event.target as HTMLInputElement).valueAsNumber)"
              >
              <span class="text-sm">/ {{ totalPages }} 页</span>
            </div>
            <UiButton
              variant="outline"
              size="sm"
              :disabled="currentPage === totalPages"
              @click="nextPage"
            >
              下一页
            </UiButton>
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
      <TabsContent value="settled" class="space-y-4">
        <!-- 汇总统计 -->
        <div class="flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <span class="text-muted-foreground">记录数: <strong class="text-foreground">{{ settledRecords.length }}</strong></span>
          <span v-if="selectedSettles.length > 0" class="text-primary font-medium">
            已选: {{ selectedSettles.length }} 条
          </span>
        </div>

        <!-- 已结算列表 -->
        <div class="border rounded-lg overflow-hidden">
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
                    >
                  </th>
                  <th class="px-2 py-2 text-left">
                    结算号
                  </th>
                  <th class="px-2 py-2 text-left">
                    开单名称
                  </th>
                  <th class="px-2 py-2 text-left">
                    目的地
                  </th>
                  <th class="px-2 py-2 text-right">
                    块数
                  </th>
                  <th class="px-2 py-2 text-right">
                    重量(吨)
                  </th>
                  <th class="px-2 py-2 text-right">
                    金额(元)
                  </th>
                  <th class="px-2 py-2 text-left">
                    结算日期
                  </th>
                  <th class="px-2 py-2 text-left">
                    结算人
                  </th>
                  <th class="px-2 py-2 text-left">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="10" class="p-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
                <tr v-else-if="settledRecords.length === 0">
                  <td colspan="10" class="p-8 text-center text-muted-foreground">
                    暂无已结算记录
                  </td>
                </tr>
                <tr
                  v-for="settle in settledRecords"
                  v-else
                  :key="settle._id"
                  class="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  :class="{
                    'bg-blue-50 border-l-4 border-l-blue-500': isSettleSelected(settle),
                  }"
                  @click="toggleSettle(settle)"
                >
                  <td class="px-2 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="isSettleSelected(settle)"
                      @change="toggleSettle(settle)"
                    >
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.serial_number }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.billing_name }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ship_to }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_number }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_weight.toFixed(3) }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.price.toFixed(2) }}
                  </td>
                  <td class="px-2 py-2">
                    {{ new Date(settle.settle_date).toLocaleDateString() }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.settler || '-' }}
                  </td>
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
      </TabsContent>
    </Tabs>

    <!-- 结算篮滑出面板 -->
    <Teleport to="body">
      <Transition name="basket-fade">
        <div
          v-if="showBasket"
          class="fixed inset-0 bg-black/50 z-50"
          @click="showBasket = false"
        />
      </Transition>
      <Transition name="basket-slide">
        <div
          v-if="showBasket"
          class="fixed right-0 top-0 h-full w-[500px] max-w-[90vw] bg-background shadow-xl z-50 flex flex-col"
        >
          <!-- 头部 -->
          <div class="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div class="flex items-center gap-2">
              <ShoppingCart class="w-5 h-5 text-primary" />
              <span class="font-semibold text-lg">结算篮</span>
              <span class="text-muted-foreground text-sm">({{ basketBills.length }} 条)</span>
            </div>
            <button
              class="p-1 hover:bg-muted rounded-md transition-colors"
              @click="showBasket = false"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- 统计信息 -->
          <div class="px-4 py-2 border-b bg-muted/20 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">块数: <strong class="text-foreground">{{ basketStatistics.totalNum }}</strong></span>
              <span class="text-muted-foreground">重量: <strong class="text-foreground">{{ basketStatistics.totalWeight.toFixed(3) }}</strong> 吨</span>
              <span class="text-muted-foreground">金额: <strong class="text-primary">¥{{ basketStatistics.totalAmount.toFixed(2) }}</strong></span>
            </div>
          </div>

          <!-- 列表内容 -->
          <div class="flex-1 overflow-y-auto p-4 space-y-2">
            <div
              v-if="basketBills.length === 0"
              class="flex flex-col items-center justify-center h-full text-muted-foreground"
            >
              <ShoppingCart class="w-12 h-12 mb-2 opacity-30" />
              <p>结算篮为空</p>
              <p class="text-sm">请选择提单后点击"加入结算篮"</p>
            </div>
            <div
              v-for="bill in basketBills"
              v-else
              :key="bill._id"
              class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium truncate">{{ bill.bill_no }}</span>
                  <span class="text-xs text-muted-foreground">{{ getOrderDisplay(bill) }}</span>
                </div>
                <div class="text-sm text-muted-foreground truncate">
                  {{ bill.billing_name }}
                </div>
                <div class="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>{{ bill.send_num }}块</span>
                  <span>{{ bill.send_weight.toFixed(3) }}吨</span>
                  <span class="text-primary">
                    ¥{{ ((settleMode === 'CUSTOMER' ? bill.price : bill.collection_price) * bill.send_weight).toFixed(2) }}
                  </span>
                </div>
              </div>
              <button
                class="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                title="从结算篮移除"
                @click="removeFromBasket(bill)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="px-4 py-3 border-t bg-muted/30 space-y-2">
            <div class="flex items-center gap-2">
              <UiButton
                variant="outline"
                size="sm"
                class="flex-1"
                :disabled="basketBills.length === 0"
                @click="clearBasket"
              >
                <Trash2 class="w-4 h-4 mr-1" />
                清空
              </UiButton>
              <UiButton
                variant="default"
                size="sm"
                class="flex-1"
                :disabled="basketBills.length === 0 || loading"
                @click="handleSettleFromBasket"
              >
                结算 ({{ basketBills.length }})
              </UiButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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
    <ExportDialog
      v-model:open="showExportDialog"
      :default-file-name="exportFileName"
      @confirm="confirmExport"
    />
  </BasicPage>
</template>

<style scoped>
.basket-fade-enter-active,
.basket-fade-leave-active {
  transition: opacity 0.2s ease;
}
.basket-fade-enter-from,
.basket-fade-leave-to {
  opacity: 0;
}

.basket-slide-enter-active,
.basket-slide-leave-active {
  transition: transform 0.3s ease;
}
.basket-slide-enter-from,
.basket-slide-leave-to {
  transform: translateX(100%);
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
