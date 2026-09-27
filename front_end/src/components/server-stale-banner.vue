<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertTriangle, RefreshCw, X } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import { useServerVersionStore } from '@/stores/server-version'

const store = useServerVersionStore()
const { stale, bootedAt } = storeToRefs(store)
const hidden = ref(false)

function formatBootedAt(value: string) {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void store.check()
}

onMounted(() => {
  void store.check(true)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibilityChange))
</script>

<template>
  <!-- 后端跑的是旧代码时的常驻提示：重启 node app.js 后自动消失 -->
  <div
    v-if="stale && !hidden"
    class="fixed bottom-4 left-1/2 z-[100] flex max-w-[min(92vw,44rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow-lg dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
  >
    <AlertTriangle class="size-3.5 shrink-0" />
    <span>
      后端服务自 {{ formatBootedAt(bootedAt) }} 启动后源码已更新，当前仍运行旧代码<span class="hidden sm:inline">；重启后端（<code>node app.js</code>）后改动才会生效</span>。
    </span>
    <Button variant="ghost" size="sm" class="h-6 shrink-0 px-2 text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50" @click="store.check(true)">
      <RefreshCw class="mr-1 size-3" />重新检查
    </Button>
    <button type="button" class="shrink-0 rounded-full p-0.5 text-amber-900/70 hover:bg-amber-100 dark:text-amber-200/70 dark:hover:bg-amber-900/50" aria-label="本次会话内关闭提示" @click="hidden = true">
      <X class="size-3.5" />
    </button>
  </div>
</template>
