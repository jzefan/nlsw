<script setup lang="ts">
import GlobalConfirmDialog from '@/components/global-confirm-dialog.vue'
import Loading from '@/components/loading.vue'
import NoticeLoginDialog from '@/components/notice/notice-login-dialog.vue'
import ServerStaleBanner from '@/components/server-stale-banner.vue'
import { Toaster } from '@/components/ui/sonner'
import { useSessionMonitor } from '@/composables/use-session-monitor'
import { useSystemTheme } from '@/composables/use-system-theme'

useSystemTheme()
useSessionMonitor()
</script>

<template>
  <Toaster position="top-center" />
  <GlobalConfirmDialog />
  <NoticeLoginDialog />
  <ServerStaleBanner />

  <Suspense>
    <!-- 不要给布局加 :key="route"：整棵布局（含侧栏）会每次导航都被重建，
         导致侧栏滚动位置回到顶部、折叠分组全部收起。本项目没有动态参数路由，
         不需要靠 key 强制重挂载；路由不同 vue-router 本就会替换组件。 -->
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>

    <template #fallback>
      <Loading />
    </template>
  </Suspense>
</template>
