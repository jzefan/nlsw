<script setup lang="ts">
import { ClipboardPaste, FileText, Truck } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { getVehicles } from '@/services/api/data-dict.api'

import type { UniqueOrder } from './EditorLeftPanel.vue'

const props = defineProps<{
  order: UniqueOrder
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update-contract-no', orderKey: string, contractNo: string): void
  (e: 'update-vehicle-no', orderKey: string, vehicleNo: string): void
  (e: 'update-vehicle-no-map', orderKey: string, map: Record<string, string>): void
}>()

// Contract number batch state
const contractBatchValue = ref('')
const showContractBatchDialog = ref(false)
const contractBatchInputRef = ref<{ $el: HTMLInputElement } | null>(null)

// Vehicle number batch state
const showVehicleBatchDialog = ref(false)
const vehicleFormMap = ref<Record<string, string>>({})

// Collect all unique loadingListNos with their vehicleNo across all items
function allOccurrences() {
  const map = new Map<string, { loadingListNo: string, vehicleNo: string, totalQuantity: number, totalWeight: number }>()
  for (const item of props.order.items) {
    for (const occ of item.occurrences) {
      const existing = map.get(occ.loadingListNo)
      if (existing) {
        existing.totalQuantity += occ.quantity
        existing.totalWeight += occ.weight
        if (occ.vehicleNo) existing.vehicleNo = occ.vehicleNo
      }
      else {
        map.set(occ.loadingListNo, {
          loadingListNo: occ.loadingListNo,
          vehicleNo: occ.vehicleNo,
          totalQuantity: occ.quantity,
          totalWeight: occ.weight,
        })
      }
    }
  }
  return Array.from(map.values())
}

// Vehicle search function
async function searchVehicles(search: string, limit: number, page: number) {
  const result = await getVehicles({ search, limit, page })
  return {
    ok: result.ok ?? true,
    data: (result.data || []).map((v: any) => ({
      name: v.name,
      value: v.name,
    })),
    total: result.total || 0,
  }
}

// Contract batch handlers
function openContractBatchDialog() {
  contractBatchValue.value = props.order.items.find(i => i.contractNo)?.contractNo ?? ''
  showContractBatchDialog.value = true
  nextTick(() => {
    const el = contractBatchInputRef.value?.$el as HTMLInputElement | undefined
    el?.focus()
    el?.select()
  })
}

function confirmContractBatch() {
  emit('update-contract-no', props.order.key, contractBatchValue.value)
  showContractBatchDialog.value = false
}

// Vehicle batch handlers
function openVehicleBatchDialog() {
  const occs = allOccurrences()
  const map: Record<string, string> = {}
  for (const occ of occs) {
    map[occ.loadingListNo] = occ.vehicleNo || ''
  }
  vehicleFormMap.value = map
  showVehicleBatchDialog.value = true
}

