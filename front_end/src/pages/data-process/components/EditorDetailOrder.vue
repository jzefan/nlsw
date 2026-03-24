<script setup lang="ts">
import { ClipboardPaste, FileText, Truck } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { getVehicles } from '@/services/api/data-dict.api'
import { getOrderBills } from '@/services/api/invoice.api'

import type { UniqueOrder } from './EditorLeftPanel.vue'

// 色号选项
const COLOR_LIST = ['白', '红', '蓝', '绿', '黄']
const colorOptions = (() => {
  const opts: string[] = []
  for (const c of COLOR_LIST) opts.push(c)
  for (const c1 of COLOR_LIST) {
    for (const c2 of COLOR_LIST) {
      opts.push(`${c1}/${c2}`)
    }
  }
  return opts
})()

// 提单号缓存（按订单号）
const billOptionsCache = ref<Record<string, string[]>>({})

async function loadBillOptions(orderNo: string) {
  if (billOptionsCache.value[orderNo]) {
    // 缓存已存在，仍然尝试自动选中
    autoSelectSingleBill(orderNo)
    return
  }
  try {
    const result = await getOrderBills('', orderNo, undefined, true)
    if (result.ok && result.data) {
      const billNos = [...new Set(result.data.map((b: any) => b.bill_no).filter(Boolean))]
      billOptionsCache.value = { ...billOptionsCache.value, [orderNo]: billNos }
      await nextTick()
      autoSelectSingleBill(orderNo)
    }
  } catch {
    billOptionsCache.value = { ...billOptionsCache.value, [orderNo]: [] }
  }
}

// 只有一个提单时，自动为所有未选提单的项次赋值（批量更新，避免多次 emit 互相覆盖）
function autoSelectSingleBill(orderNo: string) {
  const billNos = billOptionsCache.value[orderNo]
  if (!billNos || billNos.length !== 1) return
  const billNo = billNos[0]
  const updates: Array<{ orderItemNo: string, field: string, value: string }> = []
  for (const item of props.order.items) {
    if (!item.billNo) {
      updates.push({ orderItemNo: item.orderItemNo, field: 'billNo', value: billNo })
    }
  }
  if (updates.length > 0) {
    emit('batch-update-item-field', props.order.key, updates)
  }
}

const props = defineProps<{
  order: UniqueOrder
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update-contract-no', orderKey: string, contractNo: string): void
  (e: 'update-vehicle-no', orderKey: string, vehicleNo: string): void
  (e: 'update-vehicle-no-map', orderKey: string, map: Record<string, string>): void
  (e: 'update-item-field', orderKey: string, orderItemNo: string, field: string, value: string): void
  (e: 'batch-update-item-field', orderKey: string, updates: Array<{ orderItemNo: string, field: string, value: string }>): void
}>()

// 切换订单时自动加载提单列表（如果只有一个提单则自动选中）
watch(() => props.order.orderNo, (orderNo) => {
  if (orderNo && !props.readonly) {
    loadBillOptions(orderNo)
  }
}, { immediate: true })

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
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">规格</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">件数</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">重量(吨)</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">捆号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">提单号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">牌号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">合同号</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap bg-green-50 dark:bg-green-950/30">色号</th>
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
              <td class="px-3 py-2 whitespace-nowrap">{{ item.thickness }}*{{ item.width }}*{{ item.length }}</td>
              <td class="px-3 py-2 text-right">{{ item.totalQuantity }}</td>
              <td class="px-3 py-2 text-right">{{ item.totalWeight.toFixed(3) }}</td>
              <td class="px-3 py-2 text-xs text-muted-foreground">{{ item.bundleNo }}</td>
              <td class="px-3 py-2">
                <template v-if="!readonly">
                  <select
                    class="w-full h-7 px-1 text-xs bg-transparent border rounded outline-none min-w-[100px]"
                    :value="item.billNo || ''"
                    @focus="loadBillOptions(order.orderNo)"
                    @change="emit('update-item-field', order.key, item.orderItemNo, 'billNo', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">选择提单</option>
                    <option v-for="bn in (billOptionsCache[order.orderNo] || [])" :key="bn" :value="bn">{{ bn }}</option>
                  </select>
                </template>
                <template v-else>{{ item.billNo || '-' }}</template>
              </td>
              <td class="px-3 py-2">{{ item.brandNo }}</td>
              <td class="px-3 py-2">
                <template v-if="item.contractNo">
                  <span class="text-green-600 dark:text-green-400">{{ item.contractNo }}</span>
                </template>
                <UiBadge v-else variant="outline" class="text-[10px] h-4 px-1 text-orange-500 border-orange-300">
                  无合同号
                </UiBadge>
              </td>
              <td class="px-3 py-2 bg-green-50/50 dark:bg-green-950/20">
                <template v-if="!readonly">
                  <select
                    class="w-full h-7 px-1 text-xs bg-transparent border rounded outline-none min-w-[80px]"
                    :value="item.colorMark || ''"
                    :disabled="!item.contractNo"
                    :class="{ 'opacity-40 cursor-not-allowed': !item.contractNo }"
                    :title="!item.contractNo ? '请先填写合同号' : ''"
                    @change="emit('update-item-field', order.key, item.orderItemNo, 'colorMark', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">-</option>
                    <option v-for="c in colorOptions" :key="c" :value="c">{{ c }}</option>
                  </select>
                </template>
                <template v-else>{{ item.colorMark || '-' }}</template>
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
      <UiDialogContent class="max-w-4xl">
        <UiDialogHeader>
          <UiDialogTitle class="text-base">设置车船号</UiDialogTitle>
          <UiDialogDescription>
            为订单 {{ order.orderNo }} 所在的每个装车单设置车船号
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-2 space-y-3 max-h-[50vh] overflow-y-auto">
          <div
            v-for="occ in allOccurrences()"
            :key="occ.loadingListNo"
            class="flex items-center gap-3 text-sm"
          >
            <div class="flex items-center gap-1.5 shrink-0">
              <Truck class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span class="font-medium">{{ occ.loadingListNo }}</span>
            </div>
            <span class="text-xs text-muted-foreground whitespace-nowrap">{{ occ.totalQuantity }}件 {{ occ.totalWeight.toFixed(3) }}t</span>
            <div class="flex-1" />
            <SearchableCombobox
              :model-value="vehicleFormMap[occ.loadingListNo] || ''"
              placeholder="选择车船号"
              :search-fn="searchVehicles"
              class="w-56 shrink-0"
              @update:model-value="vehicleFormMap[occ.loadingListNo] = $event as string"
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
