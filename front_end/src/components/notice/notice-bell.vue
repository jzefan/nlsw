<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, CheckCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getNotices, getUnreadNoticeCount, markNoticeAsRead, markAllNoticesAsRead, type NoticeItem } from '@/services/api/notice.api'
import { formatNoticeTime } from '@/utils/notice'

const router = useRouter()
const isOpen = ref(false)
const unreadCount = ref(0)
const notices = ref<NoticeItem[]>([])
const loading = ref(false)
const unreadOnly = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function fetchUnreadCount() {
  try {
    unreadCount.value = await getUnreadNoticeCount()
  } catch {
    // 静默失败，不打扰用户
  }
}

async function loadNotices() {
  loading.value = true
  try {
    const res = await getNotices({ unreadOnly: unreadOnly.value, limit: 15 })
    if (res.ok && res.data) {
      notices.value = res.data
      if (res.unreadCount !== undefined) {
        unreadCount.value = res.unreadCount
      }
    }
  } catch (err) {
    console.error('加载通知列表失败:', err)
  } finally {
    loading.value = false
  }
}

function handleOpenChange(open: boolean) {
  isOpen.value = open
  if (open) {
    loadNotices()
  }
}

async function handleClickNotice(item: NoticeItem) {
  if (!item.readAt) {
    item.readAt = new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    markNoticeAsRead(item._id).catch(() => {})
  }
  if (item.link) {
    isOpen.value = false
    router.push(item.link)
  }
}

async function handleMarkAllRead() {
  try {
    await markAllNoticesAsRead()
    unreadCount.value = 0
    notices.value.forEach(n => { n.readAt = new Date().toISOString() })
  } catch (err) {
    console.error('全部标记已读失败:', err)
  }
}

onMounted(() => {
  fetchUnreadCount()
  timer = setInterval(fetchUnreadCount, 60000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<template>
  <Popover :open="isOpen" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
        title="站内通知"
      >
        <Bell class="h-4 w-4" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground animate-in fade-in"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 p-0 shadow-md sm:w-96" align="end" :side-offset="8">
      <div class="flex items-center justify-between border-b px-4 py-2.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">通知中心</span>
          <span v-if="unreadCount > 0" class="text-xs text-muted-foreground">({{ unreadCount }} 未读)</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors"
            @click="unreadOnly = !unreadOnly; loadNotices()"
          >
            {{ unreadOnly ? '查看全部' : '仅看未读' }}
          </button>
          <span class="text-border">|</span>
          <button
            type="button"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="全部标记为已读"
            @click="handleMarkAllRead"
          >
            <CheckCheck class="h-3 w-3" />
            <span>已读</span>
          </button>
        </div>
      </div>

      <div class="max-h-80 overflow-y-auto divide-y">
        <div v-if="loading" class="p-6 text-center text-xs text-muted-foreground">
          加载中...
        </div>

        <div v-else-if="notices.length === 0" class="p-8 text-center text-xs text-muted-foreground">
          暂无通知
        </div>

        <div
          v-for="item in notices"
          v-else
          :key="item._id"
          class="group relative flex cursor-pointer flex-col gap-1 p-3 transition-colors hover:bg-muted/50"
          :class="item.readAt ? 'opacity-70' : 'bg-primary/[0.02]'"
          @click="handleClickNotice(item)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-foreground line-clamp-1" :class="!item.readAt ? 'font-semibold' : ''">
              {{ item.title }}
            </span>
            <span class="shrink-0 text-[11px] text-muted-foreground">
              {{ formatNoticeTime(item.createdAt) }}
            </span>
          </div>

          <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {{ item.body }}
          </p>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
