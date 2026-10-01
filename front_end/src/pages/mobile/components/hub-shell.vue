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
    <header class="sticky top-0 z-20 border-b bg-background">
      <div class="mx-auto flex h-12 w-full max-w-md items-center gap-1">
        <Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="返回首页" @click="back">
          <ChevronLeft class="size-5" />
        </Button>
        <h1 class="text-base font-semibold">{{ props.title }}</h1>
      </div>

      <nav v-if="props.tabs?.length" class="mx-auto flex w-full max-w-md gap-1 px-3 pb-2">
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

    <div class="mx-auto w-full max-w-md space-y-5 p-3 pb-10">
      <slot />
    </div>
  </div>
</template>
