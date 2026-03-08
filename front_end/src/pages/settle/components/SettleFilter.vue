<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'
import { pinyin } from 'pinyin-pro'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { DatePicker } from '@/components/ui/date-picker'

import type { SettleFilterParams, SettleMode } from '../types'

const props = defineProps<{
  settleMode: SettleMode
  showNonSettle: boolean
  billingNames: string[]
  vehicleNames: string[]
  shipFroms: string[]
  destinations: string[]
  orderNos: string[]
  billNos: string[]
  invNos: Array<{ inv_no: string, shipper: string }>
}>()

const emit = defineEmits<{
  (e: 'apply', params: SettleFilterParams): void
  (e: 'update:showNonSettle', value: boolean): void
}>()

// 过滤条件
const billingName = ref('')
const vehicles = ref('')
const shipFrom = ref('')
const destinations = ref('')
const orderNos = ref('')
const billNos = ref('')
const invNos = ref('')
const startDate = ref('')
const endDate = ref('')

// 初始化日期范围：默认1个月
onMounted(() => {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0)

  endDate.value = end.toISOString().split('T')[0]
  startDate.value = start.toISOString().split('T')[0]

  // 初始化后立即触发过滤
  applyFilter()
})

// Pinyin initials cache
const pinyinCache = new Map<string, string>()

function getPinyinInitials(name: string): string {
  let initials = pinyinCache.get(name)
  if (initials === undefined) {
    initials = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase()
    pinyinCache.set(name, initials)
  }
  return initials
}

// 本地搜索函数工厂（支持拼音首字母）
function createLocalSearchFn(options: string[]) {
  return async (search: string, limit: number, page: number) => {
    let filtered = options
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((item) => {
        if (item.toLowerCase().includes(searchLower)) return true
        return getPinyinInitials(item).includes(searchLower)
      })
    }
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit).map(item => ({ name: item }))
    return { ok: true, data, total: filtered.length }
  }
}

// 动态生成搜索函数
const searchBillingNames = computed(() => createLocalSearchFn(props.billingNames))
const searchVehicles = computed(() => createLocalSearchFn(props.vehicleNames))
const searchShipFroms = computed(() => createLocalSearchFn(props.shipFroms))
const searchDestinations = computed(() => createLocalSearchFn(props.destinations))
const searchOrders = computed(() => createLocalSearchFn(props.orderNos))
const searchBillNos = computed(() => createLocalSearchFn(props.billNos))

// 运单号搜索函数（包含创建人信息）
const searchInvNos = computed(() => {
  return async (search: string, limit: number, page: number) => {
    let filtered = props.invNos
    if (search) {
      filtered = filtered.filter(item =>
        item.inv_no.toLowerCase().includes(search.toLowerCase())
        || (item.shipper && item.shipper.toLowerCase().includes(search.toLowerCase())),
      )
    }
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit).map(item => ({
      name: item.inv_no,
      shipper: item.shipper,
    }))
    return { ok: true, data, total: filtered.length }
  }
})

// 应用过滤
function applyFilter() {
  if (startDate.value && endDate.value && new Date(startDate.value) > new Date(endDate.value)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  const params: SettleFilterParams = {
    fName: billingName.value ? [billingName.value] : undefined,
    fVeh: vehicles.value ? [vehicles.value] : undefined,
    fShipFrom: shipFrom.value ? [shipFrom.value] : undefined,
    fDest: destinations.value ? [destinations.value] : undefined,
    fOrder: orderNos.value ? [orderNos.value] : undefined,
    fBno: billNos.value ? [billNos.value] : undefined,
    fInvNo: invNos.value ? [invNos.value] : undefined,
    fDate1: startDate.value ? startDate.value + 'T00:00:00' : undefined,
    fDate2: endDate.value ? endDate.value + 'T23:59:59' : undefined,
    fType: 'invoice-first',
  }

  emit('apply', params)
}

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

// 节流版本的过滤（仅用于日期选择，会触发后端加载）
const throttledApplyFilter = useThrottleFn(() => {
  applyFilter()
}, 1000)

// 重置过滤（保持日期范围不变）
function resetFilter() {
  billingName.value = ''
  vehicles.value = ''
  shipFrom.value = ''
  destinations.value = ''
  orderNos.value = ''
  billNos.value = ''
  invNos.value = ''
  // 注意：不重置日期，保持当前日期范围
  // 重置后立即触发过滤
  applyFilter()
}

// 暴露方法供父组件调用
defineExpose({
  resetFilter,
})

// 注意：不监听结算模式变化，保持用户选择的过滤条件
// 只有用户点击"重置"按钮时才清空过滤条件

// 监听各个过滤条件的变化，自动触发过滤
// 非日期条件直接触发（前端过滤很快）
watch([billingName, vehicles, shipFrom, destinations, orderNos, billNos, invNos], () => {
  applyFilter()
})

// 日期变化使用节流（需要从后端重新加载数据）
watch([startDate, endDate], () => {
  throttledApplyFilter()
})

// 监听显示不需要结算的开关
watch(() => props.showNonSettle, () => {
  // 这个变化由父组件处理，不需要触发 apply
})
</script>

<template>
  <div class="p-3 border rounded-lg bg-muted/50">
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      <SearchableCombobox
        v-model="billingName"
        :search-fn="searchBillingNames"
        placeholder="开单名称"
      />
      <SearchableCombobox
        v-model="orderNos"
        :search-fn="searchOrders"
        placeholder="订单号"
      />
      <SearchableCombobox
        v-model="billNos"
        :search-fn="searchBillNos"
        placeholder="提单号"
      />
      <SearchableCombobox
        v-model="vehicles"
        :search-fn="searchVehicles"
        placeholder="车船号"
      />
      <SearchableCombobox
        v-model="shipFrom"
        :search-fn="searchShipFroms"
        placeholder="起始地"
      />
      <SearchableCombobox
        v-model="destinations"
        :search-fn="searchDestinations"
        placeholder="目的地"
      />
      <SearchableCombobox
        v-model="invNos"
        :search-fn="searchInvNos"
        placeholder="运单号"
      />
      <DatePicker
        v-model="startDate"
        placeholder="发货起始日期"
        :disabled-date="disableStartDate"
        disabled-hint="开始日期不能晚于结束日期"
      />
      <DatePicker
        v-model="endDate"
        placeholder="发货结束日期"
        :disabled-date="disableEndDate"
        disabled-hint="结束日期不能早于开始日期"
      />
    </div>
  </div>
</template>