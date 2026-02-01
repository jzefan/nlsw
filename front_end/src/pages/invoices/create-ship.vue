<script setup lang="ts">
import { Check, Copy, FolderOpen, Plus, Save, Search, Send, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { InvoiceBill } from '@/services/api/invoice.api'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import {
  buildShipInvoice,
  getBillsByBillingName,
  getInvoiceDetail,
  getInvoiceList,
  getMaxWaybillNo,

  searchDestinations,
  searchVehicles,
  searchWarehouses,
} from '@/services/api/invoice.api'
import { searchCompanies } from '@/services/api/plan.api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

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
const isAdmin = computed(() => {
  return authStore.user?.privilege === 'admin' || authStore.user?.privilege === '11111111'
})

// 检查是否有未保存的改动
const hasUnsavedChanges = computed(() => {
  // 如果没有运单号，没有改动
  if (!waybillNo.value)
    return false

  // 如果有待确认的提单，说明有改动
  if (pendingBills.value.length > 0)
    return true

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
  shipFrom: '',
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

// 当前公司的客户列表
const shipCustomers = ref<string[]>([])

// 当前车辆的待确认提单
const pendingBills = ref<InvoiceBill[]>([])
// 已确认的提单列表
const confirmedBills = ref<InvoiceBill[]>([])

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
  return searchVehicles(search, '船', limit, page)
}

// 搜索车辆
async function searchTrucks(search: string, limit: number, page: number) {
  return searchVehicles(search, '车', limit, page)
}

// 搜索发货单位（本地搜索当前公司的客户列表）
async function searchShipCustomers(search: string, limit: number, page: number) {
  let filtered = shipCustomers.value
  if (search) {
    filtered = filtered.filter((c: string) =>
      c.toLowerCase().includes(search.toLowerCase()),
    )
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
    if (!confirmed)
      return
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
    }
    else {
      toast.error('获取运单号失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '获取运单号失败')
  }
  finally {
    loading.value = false
  }
}

// 重置表单
function resetForm() {
  form.value = {
    vesselName: '',
    billingName: '',
    shipCustomer: '',
    shipFrom: '',
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

// 确认对话框
function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.confirm(message)) {
      resolve(true)
    }
    else {
      resolve(false)
    }
  })
}

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
    const result = await searchCompanies(name, 1, 1)
    if (result.ok && result.data && result.data.length > 0) {
      const company = result.data.find((c: any) => c.name === name)
      if (company && company.customers) {
        shipCustomers.value = company.customers
      }
      else {
        shipCustomers.value = []
      }
    }
    else {
      shipCustomers.value = []
    }
  }
  catch (error) {
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
      const newOrders = result.data.filter((order: any) =>
        !availableOrdersData.value.some((o: any) => o.order_no === order.order_no),
      )
      if (newOrders.length > 0) {
        availableOrdersData.value = [...availableOrdersData.value, ...newOrders]
      }

      // 返回订单号列表给下拉框显示
      const data = result.data.map((order: any) => ({
        name: order.order_no,
      }))
      return { ok: true, data, total: result.total }
    }
    return { ok: true, data: [], total: 0 }
  }
  catch (error) {
    console.error('搜索订单失败', error)
    return { ok: true, data: [], total: 0 }
  }
}

// 本地搜索提单号（用于 SearchableCombobox）
async function searchBills(search: string, limit: number, page: number) {
  let filtered = currentOrderBills.value
  if (search) {
    filtered = filtered.filter((b: any) =>
      b.bill_no.toLowerCase().includes(search.toLowerCase())
      || (b.order_item_no && b.order_item_no.toString().includes(search)),
    )
  }
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit).map((b: any) => ({
    name: b.bill_no,
    order_item_no: b.order_item_no,
    left_num: b.left_num,
    _raw: b,
  }))
  return { ok: true, data, total: filtered.length }
}

