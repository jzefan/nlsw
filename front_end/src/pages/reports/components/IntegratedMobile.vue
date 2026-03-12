<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDate } from '@/utils/format'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  FileSpreadsheet,
  RefreshCcw,
  Search,
  X,
  ArrowRight,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import type { IntegratedQueryBill } from '@/services/api/report.api'

const props = defineProps<{
  loading: boolean
  bills: IntegratedQueryBill[]
  total: number
  totalNum: number
  totalWeight: number
  showNotSent: boolean
  showDestForVessel: boolean
  filter: {
    billingName: string
    vehicle: string
    vehicleMode: string
    destination: string
    origin: string
    customer: string
    orderNo: string
    billNo: string
    startDate: string
    endDate: string
  }
  customers: string[]
  vehicleModes: string[]
  page: number
  limit: number
  hasPrivilege: boolean
  searchBillingNames: (search: string, limit: number, page: number) => Promise<any>
  searchVehiclesFn: (search: string, limit: number, page: number) => Promise<any>
  searchDestinationsFn: (search: string, limit: number, page: number) => Promise<any>
  searchOriginsFn: (search: string, limit: number, page: number) => Promise<any>
}>()

const emit = defineEmits<{
  'update:filter': [filter: typeof props.filter]
  'update:showNotSent': [value: boolean]
  'update:showDestForVessel': [value: boolean]
  query: [resetPage: boolean]
  reset: []
  export: []
  exportAccount: []
  pageChange: [page: number]
}>()

// 本地筛选状态
const localFilter = ref({ ...props.filter })
const localShowNotSent = ref(props.showNotSent)
const localShowDestForVessel = ref(props.showDestForVessel)

// 筛选面板状态
const showFilterSheet = ref(false)

// 展开状态
const expandedItems = ref<Set<number>>(new Set())

function toggleExpand(index: number) {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
}

function isExpanded(index: number) {
  return expandedItems.value.has(index)
}

// 应用筛选
function applyFilter() {
  emit('update:filter', { ...localFilter.value })
  emit('update:showNotSent', localShowNotSent.value)
  emit('update:showDestForVessel', localShowDestForVessel.value)
  emit('query', true)
  showFilterSheet.value = false
}

// 重置筛选
function resetFilter() {
  localFilter.value = {
    billingName: '',
    vehicle: '',
    vehicleMode: '',
    destination: '',
    origin: '',
    customer: '',
    orderNo: '',
    billNo: '',
    startDate: '',
    endDate: '',
  }
  localShowNotSent.value = false
  localShowDestForVessel.value = false
  emit('reset')
  showFilterSheet.value = false
}


// 获取订单号
function getOrder(orderNo: string, itemNo: string) {
  if (itemNo) return `${orderNo}-${itemNo}`
  return orderNo
}

// 获取状态样式
function getStatusStyle(status: string) {
  switch (status) {
    case '已结算':
      return 'bg-green-100 text-green-800'
    case '已配发':
      return 'bg-blue-100 text-blue-800'
    case '待配发':
      return 'bg-yellow-100 text-yellow-800'
    case '新建':
      return 'bg-gray-100 text-gray-800'
    case '作废':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

// 获取结算状态颜色
function getSettleStatusColor(bill: IntegratedQueryBill) {
  if (bill.inv_settle_flag === 3) return 'text-green-600'
  if (bill.inv_settle_flag === 1 || bill.inv_settle_flag === 2) return 'text-amber-600'
  return 'text-red-500'
}

// 获取结算状态
function getSettleStatus(bill: IntegratedQueryBill) {
  if (props.showNotSent) return ''
  if (bill.inv_settle_flag === 0) {
    if (bill.collection_price < 0 && bill.price < 0) return '客户、代收都不需结算'
    if (bill.price < 0) return '客户不需结算，代收未结算'
    if (bill.collection_price < 0) return '客户未结算，代收不需结算'
    return '客户、代收都未结算'
  } else if (bill.inv_settle_flag === 1) {
    if (bill.collection_price < 0) return '客户已结算，代收不需结算'
    return '客户已结算，代收未结算'
  } else if (bill.inv_settle_flag === 2) {
    if (bill.price < 0) return '客户不需结算，代收已结算'
    return '代收已结算，客户未结算'
  } else if (bill.inv_settle_flag === 3) {
    return '客户、代收都已结算'
  }
  return ''
}

// 活跃筛选数量
const activeFilterCount = computed(() => {
  let count = 0
  if (props.filter.billingName) count++
  if (props.filter.vehicle) count++
  if (props.filter.vehicleMode) count++
  if (props.filter.destination) count++
  if (props.filter.origin) count++
  if (props.filter.customer) count++
  if (props.filter.orderNo) count++
  if (props.filter.billNo) count++
  if (props.filter.startDate) count++
  if (props.filter.endDate) count++
  if (props.showNotSent) count++
  if (props.showDestForVessel) count++
  return count
})

// 加载进度百分比
const loadProgress = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.bills.length / props.total) * 100)
})

