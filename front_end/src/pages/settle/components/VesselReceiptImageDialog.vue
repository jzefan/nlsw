<script setup lang="ts">
import { Download, Image, Loader2, Maximize2, Minimize2, Printer, Trash2, Upload as UploadIcon, X as XIcon, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { formatDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import * as settleApi from '@/services/api/settle.api'

interface ReceiptImage {
  id: string
  filename: string
  original_filename: string
  file_size: number
  mime_type: string
  uploader: string
  upload_time: string
}

const visible = ref(false)
const showFullImage = ref(false)
const loading = ref(false)
const images = ref<ReceiptImage[]>([])
const currentWno = ref('')
const fullImageUrl = ref('')
const fullImageFilename = ref('')

// 缩放状态
const zoomLevel = ref(1)
const imageNaturalWidth = ref(0)
const isMaximized = ref(false)

// 图片宽度样式：用 naturalWidth * zoomLevel 计算像素宽度
const imageWidthStyle = computed(() => {
  if (imageNaturalWidth.value <= 0) return {}
  return { width: `${Math.round(imageNaturalWidth.value * zoomLevel.value)}px` }
})

// 全屏对话框的动态 class
const fullImageDialogClass = computed(() => {
  if (isMaximized.value) {
    return 'w-[100vw] h-[100vh] max-w-none max-h-none rounded-none flex flex-col p-0 overflow-hidden'
  }
  return 'max-w-[98vw] max-h-[98vh] w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden'
})

// 删除相关状态
const showDeleteDialog = ref(false)
const deleting = ref(false)
const pendingDeleteImage = ref<ReceiptImage | null>(null)

// 组件事件
const emit = defineEmits<{
  confirm: []
}>()

async function open(wno: string) {
  if (!wno) {
    toast.error('运单号不能为空')
    return
  }

  currentWno.value = wno
  images.value = []
  visible.value = true
  loading.value = true

  try {
    const response = await settleApi.getReceiptImagesList(wno)

    if (response.ok && response.images && response.images.length > 0) {
      images.value = response.images
    }
    else {
      toast.warning('该运单暂无回执图片')
    }
  }
  catch (error: any) {
    console.error('获取回执图片列表失败:', error)

    if (error.response?.status === 404) {
      toast.warning('未找到回执图片')
    }
    else {
      toast.error(error.message || '获取回执图片列表失败')
    }
  }
  finally {
    loading.value = false
  }
}

function handleImageClick(image: ReceiptImage) {
  const url = settleApi.getReceiptImageUrl(image.id)
  fullImageUrl.value = url
  fullImageFilename.value = image.original_filename
  zoomLevel.value = 1
  isMaximized.value = false

  // 用临时 Image 对象读取原始尺寸
  const tempImg = new window.Image()
  tempImg.src = url
  imageNaturalWidth.value = 0
  tempImg.onload = () => {
    imageNaturalWidth.value = tempImg.naturalWidth
  }

  showFullImage.value = true
}

function zoomIn() {
  zoomLevel.value = Math.min(+(zoomLevel.value + 0.25).toFixed(2), 5)
}

function zoomOut() {
  zoomLevel.value = Math.max(+(zoomLevel.value - 0.25).toFixed(2), 0.25)
}

function resetZoom() {
  zoomLevel.value = 1
}

function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
}


function handleClose(open: boolean) {
  if (!open) {
    visible.value = false
  }
}

// 删除图片
function handleDeleteClick(event: MouseEvent, image: ReceiptImage) {
  event.stopPropagation() // 阻止触发查看大图
  pendingDeleteImage.value = image
  showDeleteDialog.value = true
}

async function confirmDelete() {
  if (!pendingDeleteImage.value) return

  const imageToDelete = pendingDeleteImage.value
  deleting.value = true

  try {
    await settleApi.deleteReceiptImage(imageToDelete.id)
    toast.success('删除成功')

    // 从列表中移除
    images.value = images.value.filter(img => img.id !== imageToDelete.id)

    // 如果全部删除完了，关闭对话框并通知父组件
    if (images.value.length === 0) {
      visible.value = false
    }
    emit('confirm')
  }
  catch (error: any) {
    console.error('删除回执图片失败:', error)
    toast.error(error.message || '删除失败')
  }
  finally {
    deleting.value = false
    showDeleteDialog.value = false
    pendingDeleteImage.value = null
  }
}

// 下载单张图片
async function downloadImage(event: MouseEvent, image: ReceiptImage) {
  event.stopPropagation()
  try {
    const url = settleApi.getReceiptImageUrl(image.id)
    const response = await fetch(url, { credentials: 'include' })
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = image.original_filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  }
  catch {
    toast.error('下载失败')
  }
}

// 下载当前全屏图片
async function downloadCurrentImage() {
  if (!fullImageUrl.value) return
  try {
    const response = await fetch(fullImageUrl.value, { credentials: 'include' })
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fullImageFilename.value
    a.click()
    URL.revokeObjectURL(blobUrl)
  }
  catch {
    toast.error('下载失败')
  }
}

// 下载全部图片
function downloadAll() {
  if (images.value.length === 0) {
    toast.warning('没有可下载的图片')
    return
  }
  images.value.forEach((image, index) => {
    setTimeout(() => {
      downloadImage(new MouseEvent('click'), image)
    }, index * 300)
  })
}

// 打印当前全屏图片
function printCurrentImage() {
  if (!fullImageUrl.value) return
  const win = window.open('', '_blank')
  if (!win) {
    toast.error('打印失败：请在浏览器中允许弹出窗口')
    return
  }
  win.document.write(`<!DOCTYPE html><html><head><title>${fullImageFilename.value}</title>
    <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head>
    <body><img src="${fullImageUrl.value}" /></body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// 打印全部图片（每张一页）
function printAll() {
  if (images.value.length === 0) {
    toast.warning('没有可打印的图片')
    return
  }
  const imgsHtml = images.value.map(img =>
    `<div class="page"><img src="${settleApi.getReceiptImageUrl(img.id)}" /><p class="name">${img.original_filename}</p></div>`,
  ).join('')
  const win = window.open('', '_blank')
  if (!win) {
    toast.error('打印失败：请在浏览器中允许弹出窗口')
    return
  }
  win.document.write(`<!DOCTYPE html><html><head><title>回执图片打印</title>
    <style>body{margin:0;font-family:sans-serif;}
    .page{page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box;}
    .page:last-child{page-break-after:auto;}
    img{max-width:100%;max-height:90vh;object-fit:contain;}
    .name{margin-top:10px;font-size:12px;color:#666;}</style></head>
    <body>${imgsHtml}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// 上传更多
const showUploadArea = ref(false)
const uploading = ref(false)
const uploadFileInputRef = ref<HTMLInputElement>()
const uploadPreviewImages = ref<Array<{ file: File, url: string }>>([])

const MAX_FILES = 9
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function toggleUploadArea() {
  showUploadArea.value = !showUploadArea.value
  if (!showUploadArea.value) {
    uploadPreviewImages.value = []
    if (uploadFileInputRef.value) uploadFileInputRef.value.value = ''
  }
}

function handleUploadFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) processUploadFiles(files)
}

function handleUploadDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) processUploadFiles(files)
}

