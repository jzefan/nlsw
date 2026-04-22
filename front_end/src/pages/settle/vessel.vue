<script setup lang="ts">
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  Ban,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  Layers,
  List,
  Loader2,
  Printer,
  RefreshCw,
  ShoppingCart,
  Filter,
  Settings2,
  Square,
  Users,
  Wallet,
  X,
  ChevronsUpDown,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDebounceFn, useThrottleFn } from '@vueuse/core'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ConfirmDialog from '@/components/confirm-dialog.vue'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import * as settleApi from '@/services/api/settle.api'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatNumber, toExcelDate, toExcelNum } from '@/utils/format'

import PublicBasketsDialog from './components/PublicBasketsDialog.vue'
import SettleBasket from './components/SettleBasket.vue'
import VesselCardContent from './components/VesselCardContent.vue'
import VesselBatchPriceInputDialog from './components/VesselBatchPriceInputDialog.vue'
import VesselDelayInfoDialog from './components/VesselDelayInfoDialog.vue'
import VesselDetailDialog from './components/VesselDetailDialog.vue'
import VesselPriceInputDialog from './components/VesselPriceInputDialog.vue'
import VesselPrintDialog from './components/VesselPrintDialog.vue'
import VesselReceiptImageDialog from './components/VesselReceiptImageDialog.vue'
import VesselUploadReceiptDialog from './components/VesselUploadReceiptDialog.vue'
import { useSettleBasket } from './composables/useSettleBasket'
import { hasPermission, PERMISSIONS } from '@/constants/permissions'

type LocalDirectoryHandle = any
type LocalFileHandle = any

interface ReceiptDownloadTarget {
  waybillNo: string
  vehicleName: string
  fileBaseName: string
  isSubItem: boolean
}

interface ReceiptDownloadTaskItem {
  waybillNo: string
  fileName: string
  imageId: string
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = ref(route.query.selfOwned === 'true')

// 监听路由变化
watch(
  () => route.query.selfOwned,
  (val) => {
    isSelfOwnedMode.value = val === 'true'
    // 路由变化时重新加载数据
    handleSearch(true)
  },
)

const { exportFromAOAWithPicker, exportWithBufferPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// 权限：有 seePrice 或 vesselSettle 都可以看到价格
const hasPrivilegePrice = computed(
  () =>
    hasPermission(authStore.user?.privilege ?? [], PERMISSIONS.SEE_PRICE) ||
    hasPermission(authStore.user?.privilege ?? [], PERMISSIONS.VESSEL_SETTLE),
)

// 对话框引用
const priceInputDialog = ref<InstanceType<typeof VesselPriceInputDialog>>()
const batchPriceInputDialog = ref<InstanceType<typeof VesselBatchPriceInputDialog>>()
const delayInfoDialog = ref<InstanceType<typeof VesselDelayInfoDialog>>()
const detailDialog = ref<InstanceType<typeof VesselDetailDialog>>()
const printDialog = ref()
const receiptImageDialog = ref()
const uploadReceiptDialog = ref()

// 结算篮功能
const {
  basketItems,
  showBasket,
  basketButtonRef,
  flyingItems,
  basketStatistics,
  isInBasket,
  isPublic,
  addToBasket,
  removeFromBasket,
  clearBasket,
  refreshBasketItems,
  loadBasket,
  togglePublic,
  publicItems,
  showPublicBaskets,
  publicStatistics,
  loadPublicBaskets,
} = useSettleBasket({
  basketType: 'vessel',
  isSameItem: (item1: any, item2: any) => {
    return (
      item1.waybill_no === item2.waybill_no &&
      item1.veh_name === item2.veh_name &&
      item1.send_weight === item2.send_weight &&
      item1.inner_waybill_no === item2.inner_waybill_no
    )
  },
  getPrice: (item: any) => item.vessel_price || 0,
  allItems: () => tableData.value,
})

// 筛选表单
const showFilter = ref(true)
const showTruckToShip = ref(true)
const filterForm = ref({
  vehicle: '',
  vehicleOwnership: '全部',
  billName: '',
  origin: '',
  destination: '',
  startDate: dayjs().subtract(1, 'month').format('YYYY-MM-DD'), // 默认查询1个月
  endDate: dayjs().format('YYYY-MM-DD'),
  settleState: '未结算',
  receiptState: '2',
  amount: '',
  weight: '',
})

// 列显示配置
const showColState = ref(true)
const showColVehicle = ref(true)
const showColCarrier = ref(true)
const showColBillName = ref(true)
const showColDestination = ref(true)
const showColTotalPrice = ref(true)
const showColUnitPrice = ref(true)
const showColQuantity = ref(true)
const showColWeight = ref(true)
const showColShipDate = ref(true)
const showColSettleDate = ref(true)
const showColUnshipDate = ref(false) // 默认隐藏
const showColDelayDays = ref(false) // 默认隐藏
const showColWaybillNo = ref(false) // 已合并到车船号列，默认隐藏
const showColTicketNo = ref(false) // 已付款状态下自动显示

// 切换结算状态时自动控制票号列
watch(
  () => filterForm.value.settleState,
  (state) => {
    showColTicketNo.value = state === '已付款'
  },
)

// 筛选选项
// 车辆映射
const vehPersonMap = ref<Record<string, any>>({})
const vehCategoryMap = ref<Record<string, string>>({})

// 发货单位筛选
const showBillNameFilter = ref(false)
const shipFilterSelected = ref<string[]>([])
const billNameFilterOptions = ref<Array<{ value: string; label: string; checked: boolean }>>([])

// 根据公司标识隐藏承运单位列：SaaS模式看tenant.code，独立部署看COMPANY_NAME
const hideCarrier = computed(() => {
  if (authStore.isStandalone) {
    return (authStore.standaloneCompany || '').includes('鑫鸿图')
  }
  return authStore.tenant?.code === 'xht'
})

const showVehicleOwnershipFilter = computed(() => hideCarrier.value)

// 公司名含"鑫鸿图"时隐藏承运单位列
watchEffect(() => {
  if (hideCarrier.value) showColCarrier.value = false
})

// 承运单位筛选（多选，客户端过滤）
const carrierFilterSelected = ref<string[]>([])
const carrierFilterOptions = computed(() => {
  const set = new Set<string>()
  // 只从当前结果集中的车辆提取承运单位，而非全部 vehPersonMap
  const records = summaryRecords.value.length > 0 ? summaryRecords.value : dbRecords.value
  const vehNames = new Set<string>()
  records.forEach((inv: any) => {
    if (inv.vehicle_vessel_name) vehNames.add(inv.vehicle_vessel_name)
    inv.bills?.forEach((bill: any) => {
      bill.vehicles?.forEach((veh: any) => {
        if (veh.veh_name) vehNames.add(veh.veh_name)
      })
    })
  })
  vehNames.forEach((name) => {
    const v = vehPersonMap.value[name]
    const boss = typeof v === 'string' ? v : v?.boss
    if (boss) {
      boss
        .split(/,|，/)
        .map((b: string) => b.trim())
        .filter(Boolean)
        .forEach((b: string) => set.add(b))
    }
  })
  return Array.from(set).sort()
})

// 承运单位搜索函数（供 SearchableCombobox 使用）
const searchCarriers = computed(() => {
  const options = carrierFilterOptions.value
  return async (search: string, limit: number, page: number) => {
    let filtered = options
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(item => item.toLowerCase().includes(s))
    }
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit).map(item => ({ name: item }))
    return { ok: true, data, total: filtered.length }
  }
})

// 监听承运单位选择变化，触发筛选
watch(carrierFilterSelected, () => {
  onCarrierFilterChanged()
})

// 级联筛选选项（每个下拉选项 = 全量记录按其他已选条件过滤后的唯一值）
// 后端分页模式下使用 summaryRecords（全量轻量数据），否则使用 dbRecords
const filterOptions = computed(() => {
  function applyOtherFilters(exclude: string) {
    let filtered = summaryRecords.value.length > 0 ? summaryRecords.value : dbRecords.value
    if (exclude !== 'vehicle' && filterForm.value.vehicle) {
      filtered = filtered.filter((inv) => inv.vehicle_vessel_name === filterForm.value.vehicle)
    }
    if (exclude !== 'billName' && filterForm.value.billName) {
      filtered = filtered.filter((inv) => inv.ship_name === filterForm.value.billName)
    }
    if (exclude !== 'origin' && filterForm.value.origin) {
      filtered = filtered.filter((inv) => inv.ship_from === filterForm.value.origin)
    }
    if (exclude !== 'destination' && filterForm.value.destination) {
      filtered = filtered.filter((inv) => inv.ship_to === filterForm.value.destination)
    }
    return filtered
  }

  function uniqueSorted(records: any[], getter: (inv: any) => string | string[]): string[] {
    const set = new Set<string>()
    records.forEach((inv) => {
      const v = getter(inv)
      if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item) set.add(item)
        })
      } else if (v) {
        set.add(v)
      }
    })
    return Array.from(set).sort()
  }

  return {
    vehicles: uniqueSorted(applyOtherFilters('vehicle'), (inv) => {
      // 包含主运单车船号和子行车辆名称（到船的记录中，车辆名在 bills.vehicles 中）
      const names: string[] = []
      if (inv.vehicle_vessel_name) names.push(inv.vehicle_vessel_name)
      inv.bills?.forEach((bill: any) => {
        bill.vehicles?.forEach((veh: any) => {
          if (veh.veh_name) names.push(veh.veh_name)
        })
      })
      return names
    }),
    billNames: uniqueSorted(applyOtherFilters('billName'), (inv) => inv.ship_name),
    origins: uniqueSorted(applyOtherFilters('origin'), (inv) => inv.ship_from),
    destinations: uniqueSorted(applyOtherFilters('destination'), (inv) => inv.ship_to),
  }
})

// 表格数据
const tableData = ref<any[]>([])
const dbRecords = ref<any[]>([])
const imageWaybillsSet = ref<Set<string>>(new Set())
const selectAll = ref(false)

// 分页状态
const usePagination = ref(true) // 是否分页展示
const renderLoading = ref(false) // 切换全部时的渲染加载状态
const currentPage = ref(1)
const pageSize = ref(50)
const serverTotalCount = ref(0) // 后端返回的总记录数（invoice 数量）
const summaryTableRowCount = ref(0) // 从 summaryRecords 计算的总表格行数（含子行）
const summaryRecords = ref<any[]>([]) // 后端返回的所有匹配记录的轻量汇总数据

const totalPages = computed(() => {
  if (usePagination.value && serverTotalCount.value > 0) {
    // 分页基于 invoice 数量（后端按 invoice 分页）
    return Math.ceil(serverTotalCount.value / pageSize.value)
  }
  return Math.ceil(tableData.value.length / pageSize.value)
})

const pagedData = computed(() => {
  // 后端分页模式：tableData 已是当前页数据，直接返回
  if (usePagination.value && serverTotalCount.value > 0) return tableData.value
  if (!usePagination.value) return tableData.value
  // 非后端分页的客户端分页 fallback
  const start = (currentPage.value - 1) * pageSize.value
  return tableData.value.slice(start, start + pageSize.value)
})

// 分页控制函数
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    if (usePagination.value) {
      handleSearch(false)
    }
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    if (usePagination.value) {
      handleSearch(false)
    }
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    if (usePagination.value) {
      handleSearch(false)
    }
  }
}

const showLargeDataWarning = ref(false)

function togglePagination() {
  if (usePagination.value) {
    // 切换到全部展示：记录数超过 5000 时提醒用户
    if (serverTotalCount.value > 5000) {
      showLargeDataWarning.value = true
      return
    }
    doSwitchToAll()
  } else {
    usePagination.value = true
    currentPage.value = 1
    handleSearch(false)
  }
}

function doSwitchToAll() {
  serverTotalCount.value = 0
  summaryTableRowCount.value = 0
  summaryRecords.value = []
  currentPage.value = 1
  usePagination.value = false
  handleSearch(false)
}

// 统计信息
const totalWeight = ref(0)
const totalSendWeight = ref(0)
const totalAmount = ref(0)
const prePayment = ref(0)
const selectedTotalWeight = ref(0)
const selectedTotalAmount = ref(0)
const allReceiptOk = ref(true)
const allNotNeed = ref(true)

// 按钮显示控制
const showSettleBtn = ref(true)
const showSettleCancelBtn = ref(false)
const showPayBtn = ref(false)
const showPayCancelBtn = ref(false)
const showPrintBtn = ref(false)
const showUnpayBlock = ref(false)
const loading = ref(false)

const receiptDownloadDialogOpen = ref(false)
const receiptDownloadMinimized = ref(false)
const receiptDownloadDirectoryOpen = ref(false)
const receiptDownloadMode = ref<'directory' | 'zip'>('directory')
const receiptDownloadDirectoryName = ref('')
const receiptDownloadDirectoryHandle = ref<LocalDirectoryHandle | null>(null)
const receiptDownloadVisibleFiles = ref<string[]>([])
const receiptDownloadAbortController = ref<AbortController | null>(null)
const receiptDownloadCancelRequested = ref(false)
const receiptDownloadPhase = ref<'prepare' | 'download' | 'zip' | 'idle'>('idle')
const receiptDownloadState = ref({
  status: 'idle' as 'idle' | 'running' | 'done' | 'error' | 'cancelled',
  total: 0,
  completed: 0,
  failed: 0,
  currentFile: '',
  lastError: '',
  recentFiles: [] as string[],
})

// 不需要结算确认对话框
const showNotNeedSettleDialog = ref(false)
const pendingNotNeedSettleRow = ref<any>(null)

// 确认对话框状态
const selectVehiclesDialog = ref(false)
const selectVehiclesDialogData = ref<any>(null)

const basketPriceDialog = ref(false)
const basketPriceDialogData = ref<any[]>([])

const batchReceiptDialog = ref(false)

const batchNotNeedDialog = ref(false)

const payTicketDialog = ref(false)
const ticketNo = ref('')

// 计算属性
const selectedRecords = computed(() => tableData.value.filter((row) => row.selected && !row.isSubItem))
const selectedSubItems = computed(() => tableData.value.filter((row) => row.selected && row.isSubItem))
const selectedInnerNo = computed(() =>
  tableData.value.filter((row) => row.selected && row.isSubItem).map((row) => row.inner_waybill_no),
)

const canShowDetail = computed(() => selectedRecords.value.length === 1)

// 是否显示结算篮相关按钮（仅在"未结算"状态下显示）
const canShowBasket = computed(() => filterForm.value.settleState === '未结算')
const hasReceiptDownloadSource = computed(() => {
  if (summaryRecords.value.length > 0) return true
  return dbRecords.value.length > 0
})
const hasReceiptDownloadTask = computed(() => receiptDownloadState.value.status !== 'idle')
const isReceiptDownloadRunning = computed(() => receiptDownloadState.value.status === 'running')
const isReceiptDownloadCancelled = computed(() => receiptDownloadState.value.status === 'cancelled')
const receiptDownloadPercent = computed(() => {
  if (receiptDownloadState.value.total === 0) return 0
  return Math.min(100, Math.round((receiptDownloadState.value.completed / receiptDownloadState.value.total) * 100))
})
const searchLoadingText = '正在查询数据，请稍候...'

function sanitizeReceiptFilePart(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || '未命名'
}

function canUseReceiptDirectoryDownload() {
  if (typeof window === 'undefined') return false
  return window.isSecureContext && typeof (window as any).showDirectoryPicker === 'function'
}

function getReceiptFileExtension(image: settleApi.ReceiptImageMeta) {
  const originalExt = image.original_filename?.match(/(\.[^.]+)$/)?.[1]
  if (originalExt) return originalExt
  const mime = (image.mime_type || '').toLowerCase()
  if (mime.includes('png')) return '.png'
  if (mime.includes('gif')) return '.gif'
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('bmp')) return '.bmp'
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  return '.jpg'
}

function getStickyCellClass(row: any) {
  if (row.isSubItem) {
    return row.selected ? 'bg-blue-100 dark:bg-blue-950 text-foreground dark:text-blue-50' : 'bg-green-100 dark:bg-green-950'
  }
  if (row.isVessel && !row.selected) {
    return 'bg-orange-100 dark:bg-orange-950'
  }
  if (row.selected) {
    return 'bg-blue-100 dark:bg-blue-950 text-foreground dark:text-blue-50'
  }
  return 'bg-muted dark:bg-muted'
}

function getNotNeedStarClass(notNeedColor: string) {
  return notNeedColor === 'darkgray'
    ? 'text-muted-foreground'
    : 'text-foreground dark:text-amber-200'
}

function getSelectedRowClass() {
  return 'bg-blue-100 hover:bg-blue-100 dark:bg-blue-900/70 dark:hover:bg-blue-900/70 border-l-4 border-l-blue-500 text-foreground dark:text-blue-50 [&_.text-muted-foreground]:!text-slate-700 dark:[&_.text-muted-foreground]:!text-blue-100/85'
}

function applyLocalFilters(records: any[]) {
  let filteredRecords = [...records]

  if (shipFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const sc = inv.ship_customer || ''
      return shipFilterSelected.value.includes(sc)
    })
  }

  if (carrierFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const carrier = vehPersonMap.value[inv.vehicle_vessel_name]
      if (!carrier) return false
      if (typeof carrier === 'string') return carrierFilterSelected.value.includes(carrier)
      const boss = carrier.boss || ''
      const bossList = boss.split(/,|，/).map((b: string) => b.trim()).filter(Boolean)
      if (bossList.length <= 1) {
        return bossList.some((b: string) => carrierFilterSelected.value.includes(b))
      }
      const found = carrier.real_boss?.find((rb: any) => rb.waybill_no === inv.waybill_no)
      if (!found || !found.rb) return false
      const selectedBossList = found.rb.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
      return selectedBossList.some((b: string) => carrierFilterSelected.value.includes(b))
    })
  }

  if (filterForm.value.billName) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_name === filterForm.value.billName)
  }

  if (filterForm.value.origin) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_from === filterForm.value.origin)
  }

  if (filterForm.value.destination) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_to === filterForm.value.destination)
  }

  if (showVehicleOwnershipFilter.value && filterForm.value.vehicleOwnership !== '全部') {
    filteredRecords = filteredRecords.filter((inv) => matchesInvoiceVehicleOwnership(inv))
  }

  return filteredRecords
}

function getVehicleCategoryByName(vehicleName: string, fallback?: any) {
  if (vehicleName && vehCategoryMap.value[vehicleName]) return vehCategoryMap.value[vehicleName]
  if (fallback?.selfOwned === 1 || fallback?.selfOwned === '1') return '自有'
  return ''
}

function matchesInvoiceVehicleOwnership(inv: any) {
  if (!showVehicleOwnershipFilter.value || filterForm.value.vehicleOwnership === '全部') {
    return true
  }

  return getVehicleCategoryByName(inv.vehicle_vessel_name) === filterForm.value.vehicleOwnership
}

function collectReceiptDownloadTargets(records: any[]): ReceiptDownloadTarget[] {
  const data: ReceiptDownloadTarget[] = []
  const keySet = new Set<string>()
  const filteredRecords = applyLocalFilters(records)
  const vehicleFilter = filterForm.value.vehicle || ''
  const settleState = filterForm.value.settleState

  filteredRecords.forEach((inv) => {
    const isVessel = inv.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)
    let vehObj = isVessel ? makeVehInfo(inv) : null

    let vehicleFiltered = false
    if (vehicleFilter) {
      if (isVessel && vehObj) {
        const filteredVehObj: any = {}
        Object.keys(vehObj).forEach((key) => {
          if (vehObj[key].name === vehicleFilter) {
            filteredVehObj[key] = vehObj[key]
          }
        })
        if (Object.keys(filteredVehObj).length === 0 && inv.vehicle_vessel_name !== vehicleFilter) return
        if (Object.keys(filteredVehObj).length > 0) {
          vehObj = filteredVehObj
          vehicleFiltered = true
        }
      } else if (!isVessel && inv.vehicle_vessel_name !== vehicleFilter) {
        return
      }
    }

    const mainStateMatch = !(settleState && settleState !== '全部' && isVessel && inv.vessel_settle_state !== settleState)
    if (settleState && settleState !== '全部' && !isVessel && inv.vessel_settle_state !== settleState) return

    const hideMainRow = vehicleFiltered || !mainStateMatch
    if (!hideMainRow && imageWaybillsSet.value.has(inv.waybill_no)) {
      const uniqueKey = `main:${inv.waybill_no}`
      if (!keySet.has(uniqueKey)) {
        keySet.add(uniqueKey)
        data.push({
          waybillNo: inv.waybill_no,
          vehicleName: inv.vehicle_vessel_name || '',
          fileBaseName: `${inv.waybill_no}-${sanitizeReceiptFilePart(inv.vehicle_vessel_name || '未命名')}`,
          isSubItem: false,
        })
      }
    }

    const vesselNameMatched = vehicleFilter && isVessel && inv.vehicle_vessel_name === vehicleFilter
    if (isVessel && vehObj && !vesselNameMatched) {
      Object.keys(vehObj).forEach((key) => {
        const veh = vehObj[key]
        if (settleState && settleState !== '全部' && veh.state !== settleState) return
        const innerWaybillNo = veh.inner_waybill_no || key
        if (!imageWaybillsSet.value.has(innerWaybillNo)) return

        const uniqueKey = `sub:${innerWaybillNo}:${veh.name || ''}`
        if (!keySet.has(uniqueKey)) {
          keySet.add(uniqueKey)
          data.push({
            waybillNo: innerWaybillNo,
            vehicleName: veh.name || '',
            fileBaseName: `${innerWaybillNo}-${sanitizeReceiptFilePart(veh.name || '未命名')}`,
            isSubItem: true,
          })
        }
      })
    }
  })

  return data
}

