<script setup lang="ts">
/**
 * 申请单详情：桌面端展开行与移动端卡片共用同一份内容，避免两处各写一套后走样。
 * 展示用的格式化结果由父组件按行算好传进来（display），这里只管排版与交互。
 */
import { ref } from 'vue'
import { Check, Download, Eye, X } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import RequestTimeline from '@/pages/attendance/components/RequestTimeline.vue'
import type { AttendanceRequest } from '@/services/api/attendance.api'
import { canPreviewAttachment, formatFileSize } from '@/utils/attendance-attachments'

const props = defineProps<{
  row: AttendanceRequest
  /** 申请单 id，用于拼附件下载的 key */
  rowId: string
  /** 父组件算好的展示文本：类型 / 申请人 / 时段 / 时长 / 事由 / 部门 */
  display: {
    kind: string
    applicant: string
    period: string
    duration: string
    detail: string
    department: string
  }
  /** 轮到我审且仍是待审批状态：出审批意见与通过 / 驳回 */
  canReview: boolean
  busy: boolean
  /** 正在下载的附件 key（`申请id:附件id`） */
  downloadingAttachment: string
  commentId: string
}>()

const emit = defineEmits<{
  openAttachment: [row: AttendanceRequest, attachment: NonNullable<AttendanceRequest['attachments']>[number]]
  review: [decision: 'approve' | 'reject', comment: string]
}>()

const comment = ref('')
</script>

<template>
  <div class="min-w-0 space-y-1 py-1">
    <p class="text-sm font-medium">
      {{ props.display.kind }} · {{ props.display.applicant }}
      <span class="font-normal text-muted-foreground">{{ props.display.period }}<template v-if="props.display.duration"> · {{ props.display.duration }}</template></span>
    </p>
    <p v-if="props.display.department" class="text-xs text-muted-foreground">{{ props.display.department }}</p>
    <p class="text-sm text-muted-foreground">
      {{ props.display.detail }}
      <span v-if="props.row.contact"> · 对接：{{ props.row.contact }}</span>
      <span v-if="props.row.workContent && props.row.type !== 'leave'"> · 工作内容：{{ props.row.workContent }}</span>
    </p>
    <div v-if="props.row.attachments?.length" class="flex flex-wrap items-center gap-1 pt-1">
      <span class="mr-1 text-xs text-muted-foreground">附件</span>
      <Button
        v-for="attachment in props.row.attachments"
        :key="attachment.id"
        variant="link"
        size="sm"
        class="h-auto gap-1 px-1 py-0 text-xs"
        :title="canPreviewAttachment(attachment.mimeType) ? '点击查看' : '下载后查看'"
        :disabled="props.downloadingAttachment === `${props.rowId}:${attachment.id}`"
        @click="emit('openAttachment', props.row, attachment)"
      >
        <Eye v-if="canPreviewAttachment(attachment.mimeType)" class="size-3" />
        <Download v-else class="size-3" />
        {{ attachment.name }} · {{ formatFileSize(attachment.size) }}
      </Button>
    </div>
    <div class="pt-1">
      <RequestTimeline :request="props.row" />
    </div>
    <template v-if="props.canReview">
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <label :for="props.commentId" class="text-xs text-muted-foreground">审批意见</label>
        <div class="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" :disabled="props.busy" @click="emit('review', 'reject', comment)">
            <X class="mr-1 size-4" />驳回
          </Button>
          <Button size="sm" :disabled="props.busy" @click="emit('review', 'approve', comment)">
            <Check class="mr-1 size-4" />通过
          </Button>
        </div>
      </div>
      <Textarea :id="props.commentId" v-model="comment" rows="2" class="min-h-16 resize-y bg-background" aria-label="审批意见" />
    </template>
  </div>
</template>
