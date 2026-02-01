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
  data: { name: string; value: number }[]
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription v-if="description">{{ description }}</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        <div v-for="(item, index) in data" :key="index" class="flex items-center border-b pb-2 last:border-0 last:pb-0">
          <div class="w-8 text-muted-foreground font-bold text-sm">#{{ index + 1 }}</div>
          <div class="ml-2 space-y-1 flex-1">
            <p class="text-sm font-medium leading-none">{{ item.name }}</p>
          </div>
          <div class="font-medium text-right">
            {{ item.value.toFixed(3) }}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