function confirmVehicleBatch() {
  emit('update-vehicle-no-map', props.order.key, { ...vehicleFormMap.value })
  showVehicleBatchDialog.value = false
}
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-3">
    <!-- Order info header + actions -->
    <div class="flex items-center gap-2 text-sm flex-shrink-0">
      <FileText class="w-4 h-4 flex-shrink-0" />
      <span class="font-medium">{{ order.orderNo }}</span>
      <span class="text-muted-foreground">{{ order.customerName }}</span>
      <span class="text-xs text-muted-foreground">
        {{ order.items.length }} 个项次 | {{ order.totalQuantity }} 件 | {{ order.totalWeight.toFixed(3) }} 吨
      </span>
      <div v-if="!readonly" class="ml-auto flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50 transition-colors"
          @click="openContractBatchDialog"
        >
          <ClipboardPaste class="w-3.5 h-3.5" />
          <span>批量设置合同号</span>
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
          @click="openVehicleBatchDialog"
        >
          <Truck class="w-3.5 h-3.5" />
          <span>设置车船号</span>
        </button>
      </div>
    </div>

    <!-- Items table (scrollable) -->
    <div class="flex-1 min-h-0 border rounded-lg overflow-hidden">
      <div class="h-full overflow-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-muted/50 text-muted-foreground">
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">项次号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">牌号</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">厚/直径</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">宽</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">长</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">件数</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">重量(吨)</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">合同号</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">装车单数</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in order.items"
              :key="item.orderItemNo"
              class="border-t hover:bg-muted/30 transition-colors"
            >
              <td class="px-3 py-2 font-medium">{{ item.orderItemNo }}</td>
              <td class="px-3 py-2">{{ item.brandNo }}</td>
              <td class="px-3 py-2 text-right">{{ item.thickness }}</td>
              <td class="px-3 py-2 text-right">{{ item.width }}</td>
              <td class="px-3 py-2 text-right">{{ item.length }}</td>
              <td class="px-3 py-2 text-right">{{ item.totalQuantity }}</td>
              <td class="px-3 py-2 text-right">{{ item.totalWeight.toFixed(3) }}</td>
              <td class="px-3 py-2">
                <template v-if="item.contractNo">
                  <span class="text-green-600 dark:text-green-400">{{ item.contractNo }}</span>
                </template>
                <UiBadge v-else variant="outline" class="text-[10px] h-4 px-1 text-orange-500 border-orange-300">
                  无合同号
                </UiBadge>
              </td>
              <td class="px-3 py-2 text-right">{{ item.occurrences.length }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Occurrences: loading lists containing this order -->
    <div class="min-h-0 max-h-[30%] flex flex-col">
      <div class="text-sm font-medium mb-2 flex-shrink-0">所在装车单 ({{ allOccurrences().length }})</div>
      <div class="flex flex-wrap gap-2 overflow-y-auto min-h-0">
        <div
          v-for="occ in allOccurrences()"
          :key="occ.loadingListNo"
          class="p-2 border rounded-lg text-xs"
        >
          <div class="flex items-center gap-1.5 font-medium">
            <Truck class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span>{{ occ.loadingListNo }}</span>
          </div>
          <div class="flex items-center gap-2 mt-1 pl-5 text-muted-foreground">
            <template v-if="occ.vehicleNo">
              <span class="text-blue-600 dark:text-blue-400">{{ occ.vehicleNo }}</span>
            </template>
            <UiBadge v-else variant="outline" class="text-[10px] h-4 px-1 text-orange-500 border-orange-300">
              未选车
            </UiBadge>
            <span>{{ occ.totalQuantity }}件/{{ occ.totalWeight.toFixed(3) }}t</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Contract Dialog -->
    <UiDialog v-model:open="showContractBatchDialog">
      <UiDialogContent class="max-w-sm">
        <UiDialogHeader>
          <UiDialogTitle class="text-base">批量设置合同号</UiDialogTitle>
          <UiDialogDescription>
            将订单 {{ order.orderNo }} 下所有项次在所有装车单中的合同号设为统一值
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-3">
          <UiInput
            ref="contractBatchInputRef"
            v-model="contractBatchValue"
            placeholder="输入合同号"
            @keydown.enter="confirmContractBatch"
          />
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showContractBatchDialog = false">取消</UiButton>
          <UiButton size="sm" @click="confirmContractBatch">确定</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Batch Vehicle Dialog (per loading list) -->
    <UiDialog v-model:open="showVehicleBatchDialog">
      <UiDialogContent class="max-w-lg">
        <UiDialogHeader>
          <UiDialogTitle class="text-base">设置车船号</UiDialogTitle>
          <UiDialogDescription>
            为订单 {{ order.orderNo }} 所在的每个装车单设置车船号
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-2 space-y-3 max-h-[40vh] overflow-y-auto">
          <div
            v-for="occ in allOccurrences()"
            :key="occ.loadingListNo"
            class="flex items-center gap-3 text-sm"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <Truck class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span class="font-medium truncate">{{ occ.loadingListNo }}</span>
            </div>
            <span class="text-xs text-muted-foreground whitespace-nowrap">{{ occ.totalQuantity }}件 {{ occ.totalWeight.toFixed(3) }}t</span>
            <SearchableCombobox
              :model-value="vehicleFormMap[occ.loadingListNo] || ''"
              placeholder="选择车船号"
              :search-fn="searchVehicles"
              class="w-48 flex-shrink-0 ml-auto"
              @update:model-value="vehicleFormMap[occ.loadingListNo] = $event"
            />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showVehicleBatchDialog = false">取消</UiButton>
          <UiButton size="sm" @click="confirmVehicleBatch">确定</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
