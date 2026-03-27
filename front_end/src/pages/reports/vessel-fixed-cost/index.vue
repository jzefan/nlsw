<script setup lang="ts">
// @ts-nocheck
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { CheckSquare, Edit, FileDown, Plus, Search, Square, Trash2 } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import MonthPicker from '@/components/ui/date-picker/MonthPicker.vue'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import SearchableCombobox from '@/components/searchable-combobox.vue'

import VesselFixedCostDialog from './components/vessel-fixed-cost-dialog.vue'
import { deleteVesselFixedCost, getVesselFixedCosts, type VesselFixedCost } from '@/services/api/vessel-fixed-cost.api'
import { getVehicles } from '@/services/api/data-dict.api'
import { formatNumber } from '@/utils/format'

const data = ref<VesselFixedCost[]>([])
const loading = ref(false)
const selectedRows = ref<VesselFixedCost[]>([])
const showDialog = ref(false)
const editItem = ref<VesselFixedCost | null>(null)
const showDeleteAlert = ref(false)

const activeTab = ref('che')
const searchName = ref('')
const searchMonth = ref('')

// 全选状态
const allSelected = computed(() => {
  return data.value.length > 0 && selectedRows.value.length === data.value.length
})

// 切换全选
function toggleSelectAll() {
  if (allSelected.value) {
    selectedRows.value = []
  }
  else {
    selectedRows.value = [...data.value]
  }
}

// 切换单行选择
function toggleSelect(row: VesselFixedCost) {
  const index = selectedRows.value.findIndex(item => item.name === row.name && item.month === row.month)
  if (index >= 0) {
    selectedRows.value.splice(index, 1)
  }
  else {
    selectedRows.value.push(row)
  }
}

// 判断是否选中
function isSelected(row: VesselFixedCost) {
  return selectedRows.value.some(item => item.name === row.name && item.month === row.month)
}

// 汇总数据来源：有选中则用选中行，否则用全部数据
const summaryRows = computed(() => selectedRows.value.length > 0 ? selectedRows.value : data.value)

const summary = computed(() => {
  const rows = summaryRows.value
  return {
    total: rows.reduce((s, r) => s + (r.total || 0), 0),
    fittings: rows.reduce((s, r) => s + (r.fittings || 0), 0),
    repair: rows.reduce((s, r) => s + (r.repair || 0), 0),
    annual_survey: rows.reduce((s, r) => s + (r.annual_survey || 0), 0),
    salary: rows.reduce((s, r) => s + (r.salary || 0), 0),
    oil: rows.reduce((s, r) => s + (r.oil || 0), 0),
    toll: rows.reduce((s, r) => s + (r.toll || 0), 0),
    fine: rows.reduce((s, r) => s + (r.fine || 0), 0),
    ic: rows.reduce((s, r) => s + (r.ic || 0), 0),
    hc: rows.reduce((s, r) => s + (r.hc || 0), 0),
    pcc: rows.reduce((s, r) => s + (r.pcc || 0), 0),
    aux: rows.reduce((s, r) => s + (r.aux || 0), 0),
    other: rows.reduce((s, r) => s + (r.other || 0), 0),
  }
})

// Reset selection when tab changes
watch(activeTab, () => {
  selectedRows.value = []
  loadData()
})

async function loadData() {
  loading.value = true
  try {
    const res = await getVesselFixedCosts({
      type: activeTab.value as 'che' | 'chuan',
      name: searchName.value || undefined,
      startDate: searchMonth.value ? `${searchMonth.value}` : undefined,
      endDate: searchMonth.value ? `${searchMonth.value}` : undefined,
    })
    if (res.ok) {
      data.value = res.data
    }
    else {
      toast.error('加载数据失败')
    }
  }
  catch (error) {
    console.error(error)
    toast.error('加载数据出错')
  }
  finally {
    loading.value = false
  }
}

async function searchVehicles(keyword: string, limit: number, page: number) {
  const res = await getVehicles({ search: keyword, type: '车', limit, page })
  if (res.ok) {
    return {
      ok: true,
      data: res.data.map(v => ({ name: v.name })),
      total: res.total,
    }
  }
  return { ok: false, data: [], total: 0 }
}

function handleAdd() {
  editItem.value = null
  showDialog.value = true
}

function handleEdit() {
  if (selectedRows.value.length !== 1)
    return
  editItem.value = selectedRows.value[0]
  showDialog.value = true
}

