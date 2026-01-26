<script setup lang="ts">
import { Filter, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  deleteBills,
  getBills,
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
  startDate: '',
  endDate: '',
})

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
      loadData()
    } else {
      toast.error('删除失败', { description: result.response })
    }
  } catch (e: any) {
    toast.error('删除失败', { description: e.message })
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
    startDate: '',
    endDate: '',
  }
  page.value = 1
  loadData()
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
    <div v-if="showFilter" class="mb-3 p-3 border rounded-lg bg-muted/50">
      <div class="flex flex-wrap items-center gap-2">
        <UiInput v-model="filters.billNo" placeholder="提单号" class="w-36" />
        <UiInput v-model="filters.orderNo" placeholder="订单号" class="w-36" />
        <SearchableCombobox v-model="filters.billingName" :search-fn="searchCompanies" placeholder="开单名称" class="w-36" />
        <UiInput v-model="filters.brandNo" placeholder="牌号" class="w-36" />
        <UiInput v-model="filters.contractNo" placeholder="合同号" class="w-36" />
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
        共 {{ total }} 条可删除
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
              <UiBadge variant="secondary">
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
            <td class="p-2">{{ bill.ship_warehouse }}</td>
            <td class="p-2">{{ bill.contract_no }}</td>
            <td class="p-2">{{ formatDate(bill.create_date) }}</td>
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
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
