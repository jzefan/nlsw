<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { AggregatedRow, ContractGroup } from '@/utils/excel-transform'

const props = defineProps<{
  modelValue: ContractGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ContractGroup[]): void
}>()

const accordionValue = ref<string | undefined>(undefined)
const editingCell = ref<{ groupIndex: number, rowIndex: number, field: string } | null>(null)
const editingValue = ref('')

// Totals
const grandTotalQuantity = computed(() =>
  props.modelValue.reduce((sum, g) => sum + g.subtotalQuantity, 0),
)
const grandTotalWeight = computed(() =>
  props.modelValue.reduce((sum, g) => sum + g.subtotalWeight, 0),
)

function expandAll() {
  // Set to first group to trigger all expansion
  if (props.modelValue.length > 0) {
    accordionValue.value = 'all-expanded'
  }
}

function collapseAll() {
  accordionValue.value = undefined
}

function startEdit(groupIndex: number, rowIndex: number, field: string, currentValue: any) {
  editingCell.value = { groupIndex, rowIndex, field }
  editingValue.value = String(currentValue ?? '')
}

function saveEdit() {
  if (!editingCell.value)
    return

  const { groupIndex, rowIndex, field } = editingCell.value
  let value: any = editingValue.value

  // Handle numeric fields
  if (['unitWeight', 'totalWeight'].includes(field)) {
    value = Number.parseFloat(editingValue.value) || 0
  }
  else if (field === 'quantity') {
    value = Number.parseInt(editingValue.value) || 0
  }

  updateRow(groupIndex, rowIndex, field as keyof AggregatedRow, value)
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

function isEditing(groupIndex: number, rowIndex: number, field: string): boolean {
  return editingCell.value?.groupIndex === groupIndex
    && editingCell.value?.rowIndex === rowIndex
    && editingCell.value?.field === field
}

function formatNumber(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}

function updateRow(groupIndex: number, rowIndex: number, field: keyof AggregatedRow, value: any) {
  const newGroups = [...props.modelValue]
  const newRows = [...newGroups[groupIndex].rows]
  newRows[rowIndex] = { ...newRows[rowIndex], [field]: value }
  newGroups[groupIndex] = {
    ...newGroups[groupIndex],
    rows: newRows,
    subtotalQuantity: newRows.reduce((sum, r) => sum + r.quantity, 0),
    subtotalWeight: newRows.reduce((sum, r) => sum + r.totalWeight, 0),
  }
  emit('update:modelValue', newGroups)
}

function deleteRow(groupIndex: number, rowIndex: number) {
  const newGroups = [...props.modelValue]
  const newRows = [...newGroups[groupIndex].rows]
  newRows.splice(rowIndex, 1)

  if (newRows.length === 0) {
    // Remove empty group
    newGroups.splice(groupIndex, 1)
  }
  else {
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      rows: newRows,
      subtotalQuantity: newRows.reduce((sum, r) => sum + r.quantity, 0),
      subtotalWeight: newRows.reduce((sum, r) => sum + r.totalWeight, 0),
    }
  }
  emit('update:modelValue', newGroups)
}

function updateContractNo(groupIndex: number, newContractNo: string | number) {
  const contractNoStr = String(newContractNo)
  const newGroups = [...props.modelValue]
  // Update contract number for the group and all its rows
  const updatedRows = newGroups[groupIndex].rows.map(row => ({
    ...row,
    contractNo: contractNoStr,
  }))
  newGroups[groupIndex] = {
    ...newGroups[groupIndex],
    contractNo: contractNoStr,
    rows: updatedRows,
  }
  emit('update:modelValue', newGroups)
}

</script>

