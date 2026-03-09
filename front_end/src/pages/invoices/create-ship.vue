<script setup lang="ts">
// @ts-nocheck
import { Check, ChevronDown, ChevronUp, Copy, FolderOpen, Plus, Save, Search, Send, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { InvoiceBill } from '@/services/api/invoice.api'

import { BasicPage } from '@/components/global-layout'
import ConfirmDialog from '@/components/confirm-dialog.vue'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import {
  buildShipInvoice,
  getBillsByBillingName,
  getInvoiceDetail,
  getInvoiceList,
  getMaxWaybillNo,
  searchBillingNames,
  searchDestinations,
  searchVehicles,
  searchWarehouses,
} from '@/services/api/invoice.api'
import { getPlanByOrderNo, searchCompanies } from '@/services/api/plan.api'
import { useAuthStore } from '@/stores/auth'
import { isAdmin as isAdminPrivilege } from '@/constants/permissions'

const route = useRoute()
const authStore = useAuthStore()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = computed(() => route.query.selfOwned === 'true')

// 只有在功能启用时才过滤车辆类别
const enableCategoryFilter = computed(() => authStore.features?.selfVehicle === true)

// 状态
const loading = ref(false)
const waybillNo = ref('')
const innerWaybillNoOrder = ref(0)
const isExistingInvoice = ref(false) // 标记是否为已保存的运单
const originalConfirmedBills = ref<InvoiceBill[]>([]) // 保存原始的已确认提单，用于检测是否有改动

// 打开运单对话框相关
const showInvoiceListDialog = ref(false)
const invoiceListLoading = ref(false)
const invoiceList = ref<any[]>([])
const invoiceListTotal = ref(0)
const invoiceSearchKeyword = ref('')
const invoiceListPage = ref(1)
const invoiceListLimit = ref(20)
const showMyOnly = ref(false) // 是否只显示我的运单

// 判断是否是管理员
const isAdmin = computed(() => isAdminPrivilege(authStore.user?.privilege ?? []))

// 检查是否有未保存的改动
const hasUnsavedChanges = computed(() => {
  // 如果没有运单号，没有改动
  if (!waybillNo.value) return false

  // 如果有待确认的提单，说明有改动
  if (pendingBills.value.length > 0) return true

  // 对于新建运单，如果有已确认的提单，说明有改动
  if (!isExistingInvoice.value && confirmedBills.value.length > 0) {
    return true
  }

  // 对于已存在的运单，比较已确认的提单是否有变化
  if (isExistingInvoice.value && originalConfirmedBills.value.length > 0) {
    // 简单比较：数量或内容是否变化
    if (confirmedBills.value.length !== originalConfirmedBills.value.length) {
      return true
    }
    // 检查是否有任何提单的发运数或发运重量有变化
    return JSON.stringify(confirmedBills.value) !== JSON.stringify(originalConfirmedBills.value)
  }

  return false
})

// 监听showMyOnly变化，自动刷新列表
watch(showMyOnly, async () => {
  invoiceListPage.value = 1
  await loadInvoiceList()
})

// 运单表单
const form = ref({
  vesselName: '', // 船号
  billingName: '', // 开单名称
  shipCustomer: '',
  shipFrom: '南钢',
  shipTo: '',
  shipDate: '',
})

// 当前选择的车辆 (用于船运时指定每批货的车号)
const currentWagonNo = ref('')
const currentOrigin = ref('南钢')

// 可用订单数据 (根据开单名称获取，按订单分组)
// 结构: [{order_no: string, bills: [{bill_no, order_item_no, ...}]}]
const availableOrdersData = ref<any[]>([])

// 当前选择的订单号
const selectedOrderNo = ref('')
// 当前订单的可用提单
const currentOrderBills = ref<any[]>([])

// 当前订单的计划信息
const orderPlanInfo = ref<{ order_weight: number; left_weight: number } | null>(null)

// 当前公司的客户列表
const shipCustomers = ref<string[]>([])

// 当前车辆的待确认提单
const pendingBills = ref<InvoiceBill[]>([])
// 已确认的提单列表
const confirmedBills = ref<InvoiceBill[]>([])

// 移动端展开的卡片
const expandedPendingCards = ref<Set<number>>(new Set())
const expandedConfirmedCards = ref<Set<string>>(new Set())

// 被修改的提单ID集合（用于高亮显示）
const highlightedBillIds = ref<Set<string>>(new Set())

function togglePendingCardExpand(index: number) {
  if (expandedPendingCards.value.has(index)) {
    expandedPendingCards.value.delete(index)
  } else {
    expandedPendingCards.value.add(index)
  }
}

function toggleConfirmedCardExpand(key: string) {
  if (expandedConfirmedCards.value.has(key)) {
    expandedConfirmedCards.value.delete(key)
  } else {
    expandedConfirmedCards.value.add(key)
  }
}

// 当前车辆的统计
const wagonTotalWeight = computed(() => {
  return pendingBills.value.reduce((sum, b) => sum + (b.send_weight || 0), 0)
})
const wagonTotalNumber = computed(() => {
  return pendingBills.value.reduce((sum, b) => sum + (b.send_num || 0), 0)
})

// 总统计
const totalWeight = computed(() => {
  return confirmedBills.value.reduce((sum, b) => sum + (b.send_weight || 0), 0)
})
const totalNumber = computed(() => {
  return confirmedBills.value.reduce((sum, b) => sum + (b.send_num || 0), 0)
})

// 搜索船
async function searchShips(search: string, limit: number, page: number) {
  // 关键逻辑：只有在功能启用时才根据模式过滤
  let category: '自有' | '外挂' | undefined = undefined

  if (enableCategoryFilter.value) {
    // 功能启用：自有车模式显示自有船，非自有车模式显示外挂船
    category = isSelfOwnedMode.value ? '自有' : '外挂'
  }
  // 功能关闭：category = undefined，显示所有船

  return searchVehicles(search, '船', limit, page, category)
}

// 搜索车辆
async function searchTrucks(search: string, limit: number, page: number) {
  // 关键逻辑：只有在功能启用时才根据模式过滤
  let category: '自有' | '外挂' | undefined = undefined

  if (enableCategoryFilter.value) {
    // 功能启用：自有车模式显示自有车，非自有车模式显示外挂车
    category = isSelfOwnedMode.value ? '自有' : '外挂'
  }
  // 功能关闭：category = undefined，显示所有车辆

  return searchVehicles(search, '车', limit, page, category)
}

// 搜索发货单位（本地搜索当前公司的客户列表）
async function searchShipCustomers(search: string, limit: number, page: number) {
  let filtered = shipCustomers.value
  if (search) {
    filtered = filtered.filter((c: string) => c.toLowerCase().includes(search.toLowerCase()))
  }
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit).map((c: string) => ({
    name: c,
  }))
  return { ok: true, data, total: filtered.length }
}

// 新建运单
async function createNewInvoice() {
  // 检查是否有未保存的改动
  if (hasUnsavedChanges.value) {
    const confirmed = await confirmDialog('当前有未保存的改动，确定要放弃这些改动并新建运单吗？')
    if (!confirmed) return
  }

  loading.value = true
  try {
    const result = await getMaxWaybillNo()
    if (result.ok) {
      waybillNo.value = result.max_no
      innerWaybillNoOrder.value = 0
      isExistingInvoice.value = false // 新建运单
      originalConfirmedBills.value = []
      resetForm()
      toast.success(`新建运单号: ${result.max_no}`)
    } else {
      toast.error('获取运单号失败')
    }
  } catch (error: any) {
    toast.error(error.message || '获取运单号失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
function resetForm() {
  form.value = {
    vesselName: '',
    billingName: '',
    shipCustomer: '',
    shipFrom: '南钢',
    shipTo: '',
    shipDate: '',
  }
  currentWagonNo.value = ''
  currentOrigin.value = '南钢'
  availableOrdersData.value = []
  selectedOrderNo.value = ''
  currentOrderBills.value = []
  pendingBills.value = []
  confirmedBills.value = []
  shipCustomers.value = []
  orderPlanInfo.value = null
}

// 根据提单号查找提单信息（从分组数据中查找）
function findBillByNo(billNo: string) {
  for (const order of availableOrdersData.value) {
    const bill = order.bills?.find((b: any) => b.bill_no === billNo)
    if (bill) {
      return { ...bill, order_no: order.order_no }
    }
  }
  return null
}

// 根据提单_id查找提单信息（从分组数据中查找）
function findBillById(billId: string) {
  for (const order of availableOrdersData.value) {
    const bill = order.bills?.find((b: any) => b._id === billId)
    if (bill) {
      return { ...bill, order_no: order.order_no }
    }
  }
  return null
}

// 确认对话框（Promise 模式）
const confirmDialogOpen = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
let confirmDialogResolve: ((value: boolean) => void) | null = null

function confirmDialog(message: string, title = '确认'): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialogTitle.value = title
    confirmDialogMessage.value = message
    confirmDialogResolve = resolve
    confirmDialogOpen.value = true
  })
}

