<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Download } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { downloadAttendanceRequestAttachment, type AttendanceRequest } from '@/services/api/attendance.api'
import { attachmentPreviewKind } from '@/utils/attendance-attachments'

type Attachment = NonNullable<AttendanceRequest['attachments']>[number]

const props = defineProps<{ requestId: string, attachment: Attachment | null }>()
const open = defineModel<boolean>('open', { default: false })

const loading = ref(false)
const failed = ref(false)
/** 预览用的本地 blob 地址；附件接口要带登录态，直接把接口地址丢给 img / iframe 在跨端口下拿不到 cookie。 */
const objectUrl = ref('')
const kind = computed(() => attachmentPreviewKind(props.attachment?.mimeType))
const kindLabel = computed(() => (kind.value === 'pdf' ? 'PDF' : '图片'))
const sizeText = computed(() => {
  const size = props.attachment?.size ?? 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
})

function release() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
}

async function load() {
  const attachment = props.attachment
  if (!props.requestId || !attachment) return
  loading.value = true
  failed.value = false
  release()
  try {
    const blob = await downloadAttendanceRequestAttachment(props.requestId, attachment.id)
    objectUrl.value = URL.createObjectURL(blob)
  }
  catch {
    failed.value = true
  }
  finally { loading.value = false }
}

function save() {
  const attachment = props.attachment
  if (!attachment || !objectUrl.value) return
  const link = document.createElement('a')
  link.href = objectUrl.value
  link.download = attachment.name
  document.body.appendChild(link)
  link.click()
  link.remove()
}

watch(open, value => {
  if (value) void load()
  else { release(); failed.value = false }
})
watch(() => props.attachment?.id, () => { if (open.value) void load() })
onBeforeUnmount(release)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[92vh] sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle class="truncate pr-6">{{ attachment?.name || '附件' }}</DialogTitle>
        <DialogDescription>{{ sizeText }} · {{ kindLabel }}</DialogDescription>
      </DialogHeader>

      <div class="flex min-h-[40vh] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
        <p v-if="loading" class="text-sm text-muted-foreground">加载中…</p>
        <div v-else-if="failed" class="py-10 text-center">
          <p class="text-sm text-destructive">附件读取失败</p>
          <Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button>
        </div>
        <img v-else-if="kind === 'image' && objectUrl" :src="objectUrl" :alt="attachment?.name" class="max-h-[68vh] w-auto object-contain">
        <iframe v-else-if="kind === 'pdf' && objectUrl" :src="objectUrl" :title="attachment?.name" class="h-[68vh] w-full bg-background" />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">关闭</Button>
        <Button :disabled="loading || failed || !objectUrl" @click="save"><Download class="mr-1.5 size-4" />下载</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
