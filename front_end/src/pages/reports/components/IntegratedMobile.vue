<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Download, Filter, FileSpreadsheet, RefreshCcw, Search, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  // 搜索函数
  searchBillingNames: (search: string, limit: number, page: number) => Promise<any>
  searchVehiclesFn: (search: string, limit: number, page: number) => Promise<any>
  searchDestinationsFn: (search: string, limit: number, page: number) => Promise<any>
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

// 格式化日期
function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
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

// 获取结算状态
function getSettleStatus(bill: IntegratedQueryBill) {
  if (props.showNotSent) return ''
  if (bill.inv_settle_flag === 0) {
    if (bill.collection_price < 0 && bill.price < 0) return '客户、代收都不需结算'
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
  if (props.filter.customer) count++
  if (props.filter.orderNo) count++
  if (props.filter.billNo) count++
  if (props.filter.startDate) count++
  if (props.filter.endDate) count++
  if (props.showNotSent) count++
  if (props.showDestForVessel) count++
  return count
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
    <!-- 顶部固定栏 -->
    <div class="sticky top-0 z-20 bg-white dark:bg-slate-900 shadow-sm">
      <div class="px-4 py-3">
        <h1 class="text-lg font-bold text-center">综合查询</h1>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-2 px-4 py-2 border-t bg-gray-50 dark:bg-slate-800">
        <Sheet v-model:open="showFilterSheet">
          <SheetTrigger as-child>
            <Button size="sm" variant="outline" class="flex-1">
              <Filter class="w-4 h-4 mr-1" />
              筛选
              <Badge v-if="activeFilterCount > 0" class="ml-1 h-5 w-5 p-0 justify-center">{{ activeFilterCount }}</Badge>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" class="h-[85vh] overflow-y-auto">
            <SheetHeader class="mb-4">
              <SheetTitle>筛选条件</SheetTitle>
            </SheetHeader>

            <div class="space-y-4">
              <!-- 开单名称 -->
              <div class="space-y-2">
                <Label>开单名称</Label>
                <SearchableCombobox
                  v-model="localFilter.billingName"
                  :search-fn="searchBillingNames"
                  placeholder="搜索开单名称"
                />
              </div>

              <!-- 发货单位 -->
              <div class="space-y-2">
                <Label>发货单位</Label>
                <Select v-model="localFilter.customer" :disabled="localShowNotSent || customers.length === 0">
                  <SelectTrigger>
                    <SelectValue placeholder="选择发货单位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="c in customers" :key="c" :value="c">{{ c }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- 订单号 & 提单号 -->
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-2">
                  <Label>订单号</Label>
                  <Input v-model="localFilter.orderNo" placeholder="订单号" />
                </div>
                <div class="space-y-2">
                  <Label>提单号</Label>
                  <Input v-model="localFilter.billNo" placeholder="提单号" />
                </div>
              </div>

              <!-- 车船号 -->
              <div class="space-y-2">
                <Label>车船号</Label>
                <SearchableCombobox
                  v-model="localFilter.vehicle"
                  :search-fn="searchVehiclesFn"
                  placeholder="搜索车船号"
                  :disabled="localShowNotSent"
                />
              </div>

              <!-- 运输方式 -->
              <div class="space-y-2">
                <Label>运输方式</Label>
                <Select v-model="localFilter.vehicleMode" :disabled="localShowNotSent">
                  <SelectTrigger>
                    <SelectValue placeholder="选择运输方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="m in vehicleModes" :key="m" :value="m">{{ m }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- 目的地 -->
              <div class="space-y-2">
                <Label>目的地</Label>
                <SearchableCombobox
                  v-model="localFilter.destination"
                  :search-fn="searchDestinationsFn"
                  placeholder="搜索目的地"
                  :disabled="localShowNotSent"
                />
              </div>

              <!-- 日期范围 -->
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-2">
                  <Label>开始日期</Label>
                  <DatePicker v-model="localFilter.startDate" placeholder="开始日期" :disabled="localShowNotSent" />
                </div>
                <div class="space-y-2">
                  <Label>结束日期</Label>
                  <DatePicker v-model="localFilter.endDate" placeholder="结束日期" :disabled="localShowNotSent" />
                </div>
              </div>

              <!-- 复选框 -->
              <div class="flex items-center gap-6 py-2">
                <div class="flex items-center gap-2">
                  <Checkbox id="m-showNotSent" v-model:checked="localShowNotSent" />
                  <Label for="m-showNotSent" class="text-sm">未配发</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox id="m-showDestForVessel" v-model:checked="localShowDestForVessel" :disabled="localShowNotSent" />
                  <Label for="m-showDestForVessel" class="text-sm">目的地为船</Label>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex gap-3 pt-4">
                <Button variant="outline" class="flex-1" @click="resetFilter">
                  <RefreshCcw class="w-4 h-4 mr-1" />
                  重置
                </Button>
                <Button class="flex-1" @click="applyFilter" :disabled="loading">
                  <Search class="w-4 h-4 mr-1" />
                  查询
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Button size="sm" variant="outline" @click="emit('exportAccount')">
          <FileSpreadsheet class="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" @click="emit('export')">
          <Download class="w-4 h-4" />
        </Button>
      </div>

      <!-- 汇总信息 -->
      <div class="flex items-center justify-around px-4 py-2 border-t text-xs text-muted-foreground bg-white dark:bg-slate-900">
        <span>共 <strong class="text-foreground">{{ total }}</strong> 条</span>
        <span v-if="!showNotSent">块数 <strong class="text-foreground">{{ totalNum }}</strong></span>
        <span>重量 <strong class="text-foreground">{{ totalWeight.toFixed(3) }}</strong></span>
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
    <div v-else class="p-4 space-y-3">
      <div
        v-for="(bill, index) in bills"
        :key="`${bill.bill_no}-${index}`"
        class="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden"
      >
        <!-- 卡片头部 -->
        <div
          class="p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700"
          @click="toggleExpand(index)"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <Badge :class="getStatusStyle(bill.status)" class="text-xs">{{ bill.status }}</Badge>
                <span class="text-xs text-muted-foreground">{{ bill.bill_no }}</span>
              </div>
              <div class="font-medium text-sm truncate">
                {{ bill.ship_customer ? `${bill.billing_name}/${bill.ship_customer}` : bill.billing_name }}
              </div>
            </div>
            <component :is="isExpanded(index) ? ChevronUp : ChevronDown" class="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span class="text-muted-foreground">车船号：</span>
              <span class="font-medium">{{ bill.veh_ves_name || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">目的地：</span>
              <span class="font-medium">{{ bill.ship_to || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">重量：</span>
              <span class="font-medium text-blue-600">{{ (showNotSent ? (bill.block_num > 0 ? bill.left_num * bill.weight : bill.left_num) : bill.send_weight)?.toFixed(3) }}</span>
            </div>
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="isExpanded(index)" class="border-t px-4 py-3 bg-gray-50/50 dark:bg-slate-700/50 space-y-2 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <span class="text-muted-foreground">订单号：</span>
              <span>{{ getOrder(bill.order_no, bill.order_item_no) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">发货日期：</span>
              <span>{{ formatDate(bill.inv_ship_date || '') }}</span>
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
              <span class="text-muted-foreground">运单号：</span>
              <span>{{ bill.inv_no || '-' }}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2 border-t">
            <div>
              <span class="text-muted-foreground">发货仓库：</span>
              <span>{{ bill.ship_warehouse || '-' }}</span>
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
          <div v-if="hasPrivilege" class="grid grid-cols-3 gap-2 pt-2 border-t">
            <div>
              <span class="text-muted-foreground">客户单价：</span>
              <span class="text-blue-600">{{ bill.price }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">南钢单价：</span>
              <span class="text-green-600">{{ bill.collection_price }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">应付单价：</span>
              <span class="text-red-600">{{ bill.veh_ves_price }}</span>
            </div>
          </div>

          <!-- 结算状态 -->
          <div v-if="getSettleStatus(bill)" class="pt-2 border-t">
            <span class="text-muted-foreground">结算状态：</span>
            <span class="text-amber-600">{{ getSettleStatus(bill) }}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-muted-foreground">
            <div>创建人：{{ bill.creater }}</div>
            <div>创建日期：{{ formatDate(bill.create_date) }}</div>
          </div>
        </div>
      </div>

      <!-- 加载更多 -->
      <div v-if="bills.length < total" class="py-4 text-center">
        <Button variant="outline" size="sm" @click="emit('pageChange', page + 1)" :disabled="loading">
          加载更多 ({{ bills.length }}/{{ total }})
        </Button>
      </div>
    </div>
  </div>
</template>
