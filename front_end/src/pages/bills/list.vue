<script setup lang="ts">
import { CheckSquare, Filter, LoaderCircle, Pencil, Search, SearchX, Square, X, Zap } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { BillFilterValues } from '@/components/bill-filter.vue'
import type { Bill } from '@/services/api/bill.api'

import BillFilter from '@/components/bill-filter.vue'
import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  getBills,
  searchBills,
  searchBrands,
  searchSaleDeps,
  searchWarehouses,
  updateBill,
  updateBillsBatch,
  updateBillRaw,
} from '@/services/api/bill.api'
import { searchCompanies } from '@/services/api/plan.api'
import { getUserNames } from '@/services/api/user.api'
import { formatDate, formatDim, formatNumber } from '@/utils/format'
import BillCardList from './components/BillCardList.vue'

// 状态
const loading = ref(false)
const bills = ref<Bill[]>([])
const selectedBills = ref<Bill[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

// 当前激活的特殊查询
const activeQuery = ref<{ type: string, label: string } | null>(null)

// 筛选条件
const showFilter = ref(false)
const filters = ref<BillFilterValues>({
  billNo: '',
  orderNo: '',
  billingName: '',
  brandNo: '',
  contractNo: '',
  status: '',
  leftNumOnly: false,
  startDate: '',
  endDate: '',
  creater: '',
})

// 状态选项（用于高级查询）
const statusOptions = ['新建', '待配发', '部分配发', '已配发', '已结算']

// 编辑对话框
const showEditDialog = ref(false)
const editingBill = ref<Bill | null>(null)
const editForm = ref({
  billNo: '',
  billingName: '',
  brandNo: '',
  shipWarehouse: '',
  contractNo: '',
  salesDep: '',
  sizeType: '',
  blockNum: 0,
  totalWeight: 0,
})

// 批量编辑对话框
const showBatchDialog = ref(false)
const batchField = ref('')
const batchValue = ref('')
const batchFields = [
  { value: 'bill_no', label: '提单号' },
  { value: 'billing_name', label: '开单名称' },
  { value: 'brand_no', label: '牌号' },
  { value: 'contract_no', label: '合同号' },
  { value: 'sales_dep', label: '销售部门' },
  { value: 'ship_warehouse', label: '发货仓库' },
  { value: 'size_type', label: '尺寸类型' },
]

// 剩余量查询对话框
const showLeftSearchDialog = ref(false)
const leftSearchThreshold = ref('')

// 移动端卡片选中ID集合
const selectedBillIds = computed(() => new Set(selectedBills.value.map(b => b._id!)))

// 高级查询对话框
const showAdvancedSearchDialog = ref(false)
const advancedConditions = ref<{ field: string, operator: string, value: string }[]>([])
const advancedFields = [
  { value: 'bill_no', label: '提单号', type: 'text' },
  { value: 'order_no', label: '订单号', type: 'text' },
  { value: 'order_item_no', label: '项次号', type: 'text' },
  { value: 'brand_no', label: '牌号', type: 'text' },
  { value: 'billing_name', label: '开单名称', type: 'text' },
  { value: 'len', label: '长度', type: 'number' },
  { value: 'width', label: '宽度', type: 'number' },
  { value: 'thickness', label: '厚度', type: 'number' },
  { value: 'weight', label: '单重', type: 'number' },
  { value: 'block_num', label: '块数', type: 'number' },
  { value: 'total_weight', label: '总重量', type: 'number' },
  { value: 'left_num', label: '剩余量', type: 'number' },
  { value: 'ship_warehouse', label: '发货仓库', type: 'text' },
  { value: 'contract_no', label: '合同号', type: 'text' },
  { value: 'sales_dep', label: '销售部门', type: 'text' },
  { value: 'create_date', label: '创建日期', type: 'date' },
  { value: 'shipping_date', label: '配发日期', type: 'date' },
  { value: 'status', label: '状态', type: 'select', options: statusOptions },
  { value: 'size_type', label: '尺寸类型', type: 'select', options: ['定尺', '乱尺'] },
]
const advancedOperators = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
]

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const result = await getBills({
      page: page.value,
      limit: limit.value,
      billNo: filters.value.billNo || undefined,
      orderNo: filters.value.orderNo || undefined,
      billingName: filters.value.billingName || undefined,
      brandNo: filters.value.brandNo || undefined,
      contractNo: filters.value.contractNo || undefined,
      status: filters.value.status || undefined,
      leftNumOnly: filters.value.leftNumOnly || undefined,
      startTime: filters.value.startDate || undefined,
      endTime: filters.value.endDate || undefined,
      creater: filters.value.creater || undefined,
    })
    if (result.ok) {
      bills.value = result.data
      total.value = result.total
      selectedBills.value = []
    }
  }
  catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// 选择行
