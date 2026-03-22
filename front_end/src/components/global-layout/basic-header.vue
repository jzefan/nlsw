<script lang="ts" setup>
import { Home } from 'lucide-vue-next'

import { cn } from '@/lib/utils'

import type { LayoutHeaderProps } from './types'

defineProps<LayoutHeaderProps>()

const router = useRouter()
</script>

<template>
  <header
    :class="cn(
      'flex flex-col md:flex-row gap-2 justify-between py-1',
      sticky ? 'sticky top-0 z-40 bg-background' : '',
    )"
  >
    <main class="flex items-center gap-2">
      <div class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 flex-1 min-w-0">
        <h1 class="text-lg font-bold">
          {{ title }}
        </h1>
        <p v-if="description" class="text-sm text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <slot name="header-actions" />
      <UiButton variant="outline" size="icon" class="md:hidden h-8 w-8 shrink-0" title="返回首页" @click="router.push('/')">
        <Home class="w-4 h-4" />
      </UiButton>
    </main>

    <aside class="flex items-center gap-2 flex-wrap">
      <slot name="actions" />
    </aside>
  </header>
</template>
