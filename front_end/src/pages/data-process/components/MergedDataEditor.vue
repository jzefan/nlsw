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
</script>

<template>
  <div class="space-y-4">
    <!-- Summary -->
    <div class="flex items-center justify-between text-sm">
      <span class="font-medium">共 {{ modelValue.length }} 条数据</span>
      <div class="flex items-center gap-4">
        <span>总发运数: <strong>{{ totalQuantity }}</strong></span>
        <span>总重量: <strong>{{ totalWeight.toFixed(3) }}</strong> 吨</span>
      </div>
    </div>

    <!-- Editable table -->
    <div class="border rounded-lg overflow-auto max-h-[500px]">
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
            <th class="p-2 text-left whitespace-nowrap bg-yellow-50 dark:bg-yellow-950/30">
              色标
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in modelValue"
            :key="`${row.orderNo}-${row.orderItemNo}`"
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
              class="p-2 bg-yellow-50 dark:bg-yellow-950/30 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/50"
              @click="startEdit(index, 'contractNo', row.contractNo)"
            >
              <template v-if="isEditing(index, 'contractNo')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-28"
                  placeholder="输入合同号"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                <span :class="row.contractNo ? '' : 'text-muted-foreground italic'">
                  {{ row.contractNo || '点击输入' }}
                </span>
              </template>
            </td>

            <!-- Color Mark (highlighted) -->
            <td
              class="p-2 bg-yellow-50 dark:bg-yellow-950/30 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/50"
              @click="startEdit(index, 'colorMark', row.colorMark)"
            >
              <template v-if="isEditing(index, 'colorMark')">
                <UiInput
                  v-model="editingValue"
                  class="h-7 w-20"
                  placeholder="输入色标"
                  autofocus
                  @blur="saveEdit"
                  @keydown="handleKeydown"
                />
              </template>
              <template v-else>
                <span :class="row.colorMark ? '' : 'text-muted-foreground italic'">
                  {{ row.colorMark || '点击输入' }}
                </span>
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
            <td colspan="3" />
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Help text -->
    <p class="text-sm text-muted-foreground">
      点击单元格可编辑内容，按 Enter 保存，按 Esc 取消。黄色背景列为必填项。
    </p>
  </div>
</template>