function onConfirmDialogConfirm() {
  confirmDialogResolve?.(true)
  confirmDialogResolve = null
}

watch(confirmDialogOpen, (open) => {
  // 对话框关闭时（取消），如果还没 resolve 则 resolve false
  if (!open && confirmDialogResolve) {
    confirmDialogResolve(false)
    confirmDialogResolve = null
  }
})

// 开单名称改变时重置订单数据
async function handleBillingNameChange(name: string) {
  form.value.billingName = name
  if (!name) {
    availableOrdersData.value = []
    selectedOrderNo.value = ''
    currentOrderBills.value = []
    shipCustomers.value = []
    form.value.shipCustomer = ''
    return
  }

  if (pendingBills.value.length > 0 || confirmedBills.value.length > 0) {
    const confirmed = await confirmDialog('开单名称的改变将导致所有已选择的提单数据丢失,确认吗?')
    if (!confirmed) {
      return
    }
    pendingBills.value = []
    confirmedBills.value = []
  }

  // 清空已加载的订单数据，订单会在下拉框打开时按需加载
  availableOrdersData.value = []
  selectedOrderNo.value = ''
  currentOrderBills.value = []

  // 获取该公司的客户列表
  try {
    const result = await searchCompanies(name, 20, 1)
    if (result.ok && result.data && result.data.length > 0) {
      // 优先精确匹配，其次模糊匹配（Company名称可能带编号前缀）
      const company = result.data.find((c: any) => c.name === name)
        || result.data.find((c: any) => c.name.includes(name) || name.includes(c.name))
      if (company && company.customers?.length) {
        shipCustomers.value = company.customers
      } else {
        shipCustomers.value = []
      }
    } else {
      shipCustomers.value = []
    }
  } catch (error) {
    console.error('获取公司客户列表失败', error)
    shipCustomers.value = []
  }

  // 清空发货单位
  form.value.shipCustomer = ''
}

// 从API搜索订单号（用于 SearchableCombobox，支持分页懒加载）
async function searchOrders(search: string, limit: number, page: number) {
  if (!form.value.billingName) {
    return { ok: true, data: [], total: 0 }
  }

  try {
    const result = await getBillsByBillingName(form.value.billingName, search, page, limit)
    if (result.ok && result.data) {
      // 将加载的订单数据缓存起来（用于后续查找提单）
      const newOrders = result.data.filter(
        (order: any) => !availableOrdersData.value.some((o: any) => o.order_no === order.order_no),
      )
      if (newOrders.length > 0) {
        availableOrdersData.value = [...availableOrdersData.value, ...newOrders]
      }

      // 返回订单号列表给下拉框显示，同时合并本地已有但API未返回的订单（如 left_num=0 的提单所属订单）
      const apiOrderNos = new Set(result.data.map((order: any) => order.order_no))
      const localOnlyOrders = availableOrdersData.value
        .filter((o: any) => {
          if (apiOrderNos.has(o.order_no)) return false
          if (!search) return true
          return o.order_no.toLowerCase().includes(search.toLowerCase())
        })
        .map((o: any) => ({ name: o.order_no }))

      const data = [
        ...result.data.map((order: any) => ({ name: order.order_no })),
        ...localOnlyOrders,
      ].sort((a, b) => {
        // 有搜索词时，匹配的优先
        if (search) {
          const s = search.toLowerCase()
          const aMatch = a.name.toLowerCase().includes(s)
          const bMatch = b.name.toLowerCase().includes(s)
          if (aMatch !== bMatch) return aMatch ? -1 : 1
        }
        // 按订单号第4-7位（YYMM年月）降序，同年月按序号降序
        const aDate = a.name.substring(3, 7)
        const bDate = b.name.substring(3, 7)
        if (aDate !== bDate) return bDate.localeCompare(aDate)
        return b.name.localeCompare(a.name)
      })
      return { ok: true, data, total: result.total + localOnlyOrders.length }
    }
    return { ok: true, data: [], total: 0 }
  } catch (error) {
    console.error('搜索订单失败', error)
    return { ok: true, data: [], total: 0 }
  }
}

// 本地搜索提单号（用于 SearchableCombobox，按 bill_no 去重展示）
async function searchBills(search: string, limit: number, page: number) {
  let filtered = currentOrderBills.value
  if (search) {
    filtered = filtered.filter(
      (b: any) =>
        b.bill_no.toLowerCase().includes(search.toLowerCase()) ||
        (b.order_item_no && b.order_item_no.toString().includes(search)),
    )
  }
  // 按 bill_no 去重，显示每个 bill_no 下的项次数量
  const billNoMap = new Map<string, { count: number; first: any }>()
  for (const b of filtered) {
    const existing = billNoMap.get(b.bill_no)
    if (existing) {
      existing.count++
    } else {
      billNoMap.set(b.bill_no, { count: 1, first: b })
    }
  }
  const uniqueBills = Array.from(billNoMap.entries())
  const start = (page - 1) * limit
  const data = uniqueBills.slice(start, start + limit).map(([billNo, { count, first }]) => ({
    value: billNo,
    name: count > 1 ? `${billNo} (${count}个项次)` : billNo,
    left_num: first.left_num,
    _raw: first,
  }))
  return { ok: true, data, total: uniqueBills.length }
}

// 订单号改变时更新可选提单
function handleOrderChange(orderNo: string) {
  selectedOrderNo.value = orderNo
  if (!orderNo) {
    currentOrderBills.value = []
    orderPlanInfo.value = null
    return
  }

  // 异步获取订单计划信息
  getPlanByOrderNo(orderNo)
    .then((result) => {
      orderPlanInfo.value = result.ok && result.data ? result.data : null
    })
    .catch(() => {
      orderPlanInfo.value = null
    })

  // 从分组数据中找到该订单
  const orderData = availableOrdersData.value.find((o: any) => o.order_no === orderNo)
  if (!orderData) {
    currentOrderBills.value = []
    return
  }

  // 获取该订单的提单，过滤掉已无剩余量的
  currentOrderBills.value = (orderData.bills || []).filter((b: any) => {
    const isBlock = b.block_num > 0
    const baseLeft = b.left_num ?? 0

    if (isBlock) {
      // 定尺：按块数计算
      const confirmedSendNum = confirmedBills.value
        .filter((cb) => cb._id === b._id)
        .reduce((sum, cb) => sum + cb.send_num, 0)
      const pendingSendNum = pendingBills.value
        .filter((pb) => pb._id === b._id)
        .reduce((sum, pb) => sum + pb.send_num, 0)
      return baseLeft - confirmedSendNum - pendingSendNum > 0
    } else {
      // 非定尺：按重量计算
      const confirmedSendWeight = confirmedBills.value
        .filter((cb) => cb._id === b._id)
        .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)
      const pendingSendWeight = pendingBills.value
        .filter((pb) => pb._id === b._id)
        .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)
      return baseLeft - confirmedSendWeight - pendingSendWeight > 0.001
    }
  })
}

