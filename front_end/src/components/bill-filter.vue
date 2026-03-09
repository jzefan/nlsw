<script setup lang="ts">
import { Loader2, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

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
  creater: string
}

const props = withDefaults(defineProps<{
  modelValue: BillFilterValues
  showStatus?: boolean
  showLeftNumOnly?: boolean
  statusOptions?: string[]
  createrOptions?: string[]
  loading?: boolean
}>(), {
  showStatus: true,
  showLeftNumOnly: true,
  statusOptions: () => ['新建', '待配发', '部分配发', '已配发', '已结算'],
  createrOptions: () => [],
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: BillFilterValues]
  'search': []
  'reset': []
}>()

// 使用 computed 实现双向绑定
const filters = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// 更新单个字段
function updateField<K extends keyof BillFilterValues>(field: K, value: unknown) {
  const newValue = typeof value === 'string' ? value : (value == null ? '' : String(value))
  emit('update:modelValue', { ...props.modelValue, [field]: newValue as BillFilterValues[K] })
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
    creater: '',
  })
  emit('reset')
}

function disableStartDate(date: Date) {
  if (props.modelValue.endDate) {
    const end = new Date(props.modelValue.endDate)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (props.modelValue.startDate) {
    const start = new Date(props.modelValue.startDate)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

// 搜索
function handleSearch() {
  if (props.modelValue.startDate && props.modelValue.endDate && new Date(props.modelValue.startDate) > new Date(props.modelValue.endDate)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }
  emit('search')
}
</script>

<template>
  <div class="p-3 border rounded-lg bg-muted/50">
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      <UiInput :model-value="filters.billNo" placeholder="提单号" @update:model-value="updateField('billNo', $event)" />
      <UiInput :model-value="filters.orderNo" placeholder="订单号" @update:model-value="updateField('orderNo', $event)" />
      <SearchableCombobox :model-value="filters.billingName" :search-fn="searchCompanies" placeholder="开单名称" @update:model-value="updateField('billingName', $event)" />
      <UiInput :model-value="filters.brandNo" placeholder="牌号" @update:model-value="updateField('brandNo', $event)" />
      <UiInput :model-value="filters.contractNo" placeholder="合同号" @update:model-value="updateField('contractNo', $event)" />
      <UiSelect :model-value="filters.creater" @update:model-value="updateField('creater', $event)">
        <UiSelectTrigger class="w-full">
          <UiSelectValue placeholder="创建人" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="name in createrOptions" :key="name" :value="name">
            {{ name }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
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
      <DatePicker 
        :model-value="filters.startDate" 
        placeholder="开始日期" 
        :disabled-date="disableStartDate"
        disabled-hint="开始日期不能晚于结束日期"
        @update:model-value="updateField('startDate', $event)" 
      />
      <DatePicker 
        :model-value="filters.endDate" 
        placeholder="结束日期" 
        :disabled-date="disableEndDate"
        disabled-hint="结束日期不能早于开始日期"
        @update:model-value="updateField('endDate', $event)" 
      />
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
      <UiButton size="sm" :disabled="loading" @click="handleSearch">
        <Loader2 v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
        <Search v-else class="w-4 h-4 mr-1" />
        {{ loading ? '查询中...' : '查询' }}
      </UiButton>
      <UiButton variant="outline" size="sm" @click="handleReset">
        重置
      </UiButton>
    </div>
  </div>
</template>