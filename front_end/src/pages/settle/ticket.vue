<script setup lang="ts">
import { Download, FileCheck, FileX, Filter as FilterIcon, List } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { DatePicker } from '@/components/ui/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { deleteSettle, getSettleDetail, getSettleList, updateTicket } from '@/services/api/ticket.api'

import type { DisplayMode, SettleRecord, SettleType } from './ticket-types'

import SettleModeTabs from './components/SettleModeTabs.vue'

const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

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

// 过滤参数
const filterBillingName = ref('')
const filterSerialNumber = ref('')
const filterShipTo = ref('')
const defaultDateRange = getDefaultDateRange()
const filterTicketDateStart = ref<string>(defaultDateRange.start)
const filterTicketDateEnd = ref<string>(defaultDateRange.end)

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
      selfOwned: '0',
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

  // 开票日期过滤（仅在已开票模式下生效，未开票记录没有 ticket_date）
  if (displayMode.value === 'ticket' && filterTicketDateStart.value && filterTicketDateEnd.value) {
    filtered = filtered.filter((s) => {
      if (!s.ticket_date) return false
      const ticketDate = new Date(s.ticket_date)
      const startDate = new Date(filterTicketDateStart.value)
      const endDate = new Date(filterTicketDateEnd.value)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      return ticketDate >= startDate && ticketDate <= endDate
    })
  }

  displaySettles.value = filtered
  selectedSettles.value = []
}

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

