<script setup lang="ts">
import { ArrowLeft, ArrowRight, CheckCircle, ChevronDown, ChevronUp, Download, FileSpreadsheet, RefreshCcw, Save, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { ColumnDef, LoadingListGroup, ParsedFile } from '@/utils/excel-transform'

import { BasicPage } from '@/components/global-layout'
import { saveShipmentDetail } from '@/services/api/data-process.api'
import {
  buildSavePayload,
  fieldNameMap,
  generateOutputExcelV2,
  groupByLoadingList,
  mergeFiles,
  parseMultipleFiles,
  roundSteelV2RequiredKeys,
  validateRequiredColumns,
} from '@/utils/excel-transform'

import FilePreviewCard from './components/FilePreviewCard.vue'
import FileUploader from './components/FileUploader.vue'
import LoadingListEditor from './components/LoadingListEditor.vue'

// Step state (1-4)
const currentStep = ref(1)
const loading = ref(false)
const saving = ref(false)

// Step 1: File upload
const uploadedFiles = ref<File[]>([])
const parsedFiles = ref<ParsedFile[]>([])

// Step 2: Preview
const activeFileTab = ref('')
const globalColumnDefs = ref<ColumnDef[]>([])

// Column toggle confirmation dialog
const showColumnConfirm = ref(false)
const pendingColumnKey = ref('')
const pendingColumnAction = ref<'select' | 'deselect'>('select')

// Validation state
const validationError = ref('')

// Step 3: Edit by loading list groups
const loadingListGroups = ref<LoadingListGroup[]>([])
const checkedLoadingListNos = ref<Set<string>>(new Set())

// Step 4: Export & Save results
const savedBatchId = ref('')

// Checked groups (for stats and Step 4)
const checkedGroups = computed(() =>
  loadingListGroups.value.filter(g => checkedLoadingListNos.value.has(g.loadingListNo)),
)

// Step 4: expanded groups for detail view
const expandedStep4Groups = ref<Set<string>>(new Set())

function toggleStep4Group(loadingListNo: string) {
  const updated = new Set(expandedStep4Groups.value)
  if (updated.has(loadingListNo)) {
    updated.delete(loadingListNo)
  }
  else {
    updated.add(loadingListNo)
  }
  expandedStep4Groups.value = updated
}

function handleDeleteRow(loadingListNo: string, rowIndex: number) {
  const groupIdx = loadingListGroups.value.findIndex(g => g.loadingListNo === loadingListNo)
  if (groupIdx < 0) return

  const group = loadingListGroups.value[groupIdx]
  if (group.rows.length <= 1) {
    // Last row — remove the entire group and uncheck it
    loadingListGroups.value = loadingListGroups.value.filter(g => g.loadingListNo !== loadingListNo)
    const updated = new Set(checkedLoadingListNos.value)
    updated.delete(loadingListNo)
    checkedLoadingListNos.value = updated
    return
  }

  const newRows = [...group.rows]
  newRows.splice(rowIndex, 1)
  const newGroups = [...loadingListGroups.value]
  newGroups[groupIdx] = {
    ...group,
    rows: newRows,
    subtotalQuantity: newRows.reduce((s, r) => s + r.quantity, 0),
    subtotalWeight: newRows.reduce((s, r) => s + r.weight, 0),
  }
  loadingListGroups.value = newGroups
}

// Stats
const totalRows = computed(() =>
  parsedFiles.value.reduce((sum, f) => sum + f.rowCount, 0),
)
const totalWeight = computed(() =>
  parsedFiles.value.reduce((sum, f) =>
    sum + f.data.reduce((s, r) => s + r.weight, 0), 0),
)

// Step navigation
function canGoNext(): boolean {
  if (currentStep.value === 1) {
    return uploadedFiles.value.length > 0
  }
  if (currentStep.value === 2) {
    return parsedFiles.value.length > 0
      && parsedFiles.value.some(f => f.rowCount > 0)
      && !validationError.value
  }
  if (currentStep.value === 3) {
    return loadingListGroups.value.length > 0
  }
  return true
}

function goBack() {
  if (currentStep.value === 2) {
    currentStep.value = 1
  }
  else if (currentStep.value === 3) {
    currentStep.value = 2
  }
  else if (currentStep.value === 4) {
    currentStep.value = 3
  }
}

async function goNext() {
  if (currentStep.value === 1) {
    // Parse files
    loading.value = true
    try {
      parsedFiles.value = await parseMultipleFiles(uploadedFiles.value, 'round-steel')
      if (parsedFiles.value.every(f => f.rowCount === 0)) {
        toast.warning('未能从文件中解析到有效数据，请检查文件格式')
        return
      }
      if (parsedFiles.value.length > 0) {
        activeFileTab.value = parsedFiles.value[0].fileName
        globalColumnDefs.value = [...parsedFiles.value[0].columnDefs]
      }

      // Validate required columns
      runValidation()

      toast.success(`成功解析 ${parsedFiles.value.length} 个文件，共 ${totalRows.value} 行数据`)
      currentStep.value = 2
    }
    catch (e: any) {
      toast.error('解析文件失败', { description: e.message })
    }
    finally {
      loading.value = false
    }
  }
  else if (currentStep.value === 2) {
    // Merge files and group by loading list
    loading.value = true
    try {
      const allData = mergeFiles(parsedFiles.value)
      loadingListGroups.value = groupByLoadingList(allData)

      if (loadingListGroups.value.length === 0) {
        toast.warning('分组后无数据')
        return
      }

      toast.success(`按装车单号分组成功，共 ${loadingListGroups.value.length} 个组`)
      currentStep.value = 3
    }
    catch (e: any) {
      toast.error('分组失败', { description: e.message })
    }
    finally {
      loading.value = false
    }
  }
  else if (currentStep.value === 3) {
    // Must have at least one checked group
    if (checkedGroups.value.length === 0) {
      toast.warning('请至少勾选一个装车单')
      return
    }
    // Validate: each checked group must have vehicleNo
    const missingVehicle = checkedGroups.value.filter(g => !g.vehicleNo)
    if (missingVehicle.length > 0) {
      toast.warning(`已勾选的装车单中有 ${missingVehicle.length} 个未选择车船号，请先完成选择`)
      return
    }
    currentStep.value = 4
  }
}

function runValidation() {
  if (globalColumnDefs.value.length === 0) {
    validationError.value = ''
    return
  }

  const { valid, missingColumns } = validateRequiredColumns(
    globalColumnDefs.value,
    roundSteelV2RequiredKeys,
  )

  if (!valid) {
    const names = missingColumns.map(k => fieldNameMap[k] || k).join('、')
    validationError.value = `缺少必要列: ${names}`
  }
  else {
    validationError.value = ''
  }
}

// Handle file change
function handleFilesChange(files: File[]) {
  uploadedFiles.value = files
  parsedFiles.value = []
  loadingListGroups.value = []
  checkedLoadingListNos.value = new Set()
  globalColumnDefs.value = []
  validationError.value = ''
  savedBatchId.value = ''
}

// Handle column toggle request
function handleToggleColumn(columnKey: string) {
  const col = globalColumnDefs.value.find(c => c.key === columnKey)
  if (!col) return

  pendingColumnKey.value = columnKey
  pendingColumnAction.value = col.isRequired ? 'deselect' : 'select'
  showColumnConfirm.value = true
}

function confirmColumnToggle() {
  const col = globalColumnDefs.value.find(c => c.key === pendingColumnKey.value)
  if (col) {
    col.isRequired = !col.isRequired
    toast.success(col.isRequired ? `已选中列 "${col.key}"` : `已取消选中列 "${col.key}"`)
  }
  showColumnConfirm.value = false
  pendingColumnKey.value = ''
}

function cancelColumnToggle() {
  showColumnConfirm.value = false
  pendingColumnKey.value = ''
}

// Export Excel
async function handleExport() {
  if (checkedGroups.value.length === 0) {
    toast.warning('没有已勾选的数据可导出')
    return
  }

  try {
    await generateOutputExcelV2(checkedGroups.value)
    toast.success('导出成功')
  }
  catch (e: any) {
    toast.error('导出失败', { description: e.message })
  }
}

// Save to backend
async function handleSave() {
  if (checkedGroups.value.length === 0) {
    toast.warning('没有已勾选的数据可保存')
    return
  }

  saving.value = true
  try {
    const payload = buildSavePayload(checkedGroups.value)
    const result = await saveShipmentDetail(payload)

    if (result.ok && result.data) {
      savedBatchId.value = result.data.batchId
      toast.success(`保存成功，共 ${result.data.count} 条记录`)
    }
    else {
      toast.error('保存失败', { description: result.error || '未知错误' })
    }
  }
  catch (e: any) {
    toast.error('保存失败', { description: e.message })
  }
  finally {
    saving.value = false
  }
}

// Reset all
function handleReset() {
  currentStep.value = 1
  uploadedFiles.value = []
  parsedFiles.value = []
  loadingListGroups.value = []
  checkedLoadingListNos.value = new Set()
  globalColumnDefs.value = []
  validationError.value = ''
  savedBatchId.value = ''
}

// Step info
const steps = [
  { num: 1, label: '上传文件' },
  { num: 2, label: '预览验证' },
  { num: 3, label: '编辑数据' },
  { num: 4, label: '导出保存' },
]
</script>

<template>
  <BasicPage title="圆钢数据处理" description="上传ERP圆钢数据，按装车单号分组编辑，导出双Sheet Excel">
    <template #actions>
      <UiButton variant="outline" size="sm" @click="handleReset">
        <RefreshCcw class="w-4 h-4 mr-1" />
        重置
      </UiButton>
    </template>

    <!-- Step indicator -->
    <div class="mb-4">
      <div class="flex items-center justify-center gap-3">
        <template v-for="(step, idx) in steps" :key="step.num">
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
            :class="[
              currentStep === step.num ? 'bg-primary text-primary-foreground' :
              currentStep > step.num ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
              'bg-muted text-muted-foreground'
            ]"
          >
            <span class="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-medium">
              <CheckCircle v-if="currentStep > step.num" class="w-4 h-4" />
              <template v-else>{{ step.num }}</template>
            </span>
            <span class="text-sm">{{ step.label }}</span>
          </div>
          <ArrowRight v-if="idx < steps.length - 1" class="w-4 h-4 text-muted-foreground" />
        </template>
      </div>
    </div>

    <!-- Step 1: Upload -->
    <div v-if="currentStep === 1" class="space-y-4">
      <FileUploader @files-change="handleFilesChange" />

      <div class="flex justify-end">
        <UiButton :disabled="!canGoNext() || loading" @click="goNext">
          <UiSpinner v-if="loading" class="mr-2" />
          下一步
          <ArrowRight class="w-4 h-4 ml-1" />
        </UiButton>
      </div>
    </div>

    <!-- Step 2: Preview & Validate -->
    <div v-else-if="currentStep === 2" class="flex flex-col gap-3 h-[calc(100vh-180px)] text-base">
      <!-- Validation error -->
      <div v-if="validationError" class="p-3 border border-red-300 rounded-lg bg-red-50 dark:bg-red-950/30 flex-shrink-0">
        <p class="text-sm text-red-600 dark:text-red-400 font-medium">{{ validationError }}</p>
        <p class="text-xs text-red-500 dark:text-red-400 mt-1">请上传包含以上列的文件，或检查列名是否匹配</p>
      </div>

      <!-- Summary -->
      <div class="p-2 border rounded-lg bg-muted/30 flex items-center gap-6 flex-shrink-0">
        <div class="flex items-center gap-2">
          <FileSpreadsheet class="w-5 h-5 text-green-600" />
          <span>{{ parsedFiles.length }} 个文件</span>
        </div>
        <span class="text-muted-foreground">|</span>
        <span>共 {{ totalRows }} 行数据</span>
        <span class="text-muted-foreground">|</span>
        <span>总重量: {{ totalWeight.toFixed(3) }} 吨</span>
      </div>

      <!-- File tabs with scroll -->
      <div class="flex-1 min-h-0">
        <UiTabs v-model="activeFileTab" class="w-full h-full flex flex-col">
          <UiTabsList class="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 flex-shrink-0">
            <UiTabsTrigger
              v-for="file in parsedFiles"
              :key="file.fileName"
              :value="file.fileName"
              class="flex items-center gap-2 whitespace-nowrap min-w-[300px] max-w-[300px] justify-start"
            >
              <FileSpreadsheet class="w-4 h-4 flex-shrink-0" />
              <span class="truncate">{{ file.fileName }}</span>
              <span class="text-xs text-muted-foreground flex-shrink-0">({{ file.rowCount }}行)</span>
            </UiTabsTrigger>
          </UiTabsList>

          <UiTabsContent
            v-for="file in parsedFiles"
            :key="file.fileName"
            :value="file.fileName"
            class="mt-4 flex-1 overflow-auto h-full"
          >
            <FilePreviewCard
              :file="file"
              :global-column-defs="globalColumnDefs"
              @toggle-column="handleToggleColumn"
            />
          </UiTabsContent>
        </UiTabs>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between flex-shrink-0">
        <UiButton variant="outline" @click="goBack">
          <ArrowLeft class="w-4 h-4 mr-1" />
          上一步
        </UiButton>
        <UiButton :disabled="!canGoNext() || loading" @click="goNext">
          <UiSpinner v-if="loading" class="mr-2" />
          下一步（按装车单号分组）
          <ArrowRight class="w-4 h-4 ml-1" />
        </UiButton>
      </div>
    </div>

    <!-- Step 3: Edit by Loading List groups -->
    <div v-else-if="currentStep === 3" class="flex flex-col gap-3 h-[calc(100vh-180px)]">
      <div class="flex-1 min-h-0">
        <UiCard class="h-full flex flex-col">
          <UiCardHeader class="py-2 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-baseline gap-2">
                <UiCardTitle class="text-base">按装车单号分组编辑</UiCardTitle>
                <UiCardDescription class="text-[10px]">
                  为每个装车单选择车船号，填写合同号
                </UiCardDescription>
              </div>
              <div class="flex items-center gap-4 text-sm">
                <span class="font-medium">已选 {{ checkedGroups.length }} / {{ loadingListGroups.length }} 个装车单</span>
                <span class="text-muted-foreground">|</span>
                <span>已选发运数: <strong>{{ checkedGroups.reduce((s, g) => s + g.subtotalQuantity, 0) }}</strong></span>
                <span class="text-muted-foreground">|</span>
                <span>已选重量: <strong>{{ checkedGroups.reduce((s, g) => s + g.subtotalWeight, 0).toFixed(3) }}</strong> 吨</span>
              </div>
            </div>
          </UiCardHeader>
          <UiCardContent class="flex-1 overflow-hidden p-3 pt-0">
            <LoadingListEditor v-model="loadingListGroups" v-model:checked="checkedLoadingListNos" />
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Actions -->
      <div class="flex justify-between flex-shrink-0">
        <UiButton variant="outline" @click="goBack">
          <ArrowLeft class="w-4 h-4 mr-1" />
          上一步
        </UiButton>
        <UiButton @click="goNext">
          下一步（导出保存）
          <ArrowRight class="w-4 h-4 ml-1" />
        </UiButton>
      </div>
    </div>

    <!-- Step 4: Export & Save -->
    <div v-else-if="currentStep === 4" class="flex flex-col gap-4">
      <!-- Summary -->
      <UiCard>
        <UiCardHeader>
          <UiCardTitle class="text-base">数据汇总</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-3 bg-muted/30 rounded-lg text-center">
              <div class="text-2xl font-bold">{{ checkedGroups.length }}</div>
              <div class="text-sm text-muted-foreground">装车单数</div>
            </div>
            <div class="p-3 bg-muted/30 rounded-lg text-center">
              <div class="text-2xl font-bold">{{ checkedGroups.reduce((s, g) => s + g.rows.length, 0) }}</div>
              <div class="text-sm text-muted-foreground">聚合行数</div>
            </div>
            <div class="p-3 bg-muted/30 rounded-lg text-center">
              <div class="text-2xl font-bold">{{ checkedGroups.reduce((s, g) => s + g.subtotalQuantity, 0) }}</div>
              <div class="text-sm text-muted-foreground">总发运数</div>
            </div>
            <div class="p-3 bg-muted/30 rounded-lg text-center">
              <div class="text-2xl font-bold">{{ checkedGroups.reduce((s, g) => s + g.subtotalWeight, 0).toFixed(3) }}</div>
              <div class="text-sm text-muted-foreground">总重量(吨)</div>
            </div>
          </div>

          <!-- Group details -->
          <div class="mt-4 space-y-2">
            <div
              v-for="group in checkedGroups"
              :key="group.loadingListNo"
              class="border rounded-lg overflow-hidden"
            >
              <!-- Group header -->
              <div
                class="flex items-center justify-between p-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                @click="toggleStep4Group(group.loadingListNo)"
              >
                <div class="flex items-center gap-2">
                  <ChevronDown v-if="expandedStep4Groups.has(group.loadingListNo)" class="w-4 h-4 text-muted-foreground" />
                  <ChevronUp v-else class="w-4 h-4 text-muted-foreground" />
                  <span class="font-medium">{{ group.loadingListNo }}</span>
                </div>
                <div class="flex items-center gap-4 text-muted-foreground">
                  <span>车号: <strong class="text-foreground">{{ group.vehicleNo }}</strong></span>
                  <span>{{ group.rows.length }} 订单</span>
                  <span>{{ group.subtotalQuantity }} 件</span>
                  <span>{{ group.subtotalWeight.toFixed(3) }} 吨</span>
                </div>
              </div>

              <!-- Order rows (expandable table) -->
              <div v-if="expandedStep4Groups.has(group.loadingListNo)" class="border-t overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-muted/40">
                    <tr>
                      <th class="px-2 py-1 text-left whitespace-nowrap">订单号</th>
                      <th class="px-2 py-1 text-left whitespace-nowrap">项次号</th>
                      <th class="px-2 py-1 text-left whitespace-nowrap">客户名称</th>
                      <th class="px-2 py-1 text-left whitespace-nowrap">牌号</th>
                      <th class="px-2 py-1 text-right whitespace-nowrap">厚度</th>
                      <th class="px-2 py-1 text-right whitespace-nowrap">宽度</th>
                      <th class="px-2 py-1 text-right whitespace-nowrap">长度</th>
                      <th class="px-2 py-1 text-right whitespace-nowrap">件数</th>
                      <th class="px-2 py-1 text-right whitespace-nowrap">重量(吨)</th>
                      <th class="px-2 py-1 text-left whitespace-nowrap">仓库</th>
                      <th class="px-2 py-1 text-left whitespace-nowrap">合同号</th>
                      <th class="px-2 py-1 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, rowIdx) in group.rows"
                      :key="`${row.orderNo}-${row.orderItemNo}`"
                      class="group/row border-t hover:bg-muted/30"
                    >
                      <td class="px-2 py-1 font-mono font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">{{ row.orderNo }}</td>
                      <td class="px-2 py-1 whitespace-nowrap">{{ row.orderItemNo }}</td>
                      <td class="px-2 py-1 whitespace-nowrap">{{ row.customerName }}</td>
                      <td class="px-2 py-1 whitespace-nowrap">{{ row.brandNo }}</td>
                      <td class="px-2 py-1 text-right whitespace-nowrap">{{ row.thickness }}</td>
                      <td class="px-2 py-1 text-right whitespace-nowrap">{{ row.width }}</td>
                      <td class="px-2 py-1 text-right whitespace-nowrap">{{ row.length }}</td>
                      <td class="px-2 py-1 text-right whitespace-nowrap">{{ row.quantity }}</td>
                      <td class="px-2 py-1 text-right whitespace-nowrap">{{ row.weight.toFixed(3) }}</td>
                      <td class="px-2 py-1 whitespace-nowrap">{{ row.warehouse }}</td>
                      <td class="px-2 py-1 whitespace-nowrap">{{ row.contractNo }}</td>
                      <td class="px-2 py-1">
                        <button
                          class="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          title="删除此订单"
                          @click.stop="handleDeleteRow(group.loadingListNo, rowIdx)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <UiButton variant="outline" @click="goBack">
          <ArrowLeft class="w-4 h-4 mr-1" />
          返回编辑
        </UiButton>
        <div class="flex-1" />
        <UiButton variant="outline" @click="handleExport">
          <Download class="w-4 h-4 mr-1" />
          导出Excel
        </UiButton>
        <UiButton :disabled="saving" @click="handleSave">
          <UiSpinner v-if="saving" class="mr-2" />
          <Save v-else class="w-4 h-4 mr-1" />
          保存到系统
        </UiButton>
      </div>

      <!-- Save result -->
      <div v-if="savedBatchId" class="p-3 border border-green-300 rounded-lg bg-green-50 dark:bg-green-950/30">
        <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle class="w-5 h-5" />
          <span class="font-medium">保存成功</span>
        </div>
        <p class="text-sm text-green-600 dark:text-green-400 mt-1">
          批次号: {{ savedBatchId }}
        </p>
      </div>
    </div>

    <!-- Column toggle confirmation dialog -->
    <UiAlertDialog :open="showColumnConfirm" @update:open="showColumnConfirm = $event">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>确认修改列选择</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            <template v-if="pendingColumnAction === 'select'">
              确定要选中列 "<strong>{{ pendingColumnKey }}</strong>" 吗？此操作将影响所有文件的数据处理。
            </template>
            <template v-else>
              确定要取消选中列 "<strong>{{ pendingColumnKey }}</strong>" 吗？此操作将影响所有文件的数据处理。
            </template>
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel @click="cancelColumnToggle">
            取消
          </UiAlertDialogCancel>
          <UiAlertDialogAction @click="confirmColumnToggle">
            确定
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