// 订单号改变时更新可选提单
function handleOrderChange(orderNo: string) {
  selectedOrderNo.value = orderNo
  if (!orderNo) {
    currentOrderBills.value = []
    return
  }

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
        .filter(cb => cb._id === b._id)
        .reduce((sum, cb) => sum + cb.send_num, 0)
      const pendingSendNum = pendingBills.value
        .filter(pb => pb._id === b._id)
        .reduce((sum, pb) => sum + pb.send_num, 0)
      return baseLeft - confirmedSendNum - pendingSendNum > 0
    }
    else {
      // 非定尺：按重量计算
      const confirmedSendWeight = confirmedBills.value
        .filter(cb => cb._id === b._id)
        .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)
      const pendingSendWeight = pendingBills.value
        .filter(pb => pb._id === b._id)
        .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)
      return baseLeft - confirmedSendWeight - pendingSendWeight > 0.001
    }
  })
}

// 选择提单后添加到待确认列表
function handleBillSelect(billNo: string) {
  if (!billNo)
    return
  const bill = currentOrderBills.value.find((b: any) => b.bill_no === billNo)
  if (bill) {
    addBillToPending(bill)
  }
}

// 添加提单到待确认列表
function addBillToPending(bill: any) {
  // 检查该提单是否已在待确认列表中
  if (pendingBills.value.some(b => b._id === bill._id)) {
    toast.warning('该提单已在当前车辆的待确认列表中')
    return
  }

  const isBlock = bill.block_num > 0
  const baseLeft = bill.left_num || bill.left || 0
  let leftNum = 0

  if (isBlock) {
    // 定尺：按块数计算剩余
    const confirmedSendNum = confirmedBills.value
      .filter(cb => cb._id === bill._id)
      .reduce((sum, cb) => sum + cb.send_num, 0)
    const pendingSendNum = pendingBills.value
      .filter(pb => pb._id === bill._id)
      .reduce((sum, pb) => sum + pb.send_num, 0)
    leftNum = baseLeft - confirmedSendNum - pendingSendNum
  }
  else {
    // 非定尺：按重量计算剩余
    const confirmedSendWeight = confirmedBills.value
      .filter(cb => cb._id === bill._id)
      .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)
    const pendingSendWeight = pendingBills.value
      .filter(pb => pb._id === bill._id)
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
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)

  // 获取最大可用量
  const maxNum = getMaxAvailable(bill, index)

  // 定尺时：发运数受剩余量限制
  // 非定尺时：发运数不受限制，只有发运重量受限制
  if (originalBill?.block_num > 0) {
    // 定尺：发运数范围 [0, 最大可用量]
    if (value > maxNum) {
      value = maxNum
    }
  }
  if (value < 0) {
    value = 0
  }

  bill.send_num = value
  // 定尺时自动计算发运重量
  if (originalBill?.block_num > 0) {
    bill.send_weight = Number((value * (originalBill.weight || 0)).toFixed(3))
  }
}

// 更新发运重量（乱尺用） - 如果输入值大于可用量，自动设为可用量
function updateSendWeight(index: number, value: number) {
  const bill = pendingBills.value[index]

  // 获取最大可用量（乱尺时left_num存储的是重量）
  const maxWeight = getMaxAvailable(bill, index)

  // 发运重量范围 [0, 最大可用量]，超过则设为最大可用量
  if (value > maxWeight) {
    value = maxWeight
  }
  if (value < 0) {
    value = 0
  }

  bill.send_weight = value
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

  const innerNo = `${waybillNo.value}${String(innerWaybillNoOrder.value).padStart(3, '0')}`

  pendingBills.value.forEach((bill) => {
    bill.wagon_no = currentWagonNo.value
    bill.inner_waybill_no = innerNo
    bill.ship_from = currentOrigin.value
    confirmedBills.value.push({ ...bill })
  })

  pendingBills.value = []
  innerWaybillNoOrder.value++

  const wagonName = currentWagonNo.value
  currentWagonNo.value = ''

  toast.success(`车辆 "${wagonName}" 配发完成！`)
  handleOrderChange(selectedOrderNo.value)
}

