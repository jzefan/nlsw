<script setup lang="ts">
import { useApprovalStore } from '@/stores/approvals'

/**
 * 审批页面「待我审批 / 审核记录」同一行最右侧的待办直达链接：
 * 按类型列出当前有待审批的入口，点一下直接跳到真正需要审批的那个页面。
 *
 * 数据与侧栏角标同源（stores/approvals），所以两处数字永远一致；
 * 没有任何待办时整块不渲染——不留一个「待办 0」的空壳占位。
 */
const approvalStore = useApprovalStore()
</script>

<template>
  <div
    v-if="approvalStore.pendingKinds.length"
    data-slot="approval-pending-links"
    class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
  >
    <span>待办</span>
    <template v-for="(entry, index) in approvalStore.pendingKinds" :key="entry.kind">
      <span v-if="index" class="text-border">·</span>
      <router-link
        :to="entry.to"
        class="text-primary underline-offset-4 transition-colors hover:underline"
        :title="`前往${entry.label}审批`"
      >{{ entry.label }} {{ entry.count }}</router-link>
    </template>
  </div>
</template>