function collectReceiptDownloadTargetsFromRows(rows: any[]): ReceiptDownloadTarget[] {
  const keySet = new Set<string>()
  const targets: ReceiptDownloadTarget[] = []

  rows.forEach((row) => {
    if (!row.has_receipt_image) return

    const waybillNo = row.isSubItem ? row.inner_waybill_no : row.waybill_no
    const vehicleName = row.isSubItem ? row.veh_name : row.vehicle_vessel_name
    const uniqueKey = row.isSubItem ? `sub:${waybillNo}:${vehicleName || ''}` : `main:${waybillNo}`

    if (keySet.has(uniqueKey)) return
    keySet.add(uniqueKey)

    targets.push({
      waybillNo,
      vehicleName: vehicleName || '',
      fileBaseName: `${waybillNo}-${sanitizeReceiptFilePart(vehicleName || '未命名')}`,
      isSubItem: !!row.isSubItem,
    })
  })

  return targets
}

const receiptDownloadTargets = computed(() => {
  const sourceRecords = summaryRecords.value.length > 0 ? summaryRecords.value : dbRecords.value
  return collectReceiptDownloadTargets(sourceRecords)
})

async function ensureUniqueReceiptFileName(directoryHandle: LocalDirectoryHandle, fileName: string) {
  const extMatch = fileName.match(/(\.[^.]+)$/)
  const ext = extMatch?.[1] || ''
  const baseName = ext ? fileName.slice(0, -ext.length) : fileName
  let candidate = fileName
  let index = 2

  while (true) {
    try {
      await directoryHandle.getFileHandle(candidate)
      candidate = `${baseName}-${index}${ext}`
      index += 1
    } catch {
      return candidate
    }
  }
}

async function writeReceiptFile(directoryHandle: LocalDirectoryHandle, fileName: string, blob: Blob) {
  const uniqueFileName = await ensureUniqueReceiptFileName(directoryHandle, fileName)
  const fileHandle: LocalFileHandle = await directoryHandle.getFileHandle(uniqueFileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
  return uniqueFileName
}

function ensureUniqueZipFileName(fileName: string, usedFileNames: Set<string>) {
  const extMatch = fileName.match(/(\.[^.]+)$/)
  const ext = extMatch?.[1] || ''
  const baseName = ext ? fileName.slice(0, -ext.length) : fileName
  let candidate = fileName
  let index = 2

  while (usedFileNames.has(candidate)) {
    candidate = `${baseName}-${index}${ext}`
    index += 1
  }

  usedFileNames.add(candidate)
  return candidate
}

function triggerReceiptZipDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

function getReceiptZipFileName() {
  return `回执图片_${dayjs().format('YYYYMMDD_HHmmss')}.zip`
}

function isReceiptDownloadAbortError(error: any) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED' || /aborted|canceled|cancelled/i.test(error?.message || '')
}

async function refreshReceiptDownloadDirectoryView() {
  const directoryHandle = receiptDownloadDirectoryHandle.value
  if (!directoryHandle) return

  const names: string[] = []
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file') names.push(name)
  }
  names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  receiptDownloadVisibleFiles.value = names
}

async function handleViewReceiptDownloadDirectory() {
  if (receiptDownloadMode.value === 'zip') {
    if (receiptDownloadState.value.recentFiles.length === 0) return
    receiptDownloadDirectoryOpen.value = !receiptDownloadDirectoryOpen.value
    receiptDownloadVisibleFiles.value = [...receiptDownloadState.value.recentFiles]
    return
  }

  if (!receiptDownloadDirectoryHandle.value) return
  receiptDownloadDirectoryOpen.value = !receiptDownloadDirectoryOpen.value
  if (receiptDownloadDirectoryOpen.value) {
    await refreshReceiptDownloadDirectoryView()
  }
}

function handleMinimizeReceiptDownloadDialog() {
  receiptDownloadDialogOpen.value = false
  receiptDownloadMinimized.value = true
}

function handleOpenReceiptDownloadDialog() {
  receiptDownloadDialogOpen.value = true
  receiptDownloadMinimized.value = false
}

function handleCloseReceiptDownloadDialog() {
  if (isReceiptDownloadRunning.value) {
    handleMinimizeReceiptDownloadDialog()
    return
  }

  receiptDownloadDialogOpen.value = false
  receiptDownloadMinimized.value = false
}

function handleCancelReceiptDownload() {
  if (!isReceiptDownloadRunning.value) return

  receiptDownloadCancelRequested.value = true

  if (receiptDownloadPhase.value === 'zip') {
    receiptDownloadState.value.currentFile = '正在停止下载任务，请稍候...'
    toast.info('当前正在收尾下载任务，稍后会终止')
    return
  }

  receiptDownloadAbortController.value?.abort()
}

async function handleDownloadReceipts() {
  const useDirectoryDownload = canUseReceiptDirectoryDownload()
  let directoryHandle: LocalDirectoryHandle | null = null

  if (useDirectoryDownload) {
    try {
      directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'vessel-receipt-download' })
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        toast.error(error?.message || '选择下载目录失败')
      }
      return
    }
  }

  receiptDownloadMode.value = useDirectoryDownload ? 'directory' : 'zip'
  receiptDownloadDirectoryHandle.value = directoryHandle
  receiptDownloadDirectoryName.value = useDirectoryDownload
    ? directoryHandle?.name || '已选目录'
    : getReceiptZipFileName()
  receiptDownloadDialogOpen.value = true
  receiptDownloadMinimized.value = false
  receiptDownloadDirectoryOpen.value = false
  receiptDownloadVisibleFiles.value = []
  receiptDownloadAbortController.value = new AbortController()
  receiptDownloadCancelRequested.value = false
  receiptDownloadPhase.value = 'prepare'
  receiptDownloadState.value = {
    status: 'running',
    total: 0,
    completed: 0,
    failed: 0,
    currentFile: '正在整理当前查询结果...',
    lastError: '',
    recentFiles: [],
  }

  try {
    const { rows } = await fetchAllRowsForExport()
    if (receiptDownloadCancelRequested.value) {
      throw new Error('DOWNLOAD_CANCELLED')
    }
    const targets = collectReceiptDownloadTargetsFromRows(rows)
    if (targets.length === 0) {
      receiptDownloadPhase.value = 'idle'
      receiptDownloadState.value = {
        status: 'error',
        total: 0,
        completed: 0,
        failed: 0,
        currentFile: '',
        lastError: '当前查询结果没有可下载的回执图片',
        recentFiles: [],
      }
      toast.error('当前查询结果没有可下载的回执图片')
      return
    }

    const response = await settleApi.getReceiptDownloadItems(targets.map((item) => item.waybillNo))
    if (receiptDownloadCancelRequested.value) {
      throw new Error('DOWNLOAD_CANCELLED')
    }
    if (!response.ok) {
      throw new Error('获取回执图片清单失败')
    }

    const imageMap = new Map(response.items.map((item) => [item.waybill_no, item.images]))
    const taskItems: ReceiptDownloadTaskItem[] = []

    targets.forEach((target) => {
      const images = imageMap.get(target.waybillNo) || []
      images.forEach((image, index) => {
        const ext = getReceiptFileExtension(image)
        const suffix = images.length > 1 ? `-${index + 1}` : ''
        taskItems.push({
          waybillNo: target.waybillNo,
          fileName: `${target.fileBaseName}${suffix}${ext}`,
          imageId: image.id,
        })
      })
    })

    if (taskItems.length === 0) {
      receiptDownloadPhase.value = 'idle'
      receiptDownloadState.value = {
        status: 'error',
        total: 0,
        completed: 0,
        failed: 0,
        currentFile: '',
        lastError: '当前查询结果没有可下载的回执图片',
        recentFiles: [],
      }
      toast.error('当前查询结果没有可下载的回执图片')
      return
    }

    receiptDownloadState.value.total = taskItems.length
    const zip = receiptDownloadMode.value === 'zip' ? new JSZip() : null
    const usedZipFileNames = new Set<string>()
    receiptDownloadPhase.value = 'download'

    for (const task of taskItems) {
      if (receiptDownloadCancelRequested.value) {
        throw new Error('DOWNLOAD_CANCELLED')
      }
      receiptDownloadState.value.currentFile = task.fileName
      try {
        const response = await settleApi.downloadReceiptImageBlob(task.imageId, receiptDownloadAbortController.value?.signal)
        const savedFileName = receiptDownloadMode.value === 'zip'
          ? ensureUniqueZipFileName(task.fileName, usedZipFileNames)
          : await writeReceiptFile(directoryHandle as LocalDirectoryHandle, task.fileName, response.data)

        if (zip) {
          zip.file(savedFileName, response.data)
        }

        receiptDownloadState.value.completed += 1
        receiptDownloadState.value.recentFiles = [savedFileName, ...receiptDownloadState.value.recentFiles].slice(0, 10)
      } catch (error: any) {
        if (isReceiptDownloadAbortError(error)) {
          throw new Error('DOWNLOAD_CANCELLED')
        }
        receiptDownloadState.value.failed += 1
        receiptDownloadState.value.lastError = `${task.fileName}: ${error?.message || '下载失败'}`
      }
    }

    if (zip) {
      if (receiptDownloadCancelRequested.value) {
        throw new Error('DOWNLOAD_CANCELLED')
      }
      receiptDownloadPhase.value = 'zip'
      receiptDownloadState.value.currentFile = '正在生成 ZIP 压缩包...'
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      if (receiptDownloadCancelRequested.value) {
        throw new Error('DOWNLOAD_CANCELLED')
      }
      triggerReceiptZipDownload(zipBlob, receiptDownloadDirectoryName.value)
      receiptDownloadVisibleFiles.value = [...receiptDownloadState.value.recentFiles]
    }

    receiptDownloadPhase.value = 'idle'
    receiptDownloadAbortController.value = null
    receiptDownloadState.value.currentFile = ''
    receiptDownloadState.value.status = receiptDownloadState.value.failed > 0 ? 'error' : 'done'

    if (receiptDownloadMinimized.value) {
      receiptDownloadDialogOpen.value = true
      receiptDownloadMinimized.value = false
    }

    if (receiptDownloadState.value.failed > 0) {
      toast.error(
        `回执图片下载完成，成功 ${receiptDownloadState.value.completed}，失败 ${receiptDownloadState.value.failed}`,
      )
    } else {
      toast.success(
        receiptDownloadMode.value === 'directory'
          ? '回执图片已全部下载完成，点击“查看下载目录”可查看结果'
          : `回执图片已全部打包完成，浏览器将下载 ${receiptDownloadDirectoryName.value}`,
      )
    }
  } catch (error: any) {
    receiptDownloadPhase.value = 'idle'
    receiptDownloadAbortController.value = null
    if (error?.message === 'DOWNLOAD_CANCELLED') {
      receiptDownloadState.value.status = 'cancelled'
      receiptDownloadState.value.currentFile = ''
      receiptDownloadState.value.lastError = ''
      if (receiptDownloadMinimized.value) {
        receiptDownloadDialogOpen.value = true
        receiptDownloadMinimized.value = false
      }
      toast.info('已终止下载')
      return
    }
    receiptDownloadState.value.status = 'error'
    receiptDownloadState.value.currentFile = ''
    receiptDownloadState.value.lastError = error?.message || '下载失败'
    if (receiptDownloadMinimized.value) {
      receiptDownloadDialogOpen.value = true
      receiptDownloadMinimized.value = false
    }
    toast.error(receiptDownloadState.value.lastError)
  }
}

// 检查选中记录是否都有回执（requireReceiptForSettle 启用时）
// 返回 true 表示通过检查（可继续操作），false 表示有未回执记录
function checkReceiptForSettle(records: any[], innerNos: string[] = []): boolean {
  if (!authStore.features.requireReceiptForSettle) return true

  const noReceiptMain = records.filter((r) => !r.isSubItem && r.receipt !== 1)
  const noReceiptInner = innerNos.filter((innerNo) => {
    const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
    return row && row.receipt !== 1
  })

  const noReceiptItems = [...noReceiptMain.map((r) => r.waybill_no), ...noReceiptInner]

  if (noReceiptItems.length > 0) {
    toast.error(`以下记录未回执，不能结算或加入结算篮：${noReceiptItems.join('、')}`)
    return false
  }
  return true
}

// 查看公开篮（其他用户的公开结算篮）
async function handleShowPublicBaskets() {
  await loadPublicBaskets()
  showPublicBaskets.value = true
}

// 结算篮卡片展开状态
const basketExpandedItems = ref(new Set<string>())
function getBasketItemKey(item: any): string {
  return `${item.waybill_no}_${item.veh_name}_${item.inner_waybill_no || ''}`
}
function toggleBasketCardExpand(item: any) {
  const key = getBasketItemKey(item)
  if (basketExpandedItems.value.has(key)) {
    basketExpandedItems.value.delete(key)
  } else {
    basketExpandedItems.value.add(key)
  }
}

// 初始化
onMounted(() => {
  handleSearch(true)
  loadBasket()
  // 点击其他地方关闭发货单位筛选面板
  document.addEventListener('click', closeBillNameFilter)
})

// 日期变化 → throttle 后重新从服务端加载
const throttledSearch = useThrottleFn(() => {
  if (usePagination.value) {
    currentPage.value = 1
  }
  handleSearch(true)
}, 1000)

watch(
  () => [filterForm.value.startDate, filterForm.value.endDate],
  () => {
    throttledSearch()
  },
)

// 单价/吨位变化 → debounce 后按最终输入值重新从服务端加载
const debouncedAmountWeightSearch = useDebounceFn(() => {
  if (usePagination.value) {
    currentPage.value = 1
  }
  handleSearch(true)
}, 1000)

watch(
  () => [filterForm.value.amount, filterForm.value.weight],
  () => {
    debouncedAmountWeightSearch()
  },
)

// combobox 变化 → 分页模式下重新请求后端，非分页模式客户端过滤
watch(
  () => [
    filterForm.value.vehicle,
    filterForm.value.vehicleOwnership,
    filterForm.value.billName,
    filterForm.value.origin,
    filterForm.value.destination,
  ],
  () => {
    if (usePagination.value) {
      currentPage.value = 1
      handleSearch(false)
    } else {
      buildTableData()
      updateButtonStates()
    }
  },
)

// 本地搜索函数工厂（从 filterOptions 中过滤）
function createLocalSearchFn(optionsGetter: () => string[]) {
  return async (search: string, limit: number, page: number) => {
    let filtered = optionsGetter()
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((item) => item.toLowerCase().includes(searchLower))
    }
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit).map((item) => ({ name: item }))
    return { ok: true, data, total: filtered.length }
  }
}

// 搜索函数 - 从 filterOptions 本地过滤
const searchVehicles = computed(() => createLocalSearchFn(() => filterOptions.value.vehicles))
const searchBillingNames = computed(() => createLocalSearchFn(() => filterOptions.value.billNames))
const searchOrigins = computed(() => createLocalSearchFn(() => filterOptions.value.origins))
const searchDestinations = computed(() => createLocalSearchFn(() => filterOptions.value.destinations))

