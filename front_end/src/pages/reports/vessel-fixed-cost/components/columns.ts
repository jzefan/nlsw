// @ts-nocheck
import type { ColumnDef } from '@tanstack/vue-table'
import type { VesselFixedCost } from '@/services/api/vessel-fixed-cost.api'
import { h } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import DataTableColumnHeader from '@/components/data-table/column-header.vue'

const commonColumns: ColumnDef<VesselFixedCost>[] = [
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
]

export const vehicleColumns: ColumnDef<VesselFixedCost>[] = [
  ...commonColumns,
  {
    accessorKey: 'name',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '车号' }),
  },
  {
    accessorKey: 'fittings',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '配件' }),
  },
  {
    accessorKey: 'repair',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '修理费' }),
  },
  {
    accessorKey: 'annual_survey',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '年检二维费用' }),
  },
  {
    accessorKey: 'salary',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '驾驶员工资' }),
  },
  {
    accessorKey: 'oil',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '油费' }),
  },
  {
    accessorKey: 'toll',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '过路费' }),
  },
  {
    accessorKey: 'fine',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '罚款' }),
  },
  {
    accessorKey: 'other',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '其它' }),
  },
  {
    accessorKey: 'total',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '合计' }),
    cell: ({ row }) => h('div', { class: 'font-bold text-red-500' }, row.getValue('total')),
  },
]

export const vesselColumns: ColumnDef<VesselFixedCost>[] = [
  ...commonColumns,
  {
    accessorKey: 'ic',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '保险费用' }),
  },
  {
    accessorKey: 'hc',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '吊装费用' }),
  },
  {
    accessorKey: 'pcc',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '港口建设费' }),
  },
  {
    accessorKey: 'aux',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '辅料' }),
  },
  {
    accessorKey: 'other',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '其它' }),
  },
  {
    accessorKey: 'total',
    header: ({ column }) => h(DataTableColumnHeader, { column, title: '合计' }),
    cell: ({ row }) => h('div', { class: 'font-bold text-red-500' }, row.getValue('total')),
  },
]
