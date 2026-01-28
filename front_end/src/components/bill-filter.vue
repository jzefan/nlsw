<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'
import { searchCompanies } from '@/services/api/plan.api'

export interface BillFilterValues {
  billNo: string
  orderNo: string
  billingName: string
  brandNo: string
  contractNo: string
  status: string
  leftNumOnly: boolean
  startDate: string
  endDate: string
}

const props = withDefaults(defineProps<{
  modelValue: BillFilterValues
  showStatus?: boolean
  showLeftNumOnly?: boolean
  statusOptions?: string[]
}>(), {
  showStatus: true,
  showLeftNumOnly: true,
  statusOptions: () => ['新建', '待配发', '部分配发', '已配发', '已结算', '已开票', '已回款'],
})

const emit = defineEmits<{
  'update:modelValue': [value: BillFilterValues]
  'search': []
  'reset': []
}>()

// 使用 computed 实现双向绑定
const filters = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// 更新单个字段
function updateField<K extends keyof BillFilterValues>(field: K, value: BillFilterValues[K]) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

// 重置筛选
function handleReset() {
  emit('update:modelValue', {
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
  emit('reset')
}

// 搜索
function handleSearch() {
  emit('search')
}
</script>

<template>
  <div class="p-3 border rounded-lg bg-muted/50">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      <UiInput :model-value="filters.billNo" placeholder="提单号" @update:model-value="updateField('billNo', $event)" />
      <UiInput :model-value="filters.orderNo" placeholder="订单号" @update:model-value="updateField('orderNo', $event)" />
      <SearchableCombobox :model-value="filters.billingName" :search-fn="searchCompanies" placeholder="开单名称" @update:model-value="updateField('billingName', $event)" />
      <UiInput :model-value="filters.brandNo" placeholder="牌号" @update:model-value="updateField('brandNo', $event)" />
      <UiInput :model-value="filters.contractNo" placeholder="合同号" @update:model-value="updateField('contractNo', $event)" />
      <UiSelect v-if="showStatus" :model-value="filters.status" @update:model-value="updateField('status', $event)">
        <UiSelectTrigger class="w-full">
          <UiSelectValue placeholder="状态" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="s in statusOptions" :key="s" :value="s">
            {{ s }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <DatePicker :model-value="filters.startDate" placeholder="开始日期" @update:model-value="updateField('startDate', $event)" />
      <DatePicker :model-value="filters.endDate" placeholder="结束日期" @update:model-value="updateField('endDate', $event)" />
    </div>
    <div class="mt-2 flex items-center gap-4">
      <label v-if="showLeftNumOnly" class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          :checked="filters.leftNumOnly"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300"
          @change="updateField('leftNumOnly', ($event.target as HTMLInputElement).checked)"
        >
        仅显示有余量
      </label>
      <div class="flex-1" />
      <UiButton size="sm" @click="handleSearch">
        <Search class="w-4 h-4 mr-1" />
        查询
      </UiButton>
      <UiButton variant="outline" size="sm" @click="handleReset">
        重置
      </UiButton>
    </div>
  </div>
</template>