// 检查是否可以保存
const canSave = computed(() => {
  const hasBasicInfo = waybillNo.value
    && form.value.vesselName
    && form.value.billingName
    && form.value.shipFrom
    && form.value.shipTo
    && pendingBills.value.length === 0

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
    }
    else {
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
      ship_date: form.value.shipDate || undefined,
      bills: confirmedBills.value,
      total_weight: totalWeight.value,
      state,
      username: authStore.user?.userid,
      shipper: authStore.user?.userid,
    }

    const result = await buildShipInvoice(data)
    if (result.ok) {
      localStorage.setItem('currOperateItem', JSON.stringify({
        ship_name: form.value.billingName,
        ship_from: form.value.shipFrom,
        ship_to: form.value.shipTo,
      }))

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
    }
    else {
      toast.error(result.message || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '保存失败')
  }
  finally {
    loading.value = false
  }
}

// 复制上次操作
function copyLastOperation() {
  const lastOp = localStorage.getItem('currOperateItem')
  if (lastOp) {
    try {
      const op = JSON.parse(lastOp)
      if (op.ship_name)
        form.value.billingName = op.ship_name
      if (op.ship_from)
        form.value.shipFrom = op.ship_from
      if (op.ship_to)
        form.value.shipTo = op.ship_to
      toast.success('已复制上次操作')
      if (op.ship_name) {
        handleBillingNameChange(op.ship_name)
      }
    }
    catch {
      toast.error('复制失败')
    }
  }
  else {
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
  return originalBill?.block_num > 0
}

// 获取提单的最大可用量（用于输入框验证）
function getMaxAvailable(bill: InvoiceBill, index: number) {
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)
  const baseLeft = originalBill?.left_num || originalBill?.left || 0
  const isBlock = originalBill?.block_num > 0

  if (isBlock) {
    // 定尺：按块数计算
    const confirmedSendNum = confirmedBills.value
      .filter(cb => cb._id === bill._id)
      .reduce((sum, cb) => sum + cb.send_num, 0)

    const otherPendingSendNum = pendingBills.value
      .filter((pb, i) => pb._id === bill._id && i !== index)
      .reduce((sum, pb) => sum + pb.send_num, 0)

    return baseLeft - confirmedSendNum - otherPendingSendNum
  }
  else {
    // 非定尺：按重量计算
    const confirmedSendWeight = confirmedBills.value
      .filter(cb => cb._id === bill._id)
      .reduce((sum, cb) => sum + (cb.send_weight || 0), 0)

    const otherPendingSendWeight = pendingBills.value
      .filter((pb, i) => pb._id === bill._id && i !== index)
      .reduce((sum, pb) => sum + (pb.send_weight || 0), 0)

    return baseLeft - confirmedSendWeight - otherPendingSendWeight
  }
}

// 获取提单的动态剩余量（最大可用量 - 当前发运量）
function getBillLeftNum(bill: InvoiceBill, index: number) {
  const maxAvailable = getMaxAvailable(bill, index)
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)

  if (originalBill?.block_num > 0) {
    // 定尺：剩余量 = 最大可用量 - 当前发运数
    return maxAvailable - (bill.send_num || 0)
  }
  else {
    // 非定尺：剩余量 = 最大可用量 - 当前发运重量
    return Number((maxAvailable - (bill.send_weight || 0)).toFixed(3))
  }
}

// 按车号分组显示已确认的提单
const confirmedByWagon = computed(() => {
  const groups: Record<string, InvoiceBill[]> = {}
  confirmedBills.value.forEach((bill) => {
    const key = bill.wagon_no || '未知'
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(bill)
  })
  return groups
})

// 获取某车的配发统计
function getWagonStats(bills: InvoiceBill[]) {
  const totalNum = bills.reduce((sum, b) => sum + (b.send_num || 0), 0)
  const totalWeight = bills.reduce((sum, b) => sum + (b.send_weight || 0), 0)
  return { totalNum, totalWeight }
}

