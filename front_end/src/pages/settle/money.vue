<script setup lang="ts">
import dayjs from 'dayjs'
import { Banknote, Download, Filter as FilterIcon, List, Undo2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { DatePicker } from '@/components/ui/date-picker'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getMoneyList, updateMoney, updateRealPrice } from '@/services/api/money.api'
import { getSettleDetail } from '@/services/api/ticket.api'

import { formatNumber, sortByOrder, toExcelDate, toExcelNum } from '@/utils/format'
import type { DisplayMode, SettleRecord } from './ticket-types'

const route = useRoute()
const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

// 自有车模式（从路由参数读取）
const isSelfOwnedMode = computed(() => route.query.selfOwned === 'true')

// 获取默认日期区间（一年前到今天，返回字符串格式）
function getDefaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 1)

  // 转换为 YYYY-MM-DD 格式
  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return { start: formatDate(start), end: formatDate(end) }
}

// 状态管理
const displayMode = ref<DisplayMode>('ticket')
const allSettles = ref<SettleRecord[]>([])
const displaySettles = ref<SettleRecord[]>([])
const selectedSettles = ref<SettleRecord[]>([])
const loading = ref(false)
const showFilter = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)

// 过滤参数
const filterBillingName = ref('')
const filterSerialNumber = ref('')
const filterShipTo = ref('')
const defaultDateRange = getDefaultDateRange()
const filterTicketDateStart = ref<string>(defaultDateRange.start)
const filterTicketDateEnd = ref<string>(defaultDateRange.end)

// 实收价格对话框
const showRealPriceDialog = ref(false)
const realPrice = ref('')

// 页面初始化
onMounted(() => {
  loadData()
})

// 监听显示模式变化，实时加载数据
watch(displayMode, () => {
  loadData()
})

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const result = await getMoneyList({
      display_mode: displayMode.value,
      selfOwned: isSelfOwnedMode.value ? '1' : '0',
    })
    if (result.ok) {
      allSettles.value = result.settles
      updateDisplaySettles()
    } else {
      toast.error('获取数据失败')
    }
  } catch (error: any) {
    toast.error(error.message || '获取数据失败')
  } finally {
    loading.value = false
  }
}

// 从数据中提取过滤选项
const filterOptions = computed(() => {
  const billingNames = new Set<string>()
  const serialNumbers = new Set<string>()
  const shipTos = new Set<string>()

  allSettles.value.forEach((settle) => {
    if (settle.billing_name) billingNames.add(settle.billing_name)
    if (settle.serial_number) serialNumbers.add(settle.serial_number)
    if (settle.ship_to) shipTos.add(settle.ship_to)
  })

  return {
    billingNames: Array.from(billingNames).sort(),
    serialNumbers: Array.from(serialNumbers).sort(),
    shipTos: Array.from(shipTos).sort(),
  }
})

// 本地搜索过滤选项（用于 SearchableCombobox 的分页搜索）
function localFilterSearch(items: string[], search: string, limit: number, page: number) {
  let filtered = items
  if (search) {
    filtered = filtered.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
  }
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit).map((item) => ({ name: item }))
  return Promise.resolve({ ok: true as const, data, total: filtered.length })
}

function searchFilterBillingNames(search: string, limit: number, page: number) {
  return localFilterSearch(filterOptions.value.billingNames, search, limit, page)
}

function searchFilterSerialNumbers(search: string, limit: number, page: number) {
  return localFilterSearch(filterOptions.value.serialNumbers, search, limit, page)
}

function searchFilterShipTos(search: string, limit: number, page: number) {
  return localFilterSearch(filterOptions.value.shipTos, search, limit, page)
}

