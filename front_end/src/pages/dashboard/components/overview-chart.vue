<script setup lang="ts">
import { computed } from 'vue'
import { VisAxis, VisStackedBar, VisXYContainer, VisTooltip, VisCrosshair } from '@unovis/vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MonthPicker } from '@/components/ui/date-picker'

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
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706',
  '#ca8a04', '#65a30d', '#16a34a', '#059669', '#0891b2', '#0284c7'
]

// Transform data to ensure every month in the range is represented (filling zeros)
const chartData = computed(() => {
  const result = []
  const start = new Date(props.startDate + '-01')
  const end = new Date(props.endDate + '-01')
  
  const current = new Date(start)
  while (current <= end) {
    const year = current.getFullYear()
    const month = current.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}`
    
    const match = props.data.find(d => d.date === dateStr)
    result.push({
      date: dateStr,
      weight: match ? match.weight : 0,
      label: `${month}月`
    })
    
    current.setMonth(current.getMonth() + 1)
  }

  return result.map((item, index) => ({
    ...item,
    index
  }))
})

const x = (d: any) => d.index
const y = (d: any) => d.weight
const color = (d: any, i: number) => colors[i % colors.length]

const tickFormat = (i: number) => {
  return chartData.value[i]?.label || ''
}

// Ensure xDomain covers all bars with padding
const xDomain = computed(() => [-0.5, chartData.value.length - 0.5])

// MonthPicker 直接使用 YYYY-MM 格式，与 startDate/endDate 一致
const startDateLocal = computed({
  get: () => props.startDate,
  set: (val: string) => emit('update:startDate', val),
})

const endDateLocal = computed({
  get: () => props.endDate,
  set: (val: string) => emit('update:endDate', val),
})
</script>

<template>
  <Card class="h-full flex flex-col border-0 shadow-md bg-gradient-to-br from-slate-50 to-white dark:from-slate-950/50 dark:to-background">
    <CardHeader class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-2">
      <div class="space-y-1">
        <CardTitle class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-blue-600">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </div>
          每月配发吨数变化
        </CardTitle>
        <CardDescription class="pl-10">展示选定时间段内的配发总吨数趋势</CardDescription>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <MonthPicker v-model="startDateLocal" placeholder="开始月份" class="w-[130px] h-8 text-sm" />
        <span class="text-muted-foreground text-sm">至</span>
        <MonthPicker v-model="endDateLocal" placeholder="结束月份" class="w-[130px] h-8 text-sm" />
      </div>
    </CardHeader>
    <CardContent class="chart-content pl-0 flex-1 min-h-0 overflow-hidden">
      <div class="chart-wrapper h-full w-full">
        <VisXYContainer :data="chartData" :height="'100%'" :xDomain="xDomain" :yDomain="[0, undefined]">
          <VisStackedBar
            :x="x"
            :y="y"
            :color="color"
            :barPadding="0.5"
            :roundedCorners="4"
          />
          <VisAxis
            type="x"
            :tickFormat="tickFormat"
            :tickValues="chartData.map(d => d.index)"
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

/* 深色模式：淡化坐标轴网格线和刻度线 */
:root.dark .chart-wrapper :deep(.axis .grid-line line),
:root.dark .chart-wrapper :deep(.axis .tick line) {
  stroke: rgba(255, 255, 255, 0.08) !important;
}

:root.dark .chart-wrapper :deep(.axis .tick text) {
  fill: rgba(255, 255, 255, 0.5) !important;
}

:root.dark .chart-wrapper :deep(.axis .label text) {
  fill: rgba(255, 255, 255, 0.5) !important;
}

:root.dark .chart-wrapper :deep(.axis .domain) {
  stroke: rgba(255, 255, 255, 0.1) !important;
}
</style>