// 删除某车的所有配发
function deleteWagonBills(wagonNo: string) {
  if (!window.confirm(`确定删除车号 "${wagonNo}" 的所有配发记录吗？`)) {
    return
  }
  confirmedBills.value = confirmedBills.value.filter(b => b.wagon_no !== wagonNo)
  handleOrderChange(selectedOrderNo.value)
  toast.success(`已删除车号 "${wagonNo}" 的配发记录`)
}

// 删除某条已确认的配发记录
function deleteConfirmedBill(wagonNo: string, billNo: string) {
  const index = confirmedBills.value.findIndex(b => b.wagon_no === wagonNo && b.bill_no === billNo)
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
    }

    // 只有在勾选时才传递myOnly参数
    if (showMyOnly.value) {
      params.myOnly = true
    }

    const result = await getInvoiceList(params)
    if (result.ok) {
      invoiceList.value = result.data
      invoiceListTotal.value = result.total
    }
    else {
      toast.error('加载运单列表失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载运单列表失败')
  }
  finally {
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
    if (!confirmed)
      return
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
      form.value.shipDate = inv.ship_date || ''

      isExistingInvoice.value = true

      // 加载开单名称的可用提单
      await handleBillingNameChange(inv.ship_name)

      // 处理已配发的提单
      confirmedBills.value = []
      for (const invBill of inv.bills) {
        const billInfo = invBill.bill_id
        if (!billInfo)
          continue

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
            len: billInfo.length,
            weight: billInfo.weight,
            block_num: billInfo.block_num,
            total_weight: billInfo.total_weight,
            left_num: billInfo.left_num,
            send_num: vehicle.send_num || 0,
            send_weight: vehicle.send_weight || 0,
            wagon_no: vehicle.veh_name || '',
            inner_waybill_no: vehicle.inner_waybill_no || '',
            ship_from: vehicle.veh_ship_from || inv.ship_from,
          })
        }
      }

      // 保存原始数据用于检测改动
      originalConfirmedBills.value = JSON.parse(JSON.stringify(confirmedBills.value))

      showInvoiceListDialog.value = false
      toast.success('运单加载成功')
    }
    else {
      toast.error(result.message || '加载运单失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载运单失败')
  }
  finally {
    loading.value = false
  }
}

// 格式化日期
function formatDate(date: any) {
  if (!date)
    return '-'
  return new Date(date).toLocaleDateString('zh-CN')
}

// 格式化重量（最多3位小数）
function formatWeight(weight: number) {
  if (weight == null)
    return '-'
  return Number(weight).toFixed(3)
}
</script>

