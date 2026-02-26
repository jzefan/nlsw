<script setup lang="ts">
import { ImagePlus, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import {
  createOrder,
  deleteOrder,
  getOrders,
  updateOrder,
  uploadPaymentQR,
  getPaymentQRUrl,
  checkPaymentQR,
} from '@/services/api/order.api'
import type { CreateOrderData, OrderItem, UpdateOrderData } from '@/services/api/order.api'
import { getTenants } from '@/services/api/platform.api'
import type { TenantItem } from '@/services/api/platform.api'

// State
const loading = ref(false)
const orders = ref<OrderItem[]>([])
const total = ref(0)
const page = ref(1)
const searchTenantId = ref('')
const searchStatus = ref('')

// Tenant list for selectors
const tenants = ref<TenantItem[]>([])

// Form dialog
const showFormDialog = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const formLoading = ref(false)
const editingOrderId = ref('')
const orderForm = ref({
  tenantId: '',
  plan: 'basic',
  amount: 0,
  startDate: '',
  endDate: '',
  status: 'pending',
  paymentMethod: '',
  paidAt: '',
  notes: '',
})

// Delete dialog
const showDeleteDialog = ref(false)
const deletingOrder = ref<OrderItem | null>(null)

// QR code
const qrExists = ref(false)
const qrUrl = ref('')
const qrTimestamp = ref(Date.now())

const totalPages = computed(() => Math.ceil(total.value / 20) || 1)

const canSubmitForm = computed(() => {
  return !!orderForm.value.tenantId
})

const statusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
}

const statusVariants: Record<string, string> = {
  pending: 'secondary',
  paid: 'default',
  cancelled: 'outline',
  refunded: 'destructive',
}

const planLabels: Record<string, string> = {
  basic: '基础版',
  enterprise: '企业版',
}

const statusOptions = [
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'cancelled', label: '已取消' },
  { value: 'refunded', label: '已退款' },
]

const planOptions = [
  { value: 'basic', label: '基础版' },
  { value: 'enterprise', label: '企业版' },
]

const paymentMethodOptions = [
  { value: '微信', label: '微信' },
  { value: '支付宝', label: '支付宝' },
  { value: '银行转账', label: '银行转账' },
  { value: '现金', label: '现金' },
  { value: '其他', label: '其他' },
]

async function loadTenants() {
  try {
    const res = await getTenants()
    if (res.ok) {
      tenants.value = res.data
    }
  } catch (e: any) {
    toast.error('获取公司列表失败', { description: e.message })
  }
}

async function loadOrders() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, limit: 20 }
    if (searchTenantId.value && searchTenantId.value.trim()) params.tenantId = searchTenantId.value
    if (searchStatus.value && searchStatus.value.trim()) params.status = searchStatus.value

    const res = await getOrders(params)
    if (res.ok) {
      orders.value = res.data
      total.value = res.total
    }
  } catch (e: any) {
    toast.error('获取订单列表失败', { description: e.message })
  } finally {
    loading.value = false
  }
}

async function loadQRStatus() {
  try {
    const res = await checkPaymentQR()
    qrExists.value = res.exists
    if (res.exists) {
      qrUrl.value = `${getPaymentQRUrl()}?t=${qrTimestamp.value}`
    }
  } catch {
    qrExists.value = false
  }
}

function openCreateDialog() {
  formMode.value = 'add'
  editingOrderId.value = ''
  orderForm.value = {
    tenantId: '',
    plan: 'basic',
    amount: 0,
    startDate: '',
    endDate: '',
    status: 'pending',
    paymentMethod: '',
    paidAt: '',
    notes: '',
  }
  showFormDialog.value = true
}

function openEditDialog(order: OrderItem) {
  formMode.value = 'edit'
  editingOrderId.value = order._id
  orderForm.value = {
    tenantId: order.tenantId,
    plan: order.plan,
    amount: order.amount,
    startDate: order.startDate ? order.startDate.slice(0, 10) : '',
    endDate: order.endDate ? order.endDate.slice(0, 10) : '',
    status: order.status,
    paymentMethod: order.paymentMethod,
    paidAt: order.paidAt ? order.paidAt.slice(0, 10) : '',
    notes: order.notes,
  }
  showFormDialog.value = true
}

async function handleFormSubmit() {
  formLoading.value = true
  try {
    if (formMode.value === 'add') {
      const data: CreateOrderData = {
        tenantId: orderForm.value.tenantId,
        plan: orderForm.value.plan,
        amount: orderForm.value.amount,
        startDate: orderForm.value.startDate || undefined,
        endDate: orderForm.value.endDate || undefined,
        status: orderForm.value.status,
        paymentMethod: orderForm.value.paymentMethod || undefined,
        paidAt: orderForm.value.paidAt || undefined,
        notes: orderForm.value.notes || undefined,
      }
      const res = await createOrder(data)
      if (res.ok) {
        toast.success('订单创建成功')
        showFormDialog.value = false
        loadOrders()
      } else {
        toast.error('创建失败', { description: res.msg })
      }
    } else {
      const data: UpdateOrderData = {
        orderId: editingOrderId.value,
        plan: orderForm.value.plan,
        amount: orderForm.value.amount,
        startDate: orderForm.value.startDate || undefined,
        endDate: orderForm.value.endDate || undefined,
        status: orderForm.value.status,
        paymentMethod: orderForm.value.paymentMethod || undefined,
        paidAt: orderForm.value.paidAt || undefined,
        notes: orderForm.value.notes || undefined,
      }
      const res = await updateOrder(data)
      if (res.ok) {
        toast.success('订单修改成功')
        showFormDialog.value = false
        loadOrders()
      } else {
        toast.error('修改失败', { description: res.msg })
      }
    }
  } catch (e: any) {
    toast.error('操作失败', { description: e.message })
  } finally {
    formLoading.value = false
  }
}

