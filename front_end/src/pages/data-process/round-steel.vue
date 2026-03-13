<script setup lang="ts">
import { Maximize2, Minimize2, Save } from 'lucide-vue-next'
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import type { ShipmentBatch } from '@/services/api/data-process.api'
import type { LoadingListGroup } from '@/utils/excel-transform'
import { formatDate, formatNumber } from '@/utils/format'

import { BasicPage } from '@/components/global-layout'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  deleteShipmentBatch,
  detailRowsToGroups,
  getShipmentBatches,
  getShipmentDetails,
  updateShipmentDetail,
} from '@/services/api/data-process.api'

import LoadingListEditor from './components/LoadingListEditor.vue'

const router = useRouter()
const loading = ref(false)
const batches = ref<ShipmentBatch[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

// Shared editor dialog (view + edit)
const showEditorDialog = ref(false)
const editorMaximized = ref(false)
const editorMode = ref<'view' | 'edit'>('view')
const editorBatch = ref<ShipmentBatch | null>(null)
const editorLoading = ref(false)
const editorGroups = ref<LoadingListGroup[]>([])
const editorChecked = ref<Set<string>>(new Set())
const editorOriginalRows = ref<any[]>([]) // original API rows for diffing on save
const editorSaving = ref(false)

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

const pageSizeOptions = [10, 20, 50, 100]
const totalPages = computed(() => Math.ceil(total.value / limit.value) || 1)

function handlePageChange(newPage: number) {
  page.value = newPage
  loadData()
}

function handlePageSizeChange(newSize: unknown) {
  if (newSize == null) return
  limit.value = Number(newSize)
  page.value = 1
  loadData()
}

// ---- Editor Dialog (view / edit) ----
async function openEditor(batch: ShipmentBatch, mode: 'view' | 'edit') {
  editorBatch.value = batch
  editorMode.value = mode
  editorGroups.value = []
  editorChecked.value = new Set()
  editorOriginalRows.value = []
  showEditorDialog.value = true
  await loadEditorData(batch.batchId)
}

async function loadEditorData(batchId: string) {
  editorLoading.value = true
  try {
    // Load all rows (no pagination - editor needs all data)
    const result = await getShipmentDetails({
      batchId,
      limit: 9999,
    })
    if (result.ok) {
      editorOriginalRows.value = JSON.parse(JSON.stringify(result.data))
      editorGroups.value = detailRowsToGroups(result.data)
      // Auto-check all groups
      editorChecked.value = new Set(editorGroups.value.map(g => g.loadingListNo))
    }
  }
  catch (e: any) {
    toast.error('加载明细失败', { description: e.message })
  }
  finally {
    editorLoading.value = false
  }
}

async function handleEditorSave() {
  editorSaving.value = true
  try {
    // Build a map of original rows by _id
    const originalMap = new Map<string, any>()
    for (const row of editorOriginalRows.value) {
      originalMap.set(row._id, row)
    }

    // Collect changed rows
    const updates: { id: string, changes: Record<string, any> }[] = []
    for (const group of editorGroups.value) {
      for (const row of group.rows) {
        if (!row._id) continue
        const orig = originalMap.get(row._id)
        if (!orig) continue

        const changes: Record<string, any> = {}
        // Check vehicleNo (group level → each row)
        if (group.vehicleNo !== (orig.vehicleNo || '')) {
          changes.vehicleNo = group.vehicleNo
        }
        // Check row-level fields
        if (row.contractNo !== (orig.contractNo || '')) changes.contractNo = row.contractNo
        if (row.quantity !== (orig.quantity || 0)) changes.quantity = row.quantity
        if (row.weight !== (orig.weight || 0)) changes.weight = row.weight
        if (row.customerName !== (orig.customerName || '')) changes.customerName = row.customerName

        if (Object.keys(changes).length > 0) {
          updates.push({ id: row._id, changes })
        }
      }
    }

    if (updates.length === 0) {
      toast.info('没有修改')
      return
    }

    let successCount = 0
    let failCount = 0
    for (const { id, changes } of updates) {
      const result = await updateShipmentDetail(id, changes)
      if (result.ok) {
        successCount++
      }
      else {
        failCount++
      }
    }

    if (failCount === 0) {
      toast.success(`保存成功，更新了 ${successCount} 条记录`)
      showEditorDialog.value = false
      loadData()
    }
    else {
      toast.warning(`部分保存失败：成功 ${successCount}，失败 ${failCount}`)
    }
  }
  catch (e: any) {
    toast.error('保存失败', { description: e.message })
  }
  finally {
    editorSaving.value = false
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
            <th class="p-2 text-center whitespace-nowrap w-12">序号</th>
            <th class="p-2 text-left whitespace-nowrap">装车单号/车号</th>
            <th class="p-2 text-right whitespace-nowrap">条数</th>
            <th class="p-2 text-right whitespace-nowrap">总重量</th>
            <th class="p-2 text-left whitespace-nowrap">创建人</th>
            <th class="p-2 text-left whitespace-nowrap">创建时间</th>
            <th class="p-2 text-center whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(batch, index) in batches"
            :key="batch.batchId"
            class="border-t hover:bg-muted/30"
          >
            <td class="p-2 text-center text-muted-foreground">
              {{ (page - 1) * limit + index + 1 }}
            </td>
            <td class="p-2">
              <div class="flex flex-wrap gap-1">
                <Badge v-for="pair in batch.loadingVehiclePairs" :key="pair" variant="secondary" class="text-xs">
                  {{ pair }}
                </Badge>
              </div>
            </td>
            <td class="p-2 text-right">
              {{ batch.rowCount }}
            </td>
            <td class="p-2 text-right">
              {{ formatWeight(batch.totalWeight) }}
            </td>
            <td class="p-2">
              {{ batch.createdBy }}
            </td>
            <td class="p-2">
              {{ formatDate(batch.createdAt) }}
            </td>
            <td class="p-2">
              <TooltipProvider>
                <div class="flex items-center justify-center gap-1">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0" @click="openEditor(batch, 'view')">
                        <Eye class="w-4 h-4" />
                      </UiButton>
                    </TooltipTrigger>
                    <TooltipContent>查看明细</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0" @click="openEditor(batch, 'edit')">
                        <Pencil class="w-4 h-4" />
                      </UiButton>
                    </TooltipTrigger>
                    <TooltipContent>编辑</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <UiButton variant="ghost" size="sm" class="h-7 w-7 p-0 text-destructive hover:text-destructive" @click="confirmDeleteBatch(batch)">
                        <Trash2 class="w-4 h-4" />
                      </UiButton>
                    </TooltipTrigger>
                    <TooltipContent>删除</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </td>
          </tr>
          <tr v-if="batches.length === 0 && !loading">
            <td colspan="7" class="p-8 text-center text-muted-foreground">
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
          <div v-if="batch.loadingVehiclePairs && batch.loadingVehiclePairs.length > 0">
            <span class="text-muted-foreground">装车单号/车号:</span>
            <div class="flex flex-wrap gap-1 mt-1">
              <Badge v-for="pair in batch.loadingVehiclePairs" :key="pair" variant="secondary" class="text-xs">
                {{ pair }}
              </Badge>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-1 mt-2 pt-2 border-t">
          <UiButton variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEditor(batch, 'view')">
            <Eye class="w-3.5 h-3.5 mr-1" />
            明细
          </UiButton>
          <UiButton variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEditor(batch, 'edit')">
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
    <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <span>共 {{ total }} 条</span>
        <span class="mx-1">|</span>
        <span>每页</span>
        <Select :model-value="String(limit)" @update:model-value="handlePageSizeChange">
          <SelectTrigger class="h-7 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="size in pageSizeOptions" :key="size" :value="String(size)">
              {{ size }} 条
            </SelectItem>
          </SelectContent>
        </Select>
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
        <span class="text-xs sm:text-sm">{{ page }} / {{ totalPages }}</span>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page >= totalPages"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </UiButton>
      </div>
    </div>
  </BasicPage>

  <!-- 查看/编辑 Dialog (共用 LoadingListEditor) -->
  <UiDialog v-model:open="showEditorDialog">
    <UiDialogContent
      :class="[
        'flex flex-col sm:max-w-none transition-all duration-200',
        editorMaximized ? 'w-[100vw] h-[100vh] rounded-none' : 'w-[95vw] lg:w-[85vw] h-[85vh]',
      ]"
    >
      <!-- Maximize button (aligned with close button) -->
      <UiTooltipProvider>
        <UiTooltip>
          <UiTooltipTrigger as-child>
            <button
              class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 text-muted-foreground"
              @click="editorMaximized = !editorMaximized"
            >
              <Minimize2 v-if="editorMaximized" class="w-4 h-4" />
              <Maximize2 v-else class="w-4 h-4" />
            </button>
          </UiTooltipTrigger>
          <UiTooltipContent>
            {{ editorMaximized ? '还原' : '最大化' }}
          </UiTooltipContent>
        </UiTooltip>
      </UiTooltipProvider>

      <UiDialogHeader class="flex-shrink-0">
        <UiDialogTitle>
          {{ editorMode === 'view' ? '查看明细' : '编辑批次' }}
        </UiDialogTitle>
        <UiDialogDescription>
          创建人: {{ editorBatch?.createdBy }} | 创建时间: {{ formatDate(editorBatch?.createdAt) }}
        </UiDialogDescription>
      </UiDialogHeader>

      <div v-if="editorLoading" class="flex-1 flex items-center justify-center py-12">
        <UiSpinner class="mr-2" />
        <span class="text-sm text-muted-foreground">加载中...</span>
      </div>

      <div v-else class="flex-1 overflow-hidden">
        <LoadingListEditor
          v-model="editorGroups"
          v-model:checked="editorChecked"
          :readonly="editorMode === 'view'"
        />
      </div>

      <!-- 编辑模式的保存按钮 -->
      <div v-if="editorMode === 'edit' && !editorLoading" class="flex-shrink-0 flex items-center justify-end gap-2 pt-3 border-t">
        <UiButton variant="outline" size="sm" @click="showEditorDialog = false">
          取消
        </UiButton>
        <UiButton size="sm" :disabled="editorSaving" @click="handleEditorSave">
          <UiSpinner v-if="editorSaving" class="mr-2" />
          <Save v-else class="w-4 h-4 mr-1" />
          保存修改
        </UiButton>
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
