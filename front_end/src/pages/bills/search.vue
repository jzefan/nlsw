<script setup lang="ts">
import { Download, Filter, RefreshCw, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  exportBills,
  getBills,
  type Bill,
} from '@/services/api/bill.api'
import { searchCompanies } from '@/services/api/plan.api'

// 状态
const loading = ref(false)
const bills = ref<Bill[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

// 筛选条件
const showFilter = ref(true)
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

// 导出
async function handleExport() {
  try {
    loading.value = true
    const blob = await exportBills({
      columns: [
        { field: 'order_no', label: '订单号' },
        { field: 'order_item_no', label: '项次号' },
        { field: 'bill_no', label: '提单号' },
        { field: 'billing_name', label: '开单名称' },
        { field: 'brand_no', label: '牌号' },
        { field: 'sales_dep', label: '销售部门' },
        { field: 'thickness', label: '厚度' },
        { field: 'width', label: '宽度' },
        { field: 'len', label: '长度' },
        { field: 'block_num', label: '块数' },
        { field: 'total_weight', label: '总重量' },
        { field: 'left_num', label: '余量' },
        { field: 'ship_warehouse', label: '发货仓库' },
        { field: 'contract_no', label: '合同号' },
        { field: 'status', label: '状态' },
        { field: 'create_date', label: '创建日期' },
      ],
    })

    // 下载文件
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bills_export_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast.success('导出成功')
  } catch (e: any) {
    toast.error('导出失败', { description: e.message })
  } finally {
    loading.value = false
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
  <BasicPage title="提单查询" description="查询和导出提单信息">
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
        <UiButton variant="outline" size="sm" @click="handleExport">
          <Download class="w-4 h-4 mr-1" />
          导出
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

    <!-- 数据表格 -->
    <div class="border rounded-lg overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
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
            <th class="p-2 text-left">发货日期</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="bill in bills"
            :key="bill._id"
            class="border-t hover:bg-muted/30"
          >
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
            <td class="p-2">{{ formatDate(bill.shipping_date) }}</td>
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
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
