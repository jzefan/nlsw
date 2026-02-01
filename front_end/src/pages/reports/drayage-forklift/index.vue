<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Plus, Trash2, FileDown, Edit } from 'lucide-vue-next'
import * as XLSX from 'xlsx'

import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'
import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
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

import { columns } from './components/columns'
import DrayageForkliftDialog from './components/drayage-forklift-dialog.vue'
import { getDrayageForklifts, deleteDrayageForklift, type DrayageForklift } from '@/services/api/financial.api'

const data = ref<DrayageForklift[]>([])
const loading = ref(false)
const selectedRows = ref<DrayageForklift[]>([])
const showDialog = ref(false)
const editItem = ref<DrayageForklift | null>(null)
const showDeleteAlert = ref(false)

const table = generateVueTable({
  data,
  columns,
})

// Watch row selection changes
import { watch } from 'vue'
watch(
  () => table.getState().rowSelection,
  () => {
    selectedRows.value = table.getSelectedRowModel().rows.map(row => row.original)
  },
  { deep: true }
)

async function loadData() {
  loading.value = true
  try {
    const res = await getDrayageForklifts()
    if (res.ok) {
      data.value = res.data
    } else {
      toast.error('加载数据失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('加载数据出错')
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  editItem.value = null
  showDialog.value = true
}

function handleEdit() {
  if (selectedRows.value.length !== 1) return
  editItem.value = selectedRows.value[0]
  showDialog.value = true
}

function handleDelete() {
  if (selectedRows.value.length === 0) return
  showDeleteAlert.value = true
}

async function confirmDelete() {
  try {
    // Delete one by one since backend only supports single delete
    // Or we could update backend to support batch delete
    // For now, let's assume we delete sequentially
    for (const row of selectedRows.value) {
      await deleteDrayageForklift(row.month)
    }
    toast.success('删除成功')
    selectedRows.value = [] // Clear selection
    loadData()
  } catch (error) {
    console.error(error)
    toast.error('删除失败')
  } finally {
    showDeleteAlert.value = false
  }
}

function handleExport() {
  const ws = XLSX.utils.json_to_sheet(data.value.map(item => ({
    '月份': item.month,
    '短驳应收款': item.drayage,
    '叉车应收款': item.forklift
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `drayage_forklift_${dateStr}.xlsx`)
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
      <DataTable 
        :columns="columns" 
        :data="data" 
        :loading="loading"
        :table="table"
      />
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
          <AlertDialogAction @click="confirmDelete">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </BasicPage>
</template>
