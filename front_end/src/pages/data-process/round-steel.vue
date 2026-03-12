<script setup lang="ts">
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import type { ShipmentBatch } from '@/services/api/data-process.api'
import { formatDate, formatNumber } from '@/utils/format'

import { BasicPage } from '@/components/global-layout'
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
import {
  deleteShipmentBatch,
  getShipmentBatches,
  getShipmentDetails,
  updateShipmentDetail,
} from '@/services/api/data-process.api'

const router = useRouter()
const loading = ref(false)
const batches = ref<ShipmentBatch[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

// Detail dialog
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const detailBatch = ref<ShipmentBatch | null>(null)
const detailRows = ref<any[]>([])
const detailPage = ref(1)
const detailTotal = ref(0)
const detailLimit = 50

// Edit dialog
const showEditDialog = ref(false)
const editLoading = ref(false)
const editBatch = ref<ShipmentBatch | null>(null)
const editRows = ref<any[]>([])
const editPage = ref(1)
const editTotal = ref(0)
const editLimit = 50
const editingRowId = ref<string | null>(null)
const editForm = ref<Record<string, any>>({})
const savingRow = ref(false)

// Delete dialog
const showDeleteAlert = ref(false)
const deletingBatch = ref<ShipmentBatch | null>(null)
const deleting = ref(false)

async function loadData() {
  loading.value = true
  try {
    const result = await getShipmentBatches({
      productType: 'round-steel',
      page: page.value,
      limit: limit.value,
    })
    if (result.ok) {
      batches.value = result.data
      total.value = result.total
    }
  }
  catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

function formatWeight(num: number | string | null | undefined) {
  return formatNumber(num, 2) || ''
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadData()
}

// ---- Detail ----
async function openDetail(batch: ShipmentBatch) {
  detailBatch.value = batch
  detailPage.value = 1
  showDetailDialog.value = true
  await loadDetailRows()
}

async function loadDetailRows() {
  detailLoading.value = true
  try {
    const result = await getShipmentDetails({
      batchId: detailBatch.value!.batchId,
      page: detailPage.value,
      limit: detailLimit,
    })
    if (result.ok) {
      detailRows.value = result.data
      detailTotal.value = result.total
    }
  }
  catch (e: any) {
    toast.error('加载明细失败', { description: e.message })
  }
  finally {
    detailLoading.value = false
  }
}

function handleDetailPageChange(newPage: number) {
  detailPage.value = newPage
  loadDetailRows()
}

// ---- Edit ----
async function openEdit(batch: ShipmentBatch) {
  editBatch.value = batch
  editPage.value = 1
  editingRowId.value = null
  showEditDialog.value = true
  await loadEditRows()
}

async function loadEditRows() {
  editLoading.value = true
  try {
    const result = await getShipmentDetails({
      batchId: editBatch.value!.batchId,
      page: editPage.value,
      limit: editLimit,
    })
    if (result.ok) {
      editRows.value = result.data
      editTotal.value = result.total
    }
  }
  catch (e: any) {
    toast.error('加载明细失败', { description: e.message })
  }
  finally {
    editLoading.value = false
  }
}

function handleEditPageChange(newPage: number) {
  editPage.value = newPage
  editingRowId.value = null
  loadEditRows()
}

function startEditRow(row: any) {
  editingRowId.value = row._id
  editForm.value = {
    vehicleNo: row.vehicleNo || '',
    contractNo: row.contractNo || '',
    loadingListNo: row.loadingListNo || '',
    customerName: row.customerName || '',
    quantity: row.quantity,
    weight: row.weight,
  }
}

function cancelEditRow() {
  editingRowId.value = null
  editForm.value = {}
}

async function saveEditRow() {
  if (!editingRowId.value)
    return
  savingRow.value = true
  try {
    const result = await updateShipmentDetail(editingRowId.value, editForm.value)
    if (result.ok) {
      toast.success('保存成功')
      editingRowId.value = null
      await loadEditRows()
      loadData()
    }
    else {
      toast.error('保存失败', { description: result.error })
    }
  }
  catch (e: any) {
    toast.error('保存失败', { description: e.message })
  }
  finally {
    savingRow.value = false
  }
}

// ---- Delete ----
function confirmDeleteBatch(batch: ShipmentBatch) {
  deletingBatch.value = batch
  showDeleteAlert.value = true
}

async function handleDelete() {
  if (!deletingBatch.value)
    return
  deleting.value = true
  try {
    const result = await deleteShipmentBatch(deletingBatch.value.batchId)
    if (result.ok) {
      toast.success(`已删除批次，共 ${result.data?.deletedCount} 条记录`)
      showDeleteAlert.value = false
      loadData()
    }
    else {
      toast.error('删除失败', { description: result.error })
    }
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
  finally {
    deleting.value = false
  }
}

const editableFields = [
  { key: 'vehicleNo', label: '车号' },
  { key: 'contractNo', label: '合同号' },
  { key: 'loadingListNo', label: '装车单号' },
  { key: 'customerName', label: '客户名称' },
  { key: 'quantity', label: '支数', type: 'number' },
  { key: 'weight', label: '重量', type: 'number' },
]

onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="圆钢数据处理" description="已保存的批次记录">
    <template #actions>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">刷新</span>
        </UiButton>
        <UiButton size="sm" @click="router.push('/data-process/round-steel-create')">
          <Plus class="w-4 h-4 sm:mr-1" />
          <span>新建</span>
        </UiButton>
      </div>
    </template>

    <!-- 桌面端表格 -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="text-sm w-full">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left whitespace-nowrap">
              批次号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建人
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建时间
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              条数
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              总重量
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              装车单号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              车号
            </th>
            <th class="p-2 text-center whitespace-nowrap">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="batch in batches"
            :key="batch.batchId"
            class="border-t hover:bg-muted/30"
          >
            <td class="p-2 font-mono text-xs">
              {{ batch.batchId.slice(-8) }}
            </td>
            <td class="p-2">
              {{ batch.createdBy }}
            </td>
            <td class="p-2">
              {{ formatDate(batch.createdAt) }}
            </td>
            <td class="p-2 text-right">
              {{ batch.rowCount }}
            </td>
            <td class="p-2 text-right">
              {{ formatWeight(batch.totalWeight) }}
            </td>
            <td class="p-2">
              {{ batch.loadingListNos.join(', ') }}
            </td>
            <td class="p-2">
              {{ batch.vehicleNos.join(', ') }}
            </td>
            <td class="p-2">
              <div class="flex items-center justify-center gap-1">
                <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0" title="查看明细" @click="openDetail(batch)">
                  <Eye class="w-4 h-4" />
                </UiButton>
                <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0" title="修改" @click="openEdit(batch)">
                  <Pencil class="w-4 h-4" />
                </UiButton>
                <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0 text-destructive hover:text-destructive" title="删除" @click="confirmDeleteBatch(batch)">
                  <Trash2 class="w-4 h-4" />
                </UiButton>
              </div>
            </td>
          </tr>
          <tr v-if="batches.length === 0 && !loading">
            <td colspan="8" class="p-8 text-center text-muted-foreground">
              暂无数据，点击"新建"开始处理圆钢数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片视图 -->
    <div class="lg:hidden space-y-2">
      <div
        v-for="batch in batches"
        :key="batch.batchId"
        class="border rounded-lg p-3"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-xs text-muted-foreground">{{ batch.batchId.slice(-8) }}</span>
          <span class="text-xs text-muted-foreground">{{ formatDate(batch.createdAt) }}</span>
        </div>
        <div class="text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-muted-foreground">创建人:</span>
            <span>{{ batch.createdBy }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">条数:</span>
            <span>{{ batch.rowCount }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">总重量:</span>
            <span>{{ formatWeight(batch.totalWeight) }}</span>
          </div>
          <div v-if="batch.loadingListNos.length > 0">
            <span class="text-muted-foreground">装车单号:</span>
            <span class="ml-1">{{ batch.loadingListNos.join(', ') }}</span>
          </div>
          <div v-if="batch.vehicleNos.length > 0">
            <span class="text-muted-foreground">车号:</span>
            <span class="ml-1">{{ batch.vehicleNos.join(', ') }}</span>
          </div>
        </div>
        <div class="flex items-center justify-end gap-1 mt-2 pt-2 border-t">
          <UiButton variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openDetail(batch)">
            <Eye class="w-3.5 h-3.5 mr-1" />
            明细
          </UiButton>
          <UiButton variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEdit(batch)">
            <Pencil class="w-3.5 h-3.5 mr-1" />
            修改
          </UiButton>
          <UiButton variant="ghost" size="sm" class="h-7 px-2 text-xs text-destructive hover:text-destructive" @click="confirmDeleteBatch(batch)">
            <Trash2 class="w-3.5 h-3.5 mr-1" />
            删除
          </UiButton>
        </div>
      </div>

      <div v-if="batches.length === 0 && !loading" class="border rounded-lg p-8 text-center text-muted-foreground">
        暂无数据，点击"新建"开始处理圆钢数据
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > limit" class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="text-xs sm:text-sm text-muted-foreground">
        共 {{ total }} 条
      </div>
      <div class="flex items-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page <= 1"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </UiButton>
        <span class="text-xs sm:text-sm">{{ page }} / {{ Math.ceil(total / limit) || 1 }}</span>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page >= Math.ceil(total / limit)"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </UiButton>
      </div>
    </div>
  </BasicPage>

  <!-- 查看明细 Dialog -->
  <UiDialog v-model:open="showDetailDialog">
    <UiDialogContent class="w-[95vw] lg:w-[80vw] sm:max-w-none max-h-[85vh] flex flex-col">
      <UiDialogHeader>
        <UiDialogTitle>批次明细 - {{ detailBatch?.batchId.slice(-8) }}</UiDialogTitle>
        <UiDialogDescription>
          创建人: {{ detailBatch?.createdBy }} | 创建时间: {{ formatDate(detailBatch?.createdAt) }} | 共 {{ detailTotal }} 条
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="flex-1 overflow-auto border rounded-lg">
        <table class="text-sm w-full">
          <thead class="bg-muted/50 sticky top-0">
            <tr>
              <th class="p-2 text-left whitespace-nowrap">捆号</th>
              <th class="p-2 text-left whitespace-nowrap">订单号</th>
              <th class="p-2 text-left whitespace-nowrap">项次</th>
              <th class="p-2 text-right whitespace-nowrap">支数</th>
              <th class="p-2 text-right whitespace-nowrap">重量</th>
              <th class="p-2 text-right whitespace-nowrap">直径</th>
              <th class="p-2 text-right whitespace-nowrap">长度</th>
              <th class="p-2 text-left whitespace-nowrap">牌号</th>
              <th class="p-2 text-left whitespace-nowrap">客户名称</th>
              <th class="p-2 text-left whitespace-nowrap">装车单号</th>
              <th class="p-2 text-left whitespace-nowrap">车号</th>
              <th class="p-2 text-left whitespace-nowrap">合同号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detailRows" :key="row._id" class="border-t hover:bg-muted/30">
              <td class="p-2">{{ row.bundleNo }}</td>
              <td class="p-2">{{ row.orderNo }}</td>
              <td class="p-2">{{ row.orderItemNo }}</td>
              <td class="p-2 text-right">{{ row.quantity }}</td>
              <td class="p-2 text-right">{{ formatWeight(row.weight) }}</td>
              <td class="p-2 text-right">{{ row.thickness }}</td>
              <td class="p-2 text-right">{{ row.length }}</td>
              <td class="p-2">{{ row.brandNo }}</td>
              <td class="p-2">{{ row.customerName }}</td>
              <td class="p-2">{{ row.loadingListNo }}</td>
              <td class="p-2">{{ row.vehicleNo }}</td>
              <td class="p-2">{{ row.contractNo }}</td>
            </tr>
            <tr v-if="detailRows.length === 0 && !detailLoading">
              <td colspan="12" class="p-4 text-center text-muted-foreground">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 明细分页 -->
      <div v-if="detailTotal > detailLimit" class="flex items-center justify-between pt-2">
        <span class="text-xs text-muted-foreground">共 {{ detailTotal }} 条</span>
        <div class="flex items-center gap-2">
          <UiButton variant="outline" size="sm" :disabled="detailPage <= 1" @click="handleDetailPageChange(detailPage - 1)">
            上一页
          </UiButton>
          <span class="text-xs">{{ detailPage }} / {{ Math.ceil(detailTotal / detailLimit) || 1 }}</span>
          <UiButton variant="outline" size="sm" :disabled="detailPage >= Math.ceil(detailTotal / detailLimit)" @click="handleDetailPageChange(detailPage + 1)">
            下一页
          </UiButton>
        </div>
      </div>
    </UiDialogContent>
  </UiDialog>

  <!-- 修改 Dialog -->
  <UiDialog v-model:open="showEditDialog">
    <UiDialogContent class="w-[95vw] lg:w-[85vw] sm:max-w-none max-h-[85vh] flex flex-col">
      <UiDialogHeader>
        <UiDialogTitle>修改批次 - {{ editBatch?.batchId.slice(-8) }}</UiDialogTitle>
        <UiDialogDescription>
          点击行右侧编辑按钮修改记录，共 {{ editTotal }} 条
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="flex-1 overflow-auto border rounded-lg">
        <table class="text-sm w-full">
          <thead class="bg-muted/50 sticky top-0">
            <tr>
              <th class="p-2 text-left whitespace-nowrap">捆号</th>
              <th class="p-2 text-left whitespace-nowrap">订单号</th>
              <th class="p-2 text-left whitespace-nowrap">项次</th>
              <th class="p-2 text-right whitespace-nowrap">支数</th>
              <th class="p-2 text-right whitespace-nowrap">重量</th>
              <th class="p-2 text-left whitespace-nowrap">客户名称</th>
              <th class="p-2 text-left whitespace-nowrap">装车单号</th>
              <th class="p-2 text-left whitespace-nowrap">车号</th>
              <th class="p-2 text-left whitespace-nowrap">合同号</th>
              <th class="p-2 text-center whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in editRows" :key="row._id" class="border-t hover:bg-muted/30">
              <template v-if="editingRowId === row._id">
                <td class="p-2">{{ row.bundleNo }}</td>
                <td class="p-2">{{ row.orderNo }}</td>
                <td class="p-2">{{ row.orderItemNo }}</td>
                <td class="p-1">
                  <input v-model.number="editForm.quantity" type="number" class="w-16 border rounded px-1 py-0.5 text-sm text-right">
                </td>
                <td class="p-1">
                  <input v-model.number="editForm.weight" type="number" step="0.01" class="w-20 border rounded px-1 py-0.5 text-sm text-right">
                </td>
                <td class="p-1">
                  <input v-model="editForm.customerName" class="w-24 border rounded px-1 py-0.5 text-sm">
                </td>
                <td class="p-1">
                  <input v-model="editForm.loadingListNo" class="w-24 border rounded px-1 py-0.5 text-sm">
                </td>
                <td class="p-1">
                  <input v-model="editForm.vehicleNo" class="w-20 border rounded px-1 py-0.5 text-sm">
                </td>
                <td class="p-1">
                  <input v-model="editForm.contractNo" class="w-24 border rounded px-1 py-0.5 text-sm">
                </td>
                <td class="p-2">
                  <div class="flex items-center justify-center gap-1">
                    <UiButton size="sm" class="h-6 px-2 text-xs" :disabled="savingRow" @click="saveEditRow">
                      保存
                    </UiButton>
                    <UiButton variant="outline" size="sm" class="h-6 px-2 text-xs" @click="cancelEditRow">
                      取消
                    </UiButton>
                  </div>
                </td>
              </template>
              <template v-else>
                <td class="p-2">{{ row.bundleNo }}</td>
                <td class="p-2">{{ row.orderNo }}</td>
                <td class="p-2">{{ row.orderItemNo }}</td>
                <td class="p-2 text-right">{{ row.quantity }}</td>
                <td class="p-2 text-right">{{ formatWeight(row.weight) }}</td>
                <td class="p-2">{{ row.customerName }}</td>
                <td class="p-2">{{ row.loadingListNo }}</td>
                <td class="p-2">{{ row.vehicleNo }}</td>
                <td class="p-2">{{ row.contractNo }}</td>
                <td class="p-2">
                  <div class="flex items-center justify-center">
                    <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0" title="编辑" @click="startEditRow(row)">
                      <Pencil class="w-3.5 h-3.5" />
                    </UiButton>
                  </div>
                </td>
              </template>
            </tr>
            <tr v-if="editRows.length === 0 && !editLoading">
              <td colspan="10" class="p-4 text-center text-muted-foreground">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 编辑分页 -->
      <div v-if="editTotal > editLimit" class="flex items-center justify-between pt-2">
        <span class="text-xs text-muted-foreground">共 {{ editTotal }} 条</span>
        <div class="flex items-center gap-2">
          <UiButton variant="outline" size="sm" :disabled="editPage <= 1" @click="handleEditPageChange(editPage - 1)">
            上一页
          </UiButton>
          <span class="text-xs">{{ editPage }} / {{ Math.ceil(editTotal / editLimit) || 1 }}</span>
          <UiButton variant="outline" size="sm" :disabled="editPage >= Math.ceil(editTotal / editLimit)" @click="handleEditPageChange(editPage + 1)">
            下一页
          </UiButton>
        </div>
      </div>
    </UiDialogContent>
  </UiDialog>

  <!-- 删除确认 -->
  <AlertDialog :open="showDeleteAlert" @update:open="showDeleteAlert = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>确认删除</AlertDialogTitle>
        <AlertDialogDescription>
          确定要删除批次 {{ deletingBatch?.batchId.slice(-8) }} 吗？该批次共 {{ deletingBatch?.rowCount }} 条记录，删除后不可恢复。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">
          取消
        </AlertDialogCancel>
        <AlertDialogAction :disabled="deleting" class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="handleDelete">
          {{ deleting ? '删除中...' : '确认删除' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
