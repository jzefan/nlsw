<script setup lang="ts">
import { VisAxis, VisCrosshair, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { computed } from 'vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{
  data: { date: string, weight: number }[]
  startDate: string
  endDate: string
}>()

const emit = defineEmits<{
  (e: 'update:startDate', value: string): void
  (e: 'update:endDate', value: string): void
}>()

// Rich color palette
const colors = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#16a34a',
  '#059669',
  '#0891b2',
  '#0284c7',
]

// Transform data to ensure every month in the range is represented (filling zeros)
const chartData = computed(() => {
  const result = []
  const start = new Date(`${props.startDate}-01`)
  const end = new Date(`${props.endDate}-01`)

  const current = new Date(start)
  // eslint-disable-next-line no-unmodified-loop-condition
  while (current <= end) {
    const year = current.getFullYear()
    const month = current.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}`

    const match = props.data.find(d => d.date === dateStr)
    result.push({
      date: dateStr,
      weight: match ? match.weight : 0,
      label: `${month}月`,
    })

    current.setMonth(current.getMonth() + 1)
  }

  return result.map((item, index) => ({
    ...item,
    index,
  }))
})

const x = (d: any) => d.index
const y = (d: any) => d.weight
const color = (d: any, i: number) => colors[i % colors.length]

function tickFormat(i: number) {
  return chartData.value[i]?.label || ''
}

// Ensure xDomain covers all bars with padding
const xDomain = computed(() => [-0.5, chartData.value.length - 0.5])

function handleStartChange(event: Event) {
  emit('update:startDate', (event.target as HTMLInputElement).value)
}

function handleEndChange(event: Event) {
  emit('update:endDate', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <Card class="h-full flex flex-col border-0 shadow-md bg-gradient-to-br from-slate-50 to-white dark:from-slate-950/50 dark:to-background">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <div class="space-y-1">
        <CardTitle class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-blue-600">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          每月配发吨数变化
        </CardTitle>
        <CardDescription class="pl-10">
          展示选定时间段内的配发总吨数趋势
        </CardDescription>
      </div>
      <div class="flex items-center space-x-2 bg-white dark:bg-slate-900 border rounded-lg p-1.5 shadow-sm">
        <input
          type="month"
          :value="startDate"
          class="bg-transparent text-sm border-none focus:ring-0 focus:outline-none px-2 py-1"
          @input="handleStartChange"
        >
        <span class="text-muted-foreground text-sm">至</span>
        <input
          type="month"
          :value="endDate"
          class="bg-transparent text-sm border-none focus:ring-0 focus:outline-none px-2 py-1"
          @input="handleEndChange"
        >
      </div>
    </CardHeader>
    <CardContent class="chart-content pl-0 flex-1 min-h-0 overflow-hidden">
      <div class="chart-wrapper h-full w-full">
        <VisXYContainer :data="chartData" height="100%" :x-domain="xDomain" :y-domain="[0, undefined]">
          <VisStackedBar
            :x="x"
            :y="y"
            :color="color"
            :bar-padding="0.5"
            :rounded-corners="4"
          />
          <VisAxis
            type="x"
            :tick-format="tickFormat"
            :tick-values="chartData.map(d => d.index)"
            label="月份"
          />
          <VisAxis type="y" label="吨数" />
          <VisTooltip />
          <VisCrosshair />
        </VisXYContainer>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.chart-content {
  display: flex;
  flex-direction: column;
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
}

.chart-wrapper :deep(.unovis-xy-container) {
  height: 100% !important;
}

.chart-wrapper :deep(svg) {
  height: 100% !important;
}
</style>