// 更新显示的结算列表
function updateDisplaySettles() {
  if (
    filterTicketDateStart.value &&
    filterTicketDateEnd.value &&
    new Date(filterTicketDateStart.value) > new Date(filterTicketDateEnd.value)
  ) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  let filtered = allSettles.value

  // 应用过滤条件
  if (filterBillingName.value) {
    filtered = filtered.filter((s) => s.billing_name === filterBillingName.value)
  }
  if (filterSerialNumber.value) {
    filtered = filtered.filter((s) => s.serial_number === filterSerialNumber.value)
  }
  if (filterShipTo.value) {
    filtered = filtered.filter((s) => s.ship_to === filterShipTo.value)
  }

  // 日期过滤（未回款用 ticket_date，已回款用 return_money_date）
  if (filterTicketDateStart.value && filterTicketDateEnd.value) {
    filtered = filtered.filter((s) => {
      const dateValue = displayMode.value === 'money' ? s.return_money_date : s.ticket_date
      if (!dateValue) return false
      const d = new Date(dateValue)
      const startDate = new Date(filterTicketDateStart.value)
      const endDate = new Date(filterTicketDateEnd.value)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      return d >= startDate && d <= endDate
    })
  }

  // 按日期降序排列（最新的在前面）
  // 使用 [...filtered] 避免原地修改 allSettles
  displaySettles.value = [...filtered].sort((a, b) => {
    const dateA = new Date(a.return_money_date || a.ticket_date || a.settle_date || 0).getTime()
    const dateB = new Date(b.return_money_date || b.ticket_date || b.settle_date || 0).getTime()
    return dateB - dateA
  })
  selectedSettles.value = []
  currentPage.value = 1
}

// 分页
const totalPages = computed(() => Math.ceil(displaySettles.value.length / pageSize.value))
const pagedSettles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return displaySettles.value.slice(start, start + pageSize.value)
})

// 重置过滤条件
function resetFilter() {
  filterBillingName.value = ''
  filterSerialNumber.value = ''
  filterShipTo.value = ''
  const defaultRange = getDefaultDateRange()
  filterTicketDateStart.value = defaultRange.start
  filterTicketDateEnd.value = defaultRange.end
  updateDisplaySettles()
}

function disableStartDate(date: Date) {
  if (filterTicketDateEnd.value) {
    const end = new Date(filterTicketDateEnd.value)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (filterTicketDateStart.value) {
    const start = new Date(filterTicketDateStart.value)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

// 统计信息
const statistics = computed(() => {
  let totalNum = 0
  let totalWeight = 0
  let totalAmount = 0

  displaySettles.value.forEach((settle) => {
    totalNum += settle.ship_number || 0
    totalWeight += settle.ship_weight || 0
    totalAmount += settle.price || 0
  })

  return {
    count: displaySettles.value.length,
    totalNum,
    totalWeight,
    totalAmount,
  }
})

// 是否全选
const allSelected = computed(() => {
  return displaySettles.value.length > 0 && selectedSettles.value.length === displaySettles.value.length
})

// 切换全选
function toggleAll() {
  if (allSelected.value) {
    selectedSettles.value = []
  } else {
    selectedSettles.value = [...displaySettles.value]
  }
}

// 切换单行选择
function toggleSettle(settle: SettleRecord) {
  const index = selectedSettles.value.findIndex((s) => s._id === settle._id)
  if (index >= 0) {
    const newSelected = [...selectedSettles.value]
    newSelected.splice(index, 1)
    selectedSettles.value = newSelected
  } else {
    selectedSettles.value = [...selectedSettles.value, settle]
  }
}

// 判断是否选中
function isSelected(settle: SettleRecord) {
  return selectedSettles.value.some((s) => s._id === settle._id)
}

// 切换显示模式
function switchDisplayMode(mode: DisplayMode) {
  if (displayMode.value !== mode) {
    displayMode.value = mode
    loadData()
  }
}

// 回款
async function handleReturnMoney() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要回款的记录')
    return
  }

  const ticketedSettles = selectedSettles.value.filter((s) => s.status === '已开票')
  if (ticketedSettles.length === 0) {
    toast.warning('选中的记录中没有已开票的记录')
    return
  }

  const confirmed = window.confirm('确定要对选中的记录进行回款操作吗？')
  if (!confirmed) return

  loading.value = true
  try {
    const result = await updateMoney(
      ticketedSettles.map((settle) => ({
        _id: settle._id,
        return_money_date: new Date(),
        return_person: 'current_user', // TODO: 从用户信息获取
        status: '已回款',
      })),
    )

    if (result.ok) {
      toast.success('回款成功')
      loadData()
    } else {
      toast.error(result.message || '回款失败')
    }
  } catch (error: any) {
    toast.error(error.message || '回款失败')
  } finally {
    loading.value = false
  }
}

// 回款取消
async function handleCancelReturnMoney() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要取消回款的记录')
    return
  }

  const moneyedSettles = selectedSettles.value.filter((s) => s.status === '已回款')
  if (moneyedSettles.length === 0) {
    toast.warning('选中的记录中没有已回款的记录')
    return
  }

  const confirmed = window.confirm('确定要取消所选记录的回款状态吗？')
  if (!confirmed) return

  loading.value = true
  try {
    const result = await updateMoney(
      moneyedSettles.map((settle) => ({
        _id: settle._id,
        return_money_date: new Date(),
        return_person: '',
        status: '已开票',
      })),
    )

    if (result.ok) {
      toast.success('取消回款成功')
      loadData()
    } else {
      toast.error(result.message || '取消回款失败')
    }
  } catch (error: any) {
    toast.error(error.message || '取消回款失败')
  } finally {
    loading.value = false
  }
}

