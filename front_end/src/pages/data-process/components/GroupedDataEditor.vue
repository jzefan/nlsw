<script setup lang="ts">
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { AggregatedRow, ContractGroup } from '@/utils/excel-transform'

const props = defineProps<{
  modelValue: ContractGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ContractGroup[]): void
}>()

const expandedGroups = ref<Set<string>>(new Set())

// Totals
const grandTotalQuantity = computed(() =>
  props.modelValue.reduce((sum, g) => sum + g.subtotalQuantity, 0),
)
const grandTotalWeight = computed(() =>
  props.modelValue.reduce((sum, g) => sum + g.subtotalWeight, 0),
)

function toggleGroup(contractNo: string) {
  if (expandedGroups.value.has(contractNo)) {
    expandedGroups.value.delete(contractNo)
  }
  else {
    expandedGroups.value.add(contractNo)
  }
}

function isExpanded(contractNo: string) {
  return expandedGroups.value.has(contractNo)
}

function expandAll() {
  props.modelValue.forEach((g) => {
    expandedGroups.value.add(g.contractNo)
  })
}

function collapseAll() {
  expandedGroups.value.clear()
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

function updateContractNo(groupIndex: number, newContractNo: string) {
  const newGroups = [...props.modelValue]
  // Update contract number for the group and all its rows
  const updatedRows = newGroups[groupIndex].rows.map(row => ({
    ...row,
    contractNo: newContractNo,
  }))
  newGroups[groupIndex] = {
    ...newGroups[groupIndex],
    contractNo: newContractNo,
    rows: updatedRows,
  }
  emit('update:modelValue', newGroups)
}

// Initialize all groups as expanded
if (props.modelValue.length > 0) {
  expandAll()
}
</script>

<template>
  <div class="space-y-4">
    <!-- Controls -->
    <div class="flex items-center justify-between">
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

    <!-- Groups -->
    <div class="space-y-4">
      <UiCard v-for="(group, groupIndex) in modelValue" :key="group.contractNo">
        <!-- Group Header -->
        <UiCardHeader
          class="py-3 cursor-pointer hover:bg-muted/30"
          @click="toggleGroup(group.contractNo)"
        >
          <div class="flex items-center gap-3">
            <component
              :is="isExpanded(group.contractNo) ? ChevronDown : ChevronRight"
              class="w-4 h-4 text-muted-foreground"
            />
            <div class="flex-1 flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">合同号:</span>
                <UiInput
                  :model-value="group.contractNo"
                  class="w-48 h-8"
                  @click.stop
                  @update:model-value="updateContractNo(groupIndex, $event)"
                />
              </div>
              <span class="text-sm text-muted-foreground">|</span>
              <span class="text-sm">
                {{ group.rows.length }} 条 /
                {{ group.subtotalQuantity }} 件 /
                {{ group.subtotalWeight.toFixed(3) }} 吨
              </span>
            </div>
          </div>
        </UiCardHeader>

        <!-- Group Content -->
        <UiCardContent v-if="isExpanded(group.contractNo)" class="pt-0">
          <div class="border rounded-lg overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th class="p-2 w-10" />
                  <th class="p-2 text-left">
                    提单号
                  </th>
                  <th class="p-2 text-left">
                    订单号
                  </th>
                  <th class="p-2 text-left">
                    项次号
                  </th>
                  <th class="p-2 text-left">
                    牌号
                  </th>
                  <th class="p-2 text-left">
                    规格
                  </th>
                  <th class="p-2 text-right">
                    单重
                  </th>
                  <th class="p-2 text-right">
                    发运数
                  </th>
                  <th class="p-2 text-right">
                    发运重量
                  </th>
                  <th class="p-2 text-left">
                    仓库
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rowIndex) in group.rows"
                  :key="`${row.orderNo}-${row.orderItemNo}`"
                  class="border-t hover:bg-muted/30"
                >
                  <td class="p-2">
                    <UiButton
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 text-red-500"
                      @click="deleteRow(groupIndex, rowIndex)"
                    >
                      <Trash2 class="w-4 h-4" />
                    </UiButton>
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.billNo"
                      class="h-8 w-28"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'billNo', $event)"
                    />
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.orderNo"
                      class="h-8 w-28"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'orderNo', $event)"
                    />
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.orderItemNo"
                      class="h-8 w-16"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'orderItemNo', $event)"
                    />
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.brandNo"
                      class="h-8 w-32"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'brandNo', $event)"
                    />
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.spec"
                      class="h-8 w-28"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'spec', $event)"
                    />
                  </td>
                  <td class="p-2 text-right">
                    <UiInput
                      type="number"
                      :model-value="row.unitWeight"
                      class="h-8 w-20 text-right"
                      step="0.0001"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'unitWeight', parseFloat($event) || 0)"
                    />
                  </td>
                  <td class="p-2 text-right">
                    <UiInput
                      type="number"
                      :model-value="row.quantity"
                      class="h-8 w-16 text-right"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'quantity', parseInt($event) || 0)"
                    />
                  </td>
                  <td class="p-2 text-right">
                    <UiInput
                      type="number"
                      :model-value="row.totalWeight"
                      class="h-8 w-24 text-right"
                      step="0.001"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'totalWeight', parseFloat($event) || 0)"
                    />
                  </td>
                  <td class="p-2">
                    <UiInput
                      :model-value="row.warehouse"
                      class="h-8 w-24"
                      @update:model-value="updateRow(groupIndex, rowIndex, 'warehouse', $event)"
                    />
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-muted/50">
                <tr>
                  <td colspan="7" class="p-2 font-medium">
                    小计
                  </td>
                  <td class="p-2 text-right font-medium">
                    {{ group.subtotalQuantity }}
                  </td>
                  <td class="p-2 text-right font-medium">
                    {{ group.subtotalWeight.toFixed(3) }}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Grand Total -->
    <UiCard v-if="modelValue.length > 0">
      <UiCardContent class="py-4">
        <div class="flex items-center justify-end gap-8 text-lg font-semibold">
          <span>总计: {{ grandTotalQuantity }} 件</span>
          <span>{{ grandTotalWeight.toFixed(3) }} 吨</span>
        </div>
      </UiCardContent>
    </UiCard>
  </div>
</template>
