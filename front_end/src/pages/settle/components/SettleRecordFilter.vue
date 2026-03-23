<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'

export interface SettleRecordFilterParams {
  billingName: string
  serialNumber: string
  shipTo: string
  startDate: string
  endDate: string
}

const props = defineProps<{
  /** 所有记录（用于提取过滤选项） */
  records: Array<{ billing_name?: string; serial_number?: string; ship_to?: string }>
}>()

const emit = defineEmits<{
  (e: 'filter', params: SettleRecordFilterParams): void
}>()

// 过滤条件
const billingName = ref('')
const serialNumber = ref('')
const shipTo = ref('')

function getDefaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

const defaultRange = getDefaultDateRange()
const startDate = ref(defaultRange.start)
const endDate = ref(defaultRange.end)

// 从记录中提取选项
const filterOptions = computed(() => {
  const names = new Set<string>()
  const serials = new Set<string>()
  const destinations = new Set<string>()
  for (const r of props.records) {
    if (r.billing_name) names.add(r.billing_name)
    if (r.serial_number) serials.add(r.serial_number)
    if (r.ship_to) destinations.add(r.ship_to)
  }
  return {
    billingNames: Array.from(names).sort(),
    serialNumbers: Array.from(serials).sort(),
    shipTos: Array.from(destinations).sort(),
  }
})

function localSearch(items: string[], search: string, limit: number, page: number) {
  let filtered = items
  if (search) {
    filtered = filtered.filter(i => i.toLowerCase().includes(search.toLowerCase()))
  }
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit).map(i => ({ name: i }))
  return Promise.resolve({ ok: true as const, data, total: filtered.length })
}

const searchBillingNames = computed(() => (s: string, l: number, p: number) => localSearch(filterOptions.value.billingNames, s, l, p))
const searchSerialNumbers = computed(() => (s: string, l: number, p: number) => localSearch(filterOptions.value.serialNumbers, s, l, p))
const searchShipTos = computed(() => (s: string, l: number, p: number) => localSearch(filterOptions.value.shipTos, s, l, p))

function disableStartDate(date: Date) {
  if (endDate.value) {
    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (startDate.value) {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

function emitFilter() {
  if (startDate.value && endDate.value && new Date(startDate.value) > new Date(endDate.value)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }
  emit('filter', {
    billingName: billingName.value,
    serialNumber: serialNumber.value,
    shipTo: shipTo.value,
    startDate: startDate.value,
    endDate: endDate.value,
  })
}

function reset() {
  billingName.value = ''
  serialNumber.value = ''
  shipTo.value = ''
  const range = getDefaultDateRange()
  startDate.value = range.start
  endDate.value = range.end
  emitFilter()
}

// 每次字段变更自动触发过滤
watch([billingName, serialNumber, shipTo, startDate, endDate], () => {
  emitFilter()
})

// 初始化时触发一次
onMounted(() => emitFilter())

defineExpose({ reset })
</script>

<template>
  <div class="border rounded-lg p-2 bg-muted/30">
    <div class="grid grid-cols-2 md:grid-cols-[repeat(5,1fr)_80px] gap-2">
      <SearchableCombobox
        v-model="billingName"
        :search-fn="searchBillingNames"
        placeholder="开单名称"
        class="h-8 text-sm w-full"
      />
      <SearchableCombobox
        v-model="serialNumber"
        :search-fn="searchSerialNumbers"
        placeholder="结算号"
        class="h-8 text-sm w-full"
      />
      <SearchableCombobox
        v-model="shipTo"
        :search-fn="searchShipTos"
        placeholder="目的地"
        class="h-8 text-sm w-full"
      />
      <DatePicker
        v-model="startDate"
        placeholder="起始日期"
        :disabled-date="disableStartDate"
        disabled-hint="开始日期不能晚于结束日期"
        class="h-8 text-sm w-full"
      />
      <DatePicker
        v-model="endDate"
        placeholder="结束日期"
        :disabled-date="disableEndDate"
        disabled-hint="结束日期不能早于开始日期"
        class="h-8 text-sm w-full"
      />
      <UiButton variant="outline" size="sm" class="h-8" @click="reset">
        重置
      </UiButton>
    </div>
  </div>
</template>
