<script setup lang="ts">
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, Layers, RefreshCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { AggregatedRow, ColumnDef, ContractGroup, HeaderInfo, ParsedFile } from '@/utils/excel-transform'

import { BasicPage } from '@/components/global-layout'
import {
  aggregateByOrderItem,
  generateOutputExcel,
  groupByContract,
  mergeFiles,
  parseMultipleFiles,
} from '@/utils/excel-transform'

import FilePreviewCard from './components/FilePreviewCard.vue'
import FileUploader from './components/FileUploader.vue'
import GroupedDataEditor from './components/GroupedDataEditor.vue'
import HeaderEditor from './components/HeaderEditor.vue'
import MergedDataEditor from './components/MergedDataEditor.vue'

// Step state
const currentStep = ref(1)
const loading = ref(false)

// Step 1: File upload
const uploadedFiles = ref<File[]>([])
const parsedFiles = ref<ParsedFile[]>([])

// Step 2: Preview (files are parsed)
const activeFileTab = ref('')
const globalColumnDefs = ref<ColumnDef[]>([])

// Column toggle confirmation dialog
const showColumnConfirm = ref(false)
const pendingColumnKey = ref('')
const pendingColumnAction = ref<'select' | 'deselect'>('select')

// Step 3: Edit - two sub-steps
// 3a: Edit merged data (user inputs contractNo and colorMark)
const mergedData = ref<AggregatedRow[]>([])
// 3b: After grouping by contract
const isGrouped = ref(false)
const contractGroups = ref<ContractGroup[]>([])

// Header info (no invoiceNo needed)
const headerInfo = ref<HeaderInfo>({
  invoiceNo: '',
  billingName: '',
  vehicle: '',
  shipper: '',
  shipDate: new Date().toISOString().slice(0, 10),
  destination: '',
})

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
    return parsedFiles.value.length > 0 && parsedFiles.value.some(f => f.rowCount > 0)
  }
  return true
}

function goBack() {
  if (currentStep.value > 1) {
    if (currentStep.value === 3 && isGrouped.value) {
      // Go back to merged data editing
      isGrouped.value = false
      contractGroups.value = []
    }
    else {
      currentStep.value--
      if (currentStep.value === 2) {
        // Reset step 3 data
        mergedData.value = []
        isGrouped.value = false
        contractGroups.value = []
      }
    }
  }
}

