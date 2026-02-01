import type { ColumnDef } from '@tanstack/vue-table'
import type { DrayageForklift } from '@/services/api/financial.api'
import { h } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import DataTableColumnHeader from '@/components/data-table/column-header.vue'

export const columns: ColumnDef<DrayageForklift>[] = [
  {
    id: 'select',
    header: ({ table }) => h(Checkbox, {
      'checked': table.getIsAllPageRowsSelected(),
      'onUpdate:checked': (value: boolean) => table.toggleAllPageRowsSelected(!!value),
      'ariaLabel': 'Select all',
    }),
    cell: ({ row }) => h(Checkbox, {
      'checked': row.getIsSelected(),
      'onUpdate:checked': (value: boolean) => row.toggleSelected(!!value),
      'ariaLabel': 'Select row',
    }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'month',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '月份' }),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.getValue('month')),
  },
  {
    accessorKey: 'drayage',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '短驳应收款' }),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('drayage'))
      return h('div', { class: 'text-right font-medium' }, amount.toFixed(2))
    },
  },
  {
    accessorKey: 'forklift',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '叉车应收款' }),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('forklift'))
      return h('div', { class: 'text-right font-medium' }, amount.toFixed(2))
    },
  },
]
