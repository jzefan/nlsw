<script setup lang="ts">
import { ClipboardPaste, Truck } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { getVehicles } from '@/services/api/data-dict.api'
import type { LoadingListGroup } from '@/utils/excel-transform'

const props = defineProps<{
  group: LoadingListGroup
  groupIndex: number
}>()

const emit = defineEmits<{
  (e: 'update-vehicle', groupIndex: number, vehicleNo: string): void
  (e: 'update-cell', groupIndex: number, rowIndex: number, field: string, value: string | number): void
  (e: 'drag-fill', groupIndex: number, startRow: number, endRow: number, field: string, value: string): void
  (e: 'batch-fill-contract', groupIndex: number, contractNo: string): void
}>()

// Editing state (for quantity / weight)
const editingCell = ref<{ rowIndex: number, field: string } | null>(null)
const editingValue = ref('')

// ContractNo: always-visible inline inputs (uncontrolled — value managed via refs, not :value)
const contractNoRefs = ref<Record<number, HTMLInputElement>>({})
const focusedContractNoRow = ref<number | null>(null)

// Sync input values from props, but skip the focused row to avoid overwriting user input
watch(() => props.group, () => {
  for (let i = 0; i < props.group.rows.length; i++) {
    const input = contractNoRefs.value[i]
    if (input && focusedContractNoRow.value !== i) {
      input.value = props.group.rows[i].contractNo
    }
  }
}, { deep: true, flush: 'post' })

// Batch fill dialog
const showBatchFillDialog = ref(false)
const batchFillValue = ref('')
const batchFillInputRef = ref<HTMLInputElement | null>(null)

function openBatchFillDialog() {
  batchFillValue.value = ''
  showBatchFillDialog.value = true
  nextTick(() => batchFillInputRef.value?.focus())
}

function confirmBatchFill() {
  emit('batch-fill-contract', props.groupIndex, batchFillValue.value)
  showBatchFillDialog.value = false
}

// Hover state for fill handle
const hoveredCell = ref<{ rowIndex: number, field: string } | null>(null)

// Drag-to-copy state
const isDragging = ref(false)
const dragStartCell = ref<{ rowIndex: number, field: string } | null>(null)
const dragEndRow = ref<number | null>(null)

// Scroll container ref for auto-scroll during drag
const scrollContainerRef = ref<HTMLElement | null>(null)
const scrollInterval = ref<number | null>(null)

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

// Inline editing
function startEdit(rowIndex: number, field: string, currentValue: any) {
  editingCell.value = { rowIndex, field }
  editingValue.value = String(currentValue ?? '')
}

function saveEdit() {
  if (!editingCell.value) return
  const { rowIndex, field } = editingCell.value
  const value = ['quantity', 'weight'].includes(field)
    ? Number.parseFloat(editingValue.value) || 0
    : editingValue.value
  emit('update-cell', props.groupIndex, rowIndex, field, value)
  editingCell.value = null
}

function cancelEdit() {
  editingCell.value = null
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    saveEdit()
  }
  else if (e.key === 'Escape') {
    cancelEdit()
  }
}

function isEditing(rowIndex: number, field: string): boolean {
  return editingCell.value?.rowIndex === rowIndex && editingCell.value?.field === field
}

function formatNumber(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}

// ContractNo inline input handlers
function handleContractNoFocus(rowIndex: number) {
  focusedContractNoRow.value = rowIndex
}

function handleContractNoBlur(rowIndex: number, event: FocusEvent) {
  const input = event.target as HTMLInputElement
  emit('update-cell', props.groupIndex, rowIndex, 'contractNo', input.value)
  focusedContractNoRow.value = null
}

function handleContractNoKeydown(event: KeyboardEvent, rowIndex: number) {
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    const input = event.target as HTMLInputElement
    const currentVal = props.group.rows[rowIndex]?.contractNo ?? ''
    if (input.value !== currentVal) {
      emit('update-cell', props.groupIndex, rowIndex, 'contractNo', input.value)
    }
    const nextIdx = rowIndex + 1
    if (nextIdx < props.group.rows.length) {
      nextTick(() => {
        nextTick(() => {
          const nextInput = contractNoRefs.value[nextIdx]
          nextInput?.focus()
          nextInput?.select()
        })
      })
    }
    else {
      input.blur()
    }
  }
  else if (event.key === 'Escape') {
    const input = event.target as HTMLInputElement
    input.value = props.group.rows[rowIndex]?.contractNo ?? ''
    input.blur()
  }
}

// Hover state
function handleCellMouseEnter(rowIndex: number, field: string) {
  if (!isDragging.value) {
    hoveredCell.value = { rowIndex, field }
  }
}

function handleCellMouseLeave() {
  if (!isDragging.value) {
    hoveredCell.value = null
  }
}

