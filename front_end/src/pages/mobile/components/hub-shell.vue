<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChevronLeft } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'

export interface HubTab { label: string, to: string }

const props = defineProps<{
  title: string
  /** 同一模块下并列的视图（考勤 / 工资），用胶囊按钮切换 */
  tabs?: HubTab[]
  /** 当前页所在的路由路径，用于点亮对应胶囊 */
  activePath?: string
}>()

const router = useRouter()

function back() {
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-svh bg-muted/30">
    <div class="mx-auto w-full max-w-md p-3 pb-10">
      <header class="flex items-center gap-1">
        <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="返回首页" @click="back">
          <ChevronLeft class="size-5" />
        </Button>
        <h1 class="text-lg font-semibold">{{ props.title }}</h1>
        <nav v-if="props.tabs?.length" class="ml-auto flex gap-1">
          <router-link
            v-for="tab in props.tabs"
            :key="tab.to"
            :to="tab.to"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="tab.to === props.activePath
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'"
          >
            {{ tab.label }}
          </router-link>
        </nav>
      </header>

      <div class="mt-4 space-y-5">
        <slot />
      </div>
    </div>
  </div>
</template>