function buildSearchParams() {
  const params: any = {
    fVeh: filterForm.value.vehicle || null,
    fVehCategory: showVehicleOwnershipFilter.value && filterForm.value.vehicleOwnership !== '全部'
      ? filterForm.value.vehicleOwnership
      : null,
    fName: filterForm.value.billName || null,
    fOrigin: filterForm.value.origin || null,
    fDest: filterForm.value.destination || null,
    fDate1: filterForm.value.startDate
      ? dayjs(filterForm.value.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
      : null,
    fDate2: filterForm.value.endDate
      ? dayjs(filterForm.value.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
      : null,
    fSettledState: filterForm.value.settleState,
    fReceipt: Number(filterForm.value.receiptState),
    fAmount: filterForm.value.amount,
    fWeight: filterForm.value.weight,
    selfOwned: isSelfOwnedMode.value ? '1' : (authStore.features.selfVehicle ? '0' : undefined),
  }

  // 发货单位/承运单位是客户端筛选，分页模式下后端不知道这些条件，
  // 会导致匹配记录不在当前页。有这些筛选时不使用后端分页。
  const hasClientFilter = shipFilterSelected.value.length > 0
    || carrierFilterSelected.value.length > 0

  if (usePagination.value && !hasClientFilter) {
    params.page = currentPage.value
    params.pageSize = pageSize.value
  }

  return params
}

// 查询
async function handleSearch(_silent = false) {
  if (
    filterForm.value.startDate &&
    filterForm.value.endDate &&
    dayjs(filterForm.value.startDate).isAfter(dayjs(filterForm.value.endDate))
  ) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  loading.value = true

  try {
    const params = buildSearchParams()
    const response = await settleApi.getInvoiceSettleVessel(params)

    if (response.ok) {
      dbRecords.value = response.invs || []
      // 使用返回的 vehPersonMap（只包含结果集中的车辆）
      if (response.vehPersonMap) {
        vehPersonMap.value = response.vehPersonMap
      }
      if (response.vehCategoryMap) {
        vehCategoryMap.value = response.vehCategoryMap
      }
      // 存储有回执图片的运单号集合
      imageWaybillsSet.value = new Set(response.imageWaybills || [])

      // 后端分页模式：存储总数和汇总数据
      if (usePagination.value && response.totalCount != null) {
        serverTotalCount.value = response.totalCount
        summaryRecords.value = response.summaryRecords || []
      } else {
        serverTotalCount.value = 0
        summaryTableRowCount.value = 0
        summaryRecords.value = []
      }

      buildTableData()
      updateButtonStates()
      refreshBasketItems()
    } else {
      console.error('查询 API 返回失败:', response)
      toast.error('查询失败: API 返回 ok=false', { id: 'search' })
    }
  } catch (error: any) {
    console.error('查询异常:', error)
    console.error('错误详情:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    })
    toast.error(`查询失败: ${error.message || '未知错误'}`, { id: 'search' })
  } finally {
    loading.value = false
  }
}

function disableStartDate(date: Date) {
  if (filterForm.value.endDate) {
    const end = dayjs(filterForm.value.endDate).endOf('day')
    return dayjs(date).isAfter(end)
  }
  return false
}

function disableEndDate(date: Date) {
  if (filterForm.value.startDate) {
    const start = dayjs(filterForm.value.startDate).startOf('day')
    return dayjs(date).isBefore(start)
  }
  return false
}

// 从 summaryRecords 计算全量汇总统计（后端分页模式专用）
function calcSummaryFromRecords(records: any[]) {
  let tw = 0
  let tsw = 0
  let ta = 0
  let pp = 0
  let rowCount = 0
  let receiptOk = true
  let notNeed = true

  // 应用同样的客户端筛选逻辑
  let filtered = records
  if (shipFilterSelected.value.length > 0) {
    filtered = filtered.filter((inv) => {
      const sc = inv.ship_customer || ''
      return shipFilterSelected.value.includes(sc)
    })
  }
  if (carrierFilterSelected.value.length > 0) {
    filtered = filtered.filter((inv) => {
      const carrier = vehPersonMap.value[inv.vehicle_vessel_name]
      if (!carrier) return false
      if (typeof carrier === 'string') {
        return carrierFilterSelected.value.includes(carrier)
      }
      const boss = carrier.boss || ''
      const bossList = boss.split(/,|，/).map((b: string) => b.trim()).filter(Boolean)
      if (bossList.length <= 1) {
        return bossList.some((b: string) => carrierFilterSelected.value.includes(b))
      }
      const found = carrier.real_boss?.find((rb: any) => rb.waybill_no === inv.waybill_no)
      if (!found || !found.rb) return false
      const selectedBossList = found.rb.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
      return selectedBossList.some((b: string) => carrierFilterSelected.value.includes(b))
    })
  }
  if (filterForm.value.billName) {
    filtered = filtered.filter((inv) => inv.ship_name === filterForm.value.billName)
  }
  if (filterForm.value.origin) {
    filtered = filtered.filter((inv) => inv.ship_from === filterForm.value.origin)
  }
  if (filterForm.value.destination) {
    filtered = filtered.filter((inv) => inv.ship_to === filterForm.value.destination)
  }
  if (showVehicleOwnershipFilter.value && filterForm.value.vehicleOwnership !== '全部') {
    filtered = filtered.filter((inv) => matchesInvoiceVehicleOwnership(inv))
  }

  const vehicleFilter = filterForm.value.vehicle || ''

  filtered.forEach((inv) => {
    const isVessel = inv.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)

    // 收集子行
    let allVehicles: any[] = []
    if (isVessel) {
      inv.bills?.forEach((bill: any) => {
        if (bill.vehicles) allVehicles.push(...bill.vehicles)
      })
    }

    // 车辆筛选
    let vehicleFiltered = false
    if (vehicleFilter) {
      if (isVessel && allVehicles.length > 0) {
        const matchedVehs = allVehicles.filter((v: any) => v.veh_name === vehicleFilter)
        if (matchedVehs.length === 0 && inv.vehicle_vessel_name !== vehicleFilter) return
        if (matchedVehs.length > 0) {
          allVehicles = matchedVehs
          vehicleFiltered = true
        }
      } else if (!isVessel) {
        if (inv.vehicle_vessel_name !== vehicleFilter) return
      }
    }

    const settleState = filterForm.value.settleState
    const mainStateMatch = !(settleState && settleState !== '全部' && isVessel && inv.vessel_settle_state !== settleState)
    // 非船运记录主行状态不匹配则跳过
    if (settleState && settleState !== '全部' && !isVessel && inv.vessel_settle_state !== settleState) return

    const hideMainRow = vehicleFiltered || !mainStateMatch

    // 主行统计
    if (!hideMainRow) {
      rowCount++
      if (inv.vessel_price >= 0) ta += inv.vessel_price * inv.total_weight
      tw += inv.total_weight
      pp += (inv.charge_cash || 0) + (inv.charge_oil || 0)
      if (!isVessel) tsw += inv.total_weight
      else tsw += inv.total_weight
      if (inv.receipt !== 1) receiptOk = false
      if (inv.vessel_price >= 0) notNeed = false
    }

    // 子行统计：复用 makeVehInfo 的完整逻辑，确保行数一致
    const vesselNameMatched = vehicleFilter && isVessel && inv.vehicle_vessel_name === vehicleFilter
    if (isVessel && allVehicles.length > 0 && !vesselNameMatched) {
      const vehObj = makeVehInfo(inv)
      // 车辆筛选时只保留匹配的
      let keys = vehicleFiltered
        ? Object.keys(vehObj).filter((k) => vehObj[k].name === vehicleFilter)
        : Object.keys(vehObj)
      // 按结算状态过滤子项
      if (settleState && settleState !== '全部') {
        keys = keys.filter((k) => vehObj[k].state === settleState)
      }
      keys.forEach((key) => {
        const v = vehObj[key]
        rowCount++
        if (v.price >= 0) ta += v.price * v.weight
        tw += v.weight
        pp += (v.charge_cash || 0) + (v.charge_oil || 0)
        if (inv.vessel_settle_state === '已结算') tsw += v.weight
        if (v.receipt !== 1) receiptOk = false
        if (v.price >= 0) notNeed = false
      })
    }
  })

  totalWeight.value = tw
  totalSendWeight.value = tsw
  totalAmount.value = ta
  prePayment.value = pp
  allReceiptOk.value = receiptOk
  allNotNeed.value = notNeed
  summaryTableRowCount.value = rowCount
}

// 构建表格数据
function buildTableData() {
  // 后端分页模式下不重置页码（翻页时由 goToPage 等控制）
  if (!usePagination.value || serverTotalCount.value === 0) {
    currentPage.value = 1
  }
  const data: any[] = []

  // 后端分页模式：从 summaryRecords 计算全量汇总
  if (usePagination.value && summaryRecords.value.length > 0) {
    calcSummaryFromRecords(summaryRecords.value)
  } else {
    totalWeight.value = 0
    totalSendWeight.value = 0
    totalAmount.value = 0
    prePayment.value = 0
    allReceiptOk.value = true
    allNotNeed.value = true
  }

  let filteredRecords = dbRecords.value

  // 应用发货单位筛选
  if (shipFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const sc = inv.ship_customer || ''
      return shipFilterSelected.value.includes(sc)
    })
  }

  // 应用承运单位筛选（只匹配已确定承运单位的记录，多选未确定的不匹配）
  if (carrierFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const carrier = vehPersonMap.value[inv.vehicle_vessel_name]
      if (!carrier) return false
      if (typeof carrier === 'string') {
        // 单一承运单位：直接匹配
        return carrierFilterSelected.value.includes(carrier)
      }
      const boss = carrier.boss || ''
      const bossList = boss.split(/,|，/).map((b: string) => b.trim()).filter(Boolean)
      if (bossList.length <= 1) {
        // 单一承运单位
        return bossList.some((b: string) => carrierFilterSelected.value.includes(b))
      }
      // 多个承运单位：必须已选定（real_boss）且选定值包含筛选项
      const found = carrier.real_boss?.find((rb: any) => rb.waybill_no === inv.waybill_no)
      if (!found || !found.rb) return false
      const selectedBossList = found.rb.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
      return selectedBossList.some((b: string) => carrierFilterSelected.value.includes(b))
    })
  }

  // 应用开单名称筛选（客户端）
  if (filterForm.value.billName) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_name === filterForm.value.billName)
  }

  // 应用起始地筛选（客户端）
  if (filterForm.value.origin) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_from === filterForm.value.origin)
  }

  // 应用目的地筛选（客户端）
  if (filterForm.value.destination) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_to === filterForm.value.destination)
  }
  if (showVehicleOwnershipFilter.value && filterForm.value.vehicleOwnership !== '全部') {
    filteredRecords = filteredRecords.filter((inv) => matchesInvoiceVehicleOwnership(inv))
  }

  // 是否按车辆筛选（用于船运下只显示匹配的车）
  const vehicleFilter = filterForm.value.vehicle || ''

  filteredRecords.forEach((inv) => {
    // 检查是否有车辆（船运）
    const isVessel = inv.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)
    let vehObj = isVessel ? makeVehInfo(inv) : null

    // 车辆筛选
    let vehicleFiltered = false
    if (vehicleFilter) {
      if (isVessel && vehObj) {
        // 船运记录：只保留匹配的车辆子行
        const filteredVehObj: any = {}
        Object.keys(vehObj).forEach((key) => {
          if (vehObj[key].name === vehicleFilter) {
            filteredVehObj[key] = vehObj[key]
          }
        })
        // 如果该船下没有匹配的车，且船本身也不匹配，跳过该记录
        if (Object.keys(filteredVehObj).length === 0 && inv.vehicle_vessel_name !== vehicleFilter) {
          return
        }
        if (Object.keys(filteredVehObj).length > 0) {
          vehObj = filteredVehObj
          vehicleFiltered = true // 标记：船运主行不可结算
        }
      } else if (!isVessel) {
        // 非船运（车运）记录：车船名称不匹配则跳过
        if (inv.vehicle_vessel_name !== vehicleFilter) {
          return
        }
      }
    }

    // 按状态筛选：船主行状态不匹配时，隐藏主行但仍处理子行（子行有独立状态）
    const settleState = filterForm.value.settleState
    const mainStateMatch = !(settleState && settleState !== '全部' && isVessel && inv.vessel_settle_state !== settleState)
    // 非船运记录（运车到客户）主行状态不匹配则直接跳过
    if (settleState && settleState !== '全部' && !isVessel && inv.vessel_settle_state !== settleState) {
      return
    }

    const hideMainRow = vehicleFiltered || !mainStateMatch

    // 主行
    const mainRow = buildMainRow(inv, isVessel, vehObj)
    mainRow.vehicleFiltered = vehicleFiltered
    // 承运单位筛选时自动展开船运子行，否则匹配的子行会被折叠隐藏
    if (isVessel && carrierFilterSelected.value.length > 0) {
      mainRow.expanded = true
    }
    // 上传回执后定位的船运行需要保持展开状态
    if (isVessel && forceExpandVesselSet.value.has(inv.waybill_no)) {
      mainRow.expanded = true
    }
    // 车辆筛选、或主行状态不匹配时不显示船运主行
    if (!hideMainRow) {
      data.push(mainRow)
    }

    // 更新统计（隐藏主行时不计入统计；后端分页模式由 calcSummaryFromRecords 计算）
    if (!hideMainRow && summaryRecords.value.length === 0) {
      if (inv.vessel_price >= 0) {
        const price = inv.vessel_price * inv.total_weight
        totalAmount.value += price
      }
      totalWeight.value += inv.total_weight
      prePayment.value += (inv.charge_cash || 0) + (inv.charge_oil || 0)

      // 发运重量：车运且目的地不是到船 → 累加；船运 → 累加船的发运重量
      if (!isVessel) {
        totalSendWeight.value += inv.total_weight
      } else {
        totalSendWeight.value += inv.total_weight
      }

      if (inv.receipt !== 1) allReceiptOk.value = false
      if (inv.vessel_price >= 0) allNotNeed.value = false
    }

    // 子行（车辆）—— 筛选船号时只显示船主行，不显示其下的车运子行
    const vesselNameMatched = vehicleFilter && isVessel && inv.vehicle_vessel_name === vehicleFilter
    if (isVessel && vehObj && !vesselNameMatched) {
      Object.keys(vehObj).forEach((key) => {
        const veh = vehObj[key]
        // 按结算状态过滤子项
        if (settleState && settleState !== '全部' && veh.state !== settleState) return
        const subRow = buildSubRow(inv, veh, key, mainRow)
        // 主行隐藏时，子行直接显示
        if (hideMainRow) {
          subRow.parentExpanded = true
        }
        data.push(subRow)

        // 更新统计（后端分页模式由 calcSummaryFromRecords 计算）
        if (summaryRecords.value.length === 0) {
          if (veh.price >= 0) {
            totalAmount.value += veh.price * veh.weight
          }
          totalWeight.value += veh.weight
          prePayment.value += (veh.charge_cash || 0) + (veh.charge_oil || 0)

          // 发运重量：到船的车运，船已结算时才累加
          if (inv.vessel_settle_state === '已结算') {
            totalSendWeight.value += veh.weight
          }

          if (veh.receipt !== 1) allReceiptOk.value = false
          if (veh.price >= 0) allNotNeed.value = false
        }
      })
    }
  })

  tableData.value = data
  calcSelectedSummary()
}

// 构建主行数据
function buildMainRow(inv: any, isVessel: boolean, vehObj: any, ctx = {
  vehPersonMap: vehPersonMap.value,
  imageWaybillsSet: imageWaybillsSet.value,
}) {
  const shipName = inv.ship_name || ''
  const shipCustomer = inv.ship_customer || ''
  const notNeedColor = inv.vessel_price < 0 ? 'darkgray' : 'red'

  // 承运单位处理
  const carrier = ctx.vehPersonMap[inv.vehicle_vessel_name]
  let carrierBoss = '-'
  let carrierOptions: string[] = []

  if (typeof carrier === 'string') {
    carrierBoss = carrier || '-'
  } else if (carrier && carrier.boss) {
    const bossList = carrier.boss
      .split(/,|，/)
      .map((b: string) => b.trim())
      .filter(Boolean)
    if (bossList.length === 1) {
      carrierBoss = bossList[0]
    } else if (bossList.length > 1) {
      carrierOptions = bossList
      // 查找已选择的（可能是多选，逗号分隔）
      if (carrier.real_boss && carrier.real_boss.length) {
        const found = carrier.real_boss.find((rb: any) => rb.waybill_no === inv.waybill_no)
        if (found) {
          carrierBoss = found.rb
        }
      }
      // 如果没有已选择的，默认不选
      if (carrierBoss === '-') {
        carrierBoss = ''
      }
    }
  }

  // 已选承运单位数组（支持多选）
  const selectedCarrierArr = carrierBoss
    ? carrierBoss.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
    : []

  // 价格文本
  let priceText = '无'
  let unitPrice = '无'
  let priceColor = 'text-gray-400'
  if (inv.vessel_price < 0) {
    priceText = '无'
    priceColor = 'text-gray-400'
  } else if (inv.vessel_price > 0) {
    const price = inv.vessel_price * inv.total_weight
    priceText = formatNumber(price)
    unitPrice = formatNumber(inv.vessel_price)
    priceColor = 'text-blue-600'
  }

  // 预付文本
  let chargeText = '无'
  if (inv.charge_cash > 0 && inv.charge_oil > 0) {
    chargeText = `现金:${formatNumber(inv.charge_cash)},油:${formatNumber(inv.charge_oil)}`
  } else if (inv.charge_cash > 0) {
    chargeText = `现金:${formatNumber(inv.charge_cash)}`
  } else if (inv.charge_oil > 0) {
    chargeText = `油:${formatNumber(inv.charge_oil)}`
  }

  // 状态HTML
  const statusHtml = getStatusHtml(inv.vessel_settle_state)

  // 计算发运块数
  let sendNum = 0
  inv.bills?.forEach((bill: any) => {
    sendNum += bill.num || 0
  })

  return {
    ...inv,
    isVessel,
    isSubItem: false,
    selected: false,
    expanded: false,
    has_receipt_image: ctx.imageWaybillsSet.has(inv.waybill_no),
    shipName,
    shipCustomer,
    notNeedColor,
    carrierBoss,
    carrierOptions,
    selectedCarrier: carrierBoss,
    selectedCarrierArr,
    priceText,
    priceColor,
    unitPrice,
    chargeText,
    statusHtml,
    send_num: sendNum,
    send_weight: inv.total_weight || 0, // 添加 send_weight 字段
    settle_date: inv.vessel_settle_date,
    ticket_no: inv.ticket_no,
    vehObj,
  }
}

// 构建子行数据
function buildSubRow(inv: any, veh: any, innerNo: string, parentRow: any, ctx = {
  vehPersonMap: vehPersonMap.value,
  imageWaybillsSet: imageWaybillsSet.value,
}) {
  const shipName = inv.ship_name || ''
  const shipCustomer = inv.ship_customer || ''
  const notNeedColor = veh.price < 0 ? 'darkgray' : 'red'

  // 承运单位处理
  const carrier = ctx.vehPersonMap[veh.name]
  let carrierBoss = '-'
  let carrierOptions: string[] = []

  if (typeof carrier === 'string') {
    carrierBoss = carrier || '-'
  } else if (carrier && carrier.boss) {
    const bossList = carrier.boss
      .split(/,|，/)
      .map((b: string) => b.trim())
      .filter(Boolean)
    if (bossList.length === 1) {
      carrierBoss = bossList[0]
    } else if (bossList.length > 1) {
      carrierOptions = bossList
      // 查找已选择的
      if (carrier.real_boss && carrier.real_boss.length) {
        const found = carrier.real_boss.find((rb: any) => rb.waybill_no === innerNo)
        if (found) {
          carrierBoss = found.rb
        }
      }
      if (carrierBoss === '-') {
        carrierBoss = ''
      }
    }
  }

  // 已选承运单位数组（支持多选）
  const selectedCarrierArr = carrierBoss
    ? carrierBoss.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
    : []

  // 价格文本
  let priceText = '无'
  let unitPrice = '无'
  let priceColor = 'text-gray-400'
  if (veh.price < 0) {
    priceText = '无'
    priceColor = 'text-gray-400'
  } else if (veh.price > 0) {
    const price = veh.price * veh.weight
    priceText = formatNumber(price)
    unitPrice = formatNumber(veh.price)
    priceColor = 'text-blue-600'
  }

  // 预付文本
  let chargeText = '无'
  if (veh.charge_cash > 0 && veh.charge_oil > 0) {
    chargeText = `现金:${formatNumber(veh.charge_cash)},油:${formatNumber(veh.charge_oil)}`
  } else if (veh.charge_cash > 0) {
    chargeText = `现金:${formatNumber(veh.charge_cash)}`
  } else if (veh.charge_oil > 0) {
    chargeText = `油:${formatNumber(veh.charge_oil)}`
  }

  // 状态HTML
  const statusHtml = getStatusHtml(veh.state)

  return {
    isSubItem: true,
    isVessel: false,
    selected: false,
    has_receipt_image: ctx.imageWaybillsSet.has(veh.inner_waybill_no || innerNo),
    parentRow,
    parentExpanded: parentRow.expanded,
    inner_waybill_no: veh.inner_waybill_no || innerNo,
    display_key: innerNo,
    waybill_no: inv.waybill_no,
    veh_name: veh.name,
    ship_from: veh.ship_from,
    ship_to: inv.vehicle_vessel_name,
    send_num: veh.num,
    send_weight: veh.weight,
    ship_date: inv.ship_date,
    settle_date: veh.date,
    unship_date: veh.unship_date,
    delay_day: veh.delay_day,
    charge_cash: veh.charge_cash,
    charge_oil: veh.charge_oil,
    receipt: veh.receipt,
    remark: veh.remark,
    shipName,
    shipCustomer,
    notNeedColor,
    carrierBoss,
    carrierOptions,
    selectedCarrier: carrierBoss,
    selectedCarrierArr,
    priceText,
    priceColor,
    unitPrice,
    chargeText,
    statusHtml,
    price: veh.price,
    state: veh.state,
    ticket_no: veh.ticket_no,
  }
}

// 生成车辆信息对象
function makeVehInfo(invoice: any) {
  const allVehicles: any[] = []
  invoice.bills?.forEach((bill: any) => {
    if (bill.vehicles) {
      allVehicles.push(...bill.vehicles)
    }
  })

  const vehObj: any = {}
  allVehicles.forEach((veh) => {
    // 容错处理：正常情况下，同一个 inner_waybill_no 对应同一辆车的同一次配发
    // 但历史数据可能存在不同车辆共享同一个 inner_waybill_no 的情况
    // 如果发现 inner_waybill_no 已存在但车名不同，则使用组合 key
    let key = veh.inner_waybill_no

    if (vehObj[key]) {
      if (vehObj[key].name === veh.veh_name) {
        // 相同车名，累加数量和重量（正常情况：同一车多个提单）
        vehObj[key].num += veh.send_num
        vehObj[key].weight += veh.send_weight
      } else {
        // 不同车名但 inner_waybill_no 相同（历史脏数据），使用组合 key
        key = `${veh.inner_waybill_no}_${veh.veh_name}`
        if (vehObj[key]) {
          vehObj[key].num += veh.send_num
          vehObj[key].weight += veh.send_weight
        } else {
          vehObj[key] = {
            name: veh.veh_name,
            inner_waybill_no: veh.inner_waybill_no,
            num: veh.send_num,
            weight: veh.send_weight,
            price: veh.veh_price || 0,
            ship_from: veh.veh_ship_from,
            state: '未结算',
            date: null,
            unship_date: null,
            delay_day: 0,
            charge_cash: 0,
            charge_oil: 0,
            receipt: 0,
            remark: '',
            pay_date: null,
          }
        }
      }
    } else {
      vehObj[key] = {
        name: veh.veh_name,
        inner_waybill_no: veh.inner_waybill_no,
        num: veh.send_num,
        weight: veh.send_weight,
        price: veh.veh_price || 0,
        ship_from: veh.veh_ship_from,
        state: '未结算',
        date: null,
        unship_date: null,
        delay_day: 0,
        charge_cash: 0,
        charge_oil: 0,
        receipt: 0,
        remark: '',
        pay_date: null,
      }
    }
  })

  // 合并结算信息
  if (invoice.inner_settle && invoice.inner_settle.length) {
    invoice.inner_settle.forEach((innset: any) => {
      const settleData = {
        state: innset.state,
        date: innset.date,
        unship_date: innset.unship_date,
        delay_day: innset.delay_day,
        charge_cash: innset.charge_cash,
        charge_oil: innset.charge_oil,
        receipt: innset.receipt,
        remark: innset.remark,
        pay_date: innset.pay_date,
        ticket_no: innset.ticket_no,
      }
      // 按 key 直接匹配（正常情况 + 已有脏数据的 inner_settle）
      // 同时按存储的 inner_waybill_no 匹配（冲突 key 的情况）
      for (const key in vehObj) {
        if (key === innset.inner_waybill_no || vehObj[key].inner_waybill_no === innset.inner_waybill_no) {
          Object.assign(vehObj[key], settleData)
        }
      }
    })
  }

  return vehObj
}

