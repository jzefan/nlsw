<script setup lang="ts">
import { Copy, Plus, Save, Send, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import {
  buildTruckInvoice,
  getBillsByBillingName,
  getMaxWaybillNo,
  searchDestinations,
  searchVehicles,
  searchWarehouses,
  type InvoiceBill,
} from '@/services/api/invoice.api'
import { searchCompanies } from '@/services/api/plan.api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// 状态
const loading = ref(false)
const waybillNo = ref('')

// 运单表单
const form = ref({
  vehicleName: '',
  shipName: '',
  shipCustomer: '',
  shipFrom: '南钢',
  shipTo: '',
  shipDate: '',
})

// 可用订单数据 (根据开单名称获取，按订单分组)
// 结构: [{order_no: string, bills: [{bill_no, order_item_no, ...}]}]
const availableOrdersData = ref<any[]>([])

// 当前选择的订单号
const selectedOrderNo = ref('')
// 当前订单的可用提单
const currentOrderBills = ref<any[]>([])

// 已选提单列表
const selectedBills = ref<InvoiceBill[]>([])

// 总重量和总块数
const totalWeight = computed(() => {
  return selectedBills.value.reduce((sum, b) => sum + (b.send_weight || 0), 0)
})
const totalNumber = computed(() => {
  return selectedBills.value.reduce((sum, b) => sum + (b.send_num || 0), 0)
})

// 搜索车辆 (仅车)
async function searchTrucks(search: string, limit: number, page: number) {
  return searchVehicles(search, '车', limit, page)
}

// 新建运单
async function createNewInvoice() {
  if (selectedBills.value.length > 0) {
    const confirmed = await confirmDialog('有数据未保存, 确定要重新创建一个运单?')
    if (!confirmed) return
  }

  loading.value = true
  try {
    const result = await getMaxWaybillNo()
    if (result.ok) {
      waybillNo.value = result.max_no
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
    vehicleName: '',
    shipName: '',
    shipCustomer: '',
    shipFrom: '南钢',
    shipTo: '',
    shipDate: '',
  }
  availableOrdersData.value = []
  selectedOrderNo.value = ''
  currentOrderBills.value = []
  selectedBills.value = []
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
async function handleShipNameChange(name: string) {
  form.value.shipName = name
  if (!name) {
    availableOrdersData.value = []
    selectedOrderNo.value = ''
    currentOrderBills.value = []
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
  availableOrdersData.value = []
  selectedOrderNo.value = ''
  currentOrderBills.value = []
}

// 从API搜索订单号（用于 SearchableCombobox，支持分页懒加载）
async function searchOrders(search: string, limit: number, page: number) {
  if (!form.value.shipName) {
    return { ok: true, data: [], total: 0 }
  }

  try {
    const result = await getBillsByBillingName(form.value.shipName, search, page, limit)
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

  // 获取该订单的提单，排除已选的
  currentOrderBills.value = (orderData.bills || []).filter((b: any) => {
    return !selectedBills.value.some(sb => sb.bill_no === b.bill_no)
  })
}

// 选择提单后添加到列表
function handleBillSelect(billNo: string) {
  if (!billNo) return
  const bill = currentOrderBills.value.find((b: any) => b.bill_no === billNo)
  if (bill) {
    addBillToList(bill)
  }
}

// 添加提单到列表
function addBillToList(bill: any) {
  if (selectedBills.value.some(b => b._id === bill._id)) {
    toast.warning('该提单已添加')
    return
  }

  // 发运数默认为0，用户手动输入
  // 注意：bill 来自订单分组数据，不包含 order_no，使用当前选中的订单号
  selectedBills.value.push({
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

  // 刷新可选提单列表（不清空，只更新）
  handleOrderChange(selectedOrderNo.value)
}

// 删除选中的提单
function removeBill(index: number) {
  const removed = selectedBills.value.splice(index, 1)[0]
  if (removed) {
    const bill = findBillByNo(removed.bill_no)
    if (bill && bill.order_no === selectedOrderNo.value) {
      currentOrderBills.value.push(bill)
    }
  }
}

// 更新发运数量
function updateSendNum(index: number, value: number) {
  const bill = selectedBills.value[index]
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)
  const leftNum = originalBill?.left_num || originalBill?.left || 0

  // 定尺时：发运数受剩余量限制
  // 非定尺时：发运数不受限制，只有发运重量受限制
  if (originalBill?.block_num > 0) {
    // 定尺：发运数范围 [0, 剩余量]
    if (value > leftNum) {
      value = leftNum
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

// 更新发运重量 (乱尺用) - 如果输入值大于剩余量，自动设为剩余量
function updateSendWeight(index: number, value: number) {
  const bill = selectedBills.value[index]
  const originalBill = bill._id ? findBillById(bill._id) : findBillByNo(bill.bill_no)
  const leftNum = originalBill?.left_num || originalBill?.left || 0

  // 发运重量范围 [0, 剩余量]，超过剩余量则设为剩余量
  if (value > leftNum) {
    value = leftNum
  }
  if (value < 0) {
    value = 0
  }

  bill.send_weight = value
}

// 检查是否可以保存
const canSave = computed(() => {
  return waybillNo.value
    && form.value.vehicleName
    && form.value.shipName
    && form.value.shipFrom
    && form.value.shipTo
    && selectedBills.value.length > 0
    && selectedBills.value.some(b => b.send_num > 0 || b.send_weight > 0)
})

// 保存运单
async function saveInvoice(state: string) {
  if (!canSave.value) {
    toast.warning('请完善运单信息')
    return
  }

  const invalidBills = selectedBills.value.filter(b => {
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
      ship_date: form.value.shipDate || undefined,
      bills: selectedBills.value.filter(b => b.send_num > 0 || b.send_weight > 0),
      total_weight: totalWeight.value,
      state,
      username: authStore.user?.userid,
      shipper: authStore.user?.userid,
    }

    const result = await buildTruckInvoice(data)
    if (result.ok) {
      localStorage.setItem('currOperateItem', JSON.stringify({
        ship_name: form.value.shipName,
        ship_from: form.value.shipFrom,
        ship_to: form.value.shipTo,
      }))
      toast.success(state === '已配发' ? '配发成功' : '保存成功')
      if (state === '已配发') {
        resetForm()
        waybillNo.value = ''
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
      if (op.ship_name) form.value.shipName = op.ship_name
      if (op.ship_from) form.value.shipFrom = op.ship_from
      if (op.ship_to) form.value.shipTo = op.ship_to
      toast.success('已复制上次操作')
      if (op.ship_name) {
        handleShipNameChange(op.ship_name)
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

// 获取提单的原始剩余量（用于输入框max验证）
function getOriginalLeftNum(bill: InvoiceBill) {
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
</script>

<template>
  <BasicPage title="配发货-车运" description="使用车辆进行货物配发">
    <div class="space-y-4">
      <!-- 操作按钮 -->
      <div class="flex items-center gap-2">
        <UiButton :disabled="loading" @click="createNewInvoice">
          <Plus class="w-4 h-4 mr-1" />
          新建运单
        </UiButton>
        <UiButton variant="outline" :disabled="!waybillNo" @click="copyLastOperation">
          <Copy class="w-4 h-4 mr-1" />
          复制上次操作
        </UiButton>
        <div v-if="waybillNo" class="ml-4 text-sm">
          <span class="text-muted-foreground">运单号：</span>
          <span class="font-medium">{{ waybillNo }}</span>
        </div>
      </div>

      <!-- 紧凑式输入块 -->
      <div v-if="waybillNo" class="p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <!-- 车号 -->
          <SearchableCombobox
            v-model="form.vehicleName"
            :search-fn="searchTrucks"
            placeholder="车号"
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
            :model-value="form.shipName"
            :search-fn="searchCompanies"
            placeholder="开单名称"
            @update:model-value="handleShipNameChange"
          />

          <!-- 发货单位 -->
          <UiInput v-model="form.shipCustomer" placeholder="发货单位" />

          <!-- 发货日期 -->
          <DatePicker v-model="form.shipDate" placeholder="发货日期" />
        </div>

        <!-- 订单号和提单号单独一行 -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          <!-- 订单号 -->
          <SearchableCombobox
            v-model="selectedOrderNo"
            :search-fn="searchOrders"
            placeholder="订单号"
            :disabled="!form.shipName"
            @update:model-value="handleOrderChange"
          />

          <!-- 提单号 -->
          <SearchableCombobox
            :model-value="''"
            :search-fn="searchBills"
            placeholder="提单号"
            :disabled="!selectedOrderNo"
            @update:model-value="handleBillSelect"
          />
        </div>
      </div>

      <!-- 已选提单表格 -->
      <div v-if="selectedBills.length > 0" class="border rounded">
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead class="w-10" />
              <UiTableHead>提单号</UiTableHead>
              <UiTableHead>订单号</UiTableHead>
              <UiTableHead>仓库</UiTableHead>
              <UiTableHead>厚度</UiTableHead>
              <UiTableHead>宽度</UiTableHead>
              <UiTableHead>长度</UiTableHead>
              <UiTableHead>单重</UiTableHead>
              <UiTableHead>剩余量</UiTableHead>
              <UiTableHead>发运数</UiTableHead>
              <UiTableHead>发运重量</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="(bill, index) in selectedBills" :key="bill.bill_no">
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
              <UiTableCell>{{ bill.weight?.toFixed(4) }}</UiTableCell>
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
                  {{ bill.send_weight?.toFixed(3) }}
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

      <!-- 汇总和操作 -->
      <div v-if="selectedBills.length > 0" class="flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          <span>总块数: <strong>{{ totalNumber }}</strong></span>
          <span class="ml-6">总重量: <strong>{{ totalWeight.toFixed(3) }}</strong> 吨</span>
        </div>
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

      <!-- 空状态 -->
      <div v-if="!waybillNo" class="border rounded-lg p-12 text-center text-muted-foreground">
        <p>请点击"新建运单"开始创建配发货单</p>
      </div>
    </div>
  </BasicPage>
</template>