function confirmDelete(order: OrderItem) {
  deletingOrder.value = order
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!deletingOrder.value) return
  try {
    const res = await deleteOrder(deletingOrder.value._id)
    if (res.ok) {
      toast.success(`已删除订单: ${deletingOrder.value.orderNo}`)
      showDeleteDialog.value = false
      deletingOrder.value = null
      loadOrders()
    } else {
      toast.error('删除失败', { description: res.msg })
    }
  } catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

async function handleQRUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  const file = input.files[0]

  try {
    const res = await uploadPaymentQR(file)
    if (res.ok) {
      toast.success('收款二维码上传成功')
      qrTimestamp.value = Date.now()
      loadQRStatus()
    } else {
      toast.error('上传失败', { description: res.msg })
    }
  } catch (e: any) {
    toast.error('上传失败', { description: e.message })
  } finally {
    input.value = ''
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatAmount(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
}

function getTenantLabel(tenantId: string) {
  const t = tenants.value.find((t) => t._id === tenantId)
  return t ? `${t.name} [${t.code}]` : tenantId
}

onMounted(() => {
  loadTenants()
  loadOrders()
  loadQRStatus()
})
</script>

<template>
  <BasicPage title="订单管理" description="管理平台订单和收款二维码">
    <template #actions>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="loadOrders">
          <RefreshCw class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">刷新</span>
        </UiButton>
        <UiButton size="sm" @click="openCreateDialog">
          <Plus class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">新建订单</span>
        </UiButton>
      </div>
    </template>

    <!-- QR Code Section -->
    <div class="mb-6 border rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold">收款二维码</h3>
        <label class="cursor-pointer">
          <input type="file" accept="image/*" class="hidden" @change="handleQRUpload" />
          <span class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ImagePlus class="w-4 h-4" />
            {{ qrExists ? '更换图片' : '上传图片' }}
          </span>
        </label>
      </div>
      <div v-if="qrExists" class="flex justify-center">
        <img :src="qrUrl" alt="收款二维码" class="max-w-[200px] max-h-[200px] rounded border" />
      </div>
      <div v-else class="text-sm text-muted-foreground text-center py-4">尚未上传收款二维码</div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-col sm:flex-row gap-2">
      <UiSelect v-model="searchTenantId" @update:model-value="() => { page = 1; loadOrders() }">
        <UiSelectTrigger class="w-full sm:w-[200px]">
          <UiSelectValue placeholder="全部公司" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value=" ">
            全部公司
          </UiSelectItem>
          <UiSelectItem v-for="t in tenants" :key="t._id" :value="t._id">
            {{ t.name }} [{{ t.code }}]
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="searchStatus" @update:model-value="() => { page = 1; loadOrders() }">
        <UiSelectTrigger class="w-full sm:w-[200px]">
          <UiSelectValue placeholder="全部状态" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value=" ">
            全部状态
          </UiSelectItem>
          <UiSelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
    </div>

    <!-- Desktop Table -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left">订单号</th>
            <th class="p-2 text-left">公司</th>
            <th class="p-2 text-center">套餐</th>
            <th class="p-2 text-right">金额</th>
            <th class="p-2 text-center">状态</th>
            <th class="p-2 text-left">开始日期</th>
            <th class="p-2 text-left">结束日期</th>
            <th class="p-2 text-left">创建时间</th>
            <th class="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order._id" class="border-t hover:bg-muted/30">
            <td class="p-2 font-mono text-xs">
              {{ order.orderNo }}
            </td>
            <td class="p-2">
              <div>{{ order.tenantName }}</div>
              <div class="text-xs text-muted-foreground">
                {{ order.tenantCode }}
              </div>
            </td>
            <td class="p-2 text-center">
              {{ planLabels[order.plan] || order.plan }}
            </td>
            <td class="p-2 text-right">
              {{ formatAmount(order.amount) }}
            </td>
            <td class="p-2 text-center">
              <UiBadge :variant="(statusVariants[order.status] as any) || 'secondary'">
                {{ statusLabels[order.status] || order.status }}
              </UiBadge>
            </td>
            <td class="p-2 text-muted-foreground">
              {{ formatDate(order.startDate) }}
            </td>
            <td class="p-2 text-muted-foreground">
              {{ formatDate(order.endDate) }}
            </td>
            <td class="p-2 text-muted-foreground">
              {{ formatDate(order.createDate) }}
            </td>
            <td class="p-2 text-center">
              <div class="flex items-center justify-center gap-1">
                <UiButton variant="ghost" size="sm" @click="openEditDialog(order)">
                  <Pencil class="w-4 h-4" />
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  @click="confirmDelete(order)"
                >
                  <Trash2 class="w-4 h-4" />
                </UiButton>
              </div>
            </td>
          </tr>
          <tr v-if="orders.length === 0 && !loading">
            <td colspan="9" class="p-8 text-center text-muted-foreground">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Card View -->
    <div class="lg:hidden space-y-2">
      <div v-for="order in orders" :key="order._id" class="border rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-xs">{{ order.orderNo }}</span>
          <UiBadge :variant="(statusVariants[order.status] as any) || 'secondary'">
            {{ statusLabels[order.status] || order.status }}
          </UiBadge>
        </div>
        <div class="text-sm text-muted-foreground space-y-1 mb-3">
          <div class="flex justify-between">
            <span>{{ order.tenantName }} [{{ order.tenantCode }}]</span>
            <span class="font-medium text-foreground">{{ formatAmount(order.amount) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ planLabels[order.plan] || order.plan }}</span>
            <span>{{ formatDate(order.startDate) }} ~ {{ formatDate(order.endDate) }}</span>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <UiButton variant="outline" size="sm" @click="openEditDialog(order)">
            <Pencil class="w-4 h-4" />
          </UiButton>
          <UiButton variant="outline" size="sm" class="text-destructive" @click="confirmDelete(order)">
            <Trash2 class="w-4 h-4" />
          </UiButton>
        </div>
      </div>
      <div v-if="orders.length === 0 && !loading" class="py-8 text-center text-muted-foreground">暂无数据</div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-center gap-2">
      <UiButton variant="outline" size="sm" :disabled="page <= 1" @click="(page--, loadOrders())"> 上一页 </UiButton>
      <span class="text-sm text-muted-foreground">{{ page }} / {{ totalPages }}</span>
      <UiButton variant="outline" size="sm" :disabled="page >= totalPages" @click="(page++, loadOrders())">
        下一页
      </UiButton>
    </div>

    <div v-if="loading" class="py-12 text-center text-muted-foreground">加载中...</div>

    <!-- Create/Edit Dialog -->
    <UiDialog v-model:open="showFormDialog">
      <UiDialogContent class="w-[95vw] lg:w-[55vw] sm:max-w-none">
        <UiDialogHeader>
          <UiDialogTitle>{{ formMode === 'add' ? '新建订单' : '编辑订单' }}</UiDialogTitle>
        </UiDialogHeader>

        <div class="grid grid-cols-2 gap-x-6 gap-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
          <!-- Tenant (full width) -->
          <div class="col-span-2 grid gap-2">
            <label class="text-sm font-medium">公司 <span class="text-destructive">*</span></label>
            <UiSelect v-model="orderForm.tenantId" :disabled="formMode === 'edit'">
              <UiSelectTrigger>
                <UiSelectValue placeholder="请选择公司" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="t in tenants" :key="t._id" :value="t._id">
                  {{ t.name }} [{{ t.code }}]
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <!-- Plan -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">套餐</label>
            <UiSelect v-model="orderForm.plan">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="请选择套餐" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="opt in planOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <!-- Amount -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">金额</label>
            <UiInput v-model.number="orderForm.amount" type="number" min="0" step="0.01" />
          </div>

          <!-- Start Date -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">开始日期</label>
            <UiDatePicker v-model="orderForm.startDate" placeholder="选择开始日期" />
          </div>

          <!-- End Date -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">结束日期</label>
            <UiDatePicker v-model="orderForm.endDate" placeholder="选择结束日期" />
          </div>

          <!-- Status -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">状态</label>
            <UiSelect v-model="orderForm.status">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="请选择状态" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <!-- Payment Method -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">支付方式</label>
            <UiSelect v-model="orderForm.paymentMethod">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="请选择支付方式" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="opt in paymentMethodOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <!-- Paid At -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">支付时间</label>
            <UiDatePicker v-model="orderForm.paidAt" placeholder="选择支付时间" />
          </div>

          <!-- Notes (full width) -->
          <div class="col-span-2 grid gap-2">
            <label class="text-sm font-medium">备注</label>
            <textarea
              v-model="orderForm.notes"
              class="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="订单备注（选填）"
            />
          </div>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" @click="showFormDialog = false"> 取消 </UiButton>
          <UiButton :disabled="!canSubmitForm || formLoading" @click="handleFormSubmit">
            {{ formLoading ? '提交中...' : '确定' }}
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Delete Confirmation -->
    <UiAlertDialog v-model:open="showDeleteDialog">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>确认删除订单</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            确定要删除订单「{{ deletingOrder?.orderNo }}」吗？ 删除后将重新计算该公司的到期日期。此操作不可恢复。
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel @click="showDeleteDialog = false"> 取消 </UiAlertDialogCancel>
          <UiAlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDelete"
          >
            确认删除
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
  requiresPlatformUser: true
</route>