// 获取状态HTML
function getStatusHtml(state: string) {
  const colorMap: Record<string, string> = {
    未结算: 'red',
    已结算: 'blue',
    已付款: 'green',
    不需要结算: 'gray',
  }
  const color = colorMap[state] || 'black'
  return `<span style="color: ${color}">${state}</span>`
}

// 移动端卡片状态标签样式
function getStatusTagClass(state: string): string {
  const map: Record<string, string> = {
    未结算: 'bg-orange-100 text-orange-700 border-orange-200',
    已结算: 'bg-blue-100 text-blue-700 border-blue-200',
    已付款: 'bg-green-100 text-green-700 border-green-200',
    不需要结算: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  return map[state] || 'bg-gray-100 text-gray-700 border-gray-200'
}

function getRowState(row: any): string {
  return row.isSubItem ? row.state || '' : row.vessel_settle_state || ''
}

// 格式化数字

// 智能格式化：大数值自动转为"万"单位（移动端汇总用）
function formatSmart(value: number | string, unit: string): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (isNaN(n)) return `0${unit}`
  if (Math.abs(n) >= 1000000) {
    return `${(n / 10000).toFixed(3).replace(/\.?0+$/, '')}万${unit}`
  }
  return `${n.toFixed(3).replace(/\.?0+$/, '')}${unit}`
}

// 移动端卡片展开状态
const expandedCards = ref<Set<string>>(new Set())
function toggleCardExpand(key: string) {
  if (expandedCards.value.has(key)) {
    expandedCards.value.delete(key)
  } else {
    expandedCards.value.add(key)
  }
}

// 更新按钮状态
function updateButtonStates() {
  const state = filterForm.value.settleState
  showSettleBtn.value = state === '未结算'
  showSettleCancelBtn.value = state === '已结算'
  showPayBtn.value = state === '已结算'
  showPayCancelBtn.value = state === '已付款'
  showPrintBtn.value = state === '已结算'
  showUnpayBlock.value = state === '已结算'
}

// 全选
function handleSelectAll() {
  tableData.value.forEach((row) => {
    // 车辆筛选时，船运主行不可选
    if (row.vehicleFiltered) return
    row.selected = selectAll.value
  })
  calcSelectedSummary()
}

// 行选择
function handleRowClick(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return
  // 车辆筛选时，船运主行不可选
  if (row.vehicleFiltered) return

  if (!row.isSubItem) {
    row.selected = !row.selected
    calcSelectedSummary()
  }
}

function handleRowSelect(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return
  // 车辆筛选时，船运主行不可选
  if (row.vehicleFiltered) {
    nextTick(() => {
      row.selected = false
    })
    return
  }

  nextTick(() => {
    calcSelectedSummary()
  })
}

function handleRowCheckboxChange(row: any, checked: boolean | 'indeterminate') {
  if (checked === 'indeterminate') return
  row.selected = checked
  handleRowSelect(row)
}

function handleSubRowClick(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  if (row.isSubItem) {
    row.selected = !row.selected
    calcSelectedSummary()
  }
}

function handleSubRowSelect(row: any) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(row)) return

  calcSelectedSummary()
}

function handleSubRowCheckboxChange(row: any, checked: boolean | 'indeterminate') {
  if (checked === 'indeterminate') return
  row.selected = checked
  handleSubRowSelect(row)
}

// 展开/收缩
function toggleExpand(row: any) {
  row.expanded = !row.expanded
  // 更新子行的显示状态
  tableData.value.forEach((r) => {
    if (r.isSubItem && r.parentRow === row) {
      r.parentExpanded = row.expanded
    }
  })
}

// 计算已选统计
function calcSelectedSummary() {
  selectedTotalWeight.value = 0
  selectedTotalAmount.value = 0

  tableData.value.forEach((row) => {
    if (row.selected) {
      if (row.isSubItem) {
        selectedTotalWeight.value += row.send_weight || 0
        if (row.price >= 0) {
          selectedTotalAmount.value += row.price * row.send_weight
        }
      } else {
        selectedTotalWeight.value += row.total_weight || 0
        if (row.vessel_price >= 0) {
          selectedTotalAmount.value += row.vessel_price * row.total_weight
        }
      }
    }
  })
}

// Watch selected records
watch([selectedRecords, selectedInnerNo], () => {
  calcSelectedSummary()
})

// 发货单位筛选相关
function toggleBillNameFilter(e: Event) {
  e.stopPropagation()
  showBillNameFilter.value = !showBillNameFilter.value
  if (showBillNameFilter.value) {
    buildBillNameFilterOptions()
  }
}

function buildBillNameFilterOptions() {
  const map = new Map<string, boolean>()
  dbRecords.value.forEach((inv) => {
    const val = inv.ship_customer || ''
    if (!map.has(val)) {
      const checked = shipFilterSelected.value.length === 0 || shipFilterSelected.value.includes(val)
      map.set(val, checked)
    }
  })

  billNameFilterOptions.value = Array.from(map).map(([value, checked]) => ({
    value,
    label: value === '' ? '（空）' : value,
    checked,
  }))
}

function applyBillNameFilter() {
  shipFilterSelected.value = billNameFilterOptions.value.filter((item) => item.checked).map((item) => item.value)
  showBillNameFilter.value = false
  if (usePagination.value) {
    currentPage.value = 1
    handleSearch(false)
  } else {
    buildTableData()
  }
}

function clearBillNameFilter() {
  shipFilterSelected.value = []
  showBillNameFilter.value = false
  if (usePagination.value) {
    currentPage.value = 1
    handleSearch(false)
  } else {
    buildTableData()
  }
}

function clearCarrierFilter(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  carrierFilterSelected.value = []
  onCarrierFilterChanged()
}

function onCarrierFilterChanged() {
  if (usePagination.value) {
    currentPage.value = 1
    handleSearch(false)
  } else {
    buildTableData()
  }
}

function closeBillNameFilter(e: Event) {
  const target = e.target as HTMLElement
  if (!target.closest('.bill-name-filter-panel') && !target.closest('.filter-icon')) {
    showBillNameFilter.value = false
  }
}

// 承运单位多选切换
function toggleCarrier(row: any, opt: string) {
  const arr = [...row.selectedCarrierArr]
  const idx = arr.indexOf(opt)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(opt)
  row.selectedCarrierArr = arr
  row.selectedCarrier = arr.join(',')
  row.carrierBoss = row.selectedCarrier
  saveCarrierChange(row)
}

// 承运单位变更保存
async function saveCarrierChange(row: any) {
  try {
    const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
    const vName = row.isSubItem ? row.veh_name : row.vehicle_vessel_name
    await settleApi.postCarrierDepartment({
      vehName: vName,
      wno,
      boss: row.selectedCarrier,
    })
  } catch (error) {
    toast.error('设置承运单位失败')
  }
}

// 智能价格输入（根据选择数量自动判断）
function handlePriceInput() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value
  const totalSelected = selected.length + selectedInner.length

  if (totalSelected === 0) {
    toast.warning('请选择要输入价格的记录')
    return
  }

  // 只选择了一条记录，打开单行输入
  if (totalSelected === 1) {
    if (selected.length === 1) {
      // 选中了一个主运单
      const inv = selected[0]
      priceInputDialog.value?.open(inv, true)
    } else if (selectedInner.length === 1) {
      // 选中了一个内部运单
      const innerNo = selectedInner[0]
      const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
      if (row) {
        const inv = dbRecords.value.find((inv) => inv.waybill_no === row.waybill_no)
        priceInputDialog.value?.open(inv, false, innerNo)
      }
    }
  } else {
    // 选择了多条记录，打开批量输入
    batchPriceInputDialog.value?.open(selected, selectedInner, dbRecords.value)
  }
}

// 加入结算篮
function handleAddToBasket() {
  const mainSelected = selectedRecords.value
  const subSelected = selectedSubItems.value
  const allSelected = [...mainSelected, ...subSelected]
  if (allSelected.length === 0) return
  const innerNos = subSelected.map((r) => r.inner_waybill_no)
  if (!checkReceiptForSettle(mainSelected, innerNos)) return
  if (addToBasket(allSelected)) {
    // 清除选中状态
    tableData.value.forEach((row) => {
      if (row.selected) {
        row.selected = false
      }
    })
    selectAll.value = false
  }
}

// 从结算篮结算
async function handleSettleFromBasket(items: any[]) {
  if (items.length === 0) {
    toast.warning('结算篮为空，请先添加记录')
    return
  }

  // 检查回执
  const mainItems = items.filter((item) => !item.isSubItem)
  const innerNos = items.filter((item) => item.isSubItem).map((item) => item.inner_waybill_no)
  if (!checkReceiptForSettle(mainItems, innerNos)) return

  // 检查价格输入情况
  const itemsWithoutPrice = items.filter((item) => item.vessel_price === 0)
  const itemsNotRequireSettle = items.filter((item) => item.vessel_price < 0)

  // 如果有标记为不需要结算的
  if (itemsNotRequireSettle.length > 0) {
    toast.error(`结算篮中有 ${itemsNotRequireSettle.length} 条记录已确定为不需要结算，请先移除`)
    return
  }

  // 如果有未输入价格的，提示用户输入
  if (itemsWithoutPrice.length > 0) {
    basketPriceDialogData.value = itemsWithoutPrice
    basketPriceDialog.value = true
    return
  }

  // 选中结算篮中的所有项目（包括子项）
  tableData.value.forEach((row) => {
    if (row.isSubItem) {
      row.selected = items.some((item) => item.inner_waybill_no && item.inner_waybill_no === row.inner_waybill_no)
    } else {
      row.selected = items.some((item) => !item.isSubItem && item.waybill_no === row.waybill_no)
    }
  })

  // 执行结算
  await performSettle(true, '已结算', new Date(), authStore.user?.userid)

  // 结算成功后清空结算篮
  clearBasket()
  showBasket.value = false
}

// 确认结算篮价格输入
function handleConfirmBasketPrice() {
  const itemsWithoutPrice = basketPriceDialogData.value
  // 选中这些没有价格的记录（包括子项）
  tableData.value.forEach((row) => {
    if (row.isSubItem) {
      row.selected = itemsWithoutPrice.some((item: any) => item.inner_waybill_no && item.inner_waybill_no === row.inner_waybill_no)
    } else {
      row.selected = itemsWithoutPrice.some((item: any) => !item.isSubItem && item.waybill_no === row.waybill_no)
    }
  })
  // 根据数量打开相应的价格输入对话框
  if (itemsWithoutPrice.length === 1) {
    priceInputDialog.value?.open(itemsWithoutPrice[0], true)
  } else {
    batchPriceInputDialog.value?.open(itemsWithoutPrice, [], dbRecords.value)
  }
  basketPriceDialog.value = false
}

// 回执滞留信息
function handleDelayInfo() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length + selectedInner.length !== 1) {
    if (selected.length + selectedInner.length > 1) {
      toast.warning('只能选择一条记录查看滞留信息')
    } else {
      toast.warning('请选择一条记录')
    }
    return
  }

  if (selected.length === 1) {
    delayInfoDialog.value?.open(selected[0], false)
  } else {
    const innerNo = selectedInner[0]
    const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
    if (row) {
      const inv = dbRecords.value.find((inv) => inv.waybill_no === row.waybill_no)
      delayInfoDialog.value?.open(inv, false, innerNo)
    }
  }
}

// 批量预付
function handleBatchCharge() {
  // 获取所有显示的运单号（包括展开的子行）
  const allWnoList = tableData.value
    .filter((row) => !row.isSubItem || row.parentExpanded)
    .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

  if (allWnoList.length === 0) {
    toast.warning('没有可更新的运单')
    return
  }

  delayInfoDialog.value?.openBatch(allWnoList)
}

// 批量回执
function handleBatchReceipt() {
  batchReceiptDialog.value = true
}

// 确认批量回执
async function handleConfirmBatchReceipt() {
  try {
    const allNo = tableData.value
      .filter((row) => !row.isSubItem || row.parentExpanded)
      .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

    await settleApi.updateVesselDelayInfo({
      unshipData: { receipt: allReceiptOk.value ? 0 : 1 },
      wnoList: allNo,
      partInd: 2,
    })

    toast.success('批量设置回执成功')
    handleSearch(true)
  } catch (error) {
    if (error !== 'cancel') {
      toast.error('批量设置回执失败')
    }
  }
}

// 显示明细
function handleShowDetail() {
  if (selectedRecords.value.length === 1) {
    detailDialog.value?.open(selectedRecords.value[0])
  }
}

// 结算
async function handleSettle() {
  await performSettle(true, '已结算', new Date(), authStore.user?.userid)
}

// 结算取消
async function handleSettleCancel() {
  await performSettle(false, '未结算', '', '')
}

async function performSettle(settle: boolean, state: string, date: any, username: any) {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择您要结算或结算取消的行')
    return
  }

  // 结算时检查回执
  if (settle && !checkReceiptForSettle(selected, selectedInner)) return

  // 验证
  const allSelectedWNo: string[] = []
  for (const rec of selected) {
    if (settle) {
      if (rec.vessel_price < 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 已设置为不需要结算, 请先取消不结算,再来结算`)
        return
      } else if (rec.vessel_price === 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 还未输入价格, 不能继续结算`)
        return
      } else if (rec.vessel_settle_state === '未结算') {
        allSelectedWNo.push(rec.waybill_no)
      }
    } else {
      if (rec.vessel_price < 0) {
        toast.error(`您选择的运单: ${rec.waybill_no} 已设置为不需要结算, 不能取消`)
        return
      } else if (rec.vessel_settle_state === '已结算') {
        allSelectedWNo.push(rec.waybill_no)
      }
    }
  }

  const wnoListFromInner: string[] = []
  for (const innerNo of selectedInner) {
    const row = tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)
    if (row) {
      if (settle) {
        if (row.price < 0) {
          toast.error(`您选择的内部运单: ${innerNo} 已设置为不需要结算, 请先取消不结算,再来结算`)
          return
        } else if (row.price === 0) {
          toast.error(`您选择的内部运单: ${innerNo} 还未输入价格, 不能继续结算`)
          return
        }
      } else {
        if (row.price < 0) {
          toast.error(`您选择的内部运单: ${innerNo} 已设置为不需要结算, 不能取消结算`)
          return
        }
      }

      if (!wnoListFromInner.includes(row.waybill_no)) {
        wnoListFromInner.push(row.waybill_no)
      }
    }
  }

  try {
    await settleApi.settleVessel({
      allSelectedInvNo: allSelectedWNo,
      allInvNoFromInner: wnoListFromInner,
      allInnerNo: selectedInner,
      settle,
    })

    toast.success(settle ? '结算成功' : '结算取消成功')
    // 结算完成后清空车辆筛选，回到全量视图
    if (filterForm.value.vehicle) {
      filterForm.value.vehicle = ''
    }
    handleSearch(true)
  } catch (error) {
    toast.error(settle ? '结算失败' : '结算取消失败')
  }
}

// 付款
async function handlePay() {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择记录')
    return
  }

  ticketNo.value = ''
  payTicketDialog.value = true
}

async function handleConfirmPay() {
  await performPay(true, '已付款', new Date(), ticketNo.value)
  payTicketDialog.value = false
}

// 付款取消
async function handlePayCancel() {
  await performPay(false, '已结算', '')
}

async function performPay(pay: boolean, state: string, date: any, ticketNoParam?: string) {
  const selected = selectedRecords.value
  const selectedInner = selectedInnerNo.value

  if (selected.length === 0 && selectedInner.length === 0) {
    toast.warning('请先选择记录')
    return
  }

  const allPayWNo = selected.map((rec) => rec.waybill_no)
  const wnoListFromInner = [
    ...new Set(
      selectedInner
        .map((innerNo) => tableData.value.find((r) => r.isSubItem && r.inner_waybill_no === innerNo)?.waybill_no)
        .filter(Boolean),
    ),
  ]

  try {
    await settleApi.settleVesselPay({
      allPayInvNo: allPayWNo,
      allInvNoFromInner: wnoListFromInner,
      allInnerNo: selectedInner,
      forPay: pay,
      ticketNo: ticketNoParam,
    })

    toast.success(pay ? '付款成功' : '付款取消成功')
    handleSearch(true)
  } catch (error) {
    toast.error(pay ? '付款失败' : '付款取消失败')
  }
}

// 打印
function handlePrintDetail() {
  const selected = tableData.value.filter((row) => row.selected)
  if (selected.length === 0) {
    toast.warning('请选择你要打印的清单列表')
    return
  }

  printDialog.value?.open(selected)
}

// 不需要结算
function handleNotNeedSettle(row: any) {
  if (row.vehicleFiltered) {
    toast.warning('按车辆筛选时，不能对船运单进行结算操作')
    return
  }
  const isAlreadyNotNeed = row.notNeedColor === 'darkgray'
  if (!isAlreadyNotNeed && filterForm.value.settleState !== '未结算') {
    toast.warning('已结算,不能再进行"不需要结算操作"')
    return
  }

  // 保存待处理的行数据，显示确认对话框
  pendingNotNeedSettleRow.value = row
  showNotNeedSettleDialog.value = true
}

// 确认不需要结算
async function confirmNotNeedSettle() {
  const row = pendingNotNeedSettleRow.value
  if (!row) return

  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  const notNeeded = row.notNeedColor === 'red'

  try {
    await settleApi.settleVesselNotNeeded({
      wayNoList: [wno],
      notNeeded,
    })

    toast.success(notNeeded ? '已设置为不需要结算' : '已取消不需要结算')
    handleSearch(true)
  } catch (error) {
    toast.error('操作失败')
  } finally {
    showNotNeedSettleDialog.value = false
    pendingNotNeedSettleRow.value = null
  }
}

// 批量不需要结算
function handleBatchNotNeed() {
  if (filterForm.value.settleState !== '未结算') {
    toast.warning('在已结算状态下不能进行此操作')
    return
  }

  batchNotNeedDialog.value = true
}

// 确认批量不结算
async function handleConfirmBatchNotNeed() {
  try {
    const wnoList = tableData.value
      .filter((row) => !row.isSubItem || row.parentExpanded)
      .map((row) => (row.isSubItem ? row.inner_waybill_no : row.waybill_no))

    await settleApi.settleVesselNotNeeded({
      wayNoList: wnoList,
      notNeeded: !allNotNeed.value,
    })

    toast.success('批量设置成功')
    handleSearch(true)
  } catch (error) {
    if (error !== 'cancel') {
      toast.error('操作失败')
    }
  }
}

// 切换回执状态
async function handleToggleReceipt(row: any) {
  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  const newReceipt = row.receipt === 1 ? 0 : 1
  try {
    await settleApi.toggleVesselReceipt(wno, newReceipt)
    row.receipt = newReceipt
    toast.success(newReceipt === 1 ? '已标记回执' : '已取消回执')
  } catch (error: any) {
    toast.error(error.message || '操作失败')
  }
}

// 待恢复焦点的上传记录（上传成功刷新后用于定位 + 展开 + 滚动）
const pendingFocusUpload = ref<{ waybillNo: string, innerWaybillNo?: string } | null>(null)
// 重新构建表格时需要强制展开的船运 waybill_no 集合
const forceExpandVesselSet = ref<Set<string>>(new Set())

// 记录上传/查看的目标行（用于刷新后定位 + 展开父船运）
function markFocusRow(row: any) {
  pendingFocusUpload.value = row.isSubItem
    ? { waybillNo: row.waybill_no, innerWaybillNo: row.inner_waybill_no }
    : { waybillNo: row.waybill_no }
  if (row.isSubItem && row.waybill_no) {
    forceExpandVesselSet.value.add(row.waybill_no)
  }
}

// 上传回执
function handleUploadReceipt(row: any) {
  markFocusRow(row)
  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  uploadReceiptDialog.value?.open(wno)
}

// 查看回执（查看对话框内也支持继续追加上传，因此同样要标记）
function handleViewReceipt(row: any) {
  markFocusRow(row)
  const wno = row.isSubItem ? row.inner_waybill_no : row.waybill_no
  receiptImageDialog.value?.open(wno)
}

function getExportVisibleRows(rows: any[]) {
  return rows.filter((row) => !row.isSubItem || row.parentExpanded)
}

function getRowVehicleName(row: any) {
  return row.isSubItem ? row.veh_name : row.vehicle_vessel_name
}

