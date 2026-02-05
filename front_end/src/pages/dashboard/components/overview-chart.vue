<script setup lang="ts">
import { computed } from 'vue'
import { VisAxis, VisStackedBar, VisXYContainer, VisTooltip, VisCrosshair } from '@unovis/vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

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

function handleStartChange(event: Event) {
  emit('update:startDate', (event.target as HTMLInputElement).value)
}

function handleEndChange(event: Event) {
  emit('update:endDate', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <div class="space-y-1">
        <CardTitle>每月配发吨数变化</CardTitle>
        <CardDescription>展示选定时间段内的配发总吨数趋势</CardDescription>
      </div>
      <div class="flex items-center space-x-2 bg-background border rounded-md p-1">
        <input 
          type="month" 
          :value="startDate"
          @input="handleStartChange"
          class="bg-transparent text-sm border-none focus:ring-0 focus:outline-none px-2 py-1"
        />
        <span class="text-muted-foreground text-sm">-</span>
        <input 
          type="month" 
          :value="endDate"
          @input="handleEndChange"
          class="bg-transparent text-sm border-none focus:ring-0 focus:outline-none px-2 py-1"
        />
      </div>
    </CardHeader>
    <CardContent class="pl-0">
      <VisXYContainer :data="chartData" :height="380" :xDomain="xDomain" :yDomain="[0, undefined]">
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
    </CardContent>
  </Card>
</template>