// 实收价格输入
function handleRealPriceInput() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择记录')
    return
  }
  if (selectedSettles.value.length > 1) {
    toast.warning('一次只能对一条记录输入实收价格')
    return
  }

  const settle = selectedSettles.value[0]
  realPrice.value = settle.real_price ? settle.real_price.toString() : settle.price.toString()
  showRealPriceDialog.value = true
}

// 确认实收价格
async function confirmRealPrice() {
  const settle = selectedSettles.value[0]
  const price = Number.parseFloat(realPrice.value)

  if (isNaN(price) || price <= 0) {
    toast.error('请输入有效的价格')
    return
  }

  loading.value = true
  try {
    const result = await updateRealPrice({
      sno: settle.serial_number,
      price,
    })

    if (result.ok) {
      toast.success('实收价格更新成功')
      showRealPriceDialog.value = false
      loadData()
    } else {
      toast.error(result.message || '更新失败')
    }
  } catch (error: any) {
    toast.error(error.message || '更新失败')
  } finally {
    loading.value = false
  }
}

// 导出
function handleExport() {
  if (displaySettles.value.length === 0) {
    toast.warning('没有可导出的数据')
    return
  }

  const fmtDate = (d: string) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-')

  const columns = [
    { header: '结算号', key: 'serial_number' },
    { header: '开单名称', key: 'billing_name' },
    { header: '目的地', key: 'ship_to' },
    { header: '块数', key: 'ship_number' },
    { header: '重量', key: 'ship_weight', type: 'weight' as const },
    { header: '金额', key: 'price', type: 'amount' as const },
    { header: '实收', key: 'real_price', type: 'amount' as const },
    { header: '结算日期', key: 'settle_date' },
    { header: '开票号', key: 'ticket_no' },
    { header: '开票日期', key: 'ticket_date' },
    { header: '开票人', key: 'ticket_person' },
    ...(displayMode.value === 'money'
      ? [
          { header: '回款日期', key: 'return_money_date' },
          { header: '回款人', key: 'return_person' },
        ]
      : []),
    { header: '状态', key: 'status' },
  ]

  const exportData = displaySettles.value.map((settle) => ({
    serial_number: settle.serial_number,
    billing_name: settle.billing_name,
    ship_to: settle.ship_to,
    ship_number: toExcelNum(settle.ship_number),
    ship_weight: toExcelNum(settle.ship_weight),
    price: toExcelNum(settle.price),
    real_price: toExcelNum(settle.real_price || settle.price),
    settle_date: toExcelDate(settle.settle_date),
    ticket_no: settle.ticket_no || '-',
    ticket_date: toExcelDate(settle.ticket_date),
    ticket_person: settle.ticket_person || '-',
    return_money_date: toExcelDate(settle.return_money_date),
    return_person: settle.return_person || '-',
    status: settle.status,
  }))

  const modeLabel = displayMode.value === 'money' ? '已回款' : '未回款'
  exportWithPicker({
    fileName: `回款管理_${modeLabel}_${new Date().toLocaleDateString()}`,
    sheetName: modeLabel,
    columns,
    data: exportData,
  })
}

// 显示明细对话框状态
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const detailBills = ref<any[]>([])
const currentSettle = ref<SettleRecord | null>(null)