function getRowVehicleCategory(row: any, categoryMap = vehCategoryMap.value) {
  const vehicleName = getRowVehicleName(row)
  if (!vehicleName) return ''
  if (categoryMap[vehicleName]) return categoryMap[vehicleName]
  if (row.selfOwned === 1 || row.selfOwned === '1') return '自有'
  return ''
}

function getExportColumns(includeUser = false) {
  const columns = [
    ...(includeUser ? ['用户'] : []),
    '状态',
    '车船号',
    '车船归属',
    ...(!hideCarrier.value ? ['承运单位'] : []),
    '开单名称',
    '发货单位',
    '始发地',
    '目的地',
    '发运块数',
    '发运重量',
    '单价',
    '总价格',
    '发货日期',
    '结算日期',
    '卸船日期',
    '滞留天数',
    '运单号',
    '票号',
    '预付',
    '回执',
  ]
  return columns
}

function getExportColumnFormats(includeUser = false) {
  const fmtMap: Record<string, string> = {
    '发运重量': '0.000',
    '单价': '0.00',
    '总价格': '0.00',
    '预付': '0.00',
  }
  return getExportColumns(includeUser).map((h) => fmtMap[h] || null)
}

function getExportRowValues(row: any, categoryMap = vehCategoryMap.value, includeUser = false) {
  const weight = row.isSubItem ? row.send_weight : row.total_weight
  const price = row.isSubItem ? row.price : row.vessel_price
  return [
    ...(includeUser ? [row._basketOwner || ''] : []),
    row.isSubItem ? row.state : row.vessel_settle_state,
    getRowVehicleName(row),
    getRowVehicleCategory(row, categoryMap),
    ...(!hideCarrier.value ? [row.carrierBoss] : []),
    row.shipName || '',
    row.shipCustomer || row.shipName || '',
    row.ship_from || '',
    row.ship_to || '',
    toExcelNum(row.send_num),
    toExcelNum(weight),
    toExcelNum(price),
    toExcelNum(price && weight ? price * weight : 0),
    toExcelDate(row.ship_date),
    toExcelDate(row.settle_date),
    toExcelDate(row.unship_date),
    toExcelNum(row.delay_day),
    row.isSubItem ? row.inner_waybill_no : row.waybill_no,
    row.ticket_no,
    (row.chargeText || '').replace(',', '，'),
    row.receipt === 1 ? '已回执' : '未回执',
  ]
}

function appendExportRows(
  data: any[][],
  rows: any[],
  categoryMap = vehCategoryMap.value,
  includeUser = false,
  filterVisible = true,
) {
  const exportRows = filterVisible ? getExportVisibleRows(rows) : rows
  exportRows.forEach((row) => {
    data.push(getExportRowValues(row, categoryMap, includeUser))
  })
}

function buildExportRowsFromInvoices(records: any[], options: {
  vehPersonMap: Record<string, any>
  imageWaybillsSet: Set<string>
}) {
  let filteredRecords = records

  if (shipFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const sc = inv.ship_customer || ''
      return shipFilterSelected.value.includes(sc)
    })
  }

  if (carrierFilterSelected.value.length > 0) {
    filteredRecords = filteredRecords.filter((inv) => {
      const carrier = options.vehPersonMap[inv.vehicle_vessel_name]
      const boss = typeof carrier === 'string' ? carrier : carrier?.boss || ''
      const bossList = boss
        .split(/,|，/)
        .map((b: string) => b.trim())
        .filter(Boolean)
      return bossList.some((b: string) => carrierFilterSelected.value.includes(b))
    })
  }

  if (filterForm.value.billName) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_name === filterForm.value.billName)
  }

  if (filterForm.value.origin) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_from === filterForm.value.origin)
  }

  if (filterForm.value.destination) {
    filteredRecords = filteredRecords.filter((inv) => inv.ship_to === filterForm.value.destination)
  }

  const vehicleFilter = filterForm.value.vehicle || ''
  const rows: any[] = []

  filteredRecords.forEach((inv) => {
    const isVessel = inv.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)
    let vehObj = isVessel ? makeVehInfo(inv) : null

    let vehicleFiltered = false
    if (vehicleFilter) {
      if (isVessel && vehObj) {
        const filteredVehObj: any = {}
        Object.keys(vehObj).forEach((key) => {
          if (vehObj[key].name === vehicleFilter) {
            filteredVehObj[key] = vehObj[key]
          }
        })
        if (Object.keys(filteredVehObj).length === 0 && inv.vehicle_vessel_name !== vehicleFilter) {
          return
        }
        if (Object.keys(filteredVehObj).length > 0) {
          vehObj = filteredVehObj
          vehicleFiltered = true
        }
      } else if (!isVessel && inv.vehicle_vessel_name !== vehicleFilter) {
        return
      }
    }

    const settleState = filterForm.value.settleState
    if (settleState && settleState !== '全部' && isVessel && inv.vessel_settle_state !== settleState) {
      return
    }

    const mainRow = buildMainRow(inv, isVessel, vehObj, options)
    mainRow.vehicleFiltered = vehicleFiltered
    if (!vehicleFiltered) {
      rows.push(mainRow)
    }

    const vesselNameMatched = vehicleFilter && isVessel && inv.vehicle_vessel_name === vehicleFilter
    if (isVessel && vehObj && !vesselNameMatched) {
      Object.keys(vehObj).forEach((key) => {
        const subRow = buildSubRow(inv, vehObj[key], key, mainRow, options)
        if (vehicleFiltered) {
          subRow.parentExpanded = true
        }
        rows.push(subRow)
      })
    }
  })

  return rows
}

async function fetchAllRowsForExport() {
  if (!usePagination.value || serverTotalCount.value === 0) {
    return {
      rows: tableData.value,
      categoryMap: vehCategoryMap.value,
    }
  }

  const exportPageSize = 500
  const totalPagesForExport = Math.max(1, Math.ceil(serverTotalCount.value / exportPageSize))
  const params = buildSearchParams()
  const allRecords: any[] = []
  const mergedVehPersonMap: Record<string, any> = { ...vehPersonMap.value }
  const mergedVehCategoryMap: Record<string, string> = { ...vehCategoryMap.value }
  const mergedImageWaybills = new Set<string>()

  for (let page = 1; page <= totalPagesForExport; page++) {
    const response = await settleApi.getInvoiceSettleVessel({
      ...params,
      page,
      pageSize: exportPageSize,
    })

    if (!response.ok) {
      throw new Error(`导出数据获取失败（第 ${page} 页）`)
    }

    allRecords.push(...(response.invs || []))
    Object.assign(mergedVehPersonMap, response.vehPersonMap || {})
    Object.assign(mergedVehCategoryMap, response.vehCategoryMap || {})
    ;(response.imageWaybills || []).forEach((waybillNo) => mergedImageWaybills.add(waybillNo))
  }

  return {
    rows: buildExportRowsFromInvoices(allRecords, {
      vehPersonMap: mergedVehPersonMap,
      imageWaybillsSet: mergedImageWaybills,
    }),
    categoryMap: mergedVehCategoryMap,
  }
}

async function buildStyledMainExportBuffer(rows: any[], categoryMap: Record<string, string>) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('车船结算')
  const headers = getExportColumns()
  const numericHeaders = new Set(['发运块数', '发运重量', '单价', '总价格', '滞留天数'])
  const weightHeaders = new Set(['发运重量'])
  const amountHeaders = new Set(['单价', '总价格', '预付'])
  const centerHeaders = new Set(['状态', '车船归属', '发货日期', '结算日期', '卸船日期', '回执'])

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }
  const truckToVesselFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF7E6' },
  }

  const getTextWidth = (text: any) => {
    const str = String(text ?? '')
    return [...str].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0)
  }
  const columnWidths = headers.map(header => getTextWidth(header))

  const headerRow = sheet.addRow(headers)
  headerRow.height = 22
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = headerFill
    cell.font = { bold: true, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
    columnWidths[colNumber - 1] = Math.max(columnWidths[colNumber - 1], getTextWidth(cell.value))
  })

  rows.forEach((row) => {
    const values = getExportRowValues(row, categoryMap, false)
    const excelRow = sheet.addRow(values)
    excelRow.height = row.isSubItem ? 20 : 18

    excelRow.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1]
      const isNumeric = numericHeaders.has(header)
      const isCenter = centerHeaders.has(header)

      cell.border = thinBorder
      cell.font = { size: 10 }
      cell.alignment = {
        vertical: 'middle',
        horizontal: isNumeric ? 'right' : isCenter ? 'center' : 'left',
        indent: header === '车船号' && row.isSubItem ? 1 : 0,
      }

      if (weightHeaders.has(header) && typeof cell.value === 'number') {
        cell.numFmt = '0.000'
      } else if (amountHeaders.has(header) && typeof cell.value === 'number') {
        cell.numFmt = '0.00'
      }

      if (row.isSubItem) {
        cell.fill = truckToVesselFill
      }

      columnWidths[colNumber - 1] = Math.max(columnWidths[colNumber - 1], getTextWidth(cell.value))
    })
  })

  sheet.columns = headers.map((_, index) => ({
    width: Math.min(columnWidths[index] + 2, 60),
  }))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  return workbook.xlsx.writeBuffer()
}

// 导出
async function handleExport() {
  if (tableData.value.length === 0) {
    toast.warning('没有数据可以导出')
    return
  }

  try {
    const { rows, categoryMap } = await fetchAllRowsForExport()
    if (rows.length === 0) {
      toast.warning('没有数据可以导出')
      return
    }

    toast.info(`正在准备导出数据，共 ${rows.length} 条记录`)
    exportWithBufferPicker({
      fileName: `车船结算_${dayjs().format('YYYY-MM-DD')}`,
      generateBuffer: () => buildStyledMainExportBuffer(rows, categoryMap),
    })
  } catch (error: any) {
    toast.error('导出失败', { description: error.message || '数据获取失败' })
  }
}

// 结算篮导出
function handleExportFromBasket() {
  if (basketItems.value.length === 0) {
    toast.warning('结算篮为空')
    return
  }

  const data: any[][] = [getExportColumns()]
  appendExportRows(data, basketItems.value, vehCategoryMap.value, false, false)

  exportFromAOAWithPicker(data, `结算篮_车船_${dayjs().format('YYYY-MM-DD')}`, '结算篮', getExportColumnFormats())
}

// 结算篮价格设置
function handlePriceInputFromBasket() {
  if (basketItems.value.length === 0) {
    toast.warning('结算篮为空')
    return
  }
  // 使用批量价格输入对话框处理结算篮中的数据（不含内部运单号）
  batchPriceInputDialog.value?.open(basketItems.value, [], dbRecords.value)
}

// 公开篮导出
function handleExportFromPublicBaskets() {
  if (publicItems.value.length === 0) {
    toast.warning('公开篮为空')
    return
  }

  const data: any[][] = [getExportColumns(true)]
  appendExportRows(data, publicItems.value, vehCategoryMap.value, true, false)

  exportFromAOAWithPicker(data, `公开篮_车船_${dayjs().format('YYYY-MM-DD')}`, '公开篮', getExportColumnFormats(true))
}

// 公开篮价格设置
function handlePriceInputFromPublicBaskets() {
  if (publicItems.value.length === 0) {
    toast.warning('公开篮为空')
    return
  }
  batchPriceInputDialog.value?.open(publicItems.value, [], dbRecords.value)
}

// 对话框回调 — 价格保存后刷新数据但保留选中状态
async function refreshKeepSelection() {
  const prevSelected = new Set(selectedRecords.value.map((r) => r.waybill_no))
  await handleSearch(true)
  if (prevSelected.size > 0) {
    tableData.value.forEach((row) => {
      if (!row.isSubItem && prevSelected.has(row.waybill_no)) {
        row.selected = true
      }
    })
    calcSelectedSummary()
  }
}

function handlePriceConfirm(data: any) {
  refreshKeepSelection()
}

function handleBatchPriceConfirm(data: any) {
  refreshKeepSelection()
}

function handleDelayInfoConfirm(data: any) {
  handleSearch(true)
}

function handlePrintConfirm(forPay: boolean) {
  if (forPay) {
    performPay(true, '已付款', new Date())
  }
}

async function handleUploadReceiptConfirm() {
  await handleSearch(true)
  await restoreFocusAfterUpload()
}

