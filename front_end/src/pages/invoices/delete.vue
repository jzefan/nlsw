<script setup lang="ts">
import { Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { deleteInvoice, getInvoiceDetail, getInvoiceList } from '@/services/api/invoice.api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// 状态
const loading = ref(false)
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
const isAdmin = computed(() => {
  return authStore.user?.privilege === 'admin' || authStore.user?.privilege === '11111111'
})

// 监听showMyOnly变化，自动刷新列表
watch(showMyOnly, async () => {
  invoiceListPage.value = 1
  await loadInvoiceList()
})

// 加载运单列表
async function loadInvoiceList() {
  loading.value = true
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
    loading.value = false
  }
}

// 搜索运单
async function searchInvoices() {
  invoiceListPage.value = 1
  await loadInvoiceList()
}

// 选择运单
async function selectInvoice(invoice: any) {
  selectedInvoice.value = invoice
  loading.value = true
  try {
    const result = await getInvoiceDetail(invoice.waybill_no)
    if (result.ok && result.data) {
      invoiceDetail.value = result.data
      console.log('Invoice detail:', result.data)
      console.log('First bill:', result.data.bills?.[0])
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
    loading.value = false
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

  loading.value = true
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
    loading.value = false
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

// 计算总重量和总块数
const totalStats = computed(() => {
  if (!invoiceDetail.value?.bills)
    return { totalNum: 0, totalWeight: 0 }

  let totalNum = 0
  let totalWeight = 0

  invoiceDetail.value.bills.forEach((invBill: any) => {
    totalNum += invBill.num || 0
    totalWeight += invBill.weight || 0
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

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- 左侧：运单列表 -->
        <div class="border rounded-lg">
          <div class="p-3 border-b bg-muted/50">
            <h3 class="font-medium">
              运单列表
            </h3>
          </div>
          <div class="overflow-auto max-h-[600px] relative">
            <div v-if="!loading && invoiceList.length > 0">
              <div
                v-for="invoice in invoiceList"
                :key="invoice._id"
                class="p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                :class="{ 'bg-primary/10': selectedInvoice?.waybill_no === invoice.waybill_no }"
                @click="selectInvoice(invoice)"
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
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div class="text-muted-foreground">
                加载中...
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="!loading && invoiceList.length === 0" class="p-12 text-center text-muted-foreground">
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
        <div class="border rounded-lg">
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

          <div v-if="invoiceDetail" class="p-4 overflow-auto max-h-[600px]">
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

            <!-- 提单明细 -->
            <div class="border rounded">
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
                      <UiTableCell>{{ formatWeight(invBill.weight) }}</UiTableCell>
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