async function goNext() {
  if (currentStep.value === 1) {
    // Parse files
    loading.value = true
    try {
      parsedFiles.value = await parseMultipleFiles(uploadedFiles.value, 'plate')
      if (parsedFiles.value.every(f => f.rowCount === 0)) {
        toast.warning('未能从文件中解析到有效数据，请检查文件格式')
        return
      }
      // Set first file as active tab
      if (parsedFiles.value.length > 0) {
        activeFileTab.value = parsedFiles.value[0].fileName
        globalColumnDefs.value = [...parsedFiles.value[0].columnDefs]
      }
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
    // Merge files and aggregate
    loading.value = true
    try {
      const allData = mergeFiles(parsedFiles.value)
      mergedData.value = aggregateByOrderItem(allData)

      // Auto-fill header info from first row
      if (allData.length > 0) {
        const first = allData[0]
        if (first.customerName && !headerInfo.value.billingName) {
          headerInfo.value.billingName = first.customerName
        }
      }

      toast.success(`合并成功，共 ${mergedData.value.length} 条数据`)
      currentStep.value = 3
      isGrouped.value = false
    }
    catch (e: any) {
      toast.error('合并失败', { description: e.message })
    }
    finally {
      loading.value = false
    }
  }
}

// Handle file change
function handleFilesChange(files: File[]) {
  uploadedFiles.value = files
  parsedFiles.value = []
  mergedData.value = []
  contractGroups.value = []
  globalColumnDefs.value = []
  isGrouped.value = false
}

// Handle column toggle request
function handleToggleColumn(columnKey: string) {
  const col = globalColumnDefs.value.find(c => c.key === columnKey)
  if (!col)
    return

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

// Generate groups by contract number
function handleGenerateGroups() {
  if (mergedData.value.length === 0) {
    toast.warning('没有数据可分组')
    return
  }

  // Check if all rows have contractNo
  const missingContract = mergedData.value.filter(r => !r.contractNo)
  if (missingContract.length > 0) {
    toast.warning(`有 ${missingContract.length} 条数据未填写合同号，将归入"未分组"`)
  }

  contractGroups.value = groupByContract(mergedData.value)
  isGrouped.value = true
  toast.success(`分组成功，共 ${contractGroups.value.length} 个合同组`)
}

// Export Excel
async function handleExport() {
  if (contractGroups.value.length === 0) {
    toast.warning('请先生成分组')
    return
  }

  try {
    await generateOutputExcel(headerInfo.value, contractGroups.value)
    toast.success('导出成功')
  }
  catch (e: any) {
    toast.error('导出失败', { description: e.message })
  }
}

// Reset all
function handleReset() {
  currentStep.value = 1
  uploadedFiles.value = []
  parsedFiles.value = []
  mergedData.value = []
  contractGroups.value = []
  globalColumnDefs.value = []
  isGrouped.value = false
  headerInfo.value = {
    invoiceNo: '',
    billingName: '',
    vehicle: '',
    shipper: '',
    shipDate: new Date().toISOString().slice(0, 10),
    destination: '',
  }
}
</script>

<template>
  <BasicPage title="板材数据处理" description="将ERP导出的板材数据转换为客户需要的格式">
    <template #actions>
      <UiButton v-if="currentStep === 3 && isGrouped" size="sm" @click="handleExport">
        <Download class="w-4 h-4 mr-1" />
        导出Excel
      </UiButton>
      <UiButton variant="outline" size="sm" @click="handleReset">
        <RefreshCcw class="w-4 h-4 mr-1" />
        重置
      </UiButton>
    </template>

    <!-- Step indicator -->
    <div class="mb-4">
      <div class="flex items-center justify-center gap-4">
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          :class="currentStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
        >
          <span class="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-medium">1</span>
          <span>上传文件</span>
        </div>
        <ArrowRight class="w-4 h-4 text-muted-foreground" />
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          :class="currentStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
        >
          <span class="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-medium">2</span>
          <span>预览确认</span>
        </div>
        <ArrowRight class="w-4 h-4 text-muted-foreground" />
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          :class="currentStep === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
        >
          <span class="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-medium">3</span>
          <span>编辑导出</span>
        </div>
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

    <!-- Step 2: Preview -->
    <div v-else-if="currentStep === 2" class="flex flex-col gap-4 h-[calc(100vh-220px)]">
      <!-- Summary -->
      <div class="p-4 border rounded-lg bg-muted/30 flex items-center gap-6 flex-shrink-0">
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
            class="mt-4 flex-1 overflow-auto"
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
          下一步（合并数据）
          <ArrowRight class="w-4 h-4 ml-1" />
        </UiButton>
      </div>
    </div>

    <!-- Step 3: Edit & Export -->
    <div v-else-if="currentStep === 3" class="flex flex-col gap-3 h-[calc(100vh-220px)]">
      <!-- Sub-step 3a: Edit merged data -->
      <template v-if="!isGrouped">
        <!-- Header editor -->
        <div class="flex-shrink-0">
          <HeaderEditor v-model="headerInfo" />
        </div>

        <!-- Merged data editor with scroll -->
        <div class="flex-1 min-h-0">
          <UiCard class="h-full flex flex-col">
            <UiCardHeader class="py-3 flex-shrink-0">
              <div class="flex items-center justify-between">
                <div class="flex items-baseline gap-2">
                  <UiCardTitle class="text-base">
                    合并数据
                  </UiCardTitle>
                  <UiCardDescription class="text-[10px]">
                    点击单元格可编辑，请为每个订单填写合同号和色标
                  </UiCardDescription>
                </div>
              </div>
            </UiCardHeader>
            <UiCardContent class="flex-1 overflow-hidden">
              <MergedDataEditor v-model="mergedData" />
            </UiCardContent>
          </UiCard>
        </div>

        <!-- Actions -->
        <div class="flex justify-between flex-shrink-0">
          <UiButton variant="outline" @click="goBack">
            <ArrowLeft class="w-4 h-4 mr-1" />
            上一步
          </UiButton>
          <UiButton @click="handleGenerateGroups">
            <Layers class="w-4 h-4 mr-1" />
            生成分组
          </UiButton>
        </div>
      </template>

      <!-- Sub-step 3b: View grouped data and export -->
      <template v-else>
        <!-- Header editor -->
        <div class="flex-shrink-0">
          <HeaderEditor v-model="headerInfo" />
        </div>

        <!-- Grouped data editor with scroll -->
        <div class="flex-1 min-h-0">
          <UiCard class="h-full">
            <UiCardContent class="p-4 h-full overflow-hidden">
              <GroupedDataEditor v-model="contractGroups" />
            </UiCardContent>
          </UiCard>
        </div>

        <!-- Actions -->
        <div class="flex justify-between flex-shrink-0">
          <UiButton variant="outline" @click="goBack">
            <ArrowLeft class="w-4 h-4 mr-1" />
            返回编辑
          </UiButton>
          <UiButton @click="handleExport">
            <Download class="w-4 h-4 mr-1" />
            导出Excel
          </UiButton>
        </div>
      </template>
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
