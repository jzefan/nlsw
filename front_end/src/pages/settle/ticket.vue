<script setup lang="ts">
import dayjs from 'dayjs'
import { Download, FileCheck, FileX, Filter as FilterIcon, List } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { deleteSettle, getSettleList, updateTicket } from '@/services/api/ticket.api'

import { formatNumber, toExcelDate, toExcelNum } from '@/utils/format'
import type { DisplayMode, SettleRecord, SettleType } from './ticket-types'

import SettleDetailDialog from './components/SettleDetailDialog.vue'
import SettleModeTabs from './components/SettleModeTabs.vue'
import SettleRecordFilter from './components/SettleRecordFilter.vue'
import type { SettleRecordFilterParams } from './components/SettleRecordFilter.vue'

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
const settleType = ref<SettleType>('CUSTOMER')
const displayMode = ref<DisplayMode>('settle')
const allSettles = ref<SettleRecord[]>([])
const displaySettles = ref<SettleRecord[]>([])
const selectedSettles = ref<SettleRecord[]>([])
const loading = ref(false)
const showFilter = ref(false)
const ticketFilterRef = ref<InstanceType<typeof SettleRecordFilter> | null>(null)
const currentPage = ref(1)
const pageSize = ref(50)

// 过滤参数（由 SettleRecordFilter 组件管理并通过事件传递）
const currentFilterParams = ref<SettleRecordFilterParams>({
  billingName: '',
  serialNumber: '',
  shipTo: '',
  startDate: getDefaultDateRange().start,
  endDate: getDefaultDateRange().end,
})

// 开票对话框状态
const showTicketDialog = ref(false)
const ticketNo = ref('')
const needTicket = ref(true)

// 页面初始化
onMounted(() => {
  loadData()
})

// 监听显示模式和结算类型变化，实时加载数据
watch([displayMode, settleType], () => {
  loadData()
})

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const result = await getSettleList({
      settle_type: settleType.value,
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

// 更新显示的结算列表
function updateDisplaySettles() {
  const fp = currentFilterParams.value
  let filtered = allSettles.value

  if (fp.billingName) {
    filtered = filtered.filter((s) => s.billing_name === fp.billingName)
  }
  if (fp.serialNumber) {
    filtered = filtered.filter((s) => s.serial_number === fp.serialNumber)
  }
  if (fp.shipTo) {
    filtered = filtered.filter((s) => s.ship_to === fp.shipTo)
  }

  if (fp.startDate && fp.endDate) {
    filtered = filtered.filter((s) => {
      const dateValue = displayMode.value === 'ticket' ? s.ticket_date : s.settle_date
      if (!dateValue) return false
      const d = new Date(dateValue)
      const startDate = new Date(fp.startDate)
      const endDate = new Date(fp.endDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      return d >= startDate && d <= endDate
    })
  }

  displaySettles.value = [...filtered].sort((a, b) => {
    const dateA = new Date(a.ticket_date || a.settle_date || 0).getTime()
    const dateB = new Date(b.ticket_date || b.settle_date || 0).getTime()
    return dateB - dateA
  })
  selectedSettles.value = []
  currentPage.value = 1
}

function handleFilterChange(params: SettleRecordFilterParams) {
  currentFilterParams.value = params
  updateDisplaySettles()
}

// 分页
const totalPages = computed(() => Math.ceil(displaySettles.value.length / pageSize.value))
const pagedSettles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return displaySettles.value.slice(start, start + pageSize.value)
})

// resetFilter 由 SettleRecordFilter 组件内部处理

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

// 切换结算类型
function switchSettleType(type: SettleType) {
  if (settleType.value !== type) {
    settleType.value = type
    loadData()
  }
}

// 切换显示模式
function switchDisplayMode(mode: DisplayMode) {
  if (displayMode.value !== mode) {
    displayMode.value = mode
    loadData()
  }
}

// 过滤选项由 SettleRecordFilter 组件内部管理

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

// 开票
function handleTicket() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要开票的结算记录')
    return
  }
  if (selectedSettles.value.length > 1) {
    toast.warning('一次只能对一条记录开票')
    return
  }

  const settle = selectedSettles.value[0]
  if (settle.status !== '已结算') {
    toast.warning('只能对已结算的记录开票')
    return
  }

  // 初始化对话框
  if (settle.ticket_no === 'NOTNEEDED') {
    ticketNo.value = ''
    needTicket.value = false
  } else {
    ticketNo.value = settle.ticket_no || ''
    needTicket.value = true
  }

  showTicketDialog.value = true
}

// 确认开票
async function confirmTicket() {
  const settle = selectedSettles.value[0]

  if (needTicket.value) {
    if (!ticketNo.value.trim()) {
      toast.error('请输入开票号码')
      return
    }
    settle.ticket_no = ticketNo.value.trim()
  } else {
    settle.ticket_no = 'NOTNEEDED'
  }

  loading.value = true
  try {
    const result = await updateTicket([
      {
        _id: settle._id,
        ticket_no: settle.ticket_no,
        ticket_date: new Date(),
        ticket_person: 'current_user', // TODO: 从用户信息获取
        status: '已开票',
      },
    ])

    if (result.ok) {
      toast.success('开票成功')
      showTicketDialog.value = false
      loadData()
    } else {
      toast.error(result.message || '开票失败')
    }
  } catch (error: any) {
    toast.error(error.message || '开票失败')
  } finally {
    loading.value = false
  }
}

