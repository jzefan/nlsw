<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronUp, Calendar, Download, Ship, Truck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { VesselRevenueData } from '@/services/api/vessel-statistics.api'

const props = defineProps<{
  loading: boolean
  statisticsData: VesselRevenueData[]
  summaryTotals: {
    vsTotal: number
    vsRevenue: number
    vsOwnWeight: number
    vsOwnIncome: number
    vsOwnDeposit: number
    vsOwnProfit: number
    vsNonOwnWeight: number
    vsNonOwnIncome: number
    vsNonOwnDeposit: number
    vsProfit: number
    vsFixedCost: number
    vhTotal: number
    vhRevenue: number
    vhOwnWeight: number
    vhOwnIncome: number
    vhOwnDeposit: number
    vhOwnProfit: number
    vhNonOwnWeight: number
    vhNonOwnIncome: number
    vhNonOwnDeposit: number
    vhProfit: number
    vhFixedCost: number
    drayage: number
    forklift: number
    vsNetProfit: number
    vhNetProfit: number
  } | null
  dateRange: string
}>()

const emit = defineEmits<{
  openDateDialog: []
  handleExport: []
  openDrillDown: [type: '自有' | '外挂', mode: 'summary' | 'detail']
}>()

// 展开状态管理
const expandedItems = ref<Set<string>>(new Set())

// 显示模式：vessel (船运) 或 vehicle (车运)
const viewMode = ref<'vessel' | 'vehicle'>('vessel')

function toggleExpand(month: string) {
  if (expandedItems.value.has(month)) {
    expandedItems.value.delete(month)
  } else {
    expandedItems.value.add(month)
  }
}

function isExpanded(month: string) {
  return expandedItems.value.has(month)
}

