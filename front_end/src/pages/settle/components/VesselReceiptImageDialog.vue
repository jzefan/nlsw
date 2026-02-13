<script setup lang="ts">
import { Image, Loader2, Trash2, X as XIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'

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

// 缓存已加载的图片数据
const imageCache = ref<Record<string, string>>({})

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
  imageCache.value = {}
  visible.value = true
  loading.value = true

  try {
    const response = await settleApi.getReceiptImagesList(wno)

    if (response.ok && response.images && response.images.length > 0) {
      images.value = response.images

      // 并发加载所有图片
      await Promise.all(
        response.images.map(async (image) => {
          try {
            const imgResponse = await settleApi.getReceiptImageById(image.id)
            if (imgResponse.ok && imgResponse.data) {
              const dataUrl = `data:${imgResponse.contentType};base64,${imgResponse.data}`
              imageCache.value[image.id] = dataUrl
            }
          }
          catch (error) {
            console.error(`加载图片 ${image.id} 失败:`, error)
          }
        }),
      )
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
  // 图片已经在打开对话框时加载到缓存中
  if (imageCache.value[image.id]) {
    fullImageUrl.value = imageCache.value[image.id]
    fullImageFilename.value = image.original_filename
    showFullImage.value = true
  }
  else {
    toast.warning('图片加载中，请稍后再试')
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

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

    // 从缓存中移除
    delete imageCache.value[imageToDelete.id]

    // 如果全部删除完了，关闭对话框并通知父组件
    if (images.value.length === 0) {
      visible.value = false
      emit('confirm')
    } else {
      // 否则只通知父组件刷新
      emit('confirm')
    }
  } catch (error: any) {
    console.error('删除回执图片失败:', error)
    toast.error(error.message || '删除失败')
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
    pendingDeleteImage.value = null
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
            <!-- 删除按钮 -->
            <Button
              variant="destructive"
              size="icon"
              class="absolute top-2 right-2 z-20 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              @click="handleDeleteClick($event, image)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>

            <!-- 图片预览 -->
            <div class="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
              <!-- 实际图片或占位符 -->
              <img
                v-if="imageCache[image.id]"
                :src="imageCache[image.id]"
                :alt="image.original_filename"
                class="w-full h-full object-cover"
              >
              <div v-else class="flex items-center justify-center">
                <Loader2 class="h-8 w-8 animate-spin text-muted-foreground/50" />
              </div>

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
                <p>上传时间: {{ formatDateTime(image.upload_time) }}</p>
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
      </div>

      <DialogFooter>
        <Button @click="visible = false">
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 放大查看对话框 - 显示原始大小 -->
  <Dialog :open="showFullImage" @update:open="(val) => (showFullImage = val)">
    <DialogContent class="max-w-[98vw] max-h-[98vh] w-auto h-auto flex flex-col p-0 overflow-hidden">
      <DialogHeader class="px-4 py-3 border-b flex flex-row items-center justify-between shrink-0">
        <DialogTitle class="flex-1 truncate" :title="fullImageFilename">
          {{ fullImageFilename }}
        </DialogTitle>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 ml-2"
          @click="showFullImage = false"
        >
          <XIcon class="h-4 w-4" />
        </Button>
      </DialogHeader>
      <div class="overflow-auto bg-muted/30 p-4">
        <img
          v-if="fullImageUrl"
          :src="fullImageUrl"
          :alt="fullImageFilename"
          class="rounded-md shadow-md"
          style="display: block;"
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
                <span class="font-medium">{{ formatDateTime(pendingDeleteImage.upload_time) }}</span>
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
