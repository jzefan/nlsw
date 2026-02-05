<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'

import type { AggregatedRow } from '@/utils/excel-transform'

const props = defineProps<{
  modelValue: AggregatedRow[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AggregatedRow[]): void
}>()

// Editing state
const editingCell = ref<{ rowIndex: number, field: string } | null>(null)
const editingValue = ref('')
const contractNoInputRef = ref<{ $el: HTMLInputElement } | null>(null)

// Hover state for showing border and fill handle
const hoveredCell = ref<{ rowIndex: number, field: string } | null>(null)

// Drag-to-copy state
const isDragging = ref(false)
const dragStartCell = ref<{ rowIndex: number, field: string } | null>(null)
const dragEndRow = ref<number | null>(null)

// Scroll container ref for auto-scroll during drag
const scrollContainerRef = ref<HTMLElement | null>(null)
const scrollInterval = ref<number | null>(null)

// Totals
const totalQuantity = computed(() =>
  props.modelValue.reduce((sum, r) => sum + r.quantity, 0),
)
const totalWeight = computed(() =>
  props.modelValue.reduce((sum, r) => sum + r.totalWeight, 0),
)

function startEdit(rowIndex: number, field: string, currentValue: any) {
  editingCell.value = { rowIndex, field }
  editingValue.value = String(currentValue ?? '')
}

function saveEdit() {
  if (!editingCell.value)
    return

  const { rowIndex, field } = editingCell.value
  const newRows = [...props.modelValue]
  const row = { ...newRows[rowIndex] }

  // Handle numeric fields
  if (['unitWeight', 'quantity', 'totalWeight'].includes(field)) {
    (row as any)[field] = Number.parseFloat(editingValue.value) || 0
  }
  else {
    (row as any)[field] = editingValue.value
  }

  newRows[rowIndex] = row
  emit('update:modelValue', newRows)
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
  else if (e.key === 'Tab' && editingCell.value?.field === 'contractNo') {
    // Tab to next row's contractNo
    e.preventDefault()
    const nextIndex = editingCell.value.rowIndex + 1
    saveEdit()
    if (nextIndex < props.modelValue.length) {
      nextTick(() => {
        startEdit(nextIndex, 'contractNo', props.modelValue[nextIndex].contractNo)
        nextTick(() => {
          const inputEl = contractNoInputRef.value?.$el as HTMLInputElement | undefined
          inputEl?.focus()
        })
      })
    }
  }
}

function deleteRow(index: number) {
  const newRows = [...props.modelValue]
  newRows.splice(index, 1)
  emit('update:modelValue', newRows)
}

function isEditing(rowIndex: number, field: string): boolean {
  return editingCell.value?.rowIndex === rowIndex && editingCell.value?.field === field
}

function formatNumber(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}

// Mouse enter/leave for hover state
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

// Click on contractNo cell - enter edit mode and focus input
function handleContractNoClick(rowIndex: number, currentValue: any) {
  startEdit(rowIndex, 'contractNo', currentValue)
  nextTick(() => {
    // UiInput is a component, access the underlying input via $el
    const inputEl = contractNoInputRef.value?.$el as HTMLInputElement | undefined
    inputEl?.focus()
  })
}

function startDrag(rowIndex: number, field: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  // Don't start drag if value is empty
  const currentValue = (props.modelValue[rowIndex] as any)[field]
  if (!currentValue) {
    return
  }

  isDragging.value = true
  dragStartCell.value = { rowIndex, field }
  dragEndRow.value = rowIndex

  // Add global mouse listeners
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent) {
  if (!isDragging.value || !dragStartCell.value)
    return

  // Find the row element under the cursor
  const target = e.target as HTMLElement
  const row = target.closest('tr[data-row-index]')
  if (row) {
    const rowIndex = Number.parseInt(row.getAttribute('data-row-index') || '0')
    dragEndRow.value = rowIndex
  }

  // Auto-scroll when dragging near edges
  const container = scrollContainerRef.value
  if (!container)
    return

  const rect = container.getBoundingClientRect()
  const scrollThreshold = 50 // pixels from edge to start scrolling
  const scrollSpeed = 10 // pixels per frame

  // Clear existing scroll interval
  if (scrollInterval.value) {
    clearInterval(scrollInterval.value)
    scrollInterval.value = null
  }

  // Check if mouse is near bottom edge
  if (e.clientY > rect.bottom - scrollThreshold) {
    scrollInterval.value = window.setInterval(() => {
      container.scrollTop += scrollSpeed
    }, 16)
  }
  // Check if mouse is near top edge
  else if (e.clientY < rect.top + scrollThreshold) {
    scrollInterval.value = window.setInterval(() => {
      container.scrollTop -= scrollSpeed
    }, 16)
  }
}

