<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Calendar, Download, Search, Filter } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { StatisticsData } from '@/services/api/statistics.api'

const props = defineProps<{
  loading: boolean
  statisticsData: StatisticsData[]
  summaryData: {
    settledWDS: number
    notSettledWDS: number
    notNeedWDS: number
    settledWZT: number
    notSettledWZT: number
    notNeedWZT: number
    totalWeight: number
    totalPrice: number
    settledPDS: number
    notSettledPDS: number
    settledPZT: number
    notSettledPZT: number
  } | null
  dateRange: string
}>()

const emit = defineEmits<{
  openDateDialog: []
  openAllDetails: []
  handleExport: []
  openSingleDetail: [name: string]
}>()

// 展开状态管理
const expandedItems = ref<Set<string>>(new Set())

function toggleExpand(name: string) {
  if (expandedItems.value.has(name)) {
    expandedItems.value.delete(name)
  } else {
    expandedItems.value.add(name)
  }
}

function isExpanded(name: string) {
  return expandedItems.value.has(name)
}

// 格式化数字
function formatVal(val: number) {
  return val.toFixed(2)
}

function formatPrice(val: number) {
  return `¥${val.toFixed(2)}`
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
    <!-- 顶部固定栏 -->
    <div class="sticky top-0 z-20 bg-white dark:bg-slate-900 shadow-sm">
      <div class="px-4 py-3">
        <h1 class="text-lg font-bold text-center">客户营业额统计</h1>
        <p v-if="dateRange" class="text-xs text-center text-muted-foreground mt-1">{{ dateRange }}</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center justify-between px-4 py-2 border-t bg-gray-50 dark:bg-slate-800">
        <Button size="sm" @click="emit('openDateDialog')" class="flex-1 mr-2">
          <Calendar class="w-4 h-4 mr-1" />
          选择日期
        </Button>
        <Button size="sm" variant="outline" @click="emit('openAllDetails')" class="flex-1 mr-2">
          <Search class="w-4 h-4 mr-1" />
          明细
        </Button>
        <Button size="sm" variant="outline" @click="emit('handleExport')">
          <Download class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex flex-col items-center justify-center p-12">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500"></div>
      <p class="text-sm text-muted-foreground mt-4">加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="statisticsData.length === 0" class="flex flex-col items-center justify-center p-12">
      <div class="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Filter class="h-8 w-8 text-gray-400" />
      </div>
      <p class="text-muted-foreground">请选择日期范围查询数据</p>
    </div>

    <!-- 数据列表 -->
    <div v-else class="p-4 space-y-3">
      <!-- 汇总卡片 -->
      <div v-if="summaryData" class="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-4 text-white shadow-lg">
        <div class="text-sm opacity-90 mb-2">汇总统计</div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-2xl font-bold">{{ formatVal(summaryData.totalWeight) }}</div>
            <div class="text-xs opacity-75">总吨数</div>
          </div>
          <div>
            <div class="text-2xl font-bold">{{ formatPrice(summaryData.totalPrice) }}</div>
            <div class="text-xs opacity-75">总金额</div>
          </div>
        </div>
      </div>

      <!-- 客户卡片列表 -->
      <div v-for="item in statisticsData" :key="item.name" class="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <!-- 卡片头部 -->
        <div
          class="flex items-center justify-between p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700"
          @click="toggleExpand(item.name)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium text-base truncate">{{ item.name }}</div>
            <div class="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span>{{ formatVal(item.totalWeight) }} 吨</span>
              <span class="text-emerald-600 dark:text-emerald-400 font-medium">{{ formatPrice(item.totalPrice) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              class="h-8 w-8"
              @click.stop="emit('openSingleDetail', item.name)"
            >
              <Search class="h-4 w-4" />
            </Button>
            <component :is="isExpanded(item.name) ? ChevronUp : ChevronDown" class="h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="isExpanded(item.name)" class="border-t px-4 py-3 bg-gray-50/50 dark:bg-slate-700/50 space-y-3">
          <!-- 代收代付 -->
          <div>
            <div class="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">代收代付</div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">结算</div>
                <div class="font-medium">{{ formatVal(item.settledWDS) }}</div>
                <div class="text-xs text-blue-600">{{ formatPrice(item.settledPDS) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">未结算</div>
                <div class="font-medium">{{ formatVal(item.notSettledWDS) }}</div>
                <div class="text-xs text-blue-600">{{ formatPrice(item.notSettledPDS) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">不需结算</div>
                <div class="font-medium">{{ formatVal(item.notNeedWDS) }}</div>
              </div>
            </div>
          </div>

          <!-- 客户自提 -->
          <div>
            <div class="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">客户自提</div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">结算</div>
                <div class="font-medium">{{ formatVal(item.settledWZT) }}</div>
                <div class="text-xs text-indigo-600">{{ formatPrice(item.settledPZT) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">未结算</div>
                <div class="font-medium">{{ formatVal(item.notSettledWZT) }}</div>
                <div class="text-xs text-indigo-600">{{ formatPrice(item.notSettledPZT) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">不需结算</div>
                <div class="font-medium">{{ formatVal(item.notNeedWZT) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