function formatVal(val: number) {
  return val.toFixed(3)
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
        <h1 class="text-lg font-bold text-center">车船营业额统计</h1>
        <p v-if="dateRange" class="text-xs text-center text-muted-foreground mt-1">{{ dateRange }}</p>
      </div>

      <!-- 视图切换 -->
      <div class="flex items-center justify-center gap-2 px-4 py-2">
        <Button
          size="sm"
          :variant="viewMode === 'vessel' ? 'default' : 'outline'"
          @click="viewMode = 'vessel'"
          class="flex-1"
        >
          <Ship class="w-4 h-4 mr-1" />
          船运
        </Button>
        <Button
          size="sm"
          :variant="viewMode === 'vehicle' ? 'default' : 'outline'"
          @click="viewMode = 'vehicle'"
          class="flex-1"
        >
          <Truck class="w-4 h-4 mr-1" />
          车运
        </Button>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center justify-between px-4 py-2 border-t bg-gray-50 dark:bg-slate-800">
        <Button size="sm" @click="emit('openDateDialog')" class="flex-1 mr-2">
          <Calendar class="w-4 h-4 mr-1" />
          选择日期
        </Button>
        <Button size="sm" variant="outline" @click="emit('handleExport')">
          <Download class="w-4 h-4" />
        </Button>
      </div>

      <!-- 明细按钮 -->
      <div class="flex items-center gap-2 px-4 py-2 border-t bg-white dark:bg-slate-900">
        <Button size="sm" variant="ghost" @click="emit('openDrillDown', '自有', 'summary')" class="flex-1 text-xs"
          >自有统计</Button
        >
        <Button size="sm" variant="ghost" @click="emit('openDrillDown', '自有', 'detail')" class="flex-1 text-xs"
          >自有清单</Button
        >
        <Button size="sm" variant="ghost" @click="emit('openDrillDown', '外挂', 'summary')" class="flex-1 text-xs"
          >外挂统计</Button
        >
        <Button size="sm" variant="ghost" @click="emit('openDrillDown', '外挂', 'detail')" class="flex-1 text-xs"
          >外挂清单</Button
        >
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
        <component :is="viewMode === 'vessel' ? Ship : Truck" class="h-8 w-8 text-gray-400" />
      </div>
      <p class="text-muted-foreground">请选择日期范围查询数据</p>
    </div>

    <!-- 数据列表 -->
    <div v-else class="p-4 space-y-3">
      <!-- 汇总卡片 -->
      <div v-if="summaryTotals" class="rounded-xl overflow-hidden shadow-lg">
        <!-- 船运汇总 -->
        <div v-if="viewMode === 'vessel'" class="bg-gradient-to-r from-indigo-500 to-purple-500 p-4 text-white">
          <div class="flex items-center gap-2 mb-3">
            <Ship class="w-5 h-5" />
            <span class="font-medium">船运汇总</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-2xl font-bold">{{ formatVal(summaryTotals.vsTotal) }}</div>
              <div class="text-xs opacity-75">总吨位</div>
            </div>
            <div>
              <div class="text-2xl font-bold">{{ formatPrice(summaryTotals.vsRevenue) }}</div>
              <div class="text-xs opacity-75">总金额</div>
            </div>
            <div>
              <div
                class="text-xl font-bold"
                :class="summaryTotals.vsNetProfit >= 0 ? 'text-green-200' : 'text-red-200'"
              >
                {{ formatPrice(summaryTotals.vsNetProfit) }}
              </div>
              <div class="text-xs opacity-75">净利润</div>
            </div>
            <div>
              <div class="text-xl font-bold text-red-200">{{ formatPrice(summaryTotals.vsFixedCost) }}</div>
              <div class="text-xs opacity-75">固定成本</div>
            </div>
          </div>
        </div>

        <!-- 车运汇总 -->
        <div v-else class="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white">
          <div class="flex items-center gap-2 mb-3">
            <Truck class="w-5 h-5" />
            <span class="font-medium">车运汇总</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-2xl font-bold">{{ formatVal(summaryTotals.vhTotal) }}</div>
              <div class="text-xs opacity-75">总吨位</div>
            </div>
            <div>
              <div class="text-2xl font-bold">{{ formatPrice(summaryTotals.vhRevenue) }}</div>
              <div class="text-xs opacity-75">总金额</div>
            </div>
            <div>
              <div
                class="text-xl font-bold"
                :class="summaryTotals.vhNetProfit >= 0 ? 'text-green-200' : 'text-red-200'"
              >
                {{ formatPrice(summaryTotals.vhNetProfit) }}
              </div>
              <div class="text-xs opacity-75">净利润</div>
            </div>
            <div>
              <div class="text-xl font-bold text-red-200">{{ formatPrice(summaryTotals.vhFixedCost) }}</div>
              <div class="text-xs opacity-75">固定成本</div>
            </div>
          </div>
          <!-- 额外收入 -->
          <div class="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/20">
            <div>
              <div class="text-lg font-medium">{{ formatPrice(summaryTotals.drayage) }}</div>
              <div class="text-xs opacity-75">短驳应收</div>
            </div>
            <div>
              <div class="text-lg font-medium">{{ formatPrice(summaryTotals.forklift) }}</div>
              <div class="text-xs opacity-75">叉车应收</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 月份卡片列表 -->
      <div
        v-for="item in statisticsData"
        :key="item.month"
        class="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden"
      >
        <!-- 卡片头部 -->
        <div
          class="flex items-center justify-between p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700"
          @click="toggleExpand(item.month)"
        >
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full flex items-center justify-center"
              :class="
                viewMode === 'vessel' ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
              "
            >
              <component
                :is="viewMode === 'vessel' ? Ship : Truck"
                class="h-5 w-5"
                :class="viewMode === 'vessel' ? 'text-indigo-600' : 'text-amber-600'"
              />
            </div>
            <div>
              <div class="font-medium">{{ item.month }}</div>
              <div class="text-sm text-muted-foreground">
                {{ viewMode === 'vessel' ? formatVal(item.vsTotal) : formatVal(item.vhTotal) }} 吨
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="font-bold" :class="viewMode === 'vessel' ? 'text-indigo-600' : 'text-amber-600'">
                {{ viewMode === 'vessel' ? formatPrice(item.vsRevenue) : formatPrice(item.vhRevenue) }}
              </div>
              <div class="text-xs text-muted-foreground">营业额</div>
            </div>
            <component :is="isExpanded(item.month) ? ChevronUp : ChevronDown" class="h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <!-- 展开详情 - 船运 -->
        <div
          v-if="isExpanded(item.month) && viewMode === 'vessel'"
          class="border-t px-4 py-3 bg-gray-50/50 dark:bg-slate-700/50 space-y-3"
        >
          <!-- 自有车船 -->
          <div>
            <div class="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">自有船</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">吨位</div>
                <div class="font-medium">{{ formatVal(item.vsOwnWeight) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应收</div>
                <div class="font-medium text-blue-600">{{ formatPrice(item.vsOwnIncome) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应付</div>
                <div class="font-medium text-red-600">{{ formatPrice(item.vsOwnDeposit) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">利润</div>
                <div class="font-bold">{{ formatPrice(item.vsOwnProfit) }}</div>
              </div>
            </div>
          </div>

          <!-- 外挂车船 -->
          <div>
            <div class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">外挂船</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">吨位</div>
                <div class="font-medium">{{ formatVal(item.vsNonOwnWeight) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应收</div>
                <div class="font-medium text-blue-600">{{ formatPrice(item.vsNonOwnIncome) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应付</div>
                <div class="font-medium text-red-600">{{ formatPrice(item.vsNonOwnDeposit) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">利润</div>
                <div class="font-bold">{{ formatPrice(item.vsProfit) }}</div>
              </div>
            </div>
          </div>

          <!-- 成本与利润 -->
          <div class="flex items-center justify-between pt-2 border-t text-sm">
            <div>
              <span class="text-muted-foreground">固定成本：</span>
              <span class="text-red-600 font-medium">{{ formatPrice(item.vsFixedCost) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">净利润：</span>
              <span
                class="font-bold"
                :class="item.vsOwnProfit + item.vsProfit - item.vsFixedCost >= 0 ? 'text-green-600' : 'text-red-600'"
              >
                {{ formatPrice(item.vsOwnProfit + item.vsProfit - item.vsFixedCost) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 展开详情 - 车运 -->
        <div
          v-if="isExpanded(item.month) && viewMode === 'vehicle'"
          class="border-t px-4 py-3 bg-gray-50/50 dark:bg-slate-700/50 space-y-3"
        >
          <!-- 自有车辆 -->
          <div>
            <div class="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">自有车</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">吨位</div>
                <div class="font-medium">{{ formatVal(item.vhOwnWeight) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应收</div>
                <div class="font-medium text-blue-600">{{ formatPrice(item.vhOwnIncome) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应付</div>
                <div class="font-medium text-red-600">{{ formatPrice(item.vhOwnDeposit) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">利润</div>
                <div class="font-bold">{{ formatPrice(item.vhOwnProfit) }}</div>
              </div>
            </div>
          </div>

          <!-- 外挂车辆 -->
          <div>
            <div class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">外挂车</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">吨位</div>
                <div class="font-medium">{{ formatVal(item.vhNonOwnWeight) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应收</div>
                <div class="font-medium text-blue-600">{{ formatPrice(item.vhNonOwnIncome) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">应付</div>
                <div class="font-medium text-red-600">{{ formatPrice(item.vhNonOwnDeposit) }}</div>
              </div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-2">
                <div class="text-xs text-muted-foreground">利润</div>
                <div class="font-bold">{{ formatPrice(item.vhProfit) }}</div>
              </div>
            </div>
          </div>

          <!-- 额外收入 -->
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
              <div class="text-xs text-muted-foreground">短驳应收</div>
              <div class="font-medium text-blue-600">{{ formatPrice(item.drayage) }}</div>
            </div>
            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
              <div class="text-xs text-muted-foreground">叉车应收</div>
              <div class="font-medium text-blue-600">{{ formatPrice(item.forklift) }}</div>
            </div>
          </div>

          <!-- 成本与利润 -->
          <div class="flex items-center justify-between pt-2 border-t text-sm">
            <div>
              <span class="text-muted-foreground">固定成本：</span>
              <span class="text-red-600 font-medium">{{ formatPrice(item.vhFixedCost) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">净利润：</span>
              <span
                class="font-bold"
                :class="
                  item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                "
              >
                {{ formatPrice(item.vhOwnProfit + item.vhProfit - item.vhFixedCost + item.drayage + item.forklift) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