// Drag-to-copy for contractNo
function startDrag(rowIndex: number, field: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  const currentValue = (props.group.rows[rowIndex] as any)[field]
  if (!currentValue) return

  isDragging.value = true
  dragStartCell.value = { rowIndex, field }
  dragEndRow.value = rowIndex

  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent) {
  if (!isDragging.value || !dragStartCell.value) return

  const target = e.target as HTMLElement
  const row = target.closest('tr[data-row-index]')
  if (row) {
    const rowIndex = Number.parseInt(row.getAttribute('data-row-index') || '0')
    dragEndRow.value = rowIndex
  }

  // Auto-scroll
  const container = scrollContainerRef.value
  if (!container) return

  const rect = container.getBoundingClientRect()
  if (scrollInterval.value) {
    clearInterval(scrollInterval.value)
    scrollInterval.value = null
  }

  if (e.clientY > rect.bottom - 50) {
    scrollInterval.value = window.setInterval(() => { container.scrollTop += 10 }, 16)
  }
  else if (e.clientY < rect.top + 50) {
    scrollInterval.value = window.setInterval(() => { container.scrollTop -= 10 }, 16)
  }
}

function handleDragEnd() {
  if (scrollInterval.value) {
    clearInterval(scrollInterval.value)
    scrollInterval.value = null
  }

  if (!isDragging.value || !dragStartCell.value || dragEndRow.value === null) {
    resetDragState()
    return
  }

  const { rowIndex: startRow, field } = dragStartCell.value
  const endRow = dragEndRow.value

  if (endRow > startRow) {
    const sourceValue = (props.group.rows[startRow] as any)[field]
    emit('drag-fill', props.groupIndex, startRow, endRow, field, sourceValue)
  }

  resetDragState()
}