function toggleSelect(bill: Bill) {
  const index = selectedBills.value.findIndex(b => b._id === bill._id)
  if (index >= 0) {
    selectedBills.value.splice(index, 1)
  }
  else {
    selectedBills.value.push(bill)
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedBills.value.length === bills.value.length) {
    selectedBills.value = []
  }
  else {
    selectedBills.value = [...bills.value]
  }
}

// 是否选中
function isSelected(bill: Bill) {
  return selectedBills.value.some(b => b._id === bill._id)
}

// 打开编辑对话框
function openEditDialog(bill: Bill) {
  editingBill.value = bill
  editForm.value = {
    billNo: bill.bill_no,
    billingName: bill.billing_name,
    brandNo: bill.brand_no || '',
    shipWarehouse: bill.ship_warehouse || '',
    contractNo: bill.contract_no || '',
    salesDep: bill.sales_dep || '',
    sizeType: bill.size_type || '定尺',
    blockNum: bill.block_num || 0,
    totalWeight: bill.total_weight,
  }
  showEditDialog.value = true
}

// 保存编辑
async function saveEdit() {
  if (!editingBill.value)
    return

  try {
    const result = await updateBill({
      _id: editingBill.value._id!,
      billNo: editForm.value.billNo,
      billingName: editForm.value.billingName,
      brandNo: editForm.value.brandNo,
      shipWarehouse: editForm.value.shipWarehouse,
      contractNo: editForm.value.contractNo,
      salesDep: editForm.value.salesDep,
      sizeType: editForm.value.sizeType,
      blockNum: editForm.value.blockNum,
      totalWeight: editForm.value.totalWeight,
    })
    if (result.ok) {
      toast.success('更新成功')
      showEditDialog.value = false
      loadData()
    }
    else {
      toast.error('更新失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('更新失败', { description: e.message })
  }
}

// 打开批量编辑对话框
function openBatchDialog() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要修改的提单')
    return
  }
  batchField.value = ''
  batchValue.value = ''
  showBatchDialog.value = true
}

