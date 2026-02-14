<script setup lang="ts">
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

defineProps<{
  title: string
  description?: string
  data: { name: string, value: number }[]
}>()
</script>

<template>
  <Card class="h-full flex flex-col border-0 shadow-md bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-amber-600">
            <path d="M8 21h8M12 17v4M7 4h10l-2 7H9L7 4zM12 4V2" />
          </svg>
        </div>
        {{ title }}
      </CardTitle>
      <CardDescription v-if="description" class="pl-10">
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex-1 overflow-auto">
      <div class="space-y-2">
        <div
          v-for="(item, index) in data"
          :key="index"
          class="flex items-center p-3 rounded-lg transition-all hover:scale-[1.02]"
          :class="[
            index === 0 ? 'bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10'
            : index === 1 ? 'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800/30 dark:to-slate-800/10'
              : index === 2 ? 'bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-900/10'
                : 'bg-background/50 hover:bg-background',
          ]"
        >
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
            :class="[
              index === 0 ? 'bg-amber-500 text-white'
              : index === 1 ? 'bg-slate-400 text-white'
                : index === 2 ? 'bg-orange-400 text-white'
                  : 'bg-muted text-muted-foreground',
            ]"
          >
            {{ index + 1 }}
          </div>
          <div class="ml-3 flex-1 min-w-0">
            <p class="text-sm font-medium leading-none truncate">
              {{ item.name }}
            </p>
          </div>
          <div class="font-semibold text-right tabular-nums">
            {{ item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            <span class="text-xs text-muted-foreground ml-1">吨</span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
