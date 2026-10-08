<script setup lang="ts">
/**
 * 用章申请详情：桌面端展开行与移动端卡片共用同一份内容，避免两处各写一套后走样。
 * 展示文本由父组件按行算好传进来（display / sealItems / approvals / logs），这里只负责排版。
 */
import { Stamp, Check, X, Minus } from 'lucide-vue-next'

import { Badge } from '@/components/ui/badge'

type ApprovalRow = {
  id: string
  name: string
  /** 该审批人负责的印章类别 */
  scope: string
  status: 'pending' | 'approved' | 'rejected' | 'skipped'
  comment: string
  time: string
}

const props = withDefaults(defineProps<{
  /** 父组件算好的展示文本 */
  display: {
    reason: string
    remark: string
    /** 实际发章：未发章或「时间 (经办: 姓名)」 */
    checkedOut: string
    /** 实际归还：未归还或时间 */
    actualReturn: string
  }
  /** 分配的实体印章明细 */
  sealItems: { id: string, code: string, typeName: string }[]
  /** 审批进度（会签：每位审批人一行） */
  approvals?: ApprovalRow[]
  /** 操作审计台账轨迹 */
  logs: { id: string, operator: string, note: string, time: string }[]
}>(), {
  approvals: () => [],
})

const APPROVAL_STATUS: Record<ApprovalRow['status'], { label: string; icon: typeof Check; class: string }> = {
  approved: { label: '已通过', icon: Check, class: 'text-emerald-600 dark:text-emerald-400' },
  rejected: { label: '已驳回', icon: X, class: 'text-destructive' },
  pending: { label: '待审批', icon: Minus, class: 'text-muted-foreground' },
  skipped: { label: '未进行', icon: Minus, class: 'text-muted-foreground/60' },
}
</script>

<template>
  <div class="space-y-4">
    <!-- 基本信息 -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-background rounded-md border text-xs">
      <div>
        <span class="text-muted-foreground">用章事由：</span>
        <span class="font-medium text-foreground">{{ props.display.reason }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">备注说明：</span>
        <span class="text-foreground">{{ props.display.remark }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">实际发章：</span>
        <span class="text-foreground">{{ props.display.checkedOut }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">实际归还：</span>
        <span class="text-foreground">{{ props.display.actualReturn }}</span>
      </div>
    </div>

    <!-- 分配的实体章明细 -->
    <div v-if="props.sealItems.length > 0" class="space-y-1.5">
      <div class="font-medium text-xs text-muted-foreground">分配实体印章明细：</div>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="item in props.sealItems"
          :key="item.id"
          class="flex items-center gap-1.5 px-2.5 py-1 bg-background border rounded text-xs font-mono"
        >
          <Stamp class="h-3.5 w-3.5 text-primary" />
          <span>{{ item.code }}</span>
          <Badge variant="outline" class="text-[10px] px-1 py-0">{{ item.typeName }}</Badge>
        </div>
      </div>
    </div>

    <!-- 审批进度（会签） -->
    <div v-if="props.approvals.length > 0" class="space-y-1.5">
      <div class="font-medium text-xs text-muted-foreground">审批进度：</div>
      <div class="space-y-1">
        <template v-for="a in props.approvals" :key="a.id">
          <div class="flex items-center gap-2 rounded border bg-background px-2.5 py-1.5 text-xs">
            <component :is="APPROVAL_STATUS[a.status].icon" class="h-3.5 w-3.5 shrink-0" :class="APPROVAL_STATUS[a.status].class" />
            <span class="font-medium text-foreground">{{ a.name }}</span>
            <span v-if="a.scope" class="text-muted-foreground">{{ a.scope }}</span>
            <span class="ml-auto shrink-0" :class="APPROVAL_STATUS[a.status].class">
              {{ APPROVAL_STATUS[a.status].label }}
            </span>
            <span v-if="a.time" class="shrink-0 text-[11px] text-muted-foreground/80 tabular-nums">{{ a.time }}</span>
          </div>
          <div v-if="a.comment" class="px-2.5 text-[11px] text-muted-foreground">{{ a.comment }}</div>
        </template>
      </div>
    </div>

    <!-- 流水台账记录 Timeline -->
    <div class="space-y-2">
      <div class="font-medium text-xs text-muted-foreground">操作审计台账轨迹：</div>
      <div class="relative border-l-2 border-border ml-2 pl-3 space-y-3">
        <div
          v-for="log in props.logs"
          :key="log.id"
          class="relative flex flex-col gap-0.5 text-xs"
        >
          <div class="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-border border-2 border-background" />
          <div class="flex items-center gap-2">
            <span class="font-medium text-foreground">{{ log.operator }}</span>
            <span class="text-muted-foreground">{{ log.note }}</span>
            <span class="text-[11px] text-muted-foreground/80 ml-auto">{{ log.time }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