// 统计信息
const statistics = computed(() => {
  let totalNum = 0
  let totalWeight = 0
  let totalAmount = 0

  displaySettles.value.forEach((settle) => {
    totalNum += settle.ship_number
    totalWeight += settle.ship_weight
    totalAmount += settle.price
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
  toast.info('导出功能开发中...')
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

  const exportData = detailBills.value.map((bill, index) => ({
    index: index + 1,
    order_no: `${bill.order_no}-${String(bill.order_item_no || 0).padStart(3, '0')}`,
    bill_no: bill.bill_no,
    spec: `${bill.thickness}*${bill.width}*${bill.len}`,
    billing_name: bill.billing_name,
    vessel: bill.vessel || '-',
    ship_to: bill.ship_to || '-',
    price: bill.price?.toFixed(2) || '0.00',
    settle_num: bill.settle_num || 0,
    settle_weight: bill.settle_weight?.toFixed(3) || '0.000',
    amount: bill.amount?.toFixed(2) || '0.00',
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
      { header: '规格', key: 'spec' },
      { header: '开单名称', key: 'billing_name' },
      { header: '车船', key: 'vessel' },
      { header: '目的地', key: 'ship_to' },
      { header: '单价', key: 'price' },
      { header: '发运块数', key: 'settle_num' },
      { header: '发运重量', key: 'settle_weight' },
      { header: '金额', key: 'amount' },
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
  <BasicPage title="开票管理" description="结算记录的开票和票据管理">
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
        <!-- 过滤器 -->
        <div v-if="showFilter" class="border rounded-lg p-2 bg-muted/30">
          <div class="flex items-center gap-2 flex-wrap">
            <Select v-model="filterBillingName" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="开单名称" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="name in filterOptions.billingNames" :key="name" :value="name">
                  {{ name }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select v-model="filterSerialNumber" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="结算号" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="number in filterOptions.serialNumbers" :key="number" :value="number">
                  {{ number }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select v-model="filterShipTo" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="目的地" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="dest in filterOptions.shipTos" :key="dest" :value="dest">
                  {{ dest }}
                </SelectItem>
              </SelectContent>
            </Select>

            <DatePicker
              v-model="filterTicketDateStart"
              placeholder="起始开票日期"
              :disabled-date="disableStartDate"
              disabled-hint="开始日期不能晚于结束日期"
              class="h-8 text-sm flex-1 min-w-[150px]"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateEnd"
              placeholder="结束开票日期"
              :disabled-date="disableEndDate"
              disabled-hint="结束日期不能早于开始日期"
              class="h-8 text-sm flex-1 min-w-[150px]"
              @update:model-value="updateDisplaySettles"
            />

            <UiButton variant="outline" size="sm" class="h-8" @click="resetFilter"> 重置 </UiButton>
          </div>
        </div>

        <!-- 汇总统计信息 -->
        <div class="flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ statistics.totalWeight.toFixed(3) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ statistics.totalAmount.toFixed(2) }}</strong></span
          >
        </div>

        <!-- 数据表格 -->
        <div class="border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/80">
                <tr class="border-b">
                  <th class="px-2 py-2 text-left w-8">
                    <input type="checkbox" class="h-4 w-4 cursor-pointer" :checked="allSelected" @change="toggleAll" />
                  </th>
                  <th class="px-2 py-2 text-left" style="min-width: 120px">结算号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 150px">开单名称</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">目的地</th>
                  <th class="px-2 py-2 text-right" style="min-width: 60px">块数</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">重量</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">金额</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算日期</th>
                  <th class="px-2 py-2 text-left" style="max-width: 300px; min-width: 100px">开票号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">开票日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="11" class="p-8 text-center text-muted-foreground">加载中...</td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td colspan="11" class="p-8 text-center text-muted-foreground">没有数据</td>
                </tr>
                <tr
                  v-for="settle in displaySettles"
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
                  <td class="px-2 py-2">
                    {{ settle.serial_number }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.billing_name }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ship_to }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_number }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_weight.toFixed(3) }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.price.toFixed(2) }}
                  </td>
                  <td class="px-2 py-2">
                    {{ new Date(settle.settle_date).toLocaleDateString() }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ticket_date ? new Date(settle.ticket_date).toLocaleDateString() : '-' }}
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
      </TabsContent>

      <!-- 已开票 Tab -->
      <TabsContent value="ticket" class="space-y-4">
        <!-- 过滤器 -->
        <div v-if="showFilter" class="border rounded-lg p-2 bg-muted/30">
          <div class="flex items-center gap-2 flex-wrap">
            <Select v-model="filterBillingName" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="开单名称" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="name in filterOptions.billingNames" :key="name" :value="name">
                  {{ name }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select v-model="filterSerialNumber" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="结算号" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="number in filterOptions.serialNumbers" :key="number" :value="number">
                  {{ number }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select v-model="filterShipTo" @update:model-value="updateDisplaySettles">
              <SelectTrigger class="h-8 text-sm flex-1 min-w-[150px]">
                <SelectValue placeholder="目的地" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="dest in filterOptions.shipTos" :key="dest" :value="dest">
                  {{ dest }}
                </SelectItem>
              </SelectContent>
            </Select>

            <DatePicker
              v-model="filterTicketDateStart"
              placeholder="起始开票日期"
              :disabled-date="disableStartDate"
              disabled-hint="开始日期不能晚于结束日期"
              class="h-8 text-sm flex-1 min-w-[150px]"
              @update:model-value="updateDisplaySettles"
            />

            <DatePicker
              v-model="filterTicketDateEnd"
              placeholder="结束开票日期"
              :disabled-date="disableEndDate"
              disabled-hint="结束日期不能早于开始日期"
              class="h-8 text-sm flex-1 min-w-[150px]"
              @update:model-value="updateDisplaySettles"
            />

            <UiButton variant="outline" size="sm" class="h-8" @click="resetFilter"> 重置 </UiButton>
          </div>
        </div>

        <!-- 汇总统计信息 -->
        <div class="flex items-center gap-4 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <span class="text-muted-foreground"
            >记录数: <strong class="text-foreground">{{ statistics.count }}</strong></span
          >
          <span class="text-muted-foreground"
            >合计块数: <strong class="text-foreground">{{ statistics.totalNum }}</strong></span
          >
          <span class="text-muted-foreground"
            >重量: <strong class="text-foreground">{{ statistics.totalWeight.toFixed(3) }}</strong> 吨</span
          >
          <span class="text-muted-foreground"
            >金额: <strong class="text-foreground">¥{{ statistics.totalAmount.toFixed(2) }}</strong></span
          >
        </div>

        <!-- 数据表格 -->
        <div class="border rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/80">
                <tr class="border-b">
                  <th class="px-2 py-2 text-left w-8">
                    <input type="checkbox" class="h-4 w-4 cursor-pointer" :checked="allSelected" @change="toggleAll" />
                  </th>
                  <th class="px-2 py-2 text-left" style="min-width: 120px">结算号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 150px">开单名称</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">目的地</th>
                  <th class="px-2 py-2 text-right" style="min-width: 60px">块数</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">重量</th>
                  <th class="px-2 py-2 text-right" style="min-width: 80px">金额</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">结算日期</th>
                  <th class="px-2 py-2 text-left" style="max-width: 300px; min-width: 100px">开票号</th>
                  <th class="px-2 py-2 text-left" style="min-width: 100px">开票日期</th>
                  <th class="px-2 py-2 text-left" style="min-width: 80px">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="11" class="p-8 text-center text-muted-foreground">加载中...</td>
                </tr>
                <tr v-else-if="displaySettles.length === 0">
                  <td colspan="11" class="p-8 text-center text-muted-foreground">没有数据</td>
                </tr>
                <tr
                  v-for="settle in displaySettles"
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
                  <td class="px-2 py-2">
                    {{ settle.serial_number }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.billing_name }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ship_to }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_number }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.ship_weight.toFixed(3) }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    {{ settle.price.toFixed(2) }}
                  </td>
                  <td class="px-2 py-2">
                    {{ new Date(settle.settle_date).toLocaleDateString() }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ticket_no === 'NOTNEEDED' ? '不需要开票' : settle.ticket_no || '-' }}
                  </td>
                  <td class="px-2 py-2">
                    {{ settle.ticket_date ? new Date(settle.ticket_date).toLocaleDateString() : '-' }}
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
      </TabsContent>
    </Tabs>

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
              </tr>
            </thead>
            <tbody>
              <tr v-for="(bill, index) in detailBills" :key="index" class="border-b hover:bg-muted/50">
                <td class="px-2 py-2">{{ bill.order_no }}-{{ String(bill.order_item_no || 0).padStart(3, '0') }}</td>
                <td class="px-2 py-2">
                  {{ bill.bill_no }}
                </td>
                <td class="px-2 py-2">{{ bill.thickness }}*{{ bill.width }}*{{ bill.len }}</td>
                <td class="px-2 py-2">
                  {{ bill.billing_name }}
                </td>
                <td class="px-2 py-2">
                  {{ bill.vessel || '-' }}
                </td>
                <td class="px-2 py-2">
                  {{ bill.ship_to || '-' }}
                </td>
                <td class="px-2 py-2 text-right">
                  {{ bill.price?.toFixed(2) || '0.00' }}
                </td>
                <td class="px-2 py-2 text-right">
                  {{ bill.settle_num || 0 }}
                </td>
                <td class="px-2 py-2 text-right">
                  {{ bill.settle_weight?.toFixed(3) || '0.000' }}
                </td>
                <td class="px-2 py-2 text-right">
                  {{ bill.amount?.toFixed(2) || '0.00' }}
                </td>
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
