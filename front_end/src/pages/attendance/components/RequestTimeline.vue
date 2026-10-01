<script setup lang="ts">
import { computed } from 'vue'

import { approvalRoleLabels } from '@/constants/attendance-labels'
import type { AttendanceRequest } from '@/services/api/attendance.api'
import { useAuthStore } from '@/stores/auth'

/**
 * 申请详情的时间线：从提交到逐级审批。
 * 「现在的状态」要一眼能看出来——还没批到的那一级写清「等待 谁 审批」，
 * 已经结束（通过 / 驳回 / 撤回）之后剩下的层级写「未进行」，不再显示等待谁。
 */
const props = defineProps<{ request: AttendanceRequest }>()

const authStore = useAuthStore()

const FINISHED_STATUSES = ['approved', 'rejected', 'withdrawn']

type Tone = 'done' | 'current' | 'rejected' | 'idle'

interface TimelineStep {
  key: string
  title: string
  tone: Tone
  /** 第二行：申请人 / 等待谁审批 / 审批人 */
  actor: string
  time: string
  state: string
  comment: string
}

/** 时间线只看月-日 时:分，完整到分钟的绝对时间在列表行里已有。 */
function stamp(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function applicantName(request: AttendanceRequest) {
  if (typeof request.applicant === 'string' && request.applicant) return request.applicant
  if (request.applicant && typeof request.applicant === 'object') {
    const user = request.applicant as Record<string, unknown>
    return String(user.name ?? user.userid ?? '')
  }
  return String(request.applicantName ?? '')
}

const steps = computed<TimelineStep[]>(() => {
  const request = props.request
  const finished = FINISHED_STATUSES.includes(String(request.status ?? ''))
  const list: TimelineStep[] = [{
    key: 'submitted',
    title: '提交申请',
    tone: 'done',
    actor: applicantName(request),
    time: stamp(request.createdAt ?? request.created_at),
    state: '已提交',
    comment: '',
  }]

  let currentTaken = false
  const approvals = request.approvals ?? []
  for (let index = 0; index < approvals.length; index++) {
    const approval = approvals[index]
    const status = String(approval.status ?? 'pending')
    const title = approvalRoleLabels[String(approval.role ?? '')] ?? (String(approval.role ?? '') || '审批人')
    const name = String(approval.approverName ?? '').trim()
    if (status === 'approved' || status === 'rejected') {
      list.push({
        key: `approval-${index}`,
        title,
        tone: status === 'approved' ? 'done' : 'rejected',
        actor: name || '审批人',
        time: stamp(approval.reviewedAt),
        state: status === 'approved' ? '已通过' : '已驳回',
        comment: String(approval.comment ?? '').trim(),
      })
      continue
    }
    const isCurrent = !finished && !currentTaken
    if (isCurrent) currentTaken = true
    // 轮到本人时不说自己的名字，直接说「等待您的审批」
    const isSelf = String(approval.approverId ?? '') !== '' && String(approval.approverId) === String(authStore.user?.id ?? '')
    list.push({
      key: `approval-${index}`,
      title,
      tone: isCurrent ? 'current' : 'idle',
      actor: isCurrent ? (isSelf ? '等待您的审批' : name ? `等待 ${name} 审批` : '等待审批') : '',
      time: '',
      state: isCurrent ? '等待中' : '未进行',
      comment: '',
    })
  }

  if (String(request.status) === 'withdrawn') {
    list.push({ key: 'withdrawn', title: '已撤回', tone: 'idle', actor: applicantName(request), time: stamp(request.withdrawnAt), state: '已撤回', comment: '' })
  }
  return list
})

const dotClass: Record<Tone, string> = {
  done: 'border-primary bg-primary',
  current: 'border-primary bg-background',
  rejected: 'border-destructive bg-destructive',
  idle: 'border-border bg-background',
}
const titleClass: Record<Tone, string> = {
  done: 'text-foreground',
  current: 'font-medium text-foreground',
  rejected: 'text-foreground',
  idle: 'text-muted-foreground',
}
const stateClass: Record<Tone, string> = {
  done: 'text-muted-foreground',
  current: 'font-medium text-primary',
  rejected: 'text-destructive',
  idle: 'text-muted-foreground',
}
</script>

<template>
  <ol class="relative space-y-3 pl-[18px]">
    <span class="absolute bottom-2 left-[3px] top-2 w-px bg-border" aria-hidden="true" />
    <li v-for="step in steps" :key="step.key" class="relative">
      <span class="absolute -left-[18px] top-[5px] size-2 rounded-full border" :class="dotClass[step.tone]" aria-hidden="true" />
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span class="text-sm" :class="titleClass[step.tone]">{{ step.title }}</span>
        <span class="text-xs" :class="stateClass[step.tone]">{{ step.state }}</span>
      </div>
      <div v-if="step.actor || step.time" class="mt-0.5 text-xs text-muted-foreground">
        {{ [step.actor, step.time].filter(Boolean).join(' · ') }}
      </div>
      <p v-if="step.comment" class="mt-0.5 text-xs text-muted-foreground">意见：{{ step.comment }}</p>
    </li>
  </ol>
</template>
