<script setup lang="ts">
import { Download, FileSpreadsheet, FolderOpen } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ExportColumn {
  header: string
  key: string
  formatter?: (value: any, row: any) => any
}

export interface ExportOptions {
  /** 默认文件名（不含扩展名） */
  defaultFileName: string
  /** 工作表名称 */
  sheetName?: string
  /** 列定义 */
  columns: ExportColumn[]
  /** 数据 */
  data: any[]
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

// 状态
const fileName = ref('')
const exporting = ref(false)
const exportOptions = ref<ExportOptions | null>(null)

// 是否支持文件系统 API（可以选择保存目录）
const supportsFileSystemAccess = typeof window !== 'undefined' && 'showSaveFilePicker' in window

// 打开导出对话框
function openExport(options: ExportOptions) {
  exportOptions.value = options
  fileName.value = options.defaultFileName
  emit('update:open', true)
}

// 关闭对话框
function closeDialog() {
  emit('update:open', false)
  exportOptions.value = null
}

// 生成工作簿
function generateWorkbook(): XLSX.WorkBook {
  if (!exportOptions.value) {
    throw new Error('No export options')
  }

  const { columns, data, sheetName } = exportOptions.value

  // 构建表头
  const headers = columns.map(col => col.header)

  // 构建数据行
  const rows = data.map((row) => {
    return columns.map((col) => {
      const value = row[col.key]
      if (col.formatter) {
        return col.formatter(value, row)
      }
      return value
    })
  })

  // 创建工作表
  const aoa = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 自动调整列宽
  const colWidths = columns.map((col, idx) => {
    let maxWidth = col.header.length
    rows.forEach((row) => {
      const cellValue = String(row[idx] ?? '')
      maxWidth = Math.max(maxWidth, cellValue.length)
    })
    return { wch: Math.min(maxWidth + 2, 50) }
  })
  ws['!cols'] = colWidths

  // 创建工作簿
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')

  return wb
}

// 使用 File System Access API 导出（可选择目录）
async function exportWithFilePicker() {
  if (!exportOptions.value)
    return

  exporting.value = true
  try {
    const wb = generateWorkbook()
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    // 使用文件系统 API
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `${fileName.value}.xlsx`,
      types: [{
        description: 'Excel 文件',
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
      }],
    })

    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()

    toast.success('导出成功')
    closeDialog()
  }
  catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('Export error:', error)
      toast.error('导出失败', { description: error.message })
    }
  }
  finally {
    exporting.value = false
  }
}

// 普通下载导出
function exportWithDownload() {
  if (!exportOptions.value)
    return

  exporting.value = true
  try {
    const wb = generateWorkbook()
    XLSX.writeFile(wb, `${fileName.value}.xlsx`)
    toast.success('导出成功')
    closeDialog()
  }
  catch (error: any) {
    console.error('Export error:', error)
    toast.error('导出失败', { description: error.message })
  }
  finally {
    exporting.value = false
  }
}

// 导出操作
function handleExport() {
  if (supportsFileSystemAccess) {
    exportWithFilePicker()
  }
  else {
    exportWithDownload()
  }
}

// 快速导出（不弹对话框）
function quickExport() {
  exportWithDownload()
}

// 暴露方法
defineExpose({
  openExport,
  quickExport,
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileSpreadsheet class="w-5 h-5" />
          导出 Excel
        </DialogTitle>
        <DialogDescription>
          设置导出文件名，点击导出后{{ supportsFileSystemAccess ? '可选择保存位置' : '将自动下载' }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="fileName">文件名</Label>
          <div class="flex gap-2">
            <Input
              id="fileName"
              v-model="fileName"
              placeholder="请输入文件名"
              class="flex-1"
              @keyup.enter="handleExport"
            />
            <span class="flex items-center text-muted-foreground">.xlsx</span>
          </div>
        </div>

        <div v-if="exportOptions" class="text-sm text-muted-foreground">
          共 {{ exportOptions.data.length }} 条数据，{{ exportOptions.columns.length }} 列
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="exporting" @click="closeDialog">
          取消
        </Button>
        <Button :disabled="!fileName || exporting" @click="handleExport">
          <Download v-if="!exporting" class="w-4 h-4 mr-2" />
          <span v-if="exporting" class="w-4 h-4 mr-2 animate-spin">⏳</span>
          {{ exporting ? '导出中...' : (supportsFileSystemAccess ? '选择位置并导出' : '导出') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
