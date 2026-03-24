<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { LoadingListGroup } from '@/utils/excel-transform'

import EditorDetailLoadingList from './EditorDetailLoadingList.vue'
import EditorDetailOrder from './EditorDetailOrder.vue'
import EditorLeftPanel, { type OrderItem, type UniqueOrder } from './EditorLeftPanel.vue'

const props = defineProps<{
  modelValue: LoadingListGroup[]
  checked: Set<string>
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: LoadingListGroup[]): void
  (e: 'update:checked', value: Set<string>): void
}>()

// Selection state
const activeTab = ref<'loadingList' | 'order'>('loadingList')
const selectedLoadingListNo = ref('')
const selectedOrderKey = ref('')
const searchQuery = ref('')

// Derived: unique orders grouped by orderNo across all groups
const uniqueOrders = computed<UniqueOrder[]>(() => {
  const orderMap = new Map<string, UniqueOrder>()
  props.modelValue.forEach((group, groupIndex) => {
    group.rows.forEach((row, rowIndex) => {
      const orderKey = row.orderNo
      const itemKey = `${row.orderNo}-${row.orderItemNo}-${row.customerName}`
      const occ = {
        groupIndex,
        loadingListNo: group.loadingListNo,
        vehicleNo: group.vehicleNo ?? '',
        rowIndex,
        quantity: row.quantity,
        weight: row.weight,
      }

      let order = orderMap.get(orderKey)
      if (!order) {
        order = {
          key: orderKey,
          orderNo: row.orderNo,
          customerName: row.customerName,
          items: [],
          totalQuantity: 0,
          totalWeight: 0,
        }
        orderMap.set(orderKey, order)
      }

      // Find or create item within the order
      let item = order.items.find(i => `${i.orderItemNo}-${row.customerName}` === `${row.orderItemNo}-${row.customerName}`)
      if (!item) {
        item = {
          orderItemNo: row.orderItemNo,
          customerName: row.customerName,
          brandNo: row.brandNo,
          fixedLength: row.fixedLength,
          thickness: row.thickness,
          width: row.width,
          length: row.length,
          bundleNo: row.bundleNo,
          billNo: row.billNo || '',
          contractNo: row.contractNo,
          colorMark: row.colorMark || '',
          occurrences: [],
          totalQuantity: 0,
          totalWeight: 0,
        } satisfies OrderItem
        order.items.push(item)
      }

      item.occurrences.push(occ)
      item.totalQuantity += row.quantity
      item.totalWeight += row.weight
      order.totalQuantity += row.quantity
      order.totalWeight += row.weight

      // Use the first non-empty values found
      if (!item.contractNo && row.contractNo) item.contractNo = row.contractNo
      if (!item.billNo && row.billNo) item.billNo = row.billNo
      if (!item.colorMark && row.colorMark) item.colorMark = row.colorMark
      if (!item.bundleNo && row.bundleNo) item.bundleNo = row.bundleNo
    })
  })
  return Array.from(orderMap.values())
})

// Selected group for loading list view
const selectedGroupIndex = computed(() =>
  props.modelValue.findIndex(g => g.loadingListNo === selectedLoadingListNo.value),
)
const selectedGroup = computed(() =>
  selectedGroupIndex.value >= 0 ? props.modelValue[selectedGroupIndex.value] : null,
)

// Selected order for order view
const selectedOrder = computed(() =>
  uniqueOrders.value.find(o => o.key === selectedOrderKey.value) ?? null,
)

// Auto-select first item when data arrives or tab changes
watch(() => props.modelValue, (newVal) => {
  if (newVal.length > 0 && !selectedLoadingListNo.value) {
    selectedLoadingListNo.value = newVal[0].loadingListNo
  }
}, { immediate: true })

watch(activeTab, (tab) => {
  if (tab === 'loadingList' && !selectedLoadingListNo.value && props.modelValue.length > 0) {
    selectedLoadingListNo.value = props.modelValue[0].loadingListNo
  }
  if (tab === 'order' && !selectedOrderKey.value && uniqueOrders.value.length > 0) {
    selectedOrderKey.value = uniqueOrders.value[0].key
  }
})

// Clear search when tab changes
watch(activeTab, () => {
  searchQuery.value = ''
})

// --- Data mutation handlers (immutable) ---

function handleUpdateVehicle(groupIndex: number, vehicleNo: string) {
  const newGroups = [...props.modelValue]
  newGroups[groupIndex] = { ...newGroups[groupIndex], vehicleNo }
  emit('update:modelValue', newGroups)

  // Auto-check when vehicleNo is set
  if (vehicleNo) {
    const loadingListNo = newGroups[groupIndex].loadingListNo
    if (!props.checked.has(loadingListNo)) {
      const updated = new Set(props.checked)
      updated.add(loadingListNo)
      emit('update:checked', updated)
    }
  }
}