// 获取发运重量
function getSendWeight(bill: IntegratedQueryBill) {
  if (props.showNotSent) {
    return ((bill.block_num ?? 0) > 0 ? bill.left_num * bill.weight : bill.left_num)?.toFixed(3)
  }
  return bill.send_weight?.toFixed(3)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
    <!-- 顶部固定栏：标题 + 操作按钮合并为一行 -->
    <div class="sticky top-0 z-20 bg-white dark:bg-slate-900 shadow-sm">
      <div class="flex items-center justify-between px-4 py-2.5">
        <h1 class="text-base font-semibold">综合查询</h1>
        <div class="flex items-center gap-1.5">
          <Sheet v-model:open="showFilterSheet">
            <SheetTrigger as-child>
              <Button size="sm" variant="outline" class="relative h-8">
                <Filter class="h-4 w-4 mr-1" />
                筛选
                <Badge
                  v-if="activeFilterCount > 0"
                  class="absolute -top-1.5 -right-1.5 h-4 min-w-4 p-0 justify-center text-[10px]"
                  >{{ activeFilterCount }}</Badge
                >
              </Button>
            </SheetTrigger>

            <SheetContent side="bottom" class="h-[80vh] overflow-y-auto">
              <SheetHeader class="mb-4">
                <SheetTitle>筛选条件</SheetTitle>
              </SheetHeader>

              <div class="grid grid-cols-2 gap-3">
                <!-- 行1：开单名称 | 发货单位 -->
                <SearchableCombobox
                  v-model="localFilter.billingName"
                  :search-fn="searchBillingNames"
                  placeholder="开单名称"
                />
                <Select v-model="localFilter.customer" :disabled="localShowNotSent || customers.length === 0">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="发货单位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="c in customers" :key="c" :value="c">{{ c }}</SelectItem>
                  </SelectContent>
                </Select>

                <!-- 行2：订单号 | 提单号 -->
                <Input v-model="localFilter.orderNo" placeholder="订单号" />
                <Input v-model="localFilter.billNo" placeholder="提单号" />

                <!-- 行3：车船号 | 运输方式 -->
                <SearchableCombobox
                  v-model="localFilter.vehicle"
                  :search-fn="searchVehiclesFn"
                  placeholder="车船号"
                  :disabled="localShowNotSent"
                />
                <Select v-model="localFilter.vehicleMode" :disabled="localShowNotSent">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="运输方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="m in vehicleModes" :key="m" :value="m">{{ m }}</SelectItem>
                  </SelectContent>
                </Select>

                <!-- 行4：目的地 | 起始地 -->
                <SearchableCombobox
                  v-model="localFilter.destination"
                  :search-fn="searchDestinationsFn"
                  placeholder="目的地"
                  :disabled="localShowNotSent"
                />
                <SearchableCombobox
                  v-model="localFilter.origin"
                  :search-fn="searchOriginsFn"
                  placeholder="起始地"
                  :disabled="localShowNotSent"
                />

                <!-- 行5：开始日期 | 结束日期 -->
                <DatePicker v-model="localFilter.startDate" placeholder="开始日期" :disabled="localShowNotSent" />
                <DatePicker v-model="localFilter.endDate" placeholder="结束日期" :disabled="localShowNotSent" />

                <!-- 行6：复选框 -->
                <div class="flex items-center gap-2">
                  <Checkbox id="m-showNotSent" v-model="localShowNotSent" />
                  <Label for="m-showNotSent" class="text-sm">未配发</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox id="m-showDestForVessel" v-model="localShowDestForVessel" :disabled="localShowNotSent" />
                  <Label for="m-showDestForVessel" class="text-sm">目的地为船</Label>
                </div>

                <!-- 底部操作按钮 -->
                <Button variant="outline" @click="resetFilter">
                  <RefreshCcw class="w-4 h-4 mr-1" />
                  重置
                </Button>
                <Button @click="applyFilter" :disabled="loading">
                  <Search class="w-4 h-4 mr-1" />
                  查询
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button size="sm" variant="outline" class="h-8" @click="emit('exportAccount')">
            <FileSpreadsheet class="h-4 w-4 mr-1" />
            对账
          </Button>

          <Button size="sm" variant="outline" class="h-8" @click="emit('export')">
            <Download class="h-4 w-4 mr-1" />
            导出
          </Button>
        </div>
      </div>

      <!-- 汇总统计：grid-cols-3 指标卡片 -->
      <div class="grid grid-cols-3 border-t">
        <div class="flex flex-col items-center py-2 border-r">
          <span class="text-[12px] text-muted-foreground">总条数</span>
          <span class="text-sm font-bold text-foreground">{{ total }}</span>
        </div>
        <div v-if="!showNotSent" class="flex flex-col items-center py-2 border-r">
          <span class="text-[12px] text-muted-foreground">块数</span>
          <span class="text-sm font-bold text-foreground">{{ totalNum }}</span>
        </div>
        <div v-else class="flex flex-col items-center py-2 border-r">
          <span class="text-[12px] text-muted-foreground">块数</span>
          <span class="text-sm font-bold text-muted-foreground">-</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-[12px] text-muted-foreground">重量</span>
          <span class="text-sm font-bold text-foreground">{{ totalWeight.toFixed(3) }}</span>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex flex-col items-center justify-center p-12">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500"></div>
      <p class="text-sm text-muted-foreground mt-4">加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="bills.length === 0" class="flex flex-col items-center justify-center p-12">
      <div class="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Search class="h-8 w-8 text-gray-400" />
      </div>
      <p class="text-muted-foreground">请设置筛选条件后查询</p>
    </div>

    <!-- 数据列表 -->
    <div v-else class="p-3 space-y-2">
      <div
        v-for="(bill, index) in bills"
        :key="`${bill.bill_no}-${index}`"
        class="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden border border-gray-100 dark:border-slate-700"
      >
        <!-- 卡片摘要 -->
        <div class="px-3 py-2.5 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700" @click="toggleExpand(index)">
          <!-- 行1：状态 Badge + 提单号 + 展开箭头 -->
          <div class="flex items-center gap-2 mb-1.5">
            <Badge :class="getStatusStyle(bill.status)" class="text-[10px] shrink-0">{{ bill.status }}</Badge>
            <span class="text-xs text-muted-foreground">{{ bill.bill_no }}</span>
            <span v-if="getSettleStatus(bill)" class="text-[10px] ml-auto mr-1" :class="getSettleStatusColor(bill)">
              {{ bill.inv_settle_flag === 3 ? '已结' : '未结' }}
            </span>
            <component
              :is="isExpanded(index) ? ChevronUp : ChevronDown"
              class="h-4 w-4 text-muted-foreground shrink-0"
            />
          </div>

          <!-- 行2：开单名称 -->
          <div class="text-sm font-medium truncate mb-1">
            {{ bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name }}
          </div>

          <!-- 行3：起始地 → 目的地 | 发货日期 -->
          <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <div class="flex items-center gap-1 min-w-0 flex-1">
              <span class="truncate">{{ bill.ship_warehouse || '-' }}</span>
              <ArrowRight class="h-3 w-3 shrink-0" />
              <span class="truncate">{{ bill.ship_to || '-' }}</span>
            </div>
            <span class="shrink-0 ml-2">{{ formatDate(bill.inv_ship_date || '') }}</span>
          </div>

          <!-- 行4：发运重量 | 车船号 -->
          <div class="flex items-center justify-between text-xs">
            <span>
              <span class="text-muted-foreground">重量 </span>
              <span class="font-semibold text-blue-600">{{ getSendWeight(bill) }}</span>
            </span>
            <span>
              <span class="text-muted-foreground">车船号 </span>
              <span class="font-medium">{{ bill.veh_ves_name || '-' }}</span>
            </span>
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="isExpanded(index)" class="border-t px-3 py-2.5 bg-gray-50/50 dark:bg-slate-700/50 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div>
              <span class="text-muted-foreground">订单号：</span>
              <span>{{ getOrder(bill.order_no, bill.order_item_no) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">运单号：</span>
              <span>{{ bill.inv_no || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">发运块数：</span>
              <span>{{ showNotSent ? 0 : bill.send_num }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">总块数：</span>
              <span>{{ bill.block_num }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">总重量：</span>
              <span>{{ bill.total_weight?.toFixed(3) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">牌号：</span>
              <span>{{ bill.brand_no || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">规格：</span>
              <span>{{ bill.thickness }}*{{ bill.width }}*{{ bill.len }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">合同号：</span>
              <span>{{ bill.contract_no || '-' }}</span>
            </div>
          </div>

          <!-- 价格信息（需要权限） -->
          <div v-if="hasPrivilege" class="grid grid-cols-3 gap-2 pt-1.5 border-t">
            <div>
              <span class="text-muted-foreground">客户价：</span>
              <span class="text-blue-600 font-medium">{{ bill.price }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">南钢价：</span>
              <span class="text-green-600 font-medium">{{ bill.collection_price }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">应付价：</span>
              <span class="text-red-600 font-medium">{{ bill.veh_ves_price }}</span>
            </div>
          </div>

          <!-- 结算状态 -->
          <div v-if="getSettleStatus(bill)" class="pt-1.5 border-t">
            <span class="text-muted-foreground">结算：</span>
            <span :class="getSettleStatusColor(bill)">{{ getSettleStatus(bill) }}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1.5 border-t text-[10px] text-muted-foreground">
            <div>创建人：{{ bill.creater }}</div>
            <div>创建日期：{{ formatDate(bill.create_date) }}</div>
          </div>
        </div>
      </div>

      <!-- 加载更多 + 进度 -->
      <div v-if="bills.length < total" class="py-3 space-y-2">
        <Progress :model-value="loadProgress" class="h-1.5" />
        <div class="text-center">
          <Button variant="outline" class="w-full" @click="emit('pageChange', page + 1)" :disabled="loading">
            加载更多 ({{ bills.length }}/{{ total }})
          </Button>
        </div>
      </div>

      <!-- 全部加载完成 -->
      <div v-else-if="bills.length > 0" class="py-3 text-center text-xs text-muted-foreground">
        已加载全部 {{ total }} 条数据
      </div>
    </div>
  </div>
</template>