function resetDragState() {
  isDragging.value = false
  dragStartCell.value = null
  dragEndRow.value = null
  hoveredCell.value = null
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

function isInDragRange(rowIndex: number, field: string): boolean {
  if (!isDragging.value || !dragStartCell.value || dragEndRow.value === null) return false
  return dragStartCell.value.field === field
    && rowIndex >= dragStartCell.value.rowIndex
    && rowIndex <= dragEndRow.value
}

function getContractNoCellClass(rowIndex: number): string {
  const baseClass = 'p-0 pr-1 cursor-cell relative min-w-[200px] bg-yellow-50 dark:bg-yellow-950/30'
  const isFocused = focusedContractNoRow.value === rowIndex
  const isHovered = hoveredCell.value?.rowIndex === rowIndex && hoveredCell.value?.field === 'contractNo'
  const inRange = isInDragRange(rowIndex, 'contractNo')

  if (inRange) {
    const isStart = dragStartCell.value?.rowIndex === rowIndex
    const isEnd = dragEndRow.value === rowIndex
    let borderClass = 'bg-blue-100 dark:bg-blue-900/30'
    if (isStart || isEnd) {
      borderClass += ' ring-2 ring-blue-500 ring-inset'
    }
    else {
      borderClass += ' ring-1 ring-blue-400 ring-inset'
    }
    return `${baseClass} ${borderClass}`
  }

  if (isFocused) {
    return `${baseClass} ring-2 ring-blue-500 ring-inset bg-yellow-100 dark:bg-yellow-950/50`
  }

  if (isHovered && !isDragging.value) {
    return `${baseClass} ring-1 ring-gray-400 ring-inset`
  }

  return baseClass
}

function showFillHandle(rowIndex: number): boolean {
  const isHovered = hoveredCell.value?.rowIndex === rowIndex && hoveredCell.value?.field === 'contractNo'
  const isFocused = focusedContractNoRow.value === rowIndex
  const hasValue = !!props.group.rows[rowIndex]?.contractNo
  return isHovered && !isFocused && hasValue && !isDragging.value
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header: loading list no + vehicle selector + stats -->
    <div class="flex items-center gap-3 p-3 bg-muted/20 border-b flex-shrink-0">
      <div class="flex items-center gap-2 font-medium text-sm">
        <Truck class="w-4 h-4" />
        <span>{{ group.loadingListNo }}</span>
      </div>
      <div class="flex items-center gap-2 ml-4">
        <span class="text-sm whitespace-nowrap">车船号:</span>
        <SearchableCombobox
          :model-value="group.vehicleNo"
          placeholder="选择车船号"
          :search-fn="searchVehicles"
          class="w-52"
          @update:model-value="emit('update-vehicle', groupIndex, $event)"
        />
        <span v-if="!group.vehicleNo" class="text-sm text-orange-500">请选择车号</span>
      </div>
      <div class="flex items-center gap-3 text-sm text-muted-foreground ml-auto">
        <span>{{ group.rows.length }} 条</span>
        <span>{{ group.subtotalQuantity }} 件</span>
        <span>{{ group.subtotalWeight.toFixed(3) }} 吨</span>
      </div>
    </div>

    <!-- Data table -->
    <div ref="scrollContainerRef" class="flex-1 min-h-0 overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/30 sticky top-0 z-10">
          <tr>
            <th class="p-2 text-left whitespace-nowrap">订单号</th>
            <th class="p-2 text-left whitespace-nowrap">项次号</th>
            <th class="p-2 text-right whitespace-nowrap">发运数</th>
            <th class="p-2 text-right whitespace-nowrap">发运重量</th>
            <th class="p-2 text-left whitespace-nowrap">牌号</th>
            <th class="p-2 text-left whitespace-nowrap">定尺</th>
            <th class="p-2 text-left whitespace-nowrap">客户名称</th>
            <th class="p-2 pr-4 text-left whitespace-nowrap bg-yellow-50 dark:bg-yellow-950/30">
              <div class="flex items-center justify-between">
                <span>合同号</span>
                <button
                  class="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  @click="openBatchFillDialog"
                >
                  <ClipboardPaste class="w-3 h-3" />
                  批量输入
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rIdx) in group.rows"
            :key="`${row.orderNo}-${row.orderItemNo}-${rIdx}`"
            :data-row-index="rIdx"
            class="border-t hover:bg-muted/30"
          >
            <td class="p-2">{{ row.orderNo }}</td>
            <td class="p-2">{{ row.orderItemNo }}</td>

            <!-- Quantity -->
            <td
              class="p-2 text-right cursor-pointer hover:bg-muted/50"
              @click="startEdit(rIdx, 'quantity', row.quantity)"
            >
              <template v-if="isEditing(rIdx, 'quantity')">
                <UiInput
                  v-model="editingValue"
                  type="number"
                  class="h-7 w-16 text-right"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.quantity }}
              </template>
            </td>

            <!-- Weight -->
            <td
              class="p-2 text-right cursor-pointer hover:bg-muted/50"
              @click="startEdit(rIdx, 'weight', row.weight)"
            >
              <template v-if="isEditing(rIdx, 'weight')">
                <UiInput
                  v-model="editingValue"
                  type="number"
                  step="0.001"
                  class="h-7 w-24 text-right"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ formatNumber(row.weight) }}
              </template>
            </td>

            <td class="p-2">{{ row.brandNo }}</td>
            <td class="p-2">{{ row.fixedLength }}</td>
            <td class="p-2">{{ row.customerName }}</td>

            <!-- Contract No (inline input with drag-fill) -->
            <td
              :class="getContractNoCellClass(rIdx)"
              @mouseenter="handleCellMouseEnter(rIdx, 'contractNo')"
              @mouseleave="handleCellMouseLeave"
            >
              <input
                :ref="(el) => { if (el) contractNoRefs[rIdx] = el as HTMLInputElement }"
                class="w-full h-full px-2 py-1.5 pr-4 bg-transparent outline-none text-sm placeholder:text-muted-foreground placeholder:italic"
                placeholder="输入合同号"
                @focus="handleContractNoFocus(rIdx)"
                @blur="handleContractNoBlur(rIdx, $event)"
                @keydown="handleContractNoKeydown($event, rIdx)"
              >
              <!-- Fill handle -->
              <div
                v-if="showFillHandle(rIdx)"
                class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-600 cursor-crosshair border border-white shadow-sm translate-x-[1px] translate-y-[1px] hover:w-3 hover:h-3 hover:bg-blue-700 transition-all"
                title="拖动复制到下方行"
                @mousedown="startDrag(rIdx, 'contractNo', $event)"
              />
            </td>
          </tr>
        </tbody>
        <tfoot class="bg-muted/50">
          <tr>
            <td colspan="2" class="p-2 font-medium">
              小计
            </td>
            <td class="p-2 text-right font-medium">
              {{ group.subtotalQuantity }}
            </td>
            <td class="p-2 text-right font-medium">
              {{ group.subtotalWeight.toFixed(3) }}
            </td>
            <td colspan="4" />
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Batch fill dialog -->
    <UiDialog v-model:open="showBatchFillDialog">
      <UiDialogContent class="max-w-sm">
        <UiDialogHeader>
          <UiDialogTitle class="text-base">批量设置合同号</UiDialogTitle>
          <UiDialogDescription>
            将当前装车单 {{ group.loadingListNo }} 下所有订单的合同号设为统一值
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="py-3">
          <UiInput
            ref="batchFillInputRef"
            v-model="batchFillValue"
            placeholder="输入合同号"
            @keydown.enter="confirmBatchFill"
          />
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showBatchFillDialog = false">
            取消
          </UiButton>
          <UiButton size="sm" @click="confirmBatchFill">
            确定
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
