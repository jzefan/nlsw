<script lang="ts" setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import {
  Loader2,
  Truck,
  Ship,
  FileText,
  Receipt,
  TrendingUp,
  Database,
  BookOpen,
  ClipboardList,
  CreditCard,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Settings,
  Trash2,
  List,
  DollarSign,
  BarChart3,
  Warehouse,
  MapPin,
  Tag,
  Building,
} from 'lucide-vue-next'
import { VisAxis, VisStackedBar, VisXYContainer } from '@unovis/vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAuthStore } from '@/stores/auth'
import { hasPermission, isAdmin, PERMISSIONS } from '@/constants/permissions'
import {
  getDashboardStatistics,
  getDashboardInvoiceDetails,
  getDashboardBillingNamesStats,
  type DashboardStats,
  type VehicleData,
  type InvoiceDetail,
  type BillingNameStats,
} from '@/services/api/statistics.api'

// ¥ icon component for RMB
const RmbIcon = () => h('span', { class: 'text-base font-bold leading-none' }, '¥')

const router = useRouter()
const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const privilege = computed(() => user.value?.privilege ?? [])

// Data
const now = new Date()
const currentYear = now.getFullYear()
const years = Array.from({ length: 20 }, (_, i) => (currentYear - i).toString())
const selectedYear = ref(currentYear.toString())
const startDate = ref(`${currentYear}-01`)
const endDate = ref(`${currentYear}-12`)

const loading = ref(false)
const hasLoaded = ref(false)
const stats = ref<DashboardStats>({
  totalTonnage: 0,
  truckToShipUnsettledTonnage: 0,
  customerUnsettledTonnage: 0,
  collectionUnsettledTonnage: 0,
  totalSettledTonnage: 0,
  totalInvoiceTonnage: 0,
  totalPaymentTonnage: 0,
  billingNameCount: 0,
  monthlyTrend: [],
  top10BillingNames: [],
  top5Vehicles: [],
  allVehicles: [],
  ownVehicleCount: 0,
  ownVehicleTonnage: 0,
  outsourcedVehicleCount: 0,
  outsourcedVehicleTonnage: 0,
  truckTonnage: 0,
  vesselTonnage: 0,
})

async function loadData() {
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
    hasLoaded.value = true
  }
}

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

// Chart data
const colors = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706',
  '#ca8a04', '#65a30d', '#16a34a', '#059669', '#0891b2', '#0284c7',
]