<template>
  <BasicPage title="配发货-船运" description="使用船舶进行货物配发，需要为每批货物指定装卸车辆">
    <div class="space-y-4">
      <!-- 操作按钮和状态 -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <UiButton :disabled="loading" @click="createNewInvoice">
            <Plus class="w-4 h-4 mr-1" />
            新建运单
          </UiButton>
          <UiButton variant="outline" :disabled="loading" @click="openInvoiceList">
            <FolderOpen class="w-4 h-4 mr-1" />
            修改运单
          </UiButton>
          <UiButton variant="outline" :disabled="!waybillNo" @click="copyLastOperation">
            <Copy class="w-4 h-4 mr-1" />
            复制上次操作
          </UiButton>
        </div>

        <!-- 状态提示 -->
        <div v-if="waybillNo" class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-md" :class="isExistingInvoice ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'">
            <span class="text-sm font-medium">{{ isExistingInvoice ? '修改运单' : '新建运单' }}</span>
            <span class="text-xs bg-white dark:bg-gray-800 px-2 py-0.5 rounded">{{ waybillNo }}</span>
          </div>
          <div v-if="hasUnsavedChanges" class="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
            <span class="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            <span>未保存</span>
          </div>
        </div>
      </div>

      <!-- 紧凑式输入块 -->
      <div v-if="waybillNo" class="p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <!-- 船号 -->
          <SearchableCombobox
            v-model="form.vesselName"
            :search-fn="searchShips"
            placeholder="船号"
          />

          <!-- 始发地 -->
          <SearchableCombobox
            v-model="form.shipFrom"
            :search-fn="searchWarehouses"
            placeholder="始发地"
          />

          <!-- 目的地 -->
          <SearchableCombobox
            v-model="form.shipTo"
            :search-fn="searchDestinations"
            placeholder="目的地"
          />

          <!-- 开单名称 -->
          <SearchableCombobox
            :model-value="form.billingName"
            :search-fn="searchCompanies"
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
          <DatePicker v-model="form.shipDate" placeholder="发货日期" />
        </div>

        <!-- 车辆配发区域 -->
        <div v-if="form.billingName" class="mt-3 pt-3 border-t">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <!-- 车号 -->
            <SearchableCombobox
              v-model="currentWagonNo"
              :search-fn="searchTrucks"
              placeholder="车号(装卸车辆)"
            />

            <!-- 始发地 -->
            <SearchableCombobox
              v-model="currentOrigin"
              :search-fn="searchWarehouses"
              placeholder="车辆始发地"
            />
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
        </div>
      </div>

      <!-- 当前车辆待确认提单 -->
      <div v-if="pendingBills.length > 0">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium">
            当前车辆待确认 ({{ currentWagonNo || '未选择车号' }})
          </h4>
          <div class="text-sm text-muted-foreground">
            <span>块数: {{ wagonTotalNumber }}</span>
            <span class="ml-4">重量: {{ wagonTotalWeight.toFixed(3) }}</span>
          </div>
        </div>
        <div class="border rounded">
          <UiTable>
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
              <UiTableRow v-for="(bill, index) in pendingBills" :key="`${bill.bill_no}-${index}`">
                <UiTableCell>
                  <UiButton variant="ghost" size="icon" class="h-6 w-6 text-destructive" @click="removePendingBill(index)">
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
        <div class="mt-2 flex justify-end">
          <UiButton :disabled="!currentWagonNo || wagonTotalNumber === 0" @click="confirmWagon">
            <Check class="w-4 h-4 mr-1" />
            确认此车配发
          </UiButton>
        </div>
      </div>

      <!-- 已确认的提单 -->
      <div v-if="confirmedBills.length > 0">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium">
            已确认配发
          </h4>
          <div class="text-sm text-muted-foreground">
            <span>总块数: <strong>{{ totalNumber }}</strong></span>
            <span class="ml-4">总重量: <strong>{{ totalWeight.toFixed(3) }}</strong> 吨</span>
          </div>
        </div>

        <div v-for="(bills, wagonNo) in confirmedByWagon" :key="wagonNo" class="mb-3">
          <div class="flex items-center justify-between text-xs text-muted-foreground mb-1 bg-muted px-2 py-1 rounded">
            <div class="flex items-center gap-4">
              <span>车号: <strong class="text-foreground">{{ wagonNo }}</strong></span>
              <span>块数: <strong>{{ getWagonStats(bills).totalNum }}</strong></span>
              <span>重量: <strong>{{ getWagonStats(bills).totalWeight.toFixed(3) }}</strong></span>
              <span>起始地: <strong class="text-foreground">{{ bills[0]?.ship_from || '-' }}</strong></span>
            </div>
            <UiButton variant="ghost" size="sm" class="h-6 px-2 text-destructive hover:text-destructive" @click="deleteWagonBills(wagonNo as string)">
              <Trash2 class="w-3 h-3 mr-1" />
              删除此车
            </UiButton>
          </div>
          <div class="border rounded">
            <UiTable>
              <UiTableHeader>
                <UiTableRow>
                  <UiTableHead class="w-10" />
                  <UiTableHead>提单号</UiTableHead>
                  <UiTableHead>订单号</UiTableHead>
                  <UiTableHead>厚度</UiTableHead>
                  <UiTableHead>宽度</UiTableHead>
                  <UiTableHead>长度</UiTableHead>
                  <UiTableHead>单重</UiTableHead>
                  <UiTableHead>发运数</UiTableHead>
                  <UiTableHead>发运重量</UiTableHead>
                </UiTableRow>
              </UiTableHeader>
              <UiTableBody>
                <UiTableRow v-for="bill in bills" :key="`${bill.bill_no}-${bill.inner_waybill_no}`">
                  <UiTableCell>
                    <UiButton variant="ghost" size="icon" class="h-6 w-6 text-destructive" @click="deleteConfirmedBill(wagonNo as string, bill.bill_no)">
                      <Trash2 class="w-4 h-4" />
                    </UiButton>
                  </UiTableCell>
                  <UiTableCell>{{ bill.bill_no }}</UiTableCell>
                  <UiTableCell>{{ getOrderDisplay(bill) }}</UiTableCell>
                  <UiTableCell>{{ bill.thickness }}</UiTableCell>
                  <UiTableCell>{{ bill.width }}</UiTableCell>
                  <UiTableCell>{{ bill.len }}</UiTableCell>
                  <UiTableCell>{{ bill.weight?.toFixed(4) }}</UiTableCell>
                  <UiTableCell>{{ bill.send_num }}</UiTableCell>
                  <UiTableCell>{{ bill.send_weight?.toFixed(3) }}</UiTableCell>
                </UiTableRow>
              </UiTableBody>
            </UiTable>
          </div>
        </div>

        <!-- 保存按钮 -->
        <div class="flex justify-end gap-2">
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

      <!-- 空状态 -->
      <div v-if="!waybillNo" class="border rounded-lg p-12 text-center text-muted-foreground">
        <p>请点击"新建运单"开始创建船运配发货单</p>
        <p class="text-xs mt-2">
          船运需要为每批货物指定装卸的车辆
        </p>
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
              >
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
                    <UiTableHead>配发日期</UiTableHead>
                    <UiTableHead>总重量(吨)</UiTableHead>
                    <UiTableHead>状态</UiTableHead>
                    <UiTableHead class="w-20">
                      操作
                    </UiTableHead>
                  </UiTableRow>
                </UiTableHeader>
                <UiTableBody>
                  <UiTableRow
                    v-for="invoice in invoiceList"
                    :key="invoice._id"
                    class="group cursor-pointer hover:bg-muted/50"
                  >
                    <UiTableCell>{{ invoice.waybill_no }}</UiTableCell>
                    <UiTableCell>{{ invoice.vehicle_vessel_name }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_name }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_from }}</UiTableCell>
                    <UiTableCell>{{ invoice.ship_to }}</UiTableCell>
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
            <div v-if="invoiceListLoading" class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div class="text-muted-foreground">
                加载中...
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="!invoiceListLoading && invoiceList.length === 0" class="absolute inset-0 flex items-center justify-center">
              <div class="text-muted-foreground">
                没有找到运单
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="invoiceListTotal > 0" class="flex items-center justify-between text-sm border-t pt-3">
            <div class="text-muted-foreground">
              共 {{ invoiceListTotal }} 条记录，第 {{ invoiceListPage }} / {{ Math.ceil(invoiceListTotal / invoiceListLimit) }} 页
            </div>
            <div class="flex items-center gap-2">
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage <= 1 || invoiceListLoading"
                @click="invoiceListPage--; loadInvoiceList()"
              >
                上一页
              </UiButton>
              <span class="text-muted-foreground">
                {{ invoiceListPage }}
              </span>
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage * invoiceListLimit >= invoiceListTotal || invoiceListLoading"
                @click="invoiceListPage++; loadInvoiceList()"
              >
                下一页
              </UiButton>
            </div>
          </div>
        </div>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>
