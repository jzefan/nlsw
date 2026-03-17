<script setup lang="ts">
import { ChevronDown, ChevronUp, Copy, FolderOpen, Plus, Save, Search, Send, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { InvoiceBill } from '@/services/api/invoice.api'
import { formatDate, formatNumber } from '@/utils/format'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import {
  buildTruckInvoice,
  getBillsByBillingName,
  getInvoiceDetail,
  getInvoiceList,
  getMaxWaybillNo,
  getOrderBills,
  searchBillingNames,
  searchDestinations,
  searchVehicles,
  searchWarehouses,
} from '@/services/api/invoice.api'
import { getPlanByOrderNo, searchCompanies } from '@/services/api/plan.api'
import { getUserNames } from '@/services/api/user.api'
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
const isExistingInvoice = ref(false) // 标记是否为已保存的运单
const originalSelectedBills = ref<any[]>([]) // 保存原始的选择提单，用于检测是否有改动

// 打开运单对话框相关
const showInvoiceListDialog = ref(false)
const invoiceListLoading = ref(false)
const invoiceList = ref<any[]>([])
const invoiceListTotal = ref(0)
const invoiceSearchFilters = ref({
  vehicleName: '',
  shipName: '',
  waybillNo: '',
  startDate: '',
  endDate: '',
  shipTo: '',
  shipperName: '',
})
const invoiceListPage = ref(1)
const invoiceListLimit = ref(20)
const showMyOnly = ref(false) // 是否只显示我的运单

// 判断是否是管理员
const isAdmin = computed(() => isAdminPrivilege(authStore.user?.privilege ?? []))

// 检查是否有未保存的改动
const hasUnsavedChanges = computed(() => {
  // 如果没有运单号，没有改动
  if (!waybillNo.value) return false

  // 对于新建运单，如果有选择的提单且有发运数或发运重量，说明有改动
  if (!isExistingInvoice.value) {
    return selectedBills.value.some((b) => b.send_num > 0 || b.send_weight > 0)
  }

  // 对于已存在的运单，比较选择的提单是否有变化
  if (isExistingInvoice.value && originalSelectedBills.value.length > 0) {
    // 简单比较：数量或内容是否变化
    if (selectedBills.value.length !== originalSelectedBills.value.length) {
      return true
    }
    // 检查是否有任何提单的发运数或发运重量有变化
    return JSON.stringify(selectedBills.value) !== JSON.stringify(originalSelectedBills.value)
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
  vehicleName: '',
  shipName: '',
  shipCustomer: '',
  shipFrom: '南钢',
  shipTo: '',
  shipDate: '',
})

// 可用订单号列表 (根据开单名称获取)
const availableOrderNos = ref<string[]>([])

// 已加载的提单缓存 (按订单号索引, 选中订单时从API加载)
const billsCache = ref<Map<string, any[]>>(new Map())

// 当前选择的订单号
const selectedOrderNo = ref('')
// 当前订单的可用提单
const currentOrderBills = ref<any[]>([])

// 当前订单的计划信息
const orderPlanInfo = ref<{ order_weight: number; left_weight: number } | null>(null)

// 已选提单列表
const selectedBills = ref<InvoiceBill[]>([])

// 当前公司的客户列表
const shipCustomers = ref<string[]>([])

// 移动端展开的卡片
const expandedCards = ref<Set<number>>(new Set())

// 被修改的提单ID集合（用于高亮显示）
const highlightedBillIds = ref<Set<string>>(new Set())

// 最近一次添加的提单ID集合（用于浅色背景区分）
const lastAddedBillIds = ref<Set<string>>(new Set())

function toggleCardExpand(index: number) {
  if (expandedCards.value.has(index)) {
    expandedCards.value.delete(index)
  } else {
    expandedCards.value.add(index)
  }
}

// 总重量和总块数
const totalWeight = computed(() => {
  return selectedBills.value.reduce((sum, b) => sum + (b.send_weight || 0), 0)
})
const totalNumber = computed(() => {
  return selectedBills.value.reduce((sum, b) => sum + (b.send_num || 0), 0)
})

// 搜索所有车辆（不限类别，用于筛选对话框）
async function searchAllVehicles(search: string, limit: number, page: number) {
  return searchVehicles(search, '车', limit, page)
}

// 用户名列表（发货人筛选用）
const cachedUserNames = ref<string[]>([])

async function loadUserNamesIfNeeded() {
  if (cachedUserNames.value.length > 0) return
  try {
    const result = await getUserNames()
    if (result.ok) cachedUserNames.value = result.data
  } catch {
    /* ignore */
  }
}

async function searchShipperNames(search: string, limit: number, page: number) {
  await loadUserNamesIfNeeded()
  let filtered = cachedUserNames.value
  if (search) {
    filtered = filtered.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
  }
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit).map((n) => ({ name: n }))
  return { ok: true, data, total: filtered.length }
}

// 搜索车辆 (仅车)
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
      isExistingInvoice.value = false // 新建运单
      originalSelectedBills.value = []
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
    vehicleName: '',
    shipName: '',
    shipCustomer: '',
    shipFrom: '南钢',
    shipTo: '',
    shipDate: '',
  }
  availableOrderNos.value = []
  billsCache.value = new Map()
  selectedOrderNo.value = ''
  currentOrderBills.value = []
  selectedBills.value = []
  shipCustomers.value = []
  orderPlanInfo.value = null
}

