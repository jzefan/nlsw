<script setup lang="ts">
import { CheckSquare, FileText, Search, Square, Trash2, Truck } from 'lucide-vue-next'
import { computed } from 'vue'

import type { LoadingListGroup } from '@/utils/excel-transform'

export interface OrderItemOccurrence {
  groupIndex: number
  loadingListNo: string
  vehicleNo: string
  rowIndex: number
  quantity: number
  weight: number
}

export interface OrderItem {
  orderItemNo: string
  customerName: string
  brandNo: string
  fixedLength: number
  thickness: number
  width: number
  length: number
  contractNo: string
  occurrences: OrderItemOccurrence[]
  totalQuantity: number
  totalWeight: number
}

export interface UniqueOrder {
  key: string
  orderNo: string
  customerName: string
  items: OrderItem[]
  totalQuantity: number
  totalWeight: number
}

const props = defineProps<{
  activeTab: 'loadingList' | 'order'
  groups: LoadingListGroup[]
  uniqueOrders: UniqueOrder[]
  selectedLoadingListNo: string
  selectedOrderKey: string
  searchQuery: string
  checkedSet: Set<string>
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:activeTab', value: 'loadingList' | 'order'): void
  (e: 'update:searchQuery', value: string): void
  (e: 'selectLoadingList', loadingListNo: string): void
  (e: 'selectOrder', orderKey: string): void
  (e: 'toggleCheck', loadingListNo: string): void
  (e: 'toggleCheckAll'): void
  (e: 'deleteGroup', loadingListNo: string): void
}>()

const allChecked = computed(() =>
  props.groups.length > 0 && props.groups.every(g => props.checkedSet.has(g.loadingListNo)),
)

const filteredGroups = computed(() => {
  if (!props.searchQuery) return props.groups
  const q = props.searchQuery.toLowerCase()
  return props.groups.filter(g =>
    g.loadingListNo.toLowerCase().includes(q)
    || g.vehicleNo?.toLowerCase().includes(q),
  )
})

const filteredOrders = computed(() => {
  if (!props.searchQuery) return props.uniqueOrders
  const q = props.searchQuery.toLowerCase()
  return props.uniqueOrders.filter(o =>
    o.orderNo.toLowerCase().includes(q)
    || o.customerName.toLowerCase().includes(q)
    || o.items.some(item => item.orderItemNo.toLowerCase().includes(q)
      || item.contractNo?.toLowerCase().includes(q)),
  )
})
</script>

<template>
  <div class="h-full flex flex-col border-r">
    <!-- Tab switcher -->
    <UiTabs
      :model-value="activeTab"
      class="flex-shrink-0"
      @update:model-value="emit('update:activeTab', $event as 'loadingList' | 'order')"
    >
      <UiTabsList class="w-full grid grid-cols-2 h-9">
        <UiTabsTrigger value="loadingList" class="text-xs">
          <Truck class="w-3.5 h-3.5 mr-1" />
          装车单号
        </UiTabsTrigger>
        <UiTabsTrigger value="order" class="text-xs">
          <FileText class="w-3.5 h-3.5 mr-1" />
          订单
        </UiTabsTrigger>
      </UiTabsList>
    </UiTabs>

    <!-- Search + Select All -->
    <div class="px-2 py-2 flex-shrink-0 space-y-1.5">
      <div class="relative">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <UiInput
          :model-value="searchQuery"
          placeholder="搜索..."
          class="h-8 pl-7 text-xs"
          @update:model-value="emit('update:searchQuery', String($event))"
        />
      </div>
      <div v-if="activeTab === 'loadingList' && !readonly" class="flex items-center justify-between">
        <button
          class="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          @click="emit('toggleCheckAll')"
        >
          <CheckSquare v-if="allChecked" class="w-3.5 h-3.5" />
          <Square v-else class="w-3.5 h-3.5" />
          <span>{{ allChecked ? '取消全选' : '全选' }}</span>
        </button>
        <span class="text-[11px] text-muted-foreground">
          已选 {{ checkedSet.size }} / {{ groups.length }}
        </span>
      </div>
    </div>

    <!-- Scrollable list -->
    <div class="flex-1 min-h-0 overflow-y-auto px-1">
      <!-- Loading list view -->
      <template v-if="activeTab === 'loadingList'">
        <div
          v-for="group in filteredGroups"
          :key="group.loadingListNo"
          class="group/item relative px-2 py-2 mb-1 rounded-md cursor-pointer text-xs transition-colors hover:bg-muted/50"
          :class="[
            selectedLoadingListNo === group.loadingListNo ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400/50' : '',
            checkedSet.has(group.loadingListNo) && selectedLoadingListNo !== group.loadingListNo ? 'bg-muted' : '',
          ]"
          @click="emit('selectLoadingList', group.loadingListNo)"
        >
          <div class="flex items-center gap-1.5 font-medium">
            <template v-if="!readonly">
              <button
                class="flex-shrink-0 focus:outline-none flex items-center gap-1.5"
                @click.stop="emit('toggleCheck', group.loadingListNo)"
              >
                <CheckSquare v-if="checkedSet.has(group.loadingListNo)" class="w-4 h-4 text-primary" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
                <Truck class="w-3.5 h-3.5" />
              </button>
            </template>
            <Truck v-else class="w-3.5 h-3.5 flex-shrink-0" />
            <span class="truncate">{{ group.loadingListNo }}</span>
            <button
              v-if="!readonly"
              class="ml-auto flex-shrink-0 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              title="删除此装车单"
              @click.stop="emit('deleteGroup', group.loadingListNo)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex items-center gap-2 mt-1 text-muted-foreground pl-[22px]">
            <template v-if="group.vehicleNo">
              <span class="truncate">{{ group.vehicleNo }}</span>
            </template>
            <UiBadge v-else variant="outline" class="text-[10px] h-4 px-1 text-orange-500 border-orange-300">
              未选车
            </UiBadge>
            <span class="ml-auto whitespace-nowrap">{{ group.subtotalQuantity }}件 {{ group.subtotalWeight.toFixed(3) }}t</span>
          </div>
        </div>
        <div v-if="filteredGroups.length === 0" class="text-center text-xs text-muted-foreground py-4">
          无匹配装车单
        </div>
      </template>

      <!-- Order view -->
      <template v-else>
        <div
          v-for="order in filteredOrders"
          :key="order.key"
          class="px-2 py-2 mb-1 rounded-md cursor-pointer text-xs transition-colors hover:bg-muted/50"
          :class="selectedOrderKey === order.key ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400/50' : ''"
          @click="emit('selectOrder', order.key)"
        >
          <div class="flex items-center gap-1.5 font-medium">
            <FileText class="w-3.5 h-3.5 flex-shrink-0" />
            <span class="truncate">{{ order.orderNo }}</span>
          </div>
          <div class="mt-0.5 text-muted-foreground truncate">{{ order.customerName }}</div>
          <div class="flex items-center gap-2 mt-1 text-muted-foreground">
            <span>{{ order.items.length }}个项次</span>
            <span class="ml-auto whitespace-nowrap">{{ order.totalQuantity }}件</span>
          </div>
        </div>
        <div v-if="filteredOrders.length === 0" class="text-center text-xs text-muted-foreground py-4">
          无匹配订单
        </div>
      </template>
    </div>
  </div>
</template>