function handleDragEnd() {
  // Clear scroll interval
  if (scrollInterval.value) {
    clearInterval(scrollInterval.value)
    scrollInterval.value = null
  }

  if (!isDragging.value || !dragStartCell.value || dragEndRow.value === null) {
    isDragging.value = false
    dragStartCell.value = null
    dragEndRow.value = null
    hoveredCell.value = null
    document.removeEventListener('mousemove', handleDragMove)
    document.removeEventListener('mouseup', handleDragEnd)
    return
  }

  const { rowIndex: startRow, field } = dragStartCell.value
  const endRow = dragEndRow.value

  // Only fill downwards
  if (endRow > startRow) {
    const sourceValue = (props.modelValue[startRow] as any)[field]
    const newRows = [...props.modelValue]

    for (let i = startRow + 1; i <= endRow; i++) {
      const row = { ...newRows[i] }
      ;(row as any)[field] = sourceValue
      newRows[i] = row
    }

    emit('update:modelValue', newRows)
  }

  // Reset drag state
  isDragging.value = false
  dragStartCell.value = null
  dragEndRow.value = null
  hoveredCell.value = null

  // Remove global listeners
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

function isInDragRange(rowIndex: number, field: string): boolean {
  if (!isDragging.value || !dragStartCell.value || dragEndRow.value === null)
    return false

  const { rowIndex: startRow, field: dragField } = dragStartCell.value
  return field === dragField && rowIndex >= startRow && rowIndex <= dragEndRow.value
}

function getContractNoCellClass(rowIndex: number): string {
  const baseClass = 'p-2 cursor-cell relative min-w-[200px] bg-yellow-50 dark:bg-yellow-950/30'
  const isEditingThis = isEditing(rowIndex, 'contractNo')
  const isHovered = hoveredCell.value?.rowIndex === rowIndex && hoveredCell.value?.field === 'contractNo'
  const inRange = isInDragRange(rowIndex, 'contractNo')

  if (inRange) {
    // Drag range styling
    const isStart = dragStartCell.value?.rowIndex === rowIndex
    const isEnd = dragEndRow.value === rowIndex
    let borderClass = 'bg-blue-100 dark:bg-blue-900/30'

    if (isStart) {
      borderClass += ' ring-2 ring-blue-500 ring-inset'
    }
    else if (isEnd) {
      borderClass += ' ring-2 ring-blue-500 ring-inset'
    }
    else {
      borderClass += ' ring-1 ring-blue-400 ring-inset'
    }

    return `${baseClass} ${borderClass}`
  }

  // No special styling when editing - just show the input
  if (isEditingThis) {
    return baseClass
  }

  // Hover styling with border and highlight
  if (isHovered && !isDragging.value) {
    return `${baseClass} ring-2 ring-gray-400 ring-inset bg-yellow-100 dark:bg-yellow-950/50`
  }

  return baseClass
}

// Check if fill handle should be visible - only on hover, not when editing
function showFillHandle(rowIndex: number): boolean {
  const isHovered = hoveredCell.value?.rowIndex === rowIndex && hoveredCell.value?.field === 'contractNo'
  const isEditingThis = isEditing(rowIndex, 'contractNo')
  const hasValue = !!props.modelValue[rowIndex]?.contractNo
  return isHovered && !isEditingThis && hasValue && !isDragging.value
}
</script>

<template>
  <div class="h-full flex flex-col gap-2">
    <!-- Editable table -->
    <div ref="scrollContainerRef" class="border rounded-lg overflow-auto flex-1">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 sticky top-0 z-10">
          <tr>
            <th class="p-2 w-10" />
            <th class="p-2 text-left whitespace-nowrap">
              订单号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              项次号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              牌号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              规格
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              单重
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              发运数
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              发运重量
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              仓库
            </th>
            <th class="p-2 text-left whitespace-nowrap bg-yellow-50 dark:bg-yellow-950/30">
              合同号
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in modelValue"
            :key="`${row.orderNo}-${row.orderItemNo}`"
            :data-row-index="index"
            class="border-t hover:bg-muted/30"
          >
            <!-- Delete button -->
            <td class="p-2 text-center">
              <UiButton
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                @click="deleteRow(index)"
              >
                <Trash2 class="w-4 h-4" />
              </UiButton>
            </td>

            <!-- Order No -->
            <td
              class="p-2 cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'orderNo', row.orderNo)"
            >
              <template v-if="isEditing(index, 'orderNo')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-28"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.orderNo }}
              </template>
            </td>

            <!-- Order Item No -->
            <td
              class="p-2 cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'orderItemNo', row.orderItemNo)"
            >
              <template v-if="isEditing(index, 'orderItemNo')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-16"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.orderItemNo }}
              </template>
            </td>

            <!-- Brand No -->
            <td
              class="p-2 cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'brandNo', row.brandNo)"
            >
              <template v-if="isEditing(index, 'brandNo')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-32"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.brandNo }}
              </template>
            </td>

            <!-- Spec -->
            <td
              class="p-2 cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'spec', row.spec)"
            >
              <template v-if="isEditing(index, 'spec')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-28"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.spec }}
              </template>
            </td>

            <!-- Unit Weight -->
            <td
              class="p-2 text-right cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'unitWeight', row.unitWeight)"
            >
              <template v-if="isEditing(index, 'unitWeight')">
                <UiInput
                  v-model="editingValue"
                  type="number"
                  step="0.0001"
                  class="h-7 w-20 text-right"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ formatNumber(row.unitWeight, 4) }}
              </template>
            </td>

            <!-- Quantity -->
            <td
              class="p-2 text-right cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'quantity', row.quantity)"
            >
              <template v-if="isEditing(index, 'quantity')">
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

            <!-- Total Weight -->
            <td
              class="p-2 text-right cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'totalWeight', row.totalWeight)"
            >
              <template v-if="isEditing(index, 'totalWeight')">
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
                {{ formatNumber(row.totalWeight) }}
              </template>
            </td>

            <!-- Warehouse -->
            <td
              class="p-2 cursor-pointer hover:bg-muted/50"
              @click="startEdit(index, 'warehouse', row.warehouse)"
            >
              <template v-if="isEditing(index, 'warehouse')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-24"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                {{ row.warehouse }}
              </template>
            </td>

            <!-- Contract No (highlighted) - Excel-like interaction -->
            <td
              :class="getContractNoCellClass(index)"
              @click="handleContractNoClick(index, row.contractNo)"
              @mouseenter="handleCellMouseEnter(index, 'contractNo')"
              @mouseleave="handleCellMouseLeave"
            >
              <template v-if="isEditing(index, 'contractNo')">
                <UiInput
                  ref="contractNoInputRef"
                  v-model="editingValue"
                  class="h-7 w-full"
                  placeholder="输入合同号和色标"
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                <span :class="row.contractNo ? '' : 'text-muted-foreground italic'">
                  {{ row.contractNo || '点击输入' }}
                </span>
              </template>
              <!-- Excel-style fill handle (bottom-right corner) -->
              <div
                v-if="showFillHandle(index)"
                class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-600 cursor-crosshair border border-white shadow-sm translate-x-[1px] translate-y-[1px] hover:w-3 hover:h-3 hover:bg-blue-700 transition-all"
                title="拖动复制到下方行"
                @mousedown="startDrag(index, 'contractNo', $event)"
              />
            </td>
          </tr>
        </tbody>
        <tfoot class="bg-muted/50">
          <tr>
            <td colspan="6" class="p-2 font-medium">
              合计
            </td>
            <td class="p-2 text-right font-medium">
              {{ totalQuantity }}
            </td>
            <td class="p-2 text-right font-medium">
              {{ totalWeight.toFixed(3) }}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Help text -->
    <p class="text-sm text-muted-foreground flex-shrink-0">
      点击单元格可编辑，按 Enter 保存，Esc 取消，Tab 跳转下一行。鼠标悬停在合同号单元格上时，拖动右下角的小方块可快速复制到下方行。
    </p>
  </div>
</template>
