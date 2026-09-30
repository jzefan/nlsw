<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getNotices, markAllNoticesAsRead, markNoticeAsRead, type NoticeItem } from '@/services/api/notice.api'
import { useAuthStore } from '@/stores/auth'
import { formatNoticeTime } from '@/utils/notice'

/** 一个浏览器会话只弹一次：登录后弹过就不再重复，登出时重置。 */
const SHOWN_KEY = 'notice-login-dialog:shown'
const MAX_NOTICES = 20

const authStore = useAuthStore()
const router = useRouter()
const open = ref(false)
const saving = ref(false)
const notices = ref<NoticeItem[]>([])

async function checkUnread() {
  if (sessionStorage.getItem(SHOWN_KEY) === '1') return
  sessionStorage.setItem(SHOWN_KEY, '1')
  try {
    const res = await getNotices({ unreadOnly: true, limit: MAX_NOTICES })
    if (res.ok && res.data?.length) {
      notices.value = res.data
      open.value = true
    }
  }
  catch {
    // 读通知失败不该打扰用户，顶栏铃铛的未读角标仍在兜底
  }
}

// immediate 首次触发时 isLogin 还是 false，必须用 wasLogin 区分「刚挂载」与「真的登出」，
// 否则会把会话标记清掉，刷新后重复弹窗。
watch(() => authStore.isLogin, (isLogin, wasLogin) => {
  if (isLogin) void checkUnread()
  else if (wasLogin) {
    sessionStorage.removeItem(SHOWN_KEY)
    open.value = false
    notices.value = []
  }
}, { immediate: true })

async function handleOpenNotice(item: NoticeItem) {
  if (!item.readAt) {
    item.readAt = new Date().toISOString()
    // 已读标记失败也不挡跳转
    try { await markNoticeAsRead(item._id) } catch { /* 忽略 */ }
  }
  open.value = false
  if (item.link) await router.push(item.link)
}

async function handleMarkAllRead() {
  saving.value = true
  try {
    await markAllNoticesAsRead()
    notices.value = notices.value.map(item => ({ ...item, readAt: new Date().toISOString() }))
    toast.success('已全部标记为已读')
  }
  catch { toast.error('标记失败，请稍后再试') }
  finally { saving.value = false }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>你有 {{ notices.length }} 条未读通知</DialogTitle>
        <DialogDescription>点击任意一条可直达对应页面。</DialogDescription>
      </DialogHeader>

      <div class="max-h-[60vh] space-y-0.5 overflow-y-auto">
        <button
          v-for="item in notices"
          :key="item._id"
          type="button"
          class="flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
          @click="handleOpenNotice(item)"
        >
          <span class="flex items-center gap-2">
            <span class="size-1.5 shrink-0 rounded-full bg-destructive" :class="item.readAt ? 'opacity-0' : ''" />
            <span class="min-w-0 flex-1 truncate text-sm" :class="item.readAt ? 'text-muted-foreground' : 'font-medium'">{{ item.title }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ formatNoticeTime(item.createdAt) }}</span>
          </span>
          <span class="pl-3.5 text-xs leading-relaxed text-muted-foreground">{{ item.body }}</span>
        </button>
      </div>

      <DialogFooter class="sm:justify-between">
        <Button variant="ghost" size="sm" :disabled="saving" @click="handleMarkAllRead">全部已读</Button>
        <Button size="sm" @click="open = false">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
