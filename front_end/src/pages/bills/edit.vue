<script setup lang="ts">
import { Filter, Pencil, RefreshCw, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  getBills,
  updateBill,
  searchBrands,
  searchSaleDeps,
  searchWarehouses,
  type Bill,
} from '@/services/api/bill.api'
import { searchCompanies } from '@/services/api/plan.api'

// 状态
const loading = ref(false)
const bills = ref<Bill[]>([])
const selectedBills = ref<Bill[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

// 筛选条件
const showFilter = ref(false)
const filters = ref({
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

// 状态选项
const statusOptions = ['新建', '待配发', '部分配发', '已配发', '已结算', '已开票', '已回款']

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
  { value: 'billNo', label: '提单号' },
  { value: 'billingName', label: '开单名称' },
  { value: 'brandNo', label: '牌号' },
  { value: 'contractNo', label: '合同号' },
  { value: 'salesDep', label: '销售部门' },
  { value: 'shipWarehouse', label: '发货仓库' },
  { value: 'sizeType', label: '尺寸类型' },
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
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined,
    })
    if (result.ok) {
      bills.value = result.data
      total.value = result.total
    }
  } catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  } finally {
    loading.value = false
  }
}

// 选择行
function toggleSelect(bill: Bill) {
  const index = selectedBills.value.findIndex(b => b._id === bill._id)
  if (index >= 0) {
    selectedBills.value.splice(index, 1)
  } else {
    selectedBills.value.push(bill)
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedBills.value.length === bills.value.length) {
    selectedBills.value = []
  } else {
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
  if (!editingBill.value) return

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
    } else {
      toast.error('更新失败', { description: result.response })
    }
  } catch (e: any) {
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
    let successCount = 0
    for (const bill of selectedBills.value) {
      const data: any = { _id: bill._id }
      data[batchField.value] = batchValue.value
      const result = await updateBill(data)
      if (result.ok) successCount++
    }
    toast.success(`批量更新成功，共 ${successCount} 条`)
    showBatchDialog.value = false
    selectedBills.value = []
    loadData()
  } catch (e: any) {
    toast.error('批量更新失败', { description: e.message })
  }
}

// 格式化数字
function formatNumber(num: number | undefined) {
  if (num === undefined || num === null) return ''
  return num.toFixed(2)
}

// 格式化日期
function formatDate(date: Date | string | undefined) {
  if (!date) return ''
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

// 获取状态样式
function getStatusVariant(status: string) {
  if (status === '新建') return 'secondary'
  if (status === '已配发') return 'default'
  if (status === '已结算' || status === '已开票' || status === '已回款') return 'outline'
  return 'secondary'
}

// 初始化
onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="修改提单" description="查询和修改提单信息">
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
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 mr-1" />
          刷新
        </UiButton>
      </div>
    </template>

    <!-- 筛选区域 -->
    <div v-if="showFilter" class="mb-3 p-3 border rounded-lg bg-muted/50">
      <div class="flex flex-wrap items-center gap-2">
        <UiInput v-model="filters.billNo" placeholder="提单号" class="w-36" />
        <UiInput v-model="filters.orderNo" placeholder="订单号" class="w-36" />
        <SearchableCombobox v-model="filters.billingName" :search-fn="searchCompanies" placeholder="开单名称" class="w-36" />
        <UiInput v-model="filters.brandNo" placeholder="牌号" class="w-36" />
        <UiInput v-model="filters.contractNo" placeholder="合同号" class="w-36" />
        <UiSelect v-model="filters.status">
          <UiSelectTrigger class="w-36">
            <UiSelectValue placeholder="状态" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="s in statusOptions" :key="s" :value="s">
              {{ s }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <label class="flex items-center gap-1 text-sm">
          <UiCheckbox v-model:checked="filters.leftNumOnly" />
          仅有余量
        </label>
        <UiInput v-model="filters.startDate" type="date" class="w-36" />
        <UiInput v-model="filters.endDate" type="date" class="w-36" />
        <UiButton size="sm" @click="loadData">
          <Search class="w-4 h-4 mr-1" />
          查询
        </UiButton>
        <UiButton variant="outline" size="sm" @click="resetFilters">
          重置
        </UiButton>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="mb-3 flex items-center gap-2">
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
      <div class="flex-1" />
      <span class="text-sm text-muted-foreground">
        已选择 {{ selectedBills.length }} 条
      </span>
    </div>

    <!-- 数据表格 -->
    <div class="border rounded-lg overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10">
              <UiCheckbox
                :checked="selectedBills.length === bills.length && bills.length > 0"
                @update:checked="toggleSelectAll"
              />
            </th>
            <th class="p-2 text-center">状态</th>
            <th class="p-2 text-left">订单号-项次</th>
            <th class="p-2 text-left">提单号</th>
            <th class="p-2 text-left">牌号</th>
            <th class="p-2 text-left">开单名称</th>
            <th class="p-2 text-left">销售部门</th>
            <th class="p-2 text-right">厚</th>
            <th class="p-2 text-right">宽</th>
            <th class="p-2 text-right">长</th>
            <th class="p-2 text-right">块数</th>
            <th class="p-2 text-right">总重量</th>
            <th class="p-2 text-right">余量</th>
            <th class="p-2 text-left">仓库</th>
            <th class="p-2 text-left">合同号</th>
            <th class="p-2 text-left">创建日期</th>
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
              <UiCheckbox :checked="isSelected(bill)" @update:checked="toggleSelect(bill)" />
            </td>
            <td class="p-2 text-center">
              <UiBadge :variant="getStatusVariant(bill.status)">
                {{ bill.status }}
              </UiBadge>
            </td>
            <td class="p-2 font-mono">{{ bill.order_no }}-{{ bill.order_item_no }}</td>
            <td class="p-2 font-mono">{{ bill.bill_no }}</td>
            <td class="p-2">{{ bill.brand_no }}</td>
            <td class="p-2">{{ bill.billing_name }}</td>
            <td class="p-2">{{ bill.sales_dep }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.thickness) }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.width) }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.len) }}</td>
            <td class="p-2 text-right">{{ bill.block_num }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.total_weight) }}</td>
            <td class="p-2 text-right">
              <span :class="bill.left_num > 0 ? 'text-blue-600' : 'text-green-600'">
                {{ formatNumber(bill.left_num) }}
              </span>
            </td>
            <td class="p-2">{{ bill.ship_warehouse }}</td>
            <td class="p-2">{{ bill.contract_no }}</td>
            <td class="p-2">{{ formatDate(bill.create_date) }}</td>
          </tr>
          <tr v-if="bills.length === 0 && !loading">
            <td colspan="16" class="p-8 text-center text-muted-foreground">
              暂无数据
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

    <!-- 单条编辑对话框 -->
    <UiDialog v-model:open="showEditDialog">
      <UiDialogContent class="max-w-2xl">
        <UiDialogHeader>
          <UiDialogTitle>修改提单</UiDialogTitle>
          <UiDialogDescription>
            订单: {{ editingBill?.order_no }}-{{ editingBill?.order_item_no }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="grid grid-cols-2 gap-4 py-4">
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
            <UiInput v-model.number="editForm.blockNum" type="number" :disabled="editingBill?.status !== '新建'" />
          </div>
          <div>
            <label class="text-sm font-medium">总重量</label>
            <UiInput v-model.number="editForm.totalWeight" type="number" step="0.01" :disabled="editingBill?.status !== '新建'" />
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
      <UiDialogContent>
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
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
