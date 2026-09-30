<script setup lang="ts">
import { computed, ref } from 'vue'

import { payslipColumns } from '@/constants/payroll-fields'
import type { PayrollComponents, PayrollTotals } from '@/services/api/payroll.api'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatBeijingDate, formatCents } from '@/utils/payroll'

const props = withDefaults(defineProps<{
  /** 序号，通常为该员工在本月工资表中的行号 */
  index?: number
  name: string
  components?: PayrollComponents | null
  totals?: PayrollTotals | null
  /** 发布日期（有效版本的发布时间）；不传就不显示这一项 */
  publishedAt?: string | null
}>(), { index: 1, components: null, totals: null })

/** 默认按行列逐项列出，避免默认铺开成需要横向滚动的一整行；一行展示作为可选查看方式保留。 */
const view = ref<'list' | 'table'>('list')

type HeaderCell = { key: string, label: string, colspan: number, rowspan: number }

/** 第一层表头：补贴、请假合并单元格，其余列跨两行。 */
const headerTop = computed<HeaderCell[]>(() => {
  const cells: HeaderCell[] = []
  for (let i = 0; i < payslipColumns.length; i++) {
    const column = payslipColumns[i]
    if (!column.group) {
      cells.push({ key: column.key, label: column.label, colspan: 1, rowspan: 2 })
      continue
    }
    // 分组只在第一列出现一次，合并同一分组的宽度
    if (i > 0 && payslipColumns[i - 1].group === column.group) continue
    const colspan = payslipColumns.filter(item => item.group === column.group).length
    cells.push({ key: `${column.group}-group`, label: column.group, colspan, rowspan: 1 })
  }
  return cells
})

const headerGroups = computed(() => payslipColumns.filter(column => column.group).map(column => ({ key: column.key, label: column.label })))

function cellValue(column: (typeof payslipColumns)[number]) {
  if (column.kind === 'component') return props.components?.[column.key as keyof PayrollComponents]
  return props.totals?.[column.key as keyof PayrollTotals]
}

/** 逐项列出时在名称前带上两级表头的分组名（如「补贴 · 交通补贴」），保留原表的分组语义。 */
function columnLabel(column: (typeof payslipColumns)[number]) {
  return column.group ? `${column.group} · ${column.label}` : column.label
}
</script>

<template>
  <!-- w-0 + min-w-full：让展开区域自己决定宽度，宽表只在展开区域内横向滚动，不会把外层表格整张撑宽 -->
  <div class="w-0 min-w-full space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span><span class="text-xs text-muted-foreground">序号</span><span class="ml-2 font-medium tabular-nums">{{ index }}</span></span>
        <span><span class="text-xs text-muted-foreground">姓名</span><span class="ml-2 font-medium">{{ name }}</span></span>
        <span v-if="publishedAt !== undefined"
          ><span class="text-xs text-muted-foreground">发布日期</span
          ><span class="ml-2 font-medium tabular-nums">{{ publishedAt ? formatBeijingDate(publishedAt) : '尚未发布' }}</span></span
        >
      </div>
      <div class="flex items-center gap-0.5 rounded-md border p-0.5" role="group" aria-label="工资条查看方式">
        <Button size="sm" :variant="view === 'list' ? 'secondary' : 'ghost'" class="h-7 px-2 text-xs" :aria-pressed="view === 'list'" @click="view = 'list'">按行列</Button>
        <Button size="sm" :variant="view === 'table' ? 'secondary' : 'ghost'" class="h-7 px-2 text-xs" :aria-pressed="view === 'table'" @click="view = 'table'">一行展示</Button>
      </div>
    </div>

    <div v-if="view === 'list'" class="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="column in payslipColumns" :key="column.key" class="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5">
        <span class="text-xs text-muted-foreground">{{ columnLabel(column) }}</span>
        <span class="text-sm font-medium tabular-nums">{{ formatCents(cellValue(column)) }}</span>
      </div>
    </div>

    <div v-else class="overflow-x-auto">
      <Table class="min-w-[1680px]">
        <TableHeader>
          <TableRow>
            <TableHead rowspan="2" class="w-14 text-center">序号</TableHead>
            <TableHead rowspan="2" class="w-28">姓名</TableHead>
            <TableHead v-for="cell in headerTop" :key="cell.key" :colspan="cell.colspan" :rowspan="cell.rowspan" :class="cell.rowspan === 1 ? 'text-center' : ''">{{ cell.label }}</TableHead>
          </TableRow>
          <TableRow>
            <TableHead v-for="column in headerGroups" :key="column.key" class="text-center">{{ column.label }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell class="text-center tabular-nums">{{ index }}</TableCell>
            <TableCell class="font-medium">{{ name }}</TableCell>
            <TableCell v-for="column in payslipColumns" :key="column.key" class="text-right tabular-nums">{{ formatCents(cellValue(column)) }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
