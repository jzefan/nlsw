<script setup lang="ts">
// @ts-nocheck
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Edit, FileDown, Plus, Trash2 } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

import DrayageForkliftDialog from './components/drayage-forklift-dialog.vue'
import { deleteDrayageForklift, getDrayageForklifts, type DrayageForklift } from '@/services/api/financial.api'
import { formatNumber } from '@/utils/format'

const data = ref<DrayageForklift[]>([])
const loading = ref(false)
const selectedRows = ref<DrayageForklift[]>([])
const showDialog = ref(false)
const editItem = ref<DrayageForklift | null>(null)
const showDeleteAlert = ref(false)

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
function toggleSelect(row: DrayageForklift) {
  const index = selectedRows.value.findIndex(item => item.month === row.month)
  if (index >= 0) {
    selectedRows.value.splice(index, 1)
  }
  else {
    selectedRows.value.push(row)
  }
}

// 判断是否选中
function isSelected(row: DrayageForklift) {
  return selectedRows.value.some(item => item.month === row.month)
}

async function loadData() {
  loading.value = true
  try {
    const res = await getDrayageForklifts()
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
      await deleteDrayageForklift(row.month)
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
  exportWithPicker({
    fileName: `短驳叉车应收款_${dateStr}`,
    sheetName: '短驳叉车应收款',
    columns: [
      { header: '月份', key: 'month' },
      { header: '短驳应收款', key: 'drayage', type: 'number' },
      { header: '叉车应收款', key: 'forklift', type: 'number' },
    ],
    data: data.value,
  })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="短驳/叉车应收款管理" description="管理每月短驳和叉车的应收款项">
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

    <div class="py-4">
      <!-- 统计信息 -->
      <div v-if="selectedRows.length > 0" class="mb-4 text-sm text-muted-foreground">
        已选择 {{ selectedRows.length }} 条记录
      </div>

      <!-- 表格 -->
      <div class="rounded-md border overflow-auto">
        <Table class="min-w-[600px]">
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead class="w-12 whitespace-nowrap">
                <Checkbox
                  :checked="allSelected"
                  @update:checked="toggleSelectAll"
                />
              </TableHead>
              <TableHead class="whitespace-nowrap">月份</TableHead>
              <TableHead class="text-right whitespace-nowrap">短驳应收款</TableHead>
              <TableHead class="text-right whitespace-nowrap">叉车应收款</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell colspan="4" class="h-24 text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
            <TableRow v-else-if="data.length === 0">
              <TableCell colspan="4" class="h-24 text-center text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
            <TableRow
              v-else
              v-for="row in data"
              :key="row.month"
              class="cursor-pointer"
              :class="{ 'bg-muted/50': isSelected(row) }"
              @click="toggleSelect(row)"
            >
              <TableCell @click.stop>
                <Checkbox
                  :checked="isSelected(row)"
                  @update:checked="toggleSelect(row)"
                />
              </TableCell>
              <TableCell class="font-medium">
                {{ row.month }}
              </TableCell>
              <TableCell class="text-right font-mono">
                {{ formatNumber(row.drayage, 2) }}
              </TableCell>
              <TableCell class="text-right font-mono">
                {{ formatNumber(row.forklift, 2) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <DrayageForkliftDialog
      v-model:open="showDialog"
      :edit-data="editItem"
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
