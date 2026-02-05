<script setup lang="ts">
import { Filter, RefreshCw, SearchX, Trash2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { BillFilterValues } from '@/components/bill-filter.vue'
import type { Bill } from '@/services/api/bill.api'

import BillFilter from '@/components/bill-filter.vue'
import { BasicPage } from '@/components/global-layout'
import {

  deleteBills,
  getBills,
  searchBills,
} from '@/services/api/bill.api'

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
})

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
  { value: 'ship_warehouse', label: '发货仓库', type: 'text' },
  { value: 'contract_no', label: '合同号', type: 'text' },
  { value: 'sales_dep', label: '销售部门', type: 'text' },
  { value: 'create_date', label: '创建日期', type: 'date' },
  { value: 'size_type', label: '尺寸类型', type: 'select', options: ['定尺', '乱尺'] },
]
const advancedOperators = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'contain', label: '包含' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
]

// 加载数据（只查询新建状态的提单）
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
      status: '新建', // 只能删除新建状态的提单
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined,
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

// 删除提单
async function handleDelete() {
  if (selectedBills.value.length === 0) {
    toast.warning('请先选择要删除的提单')
    return
  }

  if (!confirm(`确定要删除选中的 ${selectedBills.value.length} 条提单吗？删除后不能恢复！`)) {
    return
  }

  try {
    const ids = selectedBills.value.map(b => b._id!)
    const result = await deleteBills(ids)
    if (result.ok) {
      toast.success(`删除成功，共 ${ids.length} 条`)
      selectedBills.value = []
      if (activeQuery.value) {
        executeAdvancedSearch(false)
      }
      else {
        loadData()
      }
    }
    else {
      toast.error('删除失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

// 格式化数字
function formatNumber(num: number | undefined) {
  if (num === undefined || num === null)
    return ''
  return num.toFixed(2)
}

// 格式化日期
function formatDate(date: Date | string | undefined) {
  if (!date)
    return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  }
  page.value = 1
  loadData()
}

// 清除特殊查询
function clearActiveQuery() {
  activeQuery.value = null
  page.value = 1
  loadData()
}

// 分页处理
async function handlePageChange(newPage: number) {
  page.value = newPage
  if (activeQuery.value?.type === 'advanced') {
    await executeAdvancedSearch(false)
  }
  else {
    await loadData()
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

async function executeAdvancedSearch(resetPage = true) {
  const validConditions = advancedConditions.value.filter(c => c.field && c.value)
  if (validConditions.length === 0 && resetPage) {
    toast.warning('请至少添加一个有效的查询条件')
    return
  }

  if (resetPage) {
    page.value = 1
  }

  loading.value = true
  try {
    // 构建查询树，始终包含 status = '新建' 条件
    const statusCondition = {
      type: 'condition',
      field: 'status',
      operator: 'eq',
      value: '新建',
    }

    let queryTree: any
    if (validConditions.length === 0) {
      queryTree = statusCondition
    }
    else if (validConditions.length === 1) {
      const c = validConditions[0]
      queryTree = {
        type: 'and',
        children: [
          statusCondition,
          {
            type: 'condition',
            field: c.field,
            operator: c.operator,
            value: c.value,
          },
        ],
      }
    }
    else {
      queryTree = {
        type: 'and',
        children: [
          statusCondition,
          ...validConditions.map(c => ({
            type: 'condition',
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        ],
      }
    }

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
      activeQuery.value = { type: 'advanced', label: labels.join(', ') || '高级查询' }

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

// 初始化
onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="删除提单" description="删除新建状态的提单">
    <template #actions>
      <div class="flex items-center gap-2">
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
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 mr-1" />
          刷新
        </UiButton>
      </div>
    </template>

    <!-- 提示 -->
    <div class="mb-3 p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 text-sm">
      只能删除状态为"新建"的提单，已配发或已结算的提单无法删除。
    </div>

    <!-- 筛选区域 -->
    <BillFilter
      v-if="showFilter"
      v-model="filters"
      :show-status="false"
      :show-left-num-only="false"
      class="mb-3"
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
    <div class="mb-3 flex items-center gap-2">
      <UiButton
        variant="destructive"
        size="sm"
        :disabled="selectedBills.length === 0"
        @click="handleDelete"
      >
        <Trash2 class="w-4 h-4 mr-1" />
        删除选中 ({{ selectedBills.length }})
      </UiButton>
      <div class="flex-1" />
      <span class="text-sm text-muted-foreground">
        已选择 {{ selectedBills.length }} 条，共 {{ total }} 条可删除
      </span>
    </div>

    <!-- 数据表格 -->
    <div class="border rounded-lg overflow-auto">
      <table class="w-full text-sm min-w-[1024px]">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10 whitespace-nowrap">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300"
                :checked="selectedBills.length === bills.length && bills.length > 0"
                @change="toggleSelectAll"
              >
            </th>
            <th class="p-2 text-center whitespace-nowrap">
              状态
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              订单号-项次
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              提单号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              牌号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              开单名称
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              销售部门
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
            <th class="p-2 text-left whitespace-nowrap">
              仓库
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              合同号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建日期
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
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300"
                :checked="isSelected(bill)"
                @change="toggleSelect(bill)"
              >
            </td>
            <td class="p-2 text-center">
              <UiBadge variant="secondary">
                {{ bill.status }}
              </UiBadge>
            </td>
            <td class="p-2 font-mono">
              {{ bill.order_no }}-{{ bill.order_item_no }}
            </td>
            <td class="p-2 font-mono">
              {{ bill.bill_no }}
            </td>
            <td class="p-2">
              {{ bill.brand_no }}
            </td>
            <td class="p-2">
              {{ bill.billing_name }}
            </td>
            <td class="p-2">
              {{ bill.sales_dep }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(bill.thickness) }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(bill.width) }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(bill.len) }}
            </td>
            <td class="p-2 text-right">
              {{ bill.block_num }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(bill.total_weight) }}
            </td>
            <td class="p-2">
              {{ bill.ship_warehouse }}
            </td>
            <td class="p-2">
              {{ bill.contract_no }}
            </td>
            <td class="p-2">
              {{ formatDate(bill.create_date) }}
            </td>
          </tr>
          <tr v-if="bills.length === 0 && !loading">
            <td colspan="15" class="p-8 text-center text-muted-foreground">
              暂无可删除的提单
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="mt-4 flex items-center justify-between">
      <div class="text-sm text-muted-foreground">
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
        <span class="text-sm">{{ page }} / {{ Math.ceil(total / limit) || 1 }}</span>
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

    <!-- 高级查询对话框 -->
    <UiDialog v-model:open="showAdvancedSearchDialog">
      <UiDialogContent class="max-w-3xl">
        <UiDialogHeader>
          <UiDialogTitle>高级查询</UiDialogTitle>
          <UiDialogDescription>
            添加多个条件进行组合查询（条件之间为"并且"关系，仅查询"新建"状态的提单）
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-4 max-h-96 overflow-auto">
          <div v-for="(condition, index) in advancedConditions" :key="index" class="flex items-center gap-2 mb-2">
            <UiSelect v-model="condition.field" class="w-36">
              <UiSelectTrigger>
                <UiSelectValue placeholder="字段" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="f in advancedFields" :key="f.value" :value="f.value">
                  {{ f.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <UiSelect v-model="condition.operator" class="w-28">
              <UiSelectTrigger>
                <UiSelectValue placeholder="操作" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="op in advancedOperators" :key="op.value" :value="op.value">
                  {{ op.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
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
          <UiButton variant="outline" size="sm" @click="addCondition">
            + 添加条件
          </UiButton>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showAdvancedSearchDialog = false">
            取消
          </UiButton>
          <UiButton @click="executeAdvancedSearch()">
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