// 选择提单后批量添加同 bill_no 的所有项次到待确认列表
function handleBillSelect(billNo: string) {
  if (!billNo) return
  const matchingBills = currentOrderBills.value.filter((b: any) => b.bill_no === billNo)
  for (const bill of matchingBills) {
    addBillToPending(bill)
  }
}

// 添加提单到待确认列表
function addBillToPending(bill: any) {
  // 检查该提单是否已在待确认列表中
  if (pendingBills.value.some((b) => b._id === bill._id)) {
    toast.warning('该提单已在当前车辆的待确认列表中')
    return
  }

  const isBlock = bill.block_num > 0
  const baseLeft = bill.left_num || bill.left || 0
  let leftNum = 0

  if (isBlock) {
    // 定尺：按块数计算剩余
    const confirmedSendNum = confirmedBills.value
      .filter((cb) => cb._id === bill._id)
      .reduce((sum, cb) => sum + cb.send_num, 0)
    const pendingSendNum = pendingBills.value
      .filter((pb) => pb._id === bill._id)
      .reduce((sum, pb) => sum + pb.send_num, 0)
    leftNum = baseLeft - confirmedSendNum - pendingSendNum
  } else {
    // 非定尺：按重量计算剩余
    const confirmedSendWeight = confirmedBills.value
      .filter((cb) => cb._id === bill._id)
      .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)
    const pendingSendWeight = pendingBills.value
      .filter((pb) => pb._id === bill._id)
      .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)
    leftNum = baseLeft - confirmedSendWeight - pendingSendWeight
  }

  if (leftNum <= 0.001) {
    toast.warning('该提单已无剩余量')
    return
  }

  // 发运数默认为0，用户手动输入
  // 注意：bill 来自订单分组数据，不包含 order_no，使用当前选中的订单号
  pendingBills.value.push({
    _id: bill._id, // 提单唯一标识
    bill_no: bill.bill_no,
    order_no: selectedOrderNo.value,
    order_item_no: bill.order_item_no,
    brand_no: bill.brand_no,
    thickness: bill.thickness,
    width: bill.width,
    len: bill.len,
    weight: bill.weight,
    ship_warehouse: bill.ship_warehouse,
    contract_no: bill.contract_no,
    send_num: 0,
    send_weight: 0,
    wagon_no: currentWagonNo.value,
  })

  handleOrderChange(selectedOrderNo.value)
}

// 删除待确认的提单
function removePendingBill(index: number) {
  pendingBills.value.splice(index, 1)
  handleOrderChange(selectedOrderNo.value)
}

// 更新发运数量
function updateSendNum(index: number, value: number) {
  const bill = pendingBills.value[index]
  const isBlock = isBlockBill(bill)

  // 获取最大可用量
  const maxNum = getMaxAvailable(bill, index)

  // 定尺时：发运数受剩余量限制
  // 非定尺时：发运数不受限制，只有发运重量受限制
  let clamped = value
  if (isBlock && clamped > maxNum) {
    clamped = maxNum
  }
  if (clamped < 0) {
    clamped = 0
  }

  // 当输入值被截断时（如剩余30输入300），需要强制刷新输入框显示
  // Vue 在 model-value 未变化时不会重新渲染输入框
  if (value !== clamped) {
    bill.send_num = value
    nextTick(() => {
      bill.send_num = clamped
      if (isBlock) {
        bill.send_weight = Number((clamped * (bill.weight || 0)).toFixed(3))
      }
    })
  } else {
    bill.send_num = clamped
    if (isBlock) {
      bill.send_weight = Number((clamped * (bill.weight || 0)).toFixed(3))
    }
  }
}

// 更新发运重量（乱尺用） - 如果输入值大于可用量，自动设为可用量
function updateSendWeight(index: number, value: number) {
  const bill = pendingBills.value[index]

  // 获取最大可用量（乱尺时left_num存储的是重量）
  const maxWeight = getMaxAvailable(bill, index)

  let clamped = value
  if (clamped > maxWeight) {
    clamped = maxWeight
  }
  if (clamped < 0) {
    clamped = 0
  }

  if (value !== clamped) {
    bill.send_weight = value
    nextTick(() => {
      bill.send_weight = clamped
    })
  } else {
    bill.send_weight = clamped
  }
}

// 确认当前车辆的配发
async function confirmWagon() {
  if (!currentWagonNo.value) {
    toast.warning('请选择车号')
    return
  }

  if (pendingBills.value.length === 0) {
    toast.warning('请选择要配发的提单')
    return
  }

  const invalidBills = pendingBills.value.filter((b) => {
    return (b.send_num > 0 && b.send_weight === 0) || (b.send_num === 0 && b.send_weight > 0)
  })
  if (invalidBills.length > 0) {
    toast.warning('请完成发运块数和发运重量的输入')
    return
  }

  // 过滤掉发运块数和发运重量都为0的记录
  const validBills = pendingBills.value.filter((b) => {
    return b.send_num > 0 || b.send_weight > 0
  })

  if (validBills.length === 0) {
    toast.warning('请至少为一个提单输入发运数量')
    return
  }

  const innerNo = `${waybillNo.value}${String(innerWaybillNoOrder.value).padStart(3, '0')}`

  // 新配发的车插入到最前面
  const newBills = validBills.map((bill) => ({
    ...bill,
    wagon_no: currentWagonNo.value,
    inner_waybill_no: innerNo,
    ship_from: currentOrigin.value,
  }))
  confirmedBills.value.unshift(...newBills)

  pendingBills.value = []
  innerWaybillNoOrder.value++

  const wagonName = currentWagonNo.value
  currentWagonNo.value = ''

  toast.success(`车辆 "${wagonName}" 配发完成！`)
  handleOrderChange(selectedOrderNo.value)
}

// 检查是否可以保存
const canSave = computed(() => {
  const hasBasicInfo =
    waybillNo.value &&
    form.value.vesselName &&
    form.value.billingName &&
    form.value.shipFrom &&
    form.value.shipTo &&
    pendingBills.value.length === 0

  // 如果是已存在的运单，允许保存空明细（删除运单）
  if (isExistingInvoice.value) {
    return hasBasicInfo
  }

  // 新建运单必须有明细
  return hasBasicInfo && confirmedBills.value.length > 0
})