function handleDelete() {
  if (selectedRows.value.length === 0)
    return
  showDeleteAlert.value = true
}

async function confirmDelete() {
  try {
    for (const row of selectedRows.value) {
      await deleteVesselFixedCost(row.name, row.month)
    }
    toast.success('删除成功')
    selectedRows.value = []
    loadData()
  }
  catch (error) {
    console.error(error)
    toast.error('删除失败')
  }
  finally {
    showDeleteAlert.value = false
  }
}

const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

function handleExport() {
  const dateStr = new Date().toISOString().split('T')[0]
  const isVehicle = activeTab.value === 'che'

  const columns = isVehicle
    ? [
        { header: '月份', key: 'month' },
        { header: '车号', key: 'name' },
        { header: '配件', key: 'fittings', type: 'amount' as const },
        { header: '修理费', key: 'repair', type: 'amount' as const },
        { header: '年检二维费用', key: 'annual_survey', type: 'amount' as const },
        { header: '驾驶员工资', key: 'salary', type: 'amount' as const },
        { header: '油费', key: 'oil', type: 'amount' as const },
        { header: '过路费', key: 'toll', type: 'amount' as const },
        { header: '罚款', key: 'fine', type: 'amount' as const },
        { header: '其它', key: 'other', type: 'amount' as const },
        { header: '合计', key: 'total', type: 'amount' as const },
      ]
    : [
        { header: '月份', key: 'month' },
        { header: '保险费用', key: 'ic', type: 'amount' as const },
        { header: '吊装费用', key: 'hc', type: 'amount' as const },
        { header: '港口建设费', key: 'pcc', type: 'amount' as const },
        { header: '辅料', key: 'aux', type: 'amount' as const },
        { header: '其它', key: 'other', type: 'amount' as const },
        { header: '合计', key: 'total', type: 'amount' as const },
      ]

  exportWithPicker({
    fileName: `${isVehicle ? '车辆' : '船舶'}固定费用_${dateStr}`,
    sheetName: isVehicle ? '车辆固定费用' : '船舶固定费用',
    columns,
    data: data.value,
  })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="车船固定费用" description="管理车船每月的固定费用支出">
    <template #actions>
      <div class="flex gap-2">
        <Button @click="handleAdd">
          <Plus class="mr-2 h-4 w-4" />
          新增
        </Button>
        <Button variant="outline" :disabled="selectedRows.length !== 1" @click="handleEdit">
          <Edit class="mr-2 h-4 w-4" />
          修改
        </Button>
        <Button variant="destructive" :disabled="selectedRows.length === 0" @click="handleDelete">
          <Trash2 class="mr-2 h-4 w-4" />
          删除
        </Button>
        <Button variant="outline" @click="handleExport">
          <FileDown class="mr-2 h-4 w-4" />
          导出
        </Button>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <Tabs v-model="activeTab" class="w-[200px]">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="che">
              车
            </TabsTrigger>
            <TabsTrigger value="chuan">
              船
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="flex items-center gap-2">
          <div v-if="activeTab === 'che'" class="flex items-center gap-2">
            <Label>车船名</Label>
            <div class="w-[200px]">
              <SearchableCombobox
                v-model="searchName"
                :search-fn="searchVehicles"
                placeholder="搜索车船..."
                class="h-9"
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Label>月份</Label>
            <MonthPicker v-model="searchMonth" placeholder="选择月份" class="w-[150px] h-9" />
          </div>

          <Button size="sm" @click="loadData">
            <Search class="mr-2 h-4 w-4" />
            查询
          </Button>
        </div>
      </div>

      <!-- 统计信息（固定显示，避免行跳动） -->
      <div class="flex items-center gap-4 text-sm px-1">
        <span class="text-muted-foreground">
          <span v-if="selectedRows.length > 0">
            已选择 <span class="font-medium text-foreground">{{ selectedRows.length }}</span> 条 /
          </span>
          共 <span class="font-medium text-foreground">{{ data.length }}</span> 条记录
        </span>
        <span class="text-muted-foreground">|</span>
        <span class="text-muted-foreground">
          {{ selectedRows.length > 0 ? '选中合计' : '合计' }}：
          <span class="font-bold text-red-500">{{ formatNumber(summary.total, 2) }}</span>
        </span>
      </div>

      <!-- 表格 -->
      <div class="rounded-md border overflow-auto">
        <!-- 车辆表格 -->
        <Table v-if="activeTab === 'che'" class="min-w-[1024px]">
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead class="w-12 whitespace-nowrap">
                <Checkbox
                  :checked="allSelected"
                  @update:checked="toggleSelectAll"
                />
              </TableHead>
              <TableHead class="whitespace-nowrap">月份</TableHead>
              <TableHead class="whitespace-nowrap">车号</TableHead>
              <TableHead class="text-right whitespace-nowrap">配件</TableHead>
              <TableHead class="text-right whitespace-nowrap">修理费</TableHead>
              <TableHead class="text-right whitespace-nowrap">年检二维费用</TableHead>
              <TableHead class="text-right whitespace-nowrap">驾驶员工资</TableHead>
              <TableHead class="text-right whitespace-nowrap">油费</TableHead>
              <TableHead class="text-right whitespace-nowrap">过路费</TableHead>
              <TableHead class="text-right whitespace-nowrap">罚款</TableHead>
              <TableHead class="text-right whitespace-nowrap">其它</TableHead>
              <TableHead class="text-right whitespace-nowrap">合计</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell colspan="12" class="h-24 text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
            <TableRow v-else-if="data.length === 0">
              <TableCell colspan="12" class="h-24 text-center text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
            <TableRow
              v-else
              v-for="row in data"
              :key="`${row.name}-${row.month}`"
              class="cursor-pointer"
              :class="{ 'bg-blue-50 border-l-2 border-l-blue-500': isSelected(row) }"
              @click="toggleSelect(row)"
            >
              <TableCell @click.stop @click="toggleSelect(row)">
                <CheckSquare v-if="isSelected(row)" class="w-4 h-4 text-blue-500" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </TableCell>
              <TableCell class="font-medium">{{ row.month }}</TableCell>
              <TableCell>{{ row.name }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.fittings, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.repair, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.annual_survey, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.salary, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.oil, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.toll, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.fine, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.other, 2) }}</TableCell>
              <TableCell class="text-right font-mono font-bold text-red-500">{{ formatNumber(row.total, 2) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- 船舶表格 -->
        <Table v-else class="min-w-[800px]">
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead class="w-12 whitespace-nowrap">
                <Checkbox
                  :checked="allSelected"
                  @update:checked="toggleSelectAll"
                />
              </TableHead>
              <TableHead class="whitespace-nowrap">月份</TableHead>
              <TableHead class="text-right whitespace-nowrap">保险费用</TableHead>
              <TableHead class="text-right whitespace-nowrap">吊装费用</TableHead>
              <TableHead class="text-right whitespace-nowrap">港口建设费</TableHead>
              <TableHead class="text-right whitespace-nowrap">辅料</TableHead>
              <TableHead class="text-right whitespace-nowrap">其它</TableHead>
              <TableHead class="text-right whitespace-nowrap">合计</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell colspan="8" class="h-24 text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
            <TableRow v-else-if="data.length === 0">
              <TableCell colspan="8" class="h-24 text-center text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
            <TableRow
              v-else
              v-for="row in data"
              :key="`${row.name}-${row.month}`"
              class="cursor-pointer"
              :class="{ 'bg-blue-50 border-l-2 border-l-blue-500': isSelected(row) }"
              @click="toggleSelect(row)"
            >
              <TableCell @click.stop @click="toggleSelect(row)">
                <CheckSquare v-if="isSelected(row)" class="w-4 h-4 text-blue-500" />
                <Square v-else class="w-4 h-4 text-muted-foreground" />
              </TableCell>
              <TableCell class="font-medium">{{ row.month }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.ic, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.hc, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.pcc, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.aux, 2) }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatNumber(row.other, 2) }}</TableCell>
              <TableCell class="text-right font-mono font-bold text-red-500">{{ formatNumber(row.total, 2) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <VesselFixedCostDialog
      v-model:open="showDialog"
      :edit-data="editItem"
      :is-vehicle="activeTab === 'che'"
      @success="loadData"
    />

    <AlertDialog :open="showDeleteAlert" @update:open="showDeleteAlert = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除选中的 {{ selectedRows.length }} 条记录吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 导出对话框 -->
    <ExportDialog
      v-model:open="showExportDialog"
      :default-file-name="exportFileName"
      @confirm="confirmExport"
    />
  </BasicPage>
</template>