// 开票取消
async function handleCancelTicket() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要取消开票的记录')
    return
  }

  const ticketedSettles = selectedSettles.value.filter((s) => s.status === '已开票')
  if (ticketedSettles.length === 0) {
    toast.warning('选中的记录中没有已开票的记录')
    return
  }

  const confirmed = window.confirm('确定要取消所选记录的开票状态吗？')
  if (!confirmed) return

  loading.value = true
  try {
    const result = await updateTicket(
      ticketedSettles.map((settle) => ({
        _id: settle._id,
        ticket_no: '',
        ticket_date: new Date(),
        ticket_person: '',
        status: '已结算',
      })),
    )

    if (result.ok) {
      toast.success('取消开票成功')
      loadData()
    } else {
      toast.error(result.message || '取消开票失败')
    }
  } catch (error: any) {
    toast.error(error.message || '取消开票失败')
  } finally {
    loading.value = false
  }
}

// 删除结算
async function handleDelete() {
  if (selectedSettles.value.length === 0) {
    toast.warning('请先选择要删除的记录')
    return
  }

  // 检查状态
  const invalidSettle = selectedSettles.value.find((s) => s.status !== '已结算')
  if (invalidSettle) {
    toast.error(`选中的记录中存在状态为"${invalidSettle.status}"的记录，不能删除`)
    return
  }

  const confirmed = window.confirm('确定要删除选中的结算记录吗？此操作不可恢复！')
  if (!confirmed) return

  loading.value = true
  try {
    const result = await deleteSettle({
      settle_ids: selectedSettles.value.map((s) => s._id),
      settle_type: settleType.value,
    })

    if (result.ok) {
      toast.success('删除成功')
      loadData()
    } else {
      toast.error(result.message || '删除失败')
    }
  } catch (error: any) {
    toast.error(error.message || '删除失败')
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
    { header: '重量', key: 'ship_weight' },
    { header: '金额', key: 'price' },
    { header: '结算日期', key: 'settle_date' },
    { header: '结算人', key: 'settler' },
    ...(displayMode.value === 'ticket'
      ? [
          { header: '开票号', key: 'ticket_no' },
          { header: '开票日期', key: 'ticket_date' },
          { header: '开票人', key: 'ticket_person' },
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
    settle_date: toExcelDate(settle.settle_date),
    settler: settle.settler || '-',
    ticket_no: settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-',
    ticket_date: toExcelDate(settle.ticket_date),
    ticket_person: settle.ticket_person || '-',
    status: settle.status,
  }))

  const modeLabel = displayMode.value === 'ticket' ? '已开票' : '已结算'
  exportWithPicker({
    fileName: `开票管理_${modeLabel}_${new Date().toLocaleDateString()}`,
    sheetName: modeLabel,
    columns,
    data: exportData,
  })
}

// 显示明细对话框状态
const showDetailDialog = ref(false)
const detailSettle = ref<SettleRecord | null>(null)

function handleShowDetail() {
  if (selectedSettles.value.length !== 1) {
    toast.warning('请选择一条记录')
    return
  }
  detailSettle.value = selectedSettles.value[0]
  showDetailDialog.value = true
}
</script>