// 保存批量编辑
async function saveBatchEdit() {
  if (!batchField.value || !batchValue.value) {
    toast.warning('请选择字段并输入值')
    return
  }

  try {
    const ids = selectedBills.value.map(b => b._id!)
    const result = await updateBillsBatch({
      ids,
      field: batchField.value,
      value: batchValue.value,
    })
    if (result.ok) {
      toast.success(`批量更新成功，共 ${result.count || ids.length} 条`)
      showBatchDialog.value = false
      selectedBills.value = []
      loadData()
    }
    else {
      toast.error('批量更新失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('批量更新失败', { description: e.message })
  }
}

// 剩余量查询（支持分页）
async function searchByLeftNum(resetPage = true) {
  const threshold = Number.parseFloat(leftSearchThreshold.value)
  if (!threshold || threshold <= 0) {
    toast.warning('请输入有效的阈值')
    return
  }

  if (resetPage) {
    page.value = 1
  }

  loading.value = true
  try {
    const result = await searchBills({
      queryTree: {
        field: 'left_num',
        operator: 'lte',
        value: threshold,
      },
      page: page.value,
      limit: limit.value,
    })
    if (result.ok) {
      bills.value = result.data || result.bills || []
      total.value = result.total || bills.value.length
      selectedBills.value = []
      showLeftSearchDialog.value = false
      activeQuery.value = { type: 'leftNum', label: `剩余量 ≤ ${threshold}` }
      if (resetPage) {
        toast.success(`查询到 ${total.value} 条剩余量 ≤ ${threshold} 的提单`)
      }
    }
    else {
      toast.error('查询失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('查询失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// 清除特殊查询，恢复普通查询
function clearActiveQuery() {
  activeQuery.value = null
  leftSearchThreshold.value = ''
  page.value = 1
  loadData()
}

// 分页时检查是否有特殊查询
async function handlePageChange(newPage: number) {
  page.value = newPage
  if (activeQuery.value?.type === 'leftNum') {
    await searchByLeftNum(false)
  }
  else if (activeQuery.value?.type === 'advanced') {
    await executeAdvancedSearch(false)
  }
  else {
    await loadData()
  }
}

// 剩余量清零
async function zeroLeftNum() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要清零的提单')
    return
  }

  if (!confirm(`确定要将选中的 ${selectedBills.value.length} 条提单剩余量清零吗？`)) {
    return
  }

  loading.value = true
  try {
    // 对每个选中的提单，设置 left_num = 0, status = '已配发'
    const updates = selectedBills.value.map(bill => ({
      _id: bill._id!,
      leftNum: 0,
      status: '已配发',
      totalWeight: bill.total_weight - bill.left_num,
    }))

    let successCount = 0
    for (const update of updates) {
      try {
        const result = await updateBill({
          _id: update._id,
          totalWeight: update.totalWeight,
        })
        if (result.ok)
          successCount++
      }
      catch {
        // continue on error
      }
    }

    toast.success(`剩余量清零成功，共 ${successCount} 条`)
    selectedBills.value = []
    loadData()
  }
  catch (e: any) {
    toast.error('清零失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// 高级查询
function openAdvancedSearch() {
  advancedConditions.value = [{ field: '', operator: 'eq', value: '' }]
  showAdvancedSearchDialog.value = true
}

function addCondition() {
  advancedConditions.value.push({ field: '', operator: 'eq', value: '' })
}

function removeCondition(index: number) {
  advancedConditions.value.splice(index, 1)
}

// 保存高级查询条件用于分页
const savedAdvancedQueryTree = ref<any>(null)

async function executeAdvancedSearch(resetPage = true) {
  const validConditions = advancedConditions.value.filter(c => c.field && c.value)
  if (validConditions.length === 0) {
    toast.warning('请至少添加一个有效的查询条件')
    return
  }

  if (resetPage) {
    page.value = 1
  }

  loading.value = true
  try {
    // 构建查询树（匹配后端 buildQuery 格式）
    let queryTree: any
    if (validConditions.length === 1) {
      const c = validConditions[0]
      queryTree = {
        field: c.field,
        operator: c.operator,
        value: c.value,
      }
    }
    else {
      queryTree = {
        logic: 'AND',
        conditions: validConditions.map(c => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }
    }

    // 保存查询树用于分页
    savedAdvancedQueryTree.value = queryTree

    const result = await searchBills({
      queryTree,
      page: page.value,
      limit: limit.value,
    })

    if (result.ok) {
      bills.value = result.data || result.bills || []
      total.value = result.total || bills.value.length
      selectedBills.value = []
      showAdvancedSearchDialog.value = false

      // 生成查询描述
      const labels = validConditions.map((c) => {
        const fieldObj = advancedFields.find(f => f.value === c.field)
        const opObj = advancedOperators.find(o => o.value === c.operator)
        return `${fieldObj?.label || c.field} ${opObj?.label || c.operator} ${c.value}`
      })
      activeQuery.value = { type: 'advanced', label: labels.join(', ') }

      if (resetPage) {
        toast.success(`高级查询完成，共 ${total.value} 条`)
      }
    }
    else {
      toast.error('查询失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('查询失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

function getFieldType(fieldValue: string) {
  const field = advancedFields.find(f => f.value === fieldValue)
  return field?.type || 'text'
}

function getFieldOptions(fieldValue: string) {
  const field = advancedFields.find(f => f.value === fieldValue)
  return field?.options || []
}

// 定尺类型
const fixedSizeTypes = ['定尺', '单定', '双定尺']

// 计算单重：长 × 宽 × 厚 × 7.85 × 10⁻⁹ (吨)
function calcWeight(bill: Bill) {
  const t = bill.thickness || 0
  const w = bill.width || 0
  const l = bill.len || 0
  if (t > 0 && w > 0 && l > 0) {
    return l * w * t * 7.85 * 1e-9
  }
  return 0
}

// 当前编辑提单是否需要修正（定尺且单重为0）
const needsWeightFix = computed(() => {
  const bill = editingBill.value
  if (!bill) return false
  return fixedSizeTypes.includes(bill.size_type || '') && !bill.weight && calcWeight(bill) > 0
})

// 修正后的单重、块数、剩余量
const fixedWeight = computed(() => {
  const bill = editingBill.value
  if (!bill) return { weight: 0, blockNum: 0, leftNum: 0 }
  const w = calcWeight(bill)
  const blockNum = w > 0 ? Math.round(bill.total_weight / w) : 0
  // 已发运块数 = 各运单 num 之和
  const shippedNum = (bill.invoices || []).reduce((sum: number, inv: any) => sum + (inv.num || 0), 0)
  const leftNum = Math.max(blockNum - shippedNum, 0)
  return { weight: w, blockNum, leftNum }
})

// 修正单重、块数、剩余量
async function fixWeightAndBlockNum() {
  if (!editingBill.value) return
  const { weight, blockNum, leftNum } = fixedWeight.value
  if (weight <= 0) return

  try {
    const result = await updateBillRaw({
      _id: editingBill.value._id!,
      weight,
      block_num: blockNum,
      left_num: leftNum,
    })
    if (result.ok) {
      toast.success(`修正成功：单重 ${formatNumber(weight, 4)}，块数 ${blockNum}，剩余量 ${formatNumber(leftNum)}`)
      editingBill.value.weight = weight
      editingBill.value.block_num = blockNum
      editingBill.value.left_num = leftNum
      editForm.value.blockNum = blockNum
    } else {
      toast.error('修正失败', { description: result.response })
    }
  } catch (e: any) {
    toast.error('修正失败', { description: e.message })
  }
}


// 重置筛选
function resetFilters() {
  filters.value = {
    billNo: '',
    orderNo: '',
    billingName: '',
    brandNo: '',
    contractNo: '',
    status: '',
    leftNumOnly: false,
    startDate: '',
    endDate: '',
    creater: '',
  }
  page.value = 1
  loadData()
}

// 获取状态样式
function getStatusVariant(status: string) {
  if (status === '新建')
    return 'secondary'
  if (status === '已配发')
    return 'default'
  if (status === '已结算' || status === '已开票' || status === '已回款')
    return 'outline'
  return 'secondary'
}

// 用户名列表（创建人筛选用）
const userNames = ref<string[]>([])

async function loadUserNames() {
  try {
    const result = await getUserNames()
    if (result.ok) {
      userNames.value = result.data
    }
  }
  catch {
    // ignore
  }
}

// 初始化
onMounted(() => {
  loadData()
  loadUserNames()
})
</script>

<template>
  <BasicPage title="提单列表" description="查询和修改提单信息">
    <template #actions>
      <div class="flex items-center gap-2 overflow-x-auto">
        <UiButton
          :variant="showFilter ? 'default' : 'outline'"
          size="sm"
          @click="showFilter = !showFilter"
        >
          <Filter class="w-4 h-4 mr-1" />
          {{ showFilter ? '收起' : '筛选' }}
        </UiButton>
        <UiButton variant="outline" size="sm" @click="openAdvancedSearch">
          <SearchX class="w-4 h-4 mr-1" />
          高级查询
        </UiButton>
        <UiButton variant="outline" size="sm" @click="showLeftSearchDialog = true">
          <Search class="w-4 h-4 mr-1" />
          剩余量查询
        </UiButton>
      </div>
    </template>

    <!-- 筛选区域 -->
    <BillFilter
      v-if="showFilter"
      v-model="filters"
      class="mb-3"
      :loading="loading"
      :creater-options="userNames"
      @search="activeQuery = null; loadData()"
      @reset="resetFilters"
    />

    <!-- 当前查询条件显示 -->
    <div v-if="activeQuery" class="mb-3 flex items-center gap-2">
      <span class="text-sm text-muted-foreground">当前查询:</span>
      <span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-md">
        {{ activeQuery.label }}
        <button
          class="ml-1 hover:bg-primary/20 rounded p-0.5"
          title="清除查询"
          @click="clearActiveQuery"
        >
          <X class="w-3 h-3" />
        </button>
      </span>
    </div>

    <!-- 工具栏 -->
    <div class="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div class="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedBills.length !== 1"
          @click="selectedBills.length === 1 && openEditDialog(selectedBills[0])"
        >
          <Pencil class="w-4 h-4 mr-1" />
          单条修改
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedBills.length === 0"
          @click="openBatchDialog"
        >
          批量修改
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedBills.length === 0"
          @click="zeroLeftNum"
        >
          <Zap class="w-4 h-4 mr-1" />
          剩余量清零
        </UiButton>
      </div>
      <div class="flex-1" />
      <span class="text-xs sm:text-sm text-muted-foreground text-center sm:text-right">
        已选择 {{ selectedBills.length }} 条，共 {{ total }} 条
      </span>
    </div>

    <!-- 桌面端表格 -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="text-sm min-w-[1024px]">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10 whitespace-nowrap">
              <button class="flex items-center focus:outline-none" @click="toggleSelectAll">
                <CheckSquare v-if="selectedBills.length === bills.length && bills.length > 0" class="w-4 h-4 text-primary" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </button>
            </th>
            <th class="p-2 text-center whitespace-nowrap">
              状态
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              订单号-项次
            </th>
            <th class="p-2 text-left min-w-[100px] whitespace-nowrap">
              提单号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              牌号
            </th>
            <th class="p-2 text-left min-w-[120px] whitespace-nowrap">
              开单名称
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              厚
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              宽
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              长
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              块数
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              总重量
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              余量
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              仓库
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              合同号
            </th>
            <th class="p-2 text-left min-w-[100px] whitespace-nowrap">
              创建日期
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建人
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              配发信息
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              销售部门
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="bill in bills"
            :key="bill._id"
            class="border-t hover:bg-muted/30 cursor-pointer"
            :class="{ 'bg-primary/10': isSelected(bill) }"
            @click="toggleSelect(bill)"
          >
            <td class="p-2" @click.stop>
              <button class="flex items-center focus:outline-none" @click="toggleSelect(bill)">
                <CheckSquare v-if="isSelected(bill)" class="w-4 h-4 text-primary" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </button>
            </td>
            <td class="p-2 text-center">
              <UiBadge :variant="getStatusVariant(bill.status)">
                {{ bill.status }}
              </UiBadge>
            </td>
            <td class="p-2 font-mono whitespace-nowrap">
              {{ bill.order_no }}-{{ String(bill.order_item_no || '').padStart(3, '0') }}
            </td>
            <td class="p-2 font-mono min-w-[100px]">
              {{ bill.bill_no }}
            </td>
            <td class="p-2">
              {{ bill.brand_no }}
            </td>
            <td class="p-2 min-w-[120px] whitespace-nowrap">
              {{ bill.billing_name }}
            </td>
            <td class="p-2 text-right">
              {{ formatDim(bill.thickness) }}
            </td>
            <td class="p-2 text-right">
              {{ formatDim(bill.width) }}
            </td>
            <td class="p-2 text-right">
              {{ formatDim(bill.len) }}
            </td>
            <td class="p-2 text-right">
              {{ bill.block_num }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(bill.total_weight, 2) }}
            </td>
            <td class="p-2 text-right">
              <span :class="bill.left_num > 0 ? 'text-blue-600 font-medium' : 'text-green-600'">
                {{ formatNumber(bill.left_num, 2) }}
              </span>
            </td>
            <td class="p-2 whitespace-nowrap">
              {{ bill.ship_warehouse }}
            </td>
            <td class="p-2">
              {{ bill.contract_no }}
            </td>
            <td class="p-2 min-w-[100px]">
              {{ formatDate(bill.create_date) }}
            </td>
            <td class="p-2">
              {{ bill.creater }}
            </td>
            <td class="p-2">
              <div v-if="bill.dispatches?.length" class="flex flex-wrap gap-1">
                <span
                  v-for="(d, i) in bill.dispatches"
                  :key="i"
                  class="inline-flex flex-col items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs leading-tight"
                >
                  <span class="font-medium">{{ d.veh_name }}</span>
                  <span class="text-muted-foreground text-[10px]">{{ d.waybill_no }}</span>
                </span>
              </div>
            </td>
            <td class="p-2">
              {{ bill.sales_dep || (bill as any).salesDep }}
            </td>
          </tr>
          <tr v-if="bills.length === 0 && !loading">
            <td colspan="18" class="p-8 text-center text-muted-foreground">
              暂无数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片视图 -->
    <BillCardList
      class="lg:hidden"
      :bills="bills"
      :loading="loading"
      :selected-ids="selectedBillIds"
      :get-status-variant="getStatusVariant"
      @select="toggleSelect"
    >
      <template #expandActions="{ bill }">
        <div class="pt-2 border-t">
          <UiButton
            size="sm"
            variant="outline"
            class="w-full"
            @click="openEditDialog(bill)"
          >
            <Pencil class="w-4 h-4 mr-1" />
            编辑
          </UiButton>
        </div>
      </template>
    </BillCardList>

    <!-- 分页 -->
    <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="text-xs sm:text-sm text-muted-foreground">
        共 {{ total }} 条
      </div>
      <div class="flex items-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page <= 1"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </UiButton>
        <span class="text-xs sm:text-sm">{{ page }} / {{ Math.ceil(total / limit) || 1 }}</span>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page >= Math.ceil(total / limit)"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </UiButton>
      </div>
    </div>

    <!-- 单条编辑对话框 -->
    <UiDialog v-model:open="showEditDialog">
      <UiDialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>修改提单</UiDialogTitle>
          <UiDialogDescription>
            订单: {{ editingBill?.order_no }}-{{ editingBill?.order_item_no }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div v-if="editingBill" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground py-2 border-b">
          <span>厚: <strong class="text-foreground">{{ formatDim(editingBill.thickness) }}</strong></span>
          <span>宽: <strong class="text-foreground">{{ formatDim(editingBill.width) }}</strong></span>
          <span>长: <strong class="text-foreground">{{ formatDim(editingBill.len) }}</strong></span>
          <span v-if="!needsWeightFix">单重: <strong class="text-foreground">{{ formatNumber(editingBill.weight, 2) }}</strong></span>
          <span v-else class="text-orange-600">
            单重: <strong>{{ formatNumber(fixedWeight.weight, 4) }}</strong>
            <span class="ml-1 text-[10px]">(计算值)</span>
          </span>
          <span v-if="editingBill.size_type">尺寸: <strong class="text-foreground">{{ editingBill.size_type }}</strong></span>
          <UiButton v-if="needsWeightFix" variant="outline" size="sm" class="h-6 px-2 text-xs text-orange-600 border-orange-300" @click="fixWeightAndBlockNum">
            修正单重和块数
          </UiButton>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <label class="text-sm font-medium">提单号</label>
            <UiInput v-model="editForm.billNo" />
          </div>
          <div>
            <label class="text-sm font-medium">开单名称</label>
            <SearchableCombobox v-model="editForm.billingName" :search-fn="searchCompanies" placeholder="选择客户" />
          </div>
          <div>
            <label class="text-sm font-medium">牌号</label>
            <SearchableCombobox v-model="editForm.brandNo" :search-fn="searchBrands" placeholder="选择牌号" />
          </div>
          <div>
            <label class="text-sm font-medium">发货仓库</label>
            <SearchableCombobox v-model="editForm.shipWarehouse" :search-fn="searchWarehouses" placeholder="选择仓库" />
          </div>
          <div>
            <label class="text-sm font-medium">合同号</label>
            <UiInput v-model="editForm.contractNo" />
          </div>
          <div>
            <label class="text-sm font-medium">销售部门</label>
            <SearchableCombobox v-model="editForm.salesDep" :search-fn="searchSaleDeps" placeholder="选择部门" />
          </div>
          <div>
            <label class="text-sm font-medium">块数</label>
            <UiInput v-model.number="editForm.blockNum" type="number" min="0" :disabled="editingBill?.status !== '新建'" />
          </div>
          <div>
            <label class="text-sm font-medium">总重量</label>
            <UiInput v-model.number="editForm.totalWeight" type="number" min="0" step="0.01" :disabled="editingBill?.status !== '新建'" />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showEditDialog = false">
            取消
          </UiButton>
          <UiButton @click="saveEdit">
            保存
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 批量编辑对话框 -->
    <UiDialog v-model:open="showBatchDialog">
      <UiDialogContent class="max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>批量修改</UiDialogTitle>
          <UiDialogDescription>
            将修改选中的 {{ selectedBills.length }} 条提单
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="grid gap-4 py-4">
          <div>
            <label class="text-sm font-medium">选择字段</label>
            <UiSelect v-model="batchField">
              <UiSelectTrigger>
                <UiSelectValue placeholder="选择要修改的字段" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="f in batchFields" :key="f.value" :value="f.value">
                  {{ f.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-sm font-medium">新值</label>
            <UiInput v-model="batchValue" placeholder="输入新值" />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showBatchDialog = false">
            取消
          </UiButton>
          <UiButton @click="saveBatchEdit">
            确认修改
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 剩余量查询对话框 -->
    <UiDialog v-model:open="showLeftSearchDialog">
      <UiDialogContent class="max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>剩余量查询</UiDialogTitle>
          <UiDialogDescription>
            查询剩余量小于等于指定阈值的提单
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-4">
          <label class="text-sm font-medium">剩余量阈值</label>
          <UiInput v-model="leftSearchThreshold" type="number" min="0" step="0.01" placeholder="输入阈值" />
          <p class="text-xs text-muted-foreground mt-1">
            将查询所有剩余量 ≤ 该值的提单
          </p>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showLeftSearchDialog = false">
            取消
          </UiButton>
          <UiButton @click="searchByLeftNum">
            查询
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 高级查询对话框 -->
    <UiDialog v-model:open="showAdvancedSearchDialog">
      <UiDialogContent class="max-w-3xl max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>高级查询</UiDialogTitle>
          <UiDialogDescription>
            添加多个条件进行组合查询（条件之间为"并且"关系）
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-4 max-h-60 sm:max-h-96 overflow-auto">
          <div v-for="(condition, index) in advancedConditions" :key="index" class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
            <UiSelect v-model="condition.field" class="w-full sm:w-36">
              <UiSelectTrigger>
                <UiSelectValue placeholder="字段" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="f in advancedFields" :key="f.value" :value="f.value">
                  {{ f.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <UiSelect v-model="condition.operator" class="w-full sm:w-28">
              <UiSelectTrigger>
                <UiSelectValue placeholder="操作" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="op in advancedOperators" :key="op.value" :value="op.value">
                  {{ op.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <div class="flex items-center gap-2 flex-1">
              <template v-if="getFieldType(condition.field) === 'select'">
                <UiSelect v-model="condition.value" class="flex-1">
                  <UiSelectTrigger>
                    <UiSelectValue placeholder="选择值" />
                  </UiSelectTrigger>
                  <UiSelectContent>
                    <UiSelectItem v-for="opt in getFieldOptions(condition.field)" :key="opt" :value="opt">
                      {{ opt }}
                    </UiSelectItem>
                  </UiSelectContent>
                </UiSelect>
              </template>
              <template v-else-if="getFieldType(condition.field) === 'date'">
                <UiInput v-model="condition.value" type="date" class="flex-1" />
              </template>
              <template v-else>
                <UiInput
                  v-model="condition.value"
                  :type="getFieldType(condition.field) === 'number' ? 'number' : 'text'"
                  placeholder="输入值"
                  class="flex-1"
                />
              </template>
              <UiButton
                variant="ghost"
                size="icon"
                class="shrink-0"
                :disabled="advancedConditions.length === 1"
                @click="removeCondition(index)"
              >
                ×
              </UiButton>
            </div>
          </div>
          <UiButton variant="outline" size="sm" @click="addCondition">
            + 添加条件
          </UiButton>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showAdvancedSearchDialog = false">
            取消
          </UiButton>
          <UiButton :disabled="loading" @click="executeAdvancedSearch">
            <LoaderCircle v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
            执行查询
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