// 根据提单号查找提单信息（从缓存中查找）
function findBillByNo(billNo: string) {
  for (const [orderNo, bills] of billsCache.value) {
    const bill = bills.find((b: any) => b.bill_no === billNo)
    if (bill) {
      return { ...bill, order_no: orderNo }
    }
  }
  return null
}

// 根据提单_id查找提单信息（从缓存中查找）
function findBillById(billId: string) {
  for (const [orderNo, bills] of billsCache.value) {
    const bill = bills.find((b: any) => b._id === billId)
    if (bill) {
      return { ...bill, order_no: orderNo }
    }
  }
  return null
}

// 确认对话框
function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.confirm(message)) {
      resolve(true)
    } else {
      resolve(false)
    }
  })
}

// 开单名称改变时重置订单数据
async function handleShipNameChange(name: string) {
  form.value.shipName = name
  if (!name) {
    availableOrderNos.value = []
    billsCache.value = new Map()
    selectedOrderNo.value = ''
    currentOrderBills.value = []
    shipCustomers.value = []
    form.value.shipCustomer = ''
    return
  }

  if (selectedBills.value.length > 0) {
    const confirmed = await confirmDialog('开单名称的改变将导致所有已选择的提单数据丢失,确认吗?')
    if (!confirmed) {
      return
    }
    selectedBills.value = []
  }

  // 清空已加载的订单数据，订单会在下拉框打开时按需加载
  availableOrderNos.value = []
  billsCache.value = new Map()
  selectedOrderNo.value = ''
  currentOrderBills.value = []

  // 获取该公司的客户列表
  try {
    const result = await searchCompanies(name, 20, 1)
    if (result.ok && result.data && result.data.length > 0) {
      // 优先精确匹配，其次模糊匹配（Company名称可能带编号前缀）
      const company =
        result.data.find((c: any) => c.name === name) ||
        result.data.find((c: any) => c.name.includes(name) || name.includes(c.name))
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
  if (!form.value.shipName) {
    return { ok: true, data: [], total: 0 }
  }

  try {
    const result = await getBillsByBillingName(form.value.shipName, search, page, limit)
    if (result.ok && result.data) {
      // 缓存订单号
      for (const order of result.data) {
        if (order.order_no && !availableOrderNos.value.includes(order.order_no)) {
          availableOrderNos.value.push(order.order_no)
        }
      }

      // 合并本地已有但API未返回的订单（如 left_num=0 的提单所属订单）
      const apiOrderNos = new Set(result.data.map((order: any) => order.order_no))
      const localOnlyOrders = availableOrderNos.value
        .filter((orderNo) => {
          if (apiOrderNos.has(orderNo)) return false
          if (!search) return true
          return orderNo.toLowerCase().includes(search.toLowerCase())
        })
        .map((orderNo) => ({ name: orderNo }))

      const data = [
        ...result.data.filter((order: any) => order.order_no).map((order: any) => ({ name: order.order_no })),
        ...localOnlyOrders,
      ].sort((a, b) => {
        if (search) {
          const s = search.toLowerCase()
          const aMatch = a.name.toLowerCase().includes(s)
          const bMatch = b.name.toLowerCase().includes(s)
          if (aMatch !== bMatch) return aMatch ? -1 : 1
        }
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
  let filtered = currentOrderBills.value.filter((b: any) => b.bill_no)
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
  const uniqueBills = Array.from(billNoMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const start = (page - 1) * limit
  const data = uniqueBills.slice(start, start + limit).map(([billNo, { count, first }]) => ({
    value: billNo,
    name: count > 1 ? `${billNo} (${count}个项次)` : billNo,
    left_num: first.left_num,
    _raw: first,
  }))
  return { ok: true, data, total: uniqueBills.length }
}

// 订单号改变时从API加载提单
async function handleOrderChange(orderNo: string) {
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

  // 从缓存或API获取该订单的提单
  let bills = billsCache.value.get(orderNo)
  if (!bills) {
    try {
      const result = await getOrderBills(form.value.shipName, orderNo)
      if (result.ok && result.data) {
        bills = result.data
        billsCache.value.set(orderNo, bills)
      } else {
        bills = []
      }
    } catch (error) {
      console.error('获取订单提单失败', error)
      bills = []
    }
  }

  // 排除已选的（按 _id 匹配）
  currentOrderBills.value = bills.filter((b: any) => {
    return !selectedBills.value.some((sb) => sb._id === b._id)
  })
}

// 选择提单后批量添加同 bill_no 的所有项次
function handleBillSelect(billNo: string) {
  if (!billNo) return
  lastAddedBillIds.value = new Set()
  const matchingBills = currentOrderBills.value.filter((b: any) => b.bill_no === billNo)
  for (const bill of matchingBills) {
    addBillToList(bill)
  }
}

// 添加提单到列表
function addBillToList(bill: any) {
  if (selectedBills.value.some((b) => b._id === bill._id)) {
    toast.warning('该提单已添加')
    return
  }

  // 发运数默认为0，用户手动输入
  // 注意：bill 来自订单分组数据，不包含 order_no，使用当前选中的订单号
  selectedBills.value.unshift({
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
  })

  lastAddedBillIds.value.add(bill._id)
  // 刷新可选提单列表（不清空，只更新）
  handleOrderChange(selectedOrderNo.value)
}

// 删除选中的提单
function removeBill(index: number) {
  const removed = selectedBills.value.splice(index, 1)[0]
  if (removed && removed._id) {
    const bill = findBillById(removed._id)
    if (bill && bill.order_no === selectedOrderNo.value) {
      currentOrderBills.value.push(bill)
    }
  }
}

// 更新发运数量
function updateSendNum(index: number, value: number) {
  const bill = selectedBills.value[index]
  const leftNum = getOriginalLeftNum(bill)
  const isBlock = isBlockBill(bill)

  // 定尺时：发运数受剩余量限制
  // 非定尺时：发运数不受限制，只有发运重量受限制
  let clamped = value
  if (isBlock && clamped > leftNum) {
    clamped = leftNum
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

// 更新发运重量 (乱尺用) - 如果输入值大于剩余量，自动设为剩余量
function updateSendWeight(index: number, value: number) {
  const bill = selectedBills.value[index]
  const leftNum = getOriginalLeftNum(bill)

  let clamped = value
  if (clamped > leftNum) {
    clamped = leftNum
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

// 检查是否可以保存
const canSave = computed(() => {
  const hasBasicInfo =
    waybillNo.value && form.value.vehicleName && form.value.shipName && form.value.shipFrom && form.value.shipTo

  // 如果是已存在的运单，允许保存空明细（删除运单）
  if (isExistingInvoice.value) {
    return hasBasicInfo
  }

  // 新建运单必须有明细
  return (
    hasBasicInfo &&
    selectedBills.value.length > 0 &&
    selectedBills.value.some((b) => b.send_num > 0 || b.send_weight > 0)
  )
})

// 保存运单
async function saveInvoice(state: string) {
  if (!canSave.value) {
    toast.warning('请完善运单信息')
    return
  }

  const invalidBills = selectedBills.value.filter((b) => {
    return (b.send_num > 0 && b.send_weight === 0) || (b.send_num === 0 && b.send_weight > 0)
  })
  if (invalidBills.length > 0) {
    toast.warning('请输入发运块数和发运重量,两者缺一不可')
    return
  }

  loading.value = true
  try {
    const data = {
      waybill_no: waybillNo.value,
      vehicle_vessel_name: form.value.vehicleName,
      ship_name: form.value.shipName,
      ship_customer: form.value.shipCustomer,
      ship_from: form.value.shipFrom,
      ship_to: form.value.shipTo,
      ship_date: form.value.shipDate
        ? (() => {
            const now = new Date()
            return `${form.value.shipDate} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
          })()
        : undefined,
      bills: selectedBills.value
        .filter((b) => b.send_num > 0 || b.send_weight > 0)
        .map((b) => ({ ...b, original_left_num: getOriginalLeftNum(b) })),
      total_weight: totalWeight.value,
      state,
      username: authStore.user?.userid,
      shipper: authStore.user?.userid,
      selfOwned: isSelfOwnedMode.value,
    }

    const result = await buildTruckInvoice(data)
    if (result.ok) {
      localStorage.setItem(
        'currOperateItem',
        JSON.stringify({
          ship_name: form.value.shipName,
          ship_from: form.value.shipFrom,
          ship_to: form.value.shipTo,
        }),
      )

      isExistingInvoice.value = true // 标记为已保存的运单
      // 更新原始数据，使得保存后不再显示"未保存"
      originalSelectedBills.value = JSON.parse(JSON.stringify(selectedBills.value))

      toast.success(state === '已配发' ? '配发成功' : '保存成功')
      if (state === '已配发') {
        resetForm()
        waybillNo.value = ''
        isExistingInvoice.value = false
        originalSelectedBills.value = []
      }
    } else if (result.code === 'BILL_MODIFIED') {
      // 自动刷新并高亮显示被修改的提单
      const modifiedBillIds = (result.modifiedBills || []).map((b: any) => b._id)

      toast.warning(result.message || '提单数据已被修改，已自动刷新', { duration: 4000 })

      // 重新加载可用提单数据
      if (form.value.shipName) {
        // 清空提单缓存，强制重新加载
        billsCache.value = new Map()

        // 重新加载当前选中的订单的提单
        if (selectedOrderNo.value) {
          try {
            const freshResult = await getOrderBills(form.value.shipName, selectedOrderNo.value)
            if (freshResult.ok && freshResult.data) {
              billsCache.value.set(selectedOrderNo.value, freshResult.data)

              // 更新已选提单的数据（刷新 left_num等字段）
              for (const selectedBill of selectedBills.value) {
                const freshBill = findBillById(selectedBill._id!)
                if (freshBill) {
                  Object.assign(selectedBill, {
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
      if (op.ship_name) form.value.shipName = op.ship_name
      if (op.ship_from) form.value.shipFrom = op.ship_from
      if (op.ship_to) form.value.shipTo = op.ship_to
      toast.success('已复制上次操作')
      if (op.ship_name) {
        handleShipNameChange(op.ship_name)
      }
    } catch {
      toast.error('复制失败')
    }
  } else {
    toast.info('没有上次操作记录')
  }
}

// 打开运单列表对话框
async function openInvoiceList() {
  showInvoiceListDialog.value = true
  invoiceListPage.value = 1
  const today = new Date()
  const oneMonthAgo = new Date(today)
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  invoiceSearchFilters.value = {
    vehicleName: '',
    shipName: '',
    waybillNo: '',
    startDate: fmt(oneMonthAgo),
    endDate: fmt(today),
    shipTo: '',
    shipperName: '',
  }
  await loadInvoiceList()
}

// 加载运单列表
async function loadInvoiceList() {
  invoiceListLoading.value = true
  try {
    const params: any = {
      page: invoiceListPage.value,
      limit: invoiceListLimit.value,
      transportType: '车',
    }
    const f = invoiceSearchFilters.value
    if (f.vehicleName) params.vehicleName = f.vehicleName
    if (f.shipName) params.shipName = f.shipName
    if (f.waybillNo) params.waybillNo = f.waybillNo
    if (f.startDate) params.startDate = f.startDate
    if (f.endDate) params.endDate = f.endDate
    if (f.shipTo) params.shipTo = f.shipTo
    if (f.shipperName) params.shipperName = f.shipperName

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
      form.value.vehicleName = inv.vehicle_vessel_name
      form.value.shipName = inv.ship_name
      form.value.shipCustomer = inv.ship_customer || ''
      form.value.shipFrom = inv.ship_from
      form.value.shipTo = inv.ship_to
      form.value.shipDate = inv.ship_date ? inv.ship_date.substring(0, 10) : ''

      isExistingInvoice.value = true

      // 加载开单名称的可用提单
      await handleShipNameChange(inv.ship_name)

      // 处理已配发的提单
      selectedBills.value = []
      for (const invBill of inv.bills) {
        const billInfo = invBill.bill_id
        if (!billInfo) continue

        const sendNum = invBill.num || 0
        const sendWeight = invBill.weight || 0
        const currentLeft = billInfo.left_num || 0
        // 还原此运单扣减前的原始剩余量
        const originalLeft =
          billInfo.block_num > 0 ? currentLeft + sendNum : Number((currentLeft + sendWeight).toFixed(3))

        const bill = {
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
          ship_warehouse: billInfo.ship_warehouse || '',
          contract_no: billInfo.contract_no || '',
          send_num: sendNum,
          send_weight: sendWeight,
          _originalLeft: originalLeft,
        }
        selectedBills.value.push(bill)
      }

      // 只注入订单号，不注入提单到缓存（避免缓存导致新增提单不显示）
      for (const bill of selectedBills.value) {
        const orderNo = bill.order_no
        if (!orderNo) continue
        if (!availableOrderNos.value.includes(orderNo)) {
          availableOrderNos.value.push(orderNo)
        }
      }

      // 保存原始数据用于检测改动
      originalSelectedBills.value = JSON.parse(JSON.stringify(selectedBills.value))

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

// 格式化重量（使用通用 formatNumber，3位小数）
function formatWeight(num: number | string | null | undefined) {
  return formatNumber(num) || '-'
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
  // 已加载运单的提单可能不在 billsCache 中，使用自身属性
  return (bill as any).block_num > 0
}

// 获取提单的原始剩余量（用于输入框max验证）
function getOriginalLeftNum(bill: InvoiceBill) {
  // 已加载运单的提单：使用预计算的还原剩余量
  if ((bill as any)._originalLeft != null) {
    return (bill as any)._originalLeft
  }
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)
  return originalBill?.left_num || originalBill?.left || 0
}

// 获取提单的动态剩余量（原始剩余量 - 发运量，显示用）
function getBillLeftNum(bill: InvoiceBill) {
  const originalLeft = getOriginalLeftNum(bill)
  // 对于定尺，剩余量 = 原始剩余量 - 发运数
  // 对于乱尺，剩余量 = 原始剩余量 - 发运重量
  if (isBlockBill(bill)) {
    return originalLeft - (bill.send_num || 0)
  }
  return Number((originalLeft - (bill.send_weight || 0)).toFixed(3))
}

// 检查提单是否被标记为已修改（需要高亮）
function isBillHighlighted(bill: InvoiceBill) {
  return bill._id ? highlightedBillIds.value.has(bill._id) : false
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '配发货-车运(自有车)' : '配发货-车运'"
    :description="isSelfOwnedMode ? '使用自有车辆进行货物配发' : '使用车辆进行货物配发'"
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
          <div v-if="hasUnsavedChanges" class="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
            <span class="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            未保存
          </div>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- 紧凑式输入块 -->
      <div v-if="waybillNo" class="p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <!-- 车号 -->
          <SearchableCombobox v-model="form.vehicleName" :search-fn="searchTrucks" placeholder="车号" />

          <!-- 始发地 -->
          <SearchableCombobox v-model="form.shipFrom" :search-fn="searchWarehouses" placeholder="始发地" />

          <!-- 目的地 -->
          <SearchableCombobox v-model="form.shipTo" :search-fn="searchDestinations" placeholder="目的地" />

          <!-- 开单名称 -->
          <SearchableCombobox
            :model-value="form.shipName"
            :search-fn="searchBillingNames"
            placeholder="开单名称"
            @update:model-value="handleShipNameChange($event as string)"
          />

          <!-- 发货单位 -->
          <SearchableCombobox
            v-model="form.shipCustomer"
            :search-fn="searchShipCustomers"
            placeholder="发货单位"
            :disabled="!form.shipName || shipCustomers.length === 0"
          />

          <!-- 发货日期 -->
          <DatePicker
            v-model="form.shipDate"
            placeholder="发货日期"
            :disabled-date="(d: Date) => d > new Date()"
            disabled-hint="不能选择未来日期"
          />
        </div>

        <!-- 订单号和提单号单独一行 -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          <!-- 订单号 -->
          <SearchableCombobox
            v-model="selectedOrderNo"
            :search-fn="searchOrders"
            placeholder="订单号"
            :disabled="!form.shipName"
            @update:model-value="handleOrderChange($event as string)"
          />

          <!-- 提单号 -->
          <SearchableCombobox
            model-value=""
            :search-fn="searchBills"
            placeholder="提单号"
            :disabled="!selectedOrderNo"
            @update:model-value="handleBillSelect($event as string)"
          />
        </div>

        <!-- 订单计划提示 -->
        <div v-if="orderPlanInfo" class="mt-1 px-1 text-xs text-muted-foreground">
          订单计划: 订单量 {{ formatWeight(orderPlanInfo.order_weight) }} 吨 | 已发
          {{ formatWeight(orderPlanInfo.order_weight - orderPlanInfo.left_weight) }} 吨 | 剩余
          {{ formatWeight(orderPlanInfo.left_weight) }} 吨
        </div>
      </div>

      <!-- 已选提单 - 桌面端表格 -->
      <div v-if="selectedBills.length > 0" class="hidden lg:block border rounded overflow-x-auto">
        <UiTable class="min-w-[800px]">
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead class="w-10 min-w-[40px]" />
              <UiTableHead class="min-w-[100px]">提单号</UiTableHead>
              <UiTableHead class="min-w-[120px]">订单号</UiTableHead>
              <UiTableHead class="min-w-[80px]">仓库</UiTableHead>
              <UiTableHead class="min-w-[60px]">厚度</UiTableHead>
              <UiTableHead class="min-w-[60px]">宽度</UiTableHead>
              <UiTableHead class="min-w-[60px]">长度</UiTableHead>
              <UiTableHead class="min-w-[80px]">单重</UiTableHead>
              <UiTableHead class="min-w-[80px]">剩余量</UiTableHead>
              <UiTableHead class="min-w-[100px]">发运数</UiTableHead>
              <UiTableHead class="min-w-[120px]">发运重量</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow
              v-for="(bill, index) in selectedBills"
              :key="bill._id"
              class="hover:!bg-muted"
              :class="{
                'bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
                'bg-orange-50 dark:bg-orange-950/40': lastAddedBillIds.has(bill._id!) && !isBillHighlighted(bill),
              }"
            >
              <UiTableCell>
                <UiButton variant="ghost" size="icon" class="h-6 w-6 text-destructive" @click="removeBill(index)">
                  <Trash2 class="w-4 h-4" />
                </UiButton>
              </UiTableCell>
              <UiTableCell>{{ bill.bill_no }}</UiTableCell>
              <UiTableCell>{{ getOrderDisplay(bill) }}</UiTableCell>
              <UiTableCell>{{ bill.ship_warehouse }}</UiTableCell>
              <UiTableCell>{{ bill.thickness }}</UiTableCell>
              <UiTableCell>{{ bill.width }}</UiTableCell>
              <UiTableCell>{{ bill.len }}</UiTableCell>
              <UiTableCell>{{ formatWeight(bill.weight) }}</UiTableCell>
              <UiTableCell>{{ getBillLeftNum(bill) }}</UiTableCell>
              <UiTableCell>
                <UiInput
                  :model-value="bill.send_num"
                  type="number"
                  class="w-20 h-8"
                  min="0"
                  :max="isBlockBill(bill) ? getOriginalLeftNum(bill) : undefined"
                  step="any"
                  @update:model-value="updateSendNum(index, Number($event))"
                />
              </UiTableCell>
              <UiTableCell>
                <template v-if="isBlockBill(bill)">
                  {{ formatWeight(bill.send_weight) }}
                </template>
                <UiInput
                  v-else
                  :model-value="bill.send_weight"
                  type="number"
                  class="w-24 h-8"
                  min="0"
                  :max="getOriginalLeftNum(bill)"
                  step="0.001"
                  @update:model-value="updateSendWeight(index, Number($event))"
                />
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </div>

      <!-- 已选提单 - 移动端卡片 -->
      <div v-if="selectedBills.length > 0" class="lg:hidden space-y-2">
        <div
          v-for="(bill, index) in selectedBills"
          :key="bill._id"
          class="border rounded-lg overflow-hidden bg-card"
          :class="{
            'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 animate-pulse': isBillHighlighted(bill),
            '!bg-primary/10': lastAddedBillIds.has(bill._id!) && !isBillHighlighted(bill),
          }"
        >
          <!-- 卡片头部 -->
          <div class="p-3 flex items-start gap-3">
            <UiButton
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-destructive shrink-0 mt-1"
              @click="removeBill(index)"
            >
              <Trash2 class="w-4 h-4" />
            </UiButton>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-medium text-sm truncate">{{ bill.bill_no }}</span>
                <button class="text-primary hover:text-primary/80 p-1 shrink-0" @click="toggleCardExpand(index)">
                  <ChevronDown v-if="!expandedCards.has(index)" class="w-4 h-4" />
                  <ChevronUp v-else class="w-4 h-4" />
                </button>
              </div>
              <div class="text-sm text-muted-foreground space-y-0.5">
                <div>订单: {{ getOrderDisplay(bill) }}</div>
                <div>仓库: {{ bill.ship_warehouse }}</div>
                <div class="flex items-center justify-between">
                  <span>剩余量: {{ getBillLeftNum(bill) }}</span>
                  <span :class="isBlockBill(bill) ? 'text-blue-600' : 'text-purple-600'">
                    {{ isBlockBill(bill) ? '定尺' : '乱尺' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 展开的详细信息 -->
          <div v-if="expandedCards.has(index)" class="border-t bg-muted/30 p-3 text-sm space-y-2">
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
                <span class="ml-1">{{ formatNumber(bill.weight, 3) }}</span>
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
                  :max="isBlockBill(bill) ? getOriginalLeftNum(bill) : undefined"
                  step="any"
                  @update:model-value="updateSendNum(index, Number($event))"
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground block mb-1">发运重量</label>
                <template v-if="isBlockBill(bill)">
                  <div class="p-2 bg-muted rounded text-center">{{ formatWeight(bill.send_weight) }}</div>
                </template>
                <UiInput
                  v-else
                  :model-value="bill.send_weight"
                  type="number"
                  class="w-full"
                  min="0"
                  :max="getOriginalLeftNum(bill)"
                  step="0.001"
                  @update:model-value="updateSendWeight(index, Number($event))"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!waybillNo" class="border rounded-lg p-12 text-center text-muted-foreground">
        <p>请点击"新建运单"开始创建配发货单</p>
      </div>

      <!-- 底部占位，防止内容被固定操作栏遮挡 -->
      <div v-if="selectedBills.length > 0" class="h-16" />
    </div>

    <!-- 固定在屏幕底部的操作栏 -->
    <div
      v-if="selectedBills.length > 0"
      class="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
    >
      <div
        class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 px-4 py-3 max-w-screen-2xl mx-auto"
      >
        <div class="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          <span
            >记录: <strong>{{ selectedBills.length }}</strong> 条</span
          >
          <span class="ml-3 sm:ml-6"
            >发运块数: <strong>{{ totalNumber }}</strong></span
          >
          <span class="ml-3 sm:ml-6"
            >发运总重量: <strong>{{ formatWeight(totalWeight) }}</strong> 吨</span
          >
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
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

    <!-- 运单列表对话框 -->
    <UiDialog v-model:open="showInvoiceListDialog">
      <UiDialogContent class="w-[95vw] md:min-w-[800px] md:max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
        <UiDialogHeader>
          <UiDialogTitle>修改运单</UiDialogTitle>
        </UiDialogHeader>

        <div class="flex-1 overflow-hidden flex flex-col space-y-4 min-h-[50vh]">
          <!-- 搜索筛选 -->
          <div class="space-y-2">
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              <SearchableCombobox
                v-model="invoiceSearchFilters.vehicleName"
                :search-fn="searchAllVehicles"
                placeholder="车船号"
              />
              <SearchableCombobox
                v-model="invoiceSearchFilters.shipName"
                :search-fn="searchBillingNames"
                placeholder="开单名称"
              />
              <UiInput v-model="invoiceSearchFilters.waybillNo" placeholder="运单号" @keyup.enter="searchInvoices" />
              <SearchableCombobox
                v-model="invoiceSearchFilters.shipTo"
                :search-fn="searchDestinations"
                placeholder="目的地"
              />
              <SearchableCombobox
                v-model="invoiceSearchFilters.shipperName"
                :search-fn="searchShipperNames"
                placeholder="发货人"
              />
              <DatePicker v-model="invoiceSearchFilters.startDate" placeholder="开始日期" />
              <DatePicker v-model="invoiceSearchFilters.endDate" placeholder="结束日期" />
              <div class="flex items-center gap-2">
                <UiButton :disabled="invoiceListLoading" @click="searchInvoices">
                  <Search class="w-4 h-4 mr-1" />
                  搜索
                </UiButton>
                <!-- 管理员：只看我的运单 -->
                <div v-if="isAdmin" class="flex items-center gap-2">
                  <input
                    id="my-only-truck"
                    v-model="showMyOnly"
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <label for="my-only-truck" class="text-xs cursor-pointer whitespace-nowrap">只看我的</label>
                </div>
              </div>
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
                    <UiTableHead>发货人</UiTableHead>
                    <UiTableHead>状态</UiTableHead>
                    <UiTableHead class="w-20"> 操作 </UiTableHead>
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
                    <UiTableCell>{{ invoice.shipper }}</UiTableCell>
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
              <span class="text-muted-foreground">
                {{ invoiceListPage }}
              </span>
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
  </BasicPage>
</template>