<template>
  <BasicPage
    :title="isSelfOwnedMode ? '开票管理(自有车)' : '开票管理'"
    :description="isSelfOwnedMode ? '自有车结算记录的开票和票据管理' : '结算记录的开票和票据管理'"
  >
    <Tabs v-model="displayMode" class="w-full">
      <!-- Tabs 和操作按钮 -->
      <SettleModeTabs
        v-model="displayMode"
        v-model:settle-mode="settleType"
        :tab-options="[
          { value: 'settle', label: '未开票(已结算)' },
          { value: 'ticket', label: '已开票' },
        ]"
        :settle-mode-options="[
          { value: 'CUSTOMER', label: '客户(自提)' },
          { value: 'COLLECTION', label: '代收代付' },
        ]"
      >
        <template #actions>
          <!-- 开票操作按钮（仅在未开票tab显示） -->
          <template v-if="displayMode === 'settle'">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedSettles.length !== 1 || loading"
              @click="handleTicket"
            >
              <FileCheck class="w-4 h-4 mr-1" />
              开票
            </UiButton>
          </template>

          <!-- 已开票tab的操作按钮 -->
          <template v-else>
            <UiButton
              variant="outline"
              size="sm"
              :disabled="selectedSettles.length === 0 || loading"
              @click="handleCancelTicket"
            >
              <FileX class="w-4 h-4 mr-1" />
              取消开票
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
        </template>
      </SettleModeTabs>

      <TabsContent value="settle" class="space-y-4">
        <SettleRecordFilter ref="ticketFilterRef" v-if="showFilter" :records="allSettles" @filter="handleFilterChange" />

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
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算人/日期</th>
                  <th
                    v-if="displayMode === 'ticket'"
                    class="px-2 py-2 text-left"
                    style="max-width: 260px; min-width: 100px"
                  >
                    开票号
                  </th>
                  <th v-if="displayMode === 'ticket'" class="px-2 py-2 text-left" style="min-width: 100px">开票人/日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td :colspan="displayMode === 'ticket' ? 12 : 9" class="p-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td :colspan="displayMode === 'ticket' ? 12 : 9" class="p-8 text-center text-muted-foreground">
                    没有数据
                  </td>
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
                  <td class="px-2 py-1">
                    <div>{{ settle.settler || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ dayjs(settle.settle_date).format('YYYY-MM-DD') }}</div>
                  </td>
                  <td v-if="displayMode === 'ticket'" class="px-2 py-2 truncate" style="max-width: 260px" :title="settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-'">
                    {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
                  </td>
                  <td v-if="displayMode === 'ticket'" class="px-2 py-1">
                    <div>{{ settle.ticket_person || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ settle.ticket_date ? dayjs(settle.ticket_date).format('YYYY-MM-DD') : '-' }}</div>
                  </td>
                  <td class="px-2 py-2">
                    <span
                      class="px-2 py-0.5 rounded text-xs font-medium"
                      :class="{
                        'bg-blue-100 text-blue-700': settle.status === '已结算',
                        'bg-green-100 text-green-700': settle.status === '已开票',
                        'bg-purple-100 text-purple-700': settle.status === '已回款',
                      }"
                    >
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
              <span
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-700': settle.status === '已结算',
                  'bg-green-100 text-green-700': settle.status === '已开票',
                  'bg-purple-100 text-purple-700': settle.status === '已回款',
                }"
              >
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
              <div v-if="displayMode === 'ticket'" class="text-xs">
                票号: {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- 已开票 Tab -->
      <TabsContent value="ticket" class="space-y-4">
        <SettleRecordFilter ref="ticketFilterRef" v-if="showFilter" :records="allSettles" @filter="handleFilterChange" />

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
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算人/日期</th>
                  <th
                    v-if="displayMode === 'ticket'"
                    class="px-2 py-2 text-left"
                    style="max-width: 260px; min-width: 100px"
                  >
                    开票号
                  </th>
                  <th v-if="displayMode === 'ticket'" class="px-2 py-2 text-left" style="min-width: 100px">开票人/日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td :colspan="displayMode === 'ticket' ? 12 : 9" class="p-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td :colspan="displayMode === 'ticket' ? 12 : 9" class="p-8 text-center text-muted-foreground">
                    没有数据
                  </td>
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
                  <td class="px-2 py-1">
                    <div>{{ settle.settler || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ dayjs(settle.settle_date).format('YYYY-MM-DD') }}</div>
                  </td>
                  <td v-if="displayMode === 'ticket'" class="px-2 py-2 truncate" style="max-width: 260px" :title="settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-'">
                    {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
                  </td>
                  <td v-if="displayMode === 'ticket'" class="px-2 py-1">
                    <div>{{ settle.ticket_person || '-' }}</div>
                    <div class="text-xs text-muted-foreground">{{ settle.ticket_date ? dayjs(settle.ticket_date).format('YYYY-MM-DD') : '-' }}</div>
                  </td>
                  <td class="px-2 py-2">
                    <span
                      class="px-2 py-0.5 rounded text-xs font-medium"
                      :class="{
                        'bg-blue-100 text-blue-700': settle.status === '已结算',
                        'bg-green-100 text-green-700': settle.status === '已开票',
                        'bg-purple-100 text-purple-700': settle.status === '已回款',
                      }"
                    >
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
              <span
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-700': settle.status === '已结算',
                  'bg-green-100 text-green-700': settle.status === '已开票',
                  'bg-purple-100 text-purple-700': settle.status === '已回款',
                }"
              >
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
              <div v-if="displayMode === 'ticket'" class="text-xs">
                票号: {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
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

    <!-- 开票对话框 -->
    <UiDialog v-model:open="showTicketDialog">
      <UiDialogContent>
        <UiDialogHeader>
          <UiDialogTitle>开票票号录入</UiDialogTitle>
        </UiDialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">是否开票</label>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="needTicket" type="radio" :value="true" class="h-4 w-4" />
                <span class="text-sm">需要开票</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="needTicket" type="radio" :value="false" class="h-4 w-4" />
                <span class="text-sm">不开票</span>
              </label>
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">开票号码</label>
            <UiInput v-model="ticketNo" placeholder="请输入开票号码" :disabled="!needTicket" />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showTicketDialog = false"> 取消 </UiButton>
          <UiButton @click="confirmTicket"> 确定 </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 结算明细对话框 -->
    <SettleDetailDialog v-model:open="showDetailDialog" :settle="detailSettle" />

    <!-- 导出对话框 -->
    <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />
  </BasicPage>
</template>