// 导出明细
function exportDetail() {
  if (detailBills.value.length === 0) {
    toast.warning('没有可导出的数据')
    return
  }

  // 按订单号排序
  const sorted = sortByOrder(detailBills.value)
  const exportData = sorted.map((bill, index) => ({
    index: index + 1,
    order_no: `${bill.order_no}-${String(bill.order_item_no || 0).padStart(3, '0')}`,
    bill_no: bill.bill_no,
    ship_date: toExcelDate(bill.ship_date),
    spec: `${bill.thickness}*${bill.width}*${bill.len}`,
    billing_name: bill.billing_name,
    vessel: bill.vessel || '-',
    ship_to: bill.ship_to || '-',
    price: toExcelNum(bill.price),
    settle_num: toExcelNum(bill.settle_num),
    settle_weight: toExcelNum(bill.settle_weight),
    amount: toExcelNum(bill.amount),
  }))

  const fileName = currentSettle.value
    ? `结算明细_${currentSettle.value.serial_number}_${new Date().toLocaleDateString()}`
    : `结算明细_${new Date().toLocaleDateString()}`

  exportWithPicker({
    fileName,
    sheetName: '结算明细',
    columns: [
      { header: '序号', key: 'index' },
      { header: '订单号', key: 'order_no' },
      { header: '提单号', key: 'bill_no' },
      { header: '发货日期', key: 'ship_date', type: 'date' },
      { header: '规格', key: 'spec' },
      { header: '开单名称', key: 'billing_name' },
      { header: '车船', key: 'vessel' },
      { header: '目的地', key: 'ship_to' },
      { header: '单价', key: 'price', type: 'amount' },
      { header: '发运块数', key: 'settle_num', type: 'number' },
      { header: '发运重量', key: 'settle_weight', type: 'weight' },
      { header: '金额', key: 'amount', type: 'amount' },
    ],
    data: exportData,
  })
}