<template>
  <div class="h-full flex flex-col gap-4">
    <!-- Controls -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-4 text-sm">
        <span class="font-medium">共 {{ modelValue.length }} 个合同组</span>
        <span class="text-muted-foreground">|</span>
        <span>总发运数: <strong>{{ grandTotalQuantity }}</strong></span>
        <span>总重量: <strong>{{ grandTotalWeight.toFixed(3) }}</strong> 吨</span>
      </div>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" @click="expandAll">
          全部展开
        </UiButton>
        <UiButton variant="outline" size="sm" @click="collapseAll">
          全部折叠
        </UiButton>
      </div>
    </div>

    <!-- Groups using Accordion -->
    <div class="flex-1 overflow-auto">
      <UiAccordion v-if="accordionValue === 'all-expanded'" type="multiple" :default-value="modelValue.map((g, i) => `item-${i}`)">
      <UiAccordionItem v-for="(group, groupIndex) in modelValue" :key="group.contractNo" :value="`item-${groupIndex}`">
        <UiAccordionTrigger class="hover:no-underline px-4">
          <div class="flex-1 flex items-center gap-4 text-left">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">合同号:</span>
              <span class="font-medium">{{ group.contractNo }}</span>
            </div>
            <span class="text-sm text-muted-foreground">|</span>
            <span class="text-sm text-muted-foreground">
              {{ group.rows.length }} 条 /
              {{ group.subtotalQuantity }} 件 /
              {{ group.subtotalWeight.toFixed(3) }} 吨
            </span>
          </div>
        </UiAccordionTrigger>
        <UiAccordionContent>
          <div class="px-4 pb-4">
            <div class="border rounded-lg overflow-auto">
              <table class="w-full text-sm">
                <thead class="bg-muted/50">
                  <tr>
                    <th class="px-1 py-2 w-8" />
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">提单号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">订单号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-16">项次号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-32">牌号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">规格</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-24">单重</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-20">发运数</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-24">发运重量</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-24">仓库</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, rowIndex) in group.rows"
                    :key="`${row.orderNo}-${row.orderItemNo}`"
                    class="border-t hover:bg-muted/30"
                  >
                    <td class="px-1 py-1 text-center">
                      <UiButton
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-red-500"
                        @click="deleteRow(groupIndex, rowIndex)"
                      >
                        <Trash2 class="w-3 h-3" />
                      </UiButton>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'billNo', row.billNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'billNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.billNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'orderNo', row.orderNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'orderNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.orderNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'orderItemNo', row.orderItemNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'orderItemNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.orderItemNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'brandNo', row.brandNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'brandNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.brandNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'spec', row.spec)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'spec')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.spec }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'unitWeight', row.unitWeight)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'unitWeight')">
                        <UiInput v-model="editingValue" type="number" step="0.0001" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ formatNumber(row.unitWeight, 4) }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'quantity', row.quantity)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'quantity')">
                        <UiInput v-model="editingValue" type="number" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.quantity }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'totalWeight', row.totalWeight)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'totalWeight')">
                        <UiInput v-model="editingValue" type="number" step="0.001" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ formatNumber(row.totalWeight) }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'warehouse', row.warehouse)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'warehouse')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.warehouse }}
                      </template>
                    </td>
                  </tr>
                </tbody>
                <tfoot class="bg-muted/50">
                  <tr>
                    <td colspan="7" class="px-1 py-2 font-medium">小计</td>
                    <td class="px-1 py-2 text-right font-medium">{{ group.subtotalQuantity }}</td>
                    <td class="px-1 py-2 text-right font-medium">{{ group.subtotalWeight.toFixed(3) }}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </UiAccordionContent>
      </UiAccordionItem>
    </UiAccordion>

    <!-- Single select Accordion (default) -->
    <UiAccordion v-else type="single" collapsible v-model="accordionValue">
      <UiAccordionItem v-for="(group, groupIndex) in modelValue" :key="group.contractNo" :value="`item-${groupIndex}`">
        <UiAccordionTrigger class="hover:no-underline px-4">
          <div class="flex-1 flex items-center gap-4 text-left">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">合同号:</span>
              <span class="font-medium">{{ group.contractNo }}</span>
            </div>
            <span class="text-sm text-muted-foreground">|</span>
            <span class="text-sm text-muted-foreground">
              {{ group.rows.length }} 条 /
              {{ group.subtotalQuantity }} 件 /
              {{ group.subtotalWeight.toFixed(3) }} 吨
            </span>
          </div>
        </UiAccordionTrigger>
        <UiAccordionContent>
          <div class="px-4 pb-4">
            <div class="border rounded-lg overflow-auto">
              <table class="w-full text-sm">
                <thead class="bg-muted/50">
                  <tr>
                    <th class="px-1 py-2 w-8" />
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">提单号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">订单号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-16">项次号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-32">牌号</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-28">规格</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-24">单重</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-20">发运数</th>
                    <th class="px-1 py-2 text-right whitespace-nowrap w-24">发运重量</th>
                    <th class="px-1 py-2 text-left whitespace-nowrap w-24">仓库</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, rowIndex) in group.rows"
                    :key="`${row.orderNo}-${row.orderItemNo}`"
                    class="border-t hover:bg-muted/30"
                  >
                    <td class="px-1 py-1 text-center">
                      <UiButton
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-red-500"
                        @click="deleteRow(groupIndex, rowIndex)"
                      >
                        <Trash2 class="w-3 h-3" />
                      </UiButton>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'billNo', row.billNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'billNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.billNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'orderNo', row.orderNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'orderNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.orderNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'orderItemNo', row.orderItemNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'orderItemNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.orderItemNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'brandNo', row.brandNo)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'brandNo')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.brandNo }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'spec', row.spec)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'spec')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.spec }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'unitWeight', row.unitWeight)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'unitWeight')">
                        <UiInput v-model="editingValue" type="number" step="0.0001" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ formatNumber(row.unitWeight, 4) }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'quantity', row.quantity)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'quantity')">
                        <UiInput v-model="editingValue" type="number" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.quantity }}
                      </template>
                    </td>
                    <td class="px-1 py-1 text-right cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'totalWeight', row.totalWeight)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'totalWeight')">
                        <UiInput v-model="editingValue" type="number" step="0.001" class="h-7 w-full text-right" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ formatNumber(row.totalWeight) }}
                      </template>
                    </td>
                    <td class="px-1 py-1 cursor-pointer hover:bg-muted/50" @click="startEdit(groupIndex, rowIndex, 'warehouse', row.warehouse)">
                      <template v-if="isEditing(groupIndex, rowIndex, 'warehouse')">
                        <UiInput v-model="editingValue" class="h-7 w-full" autofocus @blur="saveEdit" @keydown="handleKeydown" />
                      </template>
                      <template v-else>
                        {{ row.warehouse }}
                      </template>
                    </td>
                  </tr>
                </tbody>
                <tfoot class="bg-muted/50">
                  <tr>
                    <td colspan="7" class="px-1 py-2 font-medium">小计</td>
                    <td class="px-1 py-2 text-right font-medium">{{ group.subtotalQuantity }}</td>
                    <td class="px-1 py-2 text-right font-medium">{{ group.subtotalWeight.toFixed(3) }}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </UiAccordionContent>
      </UiAccordionItem>
    </UiAccordion>
    </div>
  </div>
</template>
