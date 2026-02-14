<script setup lang="ts">
import { Check } from 'lucide-vue-next'

import type { ColumnDef, ParsedFile } from '@/utils/excel-transform'

const props = defineProps<{
  file: ParsedFile
  globalColumnDefs: ColumnDef[] // Global column definitions (shared across files)
}>()

const emit = defineEmits<{
  (e: 'toggleColumn', columnKey: string): void
}>()

// Format cell value for display
function formatCellValue(value: any): string {
  if (value === undefined || value === null || value === '')
    return ''
  if (typeof value === 'number') {
    // Format numbers with reasonable precision
    return Number.isInteger(value) ? value.toString() : value.toFixed(3)
  }
  return String(value)
}

// Handle column header click
function handleColumnClick(col: ColumnDef) {
  emit('toggleColumn', col.key)
}

// Check if column is required (from global state)
function isColumnRequired(key: string): boolean {
  const col = props.globalColumnDefs.find(c => c.key === key)
  return col?.isRequired ?? false
}

// Get sorted columns: required first, then others
function getSortedColumns(): ColumnDef[] {
  const required = props.globalColumnDefs.filter(c => c.isRequired)
  const others = props.globalColumnDefs.filter(c => !c.isRequired)
  return [...required, ...others]
}
</script>

<template>
  <div class="border rounded-lg overflow-hidden">
    <!-- Summary -->
    <div class="px-4 py-2 bg-muted/30 border-b flex items-center justify-between text-sm">
      <span>共 <strong>{{ file.rowCount }}</strong> 行数据</span>
      <span class="text-muted-foreground">
        <Check class="w-4 h-4 inline text-green-600" /> 标记的列为需要的数据列（点击列头可切换）
      </span>
    </div>

    <!-- Table with all columns -->
    <div class="overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 sticky top-0 z-10">
          <tr>
            <th class="p-2 text-left text-muted-foreground w-12 border-r">
              #
            </th>
            <template v-for="col in getSortedColumns()" :key="col.key">
              <th
                class="p-2 text-left whitespace-nowrap border-r last:border-r-0 cursor-pointer select-none transition-colors hover:opacity-80"
                :class="isColumnRequired(col.key) ? 'bg-green-50 dark:bg-green-950/30' : 'bg-gray-100 dark:bg-gray-800/50'"
                @click="handleColumnClick(col)"
              >
                <div class="flex items-center gap-1">
                  <span
                    class="w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center"
                    :class="isColumnRequired(col.key)
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-gray-400 dark:border-gray-500'"
                  >
                    <Check v-if="isColumnRequired(col.key)" class="w-3 h-3" />
                  </span>
                  <span :class="isColumnRequired(col.key) ? 'text-green-800 dark:text-green-200 font-medium' : 'text-gray-500 dark:text-gray-400'">
                    {{ col.key }}
                  </span>
                </div>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in file.rawData.rows"
            :key="index"
            class="border-t hover:bg-muted/30"
          >
            <td class="p-2 text-muted-foreground text-center border-r">
              {{ index + 1 }}
            </td>
            <template v-for="col in getSortedColumns()" :key="col.key">
              <td
                class="p-2 border-r last:border-r-0"
                :class="isColumnRequired(col.key) ? '' : 'bg-gray-50 dark:bg-gray-800/30 text-gray-500 dark:text-gray-400'"
              >
                {{ formatCellValue(row[col.key]) }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
