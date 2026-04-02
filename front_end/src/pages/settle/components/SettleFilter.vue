<script setup lang="ts">
import { Loader2, Search } from 'lucide-vue-next'
import { pinyin } from 'pinyin-pro'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { Button as UiButton } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'

import type { SettleFilterParams, SettleMode } from '../types'

interface BillItem {
  veh_ves_name: string
  ship_from: string
  ship_to: string
  order_no: string
  bill_no: string
  inv_no: string
  inv_shipper?: string
  [key: string]: any
}

const props = defineProps<{
  settleMode: SettleMode
  showNonSettle: boolean
  loading: boolean
  dataLoaded: boolean // 是否已加载过数据（第一次查询后为 true）
  allBillingNames: string[] // 全量开单名称（从 API 加载，过滤空值）
  bills: BillItem[] // 主条件查询结果（用于生成二级筛选的下拉列表）
}>()

const emit = defineEmits<{
  (e: 'query', params: SettleFilterParams): void // 每次查询都调后端
  (e: 'update:showNonSettle', value: boolean): void
}>()

// 过滤条件
const billingName = ref('')
const vehicles = ref<string[]>([])
const shipFrom = ref<string[]>([])
const destinations = ref<string[]>([])
const orderNos = ref<string[]>([])
const billNos = ref<string[]>([])
const invNos = ref<string[]>([])
const startDate = ref('')
const endDate = ref('')

// 初始化日期范围：默认1个月
onMounted(() => {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0)

  endDate.value = end.toISOString().split('T')[0]
  startDate.value = start.toISOString().split('T')[0]
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

// 记录上次查询的主条件（开单名称+日期），用于判断是否需要重新从后端加载
const lastQueryBillingName = ref('')
const lastQueryStartDate = ref('')
const lastQueryEndDate = ref('')

// 判断主条件是否发生变化
function primaryFilterChanged(): boolean {
  return billingName.value !== lastQueryBillingName.value
    || startDate.value !== lastQueryStartDate.value
    || endDate.value !== lastQueryEndDate.value
}

// 二级筛选联动：每个下拉的可选项由其它已选的二级条件决定
function matchSecondary(b: BillItem, exclude: string): boolean {
  if (exclude !== 'veh' && vehicles.value.length > 0 && !vehicles.value.includes(b.veh_ves_name)) return false
  if (exclude !== 'from' && shipFrom.value.length > 0 && !shipFrom.value.includes(b.ship_from)) return false
  if (exclude !== 'dest' && destinations.value.length > 0 && !destinations.value.includes(b.ship_to)) return false
  if (exclude !== 'order' && orderNos.value.length > 0 && !orderNos.value.includes(b.order_no)) return false
  if (exclude !== 'bno' && billNos.value.length > 0 && !billNos.value.includes(b.bill_no)) return false
  if (exclude !== 'inv' && invNos.value.length > 0 && !invNos.value.includes(b.inv_no)) return false
  return true
}

// 联动选项（每个字段排除自身条件，取其它条件交集后的可选值）
const cascadedVehicles = computed(() => {
  const set = new Set<string>()
  for (const b of props.bills) { if (b.veh_ves_name && matchSecondary(b, 'veh')) set.add(b.veh_ves_name) }
  return Array.from(set).sort()
})
const cascadedShipFroms = computed(() => {
  const set = new Set<string>()
  for (const b of props.bills) { if (b.ship_from && matchSecondary(b, 'from')) set.add(b.ship_from) }
  return Array.from(set).sort()
})
const cascadedDestinations = computed(() => {
  const set = new Set<string>()
  for (const b of props.bills) { if (b.ship_to && matchSecondary(b, 'dest')) set.add(b.ship_to) }
  return Array.from(set).sort()
})
const cascadedOrderNos = computed(() => {
  const set = new Set<string>()
  for (const b of props.bills) { if (b.order_no && matchSecondary(b, 'order')) set.add(b.order_no) }
  return Array.from(set).sort()
})
const cascadedBillNos = computed(() => {
  const set = new Set<string>()
  for (const b of props.bills) { if (b.bill_no && matchSecondary(b, 'bno')) set.add(b.bill_no) }
  return Array.from(set).sort()
})
const cascadedInvNos = computed(() => {
  const map = new Map<string, string>()
  for (const b of props.bills) {
    if (b.inv_no && !map.has(b.inv_no) && matchSecondary(b, 'inv')) {
      map.set(b.inv_no, b.inv_shipper || '')
    }
  }
  return Array.from(map.entries())
    .map(([inv_no, shipper]) => ({ inv_no, shipper }))
    .sort((a, b) => a.inv_no.localeCompare(b.inv_no))
})

// 动态生成搜索函数
const searchBillingNames = computed(() => createLocalSearchFn(props.allBillingNames))
const searchVehicles = computed(() => createLocalSearchFn(cascadedVehicles.value))
const searchShipFroms = computed(() => createLocalSearchFn(cascadedShipFroms.value))
const searchDestinations = computed(() => createLocalSearchFn(cascadedDestinations.value))
const ALL_ORDERS = '全部'
const searchOrders = computed(() => {
  const options = cascadedOrderNos.value
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
    // 第一页且无搜索时，在最前面插入"全部"
    if (!search && page === 1) {
      data.unshift({ name: ALL_ORDERS, selectAll: true } as typeof data[number])
    }
    return { ok: true, data, total: filtered.length + (search ? 0 : 1) }
  }
})
const searchBillNos = computed(() => createLocalSearchFn(cascadedBillNos.value))

