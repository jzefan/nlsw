<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { ref, watch } from 'vue'

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

interface Props {
  open: boolean
  defaultFileName?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultFileName: 'export',
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm', fileName: string, directoryHandle: FileSystemDirectoryHandle | null): void
}>()

const fileName = ref(props.defaultFileName)
const directoryHandle = ref<FileSystemDirectoryHandle | null>(null)
const directoryPath = ref('')
const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// 监听 defaultFileName 变化
watch(() => props.defaultFileName, (newVal) => {
  fileName.value = newVal
})

// 监听 open 变化，重置状态
watch(() => props.open, (newVal) => {
  if (newVal) {
    fileName.value = props.defaultFileName
    // 保留之前选择的目录
  }
})

async function selectDirectory() {
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    })
    directoryHandle.value = handle
    directoryPath.value = handle.name
  }
  catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('选择目录失败:', error)
    }
  }
}

function handleConfirm() {
  const name = fileName.value.trim() || props.defaultFileName
  emit('confirm', name, directoryHandle.value)
  emit('update:open', false)
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>导出文件</DialogTitle>
        <DialogDescription>
          设置导出文件名和保存位置
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- 文件名 -->
        <div class="grid gap-2">
          <Label for="fileName">文件名</Label>
          <div class="flex items-center gap-2">
            <Input
              id="fileName"
              v-model="fileName"
              placeholder="请输入文件名"
              class="flex-1"
              @keyup.enter="handleConfirm"
            />
            <span class="text-muted-foreground text-sm">.xlsx</span>
          </div>
        </div>

        <!-- 保存位置 -->
        <div class="grid gap-2">
          <Label>保存位置</Label>
          <div v-if="supportsDirectoryPicker" class="flex items-center gap-2">
            <Input
              :value="directoryPath || '默认下载目录'"
              readonly
              class="flex-1 bg-muted cursor-default"
            />
            <Button variant="outline" size="icon" @click="selectDirectory">
              <FolderOpen class="h-4 w-4" />
            </Button>
          </div>
          <div v-else class="text-sm text-muted-foreground">
            文件将保存到默认下载目录
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">
          取消
        </Button>
        <Button @click="handleConfirm">
          确定
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
