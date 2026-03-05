<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

interface VehicleData {
  name: string
  value: number
  to_customer: number
  to_ship: number
  total_price: number
  veh_type: string
  veh_category: string
  monthlyTrend: { date: string, weight: number }[]
}

const props = defineProps<{
  data: VehicleData[]
}>()

const currentPage = ref(1)
const pageSize = 10
const vehicleTypeFilter = ref('all')

const filteredData = computed(() => {
  if (vehicleTypeFilter.value === 'all') {
    return props.data
  }
  return props.data.filter(item => item.veh_type === vehicleTypeFilter.value)
})

const totalPages = computed(() => Math.ceil(filteredData.value.length / pageSize))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredData.value.slice(start, end)
})

watch(() => props.data, () => {
  currentPage.value = 1
})

watch(vehicleTypeFilter, () => {
  currentPage.value = 1
})

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function formatTonnage(val: number) {
  return val.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function getTypeLabel(item: VehicleData) {
  const type = item.veh_type || '-'
  const category = item.veh_category || ''
  if (type === '-' || !category) return type
  return `${type}/${category}`
}

function getTrendBarHeights(trend: { date: string, weight: number }[]) {
  if (!trend || trend.length === 0) return []
  const maxWeight = Math.max(...trend.map(t => t.weight))
  if (maxWeight === 0) return trend.map(t => ({ ...t, height: 0 }))
  return trend.map(t => ({
    ...t,
    height: Math.round((t.weight / maxWeight) * 100),
  }))
}
</script>

<template>
  <Card class="h-full flex flex-col border-0 shadow-md bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/20 dark:to-background">
    <CardHeader class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-2">
      <CardTitle class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 text-cyan-600">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
        所有车船配发吨数
      </CardTitle>
      <div class="flex items-center space-x-4 shrink-0">
        <Select v-model="vehicleTypeFilter">
          <SelectTrigger class="w-[100px] bg-white dark:bg-slate-900 shadow-sm">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="车">车</SelectItem>
            <SelectItem value="船">船</SelectItem>
          </SelectContent>
        </Select>
        <div class="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage === 1"
            @click="prevPage"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div class="text-sm text-muted-foreground px-2 min-w-[60px] text-center">
            {{ currentPage }} / {{ totalPages || 1 }}
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage >= totalPages"
            @click="nextPage"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent class="flex-1 overflow-hidden p-0">
      <div class="h-full overflow-x-auto overflow-y-auto px-6 pb-6">
        <Table>
          <TableHeader class="sticky top-0 bg-gradient-to-r from-cyan-50 to-white dark:from-cyan-950/20 dark:to-background z-10">
            <TableRow class="border-b-2 border-cyan-200 dark:border-cyan-800">
              <TableHead class="font-semibold">车船号</TableHead>
              <TableHead class="text-right font-semibold">配发吨数</TableHead>
              <TableHead class="text-right font-semibold">到船吨数</TableHead>
              <TableHead class="text-right font-semibold">到客户吨数</TableHead>
              <TableHead class="font-semibold">类型</TableHead>
              <TableHead class="font-semibold">月度趋势</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(item, index) in paginatedData"
              :key="index"
              class="hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-colors"
            >
              <TableCell class="font-medium">{{ item.name }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatTonnage(item.value) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatTonnage(item.to_ship ?? 0) }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatTonnage(item.to_customer ?? 0) }}</TableCell>
              <TableCell>
                <span
                  class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                  :class="item.veh_type === '车' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          item.veh_type === '船' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                          'bg-gray-100 text-gray-600'"
                >
                  {{ getTypeLabel(item) }}
                </span>
              </TableCell>
              <TableCell>
                <div
                  v-if="item.monthlyTrend && item.monthlyTrend.length > 0"
                  class="flex items-end gap-px h-6 min-w-[60px]"
                  :title="item.monthlyTrend.map(t => `${t.date}: ${formatTonnage(t.weight)}吨`).join('\n')"
                >
                  <div
                    v-for="bar in getTrendBarHeights(item.monthlyTrend)"
                    :key="bar.date"
                    class="flex-1 min-w-[3px] max-w-[8px] rounded-t-sm bg-cyan-400 dark:bg-cyan-500 transition-all"
                    :style="{ height: `${Math.max(bar.height, 2)}%` }"
                  />
                </div>
                <span v-else class="text-muted-foreground text-xs">-</span>
              </TableCell>
            </TableRow>
            <TableRow v-if="paginatedData.length === 0">
              <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
</template>
