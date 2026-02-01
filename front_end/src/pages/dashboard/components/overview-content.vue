<script lang="ts" setup>
import { ref, onMounted, watch, computed } from 'vue'
import { toast } from 'vue-sonner'
import { Calendar } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getDashboardStatistics, type DashboardStats } from '@/services/api/statistics.api'

import OverviewChart from './overview-chart.vue'
import TopList from './top-list.vue'
import AllVehiclesTable from './all-vehicles-table.vue'

const now = new Date()
const currentYear = now.getFullYear()
// Generate last 10 years
const years = Array.from({ length: 10 }, (_, i) => (currentYear - i).toString())

const startDate = ref(`${currentYear}-01`)
const endDate = ref(`${currentYear}-12`)

// Computed year derived from endDate, or a dedicated ref if needed
const selectedYear = ref(currentYear.toString())

const loading = ref(false)
const stats = ref<DashboardStats>({
  totalTonnage: 0,
  totalInvoiceTonnage: 0,
  totalPaymentTonnage: 0,
  billingNameCount: 0,
  monthlyTrend: [],
  top5BillingNames: [],
  top5Vehicles: [],
  allVehicles: []
})

async function loadData() {
  if (startDate.value > endDate.value) {
    toast.error('开始月份不能晚于结束月份')
    return
  }

  loading.value = true
  try {
    const res = await getDashboardStatistics(startDate.value, endDate.value)
    if (res.ok) {
      stats.value = res.data
    } else {
      toast.error('获取统计数据失败')
    }
  } catch (error) {
    console.error(error)
    toast.error('获取统计数据出错')
  } finally {
    loading.value = false
  }
}

// Update date range when year selector changes
watch(selectedYear, (newYear) => {
  startDate.value = `${newYear}-01`
  endDate.value = `${newYear}-12`
})

watch([startDate, endDate], () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Year Selector -->
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight">概览</h2>
      <div class="flex items-center space-x-2">
        <Select v-model="selectedYear">
          <SelectTrigger class="w-[120px]">
            <Calendar class="mr-2 h-4 w-4" />
            <SelectValue placeholder="选择年份" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in years" :key="y" :value="y">
              {{ y }}年
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            总配发吨数
          </UiCardTitle>
            <div class="h-4 w-4 text-muted-foreground flex items-center justify-center">
              ¥
            </div>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ stats.totalTonnage.toLocaleString() }} 吨
          </div>
          <div class="mt-2 space-y-1">
            <p class="text-sm text-muted-foreground">
              开票: <span class="font-medium text-foreground">{{ stats.totalInvoiceTonnage.toLocaleString() }}</span> 吨
            </p>
            <p class="text-sm text-muted-foreground">
              回款: <span class="font-medium text-foreground">{{ stats.totalPaymentTonnage.toLocaleString() }}</span> 吨
            </p>
          </div>
          <p class="text-xs text-muted-foreground mt-2">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发开单名称数
          </UiCardTitle>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            class="h-4 w-4 text-muted-foreground"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ stats.billingNameCount }}
          </div>
          <p class="text-xs text-muted-foreground">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>
      
       <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            配发车船数
          </UiCardTitle>
           <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            class="h-4 w-4 text-muted-foreground"
          >
            <rect width="20" height="14" x="2" y="5" rx="2" />
            <path d="M2 10h20" />
          </svg>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ stats.allVehicles.length }}
          </div>
          <p class="text-xs text-muted-foreground">
            {{ startDate }} 至 {{ endDate }}
          </p>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-7">
      <!-- Monthly Trend -->
      <div class="col-span-1 lg:col-span-4">
        <OverviewChart 
          :data="stats.monthlyTrend" 
          v-model:startDate="startDate"
          v-model:endDate="endDate"
        />
      </div>
      
      <!-- Top Billing Names -->
      <div class="col-span-1 lg:col-span-3">
        <TopList 
          title="开单名称排名 (Top 5)" 
          description="按配发吨数排名" 
          :data="stats.top5BillingNames" 
        />
      </div>
    </div>

    <!-- Bottom Section -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-7 h-[500px]">
      <!-- Top Vehicles -->
      <div class="col-span-1 lg:col-span-3 h-full">
         <TopList 
          title="车船排名 (Top 5)" 
          description="按配发吨数排名" 
          :data="stats.top5Vehicles" 
        />
      </div>

      <!-- All Vehicles Table -->
      <div class="col-span-1 lg:col-span-4 h-full">
         <AllVehiclesTable :data="stats.allVehicles" />
      </div>
    </div>
  </div>
</template>