function handleUpdateCell(groupIndex: number, rowIndex: number, field: string, value: string | number) {
  const newGroups = [...props.modelValue]
  const group = { ...newGroups[groupIndex] }
  const rows = [...group.rows]
  rows[rowIndex] = { ...rows[rowIndex], [field]: value }
  group.rows = rows
  group.subtotalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0)
  group.subtotalWeight = rows.reduce((sum, r) => sum + r.weight, 0)
  newGroups[groupIndex] = group
  emit('update:modelValue', newGroups)
}

function handleDragFill(groupIndex: number, startRow: number, endRow: number, field: string, value: string) {
  const newGroups = [...props.modelValue]
  const group = { ...newGroups[groupIndex] }
  const rows = [...group.rows]
  for (let i = startRow + 1; i <= Math.min(endRow, rows.length - 1); i++) {
    rows[i] = { ...rows[i], [field]: value }
  }
  group.rows = rows
  newGroups[groupIndex] = group
  emit('update:modelValue', newGroups)
}

function handleOrderContractNoUpdate(orderKey: string, contractNo: string) {
  const order = uniqueOrders.value.find(o => o.key === orderKey)
  if (!order) return

  const newGroups = [...props.modelValue]
  for (const item of order.items) {
    for (const occ of item.occurrences) {
      const group = { ...newGroups[occ.groupIndex] }
      const rows = [...group.rows]
      rows[occ.rowIndex] = { ...rows[occ.rowIndex], contractNo }
      group.rows = rows
      newGroups[occ.groupIndex] = group
    }
  }
  emit('update:modelValue', newGroups)
}

function handleOrderVehicleNoUpdate(orderKey: string, vehicleNo: string) {
  const order = uniqueOrders.value.find(o => o.key === orderKey)
  if (!order) return

  const newGroups = [...props.modelValue]
  const updatedGroupIndices = new Set<number>()
  for (const item of order.items) {
    for (const occ of item.occurrences) {
      if (!updatedGroupIndices.has(occ.groupIndex)) {
        newGroups[occ.groupIndex] = { ...newGroups[occ.groupIndex], vehicleNo }
        updatedGroupIndices.add(occ.groupIndex)
      }
    }
  }
  emit('update:modelValue', newGroups)

  // Auto-check when vehicleNo is set
  if (vehicleNo) {
    const updated = new Set(props.checked)
    let changed = false
    for (const idx of updatedGroupIndices) {
      const loadingListNo = newGroups[idx].loadingListNo
      if (!updated.has(loadingListNo)) {
        updated.add(loadingListNo)
        changed = true
      }
    }
    if (changed) {
      emit('update:checked', updated)
    }
  }
}

function handleOrderVehicleNoMapUpdate(orderKey: string, vehicleMap: Record<string, string>) {
  const newGroups = [...props.modelValue]
  const updatedChecked = new Set(props.checked)
  let checkedChanged = false

  for (let i = 0; i < newGroups.length; i++) {
    const loadingListNo = newGroups[i].loadingListNo
    if (loadingListNo in vehicleMap) {
      const vehicleNo = vehicleMap[loadingListNo]
      newGroups[i] = { ...newGroups[i], vehicleNo }
      if (vehicleNo && !updatedChecked.has(loadingListNo)) {
        updatedChecked.add(loadingListNo)
        checkedChanged = true
      }
    }
  }

  emit('update:modelValue', newGroups)
  if (checkedChanged) {
    emit('update:checked', updatedChecked)
  }
}

// 更新订单视角下某个项次的字段（billNo、colorMark 等）
function handleOrderItemFieldUpdate(orderKey: string, orderItemNo: string, field: string, value: string) {
  const order = uniqueOrders.value.find(o => o.key === orderKey)
  if (!order) return

  const item = order.items.find(i => i.orderItemNo === orderItemNo)
  if (!item) return

  const newGroups = [...props.modelValue]
  for (const occ of item.occurrences) {
    const group = { ...newGroups[occ.groupIndex] }
    const rows = [...group.rows]
    rows[occ.rowIndex] = { ...rows[occ.rowIndex], [field]: value }
    group.rows = rows
    newGroups[occ.groupIndex] = group
  }
  emit('update:modelValue', newGroups)
}

