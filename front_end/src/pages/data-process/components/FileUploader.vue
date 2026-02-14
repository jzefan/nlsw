<script setup lang="ts">
import { FileSpreadsheet, Trash2, Upload, X } from 'lucide-vue-next'
import { ref } from 'vue'

interface UploadedFile {
  file: File
  name: string
  size: number
}

const _props = defineProps<{
  accept?: string
}>()

const emit = defineEmits<{
  (e: 'filesChange', files: File[]): void
}>()

const isDragging = ref(false)
const files = ref<UploadedFile[]>([])
const fileInput = ref<HTMLInputElement>()

function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const droppedFiles = e.dataTransfer?.files
  if (droppedFiles) {
    addFiles(Array.from(droppedFiles))
  }
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) {
    addFiles(Array.from(target.files))
  }
  target.value = ''
}

function addFiles(newFiles: File[]) {
  const excelFiles = newFiles.filter((f) => {
    const ext = f.name.toLowerCase()
    return ext.endsWith('.xlsx') || ext.endsWith('.xls')
  })

  for (const file of excelFiles) {
    // Avoid duplicates
    if (!files.value.some(f => f.name === file.name && f.size === file.size)) {
      files.value.push({
        file,
        name: file.name,
        size: file.size,
      })
    }
  }

  emitChange()
}

function removeFile(index: number) {
  files.value.splice(index, 1)
  emitChange()
}

function clearAll() {
  files.value = []
  emitChange()
}

function emitChange() {
  emit('filesChange', files.value.map(f => f.file))
}

function triggerUpload() {
  fileInput.value?.click()
}

defineExpose({
  clearAll,
  getFiles: () => files.value.map(f => f.file),
})
</script>

<template>
  <div class="space-y-4">
    <!-- Drop zone -->
    <div
      class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
      :class="[
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
      ]"
      @click="triggerUpload"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <input
        ref="fileInput"
        type="file"
        :accept="accept || '.xlsx,.xls'"
        multiple
        class="hidden"
        @change="handleFileSelect"
      >
      <FileSpreadsheet class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
      <h3 class="text-lg font-medium mb-2">
        拖拽Excel文件到这里
      </h3>
      <p class="text-sm text-muted-foreground mb-4">
        或点击选择文件，支持 .xlsx 和 .xls 格式，可同时上传多个文件
      </p>
      <UiButton variant="outline" type="button" @click.stop="triggerUpload">
        <Upload class="w-4 h-4 mr-2" />
        选择文件
      </UiButton>
    </div>

    <!-- File list -->
    <div v-if="files.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">已选择 {{ files.length }} 个文件</span>
        <UiButton variant="ghost" size="sm" @click="clearAll">
          <X class="w-4 h-4 mr-1" />
          清空
        </UiButton>
      </div>

      <div class="border rounded-lg divide-y">
        <div
          v-for="(file, index) in files"
          :key="file.name + file.size"
          class="flex items-center gap-3 p-3 hover:bg-muted/30"
        >
          <FileSpreadsheet class="w-5 h-5 text-green-600 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {{ file.name }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ formatFileSize(file.size) }}
            </p>
          </div>
          <UiButton
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
            @click="removeFile(index)"
          >
            <Trash2 class="w-4 h-4" />
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