// 运单号搜索函数（包含创建人信息）
const searchInvNos = computed(() => {
  const items = cascadedInvNos.value
  return async (search: string, limit: number, page: number) => {
    let filtered = items
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

// 收集所有筛选参数
function collectParams(): SettleFilterParams {
  return {
    fName: billingName.value ? [billingName.value] : undefined,
    fVeh: vehicles.value.length > 0 ? vehicles.value : undefined,
    fShipFrom: shipFrom.value.length > 0 ? shipFrom.value : undefined,
    fDest: destinations.value.length > 0 ? destinations.value : undefined,
    fOrder: orderNos.value.length > 0 ? orderNos.value : undefined,
    fBno: billNos.value.length > 0 ? billNos.value : undefined,
    fInvNo: invNos.value.length > 0 ? invNos.value : undefined,
    fDate1: startDate.value ? startDate.value + 'T00:00:00' : undefined,
    fDate2: endDate.value ? endDate.value + 'T23:59:59' : undefined,
    fType: 'invoice-first',
  }
}

// 查询按钮点击：每次都调后端
function handleSearch() {
  if (startDate.value && endDate.value && new Date(startDate.value) > new Date(endDate.value)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  // 主条件变化 → 清除二级筛选（下拉列表会由新结果重新生成）
  if (primaryFilterChanged()) {
    vehicles.value = []
    shipFrom.value = []
    destinations.value = []
    orderNos.value = []
    billNos.value = []
    invNos.value = []
  }

  // 记录本次主条件
  lastQueryBillingName.value = billingName.value
  lastQueryStartDate.value = startDate.value
  lastQueryEndDate.value = endDate.value

  emit('query', collectParams())
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

// 重置过滤（保持日期范围不变）
function resetFilter() {
  billingName.value = ''
  vehicles.value = []
  shipFrom.value = []
  destinations.value = []
  orderNos.value = []
  billNos.value = []
  invNos.value = []
  // 注意：不重置日期，保持当前日期范围
  // 重置后重新查询
  lastQueryBillingName.value = ''
  lastQueryStartDate.value = startDate.value
  lastQueryEndDate.value = endDate.value
  emit('query', collectParams())
}

// 暴露方法供父组件调用
defineExpose({
  resetFilter,
})

// 注意：不监听结算模式变化，保持用户选择的过滤条件
// 只有用户点击"重置"按钮时才清空过滤条件

// 订单号"全部"选项处理
watch(orderNos, (val, oldVal) => {
  if (!val.includes(ALL_ORDERS)) return
  // 新选了"全部" → 替换为当前联动后的所有订单号
  if (!oldVal.includes(ALL_ORDERS)) {
    orderNos.value = [...cascadedOrderNos.value]
    return
  }
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
        multiple
      />
      <SearchableCombobox
        v-model="billNos"
        :search-fn="searchBillNos"
        placeholder="提单号"
        multiple
      />
      <SearchableCombobox
        v-model="vehicles"
        :search-fn="searchVehicles"
        placeholder="车船号"
        multiple
      />
      <SearchableCombobox
        v-model="shipFrom"
        :search-fn="searchShipFroms"
        placeholder="起始地"
        multiple
      />
      <SearchableCombobox
        v-model="destinations"
        :search-fn="searchDestinations"
        placeholder="目的地"
        multiple
      />
      <SearchableCombobox
        v-model="invNos"
        :search-fn="searchInvNos"
        placeholder="运单号"
        multiple
      />
      <DatePicker
        v-model="startDate"
        placeholder="起始日期"
        :disabled-date="disableStartDate"
        disabled-hint="开始日期不能晚于结束日期"
      />
      <div class="flex items-center gap-2">
        <DatePicker
          v-model="endDate"
          placeholder="结束日期"
          :disabled-date="disableEndDate"
          disabled-hint="结束日期不能早于开始日期"
          class="flex-1 min-w-0"
        />
        <UiButton
          variant="default"
          size="sm"
          class="h-9 shrink-0"
          :disabled="loading"
          @click="handleSearch"
        >
          <Loader2 v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
          <Search v-else class="w-4 h-4 mr-1" />
          查询
        </UiButton>
      </div>
    </div>
  </div>
</template>