function processUploadFiles(files: File[]) {
  const remaining = MAX_FILES - images.value.length - uploadPreviewImages.value.length
  if (files.length > remaining) {
    toast.warning(`最多只能上传${MAX_FILES}张图片，当前还可以添加${remaining}张`)
    files = files.slice(0, remaining)
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast.warning(`${file.name} 不是图片文件，已跳过`)
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`${file.name} 超过5MB，已跳过`)
      continue
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      uploadPreviewImages.value.push({ file, url: e.target?.result as string })
    }
    reader.readAsDataURL(file)
  }
}

function removeUploadPreview(index: number) {
  uploadPreviewImages.value.splice(index, 1)
  if (uploadFileInputRef.value) uploadFileInputRef.value.value = ''
}

async function handleUploadConfirm() {
  if (uploadPreviewImages.value.length === 0) {
    toast.warning('请先选择要上传的图片')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    uploadPreviewImages.value.forEach(p => formData.append('images', p.file))
    formData.append('inv_no', currentWno.value)
    await settleApi.uploadReceiptImg(formData)
    toast.success(`成功上传 ${uploadPreviewImages.value.length} 张图片`)

    // 重置上传区域并重新加载图片列表
    showUploadArea.value = false
    uploadPreviewImages.value = []
    if (uploadFileInputRef.value) uploadFileInputRef.value.value = ''

    // 重新加载图片列表（只需获取元数据，图片由浏览器直接加载）
    loading.value = true
    const response = await settleApi.getReceiptImagesList(currentWno.value)
    if (response.ok && response.images) {
      images.value = response.images
    }
    loading.value = false
    emit('confirm')
  }
  catch (error: any) {
    toast.error(error.message || '上传失败')
  }
  finally {
    uploading.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="sm:max-w-[800px] max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>查看回执清单图片 ({{ images.length }}张)</DialogTitle>
      </DialogHeader>

      <div class="flex-1 overflow-auto p-4">
        <!-- 加载中 -->
        <div v-if="loading" class="text-center p-10">
          <Loader2 class="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p class="text-muted-foreground text-sm">
            正在加载图片列表...
          </p>
        </div>

        <!-- 图片网格 -->
        <div v-else-if="images.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="image in images"
            :key="image.id"
            class="relative border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-muted/30 group"
            @click="handleImageClick(image)"
          >
            <!-- 操作按钮：下载 + 删除 -->
            <div class="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="icon"
                class="h-8 w-8 shadow-lg"
                title="下载"
                @click="downloadImage($event, image)"
              >
                <Download class="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                class="h-8 w-8 shadow-lg"
                title="删除"
                @click="handleDeleteClick($event, image)"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>

            <!-- 图片预览 -->
            <div class="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
              <img
                :src="settleApi.getReceiptImageUrl(image.id)"
                :alt="image.original_filename"
                class="w-full h-full object-cover"
              >

              <!-- 点击提示覆盖层 -->
              <div
                class="absolute inset-0 bg-black/0 hover:bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-all"
              >
                <span class="text-white font-medium text-sm">点击放大</span>
              </div>
            </div>

            <!-- 图片信息 -->
            <div class="p-3 space-y-1 text-xs">
              <p class="font-medium text-foreground truncate" :title="image.original_filename">
                {{ image.original_filename }}
              </p>
              <div class="text-muted-foreground space-y-0.5">
                <p>大小: {{ formatFileSize(image.file_size) }}</p>
                <p>上传人: {{ image.uploader }}</p>
                <p>上传时间: {{ formatDate(image.upload_time) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center p-16">
          <Image class="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <p class="text-muted-foreground text-sm">
            暂无回执图片
          </p>
        </div>

        <!-- 上传更多区域 -->
        <div v-if="showUploadArea" class="mt-4 border-t pt-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">上传图片（最多{{ MAX_FILES }}张，每张最大5MB）</span>
          </div>

          <!-- 拖拽上传区域 -->
          <div
            v-if="images.length + uploadPreviewImages.length < MAX_FILES"
            class="border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-primary hover:bg-muted/50 border-muted-foreground/25 p-4"
            @click="() => uploadFileInputRef?.click()"
            @dragover.prevent
            @drop.prevent="handleUploadDrop"
          >
            <input
              ref="uploadFileInputRef"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="handleUploadFileSelect"
            >
            <UploadIcon class="h-8 w-8 text-primary mb-2" />
            <p class="text-sm font-medium text-foreground">点击或拖拽上传图片</p>
            <p class="text-xs text-muted-foreground mt-1">
              已有 {{ images.length + uploadPreviewImages.length }} / {{ MAX_FILES }} 张
            </p>
          </div>

          <!-- 待上传预览 -->
          <div v-if="uploadPreviewImages.length > 0" class="grid grid-cols-3 gap-2">
            <div
              v-for="(preview, index) in uploadPreviewImages"
              :key="'upload-' + index"
              class="relative aspect-square border rounded-lg overflow-hidden group"
            >
              <img :src="preview.url" :alt="preview.file.name" class="w-full h-full object-cover">
              <div class="absolute top-1 right-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded">新</div>
              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button variant="destructive" size="sm" @click.stop="removeUploadPreview(index)">
                  <XIcon class="h-3 w-3 mr-1" />
                  删除
                </Button>
              </div>
              <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                {{ preview.file.name }}
              </div>
            </div>
          </div>

          <!-- 确认上传按钮 -->
          <div class="flex justify-end">
            <Button :disabled="uploading || uploadPreviewImages.length === 0" @click="handleUploadConfirm">
              <Loader2 v-if="uploading" class="h-4 w-4 mr-2 animate-spin" />
              {{ uploading ? '上传中...' : `确认上传 (${uploadPreviewImages.length}张)` }}
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter class="flex items-center justify-between gap-2 sm:justify-between">
        <Button @click="toggleUploadArea">
          <UploadIcon class="h-4 w-4 mr-2" />
          {{ showUploadArea ? '收起上传' : '上传更多' }}
        </Button>
        <div class="flex items-center gap-2">
          <Button v-if="images.length > 0" variant="outline" @click="printAll">
            <Printer class="h-4 w-4 mr-2" />
            打印全部
          </Button>
          <Button v-if="images.length > 0" variant="outline" @click="downloadAll">
            <Download class="h-4 w-4 mr-2" />
            下载全部
          </Button>
          <Button variant="outline" @click="visible = false">
            关闭
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 放大查看对话框 -->
  <Dialog :open="showFullImage" @update:open="(val) => (showFullImage = val)">
    <DialogContent :class="fullImageDialogClass" :show-close-button="false">
      <DialogHeader class="px-4 py-3 border-b flex flex-row items-center justify-between shrink-0">
        <DialogTitle class="flex-1 truncate" :title="fullImageFilename">
          {{ fullImageFilename }}
        </DialogTitle>
        <div class="flex items-center gap-1 ml-2">
          <!-- 缩放控件 -->
          <Button variant="ghost" size="icon" class="h-8 w-8" title="缩小 (滚轮)" :disabled="zoomLevel <= 0.25" @click="zoomOut">
            <ZoomOut class="h-4 w-4" />
          </Button>
          <span
            class="text-xs text-muted-foreground min-w-[3rem] text-center cursor-pointer select-none"
            title="点击还原 100%"
            @click="resetZoom"
          >{{ Math.round(zoomLevel * 100) }}%</span>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="放大 (滚轮)" :disabled="zoomLevel >= 5" @click="zoomIn">
            <ZoomIn class="h-4 w-4" />
          </Button>
          <div class="w-px h-4 bg-border mx-1 shrink-0" />
          <Button variant="ghost" size="icon" class="h-8 w-8" :title="isMaximized ? '还原窗口' : '最大化'" @click="toggleMaximize">
            <Minimize2 v-if="isMaximized" class="h-4 w-4" />
            <Maximize2 v-else class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="下载" @click="downloadCurrentImage">
            <Download class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="打印" @click="printCurrentImage">
            <Printer class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="关闭" @click="showFullImage = false">
            <XIcon class="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>
      <div class="overflow-auto bg-muted/30 flex-1" @wheel.prevent="handleWheel">
        <img
          v-if="fullImageUrl"
          :src="fullImageUrl"
          :alt="fullImageFilename"
          class="rounded-md shadow-md m-4 block"
          :style="imageWidthStyle"
          title="双击还原 100%"
          @dblclick="resetZoom"
        >
      </div>
    </DialogContent>
  </Dialog>

  <!-- 删除确认对话框 -->
  <AlertDialog v-model:open="showDeleteDialog">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>确认删除</AlertDialogTitle>
        <AlertDialogDescription class="space-y-3">
          <p class="font-medium">确定要删除这张回执图片吗？</p>
          <div v-if="pendingDeleteImage" class="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <span class="text-muted-foreground">文件名：</span>
                <span class="font-medium">{{ pendingDeleteImage.original_filename }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">大小：</span>
                <span class="font-medium">{{ formatFileSize(pendingDeleteImage.file_size) }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">上传人：</span>
                <span class="font-medium">{{ pendingDeleteImage.uploader }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">上传时间：</span>
                <span class="font-medium">{{ formatDate(pendingDeleteImage.upload_time) }}</span>
              </div>
            </div>
          </div>
          <p class="text-destructive text-sm">此操作无法撤销，图片将被永久删除。</p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
        <AlertDialogAction :disabled="deleting" @click="confirmDelete">
          <Loader2 v-if="deleting" class="h-4 w-4 mr-2 animate-spin" />
          {{ deleting ? '删除中...' : '确定删除' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
