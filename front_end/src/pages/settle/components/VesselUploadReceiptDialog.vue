<script setup lang="ts">
import { Upload as UploadIcon, X as XIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import * as settleApi from '@/services/api/settle.api'

const emit = defineEmits(['confirm'])

const visible = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const selectedFiles = ref<File[]>([])
const previewImages = ref<Array<{ file: File, url: string }>>([])
const currentWno = ref('')
const fileInput = ref<HTMLInputElement>()

const MAX_FILES = 9
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function open(wno: string) {
  if (!wno) {
    toast.error('运单号不能为空')
    return
  }

  currentWno.value = wno
  resetForm()
  visible.value = true
}

function resetForm() {
  selectedFiles.value = []
  previewImages.value = []
  uploadProgress.value = 0
  uploading.value = false

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function handleUploadClick() {
  if (!uploading.value && selectedFiles.value.length < MAX_FILES) {
    fileInput.value?.click()
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])

  if (files.length > 0) {
    processFiles(files)
  }
}

function handleDrop(event: DragEvent) {
  if (uploading.value)
    return

  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    processFiles(files)
  }
}

function processFiles(files: File[]) {
  // 检查总数是否超过限制
  const remainingSlots = MAX_FILES - selectedFiles.value.length
  if (files.length > remainingSlots) {
    toast.warning(`最多只能上传${MAX_FILES}张图片，当前还可以添加${remainingSlots}张`)
    files = files.slice(0, remainingSlots)
  }

  for (const file of files) {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      toast.warning(`${file.name} 不是图片文件，已跳过`)
      continue
    }

    // 检查文件大小（最大5M）
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`${file.name} 超过5MB，已跳过`)
      continue
    }

    // 添加到选中列表
    selectedFiles.value.push(file)

    // 读取文件并显示预览
    const reader = new FileReader()
    reader.onload = (e) => {
      previewImages.value.push({
        file,
        url: e.target?.result as string,
      })
    }
    reader.readAsDataURL(file)
  }
}

function handleRemoveImage(index: number) {
  selectedFiles.value.splice(index, 1)
  previewImages.value.splice(index, 1)

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function handleConfirm() {
  if (selectedFiles.value.length === 0) {
    toast.warning('请先选择图片')
    return
  }

  if (!currentWno.value) {
    toast.error('运单号丢失，请重新打开对话框')
    return
  }

  try {
    uploading.value = true
    uploadProgress.value = 0

    // 模拟上传进度
    const progressInterval = setInterval(() => {
      if (uploadProgress.value < 90) {
        uploadProgress.value += 10
      }
    }, 100)

    // 构建 FormData
    const formData = new FormData()
    selectedFiles.value.forEach((file) => {
      formData.append('images', file) // 字段名改为 images
    })
    formData.append('inv_no', currentWno.value)

    // 上传图片
    await settleApi.uploadReceiptImg(formData)

    clearInterval(progressInterval)
    uploadProgress.value = 100

    toast.success(`成功上传${selectedFiles.value.length}张回执图片`)

    setTimeout(() => {
      visible.value = false
      emit('confirm')
    }, 500)
  }
  catch (error: any) {
    toast.error(error.message || '上传失败')
    uploadProgress.value = 0
  }
  finally {
    uploading.value = false
  }
}

function handleClose(open: boolean) {
  const isOpen = typeof open === 'boolean' ? open : false
  if (!isOpen && !uploading.value) {
    visible.value = false
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
}

defineExpose({ open })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="sm:max-w-[700px] max-h-[90vh] flex flex-col">
      <DialogHeader class="shrink-0">
        <DialogTitle>上传回执清单图片（最多{{ MAX_FILES }}张，每张最大5MB）</DialogTitle>
      </DialogHeader>

      <div class="py-4 overflow-y-auto flex-1">
        <!-- 上传区域 -->
        <div
          v-if="selectedFiles.length < MAX_FILES"
          class="w-full min-h-[150px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors border-muted-foreground/25"
          :class="[
            uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-muted/50',
          ]"
          @click="handleUploadClick"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="handleFileSelect"
          >

          <div class="text-center p-6">
            <UploadIcon class="h-12 w-12 text-primary mx-auto mb-3" />
            <div class="space-y-1">
              <p class="text-sm font-medium text-foreground">
                点击或拖拽上传图片
              </p>
              <p class="text-xs text-muted-foreground">
                已选择 {{ selectedFiles.length }} / {{ MAX_FILES }} 张
              </p>
            </div>
          </div>
        </div>

        <!-- 图片预览网格 -->
        <div v-if="previewImages.length > 0" class="mt-4 grid grid-cols-3 gap-3">
          <div
            v-for="(preview, index) in previewImages"
            :key="index"
            class="relative aspect-square border rounded-lg overflow-hidden group"
          >
            <img
              :src="preview.url"
              :alt="preview.file.name"
              class="w-full h-full object-cover"
            >
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                variant="destructive"
                size="sm"
                @click.stop="handleRemoveImage(index)"
              >
                <XIcon class="h-4 w-4 mr-1" />
                删除
              </Button>
            </div>
            <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
              {{ preview.file.name }}
            </div>
          </div>
        </div>

        <!-- 上传进度 -->
        <div v-if="uploadProgress > 0 && uploadProgress < 100" class="mt-4 space-y-2">
          <Progress :model-value="uploadProgress" class="h-2" />
          <p class="text-xs text-right text-muted-foreground">
            {{ uploadProgress }}%
          </p>
        </div>

        <!-- 文件列表 -->
        <div v-if="selectedFiles.length > 0" class="mt-4 space-y-2">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="p-2 bg-muted rounded-md text-xs text-muted-foreground flex items-center justify-between"
          >
            <div class="flex-1 min-w-0">
              <p class="truncate">
                <strong class="text-foreground">{{ file.name }}</strong>
              </p>
              <p class="text-muted-foreground/80">
                {{ formatFileSize(file.size) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="shrink-0">
        <Button variant="outline" @click="handleClose">
          取消
        </Button>
        <Button :disabled="selectedFiles.length === 0 || uploading" @click="handleConfirm">
          <span v-if="uploading" class="mr-2 animate-spin">⏳</span>
          上传 {{ selectedFiles.length > 0 ? `(${selectedFiles.length})` : '' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
