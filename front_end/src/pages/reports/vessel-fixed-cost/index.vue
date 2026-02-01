<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Plus, Trash2, FileDown, Edit, Search } from 'lucide-vue-next'
import * as XLSX from 'xlsx'

import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import AsyncCombobox from '@/components/common/AsyncCombobox.vue'

import { vehicleColumns, vesselColumns } from './components/columns'
import VesselFixedCostDialog from './components/vessel-fixed-cost-dialog.vue'
import { getVesselFixedCosts, deleteVesselFixedCost, type VesselFixedCost } from '@/services/api/vessel-fixed-cost.api'
import { getVehicles } from '@/services/api/data-dict.api'

const data = ref<VesselFixedCost[]>([])
const loading = ref(false)
const selectedRows = ref<VesselFixedCost[]>([])
const showDialog = ref(false)
const editItem = ref<VesselFixedCost | null>(null)
const showDeleteAlert = ref(false)

const activeTab = ref('che')
const searchName = ref('')
const searchMonth = ref('')

const columns = computed(() => activeTab.value === 'che' ? vehicleColumns : vesselColumns)

const table = generateVueTable({
  data,
  columns,
})

// Watch row selection changes
watch(
  () => table.getState().rowSelection,
  () => {
    selectedRows.value = table.getSelectedRowModel().rows.map(row => row.original)
  },
  { deep: true }
)

// Reset selection when tab changes
watch(activeTab, () => {
  table.setRowSelection({})
  loadData()
})

async function loadData() {
  loading.value = true
  try {
    const res = await getVesselFixedCosts({
      type: activeTab.value as 'che' | 'chuan',
      name: searchName.value || undefined,
      startDate: searchMonth.value ? `${searchMonth.value}` : undefined,
      endDate: searchMonth.value ? `${searchMonth.value}` : undefined
    })
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

async function searchVehicles(keyword: string) {
  const res = await getVehicles({ search: keyword, type: '车', limit: 20 })
  if (res.ok) {
    return res.data.map(v => ({ label: v.name, value: v.name }))
  }
  return []
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
    for (const row of selectedRows.value) {
      await deleteVesselFixedCost(row.name, row.month)
    }
    toast.success('删除成功')
    table.setRowSelection({})
    loadData()
  } catch (error) {
    console.error(error)
    toast.error('删除失败')
  } finally {
    showDeleteAlert.value = false
  }
}

function handleExport() {
  const headers = activeTab.value === 'che' 
    ? ['月份', '车号', '配件', '修理费', '年检二维费用', '驾驶员工资', '油费', '过路费', '罚款', '其它', '合计']
    : ['月份', '保险费用', '吊装费用', '港口建设费', '辅料', '其它', '合计']
  
  const exportData = data.value.map(item => {
    if (activeTab.value === 'che') {
      return {
        '月份': item.month,
        '车号': item.name,
        '配件': item.fittings,
        '修理费': item.repair,
        '年检二维费用': item.annual_survey,
        '驾驶员工资': item.salary,
        '油费': item.oil,
        '过路费': item.toll,
        '罚款': item.fine,
        '其它': item.other,
        '合计': item.total
      }
    } else {
      return {
        '月份': item.month,
        '保险费用': item.ic,
        '吊装费用': item.hc,
        '港口建设费': item.pcc,
        '辅料': item.aux,
        '其它': item.other,
        '合计': item.total
      }
    }
  })

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `vessel_fixed_cost_${activeTab.value}_${dateStr}.xlsx`)
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
            <TabsTrigger value="che">车</TabsTrigger>
            <TabsTrigger value="chuan">船</TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2" v-if="activeTab === 'che'">
            <Label>车船名</Label>
            <div class="w-[200px]">
              <AsyncCombobox
                v-model="searchName"
                :search-fn="searchVehicles"
                placeholder="搜索车船..."
                class="h-9"
              />
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <Label>月份</Label>
            <Input type="month" v-model="searchMonth" class="w-[150px] h-9" />
          </div>

          <Button @click="loadData" size="sm">
            <Search class="mr-2 h-4 w-4" />
            查询
          </Button>
        </div>
      </div>

      <div class="border rounded-md">
        <DataTable 
          :columns="columns" 
          :data="data" 
          :loading="loading"
          :table="table"
        />
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
          <AlertDialogAction @click="confirmDelete">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </BasicPage>
</template>
