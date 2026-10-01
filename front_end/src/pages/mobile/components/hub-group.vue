<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

import type { HubEntry } from '../types'

const props = defineProps<{
  /** 不写分组名表示这是页面的主入口，直接展示 */
  label?: string
  items: HubEntry[]
}>()
</script>

<template>
  <section v-if="props.items.length" class="space-y-2">
    <h2 v-if="props.label" class="px-1 text-xs font-medium text-muted-foreground">{{ props.label }}</h2>
    <div class="grid grid-cols-2 gap-2">
      <router-link
        v-for="item in props.items"
        :key="item.to"
        :to="item.to"
        class="flex min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 transition-colors active:bg-muted"
      >
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="item.bgColor">
          <component :is="item.icon" class="size-4" :class="item.color" />
        </span>
        <span class="min-w-0 flex-1 text-[13px] font-medium leading-tight">{{ item.title }}</span>
        <span
          v-if="item.count"
          class="shrink-0 rounded-full bg-destructive px-1.5 text-[10px] font-medium leading-4 text-destructive-foreground tabular-nums"
        >
          {{ item.count }}
        </span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground/60" />
      </router-link>
    </div>
  </section>
</template>
