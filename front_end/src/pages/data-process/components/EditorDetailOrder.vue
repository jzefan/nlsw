<script setup lang="ts">
import { ClipboardPaste, FileText, Truck } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'

import type { UniqueOrder } from './EditorLeftPanel.vue'

const props = defineProps<{
  order: UniqueOrder
}>()

const emit = defineEmits<{
  (e: 'update-contract-no', orderKey: string, contractNo: string): void
  (e: 'update-vehicle-no', orderKey: string, vehicleNo: string): void
}>()

// Contract number batch state
const contractBatchValue = ref('')
const showContractBatchDialog = ref(false)
const contractBatchInputRef = ref<{ $el: HTMLInputElement } | null>(null)

// Vehicle number batch state
const vehicleBatchValue = ref('')
const showVehicleBatchDialog = ref(false)
const vehicleBatchInputRef = ref<{ $el: HTMLInputElement } | null>(null)

// Collect all unique loadingListNos with their vehicleNo across all items
function allOccurrences() {
  const map = new Map<string, { loadingListNo: string, vehicleNo: string, totalQuantity: number, totalWeight: number }>()
  for (const item of props.order.items) {
    for (const occ of item.occurrences) {
      const existing = map.get(occ.loadingListNo)
      if (existing) {
        existing.totalQuantity += occ.quantity
        existing.totalWeight += occ.weight
        // Update vehicleNo to latest
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

// Contract batch handlers
function openContractBatchDialog() {
  // Use first item's contractNo as default
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
  vehicleBatchValue.value = occs.find(o => o.vehicleNo)?.vehicleNo ?? ''
  showVehicleBatchDialog.value = true
  nextTick(() => {
    const el = vehicleBatchInputRef.value?.$el as HTMLInputElement | undefined
    el?.focus()
    el?.select()
  })
}

function confirmVehicleBatch() {
  emit('update-vehicle-no', props.order.key, vehicleBatchValue.value)
  showVehicleBatchDialog.value = false
}
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-4 overflow-y-auto">
    <!-- Order info header -->
    <div class="flex items-center gap-2 text-sm font-medium">
      <FileText class="w-4 h-4" />
      <span>订单 {{ order.orderNo }}</span>
      <span class="text-muted-foreground font-normal">{{ order.customerName }}</span>
      <span class="ml-auto text-xs text-muted-foreground font-normal">
        {{ order.items.length }} 个项次 | {{ order.totalQuantity }} 件 | {{ order.totalWeight.toFixed(3) }} 吨
      </span>
    </div>

    <!-- Batch operation bar -->
    <div class="flex items-center gap-3">
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
        <ClipboardPaste class="w-3.5 h-3.5" />
        <span>批量设置车船号</span>
      </button>
      <p class="text-[11px] text-muted-foreground ml-auto">
        应用到此订单下所有项次和装车单
      </p>
    </div>

    <!-- Items table -->
    <div class="border rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-muted/50 text-muted-foreground">
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">项次号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">牌号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">定尺</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">厚度</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">宽度</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">长度</th>
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
              <td class="px-3 py-2">{{ item.fixedLength }}</td>
              <td class="px-3 py-2">{{ item.thickness }}</td>
              <td class="px-3 py-2">{{ item.width }}</td>
              <td class="px-3 py-2">{{ item.length }}</td>
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
    <div>
      <div class="text-sm font-medium mb-2">所在装车单 ({{ allOccurrences().length }})</div>
      <div class="space-y-1">
        <div
          v-for="occ in allOccurrences()"
          :key="occ.loadingListNo"
          class="flex items-center justify-between p-2 border rounded-md text-xs"
        >
          <div class="flex items-center gap-1.5">
            <Truck class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="font-medium">{{ occ.loadingListNo }}</span>
          </div>
          <div class="flex items-center gap-3 text-muted-foreground">
            <template v-if="occ.vehicleNo">
              <span class="text-blue-600 dark:text-blue-400">{{ occ.vehicleNo }}</span>
            </template>
            <UiBadge v-else variant="outline" class="text-[10px] h-4 px-1 text-orange-500 border-orange-300">
              未选车
            </UiBadge>
            <span>{{ occ.totalQuantity }} 件</span>
            <span>{{ occ.totalWeight.toFixed(3) }} 吨</span>
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

    <!-- Batch Vehicle Dialog -->
    <UiDialog v-model:open="showVehicleBatchDialog">
      <UiDialogContent class="max-w-sm">
        <UiDialogHeader>
          <UiDialogTitle class="text-base">批量设置车船号</UiDialogTitle>
          <UiDialogDescription>
            将所有包含订单 {{ order.orderNo }} 的装车单的车船号设为统一值
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-3">
          <UiInput
            ref="vehicleBatchInputRef"
            v-model="vehicleBatchValue"
            placeholder="输入车船号"
            @keydown.enter="confirmVehicleBatch"
          />
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showVehicleBatchDialog = false">取消</UiButton>
          <UiButton size="sm" @click="confirmVehicleBatch">确定</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