// 批量更新订单视角下多个项次的字段（一次 emit，避免多次更新互相覆盖）
function handleBatchOrderItemFieldUpdate(orderKey: string, updates: Array<{ orderItemNo: string, field: string, value: string }>) {
  const order = uniqueOrders.value.find(o => o.key === orderKey)
  if (!order) return

  const newGroups = [...props.modelValue]
  for (const { orderItemNo, field, value } of updates) {
    const item = order.items.find(i => i.orderItemNo === orderItemNo)
    if (!item) continue
    for (const occ of item.occurrences) {
      const group = { ...newGroups[occ.groupIndex] }
      const rows = [...group.rows]
      rows[occ.rowIndex] = { ...rows[occ.rowIndex], [field]: value }
      group.rows = rows
      newGroups[occ.groupIndex] = group
    }
  }
  emit('update:modelValue', newGroups)
}

function handleBatchFillContract(groupIndex: number, contractNo: string) {
  const newGroups = [...props.modelValue]
  const group = { ...newGroups[groupIndex] }
  group.rows = group.rows.map(row => ({ ...row, contractNo }))
  newGroups[groupIndex] = group
  emit('update:modelValue', newGroups)
}

function handleToggleCheck(loadingListNo: string) {
  const updated = new Set(props.checked)
  if (updated.has(loadingListNo)) {
    updated.delete(loadingListNo)
  }
  else {
    updated.add(loadingListNo)
  }
  emit('update:checked', updated)
}

function handleToggleCheckAll() {
  const allNos = props.modelValue.map(g => g.loadingListNo)
  const allChecked = allNos.every(no => props.checked.has(no))
  const updated = new Set(props.checked)
  if (allChecked) {
    for (const no of allNos) {
      updated.delete(no)
    }
  }
  else {
    for (const no of allNos) {
      updated.add(no)
    }
  }
  emit('update:checked', updated)
}

function handleDeleteGroup(loadingListNo: string) {
  const newGroups = props.modelValue.filter(g => g.loadingListNo !== loadingListNo)
  emit('update:modelValue', newGroups)

  const updated = new Set(props.checked)
  updated.delete(loadingListNo)
  emit('update:checked', updated)

  // If deleted group was selected, select the first remaining
  if (selectedLoadingListNo.value === loadingListNo) {
    selectedLoadingListNo.value = newGroups.length > 0 ? newGroups[0].loadingListNo : ''
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Two-column layout -->
    <div class="flex-1 min-h-0 flex border rounded-lg overflow-hidden">
      <!-- Left panel (fixed 280px) -->
      <div class="w-[280px] flex-shrink-0">
        <EditorLeftPanel
          :active-tab="activeTab"
          :groups="modelValue"
          :unique-orders="uniqueOrders"
          :selected-loading-list-no="selectedLoadingListNo"
          :selected-order-key="selectedOrderKey"
          :search-query="searchQuery"
          :checked-set="checked"
          :readonly="readonly"
          @update:active-tab="activeTab = $event"
          @update:search-query="searchQuery = $event"
          @select-loading-list="selectedLoadingListNo = $event"
          @select-order="selectedOrderKey = $event"
          @toggle-check="handleToggleCheck"
          @toggle-check-all="handleToggleCheckAll"
          @delete-group="handleDeleteGroup"
        />
      </div>

      <!-- Right panel (flex-1) -->
      <div class="flex-1 min-w-0 min-h-0 overflow-hidden">
        <!-- Loading list detail view -->
        <EditorDetailLoadingList
          v-if="activeTab === 'loadingList' && selectedGroup"
          :group="selectedGroup"
          :group-index="selectedGroupIndex"
          :readonly="readonly"
          @update-vehicle="handleUpdateVehicle"
          @update-cell="handleUpdateCell"
          @drag-fill="handleDragFill"
          @batch-fill-contract="handleBatchFillContract"
        />

        <!-- Order detail view -->
        <EditorDetailOrder
          v-else-if="activeTab === 'order' && selectedOrder"
          :order="selectedOrder"
          :readonly="readonly"
          @update-contract-no="handleOrderContractNoUpdate"
          @update-vehicle-no="handleOrderVehicleNoUpdate"
          @update-vehicle-no-map="handleOrderVehicleNoMapUpdate"
          @update-item-field="handleOrderItemFieldUpdate"
          @batch-update-item-field="handleBatchOrderItemFieldUpdate"
        />

        <!-- Empty state -->
        <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
          <span v-if="activeTab === 'loadingList'">请从左侧选择一个装车单</span>
          <span v-else>请从左侧选择一个订单</span>
        </div>
      </div>
    </div>
  </div>
</template>