// 显示明细
async function handleShowDetail() {
  if (selectedSettles.value.length !== 1) {
    toast.warning('请选择一条记录')
    return
  }

  const settle = selectedSettles.value[0]
  detailLoading.value = true
  showDetailDialog.value = true

  try {
    const result = await getSettleDetail(settle.serial_number)
    if (result.ok) {
      currentSettle.value = result.settle

      // 合并提单信息和结算信息
      detailBills.value = result.settle_bills
        .map((settleBill: any) => {
          const bill = result.bills.find((b: any) => String(b._id) === String(settleBill.bill_id))
          if (!bill) return null

          // 查找对应的运单信息获取车船号和目的地
          let vessel = ''
          let shipTo = ''
          let price = 0

          if (bill.invoices && bill.invoices.length > 0) {
            for (const inv of bill.invoices) {
              if (inv.inv_no === settleBill.inv_no) {
                if (settle.settle_type === '客户结算') {
                  vessel = inv.veh_ves_name
                  price = inv.price || 0
                } else if (settle.settle_type === '代收代付结算') {
                  price = bill.collection_price || 0
                }
                shipTo = inv.ship_to
                break
              }
            }
          }

          return {
            ...bill,
            settle_num: settleBill.num,
            settle_weight: settleBill.weight,
            vessel,
            ship_to: shipTo,
            price,
            amount: price * settleBill.weight,
            ship_date: result.shipDateMap?.[settleBill.inv_no] || '',
          }
        })
        .filter(Boolean)
    } else {
      toast.error(result.message || '获取明细失败')
    }
  } catch (error: any) {
    toast.error(error.message || '获取明细失败')
  } finally {
    detailLoading.value = false
  }
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '回款管理(自有车)' : '回款管理'"
    :description="isSelfOwnedMode ? '自有车结算记录的回款管理' : '结算记录的回款管理'"
  >
    <Tabs v-model="displayMode" class="w-full">
      <!-- Tabs 和操作按钮 -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <!-- Row 1: Tabs -->
        <div class="flex items-center justify-between md:justify-start gap-2">
          <TabsList>
            <TabsTrigger value="ticket" class="md:w-[140px]"> 未回款(已开票) </TabsTrigger>
            <TabsTrigger value="money" class="md:w-[140px]"> 已回款 </TabsTrigger>
          </TabsList>
        </div>

        <!-- Row 2: 操作按钮组 -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- 未回款tab的操作按钮 -->
          <template v-if="displayMode === 'ticket'">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedSettles.length === 0 || loading"
              @click="handleReturnMoney"
            >
              <Banknote class="w-4 h-4 mr-1" />
              回款
            </UiButton>
          </template>

          <!-- 已回款tab的操作按钮 -->
          <template v-else>
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedSettles.length === 0 || loading"
              @click="handleCancelReturnMoney"
            >
              <Undo2 class="w-4 h-4 mr-1" />
              回款取消
            </UiButton>
          </template>

          <!-- 通用操作按钮 -->
          <UiButton variant="outline" size="sm" @click="showFilter = !showFilter">
            <FilterIcon class="w-4 h-4 mr-1" />
            过滤
          </UiButton>
          <UiButton variant="outline" size="sm" :disabled="displaySettles.length === 0" @click="handleExport">
            <Download class="w-4 h-4 mr-1" />
            导出
          </UiButton>
          <UiButton variant="outline" size="sm" :disabled="selectedSettles.length !== 1" @click="handleShowDetail">
            <List class="w-4 h-4 mr-1" />
            显示明细
          </UiButton>
          <UiButton variant="outline" size="sm" :disabled="selectedSettles.length !== 1" @click="handleRealPriceInput">
            实收价格输入
          </UiButton>
        </div>
      </div>

      <TabsContent value="ticket" class="space-y-4">
        <!-- 过滤器 -->
        <div v-if="showFilter" class="border rounded-lg p-2 bg-muted/30">
          <div class="grid grid-cols-2 md:grid-cols-[repeat(5,1fr)_80px] gap-2">
            <SearchableCombobox
              v-model="filterBillingName"
              :search-fn="searchFilterBillingNames"
              placeholder="开单名称"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <SearchableCombobox
              v-model="filterSerialNumber"
              :search-fn="searchFilterSerialNumbers"
              placeholder="结算号"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <SearchableCombobox
              v-model="filterShipTo"
              :search-fn="searchFilterShipTos"
              placeholder="目的地"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateStart"
              placeholder="起始日期"
              :disabled-date="disableStartDate"
              disabled-hint="开始日期不能晚于结束日期"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateEnd"
              placeholder="结束日期"
              :disabled-date="disableEndDate"
              disabled-hint="结束日期不能早于开始日期"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <UiButton variant="outline" size="sm" class="h-8" @click="resetFilter"> 重置 </UiButton>
          </div>
        </div>

        <!-- 汇总统计信息 -->
        <div
          class="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm"
        >
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ formatNumber(statistics.totalWeight) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ formatNumber(statistics.totalAmount, 2) }}</strong></span
          >
        </div>

        <!-- 数据表格（桌面端） -->
        <div class="hidden md:block border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/80">
                <tr class="border-b">
                  <th class="px-2 py-2 text-left w-8">
                    <input type="checkbox" class="h-4 w-4 cursor-pointer" :checked="allSelected" @change="toggleAll" />
                  </th>
                  <th class="px-2 py-2 text-left" style="min-width: 120px">结算号</th>
                  <th class="px-2 py-2 text-left whitespace-nowrap" style="min-width: 150px">开单名称</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">目的地</th>
                  <th class="px-2 py-2 text-right" style="min-width: 60px">块数</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">重量</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">金额</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">实收</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算日期</th>
                  <th class="px-2 py-2 text-left" style="max-width: 260px; min-width: 100px">开票号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">开票人/日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="12" class="p-8 text-center text-muted-foreground">加载中...</td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td colspan="12" class="p-8 text-center text-muted-foreground">没有数据</td>
                </tr>
                <tr
                  v-for="settle in pagedSettles"
                  v-else
                  :key="settle._id"
                  class="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  :class="{
                    'bg-blue-50 border-l-4 border-l-blue-500': isSelected(settle),
                  }"
                  @click="toggleSettle(settle)"
                >
                  <td class="px-2 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="isSelected(settle)"
                      @change="toggleSettle(settle)"
                    />
                  </td>
                  <td class="px-2 py-2 text-xs">
                    {{ settle.serial_number }}
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    <template v-if="settle.billing_name?.includes('/')">
                      <div class="leading-tight">
                        <div>{{ settle.billing_name.split('/')[0] }}</div>
                        <div class="text-xs text-muted-foreground">{{ settle.billing_name.split('/').slice(1).join('/') }}</div>
                      </div>
                    </template>
                    <template v-else>{{ settle.billing_name }}</template>
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ship_to }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_number }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ formatNumber(settle.ship_weight || 0) }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ formatNumber(settle.price || 0, 2) }}
                  </td>
                  <td
                    class="px-2 py-2 text-right"
                    :class="
                      settle.real_price && settle.real_price !== settle.price
                        ? 'text-red-600 font-bold'
                        : 'text-green-600'
                    "
                  >
                    {{ formatNumber(settle.real_price || settle.price || 0, 2) }}
                  </td>
                  <td class="px-2 py-2">
                    {{ dayjs(settle.settle_date).format('YYYY-MM-DD') }}
                  </td>
                  <td class="px-2 py-2 truncate" style="max-width: 260px" :title="settle.ticket_no || '-'">
                    {{ settle.ticket_no || '-' }}
                  </td>
                  <td class="px-2 py-1">
                    <div>{{ settle.ticket_person || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ settle.ticket_date ? dayjs(settle.ticket_date).format('YYYY-MM-DD') : '-' }}</div>
                  </td>
                  <td class="px-2 py-2">
                    <span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      {{ settle.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 移动端卡片列表 -->
        <div class="md:hidden space-y-2">
          <div v-if="loading" class="p-8 text-center text-muted-foreground">加载中...</div>
          <div v-else-if="displaySettles.length === 0" class="p-8 text-center text-muted-foreground">没有数据</div>
          <div
            v-for="settle in pagedSettles"
            v-else
            :key="settle._id"
            class="p-3 rounded-lg border cursor-pointer transition-colors"
            :class="isSelected(settle) ? 'bg-blue-50 border-blue-500' : 'hover:bg-muted/50'"
            @click="toggleSettle(settle)"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-medium text-sm">{{ settle.serial_number }}</span>
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                {{ settle.status }}
              </span>
            </div>
            <div class="text-sm text-muted-foreground space-y-0.5">
              <div>
                <span>{{ settle.billing_name?.includes('/') ? settle.billing_name.split('/')[0] : settle.billing_name }}</span>
                <span v-if="settle.billing_name?.includes('/')" class="text-xs text-muted-foreground ml-1">/ {{ settle.billing_name.split('/').slice(1).join('/') }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ settle.ship_to }}</span>
                <span>{{ dayjs(settle.settle_date).format('MM-DD') }}</span>
              </div>
              <div class="flex justify-between font-medium text-foreground">
                <span>{{ settle.ship_number }}块 / {{ formatNumber(settle.ship_weight || 0) }}吨</span>
                <span>¥{{ formatNumber(settle.price || 0, 2) }}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span
                  >实收:
                  <span
                    :class="
                      settle.real_price && settle.real_price !== settle.price
                        ? 'text-red-600 font-bold'
                        : 'text-green-600'
                    "
                    >¥{{ formatNumber(settle.real_price || settle.price || 0, 2) }}</span
                  ></span
                >
                <span>票号: {{ settle.ticket_no || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- 已回款 Tab -->
      <TabsContent value="money" class="space-y-4">
        <!-- 过滤器 -->
        <div v-if="showFilter" class="border rounded-lg p-2 bg-muted/30">
          <div class="grid grid-cols-2 md:grid-cols-[repeat(5,1fr)_80px] gap-2">
            <SearchableCombobox
              v-model="filterBillingName"
              :search-fn="searchFilterBillingNames"
              placeholder="开单名称"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <SearchableCombobox
              v-model="filterSerialNumber"
              :search-fn="searchFilterSerialNumbers"
              placeholder="结算号"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <SearchableCombobox
              v-model="filterShipTo"
              :search-fn="searchFilterShipTos"
              placeholder="目的地"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateStart"
              placeholder="起始日期"
              :disabled-date="disableStartDate"
              disabled-hint="开始日期不能晚于结束日期"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateEnd"
              placeholder="结束日期"
              :disabled-date="disableEndDate"
              disabled-hint="结束日期不能早于开始日期"
              class="h-8 text-sm w-full"
              @update:model-value="updateDisplaySettles"
            />

            <UiButton variant="outline" size="sm" class="h-8" @click="resetFilter"> 重置 </UiButton>
          </div>
        </div>

        <!-- 汇总统计信息 -->
        <div
          class="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm"
        >
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ formatNumber(statistics.totalWeight) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ formatNumber(statistics.totalAmount, 2) }}</strong></span
          >
        </div>

        <!-- 数据表格（桌面端） -->
        <div class="hidden md:block border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/80">
                <tr class="border-b">
                  <th class="px-2 py-2 text-left w-8">
                    <input type="checkbox" class="h-4 w-4 cursor-pointer" :checked="allSelected" @change="toggleAll" />
                  </th>
                  <th class="px-2 py-2 text-left" style="min-width: 120px">结算号</th>
                  <th class="px-2 py-2 text-left whitespace-nowrap" style="min-width: 150px">开单名称</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">目的地</th>
                  <th class="px-2 py-2 text-right" style="min-width: 60px">块数</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">重量</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">金额</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">实收</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算日期</th>
                  <th class="px-2 py-2 text-left" style="max-width: 260px; min-width: 100px">开票号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">开票人/日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">回款人/日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="13" class="p-8 text-center text-muted-foreground">加载中...</td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td colspan="13" class="p-8 text-center text-muted-foreground">没有数据</td>
                </tr>
                <tr
                  v-for="settle in pagedSettles"
                  v-else
                  :key="settle._id"
                  class="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  :class="{
                    'bg-blue-50 border-l-4 border-l-blue-500': isSelected(settle),
                  }"
                  @click="toggleSettle(settle)"
                >
                  <td class="px-2 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="isSelected(settle)"
                      @change="toggleSettle(settle)"
                    />
                  </td>
                  <td class="px-2 py-2 text-xs">
                    {{ settle.serial_number }}
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    <template v-if="settle.billing_name?.includes('/')">
                      <div class="leading-tight">
                        <div>{{ settle.billing_name.split('/')[0] }}</div>
                        <div class="text-xs text-muted-foreground">{{ settle.billing_name.split('/').slice(1).join('/') }}</div>
                      </div>
                    </template>
                    <template v-else>{{ settle.billing_name }}</template>
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ship_to }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_number }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ formatNumber(settle.ship_weight || 0) }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ formatNumber(settle.price || 0, 2) }}
                  </td>
                  <td
                    class="px-2 py-2 text-right"
                    :class="
                      settle.real_price && settle.real_price !== settle.price
                        ? 'text-red-600 font-bold'
                        : 'text-green-600'
                    "
                  >
                    {{ formatNumber(settle.real_price || settle.price || 0, 2) }}
                  </td>
                  <td class="px-2 py-2">
                    {{ dayjs(settle.settle_date).format('YYYY-MM-DD') }}
                  </td>
                  <td class="px-2 py-2 truncate" style="max-width: 260px" :title="settle.ticket_no || '-'">
                    {{ settle.ticket_no || '-' }}
                  </td>
                  <td class="px-2 py-1">
                    <div>{{ settle.ticket_person || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ settle.ticket_date ? dayjs(settle.ticket_date).format('YYYY-MM-DD') : '-' }}</div>
                  </td>
                  <td class="px-2 py-1">
                    <div>{{ settle.return_person || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ settle.return_money_date ? dayjs(settle.return_money_date).format('YYYY-MM-DD') : '-' }}</div>
                  </td>
                  <td class="px-2 py-2">
                    <span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      {{ settle.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 移动端卡片列表 -->
        <div class="md:hidden space-y-2">
          <div v-if="loading" class="p-8 text-center text-muted-foreground">加载中...</div>
          <div v-else-if="displaySettles.length === 0" class="p-8 text-center text-muted-foreground">没有数据</div>
          <div
            v-for="settle in pagedSettles"
            v-else
            :key="settle._id"
            class="p-3 rounded-lg border cursor-pointer transition-colors"
            :class="isSelected(settle) ? 'bg-blue-50 border-blue-500' : 'hover:bg-muted/50'"
            @click="toggleSettle(settle)"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-medium text-sm">{{ settle.serial_number }}</span>
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                {{ settle.status }}
              </span>
            </div>
            <div class="text-sm text-muted-foreground space-y-0.5">
              <div>
                <span>{{ settle.billing_name?.includes('/') ? settle.billing_name.split('/')[0] : settle.billing_name }}</span>
                <span v-if="settle.billing_name?.includes('/')" class="text-xs text-muted-foreground ml-1">/ {{ settle.billing_name.split('/').slice(1).join('/') }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ settle.ship_to }}</span>
                <span>{{ dayjs(settle.settle_date).format('MM-DD') }}</span>
              </div>
              <div class="flex justify-between font-medium text-foreground">
                <span>{{ settle.ship_number }}块 / {{ formatNumber(settle.ship_weight || 0) }}吨</span>
                <span>¥{{ formatNumber(settle.price || 0, 2) }}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span
                  >实收:
                  <span
                    :class="
                      settle.real_price && settle.real_price !== settle.price
                        ? 'text-red-600 font-bold'
                        : 'text-green-600'
                    "
                    >¥{{ formatNumber(settle.real_price || settle.price || 0, 2) }}</span
                  ></span
                >
                <span
                  >回款: {{ settle.return_money_date ? dayjs(settle.return_money_date).format('MM-DD') : '-' }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <!-- 分页 -->
    <div
      v-if="displaySettles.length > 0"
      class="flex flex-col md:flex-row items-center justify-between gap-2 mt-4 px-2"
    >
      <div class="text-sm text-muted-foreground">
        <span class="hidden md:inline"
          >显示 {{ (currentPage - 1) * pageSize + 1 }}-{{
            Math.min(currentPage * pageSize, displaySettles.length)
          }}
          条，共 {{ displaySettles.length }} 条</span
        >
        <span class="md:hidden"
          >{{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, displaySettles.length) }} /
          {{ displaySettles.length }}条</span
        >
      </div>
      <div class="flex items-center gap-2">
        <select v-model.number="pageSize" class="h-8 px-2 text-sm border rounded" @change="currentPage = 1">
          <option :value="10">10条/页</option>
          <option :value="20">20条/页</option>
          <option :value="30">30条/页</option>
          <option :value="40">40条/页</option>
          <option :value="50">50条/页</option>
          <option :value="100">100条/页</option>
        </select>
        <UiButton variant="outline" size="sm" :disabled="currentPage === 1" @click="currentPage--"> 上一页 </UiButton>
        <span class="text-sm">{{ currentPage }}/{{ totalPages }}</span>
        <UiButton variant="outline" size="sm" :disabled="currentPage >= totalPages" @click="currentPage++">
          下一页
        </UiButton>
      </div>
    </div>

    <!-- 实收价格对话框 -->
    <UiDialog v-model:open="showRealPriceDialog">
      <UiDialogContent>
        <UiDialogHeader>
          <UiDialogTitle>实收价格输入</UiDialogTitle>
        </UiDialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">实收价格</label>
            <UiInput v-model="realPrice" type="number" step="0.01" placeholder="请输入实收价格" />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showRealPriceDialog = false"> 取消 </UiButton>
          <UiButton @click="confirmRealPrice"> 确定 </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 结算明细对话框 -->
    <UiDialog v-model:open="showDetailDialog">
      <UiDialogContent class="min-w-[1000px] max-w-[95vw] max-h-[85vh]">
        <UiDialogHeader>
          <UiDialogTitle>结算明细单</UiDialogTitle>
        </UiDialogHeader>
        <div class="overflow-auto max-h-[70vh]">
          <div v-if="detailLoading" class="flex items-center justify-center p-8">
            <span class="text-muted-foreground">加载中...</span>
          </div>
          <div v-else-if="detailBills.length === 0" class="flex items-center justify-center p-8">
            <span class="text-muted-foreground">没有明细数据</span>
          </div>
          <table v-else class="w-full text-sm border-collapse">
            <thead class="bg-muted/80 sticky top-0">
              <tr class="border-b">
                <th class="px-2 py-2 text-left">订单号</th>
                <th class="px-2 py-2 text-left">提单号</th>
                <th class="px-2 py-2 text-left">规格</th>
                <th class="px-2 py-2 text-left">开单名称</th>
                <th class="px-2 py-2 text-left">车船</th>
                <th class="px-2 py-2 text-left">目的地</th>
                <th class="px-2 py-2 text-right">单价</th>
                <th class="px-2 py-2 text-right">发运块数</th>
                <th class="px-2 py-2 text-right">发运重量</th>
                <th class="px-2 py-2 text-right">金额</th>
                <th class="px-2 py-2 text-left">发货日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(bill, index) in detailBills" :key="index" class="border-b hover:bg-muted/50">
                <td class="px-2 py-2">{{ bill.order_no }}-{{ String(bill.order_item_no || 0).padStart(3, '0') }}</td>
                <td class="px-2 py-2">{{ bill.bill_no }}</td>
                <td class="px-2 py-2">{{ bill.thickness }}*{{ bill.width }}*{{ bill.len }}</td>
                <td class="px-2 py-2">{{ bill.billing_name }}</td>
                <td class="px-2 py-2">{{ bill.vessel || '-' }}</td>
                <td class="px-2 py-2">{{ bill.ship_to || '-' }}</td>
                <td class="px-2 py-2 text-right">{{ formatNumber(bill.price, 2) || '0' }}</td>
                <td class="px-2 py-2 text-right">{{ bill.settle_num || 0 }}</td>
                <td class="px-2 py-2 text-right">{{ formatNumber(bill.settle_weight) || '0' }}</td>
                <td class="px-2 py-2 text-right">{{ formatNumber(bill.amount, 2) || '0' }}</td>
                <td class="px-2 py-2">{{ bill.ship_date ? dayjs(bill.ship_date).format('YYYY-MM-DD') : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiDialogFooter class="flex items-center justify-between">
          <UiButton variant="outline" :disabled="detailBills.length === 0" @click="exportDetail">
            <Download class="w-4 h-4 mr-1" />
            导出
          </UiButton>
          <UiButton @click="showDetailDialog = false"> 关闭 </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 导出对话框 -->
    <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />
  </BasicPage>
</template>