// 保存运单
async function saveInvoice(state: string) {
  if (!canSave.value) {
    if (pendingBills.value.length > 0) {
      toast.warning('有未确认的车辆配发，请先确认')
    } else {
      toast.warning('请完善运单信息')
    }
    return
  }

  loading.value = true
  try {
    const data = {
      waybill_no: waybillNo.value,
      vehicle_vessel_name: form.value.vesselName,
      ship_name: form.value.billingName,
      ship_customer: form.value.shipCustomer,
      ship_from: form.value.shipFrom,
      ship_to: form.value.shipTo,
      ship_date: form.value.shipDate
        ? (() => {
            const now = new Date()
            return `${form.value.shipDate} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
          })()
        : undefined,
      bills: confirmedBills.value.map((b) => ({ ...b, original_left_num: getBaseLeft(b._id!) })),
      total_weight: totalWeight.value,
      state,
      username: authStore.user?.userid,
      shipper: authStore.user?.userid,
      selfOwned: isSelfOwnedMode.value,
    }

    const result = await buildShipInvoice(data)
    if (result.ok) {
      localStorage.setItem(
        'currOperateItem',
        JSON.stringify({
          ship_name: form.value.billingName,
          ship_from: form.value.shipFrom,
          ship_to: form.value.shipTo,
        }),
      )

      isExistingInvoice.value = true // 标记为已保存的运单
      // 更新原始数据，使得保存后不再显示"未保存"
      originalConfirmedBills.value = JSON.parse(JSON.stringify(confirmedBills.value))

      toast.success(state === '已配发' ? '配发成功' : '保存成功')
      if (state === '已配发') {
        resetForm()
        waybillNo.value = ''
        isExistingInvoice.value = false
        originalConfirmedBills.value = []
      }
    } else if (result.code === 'BILL_MODIFIED') {
      // 自动刷新并高亮显示被修改的提单
      const modifiedBillIds = (result.modifiedBills || []).map((b: any) => b._id)

      toast.warning(result.message || '提单数据已被修改，已自动刷新', { duration: 4000 })

      // 重新加载可用提单数据
      if (form.value.billingName) {
        // 清空缓存的订单数据，强制重新加载
        availableOrdersData.value = []

        // 重新加载当前选中的订单
        if (selectedOrderNo.value) {
          try {
            const result = await getBillsByBillingName(form.value.billingName, '', 1, 100)
            if (result.ok && result.data) {
              availableOrdersData.value = result.data

              // 更新已确认提单的数据（刷新 left_num等字段）
              for (const confirmedBill of confirmedBills.value) {
                const freshBill = findBillById(confirmedBill._id!)
                if (freshBill) {
                  // 更新剩余量等关键字段，但保留用户输入的 send_num 和 send_weight
                  Object.assign(confirmedBill, {
                    left_num: freshBill.left_num,
                    block_num: freshBill.block_num,
                    total_weight: freshBill.total_weight,
                  })
                  // 更新 _originalLeft 以反映新的基准值
                  ;(confirmedBill as any)._originalLeft = freshBill.left_num
                }
              }

              // 更新待确认提单的数据
              for (const pendingBill of pendingBills.value) {
                const freshBill = findBillById(pendingBill._id!)
                if (freshBill) {
                  Object.assign(pendingBill, {
                    left_num: freshBill.left_num,
                    block_num: freshBill.block_num,
                    total_weight: freshBill.total_weight,
                  })
                }
              }
            }
          } catch (error) {
            console.error('刷新提单数据失败', error)
          }
        }

        // 高亮显示被修改的提单
        highlightedBillIds.value = new Set(modifiedBillIds)

        // 3秒后取消高亮
        setTimeout(() => {
          highlightedBillIds.value.clear()
        }, 3000)
      }
    } else {
      toast.error(result.message || '保存失败')
    }
  } catch (error: any) {
    toast.error(error.message || '保存失败')
  } finally {
    loading.value = false
  }
}

// 复制上次操作
function copyLastOperation() {
  const lastOp = localStorage.getItem('currOperateItem')
  if (lastOp) {
    try {
      const op = JSON.parse(lastOp)
      if (op.ship_name) form.value.billingName = op.ship_name
      if (op.ship_from) form.value.shipFrom = op.ship_from
      if (op.ship_to) form.value.shipTo = op.ship_to
      toast.success('已复制上次操作')
      if (op.ship_name) {
        handleBillingNameChange(op.ship_name)
      }
    } catch {
      toast.error('复制失败')
    }
  } else {
    toast.info('没有上次操作记录')
  }
}

// 获取订单显示文本（项次号补零到3位）
function getOrderDisplay(bill: any) {
  if (bill.order_item_no != null) {
    const itemNo = String(bill.order_item_no).padStart(3, '0')
    return `${bill.order_no}-${itemNo}`
  }
  return bill.order_no
}

// 判断是否为定尺
function isBlockBill(bill: InvoiceBill) {
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)
  if (originalBill) return originalBill.block_num > 0
  // 已加载运单的提单可能不在 availableOrdersData 中，使用自身属性
  return (bill as any).block_num > 0
}

// 获取提单的原始剩余量（还原扣减前）
function getBaseLeft(billId: string) {
  // 优先使用已加载运单中预计算的还原剩余量
  const confirmedWithOriginal = confirmedBills.value.find(
    (cb) => cb._id === billId && (cb as any)._originalLeft != null,
  )
  if (confirmedWithOriginal) {
    return (confirmedWithOriginal as any)._originalLeft
  }
  // 新建运单：使用 availableOrdersData 中的 left_num
  const originalBill = findBillById(billId)
  return originalBill?.left_num || originalBill?.left || 0
}

// 获取提单的最大可用量（用于输入框验证）
function getMaxAvailable(bill: InvoiceBill, index: number) {
  const baseLeft = getBaseLeft(bill._id!)
  const isBlock = isBlockBill(bill)

  if (isBlock) {
    // 定尺：按块数计算
    const confirmedSendNum = confirmedBills.value
      .filter((cb) => cb._id === bill._id)
      .reduce((sum, cb) => sum + cb.send_num, 0)

    const otherPendingSendNum = pendingBills.value
      .filter((pb, i) => pb._id === bill._id && i !== index)
      .reduce((sum, pb) => sum + pb.send_num, 0)

    return baseLeft - confirmedSendNum - otherPendingSendNum
  } else {
    // 非定尺：按重量计算
    const confirmedSendWeight = confirmedBills.value
      .filter((cb) => cb._id === bill._id)
      .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)

    const otherPendingSendWeight = pendingBills.value
      .filter((pb, i) => pb._id === bill._id && i !== index)
      .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)

    return baseLeft - confirmedSendWeight - otherPendingSendWeight
  }
}

// 获取已确认提单的最大可用量（排除当前行自身）
function getMaxAvailableForConfirmed(bill: InvoiceBill) {
  const baseLeft = getBaseLeft(bill._id!)
  const isBlock = isBlockBill(bill)

  if (isBlock) {
    const otherConfirmedSendNum = confirmedBills.value
      .filter((cb) => cb._id === bill._id && cb !== bill)
      .reduce((sum, cb) => sum + cb.send_num, 0)
    const pendingSendNum = pendingBills.value
      .filter((pb) => pb._id === bill._id)
      .reduce((sum, pb) => sum + pb.send_num, 0)
    return baseLeft - otherConfirmedSendNum - pendingSendNum
  } else {
    const otherConfirmedSendWeight = confirmedBills.value
      .filter((cb) => cb._id === bill._id && cb !== bill)
      .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)
    const pendingSendWeight = pendingBills.value
      .filter((pb) => pb._id === bill._id)
      .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)
    return baseLeft - otherConfirmedSendWeight - pendingSendWeight
  }
}

// 更新已确认提单的发运数量
function updateConfirmedSendNum(bill: InvoiceBill, value: number) {
  const isBlock = isBlockBill(bill)
  const maxNum = getMaxAvailableForConfirmed(bill)

  let clamped = value
  if (isBlock && clamped > maxNum) {
    clamped = maxNum
  }
  if (clamped < 0) {
    clamped = 0
  }

  if (value !== clamped) {
    bill.send_num = value
    nextTick(() => {
      bill.send_num = clamped
      if (isBlock) {
        bill.send_weight = Number((clamped * (bill.weight || 0)).toFixed(3))
      }
    })
  } else {
    bill.send_num = clamped
    if (isBlock) {
      bill.send_weight = Number((clamped * (bill.weight || 0)).toFixed(3))
    }
  }
}

// 更新已确认提单的发运重量（乱尺用）
function updateConfirmedSendWeight(bill: InvoiceBill, value: number) {
  const maxWeight = getMaxAvailableForConfirmed(bill)

  let clamped = value
  if (clamped > maxWeight) {
    clamped = maxWeight
  }
  if (clamped < 0) {
    clamped = 0
  }

  if (value !== clamped) {
    bill.send_weight = value
    nextTick(() => {
      bill.send_weight = clamped
    })
  } else {
    bill.send_weight = clamped
  }
}

// 获取已确认提单的动态剩余量
function getConfirmedBillLeftNum(bill: InvoiceBill) {
  const maxAvailable = getMaxAvailableForConfirmed(bill)

  if (isBlockBill(bill)) {
    return maxAvailable - (bill.send_num || 0)
  } else {
    return Number((maxAvailable - (bill.send_weight || 0)).toFixed(3))
  }
}

// 获取提单的动态剩余量（最大可用量 - 当前发运量）
function getBillLeftNum(bill: InvoiceBill, index: number) {
  const maxAvailable = getMaxAvailable(bill, index)

  if (isBlockBill(bill)) {
    // 定尺：剩余量 = 最大可用量 - 当前发运数
    return maxAvailable - (bill.send_num || 0)
  } else {
    // 非定尺：剩余量 = 最大可用量 - 当前发运重量
    return Number((maxAvailable - (bill.send_weight || 0)).toFixed(3))
  }
}

// 按车号分组显示已确认的提单
const confirmedByWagon = computed(() => {
  // 按 wagon_no + inner_waybill_no 组合分组
  // 这样同一辆车的多次配发会分开显示
  const groups: Record<string, { bills: InvoiceBill[]; wagonNo: string; innerWaybillNo: string }> = {}
  confirmedBills.value.forEach((bill) => {
    const wagonNo = bill.wagon_no || '未知'
    const innerWaybillNo = bill.inner_waybill_no || ''
    const key = `${wagonNo}_${innerWaybillNo}`
    if (!groups[key]) {
      groups[key] = {
        bills: [],
        wagonNo,
        innerWaybillNo,
      }
    }
    groups[key].bills.push(bill)
  })
  return groups
})

// 获取某车的配发统计
function getWagonStats(bills: InvoiceBill[]) {
  const totalNum = bills.reduce((sum, b) => sum + (b.send_num || 0), 0)
  const totalWeight = bills.reduce((sum, b) => sum + (b.send_weight || 0), 0)
  return { totalNum, totalWeight }
}

// 删除某车某次配发的所有记录
async function deleteWagonBills(wagonNo: string, innerWaybillNo: string) {
  const confirmed = await confirmDialog(`确定删除车号 "${wagonNo}" 的本次配发记录吗？`, '删除配发')
  if (!confirmed) return

  confirmedBills.value = confirmedBills.value.filter(
    (b) => !(b.wagon_no === wagonNo && b.inner_waybill_no === innerWaybillNo),
  )
  handleOrderChange(selectedOrderNo.value)
  toast.success(`已删除车号 "${wagonNo}" 的配发记录`)
}

// 删除某条已确认的配发记录
async function deleteConfirmedBill(wagonNo: string, innerWaybillNo: string, billNo: string) {
  const confirmed = await confirmDialog(`确定删除车号 "${wagonNo}" 的提单 "${billNo}" 吗？`, '删除配发记录')
  if (!confirmed) return
  const index = confirmedBills.value.findIndex(
    (b) => b.wagon_no === wagonNo && b.inner_waybill_no === innerWaybillNo && b.bill_no === billNo,
  )
  if (index > -1) {
    confirmedBills.value.splice(index, 1)
    handleOrderChange(selectedOrderNo.value)
  }
}

// 打开运单列表对话框
async function openInvoiceList() {
  showInvoiceListDialog.value = true
  invoiceListPage.value = 1
  invoiceSearchKeyword.value = ''
  await loadInvoiceList()
}

// 加载运单列表
async function loadInvoiceList() {
  invoiceListLoading.value = true
  try {
    const params: any = {
      keyword: invoiceSearchKeyword.value,
      page: invoiceListPage.value,
      limit: invoiceListLimit.value,
      transportType: '船',
    }

    // 只有在勾选时才传递myOnly参数
    if (showMyOnly.value) {
      params.myOnly = true
    }

    const result = await getInvoiceList(params)
    if (result.ok) {
      invoiceList.value = result.data
      invoiceListTotal.value = result.total
    } else {
      toast.error('加载运单列表失败')
    }
  } catch (error: any) {
    toast.error(error.message || '加载运单列表失败')
  } finally {
    invoiceListLoading.value = false
  }
}

// 搜索运单
async function searchInvoices() {
  invoiceListPage.value = 1
  await loadInvoiceList()
}

// 加载运单详情
async function loadInvoiceDetail(invoice: any) {
  // 检查是否有未保存的改动
  if (hasUnsavedChanges.value) {
    const confirmed = await confirmDialog('当前有未保存的改动，确定要放弃这些改动并打开运单吗？')
    if (!confirmed) return
  }

  loading.value = true
  try {
    const result = await getInvoiceDetail(invoice.waybill_no)
    if (result.ok && result.data) {
      const inv = result.data

      // 设置运单号和基本信息
      waybillNo.value = inv.waybill_no
      form.value.vesselName = inv.vehicle_vessel_name
      form.value.billingName = inv.ship_name
      form.value.shipCustomer = inv.ship_customer || ''
      form.value.shipFrom = inv.ship_from
      form.value.shipTo = inv.ship_to
      form.value.shipDate = inv.ship_date ? inv.ship_date.substring(0, 10) : ''

      isExistingInvoice.value = true

      // 加载开单名称的可用提单
      await handleBillingNameChange(inv.ship_name)

      // 处理已配发的提单
      confirmedBills.value = []
      for (const invBill of inv.bills) {
        const billInfo = invBill.bill_id
        if (!billInfo) continue

        // 还原此运单扣减前的原始剩余量（invBill.num/weight 是该提单的总发运量）
        const currentLeft = billInfo.left_num || 0
        const originalLeft =
          billInfo.block_num > 0
            ? currentLeft + (invBill.num || 0)
            : Number((currentLeft + (invBill.weight || 0)).toFixed(3))

        // 处理每个车辆
        for (const vehicle of invBill.vehicles || []) {
          confirmedBills.value.push({
            _id: billInfo._id,
            bill_no: billInfo.bill_no,
            order_no: billInfo.order_no,
            order_item_no: billInfo.order_item_no || '',
            brand_no: '',
            thickness: billInfo.thickness,
            width: billInfo.width,
            len: billInfo.len,
            weight: billInfo.weight,
            block_num: billInfo.block_num,
            total_weight: billInfo.total_weight,
            left_num: billInfo.left_num,
            send_num: vehicle.send_num || 0,
            send_weight: vehicle.send_weight || 0,
            wagon_no: vehicle.veh_name || '',
            inner_waybill_no: vehicle.inner_waybill_no || '',
            ship_from: vehicle.veh_ship_from || inv.ship_from,
            _originalLeft: originalLeft,
          })
        }
      }

      // 将运单中的提单注入到 availableOrdersData，确保 left_num=0 的提单也能在下拉列表中找到
      // 按提单去重（船运同一提单可能有多个车辆记录）
      const seenBillIds = new Set<string>()
      for (const bill of confirmedBills.value) {
        const orderNo = bill.order_no
        if (!orderNo || !bill._id || seenBillIds.has(bill._id)) continue
        seenBillIds.add(bill._id)

        let orderData = availableOrdersData.value.find((o: any) => o.order_no === orderNo)
        if (!orderData) {
          orderData = { order_no: orderNo, bills: [] }
          availableOrdersData.value.push(orderData)
        }

        const existingBill = orderData.bills.find((b: any) => b._id === bill._id)
        if (!existingBill) {
          orderData.bills.push({
            _id: bill._id,
            bill_no: bill.bill_no,
            order_no: bill.order_no,
            order_item_no: bill.order_item_no,
            brand_no: bill.brand_no,
            thickness: bill.thickness,
            width: bill.width,
            len: bill.len,
            weight: bill.weight,
            block_num: (bill as any).block_num,
            total_weight: (bill as any).total_weight,
            left_num: (bill as any)._originalLeft,
            ship_warehouse: (bill as any).ship_warehouse,
            contract_no: (bill as any).contract_no,
          })
        }
      }

      // 保存原始数据用于检测改动
      originalConfirmedBills.value = JSON.parse(JSON.stringify(confirmedBills.value))

      showInvoiceListDialog.value = false
      toast.success('运单加载成功')
    } else {
      toast.error(result.message || '加载运单失败')
    }
  } catch (error: any) {
    toast.error(error.message || '加载运单失败')
  } finally {
    loading.value = false
  }
}

// 格式化日期时间
function formatDate(date: any) {
  if (!date) return '-'
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  if (h === '00' && min === '00' && s === '00') return `${y}-${m}-${day}`
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

// 格式化重量（最多3位小数）
function formatWeight(weight: number) {
  if (weight == null) return '-'
  return Number(weight).toFixed(3)
}

// 检查提单是否被标记为已修改（需要高亮）
function isBillHighlighted(bill: InvoiceBill) {
  return bill._id ? highlightedBillIds.value.has(bill._id) : false
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '配发货-船运(自有车)' : '配发货-船运'"
    :description="
      isSelfOwnedMode
        ? '使用自有船舶进行货物配发，需要为每批货物指定装卸车辆'
        : '使用船舶进行货物配发，需要为每批货物指定装卸车辆'
    "
  >
    <template #actions>
      <div class="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        <UiButton size="sm" :disabled="loading" @click="createNewInvoice">
          <Plus class="w-4 h-4 mr-1" />
          新建运单
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="loading" @click="openInvoiceList">
          <FolderOpen class="w-4 h-4 mr-1" />
          修改运单
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="!waybillNo" @click="copyLastOperation">
          <Copy class="w-4 h-4 mr-1" />
          复制上次操作
        </UiButton>
        <!-- 状态提示 -->
        <div v-if="waybillNo" class="flex items-center gap-2 sm:gap-3 ml-2">
          <div
            class="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm"
            :class="
              isExistingInvoice
                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
                : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
            "
          >
            <span class="text-xs">{{ isExistingInvoice ? '修改运单' : '新建运单' }}</span>
            <span class="text-xs bg-white dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 rounded">{{ waybillNo }}</span>
          </div>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- 紧凑式输入块 -->
      <div v-if="waybillNo" class="p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <!-- 船号 -->
          <SearchableCombobox v-model="form.vesselName" :search-fn="searchShips" placeholder="船号" />

          <!-- 始发地 -->
          <SearchableCombobox v-model="form.shipFrom" :search-fn="searchWarehouses" placeholder="始发地" />

          <!-- 目的地 -->
          <SearchableCombobox v-model="form.shipTo" :search-fn="searchDestinations" placeholder="目的地" />

          <!-- 开单名称 -->
          <SearchableCombobox
            :model-value="form.billingName"
            :search-fn="searchBillingNames"
            placeholder="开单名称"
            @update:model-value="handleBillingNameChange"
          />

          <!-- 发货单位 -->
          <SearchableCombobox
            v-model="form.shipCustomer"
            :search-fn="searchShipCustomers"
            placeholder="发货单位"
            :disabled="!form.billingName || shipCustomers.length === 0"
          />

          <!-- 发货日期 -->
          <DatePicker
            v-model="form.shipDate"
            placeholder="发货日期"
            :disabled-date="(d: Date) => d > new Date()"
            disabled-hint="不能选择未来日期"
          />
        </div>

        <!-- 车辆配发区域 -->
        <div v-if="form.billingName" class="mt-3 pt-3 border-t">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <!-- 车号 -->
            <SearchableCombobox v-model="currentWagonNo" :search-fn="searchTrucks" placeholder="车号(装卸车辆)" />

            <!-- 始发地 -->
            <SearchableCombobox v-model="currentOrigin" :search-fn="searchWarehouses" placeholder="车辆始发地" />
          </div>

          <!-- 订单号和提单号单独一行 -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            <!-- 订单号 -->
            <SearchableCombobox
              v-model="selectedOrderNo"
              :search-fn="searchOrders"
              placeholder="订单号"
              @update:model-value="handleOrderChange"
            />

            <!-- 提单号 -->
            <SearchableCombobox
              model-value=""
              :search-fn="searchBills"
              placeholder="提单号"
              :disabled="!selectedOrderNo"
              @update:model-value="handleBillSelect"
            />
          </div>

          <!-- 订单计划提示 -->
          <div v-if="orderPlanInfo" class="mt-1 px-1 text-xs text-muted-foreground">
            订单计划: 订单量 {{ orderPlanInfo.order_weight.toFixed(3) }} 吨 | 已发
            {{ (orderPlanInfo.order_weight - orderPlanInfo.left_weight).toFixed(3) }} 吨 | 剩余
            {{ orderPlanInfo.left_weight.toFixed(3) }} 吨
          </div>
        </div>
      </div>

      <!-- 当前车辆待确认提单 -->
      <div v-if="pendingBills.length > 0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <h4 class="text-sm font-medium">当前车辆待确认 ({{ currentWagonNo || '未选择车号' }})</h4>
          <div class="text-xs sm:text-sm text-muted-foreground">
            <span>块数: {{ wagonTotalNumber }}</span>
            <span class="ml-3 sm:ml-4">重量: {{ wagonTotalWeight.toFixed(3) }}</span>
          </div>
        </div>

        <!-- 桌面端表格 -->
        <div class="hidden lg:block border rounded overflow-x-auto">
          <UiTable class="min-w-[800px]">
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead class="w-10" />
                <UiTableHead>提单号</UiTableHead>
                <UiTableHead>订单号</UiTableHead>
                <UiTableHead>厚度</UiTableHead>
                <UiTableHead>宽度</UiTableHead>
                <UiTableHead>长度</UiTableHead>
                <UiTableHead>单重</UiTableHead>
                <UiTableHead>可用量</UiTableHead>
                <UiTableHead>发运数</UiTableHead>
                <UiTableHead>发运重量</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              <UiTableRow
                v-for="(bill, index) in pendingBills"
                :key="`${bill.bill_no}-${index}`"
                :class="{
                  'bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
                }"
              >
                <UiTableCell>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6 text-destructive"
                    @click="removePendingBill(index)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </UiButton>
                </UiTableCell>
                <UiTableCell>{{ bill.bill_no }}</UiTableCell>
                <UiTableCell>{{ getOrderDisplay(bill) }}</UiTableCell>
                <UiTableCell>{{ bill.thickness }}</UiTableCell>
                <UiTableCell>{{ bill.width }}</UiTableCell>
                <UiTableCell>{{ bill.len }}</UiTableCell>
                <UiTableCell>{{ bill.weight?.toFixed(4) }}</UiTableCell>
                <UiTableCell>{{ getBillLeftNum(bill, index) }}</UiTableCell>
                <UiTableCell>
                  <UiInput
                    :model-value="bill.send_num"
                    type="number"
                    class="w-20 h-8"
                    min="0"
                    :max="isBlockBill(bill) ? getMaxAvailable(bill, index) : undefined"
                    step="any"
                    @update:model-value="updateSendNum(index, Number($event))"
                  />
                </UiTableCell>
                <UiTableCell>
                  <template v-if="isBlockBill(bill)">
                    {{ bill.send_weight?.toFixed(3) }}
                  </template>
                  <UiInput
                    v-else
                    :model-value="bill.send_weight"
                    type="number"
                    class="w-24 h-8"
                    min="0"
                    :max="getMaxAvailable(bill, index)"
                    step="0.001"
                    @update:model-value="updateSendWeight(index, Number($event))"
                  />
                </UiTableCell>
              </UiTableRow>
            </UiTableBody>
          </UiTable>
        </div>

        <!-- 移动端卡片 -->
        <div class="lg:hidden space-y-2">
          <div
            v-for="(bill, index) in pendingBills"
            :key="`${bill.bill_no}-${index}`"
            class="border rounded-lg overflow-hidden bg-card"
            :class="{
              'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
            }"
          >
            <!-- 卡片头部 -->
            <div class="p-3 flex items-start gap-3">
              <UiButton
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-destructive shrink-0 mt-1"
                @click="removePendingBill(index)"
              >
                <Trash2 class="w-4 h-4" />
              </UiButton>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-medium text-sm truncate">{{ bill.bill_no }}</span>
                  <button
                    class="text-primary hover:text-primary/80 p-1 shrink-0"
                    @click="togglePendingCardExpand(index)"
                  >
                    <ChevronDown v-if="!expandedPendingCards.has(index)" class="w-4 h-4" />
                    <ChevronUp v-else class="w-4 h-4" />
                  </button>
                </div>
                <div class="text-sm text-muted-foreground space-y-0.5">
                  <div>订单: {{ getOrderDisplay(bill) }}</div>
                  <div class="flex items-center justify-between">
                    <span>可用量: {{ getBillLeftNum(bill, index) }}</span>
                    <span :class="isBlockBill(bill) ? 'text-blue-600' : 'text-purple-600'">
                      {{ isBlockBill(bill) ? '定尺' : '乱尺' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 展开的详细信息 -->
            <div v-if="expandedPendingCards.has(index)" class="border-t bg-muted/30 p-3 text-sm space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <span class="text-muted-foreground">厚度:</span>
                  <span class="ml-1">{{ bill.thickness }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">宽度:</span>
                  <span class="ml-1">{{ bill.width }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">长度:</span>
                  <span class="ml-1">{{ bill.len }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">单重:</span>
                  <span class="ml-1">{{ bill.weight?.toFixed(4) }}</span>
                </div>
              </div>

              <!-- 发运数输入 -->
              <div class="pt-2 border-t space-y-2">
                <div>
                  <label class="text-xs text-muted-foreground block mb-1">发运数</label>
                  <UiInput
                    :model-value="bill.send_num"
                    type="number"
                    class="w-full"
                    min="0"
                    :max="isBlockBill(bill) ? getMaxAvailable(bill, index) : undefined"
                    step="any"
                    @update:model-value="updateSendNum(index, Number($event))"
                  />
                </div>
                <div>
                  <label class="text-xs text-muted-foreground block mb-1">发运重量</label>
                  <template v-if="isBlockBill(bill)">
                    <div class="p-2 bg-muted rounded text-center">
                      {{ bill.send_weight?.toFixed(3) }}
                    </div>
                  </template>
                  <UiInput
                    v-else
                    :model-value="bill.send_weight"
                    type="number"
                    class="w-full"
                    min="0"
                    :max="getMaxAvailable(bill, index)"
                    step="0.001"
                    @update:model-value="updateSendWeight(index, Number($event))"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-2 flex justify-end">
          <UiButton :disabled="!currentWagonNo || wagonTotalNumber === 0" @click="confirmWagon">
            <Check class="w-4 h-4 mr-1" />
            确认此车配发
          </UiButton>
        </div>
      </div>

      <!-- 已确认的提单 -->
      <div v-if="confirmedBills.length > 0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <h4 class="text-sm font-medium">已确认配发</h4>
          <div class="text-xs sm:text-sm text-muted-foreground">
            <span>
              总块数: <strong>{{ totalNumber }}</strong>
            </span>
            <span class="ml-3 sm:ml-4">
              总重量: <strong>{{ totalWeight.toFixed(3) }}</strong> 吨
            </span>
          </div>
        </div>

        <div v-for="(group, key) in confirmedByWagon" :key="key" class="mb-3">
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground mb-1 bg-muted px-2 py-1.5 sm:py-1 rounded"
          >
            <div class="flex flex-wrap items-center gap-2 sm:gap-4">
              <span>
                车号: <strong class="text-foreground">{{ group.wagonNo }}</strong>
              </span>
              <span>
                块数: <strong>{{ getWagonStats(group.bills).totalNum }}</strong>
              </span>
              <span>
                重量: <strong>{{ getWagonStats(group.bills).totalWeight.toFixed(3) }}</strong>
              </span>
              <span>
                起始地: <strong class="text-foreground">{{ group.bills[0]?.ship_from || '-' }}</strong>
              </span>
            </div>
            <UiButton
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-destructive hover:text-destructive"
              @click="deleteWagonBills(group.wagonNo, group.innerWaybillNo)"
            >
              <Trash2 class="w-3 h-3 mr-1" />
              删除此车
            </UiButton>
          </div>

          <!-- 桌面端表格 -->
          <div class="hidden lg:block border rounded overflow-x-auto">
            <UiTable class="min-w-[800px]">
              <UiTableHeader>
                <UiTableRow>
                  <UiTableHead class="w-10" />
                  <UiTableHead>提单号</UiTableHead>
                  <UiTableHead>订单号</UiTableHead>
                  <UiTableHead>厚度</UiTableHead>
                  <UiTableHead>宽度</UiTableHead>
                  <UiTableHead>长度</UiTableHead>
                  <UiTableHead>单重</UiTableHead>
                  <UiTableHead>可用量</UiTableHead>
                  <UiTableHead>发运数</UiTableHead>
                  <UiTableHead>发运重量</UiTableHead>
                </UiTableRow>
              </UiTableHeader>
              <UiTableBody>
                <UiTableRow
                  v-for="bill in group.bills"
                  :key="`${bill.bill_no}-${bill.inner_waybill_no}`"
                  :class="{
                    'bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
                  }"
                >
                  <UiTableCell>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 text-destructive"
                      @click="deleteConfirmedBill(group.wagonNo, group.innerWaybillNo, bill.bill_no)"
                    >
                      <Trash2 class="w-4 h-4" />
                    </UiButton>
                  </UiTableCell>
                  <UiTableCell>{{ bill.bill_no }}</UiTableCell>
                  <UiTableCell>{{ getOrderDisplay(bill) }}</UiTableCell>
                  <UiTableCell>{{ bill.thickness }}</UiTableCell>
                  <UiTableCell>{{ bill.width }}</UiTableCell>
                  <UiTableCell>{{ bill.len }}</UiTableCell>
                  <UiTableCell>{{ bill.weight?.toFixed(4) }}</UiTableCell>
                  <UiTableCell>{{ getConfirmedBillLeftNum(bill) }}</UiTableCell>
                  <UiTableCell>
                    <UiInput
                      :model-value="bill.send_num"
                      type="number"
                      class="w-20 h-8"
                      min="0"
                      :max="isBlockBill(bill) ? getMaxAvailableForConfirmed(bill) : undefined"
                      step="any"
                      @update:model-value="updateConfirmedSendNum(bill, Number($event))"
                    />
                  </UiTableCell>
                  <UiTableCell>
                    <template v-if="isBlockBill(bill)">
                      {{ bill.send_weight?.toFixed(3) }}
                    </template>
                    <UiInput
                      v-else
                      :model-value="bill.send_weight"
                      type="number"
                      class="w-24 h-8"
                      min="0"
                      :max="getMaxAvailableForConfirmed(bill)"
                      step="0.001"
                      @update:model-value="updateConfirmedSendWeight(bill, Number($event))"
                    />
                  </UiTableCell>
                </UiTableRow>
              </UiTableBody>
            </UiTable>
          </div>

          <!-- 移动端卡片 -->
          <div class="lg:hidden space-y-2">
            <div
              v-for="bill in group.bills"
              :key="`${bill.bill_no}-${bill.inner_waybill_no}`"
              class="border rounded-lg overflow-hidden bg-card"
              :class="{
                'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
              }"
            >
              <!-- 卡片头部 -->
              <div class="p-3 flex items-start gap-3">
                <UiButton
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 text-destructive shrink-0 mt-1"
                  @click="deleteConfirmedBill(group.wagonNo, group.innerWaybillNo, bill.bill_no)"
                >
                  <Trash2 class="w-4 h-4" />
                </UiButton>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-medium text-sm truncate">{{ bill.bill_no }}</span>
                    <button
                      class="text-primary hover:text-primary/80 p-1 shrink-0"
                      @click="toggleConfirmedCardExpand(`${group.wagonNo}-${bill.bill_no}-${bill.inner_waybill_no}`)"
                    >
                      <ChevronDown
                        v-if="!expandedConfirmedCards.has(`${group.wagonNo}-${bill.bill_no}-${bill.inner_waybill_no}`)"
                        class="w-4 h-4"
                      />
                      <ChevronUp v-else class="w-4 h-4" />
                    </button>
                  </div>
                  <div class="text-sm text-muted-foreground space-y-0.5">
                    <div>订单: {{ getOrderDisplay(bill) }}</div>
                    <div class="flex items-center justify-between">
                      <span>发运: {{ bill.send_num }}块 / {{ bill.send_weight?.toFixed(3) }}吨</span>
                      <span>可用量: {{ getConfirmedBillLeftNum(bill) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 展开的详细信息 -->
              <div
                v-if="expandedConfirmedCards.has(`${group.wagonNo}-${bill.bill_no}-${bill.inner_waybill_no}`)"
                class="border-t bg-muted/30 p-3 text-sm space-y-2"
              >
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <span class="text-muted-foreground">厚度:</span>
                    <span class="ml-1">{{ bill.thickness }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">宽度:</span>
                    <span class="ml-1">{{ bill.width }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">长度:</span>
                    <span class="ml-1">{{ bill.len }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">单重:</span>
                    <span class="ml-1">{{ bill.weight?.toFixed(4) }}</span>
                  </div>
                </div>

                <!-- 发运数编辑 -->
                <div class="pt-2 border-t space-y-2">
                  <div>
                    <label class="text-xs text-muted-foreground block mb-1">发运数</label>
                    <UiInput
                      :model-value="bill.send_num"
                      type="number"
                      class="w-full"
                      min="0"
                      :max="isBlockBill(bill) ? getMaxAvailableForConfirmed(bill) : undefined"
                      step="any"
                      @update:model-value="updateConfirmedSendNum(bill, Number($event))"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-muted-foreground block mb-1">发运重量</label>
                    <template v-if="isBlockBill(bill)">
                      <div class="p-2 bg-muted rounded text-center">
                        {{ bill.send_weight?.toFixed(3) }}
                      </div>
                    </template>
                    <UiInput
                      v-else
                      :model-value="bill.send_weight"
                      type="number"
                      class="w-full"
                      min="0"
                      :max="getMaxAvailableForConfirmed(bill)"
                      step="0.001"
                      @update:model-value="updateConfirmedSendWeight(bill, Number($event))"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 固定在内容区域底部的操作栏 -->
        <div
          class="sticky bottom-0 z-40 -mx-4 -mb-2 bg-background/95 backdrop-blur-sm border-t shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
        >
          <div class="flex items-center justify-between px-4 py-3">
            <!-- 左侧：未保存状态 -->
            <div class="flex items-center">
              <Transition
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 -translate-x-2"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 -translate-x-2"
              >
                <div
                  v-if="hasUnsavedChanges"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800"
                >
                  <span class="relative flex h-2.5 w-2.5">
                    <span
                      class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"
                    />
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                  </span>
                  <span class="text-sm font-medium text-orange-600 dark:text-orange-400">未保存</span>
                </div>
              </Transition>
            </div>

            <!-- 右侧：保存按钮 -->
            <div class="flex gap-2">
              <UiButton :disabled="!canSave || loading" @click="saveInvoice('新建')">
                <Save class="w-4 h-4 mr-1" />
                保存
              </UiButton>
              <UiButton :disabled="!canSave || !form.shipDate || loading" @click="saveInvoice('已配发')">
                <Send class="w-4 h-4 mr-1" />
                保存并确定配发
              </UiButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!waybillNo" class="border rounded-lg p-12 text-center text-muted-foreground">
        <p>请点击"新建运单"开始创建船运配发货单</p>
        <p class="text-xs mt-2">船运需要为每批货物指定装卸的车辆</p>
      </div>
    </div>

    <!-- 运单列表对话框 -->
    <UiDialog v-model:open="showInvoiceListDialog">
      <UiDialogContent class="w-[95vw] md:min-w-[800px] md:max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
        <UiDialogHeader>
          <UiDialogTitle>修改运单</UiDialogTitle>
        </UiDialogHeader>

        <div class="flex-1 overflow-hidden flex flex-col space-y-4 min-h-[50vh]">
          <!-- 搜索框和筛选 -->
          <div class="flex items-center gap-2 flex-wrap">
            <UiInput
              v-model="invoiceSearchKeyword"
              placeholder="搜索车船号或开单名称..."
              class="max-w-[300px]"
              @keyup.enter="searchInvoices"
            />
            <UiButton :disabled="invoiceListLoading" @click="searchInvoices">
              <Search class="w-4 h-4 mr-1" />
              搜索
            </UiButton>
            <!-- 管理员：只看我的运单 -->
            <div v-if="isAdmin" class="flex items-center gap-2 ml-2">
              <input
                id="my-only"
                v-model="showMyOnly"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
              <label for="my-only" class="text-sm cursor-pointer whitespace-nowrap">只看我配发的运单</label>
            </div>
          </div>

          <!-- 运单列表 -->
          <div class="overflow-auto border rounded max-h-[400px] relative">
            <div v-if="!invoiceListLoading && invoiceList.length > 0" class="overflow-x-auto">
              <UiTable>
                <UiTableHeader>
                  <UiTableRow>
                    <UiTableHead>运单号</UiTableHead>
                    <UiTableHead>车船号</UiTableHead>
                    <UiTableHead>开单名称</UiTableHead>
                    <UiTableHead>始发地</UiTableHead>
                    <UiTableHead>目的地</UiTableHead>
                    <UiTableHead>创建日期</UiTableHead>
                    <UiTableHead>配发日期</UiTableHead>
                    <UiTableHead>总重量(吨)</UiTableHead>
                    <UiTableHead>状态</UiTableHead>
                    <UiTableHead class="w-20">操作</UiTableHead>
                  </UiTableRow>
                </UiTableHeader>
                <UiTableBody>
                  <UiTableRow
                    v-for="invoice in invoiceList"
                    :key="invoice._id"
                    class="group cursor-pointer hover:bg-muted/50"
                    @click="loadInvoiceDetail(invoice)"
                  >
                    <UiTableCell>{{ invoice.waybill_no }}</UiTableCell>
                    <UiTableCell>{{ invoice.vehicle_vessel_name }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_name }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_from }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_to }}</UiTableCell>
                    <UiTableCell>{{ formatDate(invoice.create_date) }}</UiTableCell>
                    <UiTableCell>{{ formatDate(invoice.ship_date) }}</UiTableCell>
                    <UiTableCell>{{ formatWeight(invoice.total_weight) }}</UiTableCell>
                    <UiTableCell>{{ invoice.state }}</UiTableCell>
                    <UiTableCell>
                      <UiButton
                        size="sm"
                        variant="outline"
                        class="group-hover:!bg-primary group-hover:!text-primary-foreground group-hover:!border-primary transition-all"
                        @click="loadInvoiceDetail(invoice)"
                      >
                        打开
                      </UiButton>
                    </UiTableCell>
                  </UiTableRow>
                </UiTableBody>
              </UiTable>
            </div>

            <!-- 加载中 -->
            <div
              v-if="invoiceListLoading"
              class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <div class="text-muted-foreground">加载中...</div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="!invoiceListLoading && invoiceList.length === 0"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="text-muted-foreground">没有找到运单</div>
            </div>
          </div>

          <!-- 分页 -->
          <div
            v-if="invoiceListTotal > 0"
            class="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm border-t pt-3"
          >
            <div class="text-muted-foreground">
              共 {{ invoiceListTotal }} 条，第 {{ invoiceListPage }} /
              {{ Math.ceil(invoiceListTotal / invoiceListLimit) }} 页
            </div>
            <div class="flex items-center gap-2">
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage <= 1 || invoiceListLoading"
                @click="(invoiceListPage--, loadInvoiceList())"
              >
                上一页
              </UiButton>
              <span class="text-muted-foreground"> {{ invoiceListPage }} </span>
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage * invoiceListLimit >= invoiceListTotal || invoiceListLoading"
                @click="(invoiceListPage++, loadInvoiceList())"
              >
                下一页
              </UiButton>
            </div>
          </div>
        </div>
      </UiDialogContent>
    </UiDialog>

    <!-- 通用确认对话框 -->
    <ConfirmDialog
      v-model:open="confirmDialogOpen"
      cancel-button-text="取消"
      confirm-button-text="确定"
      @confirm="onConfirmDialogConfirm"
    >
      <template #title>{{ confirmDialogTitle }}</template>
      <template #description>
        <p>{{ confirmDialogMessage }}</p>
      </template>
    </ConfirmDialog>
  </BasicPage>
</template>
