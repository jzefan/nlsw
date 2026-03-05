<script setup lang="ts">
import { Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { deleteInvoice, getInvoiceDetail, getInvoiceList } from '@/services/api/invoice.api'
import { useAuthStore } from '@/stores/auth'
import { isAdmin as isAdminPrivilege } from '@/constants/permissions'

const authStore = useAuthStore()

// 状态
const listLoading = ref(false)
const detailLoading = ref(false)
const loading = computed(() => listLoading.value || detailLoading.value)
const searchKeyword = ref('')
const showMyOnly = ref(false)
const invoiceList = ref<any[]>([])
const invoiceListTotal = ref(0)
const invoiceListPage = ref(1)
const invoiceListLimit = ref(20)

// 选中的运单
const selectedInvoice = ref<any | null>(null)
const invoiceDetail = ref<any | null>(null)

// 判断是否是管理员
const isAdmin = computed(() => isAdminPrivilege(authStore.user?.privilege ?? []))

// 监听showMyOnly变化，自动刷新列表
watch(showMyOnly, async () => {
  invoiceListPage.value = 1
  await loadInvoiceList()
})

// 加载运单列表
async function loadInvoiceList() {
  listLoading.value = true
  try {
    const params: any = {
      keyword: searchKeyword.value,
      page: invoiceListPage.value,
      limit: invoiceListLimit.value,
    }

    // 只有在勾选时才传递myOnly参数
    if (showMyOnly.value) {
      params.myOnly = true
    }

    const result = await getInvoiceList(params)
    if (result.ok) {
      invoiceList.value = result.data
      invoiceListTotal.value = result.total
    }
    else {
      toast.error('加载运单列表失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载运单列表失败')
  }
  finally {
    listLoading.value = false
  }
}

// 搜索运单
async function searchInvoices() {
  invoiceListPage.value = 1
  await loadInvoiceList()
}

// 选择运单
async function selectInvoice(invoice: any, event?: MouseEvent) {
  selectedInvoice.value = invoice

  // 滚动选中项到可视区域
  const target = event?.currentTarget as HTMLElement | undefined
  target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })

  detailLoading.value = true
  try {
    const result = await getInvoiceDetail(invoice.waybill_no)
    if (result.ok && result.data) {
      invoiceDetail.value = result.data
    }
    else {
      toast.error(result.message || '加载运单详情失败')
      invoiceDetail.value = null
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载运单详情失败')
    invoiceDetail.value = null
  }
  finally {
    detailLoading.value = false
  }
}

// 删除运单
async function handleDelete() {
  if (!selectedInvoice.value || !invoiceDetail.value) {
    toast.warning('请先选择要删除的运单')
    return
  }

  if (selectedInvoice.value.state === '已结算') {
    toast.error('此运单已结算，不能删除')
    return
  }

  if (!confirm(`您确定要删除运单 ${selectedInvoice.value.waybill_no} 吗？\n删除后将恢复所有提单的剩余量。`))
    return

  listLoading.value = true
  try {
    const result = await deleteInvoice(invoiceDetail.value)
    if (result.ok) {
      toast.success('删除成功')
      selectedInvoice.value = null
      invoiceDetail.value = null
      await loadInvoiceList()
    }
    else {
      toast.error(result.message || '删除失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '删除失败')
  }
  finally {
    listLoading.value = false
  }
}

// 格式化日期
function formatDate(date: any) {
  if (!date)
    return '-'
  return new Date(date).toLocaleDateString('zh-CN')
}

// 格式化重量（最多3位小数）
function formatWeight(weight: number) {
  if (weight == null)
    return '-'
  return Number(weight).toFixed(3)
}

// 获取订单显示文本（项次号补零到3位）
function getOrderDisplay(bill: any) {
  if (bill.order_item_no != null) {
    const itemNo = String(bill.order_item_no).padStart(3, '0')
    return `${bill.order_no}-${itemNo}`
  }
  return bill.order_no
}

// 判断是否为船运（有 vehicles 数据）
const isShipInvoice = computed(() => {
  if (!invoiceDetail.value?.bills) return false
  return invoiceDetail.value.bills.some((b: any) => b.vehicles && b.vehicles.length > 0)
})

// 按车号分组的明细（船运用）
const detailByWagon = computed(() => {
  if (!invoiceDetail.value?.bills) return {}
  const groups: Record<string, any[]> = {}

  for (const invBill of invoiceDetail.value.bills) {
    const billInfo = invBill.bill_id
    if (!billInfo) continue

    for (const vehicle of invBill.vehicles || []) {
      const wagonNo = vehicle.veh_name || '未知'
      if (!groups[wagonNo]) {
        groups[wagonNo] = []
      }
      const sendNum = vehicle.send_num || 0
      const unitWeight = getUnitWeight(billInfo)
      const sendWeight = vehicle.send_weight || (sendNum * unitWeight)
      groups[wagonNo].push({
        bill_no: billInfo.bill_no,
        order_no: billInfo.order_no,
        order_item_no: billInfo.order_item_no,
        thickness: billInfo.thickness,
        width: billInfo.width,
        len: billInfo.len || billInfo.length,
        weight: unitWeight,
        send_num: sendNum,
        send_weight: sendWeight,
        ship_from: vehicle.veh_ship_from,
      })
    }
  }

  return groups
})

// 获取某车的配发统计
function getDetailWagonStats(bills: any[]) {
  const totalNum = bills.reduce((sum: number, b: any) => sum + (b.send_num || 0), 0)
  const totalWeight = bills.reduce((sum: number, b: any) => sum + (b.send_weight || 0), 0)
  return { totalNum, totalWeight }
}

// 计算提单的单块重（兼容 weight 字段为空的情况）
function getUnitWeight(billInfo: any) {
  if (!billInfo) return 0
  return billInfo.weight || (billInfo.block_num > 0 ? (billInfo.total_weight || 0) / billInfo.block_num : 0)
}

// 计算车运提单的发运重量
function getSendWeight(invBill: any) {
  if (invBill.weight) return invBill.weight
  const unitWeight = getUnitWeight(invBill.bill_id)
  return (invBill.num || 0) * unitWeight
}

// 计算总重量和总块数
const totalStats = computed(() => {
  if (!invoiceDetail.value?.bills)
    return { totalNum: 0, totalWeight: 0 }

  let totalNum = 0
  let totalWeight = 0

  invoiceDetail.value.bills.forEach((invBill: any) => {
    totalNum += invBill.num || 0
    totalWeight += getSendWeight(invBill)
  })

  return { totalNum, totalWeight }
})

// 初始化
onMounted(() => {
  loadInvoiceList()
})
</script>

<template>
  <BasicPage title="删除运单" description="删除运单并恢复提单剩余量">
    <div class="space-y-4">
      <!-- 搜索区域 -->
      <div class="flex items-center gap-2 flex-wrap">
        <UiInput
          v-model="searchKeyword"
          placeholder="搜索运单号、车船号或开单名称..."
          class="max-w-[300px]"
          @keyup.enter="searchInvoices"
        />
        <UiButton :disabled="loading" @click="searchInvoices">
          <Search class="w-4 h-4 mr-1" />
          搜索
        </UiButton>
        <!-- 管理员：只看我的运单 -->
        <div v-if="isAdmin" class="flex items-center gap-2 ml-2">
          <input
            id="my-only-delete"
            v-model="showMyOnly"
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          >
          <label for="my-only-delete" class="text-sm cursor-pointer whitespace-nowrap">只看我配发的运单</label>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-10 gap-4">
        <!-- 左侧：运单列表 -->
        <div class="border rounded-lg lg:col-span-4">
          <div class="p-3 border-b bg-muted/50">
            <h3 class="font-medium">
              运单列表
            </h3>
          </div>
          <div class="overflow-auto max-h-[600px] relative">
            <div v-if="!listLoading && invoiceList.length > 0">
              <div
                v-for="invoice in invoiceList"
                :key="invoice._id"
                class="p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                :class="{ 'bg-primary/10': selectedInvoice?.waybill_no === invoice.waybill_no }"
                @click="selectInvoice(invoice, $event)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="font-medium">
                      {{ invoice.waybill_no }}
                    </div>
                    <div class="text-sm text-muted-foreground mt-1">
                      {{ invoice.vehicle_vessel_name }} | {{ invoice.ship_name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-1">
                      {{ invoice.ship_from }} → {{ invoice.ship_to }} | {{ formatDate(invoice.ship_date) }}
                    </div>
                  </div>
                  <div class="text-right">
                    <UiBadge :variant="invoice.state === '已配发' ? 'default' : 'secondary'">
                      {{ invoice.state }}
                    </UiBadge>
                    <div class="text-sm text-muted-foreground mt-1">
                      {{ formatWeight(invoice.total_weight) }} 吨
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 加载中 -->
            <div v-if="listLoading" class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div class="text-muted-foreground">
                加载中...
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="!listLoading && invoiceList.length === 0" class="p-12 text-center text-muted-foreground">
              没有找到运单
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="invoiceListTotal > 0" class="p-3 border-t flex items-center justify-between text-sm">
            <div class="text-muted-foreground">
              共 {{ invoiceListTotal }} 条，第 {{ invoiceListPage }} / {{ Math.ceil(invoiceListTotal / invoiceListLimit) }} 页
            </div>
            <div class="flex items-center gap-2">
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage <= 1 || loading"
                @click="invoiceListPage--; loadInvoiceList()"
              >
                上一页
              </UiButton>
              <UiButton
                size="sm"
                variant="outline"
                :disabled="invoiceListPage * invoiceListLimit >= invoiceListTotal || loading"
                @click="invoiceListPage++; loadInvoiceList()"
              >
                下一页
              </UiButton>
            </div>
          </div>
        </div>

        <!-- 右侧：运单详情 -->
        <div class="border rounded-lg lg:col-span-6">
          <div class="p-3 border-b bg-muted/50 flex items-center justify-between">
            <h3 class="font-medium">
              运单详情
            </h3>
            <UiButton
              variant="destructive"
              size="sm"
              :disabled="!selectedInvoice || loading || selectedInvoice?.state === '已结算'"
              @click="handleDelete"
            >
              <Trash2 class="w-4 h-4 mr-1" />
              删除运单
            </UiButton>
          </div>

          <div v-if="detailLoading" class="p-12 text-center text-muted-foreground">
            加载详情中...
          </div>
          <div v-else-if="invoiceDetail" class="p-4 overflow-auto max-h-[600px]">
            <!-- 基本信息 -->
            <div class="space-y-3 mb-4">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span class="text-muted-foreground">运单号：</span>
                  <span class="font-medium">{{ invoiceDetail.waybill_no }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">状态：</span>
                  <UiBadge :variant="invoiceDetail.state === '已配发' ? 'default' : 'secondary'">
                    {{ invoiceDetail.state }}
                  </UiBadge>
                </div>
                <div>
                  <span class="text-muted-foreground">车船号：</span>
                  <span>{{ invoiceDetail.vehicle_vessel_name }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">开单名称：</span>
                  <span>{{ invoiceDetail.ship_name }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">始发地：</span>
                  <span>{{ invoiceDetail.ship_from }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">目的地：</span>
                  <span>{{ invoiceDetail.ship_to }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">发货日期：</span>
                  <span>{{ formatDate(invoiceDetail.ship_date) }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">总重量：</span>
                  <span class="font-medium">{{ formatWeight(invoiceDetail.total_weight) }} 吨</span>
                </div>
              </div>
            </div>

            <!-- 提单明细 - 船运按车号分组 -->
            <template v-if="isShipInvoice">
              <div class="space-y-3">
                <div class="text-sm font-medium">
                  提单明细（按车号分组）
                </div>
                <div v-for="(bills, wagonNo) in detailByWagon" :key="wagonNo">
                  <div class="flex items-center justify-between text-xs text-muted-foreground mb-1 bg-muted px-2 py-1 rounded">
                    <div class="flex items-center gap-4">
                      <span>车号: <strong class="text-foreground">{{ wagonNo }}</strong></span>
                      <span>块数: <strong>{{ getDetailWagonStats(bills).totalNum }}</strong></span>
                      <span>重量: <strong>{{ getDetailWagonStats(bills).totalWeight.toFixed(3) }}</strong></span>
                      <span>起始地: <strong class="text-foreground">{{ bills[0]?.ship_from || '-' }}</strong></span>
                    </div>
                  </div>
                  <div class="border rounded overflow-auto">
                    <UiTable>
                      <UiTableHeader>
                        <UiTableRow>
                          <UiTableHead>提单号</UiTableHead>
                          <UiTableHead>订单号</UiTableHead>
                          <UiTableHead>厚度</UiTableHead>
                          <UiTableHead>宽度</UiTableHead>
                          <UiTableHead>长度</UiTableHead>
                          <UiTableHead>单重</UiTableHead>
                          <UiTableHead>发运数</UiTableHead>
                          <UiTableHead>发运重量</UiTableHead>
                        </UiTableRow>
                      </UiTableHeader>
                      <UiTableBody>
                        <UiTableRow v-for="(bill, index) in bills" :key="index">
                          <UiTableCell>{{ bill.bill_no || '-' }}</UiTableCell>
                          <UiTableCell>{{ getOrderDisplay(bill) }}</UiTableCell>
                          <UiTableCell>{{ bill.thickness || '-' }}</UiTableCell>
                          <UiTableCell>{{ bill.width || '-' }}</UiTableCell>
                          <UiTableCell>{{ bill.len || '-' }}</UiTableCell>
                          <UiTableCell>{{ bill.weight?.toFixed(4) || '-' }}</UiTableCell>
                          <UiTableCell>{{ bill.send_num }}</UiTableCell>
                          <UiTableCell>{{ formatWeight(bill.send_weight) }}</UiTableCell>
                        </UiTableRow>
                      </UiTableBody>
                    </UiTable>
                  </div>
                </div>
                <div class="p-2 bg-muted/50 rounded text-sm flex justify-end gap-4">
                  <span>总块数: <strong>{{ totalStats.totalNum }}</strong></span>
                  <span>总重量: <strong>{{ formatWeight(totalStats.totalWeight) }}</strong> 吨</span>
                </div>
              </div>
            </template>

            <!-- 提单明细 - 非船运扁平展示 -->
            <div v-else class="border rounded">
              <div class="p-2 bg-muted/50 text-sm font-medium">
                提单明细（共 {{ invoiceDetail.bills?.length || 0 }} 条）
              </div>
              <div class="overflow-auto max-h-[400px]">
                <UiTable>
                  <UiTableHeader>
                    <UiTableRow>
                      <UiTableHead>提单号</UiTableHead>
                      <UiTableHead>订单号</UiTableHead>
                      <UiTableHead>厚度</UiTableHead>
                      <UiTableHead>宽度</UiTableHead>
                      <UiTableHead>长度</UiTableHead>
                      <UiTableHead>发运数</UiTableHead>
                      <UiTableHead>发运重量</UiTableHead>
                    </UiTableRow>
                  </UiTableHeader>
                  <UiTableBody>
                    <UiTableRow v-for="(invBill, index) in invoiceDetail.bills" :key="index">
                      <UiTableCell>
                        <template v-if="invBill.bill_id">
                          {{ invBill.bill_id.bill_no || '-' }}
                        </template>
                        <template v-else>
                          <span class="text-muted-foreground">未关联</span>
                        </template>
                      </UiTableCell>
                      <UiTableCell>
                        <template v-if="invBill.bill_id">
                          {{ getOrderDisplay(invBill.bill_id) }}
                        </template>
                        <template v-else>
                          -
                        </template>
                      </UiTableCell>
                      <UiTableCell>{{ invBill.bill_id?.thickness || '-' }}</UiTableCell>
                      <UiTableCell>{{ invBill.bill_id?.width || '-' }}</UiTableCell>
                      <UiTableCell>{{ invBill.bill_id?.len || '-' }}</UiTableCell>
                      <UiTableCell>{{ invBill.num || 0 }}</UiTableCell>
                      <UiTableCell>{{ formatWeight(getSendWeight(invBill)) }}</UiTableCell>
                    </UiTableRow>
                  </UiTableBody>
                </UiTable>
              </div>
              <div class="p-2 border-t bg-muted/50 text-sm flex justify-end gap-4">
                <span>总块数: <strong>{{ totalStats.totalNum }}</strong></span>
                <span>总重量: <strong>{{ formatWeight(totalStats.totalWeight) }}</strong> 吨</span>
              </div>
            </div>
          </div>

          <div v-else class="p-12 text-center text-muted-foreground">
            请从左侧选择要查看的运单
          </div>
        </div>
      </div>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