const chartData = computed(() => {
  const result = []
  const start = new Date(startDate.value + '-01')
  const end = new Date(endDate.value + '-01')
  const current = new Date(start)
  while (current <= end) {
    const year = current.getFullYear()
    const month = current.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}`
    const match = stats.value.monthlyTrend.find(d => d.date === dateStr)
    result.push({
      date: dateStr,
      weight: match ? match.weight : 0,
      label: `${month}月`,
    })
    current.setMonth(current.getMonth() + 1)
  }
  return result.map((item, index) => ({ ...item, index }))
})

const x = (d: any) => d.index
const y = (d: any) => d.weight
const color = (d: any, i: number) => colors[i % colors.length]
const tickFormat = (i: number) => chartData.value[i]?.label || ''
const xDomain = computed(() => [-0.5, chartData.value.length - 0.5])

// Feature items
type FeatureItem = { title: string; icon: any; url: string; color: string; bgColor: string }

const quickFeatures = computed<FeatureItem[]>(() => {
  const isAdminUser = isAdmin(privilege.value)
  const isOperator = !isAdminUser && hasPermission(privilege.value, PERMISSIONS.OPERATOR)

  if (isAdminUser) {
    // 管理员：客户营业额, 车船营业额, 配发-车运, 配发-船运, 综合查询, 结算, 车船结算, 新建计划
    return [
      { title: '客户营业额', icon: TrendingUp, url: '/reports/customer-revenue', color: 'text-fuchsia-600', bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/30' },
      { title: '车船营业额', icon: Ship, url: '/reports/vessel-revenue', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
      { title: '配发-车运', icon: Truck, url: '/invoices/create-truck', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
      { title: '配发-船运', icon: Ship, url: '/invoices/create-ship', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
      { title: '综合查询', icon: TrendingUp, url: '/reports/integrated', color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-900/30' },
      { title: '结算', icon: Receipt, url: '/settle/bill', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
      { title: '车船结算', icon: Ship, url: '/settle/vessel', color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
      { title: '新建计划', icon: ClipboardList, url: '/plans/create', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
    ]
  }

  if (isOperator) {
    // 一般业务员：配发-车运, 配发-船运, 新建提单, 综合查询
    return [
      { title: '配发-车运', icon: Truck, url: '/invoices/create-truck', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
      { title: '配发-船运', icon: Ship, url: '/invoices/create-ship', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
      { title: '新建提单', icon: FileText, url: '/bills/create', color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30' },
      { title: '综合查询', icon: TrendingUp, url: '/reports/integrated', color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-900/30' },
    ]
  }

  // 其它权限：配发-车运, 配发-船运, 结算, 车船结算, 综合查询, 开票, 回款, 运单报告
  return [
    { title: '配发-车运', icon: Truck, url: '/invoices/create-truck', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
    { title: '配发-船运', icon: Ship, url: '/invoices/create-ship', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { title: '结算', icon: Receipt, url: '/settle/bill', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
    { title: '车船结算', icon: Ship, url: '/settle/vessel', color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
    { title: '综合查询', icon: TrendingUp, url: '/reports/integrated', color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-900/30' },
    { title: '开票', icon: CreditCard, url: '/settle/ticket', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
    { title: '回款', icon: RmbIcon, url: '/settle/money', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/30' },
    { title: '运单报表', icon: BarChart3, url: '/reports/invoice', color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-900/30' },
  ]
})

// All features - grouped by category for expanded view
const allFeatures = computed<{ group: string; items: FeatureItem[] }[]>(() => {
  const groups: { group: string; items: FeatureItem[] }[] = []

  // 业务管理
  if (hasPermission(privilege.value, PERMISSIONS.OPERATOR)) {
    groups.push({
      group: '业务管理',
      items: [
        { title: '配发-车运', icon: Truck, url: '/invoices/create-truck', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
        { title: '配发-船运', icon: Ship, url: '/invoices/create-ship', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
        { title: '新建提单', icon: FileText, url: '/bills/create', color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30' },
        { title: '提单列表', icon: List, url: '/bills/list', color: 'text-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30' },
        { title: '删除提单', icon: Trash2, url: '/bills/delete', color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/30' },
        { title: '新建计划', icon: ClipboardList, url: '/plans/create', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
        { title: '计划列表', icon: List, url: '/plans', color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
        { title: '删除运单', icon: Trash2, url: '/invoices/delete', color: 'text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/30' },
      ],
    })
  }

  // 结算管理
  const settleItems: FeatureItem[] = []
  if (hasPermission(privilege.value, PERMISSIONS.CUST_SETTLE)) {
    settleItems.push(
      { title: '结算', icon: Receipt, url: '/settle/bill', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
      { title: '开票', icon: CreditCard, url: '/settle/ticket', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
      { title: '回款', icon: RmbIcon, url: '/settle/money', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/30' },
    )
  }
  if (hasPermission(privilege.value, PERMISSIONS.VESSEL_SETTLE)) {
    settleItems.push(
      { title: '车船结算', icon: Ship, url: '/settle/vessel', color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
    )
  }
  if (settleItems.length > 0) {
    groups.push({ group: '结算管理', items: settleItems })
  }

  // 报表统计
  const reportItems: FeatureItem[] = [
    { title: '综合查询', icon: TrendingUp, url: '/reports/integrated', color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-900/30' },
    { title: '运单报表', icon: BarChart3, url: '/reports/invoice', color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-900/30' },
  ]
  if (hasPermission(privilege.value, PERMISSIONS.STATISTICS) || hasPermission(privilege.value, PERMISSIONS.ACCOUNT)) {
    reportItems.push(
      { title: '运输价格', icon: RmbIcon, url: '/reports/shipping-charge', color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/30' },
      { title: '短驳叉车', icon: Truck, url: '/reports/drayage-forklift', color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30' },
      { title: '车船固定费', icon: Receipt, url: '/reports/vessel-fixed-cost', color: 'text-slate-600', bgColor: 'bg-slate-50 dark:bg-slate-900/30' },
    )
  }
  if (hasPermission(privilege.value, PERMISSIONS.CUST_REVENUE)) {
    reportItems.push(
      { title: '客户营业额', icon: TrendingUp, url: '/reports/customer-revenue', color: 'text-fuchsia-600', bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/30' },
    )
  }
  if (hasPermission(privilege.value, PERMISSIONS.VESSEL_REVENUE)) {
    reportItems.push(
      { title: '车船营业额', icon: Ship, url: '/reports/vessel-revenue', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
    )
  }
  groups.push({ group: '报表统计', items: reportItems })

  // 基础数据
  groups.push({
    group: '基础数据',
    items: [
      { title: '车船号', icon: Truck, url: '/data/vehicles', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
      { title: '发货单位', icon: Building, url: '/data/companies', color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
      { title: '仓库', icon: Warehouse, url: '/data/warehouses', color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
      { title: '目的地', icon: MapPin, url: '/data/destinations', color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/30' },
      { title: '牌号', icon: Tag, url: '/data/brands', color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/30' },
      { title: '销售部门', icon: Database, url: '/data/sale-deps', color: 'text-indigo-500', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
    ],
  })

  // 数据处理
  groups.push({
    group: '数据处理',
    items: [
      { title: '圆钢', icon: BookOpen, url: '/data-process/round-steel', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
      { title: '板材', icon: BookOpen, url: '/data-process/plate', color: 'text-lime-600', bgColor: 'bg-lime-50 dark:bg-lime-900/30' },
    ],
  })

  // 设置
  groups.push({
    group: '设置',
    items: [
      { title: '密码修改', icon: Settings, url: '/settings/account', color: 'text-gray-600', bgColor: 'bg-gray-50 dark:bg-gray-900/30' },
    ],
  })

  return groups
})

const featuresExpanded = ref(false)

// ---- Drill-down state ----
const drillDownOpen = ref(false)
const drillDownTitle = ref('')
const drillDownLoading = ref(false)
const drillDownType = ref<'invoice' | 'billingName' | 'vehicle'>('invoice')

const invoiceData = ref<InvoiceDetail[]>([])
const billingNameData = ref<BillingNameStats[]>([])

// ---- Vehicle drill-down (with month + category filters, same as PC) ----
const vehicleDrillDownData = ref<VehicleData[]>([])
const vehicleDrillDownVehType = ref<'own' | 'outsourced' | 'truck' | 'vessel'>('truck')
const vehicleCategoryFilter = ref<'all' | '自有' | '外挂'>('all')
const vehicleDrillDownMonth = ref('all')
const vehicleMonthlyCache = ref(new Map<string, VehicleData[]>())
const vehicleMonthLoading = ref(false)

const vehicleTypeFilter: Record<string, (v: VehicleData) => boolean> = {
  own: v => v.veh_category === '自有',
  outsourced: v => v.veh_category === '外挂',
  truck: v => v.veh_type === '车',
  vessel: v => v.veh_type === '船',
}

const vehicleMonthOptions = computed(() => {
  const months: { label: string; value: string }[] = [{ label: '全部', value: 'all' }]
  const [startY, startM] = startDate.value.split('-').map(Number)
  const [endY, endM] = endDate.value.split('-').map(Number)
  const today = new Date()
  const curY = today.getFullYear()
  const curM = today.getMonth() + 1
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    if (y > curY || (y === curY && m > curM)) break
    const val = `${y}-${String(m).padStart(2, '0')}`
    months.push({ label: val, value: val })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
})

const filteredVehicleDrillDownData = computed(() => {
  if (vehicleCategoryFilter.value === 'all') return vehicleDrillDownData.value
  return vehicleDrillDownData.value.filter(v => v.veh_category === vehicleCategoryFilter.value)
})

const vehicleDrillDownTotalTonnage = computed(() =>
  filteredVehicleDrillDownData.value.reduce((s, v) => s + v.value, 0)
)

const vehicleDrillDownTotalPrice = computed(() =>
  filteredVehicleDrillDownData.value.reduce((s, v) => s + (v.total_price || 0), 0)
)

async function loadVehicleMonthData(month: string) {
  if (month === 'all') {
    vehicleDrillDownData.value = stats.value.allVehicles.filter(vehicleTypeFilter[vehicleDrillDownVehType.value])
    return
  }
  const cacheKey = `${month}_${vehicleDrillDownVehType.value}`
  if (vehicleMonthlyCache.value.has(cacheKey)) {
    vehicleDrillDownData.value = vehicleMonthlyCache.value.get(cacheKey)!
    return
  }
  vehicleMonthLoading.value = true
  try {
    const res = await getDashboardStatistics(month, month)
    if (res.ok) {
      const filtered = res.data.allVehicles.filter(vehicleTypeFilter[vehicleDrillDownVehType.value])
      vehicleMonthlyCache.value.set(cacheKey, filtered)
      vehicleDrillDownData.value = filtered
    } else { toast.error('获取月度数据失败') }
  } catch { toast.error('获取月度数据出错') }
  finally { vehicleMonthLoading.value = false }
}

watch(vehicleDrillDownMonth, (month) => { loadVehicleMonthData(month) })

// ---- Drill-down entry functions ----
async function drillDownInvoices() {
  drillDownTitle.value = '运单明细'
  drillDownType.value = 'invoice'
  drillDownOpen.value = true
  drillDownLoading.value = true
  try {
    const res = await getDashboardInvoiceDetails(startDate.value, endDate.value)
    if (res.ok) invoiceData.value = res.data
    else toast.error('获取运单明细失败')
  } catch { toast.error('获取运单明细出错') }
  finally { drillDownLoading.value = false }
}

async function drillDownBillingNames() {
  drillDownTitle.value = '开单名称统计'
  drillDownType.value = 'billingName'
  drillDownOpen.value = true
  drillDownLoading.value = true
  try {
    const res = await getDashboardBillingNamesStats(startDate.value, endDate.value)
    if (res.ok) billingNameData.value = res.data
    else toast.error('获取开单名称统计失败')
  } catch { toast.error('获取开单名称统计出错') }
  finally { drillDownLoading.value = false }
}

function drillDownVehicle(type: 'own' | 'outsourced' | 'truck' | 'vessel') {
  const titles = { own: '自有车辆明细', outsourced: '外挂车辆明细', truck: '车运明细', vessel: '船运明细' }
  drillDownTitle.value = titles[type]
  drillDownType.value = 'vehicle'
  vehicleDrillDownVehType.value = type
  vehicleDrillDownMonth.value = 'all'
  vehicleMonthlyCache.value.clear()
  vehicleDrillDownData.value = stats.value.allVehicles.filter(vehicleTypeFilter[type])
  vehicleCategoryFilter.value = (type === 'own') ? '自有' : (type === 'outsourced') ? '外挂' : 'all'
  drillDownOpen.value = true
}

function navigateTo(url: string) {
  router.push(url)
}

// Year picker
const showYearPicker = ref(false)

function selectYear(year: string) {
  selectedYear.value = year
  showYearPicker.value = false
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 pb-6">
    <!-- Header -->
    <div class="relative overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-700 dark:to-indigo-800 text-white px-3 pt-4 pb-5 rounded-b-3xl">
      <!-- 装饰背景图形 -->
      <svg class="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
        <circle cx="85%" cy="10%" r="120" fill="white" opacity="0.04" />
        <circle cx="95%" cy="50%" r="80" fill="white" opacity="0.05" />
        <circle cx="10%" cy="80%" r="60" fill="white" opacity="0.03" />
        <circle cx="70%" cy="90%" r="100" fill="white" opacity="0.04" />
        <path d="M0,80 Q150,20 300,60 T600,40" stroke="white" stroke-width="1" fill="none" opacity="0.06" />
        <path d="M0,160 Q200,100 400,140 T800,100" stroke="white" stroke-width="1" fill="none" opacity="0.05" />
      </svg>
      <div class="relative z-10 flex items-center justify-between mb-4">
        <div>
          <h1 class="text-lg font-bold">工作台</h1>
          <p class="text-blue-100 text-xs mt-0.5">物流管理系统</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Year selector -->
          <div class="relative">
            <button
              class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/20 text-sm font-medium backdrop-blur-sm min-w-[100px] justify-center"
              @click="showYearPicker = !showYearPicker"
            >
              {{ selectedYear }}年
              <ChevronRight class="h-3.5 w-3.5 transition-transform" :class="showYearPicker ? 'rotate-90' : ''" />
            </button>
            <!-- Year dropdown -->
            <div
              v-if="showYearPicker"
              class="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 rounded-xl shadow-xl border p-2 max-h-48 overflow-y-auto w-24"
            >
              <button
                v-for="y in years.slice(0, 10)"
                :key="y"
                class="w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors"
                :class="y === selectedYear
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                @click="selectYear(y)"
              >
                {{ y }}年
              </button>
            </div>
          </div>
          <button
            class="p-2 rounded-full bg-white/20 backdrop-blur-sm"
            :disabled="loading"
            @click="loadData"
          >
            <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          </button>
        </div>
      </div>

      <!-- Stats Cards in header -->
      <div v-if="loading && !hasLoaded" class="relative z-10 flex items-center justify-center py-8">
        <Loader2 class="h-8 w-8 animate-spin text-white/70" />
      </div>

      <div v-else class="relative z-10 space-y-2">
        <!-- Row 1: 总发运吨数 (含未回款/已回款) -->
        <div class="bg-white/8 rounded-2xl p-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-blue-100 text-xs">总配发吨数</p>
              <p class="text-2xl font-bold mt-0.5 active:text-blue-200 cursor-pointer" @click="drillDownInvoices">{{ stats.totalTonnage.toLocaleString() }}</p>
            </div>
            <div class="text-right text-xs space-y-0.5">
              <div class="text-blue-100">
                未结算(车到船) <span class="text-white font-medium">{{ stats.truckToShipUnsettledTonnage.toLocaleString() }}</span>
              </div>
              <div class="text-blue-100">
                未结算(客户) <span class="text-white font-medium">{{ stats.customerUnsettledTonnage.toLocaleString() }}</span>
              </div>
              <div class="text-blue-100">
                未开票 <span class="text-white font-medium">{{ (stats.totalSettledTonnage - stats.totalInvoiceTonnage).toLocaleString() }}</span>
              </div>
            </div>
          </div>
          <!-- 回款信息 -->
          <div class="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
            <div class="flex items-center justify-between bg-white/6 rounded-xl px-2.5 py-1.5">
              <span class="text-blue-200">未回款</span>
              <span class="font-bold text-yellow-200">{{ (stats.totalInvoiceTonnage - stats.totalPaymentTonnage).toLocaleString() }}</span>
            </div>
            <div class="flex items-center justify-between bg-white/6 rounded-xl px-2.5 py-1.5">
              <span class="text-blue-200">已回款</span>
              <span class="font-bold text-green-200">{{ stats.totalPaymentTonnage.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <!-- Row 2: 开单名称(~30%) + 车船综合(~70%) -->
        <div class="flex gap-2">
          <!-- 开单名称数 -->
          <div
            class="w-[30%] shrink-0 bg-white/8 rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer active:bg-white/12"
            @click="drillDownBillingNames"
          >
            <p class="text-blue-100 text-[10px]">开单名称</p>
            <p class="text-xl font-bold mt-0.5">{{ stats.billingNameCount }}</p>
          </div>

          <!-- 车船综合 -->
          <div class="flex-1 bg-white/8 rounded-2xl p-3">
            <!-- 总数 + 自有/外挂 -->
            <div class="flex items-center gap-2 text-[10px]">
              <p class="text-lg font-bold leading-none">{{ stats.allVehicles.length }}</p>
              <span class="text-blue-200">辆/艘</span>
              <span class="text-white/30">|</span>
              <span class="text-blue-200 cursor-pointer active:text-white" @click="drillDownVehicle('own')">自有 <span class="text-white font-medium">{{ stats.ownVehicleCount }}</span></span>
              <span class="text-blue-200 cursor-pointer active:text-white" @click="drillDownVehicle('outsourced')">外挂 <span class="text-white font-medium">{{ stats.outsourcedVehicleCount }}</span></span>
            </div>
            <!-- 车运一行 -->
            <div class="mt-2 flex items-center justify-between text-xs bg-white/6 rounded-lg px-2 py-1 cursor-pointer active:bg-white/10" @click="drillDownVehicle('truck')">
              <span class="text-blue-200">车运</span>
              <span class="font-medium">{{ stats.truckTonnage.toLocaleString() }} <span class="text-[10px] text-blue-200">吨</span></span>
            </div>
            <!-- 船运一行 -->
            <div class="mt-1 flex items-center justify-between text-xs bg-white/6 rounded-lg px-2 py-1 cursor-pointer active:bg-white/10" @click="drillDownVehicle('vessel')">
              <span class="text-blue-200">船运</span>
              <span class="font-medium">{{ stats.vesselTonnage.toLocaleString() }} <span class="text-[10px] text-blue-200">吨</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Feature Grid -->
    <div class="px-3 mt-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">常用功能</h2>
        <button
          class="flex items-center gap-0.5 text-xs text-muted-foreground active:text-foreground"
          @click="featuresExpanded = !featuresExpanded"
        >
          {{ featuresExpanded ? '收起' : '全部' }}
          <component :is="featuresExpanded ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Collapsed: quick features grid -->
      <div v-if="!featuresExpanded" class="grid grid-cols-4 gap-3">
        <button
          v-for="item in quickFeatures"
          :key="item.url"
          class="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-slate-700 active:scale-95 transition-transform"
          @click="navigateTo(item.url)"
        >
          <div class="w-10 h-10 rounded-xl flex items-center justify-center" :class="item.bgColor">
            <component :is="item.icon" class="h-5 w-5" :class="item.color" />
          </div>
          <span class="text-[11px] text-gray-600 dark:text-gray-400 font-medium leading-tight text-center">{{ item.title }}</span>
        </button>
      </div>

      <!-- Expanded: all features grouped -->
      <div v-else class="space-y-4">
        <div v-for="group in allFeatures" :key="group.group">
          <p class="text-[11px] text-muted-foreground font-medium mb-2 pl-1">{{ group.group }}</p>
          <div class="grid grid-cols-4 gap-3">
            <button
              v-for="item in group.items"
              :key="item.url"
              class="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-slate-700 active:scale-95 transition-transform"
              @click="navigateTo(item.url)"
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" :class="item.bgColor">
                <component :is="item.icon" class="h-5 w-5" :class="item.color" />
              </div>
              <span class="text-[11px] text-gray-600 dark:text-gray-400 font-medium leading-tight text-center">{{ item.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Chart Section -->
    <div class="px-3 mt-5">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">数据趋势</h2>

      <!-- Monthly Trend Chart -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-3">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300">每月配发吨数</p>
          <p class="text-[10px] text-muted-foreground">{{ startDate }} ~ {{ endDate }}</p>
        </div>
        <div class="mobile-chart h-[180px]">
          <VisXYContainer :data="chartData" height="100%" :xDomain="xDomain" :yDomain="[0, undefined]">
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
            />
            <VisAxis type="y" />
          </VisXYContainer>
        </div>
      </div>

      <!-- Top 10 Billing Names -->
      <div class="mt-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-3">
        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">开单名称排名 (Top 10)</p>
        <div class="space-y-1.5">
          <div
            v-for="(item, index) in stats.top10BillingNames"
            :key="index"
            class="flex items-center gap-2 py-1.5 px-2 rounded-lg"
            :class="[
              index === 0 ? 'bg-amber-50 dark:bg-amber-900/20' :
              index === 1 ? 'bg-slate-50 dark:bg-slate-700/30' :
              index === 2 ? 'bg-orange-50 dark:bg-orange-900/20' :
              ''
            ]"
          >
            <div
              class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              :class="[
                index === 0 ? 'bg-amber-500 text-white' :
                index === 1 ? 'bg-slate-400 text-white' :
                index === 2 ? 'bg-orange-400 text-white' :
                'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              ]"
            >
              {{ index + 1 }}
            </div>
            <span class="text-xs flex-1 truncate">{{ item.name }}</span>
            <span class="text-xs font-semibold tabular-nums shrink-0">
              {{ item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              <span class="text-[10px] text-muted-foreground">吨</span>
            </span>
          </div>
          <div v-if="stats.top10BillingNames.length === 0" class="text-center py-4 text-xs text-muted-foreground">
            暂无数据
          </div>
        </div>
      </div>
    </div>

    <!-- Drill-down Sheet -->
    <Sheet v-model:open="drillDownOpen">
      <SheetContent side="bottom" class="h-[85vh] flex flex-col">
        <SheetHeader class="shrink-0">
          <SheetTitle>{{ drillDownTitle }}</SheetTitle>
        </SheetHeader>

        <div v-if="drillDownLoading" class="flex-1 flex items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-primary" />
        </div>

        <!-- 运单明细 -->
        <div v-else-if="drillDownType === 'invoice'" class="flex-1 overflow-y-auto space-y-2 pt-2">
          <p class="text-xs text-muted-foreground px-1">共 {{ invoiceData.length }} 条记录</p>
          <div
            v-for="item in invoiceData"
            :key="item.waybill_no"
            class="bg-muted/30 rounded-lg px-3 py-2 text-xs space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm">{{ item.billingName }}</span>
              <span class="font-semibold text-blue-600">{{ item.tonnage.toLocaleString() }} 吨</span>
            </div>
            <div class="flex items-center justify-between text-muted-foreground">
              <span>{{ item.vehicle }}</span>
              <span>{{ new Date(item.shipDate).toLocaleDateString('zh-CN') }}</span>
            </div>
            <div class="text-muted-foreground">运单号: {{ item.waybill_no }}</div>
          </div>
          <div v-if="invoiceData.length === 0" class="text-center py-8 text-sm text-muted-foreground">暂无数据</div>
        </div>

        <!-- 开单名称统计 -->
        <div v-else-if="drillDownType === 'billingName'" class="flex-1 overflow-y-auto space-y-2 pt-2">
          <p class="text-xs text-muted-foreground px-1">共 {{ billingNameData.length }} 条记录</p>
          <div
            v-for="item in billingNameData"
            :key="item.name"
            class="bg-muted/30 rounded-lg px-3 py-2 text-xs space-y-1.5"
          >
            <p class="font-medium text-sm">{{ item.name }}</p>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <p class="text-muted-foreground">结算</p>
                <p class="font-semibold">{{ item.settledWeight.toLocaleString() }} 吨</p>
                <p class="text-muted-foreground">¥{{ item.settledAmount.toLocaleString() }}</p>
              </div>
              <div>
                <p class="text-muted-foreground">开票</p>
                <p class="font-semibold">{{ item.invoicedWeight.toLocaleString() }} 吨</p>
                <p class="text-muted-foreground">¥{{ item.invoicedAmount.toLocaleString() }}</p>
              </div>
              <div>
                <p class="text-muted-foreground">回款</p>
                <p class="font-semibold">{{ item.paidWeight.toLocaleString() }} 吨</p>
                <p class="text-muted-foreground">¥{{ item.paidAmount.toLocaleString() }}</p>
              </div>
            </div>
          </div>
          <div v-if="billingNameData.length === 0" class="text-center py-8 text-sm text-muted-foreground">暂无数据</div>
        </div>

        <!-- 车辆明细 -->
        <div v-else-if="drillDownType === 'vehicle'" class="flex-1 flex flex-col min-h-0 pt-2">
          <!-- 筛选栏 -->
          <div class="shrink-0 flex items-center gap-2 flex-wrap pb-2">
            <!-- 自有/外挂筛选 -->
            <div class="flex gap-1">
              <button
                v-for="opt in (['all', '自有', '外挂'] as const)"
                :key="opt"
                class="px-2.5 py-1 text-xs rounded-full border transition-colors"
                :class="vehicleCategoryFilter === opt
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground'"
                @click="vehicleCategoryFilter = opt"
              >
                {{ opt === 'all' ? '全部' : opt }}
              </button>
            </div>
            <!-- 月份选择 -->
            <select
              v-model="vehicleDrillDownMonth"
              class="h-7 text-xs rounded-md border border-border bg-background px-2 text-foreground"
            >
              <option v-for="opt in vehicleMonthOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <Loader2 v-if="vehicleMonthLoading" class="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
          <!-- 汇总 -->
          <p class="shrink-0 text-xs text-muted-foreground px-1 pb-1">
            共 {{ filteredVehicleDrillDownData.length }} 条，合计 {{ vehicleDrillDownTotalTonnage.toLocaleString() }} 吨，¥{{ vehicleDrillDownTotalPrice.toLocaleString() }}
            <span v-if="vehicleDrillDownMonth !== 'all'" class="ml-1">（财务月：上月26日~本月25日）</span>
          </p>
          <!-- 列表 -->
          <div class="flex-1 overflow-y-auto space-y-2">
            <div
              v-for="item in filteredVehicleDrillDownData"
              :key="item.name"
              class="bg-muted/30 rounded-lg px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ item.name }}</span>
                  <span class="text-muted-foreground">{{ item.veh_type }} / {{ item.veh_category }}</span>
                </div>
                <span class="font-semibold text-blue-600">{{ item.value.toLocaleString() }} 吨</span>
              </div>
              <div class="flex items-center justify-between mt-1 text-muted-foreground">
                <span v-if="item.to_ship">到船 {{ item.to_ship.toLocaleString() }}</span>
                <span v-if="item.to_customer">到客户 {{ item.to_customer.toLocaleString() }}</span>
                <span>¥{{ (item.total_price || 0).toLocaleString() }}</span>
              </div>
            </div>
            <div v-if="filteredVehicleDrillDownData.length === 0" class="text-center py-8 text-sm text-muted-foreground">暂无数据</div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <!-- Year picker overlay backdrop -->
    <div
      v-if="showYearPicker"
      class="fixed inset-0 z-20"
      @click="showYearPicker = false"
    />
  </div>
</template>

<style scoped>
.mobile-chart :deep(.unovis-xy-container) {
  height: 100% !important;
}

.mobile-chart :deep(svg) {
  height: 100% !important;
}
</style>
