<script setup lang="ts">
import dayjs from 'dayjs'
import { CheckCircle, CheckSquare, ChevronDown, ChevronUp, Filter, Pencil, Plus, Square, Trash2, XCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { OrderPlan } from '@/services/api/plan.api'

import { BasicPage } from '@/components/global-layout'
import { formatNumber } from '@/utils/format'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import {
  closePlans,
  deletePlans,
  getPlans,

  searchCompanies,
  unclosePlans,
  updatePlan,
} from '@/services/api/plan.api'

// 状态
const loading = ref(false)
const plans = ref<OrderPlan[]>([])
const selectedPlans = ref<OrderPlan[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const summary = ref({ totalWeight: 0, leftWeight: 0, sentWeight: 0 })

// 筛选条件
const showFilter = ref(false)
const filters = ref({
  orderNo: '',
  customerName: '',
  transportMode: '',
  status: '',
  startDate: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
})

// 下拉选项
const transportModes = ['船运', '汽运', '船运+汽运', '火车']
const statusOptions = ['生效', '结案']

// 编辑对话框
const showEditDialog = ref(false)
const editingPlan = ref<OrderPlan | null>(null)
const editForm = ref({
  orderWeight: 0,
  destination: '',
  transportMode: '',
  consignee: '',
  dsClient: '',
  salesman: '',
  consigner: '',
  contractNo: '',
  charge: 0,
})

// 移动端展开的卡片
const expandedCards = ref<Set<string>>(new Set())

function toggleCardExpand(orderNo: string) {
  if (expandedCards.value.has(orderNo)) {
    expandedCards.value.delete(orderNo)
  }
  else {
    expandedCards.value.add(orderNo)
  }
}

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const result = await getPlans({
      page: page.value,
      limit: limit.value,
      orderNo: filters.value.orderNo || undefined,
      customerName: filters.value.customerName || undefined,
      transportMode: filters.value.transportMode || undefined,
      status: filters.value.status || undefined,
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined,
    })
    if (result.ok) {
      plans.value = result.data
      total.value = result.total
      summary.value = result.summary
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
function toggleSelect(plan: OrderPlan) {
  const index = selectedPlans.value.findIndex(p => p.order_no === plan.order_no)
  if (index >= 0) {
    selectedPlans.value.splice(index, 1)
  }
  else {
    selectedPlans.value.push(plan)
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedPlans.value.length === plans.value.length) {
    selectedPlans.value = []
  }
  else {
    selectedPlans.value = [...plans.value]
  }
}

// 是否选中
function isSelected(plan: OrderPlan) {
  return selectedPlans.value.some(p => p.order_no === plan.order_no)
}

// 打开编辑对话框
function openEditDialog(plan: OrderPlan) {
  editingPlan.value = plan
  editForm.value = {
    orderWeight: plan.order_weight,
    destination: plan.destination || '',
    transportMode: plan.transport_mode || '',
    consignee: plan.consignee || '',
    dsClient: plan.ds_client || '',
    salesman: plan.customer_saleman || '',
    consigner: plan.consigner || '',
    contractNo: plan.contract_no || '',
    charge: plan.receiving_charge || 0,
  }
  showEditDialog.value = true
}

// 计算已发量
const sentWeight = computed(() => {
  if (!editingPlan.value)
    return 0
  return editingPlan.value.order_weight - editingPlan.value.left_weight
})

// 保存编辑
async function saveEdit() {
  if (!editingPlan.value)
    return

  // 验证：订单量不能小于已发量
  const sent = sentWeight.value
  if (editForm.value.orderWeight < sent) {
    toast.error('订单量不能小于已发量', {
      description: `已发量: ${sent.toFixed(2)}吨, 输入订单量: ${editForm.value.orderWeight.toFixed(2)}吨`,
    })
    return
  }

  try {
    const result = await updatePlan({
      orderNo: editingPlan.value.order_no,
      orderWeight: editForm.value.orderWeight,
      destination: editForm.value.destination,
      transportMode: editForm.value.transportMode,
      consignee: editForm.value.consignee,
      dsClient: editForm.value.dsClient,
      salesman: editForm.value.salesman,
      consigner: editForm.value.consigner,
      contractNo: editForm.value.contractNo,
      charge: editForm.value.charge,
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

// 删除计划
async function handleDelete() {
  if (selectedPlans.value.length === 0) {
    toast.warning('请先选择要删除的计划')
    return
  }

  // 检查是否有已发货的计划
  const hasSent = selectedPlans.value.some(p => p.order_weight - p.left_weight > 0.00001)
  if (hasSent) {
    toast.error('订单已经开始配发，不能删除')
    return
  }

  if (!confirm('确定要删除选中的计划吗？删除后不能恢复！'))
    return

  try {
    const result = await deletePlans(selectedPlans.value.map(p => ({ order_no: p.order_no })))
    if (result.ok) {
      toast.success('删除成功')
      selectedPlans.value = []
      loadData()
    }
    else {
      toast.error('删除失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

// 结案
async function handleClose() {
  if (selectedPlans.value.length === 0) {
    toast.warning('请先选择要结案的计划')
    return
  }

  try {
    const result = await closePlans(selectedPlans.value.map(p => p.order_no))
    if (result.ok) {
      toast.success('结案成功')
      selectedPlans.value = []
      loadData()
    }
    else {
      toast.error('结案失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('结案失败', { description: e.message })
  }
}

// 取消结案
async function handleUnclose() {
  if (selectedPlans.value.length === 0) {
    toast.warning('请先选择要取消结案的计划')
    return
  }

  try {
    const result = await unclosePlans(selectedPlans.value.map(p => p.order_no))
    if (result.ok) {
      toast.success('取消结案成功')
      selectedPlans.value = []
      loadData()
    }
    else {
      toast.error('取消结案失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('取消结案失败', { description: e.message })
  }
}

// 格式化日期
function formatDate(date: Date | string | undefined) {
  if (!date)
    return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 获取状态文本
function getStatusText(status: number) {
  return status === 0 ? '生效' : '结案'
}

// 重置筛选
function resetFilters() {
  filters.value = {
    orderNo: '',
    customerName: '',
    transportMode: '',
    status: '',
    startDate: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  }
  page.value = 1
  loadData()
}

// 选中的统计
const selectedSummary = computed(() => {
  let totalWeight = 0
  let leftWeight = 0
  selectedPlans.value.forEach((p) => {
    totalWeight += p.order_weight
    leftWeight += p.left_weight
  })
  return {
    totalWeight,
    leftWeight,
    sentWeight: totalWeight - leftWeight,
  }
})

// 初始化
onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="计划列表" description="订单计划管理">
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
        <UiButton size="sm" @click="$router.push('/plans/create')">
          <Plus class="w-4 h-4 mr-1" />
          新建计划
        </UiButton>
      </div>
    </template>

    <!-- 筛选区域 -->
    <div v-if="showFilter" class="mb-3 p-3 border rounded-lg bg-muted/50">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2">
        <UiInput v-model="filters.orderNo" placeholder="订单号" class="col-span-2 sm:col-span-1 lg:w-36" />
        <SearchableCombobox v-model="filters.customerName" :search-fn="searchCompanies" placeholder="客户名称" class="col-span-2 sm:col-span-1 lg:w-36" />
        <UiSelect v-model="filters.transportMode">
          <UiSelectTrigger class="lg:w-36">
            <UiSelectValue placeholder="运输方式" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="m in transportModes" :key="m" :value="m">
              {{ m }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiSelect v-model="filters.status">
          <UiSelectTrigger class="lg:w-36">
            <UiSelectValue placeholder="状态" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="s in statusOptions" :key="s" :value="s">
              {{ s }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <DatePicker v-model="filters.startDate" placeholder="开始日期" class="lg:w-40" />
        <DatePicker v-model="filters.endDate" placeholder="结束日期" class="lg:w-40" />
        <div class="col-span-2 sm:col-span-3 lg:col-span-1 flex gap-2">
          <UiButton size="sm" class="flex-1 lg:flex-none" @click="loadData">
            查询
          </UiButton>
          <UiButton variant="outline" size="sm" class="flex-1 lg:flex-none" @click="resetFilters">
            重置
          </UiButton>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedPlans.length !== 1"
          @click="selectedPlans.length === 1 && openEditDialog(selectedPlans[0])"
        >
          <Pencil class="w-4 h-4 mr-1" />
          修改
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedPlans.length === 0"
          @click="handleDelete"
        >
          <Trash2 class="w-4 h-4 mr-1" />
          删除
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedPlans.length === 0"
          @click="handleClose"
        >
          <CheckCircle class="w-4 h-4 mr-1" />
          结案
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedPlans.length === 0"
          @click="handleUnclose"
        >
          <XCircle class="w-4 h-4 mr-1" />
          取消结案
        </UiButton>
        <span v-if="selectedPlans.length > 0" class="text-xs text-muted-foreground whitespace-nowrap ml-2">
          已选 {{ selectedPlans.length }}
        </span>
      </div>
      <div class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
        选中: 订单量 <span class="font-medium">{{ formatNumber(selectedSummary.totalWeight, 2) }}</span> |
        已发量 <span class="font-medium">{{ formatNumber(selectedSummary.sentWeight, 2) }}</span> |
        未发量 <span class="font-medium">{{ formatNumber(selectedSummary.leftWeight, 2) }}</span>
      </div>
    </div>

    <!-- 桌面端表格 -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="text-sm min-w-[1024px]">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10 whitespace-nowrap">
              <button class="focus:outline-none" @click="toggleSelectAll">
                <CheckSquare v-if="selectedPlans.length === plans.length && plans.length > 0" class="w-4 h-4 text-primary" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </button>
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              订单号
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              订单量
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              已发量
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              未发量
            </th>
            <th class="p-2 text-left min-w-[120px] whitespace-nowrap">
              客户名称
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              客户代码
            </th>
            <th class="p-2 text-left min-w-[100px] whitespace-nowrap">
              目的地
            </th>
            <th class="p-2 text-left min-w-[80px] whitespace-nowrap">
              运输方式
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              收货人
            </th>
            <th class="p-2 text-left min-w-[100px] whitespace-nowrap">
              下游客户
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              客户业务员
            </th>
            <th class="p-2 text-left min-w-[80px] whitespace-nowrap">
              业务员
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              合同号
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              接单价
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              录单时间
            </th>
            <th class="p-2 text-center whitespace-nowrap">
              状态
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="plan in plans"
            :key="plan.order_no"
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            :class="{ 'bg-primary/15 hover:bg-primary/20': isSelected(plan) }"
            @click="toggleSelect(plan)"
          >
            <td class="p-2" @click.stop>
              <button class="focus:outline-none" @click="toggleSelect(plan)">
                <CheckSquare v-if="isSelected(plan)" class="w-4 h-4 text-primary" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </button>
            </td>
            <td class="p-2 font-mono">
              {{ plan.order_no }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(plan.order_weight, 2) }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(plan.order_weight - plan.left_weight, 2) }}
            </td>
            <td class="p-2 text-right">
              <span :class="plan.left_weight > 0.001 ? 'text-blue-600' : 'text-green-600'">
                {{ formatNumber(plan.left_weight, 2) }}
              </span>
            </td>
            <td class="p-2 min-w-[120px]">
              {{ plan.customer_name }}
            </td>
            <td class="p-2">
              {{ plan.customer_code }}
            </td>
            <td class="p-2 min-w-[100px]">
              {{ plan.destination }}
            </td>
            <td class="p-2 min-w-[80px]">
              {{ plan.transport_mode }}
            </td>
            <td class="p-2">
              {{ plan.consignee }}
            </td>
            <td class="p-2 min-w-[100px]">
              {{ plan.ds_client }}
            </td>
            <td class="p-2">
              {{ plan.customer_saleman }}
            </td>
            <td class="p-2 min-w-[80px]">
              {{ plan.consigner }}
            </td>
            <td class="p-2">
              {{ plan.contract_no }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(plan.receiving_charge, 2) }}
            </td>
            <td class="p-2">
              {{ formatDate(plan.entry_time) }}
            </td>
            <td class="p-2 text-center">
              <UiBadge :variant="plan.status === 0 ? 'default' : 'secondary'">
                {{ getStatusText(plan.status) }}
              </UiBadge>
            </td>
          </tr>
          <tr v-if="plans.length === 0 && !loading">
            <td colspan="17" class="p-8 text-center text-muted-foreground">
              暂无数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片列表 -->
    <div class="lg:hidden space-y-2">
      <!-- 全选 -->
      <div class="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
        <button class="focus:outline-none" @click="toggleSelectAll">
          <CheckSquare v-if="selectedPlans.length === plans.length && plans.length > 0" class="w-4 h-4 text-primary" />
          <Square v-else class="w-4 h-4 text-muted-foreground" />
        </button>
        <span class="text-sm text-muted-foreground">全选</span>
      </div>

      <!-- 卡片列表 -->
      <div
        v-for="plan in plans"
        :key="plan.order_no"
        class="border rounded-lg overflow-hidden transition-colors"
        :class="{ 'border-primary bg-primary/5': isSelected(plan) }"
      >
        <!-- 卡片头部 -->
        <div
          class="p-3 flex items-start gap-3 cursor-pointer"
          @click="toggleSelect(plan)"
        >
          <div @click.stop>
            <button class="focus:outline-none" @click="toggleSelect(plan)">
              <CheckSquare v-if="isSelected(plan)" class="w-4 h-4 text-primary" />
              <Square v-else class="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono font-medium truncate">{{ plan.order_no }}</span>
              <UiBadge :variant="plan.status === 0 ? 'default' : 'secondary'" class="shrink-0">
                {{ getStatusText(plan.status) }}
              </UiBadge>
            </div>
            <div class="text-sm text-muted-foreground mt-1 truncate">
              {{ plan.customer_name }}
            </div>
            <div class="flex items-center gap-4 mt-2 text-sm">
              <div>
                <span class="text-muted-foreground">订单:</span>
                <span class="font-medium ml-1">{{ formatNumber(plan.order_weight, 2) }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">已发:</span>
                <span class="font-medium ml-1">{{ formatNumber(plan.order_weight - plan.left_weight, 2) }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">未发:</span>
                <span class="font-medium ml-1" :class="plan.left_weight > 0.001 ? 'text-blue-600' : 'text-green-600'">
                  {{ formatNumber(plan.left_weight, 2) }}
                </span>
              </div>
            </div>
          </div>
          <button
            class="p-1 text-muted-foreground hover:text-foreground"
            @click.stop="toggleCardExpand(plan.order_no)"
          >
            <ChevronDown v-if="!expandedCards.has(plan.order_no)" class="w-5 h-5" />
            <ChevronUp v-else class="w-5 h-5" />
          </button>
        </div>

        <!-- 展开详情 -->
        <div v-if="expandedCards.has(plan.order_no)" class="px-3 pb-3 pt-0 border-t bg-muted/20">
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-3">
            <div>
              <span class="text-muted-foreground">客户代码:</span>
              <span class="ml-1">{{ plan.customer_code || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">目的地:</span>
              <span class="ml-1">{{ plan.destination || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">运输方式:</span>
              <span class="ml-1">{{ plan.transport_mode || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">收货人:</span>
              <span class="ml-1">{{ plan.consignee || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">下游客户:</span>
              <span class="ml-1">{{ plan.ds_client || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">客户业务员:</span>
              <span class="ml-1">{{ plan.customer_saleman || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">业务员:</span>
              <span class="ml-1">{{ plan.consigner || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">合同号:</span>
              <span class="ml-1">{{ plan.contract_no || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">接单价:</span>
              <span class="ml-1">{{ formatNumber(plan.receiving_charge, 2) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">录单时间:</span>
              <span class="ml-1">{{ formatDate(plan.entry_time) }}</span>
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <UiButton size="sm" variant="outline" class="flex-1" @click.stop="openEditDialog(plan)">
              <Pencil class="w-4 h-4 mr-1" />
              修改
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="plans.length === 0 && !loading" class="p-8 text-center text-muted-foreground border rounded-lg">
        暂无数据
      </div>
    </div>

    <!-- 分页和统计 -->
    <div class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
        共 {{ total }} 条 |
        订单量 <span class="font-medium">{{ formatNumber(summary.totalWeight, 2) }}</span> |
        已发 <span class="font-medium">{{ formatNumber(summary.sentWeight, 2) }}</span> |
        未发 <span class="font-medium">{{ formatNumber(summary.leftWeight, 2) }}</span>
      </div>
      <div class="flex items-center justify-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page <= 1"
          @click="page--; loadData()"
        >
          上一页
        </UiButton>
        <span class="text-sm">{{ page }} / {{ Math.ceil(total / limit) || 1 }}</span>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page >= Math.ceil(total / limit)"
          @click="page++; loadData()"
        >
          下一页
        </UiButton>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <UiDialog v-model:open="showEditDialog">
      <UiDialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>修改订单计划</UiDialogTitle>
          <UiDialogDescription>
            订单号: {{ editingPlan?.order_no }} | 客户: {{ editingPlan?.customer_name }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <label class="text-sm font-medium">已发量（吨）</label>
            <UiInput :model-value="formatNumber(sentWeight, 2)" disabled class="bg-muted" />
          </div>
          <div>
            <label class="text-sm font-medium">订单量（吨）<span class="text-destructive ml-1">*</span></label>
            <UiInput
              v-model.number="editForm.orderWeight"
              type="number"
              step="0.01"
              :min="sentWeight"
              placeholder="不能小于已发量"
            />
            <p v-if="editForm.orderWeight < sentWeight" class="text-xs text-destructive mt-1">
              订单量不能小于已发量 {{ formatNumber(sentWeight, 2) }}
            </p>
          </div>
          <div>
            <label class="text-sm font-medium">目的地</label>
            <UiInput v-model="editForm.destination" />
          </div>
          <div>
            <label class="text-sm font-medium">运输方式</label>
            <UiSelect v-model="editForm.transportMode">
              <UiSelectTrigger>
                <UiSelectValue placeholder="选择方式" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="m in transportModes" :key="m" :value="m">
                  {{ m }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-sm font-medium">收货人</label>
            <UiInput v-model="editForm.consignee" />
          </div>
          <div>
            <label class="text-sm font-medium">下游客户</label>
            <UiInput v-model="editForm.dsClient" />
          </div>
          <div>
            <label class="text-sm font-medium">客户业务员</label>
            <UiInput v-model="editForm.salesman" />
          </div>
          <div>
            <label class="text-sm font-medium">业务员</label>
            <UiInput v-model="editForm.consigner" />
          </div>
          <div>
            <label class="text-sm font-medium">合同号</label>
            <UiInput v-model="editForm.contractNo" />
          </div>
          <div>
            <label class="text-sm font-medium">接单价</label>
            <UiInput v-model.number="editForm.charge" type="number" step="0.01" />
          </div>
        </div>
        <UiDialogFooter class="flex-col sm:flex-row gap-2">
          <UiButton variant="outline" class="w-full sm:w-auto" @click="showEditDialog = false">
            取消
          </UiButton>
          <UiButton class="w-full sm:w-auto" @click="saveEdit">
            保存
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