// 上传/追加回执成功并刷新后：展开父船运行 + 滚动到刚上传的记录 + 高亮提示
async function restoreFocusAfterUpload() {
  const target = pendingFocusUpload.value
  if (!target) return
  pendingFocusUpload.value = null
  // 清理强制展开集合（下次用户手动操作不再保留）
  forceExpandVesselSet.value = new Set()

  // 用纯 waybill_no 匹配父船运（不依赖任何对象引用，避免 proxy 引用陷阱）
  // 这里直接构造一个新数组，强制 pagedData computed 重新求值，
  // 同时保证父船运 expanded 与所有同船子行 parentExpanded 必为 true。
  const targetWaybill = target.waybillNo
  const isSub = !!target.innerWaybillNo
  const next = tableData.value.map((row: any) => {
    if (!isSub) return row
    if (!row.isSubItem && row.isVessel && row.waybill_no === targetWaybill) {
      return { ...row, expanded: true }
    }
    if (row.isSubItem && row.waybill_no === targetWaybill) {
      return { ...row, parentExpanded: true }
    }
    return row
  })
  // 修复 parentRow 引用：让新生成的子行 parentRow 指向新的父行对象
  if (isSub) {
    const newParent = next.find(
      (r: any) => !r.isSubItem && r.isVessel && r.waybill_no === targetWaybill,
    )
    if (newParent) {
      next.forEach((r: any) => {
        if (r.isSubItem && r.waybill_no === targetWaybill) {
          r.parentRow = newParent
        }
      })
    }
  }
  tableData.value = next

  await nextTick()

  const key = isSub
    ? `sub-${target.innerWaybillNo}`
    : `main-${target.waybillNo}`
  const el = document.querySelector(`[data-row-key="${key}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('vessel-row-flash')
    setTimeout(() => el.classList.remove('vessel-row-flash'), 2000)
  }
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '车船结算(自有车)' : '车船结算'"
    :description="isSelfOwnedMode ? '自有车船运费结算管理' : '车船运费结算管理'"
  >
    <div class="settle-vessel-page relative flex flex-col" style="height: calc(100vh - 80px)">
      <!-- 操作栏：移动端 -->
      <div class="md:hidden space-y-2 mb-4">
        <!-- 第一层：状态 Tabs 横向滚动 -->
        <div class="overflow-x-auto" :class="{ 'pointer-events-none opacity-50': loading }">
          <Tabs v-model="filterForm.settleState" @update:model-value="() => handleSearch(true)">
            <TabsList class="h-9 w-max">
              <TabsTrigger
                value="未结算"
                class="text-xs data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400"
              >
                未结算
              </TabsTrigger>
              <TabsTrigger
                value="已结算"
                class="text-xs data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
              >
                已结算
              </TabsTrigger>
              <TabsTrigger
                value="已付款"
                class="text-xs data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400"
              >
                已付款
              </TabsTrigger>
              <TabsTrigger value="不需要结算" class="text-xs data-[state=active]:text-muted-foreground">
                不需要结算
              </TabsTrigger>
              <TabsTrigger value="全部" class="text-xs"> 全部 </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <!-- 第二层：操作按钮横向滚动（icon模式） -->
        <div class="flex items-center gap-1.5 overflow-x-auto">
          <TooltipProvider :delay-duration="300">
            <template v-if="hasPrivilegePrice">
              <Tooltip>
                <TooltipTrigger as-child>
                  <UiButton
                    variant="outline"
                    size="icon"
                    class="shrink-0 h-8 w-8 relative"
                    :disabled="selectedRecords.length + selectedInnerNo.length === 0"
                    @click="handlePriceInput"
                  >
                    <span class="font-bold text-sm">¥</span>
                    <span
                      v-if="selectedRecords.length + selectedInnerNo.length > 0"
                      class="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center"
                      >{{ selectedRecords.length + selectedInnerNo.length }}</span
                    >
                  </UiButton>
                </TooltipTrigger>
                <TooltipContent><p>价格输入</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <UiButton variant="outline" size="icon" class="shrink-0 h-8 w-8" @click="handleDelayInfo">
                    <Clock class="w-4 h-4" />
                  </UiButton>
                </TooltipTrigger>
                <TooltipContent><p>回执滞留</p></TooltipContent>
              </Tooltip>
            </template>
            <Tooltip>
              <TooltipTrigger as-child>
                <UiButton variant="outline" size="icon" class="shrink-0 h-8 w-8" @click="handleExport">
                  <Download class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>导出</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <UiButton
                  variant="outline"
                  size="icon"
                  class="shrink-0 h-8 w-8"
                  :disabled="receiptDownloadState.status === 'running' || !hasReceiptDownloadSource"
                  @click="handleDownloadReceipts"
                >
                  <Loader2 v-if="receiptDownloadState.status === 'running'" class="w-4 h-4 animate-spin" />
                  <Download v-else class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>下载查询结果回执</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <UiButton
                  variant="outline"
                  size="icon"
                  class="shrink-0 h-8 w-8"
                  :disabled="!canShowDetail"
                  @click="handleShowDetail"
                >
                  <Eye class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>显示明细</p></TooltipContent>
            </Tooltip>

            <Tooltip v-if="canShowBasket">
              <TooltipTrigger as-child>
                <UiButton
                  ref="basketButtonRef"
                  variant="default"
                  size="icon"
                  class="relative shrink-0 h-8 w-8"
                  @click="showBasket = true"
                >
                  <ShoppingCart class="w-4 h-4" />
                  <span
                    v-if="basketItems.length > 0"
                    class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center animate-pulse"
                    >{{ basketItems.length > 99 ? '99+' : basketItems.length }}</span
                  >
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>结算篮</p></TooltipContent>
            </Tooltip>

            <Tooltip v-if="showSettleBtn">
              <TooltipTrigger as-child>
                <UiButton variant="default" size="icon" class="shrink-0 h-8 w-8" @click="handleSettle">
                  <CheckCircle class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>结算</p></TooltipContent>
            </Tooltip>
            <Tooltip v-if="showSettleCancelBtn">
              <TooltipTrigger as-child>
                <UiButton variant="outline" size="icon" class="shrink-0 h-8 w-8" @click="handleSettleCancel">
                  <Ban class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>结算取消</p></TooltipContent>
            </Tooltip>
            <Tooltip v-if="showPrintBtn">
              <TooltipTrigger as-child>
                <UiButton variant="outline" size="icon" class="shrink-0 h-8 w-8" @click="handlePrintDetail">
                  <Printer class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>车船清单打印</p></TooltipContent>
            </Tooltip>
            <Tooltip v-if="showPayBtn">
              <TooltipTrigger as-child>
                <UiButton variant="default" size="icon" class="shrink-0 h-8 w-8" @click="handlePay">
                  <Wallet class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>付款</p></TooltipContent>
            </Tooltip>
            <Tooltip v-if="showPayCancelBtn">
              <TooltipTrigger as-child>
                <UiButton variant="outline" size="icon" class="shrink-0 h-8 w-8" @click="handlePayCancel">
                  <Ban class="w-4 h-4" />
                </UiButton>
              </TooltipTrigger>
              <TooltipContent><p>付款取消</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div class="ml-auto shrink-0">
            <UiButton variant="outline" size="icon" class="h-8 w-8" @click="showFilter = !showFilter">
              <Filter class="w-4 h-4" />
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 操作栏：桌面端 -->
      <div class="hidden md:flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
          <!-- 价格输入按钮组 -->
          <template v-if="hasPrivilegePrice">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedRecords.length + selectedInnerNo.length === 0"
              @click="handlePriceInput"
            >
              <span class="mr-1 font-semibold">¥</span>
              价格输入
              <span v-if="selectedRecords.length + selectedInnerNo.length > 0" class="ml-1 text-xs opacity-70">
                ({{ selectedRecords.length + selectedInnerNo.length }})
              </span>
            </UiButton>
            <div class="flex items-center">
              <UiButton
                variant="outline"
                size="sm"
                class="h-9 rounded-r-none border-r-0"
                @click="handleDelayInfo"
              >
                回执滞留
              </UiButton>
              <UiDropdownMenu>
                <UiDropdownMenuTrigger as-child>
                  <UiButton variant="outline" size="icon" class="h-9 w-9 rounded-l-none px-0">
                    <ChevronsUpDown class="h-4 w-4" />
                  </UiButton>
                </UiDropdownMenuTrigger>
                <UiDropdownMenuContent align="start">
                  <UiDropdownMenuItem
                    :disabled="receiptDownloadState.status === 'running' || !hasReceiptDownloadSource"
                    @click="handleDownloadReceipts"
                  >
                    <Loader2 v-if="receiptDownloadState.status === 'running'" class="mr-2 h-4 w-4 animate-spin" />
                    <Download v-else class="mr-2 h-4 w-4" />
                    下载回执
                  </UiDropdownMenuItem>
                </UiDropdownMenuContent>
              </UiDropdownMenu>
            </div>
          </template>

          <!-- 工具按钮组 -->
          <div class="flex items-center">
            <UiButton variant="outline" size="sm" class="h-9 rounded-r-none border-r-0" @click="handleExport"> 导出 </UiButton>
            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child>
                <UiButton variant="outline" size="icon" class="h-9 w-9 rounded-l-none px-0">
                  <ChevronsUpDown class="h-4 w-4" />
                </UiButton>
              </UiDropdownMenuTrigger>
              <UiDropdownMenuContent align="start">
                <UiDropdownMenuItem :disabled="!canShowDetail" @click="handleShowDetail">
                  <Eye class="mr-2 h-4 w-4" />
                  显示明细
                </UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>
          </div>
          <div
            v-if="filterForm.settleState !== '全部' && filterForm.settleState !== '不需要结算'"
            class="w-px h-6 bg-border"
          />

          <!-- 结算篮按钮 -->
          <UiButton
            v-if="canShowBasket"
            ref="basketButtonRef"
            variant="default"
            size="sm"
            class="relative"
            @click="showBasket = true"
          >
            <ShoppingCart class="w-4 h-4 mr-1" />
            结算篮
            <span
              v-if="basketItems.length > 0"
              class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse"
            >
              {{ basketItems.length > 99 ? '99+' : basketItems.length }}
            </span>
          </UiButton>

          <!-- 查看公开篮 -->
          <UiButton
            v-if="canShowBasket && authStore.features.publicBasket"
            variant="outline"
            size="sm"
            @click="handleShowPublicBaskets"
          >
            <Users class="w-4 h-4 mr-1" />
            公开篮
          </UiButton>

          <!-- 结算按钮组 -->
          <UiButton v-if="showSettleBtn" variant="default" size="sm" @click="handleSettle"> 结算 </UiButton>
          <UiButton v-if="showSettleCancelBtn" variant="outline" size="sm" @click="handleSettleCancel">
            结算取消
          </UiButton>

          <UiButton v-if="showPrintBtn" variant="outline" size="sm" @click="handlePrintDetail"> 车船清单打印 </UiButton>
          <UiButton v-if="showPayBtn" variant="default" size="sm" @click="handlePay"> 付款 </UiButton>
          <UiButton v-if="showPayCancelBtn" variant="outline" size="sm" @click="handlePayCancel"> 付款取消 </UiButton>
        </div>

        <!-- 状态筛选 -->
        <div class="ml-auto flex items-center gap-3" :class="{ 'pointer-events-none opacity-50': loading }">
          <Tabs v-model="filterForm.settleState" @update:model-value="() => handleSearch(true)">
            <TabsList class="h-9">
              <TabsTrigger
                value="未结算"
                class="text-xs data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400"
              >
                未结算
              </TabsTrigger>
              <TabsTrigger
                value="已结算"
                class="text-xs data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
              >
                已结算
              </TabsTrigger>
              <TabsTrigger
                value="已付款"
                class="text-xs data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400"
              >
                已付款
              </TabsTrigger>
              <TabsTrigger value="不需要结算" class="text-xs data-[state=active]:text-muted-foreground">
                不需要结算
              </TabsTrigger>
              <TabsTrigger value="全部" class="text-xs"> 全部 </TabsTrigger>
            </TabsList>
          </Tabs>

          <div class="w-px h-6 bg-border" />
          <UiButton variant="outline" size="sm" @click="showFilter = !showFilter">
            <Filter class="w-4 h-4 mr-1" />
            筛选
          </UiButton>
          <UiButton variant="outline" size="sm" :disabled="loading" @click="handleSearch(false)">
            <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': loading }" />
            刷新
          </UiButton>
        </div>
      </div>

      <!-- 筛选区域 -->
      <div
        v-show="showFilter"
        class="p-4 border rounded-lg bg-muted/30 space-y-2 mb-4 relative overflow-hidden"
        :class="{ 'pointer-events-none opacity-50': loading }"
      >
        <div
          v-if="loading"
          class="absolute inset-0 flex items-center justify-center bg-muted/80 backdrop-blur-sm z-10"
        >
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span>{{ searchLoadingText }}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2" :class="hideCarrier ? 'md:grid-cols-3' : 'md:grid-cols-4'">
          <div
            v-if="showVehicleOwnershipFilter"
            class="col-span-2 md:col-span-1 grid grid-cols-[minmax(0,2fr)_minmax(88px,1fr)] gap-2"
          >
            <SearchableCombobox
              v-model="filterForm.vehicle"
              :search-fn="searchVehicles"
              placeholder="车船号"
              class="h-8 text-sm w-full"
            />
            <Select v-model="filterForm.vehicleOwnership">
              <SelectTrigger class="h-8 text-sm w-full">
                <SelectValue placeholder="车归属" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部</SelectItem>
                <SelectItem value="自有">自有</SelectItem>
                <SelectItem value="外挂">外挂</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SearchableCombobox
            v-else
            v-model="filterForm.vehicle"
            :search-fn="searchVehicles"
            placeholder="车船号"
            class="h-8 text-sm w-full"
          />
          <SearchableCombobox
            v-model="filterForm.billName"
            :search-fn="searchBillingNames"
            placeholder="开单名称"
            class="h-8 text-sm w-full"
          />
          <!-- 承运单位多选 -->
          <SearchableCombobox
            v-if="!hideCarrier"
            v-model="carrierFilterSelected"
            :search-fn="searchCarriers"
            placeholder="承运单位"
            multiple
            class="h-8 text-sm w-full"
          />
          <Select v-model="filterForm.receiptState" @update:model-value="() => handleSearch(true)">
            <SelectTrigger class="h-8 text-sm w-full">
              <SelectValue placeholder="回执状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">回执(全部)</SelectItem>
              <SelectItem value="1">已回执</SelectItem>
              <SelectItem value="0">未回执</SelectItem>
            </SelectContent>
          </Select>
          <SearchableCombobox
            v-model="filterForm.origin"
            :search-fn="searchOrigins"
            placeholder="起始地"
            class="h-8 text-sm w-full"
          />
          <SearchableCombobox
            v-model="filterForm.destination"
            :search-fn="searchDestinations"
            placeholder="目的地"
            class="h-8 text-sm w-full"
          />
          <Input
            v-model="filterForm.amount"
            placeholder="单价"
            class="h-8 text-sm"
            @input="filterForm.amount = filterForm.amount.replace(/[^0-9.]/g, '')"
          />
          <Input
            v-model="filterForm.weight"
            placeholder="吨位"
            class="h-8 text-sm"
            @input="filterForm.weight = filterForm.weight.replace(/[^0-9.]/g, '')"
          />
          <DatePicker
            v-model="filterForm.startDate"
            placeholder="发货日期(开始)"
            :disabled-date="disableStartDate"
            disabled-hint="开始日期不能晚于结束日期"
            class="h-8 w-full"
          />
          <DatePicker
            v-model="filterForm.endDate"
            placeholder="发货日期(结束)"
            :disabled-date="disableEndDate"
            disabled-hint="结束日期不能早于开始日期"
            class="h-8 w-full"
          />
        </div>
      </div>

      <!-- 统计信息行：桌面端 -->
      <div
        class="hidden md:flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm mb-4 relative overflow-hidden"
      >
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-muted/80 backdrop-blur-sm z-10">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span>{{ searchLoadingText }}</span>
          </div>
        </div>
        <span class="text-muted-foreground text-xs">
          记录数:
          <strong class="text-foreground">{{
            summaryTableRowCount > 0 ? summaryTableRowCount : tableData.length
          }}</strong>
        </span>
        <span class="text-muted-foreground text-xs">
          重量: <strong class="text-foreground">{{ formatNumber(totalWeight) }}</strong>
        </span>
        <span class="text-muted-foreground">
          合计:
          <strong class="text-foreground"
            >{{ formatNumber(totalSendWeight) }}吨<template v-if="hasPrivilegePrice">
              / ¥{{ formatNumber(totalAmount) }}</template
            ></strong
          >
        </span>
        <template v-if="selectedTotalWeight > 0">
          <span class="text-primary font-medium">
            已选: {{ formatNumber(selectedTotalWeight) }}吨
            <template v-if="hasPrivilegePrice"> / ¥{{ formatNumber(selectedTotalAmount) }}</template>
          </span>
        </template>
        <span v-if="showUnpayBlock" class="text-orange-600 font-medium">
          未付: ¥{{ formatNumber(totalAmount - prePayment) }}
        </span>

        <!-- 加入结算篮按钮 -->
        <UiButton
          v-if="canShowBasket && (selectedRecords.length > 0 || selectedSubItems.length > 0)"
          variant="default"
          size="sm"
          class="bg-orange-500 hover:bg-orange-600 text-white ml-auto"
          @click="handleAddToBasket"
        >
          <ShoppingCart class="w-4 h-4 mr-1" />
          加入结算篮 ({{ selectedRecords.length + selectedSubItems.length }})
        </UiButton>
        <!-- 分页/全部切换 -->
        <TooltipProvider :delay-duration="200">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                class="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                :class="{ 'ml-auto': !(canShowBasket && (selectedRecords.length > 0 || selectedSubItems.length > 0)) }"
                :disabled="loading"
                @click="togglePagination"
              >
                <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
                <List v-else-if="usePagination" class="w-4 h-4" />
                <Layers v-else class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ usePagination ? '显示全部数据' : '分页显示' }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider :delay-duration="200">
          <Tooltip>
            <Popover>
              <PopoverTrigger as-child>
                <TooltipTrigger as-child>
                  <UiButton variant="ghost" size="icon" class="h-8 w-8" :disabled="loading">
                    <Settings2 class="w-4 h-4" />
                  </UiButton>
                </TooltipTrigger>
              </PopoverTrigger>
              <PopoverContent class="w-56" align="end">
                <div class="space-y-2">
                  <h4 class="font-medium text-sm mb-3">显示列</h4>
                  <div class="space-y-2 max-h-80 overflow-y-auto">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColState" />
                      <span class="text-sm">状态</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColVehicle" />
                      <span class="text-sm">车船号/运单号</span>
                    </label>
                    <label v-if="!hideCarrier" class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColCarrier" />
                      <span class="text-sm">承运单位</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColBillName" />
                      <span class="text-sm">开单名称/发货单位</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColDestination" />
                      <span class="text-sm">起始→目的地</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColQuantity" />
                      <span class="text-sm">发运数</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColWeight" />
                      <span class="text-sm">发运量</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColUnitPrice" />
                      <span class="text-sm">单价</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColTotalPrice" />
                      <span class="text-sm">总价格</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColShipDate" />
                      <span class="text-sm">发货日期</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColSettleDate" />
                      <span class="text-sm">结算日期</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColUnshipDate" />
                      <span class="text-sm">卸船日期</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColDelayDays" />
                      <span class="text-sm">滞留天数</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColWaybillNo" />
                      <span class="text-sm">运单号</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox v-model="showColTicketNo" />
                      <span class="text-sm">票号</span>
                    </label>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent>列设置</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <!-- 统计信息行：移动端 -->
      <div class="md:hidden px-3 py-2 bg-muted/50 rounded-lg border text-sm mb-4 space-y-2 relative overflow-hidden">
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-muted/80 backdrop-blur-sm z-10">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span>{{ searchLoadingText }}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <span class="text-muted-foreground">
            记录数:
            <strong class="text-foreground">{{
              summaryTableRowCount > 0 ? summaryTableRowCount : tableData.length
            }}</strong>
          </span>
          <span class="text-muted-foreground">
            合计:
            <strong class="text-foreground"
              >{{ formatSmart(totalSendWeight, '吨')
              }}<template v-if="hasPrivilegePrice"> / ¥{{ formatSmart(totalAmount, '元') }}</template></strong
            >
          </span>
          <span v-if="selectedTotalWeight > 0" class="text-primary font-medium">
            已选: {{ formatSmart(selectedTotalWeight, '吨')
            }}<template v-if="hasPrivilegePrice"> / ¥{{ formatSmart(selectedTotalAmount, '元') }}</template>
          </span>
          <span v-if="showUnpayBlock" class="text-orange-600 font-medium">
            未付: ¥{{ formatSmart(totalAmount - prePayment, '元') }}
          </span>
        </div>
        <!-- 加入结算篮按钮 -->
        <UiButton
          v-if="canShowBasket && (selectedRecords.length > 0 || selectedSubItems.length > 0)"
          variant="default"
          size="sm"
          class="bg-orange-500 hover:bg-orange-600 text-white w-full"
          @click="handleAddToBasket"
        >
          <ShoppingCart class="w-4 h-4 mr-1" />
          加入结算篮 ({{ selectedRecords.length + selectedSubItems.length }})
        </UiButton>
      </div>

      <!-- 表格：桌面端 -->
      <div class="hidden lg:block flex-1 min-h-0 border rounded-lg overflow-auto relative">
        <!-- 加载遮罩 -->
        <div
          v-if="loading"
          class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-30"
        >
          <div class="flex items-center gap-2 text-muted-foreground">
            <Loader2 class="w-5 h-5 animate-spin" />
            <span>{{ searchLoadingText }}</span>
          </div>
        </div>
        <table class="w-full caption-bottom text-sm min-w-[1024px]">
          <TableHeader>
            <TableRow class="border-b">
              <TableHead
                class="px-1 py-1.5 text-left w-14 sticky top-0 bg-background z-20 shadow-sm"
                nowrap
              >
                <div class="flex items-center">
                <Checkbox v-model="selectAll" @update:model-value="handleSelectAll" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Toggle
                        :pressed="allNotNeed"
                        @click="handleBatchNotNeed"
                        size="sm"
                        class="ml-2 h-6 w-6 p-0"
                        :class="getNotNeedStarClass(allNotNeed ? 'darkgray' : 'red')"
                      >
                        ★
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{{ allNotNeed ? '批量取消不结算' : '批量不结算' }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                </div>
              </TableHead>
              <TableHead
                v-if="showColState"
                class="px-1.5 py-1.5 text-left min-w-[80px] sticky top-0 bg-background z-20 shadow-sm"
              >
                状态
              </TableHead>
              <TableHead
                v-if="showColVehicle"
                class="px-1.5 py-1.5 text-left min-w-[120px] sticky top-0 bg-background z-20 shadow-sm"
              >
                车船号/运单号
              </TableHead>
              <TableHead
                v-if="showColCarrier"
                class="px-1.5 py-1.5 text-left min-w-[100px] sticky top-0 bg-background z-20 shadow-sm"
              >
                承运单位
              </TableHead>
              <TableHead
                v-if="showColBillName"
                class="px-1.5 py-1.5 text-left relative min-w-[180px] sticky top-0 bg-background z-20 shadow-sm"
              >
                开单名称/发货单位
                <span
                  class="ml-2 cursor-pointer"
                  :class="shipFilterSelected.length ? 'text-blue-500' : 'text-gray-400'"
                  @click="toggleBillNameFilter"
                  >⧩</span
                >

                <!-- 发货单位筛选面板 -->
                <div
                  v-show="showBillNameFilter"
                  class="absolute z-50 bg-white border rounded-lg shadow-lg p-3 min-w-[220px] max-w-[360px] mt-1 top-full left-0"
                  @click.stop
                >
                  <div class="max-h-60 overflow-auto space-y-1">
                    <div
                      v-for="item in billNameFilterOptions"
                      :key="item.value"
                      class="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <input v-model="item.checked" type="checkbox" class="h-4 w-4 cursor-pointer" />
                      <span class="text-sm">{{ item.label }}</span>
                    </div>
                  </div>
                  <div class="flex justify-end gap-2 mt-3 pt-2 border-t">
                    <UiButton variant="outline" size="sm" @click="clearBillNameFilter"> 清除 </UiButton>
                    <UiButton variant="default" size="sm" @click="applyBillNameFilter"> 确定 </UiButton>
                  </div>
                </div>
              </TableHead>
              <TableHead
                v-if="showColDestination"
                class="px-1.5 py-1.5 text-left min-w-[120px] sticky top-0 bg-background z-20 shadow-sm"
              >
                起始→目的地
              </TableHead>
              <TableHead
                v-if="showColQuantity"
                class="px-1.5 py-1.5 text-center min-w-[70px] sticky top-0 bg-background z-20 shadow-sm"
              >
                发运数
              </TableHead>
              <TableHead
                v-if="showColWeight"
                class="px-1.5 py-1.5 text-center min-w-[80px] sticky top-0 bg-background z-20 shadow-sm"
              >
                发运量
              </TableHead>
              <TableHead
                v-if="showColUnitPrice"
                class="px-1.5 py-1.5 text-center min-w-[80px] sticky top-0 bg-background z-20 shadow-sm"
              >
                单价
              </TableHead>
              <TableHead
                v-if="showColTotalPrice"
                class="px-1.5 py-1.5 text-center min-w-[80px] sticky top-0 bg-background z-20 shadow-sm"
              >
                总价格
              </TableHead>
              <TableHead
                v-if="showColShipDate"
                class="px-1.5 py-1.5 text-left min-w-[140px] sticky top-0 bg-background z-20 shadow-sm"
              >
                发货日期
              </TableHead>
              <TableHead
                v-if="showColSettleDate"
                class="px-1.5 py-1.5 text-left min-w-[140px] sticky top-0 bg-background z-20 shadow-sm"
              >
                结算日期
              </TableHead>
              <TableHead
                v-if="showColUnshipDate"
                class="px-1.5 py-1.5 text-left min-w-[140px] sticky top-0 bg-background z-20 shadow-sm"
              >
                卸船日期
              </TableHead>
              <TableHead
                v-if="showColDelayDays"
                class="px-1.5 py-1.5 text-center min-w-[70px] sticky top-0 bg-background z-20 shadow-sm"
              >
                滞留天数
              </TableHead>
              <TableHead
                v-if="showColWaybillNo"
                class="px-1.5 py-1.5 text-left min-w-[140px] sticky top-0 bg-background z-20 shadow-sm"
              >
                运单号
              </TableHead>
              <TableHead
                v-if="showColTicketNo"
                class="px-1.5 py-1.5 text-left min-w-[100px] sticky top-0 bg-background z-20 shadow-sm"
              >
                票号
              </TableHead>
              <TableHead
                class="pl-1.5 pr-0 py-1.5 text-center w-20 sticky top-0 right-24 bg-muted z-30 shadow-[-8px_0_12px_-10px_hsl(var(--border))] hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors"
                :class="{ 'cursor-pointer': hasPrivilegePrice }"
                nowrap
                @click="hasPrivilegePrice && handleBatchCharge()"
              >
                <template v-if="hasPrivilegePrice">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <UiButton variant="secondary" size="sm" class="h-6 text-xs"> 预付 </UiButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>批量设置预付金额和油卡</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </template>
                <span v-else class="text-sm font-medium">预付</span>
              </TableHead>
              <TableHead
                class="px-0 py-1.5 text-center w-24 sticky top-0 right-0 min-w-24 bg-muted z-30 shadow-sm"
                nowrap
              >
                <!-- <UiButton v-if="hasPrivilegePrice" variant="secondary" size="sm" class="h-6 text-xs" @click="handleBatchReceipt"> -->
                <UiButton v-if="hasPrivilegePrice" variant="secondary" size="sm" class="h-6 text-xs">
                  回执信息
                </UiButton>
                <span v-else class="text-sm font-medium">回执信息</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <!-- 空状态 -->
            <TableRow v-if="pagedData.length === 0">
              <TableCell colspan="20" class="p-8 text-center text-muted-foreground">
                暂无数据，请调整筛选条件后重新查询
              </TableCell>
            </TableRow>

            <template
              v-for="(row, index) in pagedData"
              :key="row.isSubItem ? `sub-${row.display_key}` : `main-${row.waybill_no}`"
            >
              <!-- 主行 -->
              <TableRow
                v-if="!row.isSubItem"
                :data-row-key="`main-${row.waybill_no}`"
                class="border-b transition-colors"
                :class="{
                  'bg-orange-100 hover:bg-orange-200 cursor-pointer':
                    row.isVessel && !row.selected && !isInBasket(row) && !row.vehicleFiltered,
                  'hover:bg-muted/50 cursor-pointer': !row.isVessel && !row.selected && !isInBasket(row),
                  [getSelectedRowClass()]: row.selected,
                  'bg-orange-50 border-l-4 border-l-orange-500 opacity-60 cursor-not-allowed': isInBasket(row),
                  'bg-gray-50 opacity-60 cursor-not-allowed': row.vehicleFiltered,
                }"
                @click="handleRowClick(row)"
              >
                <TableCell class="px-1.5 py-1.5 flex items-center" nowrap>
                  <Checkbox
                    :model-value="row.selected || isInBasket(row)"
                    :disabled="isInBasket(row) || row.vehicleFiltered"
                    @update:model-value="(checked) => handleRowCheckboxChange(row, checked)"
                    @click.stop
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Toggle
                          :pressed="row.notNeedColor === 'darkgray'"
                          @click.stop="handleNotNeedSettle(row)"
                          size="sm"
                          class="ml-2 h-6 w-6 p-0"
                          :class="getNotNeedStarClass(row.notNeedColor)"
                        >
                          ★
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ row.notNeedColor === 'darkgray' ? '取消不需要结算' : '不需要结算' }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span
                    v-if="row.isVessel"
                    class="ml-1 cursor-pointer text-xl text-gray-500 hover:text-gray-800"
                    @click.stop="toggleExpand(row)"
                  >
                    {{ row.expanded ? '▼' : '▶' }}
                  </span>
                </TableCell>
                <TableCell v-if="showColState" class="px-1.5 py-1.5" v-html="row.statusHtml" />
                <TableCell v-if="showColVehicle" class="px-1.5 py-1.5">
                  <div>
                    <span class="inline-flex items-center gap-1">
                      {{ row.vehicle_vessel_name }}
                      <span
                        v-if="vehCategoryMap[row.vehicle_vessel_name]"
                        class="inline-flex items-center px-1 py-0 rounded border text-[10px] font-medium leading-tight"
                        :class="
                          vehCategoryMap[row.vehicle_vessel_name] === '自有'
                            ? 'bg-blue-100 text-blue-700 border-transparent'
                            : 'bg-orange-100 text-orange-700 border-transparent'
                        "
                        >{{ vehCategoryMap[row.vehicle_vessel_name] === '自有' ? '自' : '外' }}</span
                      >
                    </span>
                    <div class="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{{ row.waybill_no }}</span>
                      <span
                        v-if="isInBasket(row)"
                        class="inline-flex items-center gap-0.5 px-1 py-0 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                      >
                        <ShoppingCart class="w-2.5 h-2.5" />
                        已在结算篮
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell v-if="showColCarrier" class="px-1.5 py-1.5">
                  <Popover v-if="row.carrierOptions && row.carrierOptions.length > 1">
                    <PopoverTrigger as-child>
                      <button class="h-7 px-2 text-xs border rounded-md hover:bg-accent flex items-center justify-between w-full" @click.stop>
                        <span class="truncate">{{ row.selectedCarrierArr.length === 0 ? '选择' : row.selectedCarrierArr.length <= 2 ? row.selectedCarrierArr.join(',') : `${row.selectedCarrierArr.slice(0,2).join(',')} +${row.selectedCarrierArr.length - 2}` }}</span>
                        <ChevronsUpDown class="h-3 w-3 shrink-0 opacity-50 ml-1" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto min-w-[120px] p-1" align="start" @click.stop>
                      <div
                        v-for="opt in row.carrierOptions"
                        :key="opt"
                        class="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                        @click="toggleCarrier(row, opt)"
                      >
                        <div class="h-4 w-4 border rounded flex items-center justify-center" :class="row.selectedCarrierArr.includes(opt) ? 'bg-primary border-primary' : ''">
                          <Check v-if="row.selectedCarrierArr.includes(opt)" class="h-3 w-3 text-primary-foreground" />
                        </div>
                        {{ opt }}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span v-else>{{ row.carrierBoss }}</span>
                </TableCell>
                <TableCell v-if="showColBillName" class="px-1.5 py-1.5">
                  <div :class="row.shipCustomer ? '' : 'flex items-center'">
                    <span>{{ row.shipName }}</span>
                    <div v-if="row.shipCustomer" class="text-xs text-muted-foreground">{{ row.shipCustomer }}</div>
                  </div>
                </TableCell>
                <TableCell v-if="showColDestination" class="px-1.5 py-1.5">
                  {{ row.ship_from }}→{{ row.ship_to }}
                </TableCell>
                <TableCell v-if="showColQuantity" class="px-1.5 py-1.5 text-center">
                  {{ formatNumber(row.send_num) }}
                </TableCell>
                <TableCell v-if="showColWeight" class="px-1.5 py-1.5 text-center">
                  {{ formatNumber(row.total_weight) }}
                </TableCell>
                <TableCell v-if="showColUnitPrice" class="px-1.5 py-1.5 text-center">
                  <span v-if="hasPrivilegePrice" :class="row.priceColor">{{ row.unitPrice }}</span>
                  <span v-else class="blurred-price">***</span>
                </TableCell>
                <TableCell v-if="showColTotalPrice" class="px-1.5 py-1.5 text-center">
                  <span v-if="hasPrivilegePrice" :class="row.priceColor">{{ row.priceText }}</span>
                  <span v-else class="blurred-price">***</span>
                </TableCell>
                <TableCell v-if="showColShipDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.ship_date) }}
                </TableCell>
                <TableCell v-if="showColSettleDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.settle_date) }}
                </TableCell>
                <TableCell v-if="showColUnshipDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.unship_date, '') }}
                </TableCell>
                <TableCell v-if="showColDelayDays" class="px-1.5 py-1.5 text-center">
                  {{ row.delay_day }}
                </TableCell>
                <TableCell v-if="showColWaybillNo" class="px-1.5 py-1.5">
                  <div class="flex items-center gap-1.5">
                    <span>{{ row.waybill_no }}</span>
                    <span
                      v-if="isInBasket(row)"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                    >
                      <ShoppingCart class="w-2.5 h-2.5" />
                      已在结算篮
                    </span>
                  </div>
                </TableCell>
                <TableCell v-if="showColTicketNo" class="px-1.5 py-1.5">
                  {{ row.ticket_no || '-' }}
                </TableCell>
              <TableCell
                class="pl-1.5 pr-0 py-1.5 text-center text-xs sticky right-24 z-20 shadow-[-8px_0_12px_-10px_hsl(var(--border))]"
                :class="getStickyCellClass(row)"
                nowrap
              >
                {{ row.chargeText }}
              </TableCell>
              <TableCell
                class="px-0 py-1.5 text-center sticky right-0 w-24 min-w-24 z-20"
                :class="getStickyCellClass(row)"
                nowrap
              >
                  <div class="flex items-center justify-center gap-1">
                    <component
                      :is="row.receipt === 1 ? CheckSquare : Square"
                      class="w-4 h-4 cursor-pointer shrink-0"
                      :class="row.receipt === 1 ? 'text-green-600' : 'text-gray-400'"
                      @click.stop="handleToggleReceipt(row)"
                    />
                    <TooltipProvider v-if="row.has_receipt_image" :delay-duration="1000">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <UiButton
                            variant="ghost"
                            size="sm"
                            class="h-6 text-xs px-1.5 cursor-pointer"
                            @click.stop="handleViewReceipt(row)"
                          >
                            查看
                          </UiButton>
                        </TooltipTrigger>
                        <TooltipContent><p>查看或上传更多回执单</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider v-if="!row.has_receipt_image" :delay-duration="1000">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <UiButton
                            variant="ghost"
                            size="sm"
                            class="h-6 text-xs px-1.5 cursor-pointer"
                            @click.stop="handleUploadReceipt(row)"
                          >
                            上传
                          </UiButton>
                        </TooltipTrigger>
                        <TooltipContent><p>还未上传回执单，点击上传回执</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span v-if="row.remark" class="text-red-500 cursor-pointer" :title="row.remark">ⓘ</span>
                  </div>
                </TableCell>
              </TableRow>

              <!-- 子行（车辆） -->
              <TableRow
                v-if="row.isSubItem && row.parentExpanded"
                :data-row-key="`sub-${row.inner_waybill_no}`"
                class="border-b transition-colors"
                :class="{
                  'bg-green-100 hover:bg-green-200 cursor-pointer': !row.selected && !isInBasket(row),
                  [getSelectedRowClass()]: row.selected,
                  'bg-orange-50 border-l-4 border-l-orange-500 opacity-60 cursor-not-allowed': isInBasket(row),
                }"
                @click="handleSubRowClick(row)"
              >
                <TableCell class="px-1.5 py-1.5 pl-6 flex items-center" nowrap>
                  <Checkbox
                    :model-value="row.selected || isInBasket(row)"
                    :disabled="isInBasket(row)"
                    @update:model-value="(checked) => handleSubRowCheckboxChange(row, checked)"
                    @click.stop
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Toggle
                          :pressed="row.notNeedColor === 'darkgray'"
                          @click.stop="handleNotNeedSettle(row)"
                          size="sm"
                          class="ml-2 h-6 w-6 p-0"
                          :class="getNotNeedStarClass(row.notNeedColor)"
                        >
                          ★
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ row.notNeedColor === 'darkgray' ? '取消不需要结算' : '不需要结算' }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell v-if="showColState" class="px-1.5 py-1.5" v-html="row.statusHtml" />
                <TableCell v-if="showColVehicle" class="px-1.5 py-1.5">
                  <div>
                    <span>{{ row.veh_name }}</span>
                    <div class="text-xs text-muted-foreground">{{ row.inner_waybill_no }}</div>
                  </div>
                </TableCell>
                <TableCell v-if="showColCarrier" class="px-1.5 py-1.5">
                  <Popover v-if="row.carrierOptions && row.carrierOptions.length > 1">
                    <PopoverTrigger as-child>
                      <button class="h-7 px-2 text-xs border rounded-md hover:bg-accent flex items-center justify-between w-full" @click.stop>
                        <span class="truncate">{{ row.selectedCarrierArr.length === 0 ? '选择' : row.selectedCarrierArr.length <= 2 ? row.selectedCarrierArr.join(',') : `${row.selectedCarrierArr.slice(0,2).join(',')} +${row.selectedCarrierArr.length - 2}` }}</span>
                        <ChevronsUpDown class="h-3 w-3 shrink-0 opacity-50 ml-1" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto min-w-[120px] p-1" align="start" @click.stop>
                      <div
                        v-for="opt in row.carrierOptions"
                        :key="opt"
                        class="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                        @click="toggleCarrier(row, opt)"
                      >
                        <div class="h-4 w-4 border rounded flex items-center justify-center" :class="row.selectedCarrierArr.includes(opt) ? 'bg-primary border-primary' : ''">
                          <Check v-if="row.selectedCarrierArr.includes(opt)" class="h-3 w-3 text-primary-foreground" />
                        </div>
                        {{ opt }}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span v-else>{{ row.carrierBoss }}</span>
                </TableCell>
                <TableCell v-if="showColBillName" class="px-1.5 py-1.5">
                  <div :class="row.shipCustomer ? '' : 'flex items-center'">
                    <span>{{ row.shipName }}</span>
                    <div v-if="row.shipCustomer" class="text-xs text-muted-foreground">{{ row.shipCustomer }}</div>
                  </div>
                </TableCell>
                <TableCell v-if="showColDestination" class="px-1.5 py-1.5">
                  {{ row.ship_from }}→{{ row.ship_to }}
                </TableCell>
                <TableCell v-if="showColQuantity" class="px-1.5 py-1.5 text-center">
                  {{ formatNumber(row.send_num) }}
                </TableCell>
                <TableCell v-if="showColWeight" class="px-1.5 py-1.5 text-center">
                  {{ formatNumber(row.send_weight) }}
                </TableCell>
                <TableCell v-if="showColUnitPrice" class="px-1.5 py-1.5 text-center">
                  <span v-if="hasPrivilegePrice" :class="row.priceColor">{{ row.unitPrice }}</span>
                  <span v-else class="blurred-price">***</span>
                </TableCell>
                <TableCell v-if="showColTotalPrice" class="px-1.5 py-1.5 text-center">
                  <span v-if="hasPrivilegePrice" :class="row.priceColor">{{ row.priceText }}</span>
                  <span v-else class="blurred-price">***</span>
                </TableCell>
                <TableCell v-if="showColShipDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.ship_date) }}
                </TableCell>
                <TableCell v-if="showColSettleDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.settle_date) }}
                </TableCell>
                <TableCell v-if="showColUnshipDate" class="px-1.5 py-1.5">
                  {{ formatDate(row.unship_date, '') }}
                </TableCell>
                <TableCell v-if="showColDelayDays" class="px-1.5 py-1.5 text-center">
                  {{ row.delay_day }}
                </TableCell>
                <TableCell v-if="showColWaybillNo" class="px-1.5 py-1.5">
                  <div class="flex items-center gap-1.5">
                    <span>{{ row.inner_waybill_no }}</span>
                    <span
                      v-if="isInBasket(row)"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                    >
                      <ShoppingCart class="w-2.5 h-2.5" />
                      已在结算篮
                    </span>
                  </div>
                </TableCell>
                <TableCell v-if="showColTicketNo" class="px-1.5 py-1.5">
                  {{ row.ticket_no || '-' }}
                </TableCell>
              <TableCell
                class="pl-1.5 pr-0 py-1.5 text-center text-xs sticky right-24 z-20 shadow-[-8px_0_12px_-10px_hsl(var(--border))]"
                :class="getStickyCellClass(row)"
                nowrap
              >
                {{ row.chargeText }}
              </TableCell>
              <TableCell
                class="px-0 py-1.5 text-center sticky right-0 w-24 min-w-24 z-20"
                :class="getStickyCellClass(row)"
                nowrap
              >
                  <div class="flex items-center justify-center gap-0.5">
                    <component
                      :is="row.receipt === 1 ? CheckSquare : Square"
                      class="w-4 h-4 cursor-pointer shrink-0"
                      :class="row.receipt === 1 ? 'text-green-600' : 'text-gray-400'"
                      @click.stop="handleToggleReceipt(row)"
                    />
                    <TooltipProvider v-if="row.has_receipt_image" :delay-duration="300">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <UiButton
                            variant="ghost"
                            size="sm"
                            class="h-6 text-xs px-1.5 cursor-pointer"
                            @click.stop="handleViewReceipt(row)"
                          >
                            查看
                          </UiButton>
                        </TooltipTrigger>
                        <TooltipContent><p>查看或上传更多回执单</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider v-if="!row.has_receipt_image" :delay-duration="300">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <UiButton
                            variant="ghost"
                            size="sm"
                            class="h-6 text-xs px-1.5 cursor-pointer"
                            @click.stop="handleUploadReceipt(row)"
                          >
                            上传
                          </UiButton>
                        </TooltipTrigger>
                        <TooltipContent><p>还未上传回执单，点击上传回执</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span v-if="row.remark" class="text-red-500 cursor-pointer" :title="row.remark">ⓘ</span>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </table>
      </div>

      <!-- 分页控制 -->
      <div v-if="usePagination && tableData.length > 0" class="flex items-center justify-between px-2 py-2 text-sm">
        <span class="text-muted-foreground">
          共 {{ summaryTableRowCount > 0 ? summaryTableRowCount : tableData.length }} 条，第 {{ currentPage }}/{{
            totalPages
          }}
          页
        </span>
        <div class="flex items-center gap-2">
          <select
            :value="pageSize"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm"
            @change="
              ((pageSize = Number(($event.target as HTMLSelectElement).value)), (currentPage = 1), handleSearch())
            "
          >
            <option v-for="size in [50, 100, 200, 500]" :key="size" :value="size">{{ size }}条/页</option>
          </select>
          <div class="flex items-center gap-1">
            <UiButton
              variant="outline"
              size="icon"
              class="h-8 w-8"
              :disabled="loading || currentPage <= 1"
              @click="goToPage(1)"
            >
              <ChevronsLeft class="h-4 w-4" />
            </UiButton>
            <UiButton
              variant="outline"
              size="icon"
              class="h-8 w-8"
              :disabled="loading || currentPage <= 1"
              @click="previousPage()"
            >
              <ChevronLeft class="h-4 w-4" />
            </UiButton>
            <UiButton
              variant="outline"
              size="icon"
              class="h-8 w-8"
              :disabled="loading || currentPage >= totalPages"
              @click="nextPage()"
            >
              <ChevronRight class="h-4 w-4" />
            </UiButton>
            <UiButton
              variant="outline"
              size="icon"
              class="h-8 w-8"
              :disabled="loading || currentPage >= totalPages"
              @click="goToPage(totalPages)"
            >
              <ChevronsRight class="h-4 w-4" />
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 移动端卡片视图 -->
      <div class="lg:hidden space-y-2 flex-1 min-h-0 overflow-auto relative">
        <!-- 加载遮罩 -->
        <div
          v-if="loading"
          class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-30"
        >
          <div class="flex items-center gap-2 text-muted-foreground">
            <Loader2 class="w-5 h-5 animate-spin" />
            <span>{{ searchLoadingText }}</span>
          </div>
        </div>

        <!-- 无数据 -->
        <div v-if="pagedData.length === 0 && !loading" class="border rounded-lg p-8 text-center text-muted-foreground">
          暂无数据，请调整筛选条件后重新查询
        </div>

        <template
          v-for="(row, index) in pagedData"
          :key="row.isSubItem ? `m-sub-${row.display_key}` : `m-main-${row.waybill_no}`"
        >
          <!-- 主行卡片 -->
          <div
            v-if="!row.isSubItem"
            :data-row-key="`main-${row.waybill_no}`"
            class="relative flex items-center gap-3 p-3 rounded-lg border transition-colors"
            :class="{
              'bg-orange-50/60 border-l-4 border-l-orange-400':
                row.isVessel && !row.selected && !isInBasket(row) && !row.vehicleFiltered,
              'bg-muted/30 hover:border-primary/30': !row.isVessel && !row.selected && !isInBasket(row),
              [getSelectedRowClass()]: row.selected && !isInBasket(row),
              'bg-orange-50 border-l-4 border-l-orange-500 opacity-60': isInBasket(row),
              'bg-gray-50 opacity-60 cursor-not-allowed': row.vehicleFiltered,
            }"
            @click="handleRowClick(row)"
          >
            <!-- 右上角绝对定位：查看/上传 -->
            <span
              v-if="!isInBasket(row) && row.has_receipt_image"
              class="absolute top-2 right-2 text-sm text-primary font-medium cursor-pointer"
              @click.stop="handleViewReceipt(row)"
              >查看</span
            >
            <span
              v-if="!isInBasket(row) && !row.has_receipt_image"
              class="absolute top-2 right-2 text-sm text-primary font-medium cursor-pointer"
              @click.stop="handleUploadReceipt(row)"
              >上传</span
            >

            <!-- 已在结算篮：只显示购物车icon -->
            <template v-if="isInBasket(row)">
              <ShoppingCart class="w-5 h-5 text-orange-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <span class="font-medium text-sm truncate">{{ row.vehicle_vessel_name }}</span>
                <span
                  v-if="vehCategoryMap[row.vehicle_vessel_name]"
                  class="inline-flex items-center px-1 py-0 rounded border text-[10px] font-medium leading-tight"
                  :class="
                    vehCategoryMap[row.vehicle_vessel_name] === '自有'
                      ? 'bg-blue-100 text-blue-700 border-transparent'
                      : 'bg-orange-100 text-orange-700 border-transparent'
                  "
                  >{{ vehCategoryMap[row.vehicle_vessel_name] === '自有' ? '自' : '外' }}</span
                >
                <span class="ml-2 text-xs text-orange-500">已在结算篮</span>
              </div>
              <button
                class="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0"
                title="从结算篮移除"
                @click.stop="removeFromBasket(row)"
              >
                <X class="w-4 h-4" />
              </button>
            </template>

            <!-- 正常状态 -->
            <template v-else>
              <Checkbox
                :model-value="row.selected"
                :disabled="row.vehicleFiltered"
                class="shrink-0"
                @update:model-value="(checked) => handleRowCheckboxChange(row, checked)"
                @click.stop
              />
              <span
                class="shrink-0 cursor-pointer"
                :class="getNotNeedStarClass(row.notNeedColor)"
                @click.stop="handleNotNeedSettle(row)"
                >★</span
              >

              <VesselCardContent
                :name="row.vehicle_vessel_name"
                :category="vehCategoryMap[row.vehicle_vessel_name]"
                :status="getRowState(row)"
                :status-class="getStatusTagClass(getRowState(row))"
                :charge-text="row.chargeText"
                :remark="row.remark"
                :ship-name="row.shipName"
                :ship-customer="row.shipCustomer"
                :ship-from="row.ship_from"
                :ship-to="row.ship_to"
                :ship-date="formatDate(row.ship_date)"
                :send-num="row.send_num ? formatNumber(row.send_num) : undefined"
                :weight="`${formatNumber(row.total_weight)}吨`"
                :price="hasPrivilegePrice ? `${row.unitPrice}/${row.priceText}` : undefined"
                :price-class="row.priceColor"
                :show-expand="row.isVessel"
                :expanded="row.expanded"
                :card-expanded="expandedCards.has(row.waybill_no)"
                :waybill-no="row.waybill_no"
                :ticket-no="row.ticket_no"
                :charge-cash="row.charge_cash"
                :charge-oil="row.charge_oil"
                :delay-day="row.delay_day"
                :settle-date="formatDate(row.settle_date, '')"
                :unship-date="formatDate(row.unship_date, '')"
                :pay-date="formatDate(row.pay_date, '')"
                :carrier-boss="row.carrierBoss"
                @toggle-expand="toggleExpand(row)"
                @toggle-card-expand="toggleCardExpand(row.waybill_no)"
              />

              <!-- 右侧：回执checkbox -->
              <div class="flex items-center shrink-0" @click.stop="handleToggleReceipt(row)">
                <component
                  :is="row.receipt === 1 ? CheckSquare : Square"
                  class="w-5 h-5 cursor-pointer"
                  :class="row.receipt === 1 ? 'text-green-600' : 'text-gray-400'"
                />
              </div>
            </template>
          </div>

          <!-- 子行卡片（车辆） -->
          <div
            v-if="row.isSubItem && row.parentExpanded"
            :data-row-key="`sub-${row.inner_waybill_no}`"
            class="ml-4 relative flex items-center gap-3 p-3 rounded-lg border transition-colors"
            :class="{
              'bg-green-50/60 border-l-4 border-l-green-400': !row.selected && !isInBasket(row),
              [getSelectedRowClass()]: row.selected && !isInBasket(row),
              'bg-orange-50 border-l-4 border-l-orange-500 opacity-60': isInBasket(row),
            }"
            @click="handleSubRowClick(row)"
          >
            <!-- 右上角绝对定位：查看/上传 -->
            <span
              v-if="!isInBasket(row) && row.has_receipt_image"
              class="absolute top-2 right-2 text-sm text-primary font-medium cursor-pointer"
              @click.stop="handleViewReceipt(row)"
              >查看</span
            >
            <span
              v-if="!isInBasket(row) && !row.has_receipt_image"
              class="absolute top-2 right-2 text-sm text-primary font-medium cursor-pointer"
              @click.stop="handleUploadReceipt(row)"
              >上传</span
            >

            <!-- 已在结算篮：只显示购物车icon -->
            <template v-if="isInBasket(row)">
              <ShoppingCart class="w-5 h-5 text-orange-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <span class="font-medium text-sm truncate">{{ row.veh_name }}</span>
                <span class="ml-2 text-xs text-orange-500">已在结算篮</span>
              </div>
              <button
                class="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0"
                title="从结算篮移除"
                @click.stop="removeFromBasket(row)"
              >
                <X class="w-4 h-4" />
              </button>
            </template>

            <!-- 正常状态 -->
            <template v-else>
              <Checkbox
                :model-value="row.selected"
                class="shrink-0"
                @update:model-value="(checked) => handleSubRowCheckboxChange(row, checked)"
                @click.stop
              />
              <span
                class="shrink-0 cursor-pointer"
                :class="getNotNeedStarClass(row.notNeedColor)"
                @click.stop="handleNotNeedSettle(row)"
                >★</span
              >

              <VesselCardContent
                :name="row.veh_name"
                :status="getRowState(row)"
                :status-class="getStatusTagClass(getRowState(row))"
                :charge-text="row.chargeText"
                :remark="row.remark"
                :ship-name="row.shipName"
                :ship-customer="row.shipCustomer"
                :ship-from="row.ship_from"
                :ship-to="row.ship_to"
                :ship-date="formatDate(row.ship_date)"
                :send-num="row.send_num ? formatNumber(row.send_num) : undefined"
                :weight="`${formatNumber(row.send_weight)}吨`"
                :price="hasPrivilegePrice ? `${row.unitPrice}/${row.priceText}` : undefined"
                :price-class="row.priceColor"
                :card-expanded="expandedCards.has(row.display_key)"
                :waybill-no="row.inner_waybill_no"
                :ticket-no="row.ticket_no"
                :charge-cash="row.charge_cash"
                :charge-oil="row.charge_oil"
                :delay-day="row.delay_day"
                :settle-date="formatDate(row.settle_date, '')"
                :unship-date="formatDate(row.unship_date, '')"
                :pay-date="formatDate(row.pay_date, '')"
                :carrier-boss="row.carrierBoss"
                @toggle-card-expand="toggleCardExpand(row.display_key)"
              />

              <!-- 右侧：回执checkbox -->
              <div class="flex items-center shrink-0" @click.stop="handleToggleReceipt(row)">
                <component
                  :is="row.receipt === 1 ? CheckSquare : Square"
                  class="w-5 h-5 cursor-pointer"
                  :class="row.receipt === 1 ? 'text-green-600' : 'text-gray-400'"
                />
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- 对话框组件 -->
      <VesselPriceInputDialog ref="priceInputDialog" @confirm="handlePriceConfirm" />
      <VesselBatchPriceInputDialog ref="batchPriceInputDialog" @confirm="handleBatchPriceConfirm" />
      <VesselDelayInfoDialog ref="delayInfoDialog" @confirm="handleDelayInfoConfirm" />
      <VesselDetailDialog ref="detailDialog" />
      <VesselPrintDialog ref="printDialog" @confirm="handlePrintConfirm" />
      <VesselReceiptImageDialog ref="receiptImageDialog" @confirm="handleUploadReceiptConfirm" />
      <VesselUploadReceiptDialog ref="uploadReceiptDialog" @confirm="handleUploadReceiptConfirm" />

      <!-- 不需要结算确认对话框 -->
      <AlertDialog v-model:open="showNotNeedSettleDialog">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription class="space-y-3">
              <p class="font-medium">
                {{
                  pendingNotNeedSettleRow?.notNeedColor === 'red'
                    ? '确定要将此运单设置为"不需要结算"吗？'
                    : '确定要取消"不需要结算"状态吗？'
                }}
              </p>
              <div v-if="pendingNotNeedSettleRow" class="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <span class="text-muted-foreground">运单号：</span>
                    <span class="font-medium">{{
                      pendingNotNeedSettleRow.isSubItem
                        ? pendingNotNeedSettleRow.inner_waybill_no
                        : pendingNotNeedSettleRow.waybill_no
                    }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">车船号：</span>
                    <span class="font-medium">{{
                      pendingNotNeedSettleRow.isSubItem
                        ? pendingNotNeedSettleRow.veh_name
                        : pendingNotNeedSettleRow.vehicle_vessel_name
                    }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">开单名称：</span>
                    <span class="font-medium">{{ pendingNotNeedSettleRow.shipName }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">发运块数：</span>
                    <span class="font-medium">{{ formatNumber(pendingNotNeedSettleRow.send_num) }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">发运重量：</span>
                    <span class="font-medium"
                      >{{
                        formatNumber(
                          pendingNotNeedSettleRow.isSubItem
                            ? pendingNotNeedSettleRow.send_weight
                            : pendingNotNeedSettleRow.total_weight,
                        )
                      }}
                      吨</span
                    >
                  </div>
                  <div>
                    <span class="text-muted-foreground">发货日期：</span>
                    <span class="font-medium">{{ formatDate(pendingNotNeedSettleRow.ship_date) }}</span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction @click="confirmNotNeedSettle">确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 付款票号对话框 -->
      <AlertDialog v-model:open="payTicketDialog">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认付款</AlertDialogTitle>
            <AlertDialogDescription>
              请输入票号（可选）：
              <Input v-model="ticketNo" placeholder="票号" class="mt-2" @keyup.enter="handleConfirmPay" />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="payTicketDialog = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="handleConfirmPay">确认付款</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 大数据量切换全部警告 -->
      <AlertDialog v-model:open="showLargeDataWarning">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>数据量较大</AlertDialogTitle>
            <AlertDialogDescription>
              当前共
              {{ serverTotalCount }}
              条记录，全部展示可能导致浏览器卡顿甚至卡死，请谨慎操作。建议缩小日期范围后再查看全部。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction @click="doSwitchToAll()">确定查看全部</AlertDialogAction>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 结算篮组件 -->
      <SettleBasket
        v-model:open="showBasket"
        :items="basketItems"
        :statistics="basketStatistics"
        :is-public="isPublic"
        @settle="handleSettleFromBasket"
        @remove="removeFromBasket"
        @clear="clearBasket"
        @export="handleExportFromBasket"
        @price-input="handlePriceInputFromBasket"
        @toggle-public="togglePublic"
      >
        <template #item="{ item }">
          <VesselCardContent
            :name="item.veh_name || item.vehicle_vessel_name"
            :category="vehCategoryMap[item.veh_name || item.vehicle_vessel_name]"
            :status="item.isSubItem ? item.state || '' : item.vessel_settle_state || ''"
            :status-class="getStatusTagClass(item.isSubItem ? item.state || '' : item.vessel_settle_state || '')"
            :charge-text="item.chargeText"
            :remark="item.remark"
            :ship-name="item.shipName || item.ship_name"
            :ship-customer="item.shipCustomer"
            :ship-from="item.ship_from"
            :ship-to="item.ship_to"
            :ship-date="formatDate(item.ship_date)"
            :send-num="`${item.send_num || ''}`"
            :weight="`${formatNumber(item.send_weight)}吨`"
            :price="
              hasPrivilegePrice
                ? `${formatNumber(item.vessel_price || 0)}/${formatNumber((item.vessel_price || 0) * item.send_weight)}`
                : undefined
            "
            price-class="text-blue-600"
            :card-expanded="basketExpandedItems.has(getBasketItemKey(item))"
            :waybill-no="item.isSubItem ? item.inner_waybill_no : item.waybill_no"
            :ticket-no="item.ticket_no"
            :charge-cash="item.charge_cash"
            :charge-oil="item.charge_oil"
            :delay-day="item.delay_day"
            :settle-date="formatDate(item.settle_date)"
            :unship-date="formatDate(item.unship_date, '')"
            :carrier-boss="item.carrierBoss"
            @toggle-card-expand="toggleBasketCardExpand(item)"
          />
        </template>
      </SettleBasket>

      <!-- 公开篮面板（查看其他用户的公开结算篮） -->
      <PublicBasketsDialog
        v-model:open="showPublicBaskets"
        :items="publicItems"
        :statistics="publicStatistics"
        @export="handleExportFromPublicBaskets"
        @price-input="handlePriceInputFromPublicBaskets"
      >
        <template #item="{ item }">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-medium text-sm">{{ item.veh_name || item.vehicle_vessel_name }}</span>
              <span class="text-xs text-muted-foreground">{{ item.shipName || item.ship_name }}</span>
              <span
                v-if="item._basketOwner"
                class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
                >{{ item._basketOwner }}</span
              >
            </div>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{{ item.ship_from }} → {{ item.ship_to }}</span>
              <span>{{ formatNumber(item.send_weight) }}吨</span>
              <span v-if="item.vessel_price" class="text-blue-600"
                >¥{{ formatNumber(item.vessel_price * item.send_weight) }}</span
              >
            </div>
          </div>
        </template>
      </PublicBasketsDialog>

      <!-- 飞行动画元素 -->
      <Teleport to="body">
        <div
          v-for="item in flyingItems"
          :key="item.id"
          class="flying-item"
          :style="{
            '--start-x': `${item.x}px`,
            '--start-y': `${item.y}px`,
            '--end-x': `${item.targetX}px`,
            '--end-y': `${item.targetY}px`,
          }"
        >
          <div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
            <ShoppingCart class="w-4 h-4 text-white" />
          </div>
        </div>
      </Teleport>

      <!-- 导出对话框 -->
      <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />

      <Dialog :open="receiptDownloadDialogOpen" :modal="false" @update:open="(open) => !open && handleCloseReceiptDownloadDialog()">
        <DialogContent class="sm:max-w-[560px]" :show-close-button="false">
          <DialogHeader>
            <div class="flex items-start justify-between gap-4">
              <div>
                <DialogTitle class="flex items-center gap-2">
                  <Loader2 v-if="isReceiptDownloadRunning" class="h-4 w-4 animate-spin text-primary" />
                  <Download v-else class="h-4 w-4 text-primary" />
                  <span>
                    {{
                      isReceiptDownloadRunning
                        ? '正在下载回执图片'
                        : receiptDownloadState.status === 'done'
                          ? '回执图片下载完成'
                          : receiptDownloadState.status === 'cancelled'
                            ? '回执图片下载已终止'
                          : '回执图片下载结果'
                    }}
                  </span>
                </DialogTitle>
                <DialogDescription class="mt-1">
                  <template v-if="receiptDownloadMode === 'directory'">
                    下载目录：{{ receiptDownloadDirectoryName || '未选择' }}
                  </template>
                  <template v-else>
                    当前环境不支持直接选择本机目录，已自动切换为 ZIP 下载：{{ receiptDownloadDirectoryName }}
                  </template>
                </DialogDescription>
              </div>
              <div class="flex items-center gap-2">
                <UiButton variant="outline" size="sm" @click="handleMinimizeReceiptDownloadDialog">
                  最小化
                </UiButton>
                <UiButton variant="ghost" size="icon" class="h-8 w-8" @click="handleCloseReceiptDownloadDialog">
                  <X class="h-4 w-4" />
                </UiButton>
              </div>
            </div>
          </DialogHeader>

          <div class="space-y-4">
            <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div class="h-full bg-primary transition-all" :style="{ width: `${receiptDownloadPercent}%` }" />
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div class="rounded-md border bg-muted/30 p-3">
                <div class="text-xs text-muted-foreground">总数</div>
                <div class="mt-1 font-medium">{{ receiptDownloadState.total }}</div>
              </div>
              <div class="rounded-md border bg-muted/30 p-3">
                <div class="text-xs text-muted-foreground">已完成</div>
                <div class="mt-1 font-medium text-primary">{{ receiptDownloadState.completed }}</div>
              </div>
              <div class="rounded-md border bg-muted/30 p-3">
                <div class="text-xs text-muted-foreground">失败</div>
                <div class="mt-1 font-medium text-red-600">{{ receiptDownloadState.failed }}</div>
              </div>
              <div class="rounded-md border bg-muted/30 p-3">
                <div class="text-xs text-muted-foreground">进度</div>
                <div class="mt-1 font-medium">{{ receiptDownloadPercent }}%</div>
              </div>
            </div>

            <div class="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
              <div v-if="receiptDownloadState.currentFile">当前文件：{{ receiptDownloadState.currentFile }}</div>
              <div v-else class="text-muted-foreground">
                {{ isReceiptDownloadRunning ? '准备下载中...' : '当前没有正在处理的文件' }}
              </div>
              <div v-if="receiptDownloadState.lastError" class="text-red-600">
                最近错误：{{ receiptDownloadState.lastError }}
              </div>
            </div>

            <div v-if="receiptDownloadDirectoryOpen" class="rounded-md border bg-muted/40 p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="text-sm font-medium">{{ receiptDownloadMode === 'directory' ? '目录文件' : 'ZIP 文件清单' }}</div>
                <div class="text-xs text-muted-foreground">{{ receiptDownloadVisibleFiles.length }} 个文件</div>
              </div>
              <div v-if="receiptDownloadVisibleFiles.length === 0" class="text-sm text-muted-foreground">
                {{ receiptDownloadMode === 'directory' ? '当前目录里还没有已写入的回执图片' : '当前还没有已打包的回执图片' }}
              </div>
              <div v-else class="max-h-48 overflow-y-auto space-y-1 text-sm">
                <div
                  v-for="fileName in receiptDownloadVisibleFiles"
                  :key="fileName"
                  class="rounded-sm px-2 py-1 hover:bg-background"
                >
                  {{ fileName }}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter class="gap-2 sm:justify-between">
            <UiButton
              variant="outline"
              :disabled="receiptDownloadMode === 'directory' ? !receiptDownloadDirectoryHandle : receiptDownloadState.recentFiles.length === 0"
              @click="handleViewReceiptDownloadDirectory"
            >
              {{
                receiptDownloadMode === 'directory'
                  ? receiptDownloadDirectoryOpen
                    ? '收起下载目录'
                    : '查看下载目录'
                  : receiptDownloadDirectoryOpen
                    ? '收起 ZIP 清单'
                    : '查看 ZIP 清单'
              }}
            </UiButton>
            <div class="flex items-center gap-2">
              <UiButton
                v-if="isReceiptDownloadRunning"
                variant="destructive"
                @click="handleCancelReceiptDownload"
              >
                终止下载
              </UiButton>
              <UiButton
                v-if="!isReceiptDownloadRunning"
                variant="default"
                @click="handleCloseReceiptDownloadDialog"
              >
                我知道了
              </UiButton>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        v-if="hasReceiptDownloadTask && receiptDownloadMinimized"
        class="fixed right-4 bottom-4 z-50"
      >
        <button
          class="flex min-w-[220px] items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg transition hover:border-primary/40"
          @click="handleOpenReceiptDownloadDialog"
        >
          <Loader2 v-if="isReceiptDownloadRunning" class="h-4 w-4 animate-spin text-primary" />
          <Download v-else class="h-4 w-4 text-primary" />
          <div class="min-w-0 flex-1 text-left">
          <div class="text-sm font-medium">
              {{ isReceiptDownloadRunning ? '回执下载进行中' : isReceiptDownloadCancelled ? '回执下载已终止' : '回执下载已完成' }}
            </div>
            <div class="text-xs text-muted-foreground">
              {{ receiptDownloadState.completed }}/{{ receiptDownloadState.total }}
              <template v-if="receiptDownloadState.failed > 0">，失败 {{ receiptDownloadState.failed }}</template>
            </div>
          </div>
          <span
            v-if="isReceiptDownloadRunning"
            class="shrink-0 text-sm font-medium text-red-600 hover:text-red-600"
            @click.stop="handleCancelReceiptDownload"
          >
            终止
          </span>
          <div class="text-sm font-medium text-primary">{{ receiptDownloadPercent }}%</div>
        </button>
      </div>

      <!-- 确认对话框：结算篮价格输入 -->
      <ConfirmDialog
        v-model:open="basketPriceDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBasketPrice"
      >
        <template #title>输入价格</template>
        <template #description>
          <div class="space-y-2">
            <p>结算篮中有 {{ basketPriceDialogData.length }} 条记录还没有输入价格</p>
            <p class="mt-4">是否现在输入价格？</p>
            <p class="text-sm text-muted-foreground">点击"确定"打开价格输入对话框</p>
          </div>
        </template>
      </ConfirmDialog>

      <!-- 确认对话框：批量回执 -->
      <ConfirmDialog
        v-model:open="batchReceiptDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBatchReceipt"
      >
        <template #title>批量回执</template>
        <template #description>
          <p>您确定要批量设置回执吗？</p>
        </template>
      </ConfirmDialog>

      <!-- 确认对话框：批量不结算 -->
      <ConfirmDialog
        v-model:open="batchNotNeedDialog"
        cancel-button-text="取消"
        confirm-button-text="确定"
        @confirm="handleConfirmBatchNotNeed"
      >
        <template #title>批量不结算</template>
        <template #description>
          <p>您确定要批量不结算操作吗？</p>
        </template>
      </ConfirmDialog>
    </div>
  </BasicPage>
</template>

<style scoped>
/* 上传回执成功后定位高亮 */
.vessel-row-flash {
  animation: vessel-row-flash 1.6s ease-out;
}
@keyframes vessel-row-flash {
  0%, 100% { background-color: transparent; }
  20%, 60% { background-color: rgba(250, 204, 21, 0.55); }
}

/* 价格模糊效果（无权限查看价格时） */
.blurred-price {
  position: relative;
  display: inline-block;
  color: transparent;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
  letter-spacing: 2px;
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 10px;
  border-radius: 5px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* 飞行动画 */
.flying-item {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  left: var(--start-x);
  top: var(--start-y);
  transform: translate(-50%, -50%);
  animation: fly-to-basket 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fly-to-basket {
  0% {
    left: var(--start-x);
    top: var(--start-y);
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.8);
  }
  100% {
    left: var(--end-x);
    top: var(--end-y);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
}
</style>
