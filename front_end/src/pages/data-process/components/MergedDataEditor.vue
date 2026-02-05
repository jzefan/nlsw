<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

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

// Drag-to-copy state
const selectedCell = ref<{ rowIndex: number, field: string } | null>(null)
const isDragging = ref(false)
const dragStartCell = ref<{ rowIndex: number, field: string } | null>(null)
const dragEndRow = ref<number | null>(null)

// Click delay for distinguishing single/double click
const clickTimer = ref<number | null>(null)
const clickDelay = 250 // milliseconds

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

// Drag-to-copy functionality
function selectCell(rowIndex: number, field: string) {
  selectedCell.value = { rowIndex, field }
}

function handleCellClick(rowIndex: number, field: string, currentValue: any) {
  // Clear any existing timer
  if (clickTimer.value) {
    clearTimeout(clickTimer.value)
    clickTimer.value = null
  }

  // Set a timer for single click (edit mode)
  clickTimer.value = window.setTimeout(() => {
    startEdit(rowIndex, field, currentValue)
    clickTimer.value = null
  }, clickDelay)
}

function handleCellDoubleClick(rowIndex: number, field: string) {
  // Cancel the single click timer
  if (clickTimer.value) {
    clearTimeout(clickTimer.value)
    clickTimer.value = null
  }

  // Select cell and show drag handle
  selectCell(rowIndex, field)
}

function startDrag(rowIndex: number, field: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
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
}

function handleDragEnd() {
  if (!isDragging.value || !dragStartCell.value || dragEndRow.value === null)
    return

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

function getCellClass(rowIndex: number, field: string): string {
  const baseClass = 'p-2 cursor-pointer hover:bg-muted/50 relative'
  const isSelected = selectedCell.value?.rowIndex === rowIndex && selectedCell.value?.field === field
  const inRange = isInDragRange(rowIndex, field)

  if (inRange) {
    // Add border to show drag range
    const isStart = dragStartCell.value?.rowIndex === rowIndex
    const isEnd = dragEndRow.value === rowIndex
    let borderClass = 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'

    // Add specific border styles for start and end
    if (isStart && isEnd) {
      borderClass += ' border-2'
    } else if (isStart) {
      borderClass += ' border-t-2 border-l-2 border-r-2 border-b-0'
    } else if (isEnd) {
      borderClass += ' border-b-2 border-l-2 border-r-2 border-t-0'
    } else {
      borderClass += ' border-l-2 border-r-2 border-t-0 border-b-0'
    }

    return `${baseClass} ${borderClass}`
  }
  if (isSelected) {
    return `${baseClass} outline outline-2 outline-blue-500 outline-offset-[-2px]`
  }
  return baseClass
}
</script>

<template>
  <div class="h-full flex flex-col gap-4">
    <!-- Editable table -->
    <div class="border rounded-lg overflow-auto flex-1">
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

            <!-- Contract No (highlighted) -->
            <td
              :class="[
                'bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50 min-w-[200px]',
                getCellClass(index, 'contractNo')
              ]"
              @click="handleCellClick(index, 'contractNo', row.contractNo)"
              @dblclick="handleCellDoubleClick(index, 'contractNo')"
            >
              <template v-if="isEditing(index, 'contractNo')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-full"
                  placeholder="输入合同号和色标"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                <span :class="row.contractNo ? '' : 'text-muted-foreground italic'">
                  {{ row.contractNo || '点击输入' }}
                </span>
                <!-- Fill handle for drag-to-copy -->
                <div
                  v-if="selectedCell?.rowIndex === index && selectedCell?.field === 'contractNo'"
                  class="absolute bottom-0.5 right-0.5 w-4 h-4 bg-blue-600 cursor-crosshair border-2 border-white shadow-md hover:w-5 hover:h-5 hover:bg-blue-700"
                  @mousedown="startDrag(index, 'contractNo', $event)"
                />
              </template>
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
      点击单元格可编辑内容，按 Enter 保存，按 Esc 取消。黄色背景列为必填项。点击合同号单元格后，拖动右下角的十字图标可快速复制内容到下方行。
    </p>
  </div>
</template>
