<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ApprovalPendingLinks from '@/components/approval/ApprovalPendingLinks.vue'
import { useAuthStore } from '@/stores/auth'
import { useDevice } from '@/composables/use-device'
import { Badge } from '@/components/ui/badge'
import { getTitleCode } from '@/services/api/user.api'
import SealRequestList from './components/SealRequestList.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { isMobile } = useDevice()

const pendingCount = ref(0)
const hasGlobalApproval = ref(false)

const canReview = computed(() => {
  if (authStore.isOwner || authStore.isAppAdmin) return true
  const titleCode = getTitleCode(authStore.user?.title || '')
  if (titleCode === 'gm' || titleCode === 'ceo') return true
  const roles = authStore.user?.attendanceRoles
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : []
  return arr.includes('general_manager') || hasGlobalApproval.value || pendingCount.value > 0
})

const view = computed<'mine' | 'inbox' | 'history' | 'all'>(() => {
  const v = String(route.query.view || 'mine')
  if (['mine', 'inbox', 'history', 'all'].includes(v)) {
    return v as 'mine' | 'inbox' | 'history' | 'all'
  }
  return 'mine'
})

/** 入口都在左侧菜单（我的申请 / 待我审批），页内只在审批视图之间保留切换。 */
const showApprovalTabs = computed(() => canReview.value && view.value !== 'mine')

function switchView(target: 'inbox' | 'history') {
  router.push({
    path: '/seal/requests',
    query: {
      ...route.query,
      view: target
    }
  })
}

function handleMeta(meta: { pendingCount?: number; hasGlobalApprovalView?: boolean }) {
  if (meta.pendingCount !== undefined) {
    pendingCount.value = meta.pendingCount
  }
  if (meta.hasGlobalApprovalView !== undefined) {
    hasGlobalApproval.value = meta.hasGlobalApprovalView
  }
}
</script>

<template>
  <div class="space-y-4 p-4 md:p-0">
    <!-- 我的申请 / 待我审批的入口都在左侧菜单，页内只在「待我审批 / 审核记录」之间切换 -->
    <!-- 页签行最右是待办直达链接：按类型列出当前有待审批的入口，点一下跳到那个页面 -->
    <div v-if="showApprovalTabs" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b pb-2">
      <div class="flex items-center gap-1 text-xs">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="[view === 'inbox' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted', isMobile ? 'min-h-9' : '']"
          @click="switchView('inbox')"
        >
          待我审批
          <Badge v-if="pendingCount > 0" variant="destructive" class="h-4 px-1.5 text-[10px] rounded-full">
            {{ pendingCount }}
          </Badge>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="[view === 'history' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted', isMobile ? 'min-h-9' : '']"
          @click="switchView('history')"
        >
          审核记录
        </button>
      </div>
      <ApprovalPendingLinks />
    </div>

    <SealRequestList :view="view" @meta="handleMeta" />
  </div>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
